import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeDictionary,
  DictionaryQueryError,
  DictionaryUnavailableError,
  dictionaryStatus,
  lookupDictionary,
} from "../src/dictionary.js";

let dir: string;
let dbPath: string;
let db: Database.Database;

function createDictionary(file: string): Database.Database {
  const dictionary = new Database(file);
  dictionary.exec(`
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY,
      word TEXT NOT NULL,
      word_lc TEXT NOT NULL,
      pos TEXT NOT NULL,
      ipa TEXT,
      definitions TEXT NOT NULL,
      arabic TEXT,
      lemma TEXT
    );
    CREATE TABLE forms (
      form_lc TEXT NOT NULL,
      lemma_lc TEXT NOT NULL,
      PRIMARY KEY (form_lc, lemma_lc)
    ) WITHOUT ROWID;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  const insertEntry = dictionary.prepare(
    `INSERT INTO entries (id, word, word_lc, pos, ipa, definitions, arabic, lemma)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertEntry.run(
    1,
    "podcast",
    "podcast",
    "noun",
    "/ˈpɑdˌkæst/",
    JSON.stringify(["A program delivered over the Internet."]),
    JSON.stringify(["بُودْكَاسْت"]),
    null,
  );
  insertEntry.run(
    2,
    "run",
    "run",
    "verb",
    "/ɹʌn/",
    JSON.stringify(["To move quickly on foot."]),
    null,
    null,
  );
  insertEntry.run(
    3,
    "running",
    "running",
    "verb",
    "/ˈɹʌnɪŋ/",
    JSON.stringify(["present participle of run"]),
    null,
    "run",
  );

  const insertForm = dictionary.prepare("INSERT INTO forms (form_lc, lemma_lc) VALUES (?, ?)");
  for (const [form, lemma] of [
    ["podcasts", "podcast"],
    ["podcasted", "podcast"],
    ["run", "run"],
    ["runs", "run"],
    ["ran", "run"],
    ["running", "run"],
  ] as const) {
    insertForm.run(form, lemma);
  }

  const insertMeta = dictionary.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
  insertMeta.run("entries", "3");
  insertMeta.run("source", "Wiktionary test extract");
  insertMeta.run("licence", "CC BY-SA 4.0 (and GFDL)");
  return dictionary;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pls-dictionary-"));
  dbPath = path.join(dir, "dictionary.db");
  db = createDictionary(dbPath);
});

afterEach(() => {
  closeDictionary();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("local dictionary", () => {
  it("reports the borrowed database and its attribution", () => {
    const status = dictionaryStatus(dbPath);
    expect(status.available).toBe(true);
    expect(status.entries).toBe(3);
    expect(status.forms).toBe(6);
    expect(status.source).toContain("Wiktionary");
    expect(status.license).toContain("CC BY-SA");
  });

  it("returns definitions, IPA, Arabic, and forms for a headword", () => {
    const result = lookupDictionary("  Podcast! ", dbPath);
    expect(result.normalized).toBe("podcast");
    expect(result.matchedBy).toBe("word");
    expect(result.entries[0]?.ipa).toBe("/ˈpɑdˌkæst/");
    expect(result.entries[0]?.definitions).toEqual([
      "A program delivered over the Internet.",
    ]);
    expect(result.entries[0]?.arabic).toEqual(["بُودْكَاسْت"]);
    expect(result.forms).toContain("podcasts");
    expect(result.source.license).toContain("CC BY-SA");
  });

  it("follows an inflected form to its lemma and lists the lemma's forms", () => {
    const result = lookupDictionary("running", dbPath);
    expect(result.matchedBy).toBe("word");
    expect(result.lemmas).toContain("run");
    expect(result.forms).toEqual(expect.arrayContaining(["ran", "runs", "running"]));
  });

  it("follows a form when the form has no direct entry", () => {
    const result = lookupDictionary("ran", dbPath);
    expect(result.matchedBy).toBe("form");
    expect(result.entries.map((entry) => entry.word)).toEqual(["run"]);
    expect(result.forms).toEqual(expect.arrayContaining(["ran", "running"]));
  });

  it("handles an empty query and a missing database in a predictable way", () => {
    expect(() => lookupDictionary(" !!! ", dbPath)).toThrow(DictionaryQueryError);
    expect(() => lookupDictionary("word", path.join(dir, "missing.db"))).toThrow(
      DictionaryUnavailableError,
    );
    const status = dictionaryStatus(path.join(dir, "missing.db"));
    expect(status.available).toBe(false);
    expect(status.error).toContain("not found");
  });
});
