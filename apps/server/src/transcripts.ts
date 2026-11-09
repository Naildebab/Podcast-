import type { Db } from "./db.js";
import type { ParsedTranscript, TranscriptCue, TranscriptFormat } from "./transcript.js";

export type TranscriptOrigin = "feed" | "manual";

export interface StoredTranscriptCue extends TranscriptCue {
  index: number;
}

export interface StoredTranscript {
  episodeId: number;
  sourceUrl: string | null;
  format: TranscriptFormat;
  origin: TranscriptOrigin;
  language: string | null;
  timed: boolean;
  cueCount: number;
  importedAt: string;
  cues: StoredTranscriptCue[];
}

interface TranscriptRow {
  episode_id: number;
  source_url: string | null;
  format: string;
  origin: string;
  language: string | null;
  timed: number;
  cue_count: number;
  imported_at: string;
}

interface CueRow {
  cue_index: number;
  start_ms: number | null;
  end_ms: number | null;
  speaker: string | null;
  text: string;
}

export function getTranscript(db: Db, episodeId: number): StoredTranscript | null {
  const row = db
    .prepare(
      `SELECT episode_id, source_url, format, origin, language, timed, cue_count, imported_at
       FROM transcripts
       WHERE episode_id = ?`,
    )
    .get(episodeId) as TranscriptRow | undefined;

  if (!row) return null;

  const cues = db
    .prepare(
      `SELECT cue_index, start_ms, end_ms, speaker, text
       FROM transcript_cues
       WHERE episode_id = ?
       ORDER BY cue_index ASC`,
    )
    .all(episodeId) as CueRow[];

  return {
    episodeId: row.episode_id,
    sourceUrl: row.source_url,
    format: row.format as TranscriptFormat,
    origin: row.origin === "feed" ? "feed" : "manual",
    language: row.language,
    timed: row.timed === 1,
    cueCount: row.cue_count,
    importedAt: row.imported_at,
    cues: cues.map((cue) => ({
      index: cue.cue_index,
      startMs: cue.start_ms,
      endMs: cue.end_ms,
      speaker: cue.speaker,
      text: cue.text,
    })),
  };
}

export function saveTranscript(
  db: Db,
  episodeId: number,
  parsed: ParsedTranscript,
  options: { sourceUrl: string | null; origin: TranscriptOrigin },
): StoredTranscript {
  if (parsed.cues.length === 0) {
    throw new Error("A transcript must contain at least one cue.");
  }

  const importedAt = new Date().toISOString();
  const origin = options.origin;
  const sourceUrl = options.sourceUrl;

  db.transaction(() => {
    db.prepare("DELETE FROM transcript_cues WHERE episode_id = ?").run(episodeId);
    db.prepare(
      `INSERT INTO transcripts
         (episode_id, source_url, format, origin, language, timed, cue_count, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (episode_id) DO UPDATE SET
         source_url = excluded.source_url,
         format = excluded.format,
         origin = excluded.origin,
         language = excluded.language,
         timed = excluded.timed,
         cue_count = excluded.cue_count,
         imported_at = excluded.imported_at`,
    ).run(
      episodeId,
      sourceUrl,
      parsed.format,
      origin,
      parsed.language,
      parsed.timed ? 1 : 0,
      parsed.cues.length,
      importedAt,
    );

    const insertCue = db.prepare(
      `INSERT INTO transcript_cues
         (episode_id, cue_index, start_ms, end_ms, speaker, text)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    parsed.cues.forEach((cue, index) => {
      insertCue.run(episodeId, index, cue.startMs, cue.endMs, cue.speaker, cue.text);
    });
  })();

  const saved = getTranscript(db, episodeId);
  if (!saved) {
    throw new Error("The transcript was saved but could not be read back.");
  }
  return saved;
}

export function deleteTranscript(db: Db, episodeId: number): boolean {
  const result = db.transaction(() => {
    db.prepare("DELETE FROM transcript_cues WHERE episode_id = ?").run(episodeId);
    return db.prepare("DELETE FROM transcripts WHERE episode_id = ?").run(episodeId);
  })();
  return result.changes > 0;
}
