import fs from "node:fs";
import Database from "better-sqlite3";
import { dictionaryDbPath } from "./config.js";

export interface DictionaryEntry {
  id: number;
  word: string;
  pos: string;
  ipa: string | null;
  definitions: string[];
  arabic: string[];
  lemma: string | null;
}

export interface DictionaryResult {
  query: string;
  normalized: string;
  matchedBy: "word" | "form" | null;
  lemmas: string[];
  entries: DictionaryEntry[];
  forms: string[];
  source: {
    name: string;
    license: string;
    url: string;
  };
}

export interface DictionaryStatus {
  available: boolean;
  path: string;
  entries: number | null;
  forms: number | null;
  source: string | null;
  license: string | null;
  error: string | null;
}

export class DictionaryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DictionaryUnavailableError";
  }
}

export class DictionaryQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DictionaryQueryError";
  }
}

interface EntryRow {
  id: number;
  word: string;
  pos: string;
  ipa: string | null;
  definitions: string;
  arabic: string | null;
  lemma: string | null;
}

interface MetaRow {
  key: string;
  value: string;
}

const SOURCE = {
  name: "Wiktionary, extracted by Wiktextract",
  license: "CC BY-SA 4.0 and GFDL",
  url: "https://kaikki.org/dictionary/",
} as const;

let cached: { path: string; db: Database.Database } | null = null;

function openDictionary(dbPath: string): Database.Database {
  if (cached?.path === dbPath) return cached.db;

  if (!fs.existsSync(dbPath)) {
    throw new DictionaryUnavailableError(
      "The local dictionary database was not found. Set PODCAST_DICTIONARY_DB to its path.",
    );
  }

  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    // This is a borrowed database. The app never writes to it.
    db.pragma("query_only = ON");
    db.pragma("busy_timeout = 2000");
    cached?.db.close();
    cached = { path: dbPath, db };
    return db;
  } catch (error) {
    throw new DictionaryUnavailableError(
      `The local dictionary database could not be opened. ${messageOf(error)}`,
    );
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}

function readMeta(db: Database.Database): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM meta").all() as MetaRow[];
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function jsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function mapEntry(row: EntryRow): DictionaryEntry {
  return {
    id: row.id,
    word: row.word,
    pos: row.pos,
    ipa: row.ipa,
    definitions: jsonArray(row.definitions),
    arabic: jsonArray(row.arabic),
    lemma: row.lemma,
  };
}

function findEntries(db: Database.Database, word: string): DictionaryEntry[] {
  const rows = db
    .prepare(
      `SELECT id, word, pos, ipa, definitions, arabic, lemma
       FROM entries
       WHERE word_lc = ?
       ORDER BY id ASC
       LIMIT 40`,
    )
    .all(word) as EntryRow[];
  return rows.map(mapEntry);
}

function findLemmas(db: Database.Database, form: string): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT lemma_lc
       FROM forms
       WHERE form_lc = ?
       ORDER BY lemma_lc ASC
       LIMIT 12`,
    )
    .all(form) as { lemma_lc: string }[];
  return rows.map((row) => row.lemma_lc);
}

function findForms(db: Database.Database, lemmas: string[]): string[] {
  if (lemmas.length === 0) return [];
  const placeholders = lemmas.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT DISTINCT form_lc
       FROM forms
       WHERE lemma_lc IN (${placeholders})
       ORDER BY form_lc ASC
       LIMIT 200`,
    )
    .all(...lemmas) as { form_lc: string }[];
  return rows.map((row) => row.form_lc);
}

/**
 * Normalize a lookup while keeping letters, numbers, apostrophes, hyphens,
 * and internal spaces. This accepts words such as "don't" and "ice-cream"
 * without treating punctuation as part of the headword.
 */
export function normalizeDictionaryWord(raw: string): string {
  return raw
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[’‘]/g, "'")
    .replace(/^[^\p{L}\p{N}'-]+|[^\p{L}\p{N}'-]+$/gu, "")
    .replace(/\s+/g, " ");
}

export function lookupDictionary(raw: string, dbPath = dictionaryDbPath()): DictionaryResult {
  const normalized = normalizeDictionaryWord(raw);
  if (!normalized) {
    throw new DictionaryQueryError("Enter a word or phrase to look up.");
  }
  if (normalized.length > 100) {
    throw new DictionaryQueryError("That lookup is too long. Use a word or short phrase.");
  }

  const db = openDictionary(dbPath);
  const directEntries = findEntries(db, normalized);
  const lemmas =
    directEntries.length > 0
      ? [
          ...new Set([
            normalized,
            ...directEntries.flatMap((entry) => (entry.lemma ? [entry.lemma] : [])),
          ]),
        ]
      : findLemmas(db, normalized);
  const entries = directEntries.length > 0 ? directEntries : findEntriesForLemmas(db, lemmas);

  return {
    query: raw.trim(),
    normalized,
    matchedBy: directEntries.length > 0 ? "word" : entries.length > 0 ? "form" : null,
    lemmas,
    entries,
    forms: findForms(db, lemmas),
    source: SOURCE,
  };
}

function findEntriesForLemmas(db: Database.Database, lemmas: string[]): DictionaryEntry[] {
  const byId = new Map<number, DictionaryEntry>();
  for (const lemma of lemmas) {
    for (const entry of findEntries(db, lemma)) byId.set(entry.id, entry);
  }
  return [...byId.values()];
}

export function dictionaryStatus(dbPath = dictionaryDbPath()): DictionaryStatus {
  try {
    const db = openDictionary(dbPath);
    const meta = readMeta(db);
    const forms = db.prepare("SELECT COUNT(*) AS count FROM forms").get() as {
      count: number;
    };
    return {
      available: true,
      path: dbPath,
      entries: Number(meta.entries) || null,
      forms: forms.count,
      source: meta.source ?? SOURCE.name,
      license: meta.licence ?? SOURCE.license,
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      path: dbPath,
      entries: null,
      forms: null,
      source: null,
      license: null,
      error: messageOf(error),
    };
  }
}

export function closeDictionary(): void {
  cached?.db.close();
  cached = null;
}
