import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Db, openDb } from "../src/db.js";
import { closeDictionary, DictionaryUnavailableError } from "../src/dictionary.js";
import { addPodcast, deletePodcast, listEpisodes } from "../src/library.js";
import { parseFeed } from "../src/rss.js";
import {
  deleteVocabulary,
  listVocabulary,
  saveVocabulary,
  updateVocabulary,
  VocabularyInputError,
} from "../src/vocabulary.js";
import { createTestDictionary } from "./dictionary-fixture.js";
import { SAMPLE_RSS } from "./fixtures.js";

let dir: string;
let dictionaryPath: string;
let dictionary: Database.Database;
let db: Db;
let podcastId: number;
let episodeId: number;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pls-vocabulary-"));
  dictionaryPath = path.join(dir, "dictionary.db");
  dictionary = createTestDictionary(dictionaryPath);
  db = openDb(":memory:");
  const podcast = addPodcast(db, "https://example.com/feed.xml", parseFeed(SAMPLE_RSS));
  podcastId = podcast.id;
  episodeId = listEpisodes(db, { podcastId: podcast.id }).episodes.find((episode) =>
    episode.title.includes("One"),
  )!.id;
});

afterEach(() => {
  closeDictionary();
  db.close();
  dictionary.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("vocabulary storage", () => {
  it("saves the clicked word with dictionary and episode context", () => {
    const result = saveVocabulary(
      db,
      {
        word: " Podcast! ",
        entryId: 1,
        episodeId,
        cueIndex: 4,
        startMs: 12_500,
        context: "This podcast is about testing.",
      },
      dictionaryPath,
    );

    expect(result.created).toBe(true);
    expect(result.word).toMatchObject({
      word: "Podcast!",
      normalizedWord: "podcast",
      lemma: null,
      pos: "noun",
      ipa: "/ˈpɑdˌkæst/",
      context: "This podcast is about testing.",
      episodeId,
      episodeTitle: "Episode One & Friends",
      podcastTitle: "Test English Show",
      cueIndex: 4,
      startMs: 12_500,
      status: "learning",
      notes: "",
    });
    expect(result.word.definitions).toEqual(["A program delivered over the Internet."]);
    expect(result.word.arabic).toEqual(["بُودْكَاسْت"]);
  });

  it("updates an existing capture instead of duplicating the same cue", () => {
    const first = saveVocabulary(
      db,
      { word: "podcast", entryId: 1, episodeId, cueIndex: 2, context: "First line." },
      dictionaryPath,
    );
    updateVocabulary(db, first.word.id, { status: "known", notes: "Remember this one." });

    const second = saveVocabulary(
      db,
      { word: "Podcast", entryId: 1, episodeId, cueIndex: 2, context: "Updated line." },
      dictionaryPath,
    );

    expect(second.created).toBe(false);
    expect(second.word.id).toBe(first.word.id);
    expect(second.word.status).toBe("known");
    expect(second.word.notes).toBe("Remember this one.");
    expect(second.word.context).toBe("Updated line.");
    expect(listVocabulary(db).total).toBe(1);
  });

  it("allows the same word from a different transcript line", () => {
    saveVocabulary(
      db,
      { word: "podcast", entryId: 1, episodeId, cueIndex: 1 },
      dictionaryPath,
    );
    const second = saveVocabulary(
      db,
      { word: "podcast", entryId: 1, episodeId, cueIndex: 2 },
      dictionaryPath,
    );

    expect(second.created).toBe(true);
    expect(listVocabulary(db).total).toBe(2);
  });

  it("keeps saved words when their podcast is deleted", () => {
    const episodes = listEpisodes(db, { podcastId }).episodes;
    const first = episodes.find((episode) => episode.title.includes("One"))!;
    const second = episodes.find((episode) => episode.title === "Episode Two")!;

    saveVocabulary(
      db,
      { word: "podcast", entryId: 1, episodeId: first.id, cueIndex: 1 },
      dictionaryPath,
    );
    saveVocabulary(
      db,
      { word: "podcast", entryId: 1, episodeId: second.id, cueIndex: 1 },
      dictionaryPath,
    );

    expect(deletePodcast(db, podcastId)).toBe(true);
    const saved = listVocabulary(db);
    expect(saved.total).toBe(2);
    expect(saved.words.every((word) => word.episodeId === null)).toBe(true);
    expect(saved.words.every((word) => word.episodeTitle === null)).toBe(true);
  });

  it("lists, filters, searches, updates, and deletes saved words", () => {
    const first = saveVocabulary(
      db,
      {
        word: "running",
        entryId: 3,
        episodeId,
        cueIndex: 1,
        context: "I was running late.",
      },
      dictionaryPath,
    );
    const second = saveVocabulary(
      db,
      { word: "podcast", entryId: 1, episodeId, cueIndex: 2 },
      dictionaryPath,
    );
    updateVocabulary(db, second.word.id, { status: "known" });

    expect(listVocabulary(db, { q: "running" }).words[0]?.id).toBe(first.word.id);
    expect(listVocabulary(db, { q: "late" }).words[0]?.id).toBe(first.word.id);
    expect(listVocabulary(db, { status: "known" }).words.map((word) => word.id)).toEqual([
      second.word.id,
    ]);
    expect(listVocabulary(db, { episodeId }).total).toBe(2);

    const updated = updateVocabulary(db, first.word.id, {
      status: "learning",
      notes: "Practice the -ing form.",
    });
    expect(updated).toMatchObject({
      status: "learning",
      notes: "Practice the -ing form.",
    });
    expect(updated?.lemma).toBe("run");

    expect(deleteVocabulary(db, first.word.id)).toBe(true);
    expect(deleteVocabulary(db, first.word.id)).toBe(false);
    expect(listVocabulary(db).total).toBe(1);
  });

  it("rejects empty words, missing entries, and an unavailable dictionary", () => {
    expect(() => saveVocabulary(db, { word: " !!! " }, dictionaryPath)).toThrow(
      VocabularyInputError,
    );
    expect(() =>
      saveVocabulary(db, { word: "podcast", entryId: 999 }, dictionaryPath),
    ).toThrow(VocabularyInputError);
    expect(() =>
      saveVocabulary(
        db,
        { word: "podcast" },
        path.join(dir, "missing-dictionary.db"),
      ),
    ).toThrow(DictionaryUnavailableError);
  });
});
