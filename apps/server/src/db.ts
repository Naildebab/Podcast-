import Database from "better-sqlite3";
import path from "node:path";
import { dataDir } from "./config.js";

export type Db = Database.Database;

/**
 * Migrations are append-only. `PRAGMA user_version` records how many have
 * run, so a new feature adds one entry at the end and never edits history.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE podcasts (
    id INTEGER PRIMARY KEY,
    feed_url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    image_url TEXT,
    language TEXT,
    website_url TEXT,
    last_refreshed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE episodes (
    id INTEGER PRIMARY KEY,
    podcast_id INTEGER NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
    guid TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    audio_url TEXT NOT NULL,
    image_url TEXT,
    published_at TEXT,
    duration_sec INTEGER,
    transcript_url TEXT,
    transcript_type TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (podcast_id, guid)
  );
  CREATE INDEX idx_episodes_podcast_published
    ON episodes(podcast_id, published_at DESC);
  CREATE INDEX idx_episodes_published
    ON episodes(published_at DESC);

  CREATE TABLE progress (
    episode_id INTEGER PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
    position_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new'
      CHECK (status IN ('new', 'in_progress', 'completed')),
    updated_at TEXT NOT NULL
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE transcripts (
    episode_id INTEGER PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
    source_url TEXT,
    format TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (origin IN ('feed', 'manual')),
    language TEXT,
    timed INTEGER NOT NULL DEFAULT 0,
    cue_count INTEGER NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL
  );

  CREATE TABLE transcript_cues (
    id INTEGER PRIMARY KEY,
    episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    cue_index INTEGER NOT NULL,
    start_ms INTEGER,
    end_ms INTEGER,
    speaker TEXT,
    text TEXT NOT NULL,
    UNIQUE (episode_id, cue_index)
  );

  CREATE INDEX idx_transcript_cues_episode_start
    ON transcript_cues(episode_id, start_ms);
  `,
  `
  CREATE TABLE transcripts_v3 (
    episode_id INTEGER PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
    source_url TEXT,
    format TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (origin IN ('feed', 'manual', 'whisper')),
    language TEXT,
    timed INTEGER NOT NULL DEFAULT 0,
    cue_count INTEGER NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL
  );

  INSERT INTO transcripts_v3
    (episode_id, source_url, format, origin, language, timed, cue_count, imported_at)
  SELECT
    episode_id, source_url, format, origin, language, timed, cue_count, imported_at
  FROM transcripts;

  DROP TABLE transcripts;
  ALTER TABLE transcripts_v3 RENAME TO transcripts;
  `,
  `
  CREATE TABLE vocabulary (
    id INTEGER PRIMARY KEY,
    word TEXT NOT NULL,
    normalized_word TEXT NOT NULL,
    lemma TEXT,
    pos TEXT,
    ipa TEXT,
    definitions TEXT NOT NULL DEFAULT '[]',
    arabic TEXT NOT NULL DEFAULT '[]',
    context TEXT,
    episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
    cue_index INTEGER,
    start_ms INTEGER,
    status TEXT NOT NULL DEFAULT 'learning'
      CHECK (status IN ('new', 'learning', 'known')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX idx_vocabulary_source
    ON vocabulary(normalized_word, episode_id, cue_index);
  CREATE INDEX idx_vocabulary_updated
    ON vocabulary(updated_at DESC);
  `,
  `
  CREATE TABLE shadowing_recordings (
    id INTEGER PRIMARY KEY,
    episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    cue_index INTEGER,
    start_ms INTEGER,
    end_ms INTEGER,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    label TEXT NOT NULL DEFAULT 'Take',
    file_name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE INDEX idx_shadowing_recordings_cue
    ON shadowing_recordings(episode_id, cue_index, created_at DESC);
  `,
];

export function migrate(db: Db): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

export function openDb(file?: string): Db {
  const db = new Database(file ?? path.join(dataDir(), "app.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}
