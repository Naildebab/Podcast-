import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./config.js";
import type { Db } from "./db.js";

export const MAX_RECORDING_BYTES = 25 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/aac": "aac",
};

export interface ShadowingRecording {
  id: number;
  episodeId: number;
  cueIndex: number | null;
  startMs: number | null;
  endMs: number | null;
  durationMs: number;
  mimeType: string;
  sizeBytes: number;
  label: string;
  createdAt: string;
  audioUrl: string;
}

interface RecordingRow {
  id: number;
  episode_id: number;
  cue_index: number | null;
  start_ms: number | null;
  end_ms: number | null;
  duration_ms: number;
  mime_type: string;
  size_bytes: number;
  label: string;
  file_name: string;
  created_at: string;
}

export class RecordingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordingInputError";
  }
}

export function defaultRecordingsDir(): string {
  return path.join(dataDir(), "recordings");
}

/** Strip codec parameters and return a canonical MIME type the app accepts. */
export function normalizeRecordingMime(contentType: string): string | null {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_EXTENSIONS[type] ? type : null;
}

export function recordingStorageDir(customDir?: string): string {
  const dir = customDir ?? defaultRecordingsDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function mapRow(row: RecordingRow): ShadowingRecording {
  return {
    id: row.id,
    episodeId: row.episode_id,
    cueIndex: row.cue_index,
    startMs: row.start_ms,
    endMs: row.end_ms,
    durationMs: row.duration_ms,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    label: row.label,
    createdAt: row.created_at,
    audioUrl: `/api/recordings/${row.id}/audio`,
  };
}

function getRow(db: Db, id: number): RecordingRow | undefined {
  return db
    .prepare(
      `SELECT id, episode_id, cue_index, start_ms, end_ms, duration_ms,
              mime_type, size_bytes, label, file_name, created_at
         FROM shadowing_recordings
        WHERE id = ?`,
    )
    .get(id) as RecordingRow | undefined;
}

export function listRecordings(
  db: Db,
  episodeId: number,
  cueIndex?: number,
): ShadowingRecording[] {
  const rows =
    cueIndex === undefined
      ? (db
          .prepare(
            `SELECT id, episode_id, cue_index, start_ms, end_ms, duration_ms,
                    mime_type, size_bytes, label, file_name, created_at
               FROM shadowing_recordings
              WHERE episode_id = ?
              ORDER BY created_at DESC, id DESC`,
          )
          .all(episodeId) as RecordingRow[])
      : (db
          .prepare(
            `SELECT id, episode_id, cue_index, start_ms, end_ms, duration_ms,
                    mime_type, size_bytes, label, file_name, created_at
               FROM shadowing_recordings
              WHERE episode_id = ? AND cue_index = ?
              ORDER BY created_at DESC, id DESC`,
          )
          .all(episodeId, cueIndex) as RecordingRow[]);
  return rows.map(mapRow);
}

export function saveRecording(
  db: Db,
  input: {
    episodeId: number;
    cueIndex?: number | null;
    startMs?: number | null;
    endMs?: number | null;
    durationMs?: number | null;
    label?: string | null;
    mimeType: string;
    data: Buffer;
  },
  customDir?: string,
): ShadowingRecording {
  const mimeType = normalizeRecordingMime(input.mimeType);
  if (!mimeType) throw new RecordingInputError("That audio format is not supported.");
  if (!Buffer.isBuffer(input.data) || input.data.length === 0) {
    throw new RecordingInputError("The recording was empty.");
  }
  if (input.data.length > MAX_RECORDING_BYTES) {
    throw new RecordingInputError("That recording is larger than 25 MB.");
  }

  const dir = recordingStorageDir(customDir);
  const extension = MIME_EXTENSIONS[mimeType]!;
  const fileName = `${crypto.randomUUID()}.${extension}`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, input.data, { mode: 0o600 });

  try {
    const createdAt = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO shadowing_recordings
           (episode_id, cue_index, start_ms, end_ms, duration_ms, mime_type,
            size_bytes, label, file_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.episodeId,
        input.cueIndex ?? null,
        input.startMs ?? null,
        input.endMs ?? null,
        Math.max(0, Math.round(input.durationMs ?? 0)),
        mimeType,
        input.data.length,
        input.label?.trim() || "Take",
        fileName,
        createdAt,
      );
    const row = getRow(db, Number(result.lastInsertRowid));
    if (!row) throw new Error("The recording was saved but could not be read back.");
    return mapRow(row);
  } catch (error) {
    fs.rmSync(filePath, { force: true });
    throw error;
  }
}

export function getRecordingAudio(
  db: Db,
  id: number,
  customDir?: string,
): { recording: ShadowingRecording; filePath: string } | null {
  const row = getRow(db, id);
  if (!row) return null;
  return {
    recording: mapRow(row),
    filePath: path.join(recordingStorageDir(customDir), path.basename(row.file_name)),
  };
}

export function deleteRecording(db: Db, id: number, customDir?: string): boolean {
  const row = getRow(db, id);
  if (!row) return false;
  db.prepare("DELETE FROM shadowing_recordings WHERE id = ?").run(id);
  try {
    fs.rmSync(path.join(recordingStorageDir(customDir), path.basename(row.file_name)), {
      force: true,
    });
  } catch {
    // The metadata is gone; a leftover file must not fail the delete request.
  }
  return true;
}

/**
 * Remove audio files before a podcast cascade deletes their rows. The explicit
 * row delete also keeps the database tidy if the caller stops after this call.
 */
export function purgePodcastRecordings(
  db: Db,
  podcastId: number,
  customDir?: string,
): number {
  const rows = db
    .prepare(
      `SELECT r.id, r.file_name
         FROM shadowing_recordings r
         JOIN episodes e ON e.id = r.episode_id
        WHERE e.podcast_id = ?`,
    )
    .all(podcastId) as Array<{ id: number; file_name: string }>;

  if (rows.length === 0) return 0;

  db.prepare(
    `DELETE FROM shadowing_recordings
      WHERE episode_id IN (SELECT id FROM episodes WHERE podcast_id = ?)`,
  ).run(podcastId);

  const dir = recordingStorageDir(customDir);
  for (const row of rows) {
    try {
      fs.rmSync(path.join(dir, path.basename(row.file_name)), { force: true });
    } catch {
      // Continue: one unreadable file should not block podcast deletion.
    }
  }
  return rows.length;
}
