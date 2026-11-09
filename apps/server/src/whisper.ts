import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  whisperBinPath,
  whisperDevice,
  whisperDownloadTimeoutMs,
  whisperLanguage,
  whisperMaxAudioBytes,
  whisperModelDir,
  whisperModelName,
  whisperProcessTimeoutMs,
  whisperThreads,
} from "./config.js";
import type { Db } from "./db.js";
import { downloadToFile } from "./http.js";
import type { Episode } from "./library.js";
import { parseTranscript } from "./transcript.js";
import { saveTranscript } from "./transcripts.js";

export type TranscriptionState =
  | "queued"
  | "downloading"
  | "transcribing"
  | "saving"
  | "completed"
  | "failed"
  | "cancelled";

export interface TranscriptionJob {
  id: string;
  episodeId: number;
  state: TranscriptionState;
  model: string;
  language: string;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  error: string | null;
  audioBytes: number | null;
  cueCount: number | null;
}

export interface WhisperStatus {
  available: boolean;
  engine: string;
  binary: string;
  binaryFound: boolean;
  model: string;
  modelPath: string;
  modelCached: boolean;
  device: string;
  language: string;
  reason: string | null;
}

export class WhisperUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhisperUnavailableError";
  }
}

export class WhisperRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhisperRequestError";
  }
}

interface Run {
  job: TranscriptionJob;
  cancelled: boolean;
  controller: AbortController;
  child?: ChildProcess;
  tempDir?: string;
}

const ACTIVE_STATES = new Set<TranscriptionState>([
  "queued",
  "downloading",
  "transcribing",
  "saving",
]);

const jobs = new Map<number, TranscriptionJob>();
const runs = new Map<number, Run>();

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".m4a",
  ".aac",
  ".wav",
  ".flac",
  ".ogg",
  ".oga",
  ".opus",
  ".webm",
  ".mp4",
]);

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "The operation failed.";
}

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * Accept either an absolute/relative path or a command name found on PATH.
 * The environment variable is still the source of truth.
 */
