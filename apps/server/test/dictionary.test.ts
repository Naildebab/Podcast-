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
import { createTestDictionary } from "./dictionary-fixture.js";

let dir: string;
let dbPath: string;
let db: Database.Database;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pls-dictionary-"));
  dbPath = path.join(dir, "dictionary.db");
  db = createTestDictionary(dbPath);
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
