import type { Db } from "./db.js";
import type { ParsedEpisode, ParsedFeed } from "./rss.js";

export type ProgressStatus = "new" | "in_progress" | "completed";

export interface Podcast {
  id: number;
  feedUrl: string;
  title: string;
  description: string;
  author: string;
  imageUrl: string | null;
  language: string | null;
  websiteUrl: string | null;
  lastRefreshedAt: string | null;
  createdAt: string;
  episodeCount: number;
  completedCount: number;
  inProgressCount: number;
  lastEpisodeAt: string | null;
}

export interface Episode {
  id: number;
  podcastId: number;
  podcastTitle: string;
  podcastImageUrl: string | null;
  guid: string;
  title: string;
  description: string;
  audioUrl: string;
  imageUrl: string | null;
  publishedAt: string | null;
  durationSec: number | null;
  transcriptUrl: string | null;
  transcriptType: string | null;
  positionMs: number;
  status: ProgressStatus;
}

export interface EpisodeQuery {
  podcastId?: number;
  q?: string;
  status?: ProgressStatus;
  limit?: number;
  offset?: number;
}

export interface EpisodeList {
  episodes: Episode[];
  total: number;
  limit: number;
  offset: number;
}

interface PodcastRow {
  id: number;
  feed_url: string;
  title: string;
  description: string;
  author: string;
  image_url: string | null;
  language: string | null;
  website_url: string | null;
  last_refreshed_at: string | null;
  created_at: string;
  episode_count: number;
  completed_count: number;
  in_progress_count: number;
  last_episode_at: string | null;
}

interface EpisodeRow {
  id: number;
  podcast_id: number;
  podcast_title: string;
  podcast_image_url: string | null;
  guid: string;
  title: string;
  description: string;
  audio_url: string;
  image_url: string | null;
  published_at: string | null;
  duration_sec: number | null;
  transcript_url: string | null;
  transcript_type: string | null;
  position_ms: number;
  status: ProgressStatus;
}

export class AlreadyExistsError extends Error {
  constructor(message = "That podcast is already in your library.") {
    super(message);
    this.name = "AlreadyExistsError";
  }
}

const PODCAST_SELECT = `
  SELECT
    p.id,
    p.feed_url,
    p.title,
    p.description,
    p.author,
    p.image_url,
    p.language,
    p.website_url,
    p.last_refreshed_at,
    p.created_at,
    (SELECT COUNT(*) FROM episodes e WHERE e.podcast_id = p.id) AS episode_count,
    (SELECT COUNT(*) FROM progress pr
       JOIN episodes e ON e.id = pr.episode_id
      WHERE e.podcast_id = p.id AND pr.status = 'completed') AS completed_count,
    (SELECT COUNT(*) FROM progress pr
       JOIN episodes e ON e.id = pr.episode_id
      WHERE e.podcast_id = p.id AND pr.status = 'in_progress') AS in_progress_count,
    (SELECT MAX(COALESCE(e.published_at, e.created_at))
       FROM episodes e WHERE e.podcast_id = p.id) AS last_episode_at
  FROM podcasts p
`;

const EPISODE_SELECT = `
  SELECT
    e.id,
    e.podcast_id,
    p.title AS podcast_title,
    p.image_url AS podcast_image_url,
    e.guid,
    e.title,
    e.description,
    e.audio_url,
    COALESCE(e.image_url, p.image_url) AS image_url,
    e.published_at,
    e.duration_sec,
    e.transcript_url,
    e.transcript_type,
    COALESCE(pr.position_ms, 0) AS position_ms,
    COALESCE(pr.status, 'new') AS status
  FROM episodes e
  JOIN podcasts p ON p.id = e.podcast_id
  LEFT JOIN progress pr ON pr.episode_id = e.id
`;

function mapPodcast(row: PodcastRow): Podcast {
  return {
    id: row.id,
    feedUrl: row.feed_url,
    title: row.title,
    description: row.description,
    author: row.author,
    imageUrl: row.image_url,
    language: row.language,
    websiteUrl: row.website_url,
    lastRefreshedAt: row.last_refreshed_at,
    createdAt: row.created_at,
    episodeCount: row.episode_count,
    completedCount: row.completed_count,
    inProgressCount: row.in_progress_count,
    lastEpisodeAt: row.last_episode_at,
  };
}

