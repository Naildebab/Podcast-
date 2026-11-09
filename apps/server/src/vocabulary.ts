import { dictionaryDbPath } from "./config.js";
import type { Db } from "./db.js";
import { lookupDictionary, normalizeDictionaryWord } from "./dictionary.js";

export type VocabularyStatus = "new" | "learning" | "known";

export interface VocabularyItem {
  id: number;
  word: string;
  normalizedWord: string;
  lemma: string | null;
  pos: string | null;
  ipa: string | null;
  definitions: string[];
  arabic: string[];
  context: string | null;
  episodeId: number | null;
  episodeTitle: string | null;
  podcastTitle: string | null;
  cueIndex: number | null;
  startMs: number | null;
  status: VocabularyStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface VocabularyQuery {
  q?: string;
  status?: VocabularyStatus;
  episodeId?: number;
  limit?: number;
  offset?: number;
}

export interface VocabularyList {
  words: VocabularyItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface SaveVocabularyInput {
  word: string;
  entryId?: number;
  episodeId?: number;
  cueIndex?: number;
  startMs?: number;
  context?: string;
}

export interface UpdateVocabularyInput {
  status?: VocabularyStatus;
  notes?: string;
}

export class VocabularyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VocabularyInputError";
  }
}

interface VocabularyRow {
  id: number;
  word: string;
  normalized_word: string;
  lemma: string | null;
  pos: string | null;
  ipa: string | null;
  definitions: string;
  arabic: string;
  context: string | null;
  episode_id: number | null;
  episode_title: string | null;
  podcast_title: string | null;
  cue_index: number | null;
  start_ms: number | null;
  status: VocabularyStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

const VOCABULARY_SELECT = `
  SELECT
    v.id,
    v.word,
    v.normalized_word,
    v.lemma,
    v.pos,
    v.ipa,
    v.definitions,
    v.arabic,
    v.context,
    v.episode_id,
    e.title AS episode_title,
    p.title AS podcast_title,
    v.cue_index,
    v.start_ms,
    v.status,
    v.notes,
    v.created_at,
    v.updated_at
  FROM vocabulary v
  LEFT JOIN episodes e ON e.id = v.episode_id
  LEFT JOIN podcasts p ON p.id = e.podcast_id
`;

function jsonArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function mapRow(row: VocabularyRow): VocabularyItem {
  return {
    id: row.id,
    word: row.word,
    normalizedWord: row.normalized_word,
    lemma: row.lemma,
    pos: row.pos,
    ipa: row.ipa,
    definitions: jsonArray(row.definitions),
    arabic: jsonArray(row.arabic),
    context: row.context,
    episodeId: row.episode_id,
    episodeTitle: row.episode_title,
    podcastTitle: row.podcast_title,
    cueIndex: row.cue_index,
    startMs: row.start_ms,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

export function getVocabulary(db: Db, id: number): VocabularyItem | null {
  const row = db
    .prepare(`${VOCABULARY_SELECT} WHERE v.id = ?`)
    .get(id) as VocabularyRow | undefined;
  return row ? mapRow(row) : null;
}

function findExisting(
  db: Db,
  normalizedWord: string,
  episodeId: number | null,
  cueIndex: number | null,
): number | null {
  const row = db
    .prepare(
      `SELECT id FROM vocabulary
       WHERE normalized_word = ? AND episode_id IS ? AND cue_index IS ?`,
    )
    .get(normalizedWord, episodeId, cueIndex) as { id: number } | undefined;
  return row?.id ?? null;
}

export function saveVocabulary(
  db: Db,
  input: SaveVocabularyInput,
  dictionaryPath = dictionaryDbPath(),
): { word: VocabularyItem; created: boolean } {
  const word = input.word.trim();
  const normalized = normalizeDictionaryWord(word);
  if (!normalized) {
    throw new VocabularyInputError("Choose a word to save.");
  }
  if (normalized.length > 100) {
    throw new VocabularyInputError("That word is too long to save.");
  }

  const lookup = lookupDictionary(word, dictionaryPath);
  const entry =
    input.entryId !== undefined
      ? lookup.entries.find((candidate) => candidate.id === input.entryId)
      : lookup.entries[0];

  if (input.entryId !== undefined && !entry) {
    throw new VocabularyInputError(
      "That dictionary entry is no longer available. Search again and choose a result.",
    );
  }

  const now = new Date().toISOString();
  const episodeId = input.episodeId ?? null;
  const cueIndex = input.cueIndex ?? null;
  const startMs = input.startMs ?? null;
  const context = input.context?.trim() || null;
  const definitions = JSON.stringify((entry?.definitions ?? []).slice(0, 12));
  const arabic = JSON.stringify((entry?.arabic ?? []).slice(0, 12));

  const existingId = findExisting(db, normalized, episodeId, cueIndex);
  if (existingId !== null) {
    db.prepare(
      `UPDATE vocabulary SET
         word = ?,
         lemma = ?,
         pos = ?,
         ipa = ?,
         definitions = ?,
         arabic = ?,
         context = COALESCE(?, context),
         start_ms = COALESCE(?, start_ms),
         updated_at = ?
       WHERE id = ?`,
    ).run(
      word,
      entry?.lemma ?? null,
      entry?.pos ?? null,
      entry?.ipa ?? null,
      definitions,
      arabic,
      context,
      startMs,
      now,
      existingId,
    );
    const saved = getVocabulary(db, existingId);
    if (!saved) throw new Error("The saved word could not be read back.");
    return { word: saved, created: false };
  }

  const result = db
    .prepare(
      `INSERT INTO vocabulary (
         word, normalized_word, lemma, pos, ipa, definitions, arabic, context,
         episode_id, cue_index, start_ms, status, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'learning', '', ?, ?)`,
    )
    .run(
      word,
      normalized,
      entry?.lemma ?? null,
      entry?.pos ?? null,
      entry?.ipa ?? null,
      definitions,
      arabic,
      context,
      episodeId,
      cueIndex,
      startMs,
      now,
      now,
    );

  const saved = getVocabulary(db, Number(result.lastInsertRowid));
  if (!saved) throw new Error("The saved word could not be read back.");
  return { word: saved, created: true };
}

export function listVocabulary(db: Db, query: VocabularyQuery = {}): VocabularyList {
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
  const offset = Math.max(query.offset ?? 0, 0);
  const where: string[] = [];
  const params: unknown[] = [];

  if (query.q?.trim()) {
    const pattern = likePattern(query.q.trim());
    where.push(
      `(v.word LIKE ? ESCAPE '\\'
        OR v.normalized_word LIKE ? ESCAPE '\\'
        OR v.lemma LIKE ? ESCAPE '\\'
        OR v.definitions LIKE ? ESCAPE '\\'
        OR v.arabic LIKE ? ESCAPE '\\'
        OR v.notes LIKE ? ESCAPE '\\'
        OR v.context LIKE ? ESCAPE '\\')`,
    );
    params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }
  if (query.status) {
    where.push("v.status = ?");
    params.push(query.status);
  }
  if (query.episodeId !== undefined) {
    where.push("v.episode_id = ?");
    params.push(query.episodeId);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS count FROM vocabulary v ${whereSql}`)
    .get(...params) as { count: number };

  const rows = db
    .prepare(
      `${VOCABULARY_SELECT}
       ${whereSql}
       ORDER BY v.updated_at DESC, v.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as VocabularyRow[];

  return { words: rows.map(mapRow), total: totalRow.count, limit, offset };
}

export function updateVocabulary(
  db: Db,
  id: number,
  patch: UpdateVocabularyInput,
): VocabularyItem | null {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (patch.status !== undefined) {
    sets.push("status = ?");
    params.push(patch.status);
  }
  if (patch.notes !== undefined) {
    sets.push("notes = ?");
    params.push(patch.notes.trim());
  }
  if (sets.length === 0) return getVocabulary(db, id);

  sets.push("updated_at = ?");
  params.push(new Date().toISOString(), id);

  const result = db
    .prepare(`UPDATE vocabulary SET ${sets.join(", ")} WHERE id = ?`)
    .run(...params);
  return result.changes > 0 ? getVocabulary(db, id) : null;
}

export function deleteVocabulary(db: Db, id: number): boolean {
  return db.prepare("DELETE FROM vocabulary WHERE id = ?").run(id).changes > 0;
}
