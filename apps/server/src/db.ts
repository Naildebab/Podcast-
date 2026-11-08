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