function mapEpisode(row: EpisodeRow): Episode {
  return {
    id: row.id,
    podcastId: row.podcast_id,
    podcastTitle: row.podcast_title,
    podcastImageUrl: row.podcast_image_url,
    guid: row.guid,
    title: row.title,
    description: row.description,
    audioUrl: row.audio_url,
    imageUrl: row.image_url,
    publishedAt: row.published_at,
    durationSec: row.duration_sec,
    transcriptUrl: row.transcript_url,
    transcriptType: row.transcript_type,
    positionMs: row.position_ms,
    status: row.status,
  };
}

function upsertEpisodes(
  db: Db,
  podcastId: number,
  episodes: ParsedEpisode[],
  now: string,
): void {
  const statement = db.prepare(`
    INSERT INTO episodes (
      podcast_id, guid, title, description, audio_url, image_url,
      published_at, duration_sec, transcript_url, transcript_type, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (podcast_id, guid) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      audio_url = excluded.audio_url,
      image_url = excluded.image_url,
      published_at = excluded.published_at,
      duration_sec = excluded.duration_sec,
      transcript_url = excluded.transcript_url,
      transcript_type = excluded.transcript_type
  `);

  for (const episode of episodes) {
    statement.run(
      podcastId,
      episode.guid,
      episode.title,
      episode.description,
      episode.audioUrl,
      episode.imageUrl,
      episode.publishedAt,
      episode.durationSec,
      episode.transcriptUrl,
      episode.transcriptType,
      now,
    );
  }
}

export function findPodcastByFeedUrl(db: Db, feedUrl: string): Podcast | null {
  const row = db
    .prepare(`${PODCAST_SELECT} WHERE p.feed_url = ?`)
    .get(feedUrl) as PodcastRow | undefined;
  return row ? mapPodcast(row) : null;
}

export function getPodcast(db: Db, id: number): Podcast | null {
  const row = db.prepare(`${PODCAST_SELECT} WHERE p.id = ?`).get(id) as
    | PodcastRow
    | undefined;
  return row ? mapPodcast(row) : null;
}

export function listPodcasts(db: Db): Podcast[] {
  const rows = db
    .prepare(`${PODCAST_SELECT} ORDER BY p.created_at DESC, p.id DESC`)
    .all() as PodcastRow[];
  return rows.map(mapPodcast);
}

