import os from "node:os";
import path from "node:path";
import fs from "node:fs";

/**
 * Runtime data lives outside the repository and outside the old project's
 * data folder. This keeps the new studio and the earlier prototype separate.
 */
export function dataDir(): string {
  const dir =
    process.env.PODCAST_STUDIO_DATA ??
    path.join(os.homedir(), ".local", "share", "podcast-plus");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const PORT = Number(process.env.PORT ?? 3010);
export const HOST = process.env.HOST ?? "127.0.0.1";

function envPath(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function positiveInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * These resources are not copied into this app. They are read or executed
 * directly from the locations below, and each path can be overridden without
 * changing the source code.
 */
export function dictionaryDbPath(): string {
  return envPath(
    "PODCAST_DICTIONARY_DB",
    path.join(os.homedir(), ".local", "share", "podcast-language-studio", "dictionary.db"),
  );
}

export function whisperBinPath(): string {
  return envPath(
    "PODCAST_WHISPER_BIN",
    path.join(os.homedir(), "whisper-env", "bin", "whisper"),
  );
}

export function whisperModelName(): string {
  return (process.env.PODCAST_WHISPER_MODEL?.trim() || "base.en").replace(/\.pt$/i, "");
}

export function whisperModelDir(): string {
  return envPath("PODCAST_WHISPER_MODEL_DIR", path.join(os.homedir(), ".cache", "whisper"));
}

export function whisperDevice(): string {
  return process.env.PODCAST_WHISPER_DEVICE?.trim() || "cpu";
}

export function whisperLanguage(): string {
  return process.env.PODCAST_WHISPER_LANGUAGE?.trim() || "en";
}

export function whisperThreads(): number {
  return positiveInt("PODCAST_WHISPER_THREADS", 4);
}

/** Safety cap for the temporary audio download. Defaults to 250 MB. */
export function whisperMaxAudioBytes(): number {
  return positiveInt("PODCAST_WHISPER_MAX_AUDIO_BYTES", 250 * 1024 * 1024);
}

/** How long the audio download may take. Defaults to five minutes. */
export function whisperDownloadTimeoutMs(): number {
  return positiveInt("PODCAST_WHISPER_DOWNLOAD_TIMEOUT_MS", 5 * 60 * 1000);
}

/** How long the local Whisper process may run. Defaults to one hour. */
export function whisperProcessTimeoutMs(): number {
  return positiveInt("PODCAST_WHISPER_TIMEOUT_MS", 60 * 60 * 1000);
}