function resolveCommand(command: string): string | null {
  if (command.includes("/") || command.includes("\\")) {
    return isExecutable(command) ? command : null;
  }

  const extensions =
    process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    for (const extension of extensions) {
      const candidate = path.join(dir, `${command}${extension}`);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

export function whisperStatus(): WhisperStatus {
  const binary = resolveCommand(whisperBinPath());
  const model = whisperModelName();
  const modelPath = path.join(whisperModelDir(), `${model}.pt`);
  const modelCached = fs.existsSync(modelPath);
  const binaryFound = binary !== null;

  let reason: string | null = null;
  if (!binaryFound) {
    reason = `Whisper was not found at ${whisperBinPath()}. Set PODCAST_WHISPER_BIN to the local executable.`;
  } else if (!modelCached) {
    reason = `The Whisper model ${model}.pt is not cached at ${modelPath}. Add it once or set PODCAST_WHISPER_MODEL_DIR.`;
  }

  return {
    available: binaryFound && modelCached,
    engine: "OpenAI Whisper",
    binary: binary ?? whisperBinPath(),
    binaryFound,
    model,
    modelPath,
    modelCached,
    device: whisperDevice(),
    language: whisperLanguage(),
    reason,
  };
}

function publicJob(job: TranscriptionJob): TranscriptionJob {
  return { ...job };
}

export function getTranscriptionJob(episodeId: number): TranscriptionJob | null {
  const job = jobs.get(episodeId);
  return job ? publicJob(job) : null;
}

export function transcriptionIsActive(episodeId: number): boolean {
  const job = jobs.get(episodeId);
  return job ? ACTIVE_STATES.has(job.state) : false;
}

export function startTranscription(
  db: Db,
  episode: Episode,
  options: { language?: string } = {},
): TranscriptionJob {
  const existing = runs.get(episode.id);
  if (existing) return publicJob(existing.job);

  const status = whisperStatus();
  if (!status.available) {
    throw new WhisperUnavailableError(status.reason ?? "Local Whisper is not available.");
  }

  const language = (options.language?.trim() || whisperLanguage()).toLowerCase();
  if (status.model.endsWith(".en") && language !== "en") {
    throw new WhisperRequestError(
      `The cached ${status.model} model is English-only. Set PODCAST_WHISPER_MODEL to a multilingual model for ${language}.`,
    );
  }

  const now = new Date().toISOString();
  const job: TranscriptionJob = {
    id: randomUUID(),
    episodeId: episode.id,
    state: "queued",
    model: status.model,
    language,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    error: null,
    audioBytes: null,
    cueCount: null,
  };
  const run: Run = {
    job,
    cancelled: false,
    controller: new AbortController(),
  };

  jobs.set(episode.id, job);
  runs.set(episode.id, run);
  void execute(db, episode, run);
  return publicJob(job);
}

export function cancelTranscription(episodeId: number): TranscriptionJob | null {
  const run = runs.get(episodeId);
  if (!run || !ACTIVE_STATES.has(run.job.state)) return null;

  run.cancelled = true;
  run.controller.abort();
  if (run.child && !run.child.killed) run.child.kill("SIGTERM");
  updateJob(run, {
    state: "cancelled",
    finishedAt: new Date().toISOString(),
    error: null,
  });
  return publicJob(run.job);
}

export function shutdownTranscriptions(): void {
  for (const run of runs.values()) {
    if (!ACTIVE_STATES.has(run.job.state)) continue;
    run.cancelled = true;
    run.controller.abort();
    if (run.child && !run.child.killed) run.child.kill("SIGTERM");
    if (run.tempDir) void fsp.rm(run.tempDir, { recursive: true, force: true });
  }
}

function updateJob(run: Run, patch: Partial<TranscriptionJob>): void {
  Object.assign(run.job, patch, { updatedAt: new Date().toISOString() });
}

function audioExtension(audioUrl: string): string {
  try {
    const extension = path.extname(new URL(audioUrl).pathname).toLowerCase();
    return AUDIO_EXTENSIONS.has(extension) ? extension : ".audio";
  } catch {
    return ".audio";
  }
}

async function execute(db: Db, episode: Episode, run: Run): Promise<void> {
  try {
    updateJob(run, { state: "downloading" });
    run.tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "podcast-plus-whisper-"));
    const audioPath = path.join(run.tempDir, `audio${audioExtension(episode.audioUrl)}`);

    const downloaded = await downloadToFile(episode.audioUrl, audioPath, {
      maxBytes: whisperMaxAudioBytes(),
      timeoutMs: whisperDownloadTimeoutMs(),
      signal: run.controller.signal,
      accept: "audio/*, video/mp4, application/octet-stream, */*",
    });
    if (run.cancelled) throw new Error("The local transcription was cancelled.");
    if (downloaded.bytes === 0) throw new Error("The episode audio download was empty.");
    updateJob(run, { audioBytes: downloaded.bytes });

    updateJob(run, { state: "transcribing" });
    await runWhisper(run, audioPath);
    if (run.cancelled) throw new Error("The local transcription was cancelled.");

    updateJob(run, { state: "saving" });
    const vttPath = path.join(run.tempDir, `${path.basename(audioPath, path.extname(audioPath))}.vtt`);
    const vtt = await fsp.readFile(vttPath, "utf8");
    const parsed = parseTranscript(vtt, { format: "vtt", language: run.job.language });
    const transcript = saveTranscript(db, episode.id, parsed, {
      sourceUrl: null,
      origin: "whisper",
    });

    updateJob(run, {
      state: "completed",
      cueCount: transcript.cueCount,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (run.cancelled) {
      updateJob(run, {
        state: "cancelled",
        finishedAt: run.job.finishedAt ?? new Date().toISOString(),
      });
    } else {
      updateJob(run, {
        state: "failed",
        finishedAt: new Date().toISOString(),
        error: messageOf(error),
      });
    }
  } finally {
    run.child = undefined;
    runs.delete(episode.id);
    if (run.tempDir) await fsp.rm(run.tempDir, { recursive: true, force: true });
  }
}

async function runWhisper(run: Run, audioPath: string): Promise<void> {
  const status = whisperStatus();
  if (!status.available) {
    throw new WhisperUnavailableError(status.reason ?? "Local Whisper is not available.");
  }

  const outputDir = run.tempDir;
  if (!outputDir) throw new Error("The temporary transcription folder is missing.");

  const args = [
    audioPath,
    "--model",
    status.model,
    "--model_dir",
    whisperModelDir(),
    "--device",
    status.device,
    "--task",
    "transcribe",
    "--output_format",
    "vtt",
    "--output_dir",
    outputDir,
    "--verbose",
    "False",
    "--fp16",
    status.device.toLowerCase() === "cpu" ? "False" : "True",
    "--threads",
    String(whisperThreads()),
  ];
  if (run.job.language) args.push("--language", run.job.language);

  await new Promise<void>((resolve, reject) => {
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const child = spawn(status.binary, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    run.child = child;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, whisperProcessTimeoutMs());

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-8_000);
    });

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };

    child.on("error", (error) => finish(error));
    child.on("exit", (code, signal) => {
      if (run.cancelled) {
        finish(new Error("The local transcription was cancelled."));
        return;
      }
      if (timedOut) {
        finish(new Error("Local Whisper took too long and was stopped."));
        return;
      }
      if (code === 0) {
        finish();
        return;
      }
      const detail = stderr.trim().split(/\r?\n/).filter(Boolean).slice(-3).join(" ");
      finish(
        new Error(
          `Whisper could not transcribe this audio (exit ${code ?? signal ?? "unknown"})${detail ? `: ${detail}` : "."}`,
        ),
      );
    });
  });
}