export function addPodcast(db: Db, feedUrl: string, feed: ParsedFeed): Podcast {
  if (feed.episodes.length === 0) {
    throw new Error("This feed is valid, but it has no audio episodes right now.");
  }
  if (findPodcastByFeedUrl(db, feedUrl)) {
    throw new AlreadyExistsError();
  }

  const now = new Date().toISOString();
  const add = db.transaction((): number => {
    const result = db
      .prepare(
        `INSERT INTO podcasts (
           feed_url, title, description, author, image_url, language,
           website_url, last_refreshed_at, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        feedUrl,
        feed.title,
        feed.description,
        feed.author,
        feed.imageUrl,
        feed.language,
        feed.websiteUrl,
        now,
        now,
      );
    const podcastId = Number(result.lastInsertRowid);
    upsertEpisodes(db, podcastId, feed.episodes, now);
    return podcastId;
  });

  const podcast = getPodcast(db, add());
  if (!podcast) throw new Error("The podcast could not be saved.");
  return podcast;
}

export function refreshPodcast(
  db: Db,
  id: number,
  feed: ParsedFeed,
): Podcast | null {
  if (!getPodcast(db, id)) return null;
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(
      `UPDATE podcasts SET
         title = ?, description = ?, author = ?, image_url = ?, language = ?,
         website_url = ?, last_refreshed_at = ?
       WHERE id = ?`,
    ).run(
      feed.title,
      feed.description,
      feed.author,
      feed.imageUrl,
      feed.language,
      feed.websiteUrl,
      now,
      id,
    );
    upsertEpisodes(db, id, feed.episodes, now);
  })();

  return getPodcast(db, id);
}

export function deletePodcast(db: Db, id: number): boolean {
  const result = db.prepare("DELETE FROM podcasts WHERE id = ?").run(id);
  return result.changes > 0;
}

function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

export function listEpisodes(db: Db, query: EpisodeQuery = {}): EpisodeList {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const offset = Math.max(query.offset ?? 0, 0);
  const where: string[] = [];
  const params: unknown[] = [];

  if (query.podcastId !== undefined) {
    where.push("e.podcast_id = ?");
    params.push(query.podcastId);
  }
  if (query.q?.trim()) {
    where.push("(e.title LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\')");
    const pattern = likePattern(query.q.trim());
    params.push(pattern, pattern);
  }
  if (query.status) {
    where.push("COALESCE(pr.status, 'new') = ?");
    params.push(query.status);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM episodes e
         JOIN podcasts p ON p.id = e.podcast_id
         LEFT JOIN progress pr ON pr.episode_id = e.id
         ${whereSql}`,
    )
    .get(...params) as { count: number };

  const rows = db
    .prepare(
      `${EPISODE_SELECT}
       ${whereSql}
       ORDER BY COALESCE(e.published_at, e.created_at) DESC, e.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as EpisodeRow[];

  return { episodes: rows.map(mapEpisode), total: totalRow.count, limit, offset };
}

export function listContinueListening(db: Db, limit = 4): Episode[] {
  const safeLimit = Math.min(Math.max(limit, 1), 20);
  const rows = db
    .prepare(
      `SELECT
         e.id,
         e.podcast_id,
         p.title AS podcast_title,
         p.image_url AS podcast_image_url,
         e.guid,
         e.title,
         e.description,
         e.audio_url,
         COALESCE(e.image_url, p.image_url) AS image_url,
         e.published_at,
         e.duration_sec,
         e.transcript_url,
         e.transcript_type,
         pr.position_ms,
         pr.status
       FROM progress pr
       JOIN episodes e ON e.id = pr.episode_id
       JOIN podcasts p ON p.id = e.podcast_id
       WHERE pr.status = 'in_progress' AND pr.position_ms > 0
       ORDER BY pr.updated_at DESC
       LIMIT ?`,
    )
    .all(safeLimit) as EpisodeRow[];
  return rows.map(mapEpisode);
}

export function getEpisode(db: Db, id: number): Episode | null {
  const row = db
    .prepare(`${EPISODE_SELECT} WHERE e.id = ?`)
    .get(id) as EpisodeRow | undefined;
  return row ? mapEpisode(row) : null;
}

export function saveProgress(
  db: Db,
  episodeId: number,
  positionMs: number,
  status?: ProgressStatus,
): { positionMs: number; status: ProgressStatus; updatedAt: string } | null {
  const exists = db.prepare("SELECT id FROM episodes WHERE id = ?").get(episodeId);
  if (!exists) return null;

  const safePosition = Math.max(0, Math.round(positionMs));
  const nextStatus: ProgressStatus =
    status ?? (safePosition > 0 ? "in_progress" : "new");
  const updatedAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO progress (episode_id, position_ms, status, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (episode_id) DO UPDATE SET
       position_ms = excluded.position_ms,
       status = excluded.status,
       updated_at = excluded.updated_at`,
  ).run(episodeId, safePosition, nextStatus, updatedAt);

  return { positionMs: safePosition, status: nextStatus, updatedAt };
}

export function getStats(db: Db): {
  podcasts: number;
  episodes: number;
  completed: number;
  inProgress: number;
} {
  const podcasts = db.prepare("SELECT COUNT(*) AS count FROM podcasts").get() as {
    count: number;
  };
  const episodes = db.prepare("SELECT COUNT(*) AS count FROM episodes").get() as {
    count: number;
  };
  const progress = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress
       FROM progress`,
    )
    .get() as { completed: number | null; in_progress: number | null };
  return {
    podcasts: podcasts.count,
    episodes: episodes.count,
    completed: progress.completed ?? 0,
    inProgress: progress.in_progress ?? 0,
  };
}
