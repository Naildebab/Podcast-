import fs from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { type Db, openDb } from "../src/db.js";
import { closeDictionary } from "../src/dictionary.js";
import type { FetchedText, FetchText } from "../src/http.js";
import { addPodcast } from "../src/library.js";
import { parseFeed } from "../src/rss.js";
import { createTestDictionary } from "./dictionary-fixture.js";
import { SAMPLE_RSS, SAMPLE_RSS_WITH_THIRD, SAMPLE_SITE } from "./fixtures.js";

const SAMPLE_VTT = `WEBVTT

00:00:01.000 --> 00:00:03.000
<v Host>Welcome to the test.

00:00:04.000 --> 00:00:06.000
This is the second line.
`;

let db: Db;
let server: Server;
let base: string;
let pages: Map<string, FetchedText>;
let dictionaryDir: string;
let dictionaryDb: Database.Database;
let recordingsDir: string;

async function listen(app: ReturnType<typeof createApp>): Promise<Server> {
  return new Promise((resolve, reject) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    instance.on("error", reject);
  });
}

async function api(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

async function upload(
  path: string,
  body: Uint8Array,
  contentType = "audio/webm",
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

beforeEach(async () => {
  db = openDb(":memory:");
  dictionaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "pls-api-dictionary-"));
  recordingsDir = fs.mkdtempSync(path.join(os.tmpdir(), "pls-api-recordings-"));
  process.env.PODCAST_DICTIONARY_DB = path.join(dictionaryDir, "dictionary.db");
  dictionaryDb = createTestDictionary(process.env.PODCAST_DICTIONARY_DB);
  pages = new Map([
    [
      "https://example.com/feed.xml",
      {
        text: SAMPLE_RSS,
        finalUrl: "https://example.com/feed.xml",
        contentType: "application/rss+xml",
      },
    ],
    [
      "https://example.com/site",
      {
        text: SAMPLE_SITE,
        finalUrl: "https://example.com/site",
        contentType: "text/html; charset=utf-8",
      },
    ],
    [
      "https://example.com/atom.xml",
      {
        text: "<html>not a feed</html>",
        finalUrl: "https://example.com/atom.xml",
        contentType: "text/html",
      },
    ],
    [
      "https://example.com/one.vtt",
      {
        text: SAMPLE_VTT,
        finalUrl: "https://example.com/one.vtt",
        contentType: "text/vtt; charset=utf-8",
      },
    ],
    [
      "https://example.com/transcript-page",
      {
        text: "<html><body>Not a file.</body></html>",
        finalUrl: "https://example.com/transcript-page",
        contentType: "text/html; charset=utf-8",
      },
    ],
  ]);

  const fetchText: FetchText = async (url) => {
    const page = pages.get(url);
    if (!page) throw new Error(`Unexpected test fetch: ${url}`);
    return page;
  };

  server = await listen(createApp(db, { fetchText, webDist: null, recordingsDir }));
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  closeDictionary();
  dictionaryDb.close();
  delete process.env.PODCAST_DICTIONARY_DB;
  fs.rmSync(dictionaryDir, { recursive: true, force: true });
  fs.rmSync(recordingsDir, { recursive: true, force: true });
});

describe("health and metadata", () => {
  it("reports that the local server is ready", async () => {
    const response = await api("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, phase: 5 });
  });
});

describe("curated discovery", () => {
  it("returns the verified catalog and category filters", async () => {
    const response = await api("/api/discovery/catalog");
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(13);
    expect(response.body.categories).toContain("English learning");
    expect(
      response.body.podcasts.every((item: { inLibrary: boolean }) => item.inLibrary === false),
    ).toBe(true);
  });

  it("searches titles, authors, tags, and categories", async () => {
    const response = await api("/api/discovery/catalog?q=bbc");
    expect(response.body.total).toBe(3);
    expect(
      response.body.podcasts.every(
        (item: { title: string; author: string }) =>
          `${item.title} ${item.author}`.includes("BBC"),
      ),
    ).toBe(true);
  });

  it("marks shows already in the library", async () => {
    const catalogFeed = "https://podcasts.files.bbci.co.uk/p02pc9tn.rss";
    addPodcast(db, catalogFeed, parseFeed(SAMPLE_RSS));

    const response = await api("/api/discovery/catalog?q=6%20Minute");
    const item = response.body.podcasts.find(
      (podcast: { id: string }) => podcast.id === "bbc-6-minute-english",
    );
    expect(item.inLibrary).toBe(true);
    expect(item.libraryId).toBeGreaterThan(0);
  });
});

describe("resolving feeds", () => {
  it("follows a website's declared RSS link and returns a preview", async () => {
    const response = await api("/api/discovery/resolve", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com/site" }),
    });
    expect(response.status).toBe(200);
    expect(response.body.feedUrl).toBe("https://example.com/feed.xml");
    expect(response.body.feed.title).toBe("Test English Show");
    expect(response.body.feed.episodeCount).toBe(2);
    expect(response.body.feed.episodes).toHaveLength(2);
  });

  it("rejects addresses that are not http(s)", async () => {
    const response = await api("/api/discovery/resolve", {
      method: "POST",
      body: JSON.stringify({ url: "ftp://example.com/feed.xml" }),
    });
    expect(response.status).toBe(422);
    expect(response.body.error).toMatch(/http/i);
  });

  it("rejects websites without a feed link", async () => {
    pages.set("https://example.com/no-feed", {
      text: "<html><head><title>Nothing</title></head></html>",
      finalUrl: "https://example.com/no-feed",
      contentType: "text/html",
    });
    const response = await api("/api/discovery/resolve", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com/no-feed" }),
    });
    expect(response.status).toBe(422);
    expect(response.body.error).toMatch(/does not advertise an RSS feed/i);
  });
});

describe("library and episodes", () => {
  it("adds a podcast and lists its episodes newest first", async () => {
    const added = await api("/api/podcasts", {
      method: "POST",
      body: JSON.stringify({ feedUrl: "https://example.com/feed.xml" }),
    });
    expect(added.status).toBe(201);
    expect(added.body.podcast.title).toBe("Test English Show");
    expect(added.body.podcast.episodeCount).toBe(2);

    const library = await api("/api/podcasts");
    expect(library.body.podcasts).toHaveLength(1);

    const episodes = await api(`/api/episodes?podcastId=${added.body.podcast.id}`);
    expect(episodes.status).toBe(200);
    expect(episodes.body.total).toBe(2);
    expect(episodes.body.episodes[0].title).toBe("Episode Two");
    expect(episodes.body.episodes[1].title).toBe("Episode One & Friends");
  });

  it("accepts a website address and adds its feed", async () => {
    const added = await api("/api/podcasts", {
      method: "POST",
      body: JSON.stringify({ feedUrl: "https://example.com/site" }),
    });
    expect(added.status).toBe(201);
    expect(added.body.podcast.feedUrl).toBe("https://example.com/feed.xml");
  });

  it("refuses to add the same feed twice", async () => {
    await api("/api/podcasts", {
      method: "POST",
      body: JSON.stringify({ feedUrl: "https://example.com/feed.xml" }),
    });
    const duplicate = await api("/api/podcasts", {
      method: "POST",
      body: JSON.stringify({ feedUrl: "https://example.com/feed.xml" }),
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toMatch(/already in your library/i);
  });

  it("saves progress and returns it on the home summary", async () => {
    const added = await api("/api/podcasts", {
      method: "POST",
      body: JSON.stringify({ feedUrl: "https://example.com/feed.xml" }),
    });
    const episodes = await api(`/api/episodes?podcastId=${added.body.podcast.id}`);
    const first = episodes.body.episodes.find(
      (episode: { title: string }) => episode.title === "Episode One & Friends",
    );

    const saved = await api(`/api/episodes/${first.id}/progress`, {
      method: "PUT",
      body: JSON.stringify({ positionMs: 5000 }),
    });
    expect(saved.status).toBe(200);
    expect(saved.body.progress).toMatchObject({ positionMs: 5000, status: "in_progress" });

    const home = await api("/api/home");
    expect(home.body.continueListening).toHaveLength(1);
    expect(home.body.continueListening[0].positionMs).toBe(5000);
    expect(home.body.stats.inProgress).toBe(1);

    const episode = await api(`/api/episodes/${first.id}`);
    expect(episode.body.episode.status).toBe("in_progress");
  });

  it("can mark an episode complete and reset it", async () => {
    const added = await api("/api/podcasts", {
      method: "POST",
      body: JSON.stringify({ feedUrl: "https://example.com/feed.xml" }),
    });
    const episodes = await api(`/api/episodes?podcastId=${added.body.podcast.id}`);
    const id = episodes.body.episodes[0].id;

    const completed = await api(`/api/episodes/${id}/progress`, {
      method: "PUT",
      body: JSON.stringify({ positionMs: 12345, status: "completed" }),
    });
    expect(completed.body.progress.status).toBe("completed");

    const reset = await api(`/api/episodes/${id}/progress`, {
      method: "PUT",
      body: JSON.stringify({ positionMs: 0, status: "new" }),
    });
    expect(reset.body.progress).toMatchObject({ positionMs: 0, status: "new" });
  });

  it("refreshes a feed while preserving playback progress", async () => {
    const added = await api("/api/podcasts", {
      method: "POST",
      body: JSON.stringify({ feedUrl: "https://example.com/feed.xml" }),
    });
    const episodes = await api(`/api/episodes?podcastId=${added.body.podcast.id}`);
    const first = episodes.body.episodes.find(
      (episode: { title: string }) => episode.title === "Episode One & Friends",
    );
    await api(`/api/episodes/${first.id}/progress`, {
      method: "PUT",
      body: JSON.stringify({ positionMs: 9000 }),
    });

    pages.set("https://example.com/feed.xml", {
      text: SAMPLE_RSS_WITH_THIRD,
      finalUrl: "https://example.com/feed.xml",
      contentType: "application/rss+xml",
    });

    const refreshed = await api(`/api/podcasts/${added.body.podcast.id}/refresh`, {
      method: "POST",
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.podcast.episodeCount).toBe(3);

    const after = await api(`/api/episodes?podcastId=${added.body.podcast.id}`);
    expect(after.body.total).toBe(3);
    const sameEpisode = after.body.episodes.find(
      (episode: { id: number }) => episode.id === first.id,
    );
    expect(sameEpisode.positionMs).toBe(9000);
  });

  it("removes a podcast and its episodes", async () => {
    const added = await api("/api/podcasts", {
      method: "POST",
      body: JSON.stringify({ feedUrl: "https://example.com/feed.xml" }),
    });
    const removed = await api(`/api/podcasts/${added.body.podcast.id}`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(204);

    const library = await api("/api/podcasts");
    expect(library.body.podcasts).toHaveLength(0);
    const episodes = await api("/api/episodes");
    expect(episodes.body.total).toBe(0);
  });

  it("validates ids and request bodies", async () => {
    expect((await api("/api/podcasts/not-a-number")).status).toBe(400);
    expect((await api("/api/podcasts/999")).status).toBe(404);
    expect(
      (
        await api("/api/podcasts", {
          method: "POST",
          body: JSON.stringify({ feedUrl: "" }),
        })
      ).status,
    ).toBe(400);
  });
});

describe("dictionary and vocabulary", () => {
  it("reads the borrowed dictionary and reports its attribution", async () => {
    const lookup = await api("/api/dictionary/lookup?word=podcast");
    expect(lookup.status).toBe(200);
    expect(lookup.body).toMatchObject({
      normalized: "podcast",
      matchedBy: "word",
    });
    expect(lookup.body.entries[0]).toMatchObject({
      word: "podcast",
      pos: "noun",
      ipa: "/ˈpɑdˌkæst/",
      definitions: ["A program delivered over the Internet."],
      arabic: ["بُودْكَاسْت"],
    });

    const resources = await api("/api/resources");
    expect(resources.body.dictionary).toMatchObject({
      available: true,
      entries: 3,
      forms: 6,
    });
  });

  it("saves, lists, updates, and deletes words with transcript context", async () => {
    const added = await api("/api/podcasts", {
      method: "POST",
      body: JSON.stringify({ feedUrl: "https://example.com/feed.xml" }),
    });
    const episodes = await api(`/api/episodes?podcastId=${added.body.podcast.id}`);
    const episode = episodes.body.episodes.find(
      (item: { title: string }) => item.title === "Episode One & Friends",
    );

    const saved = await api("/api/vocabulary", {
      method: "POST",
      body: JSON.stringify({
        word: "Podcast!",
        entryId: 1,
        episodeId: episode.id,
        cueIndex: 2,
        startMs: 4000,
        context: "This podcast is about testing.",
      }),
    });
    expect(saved.status).toBe(201);
    expect(saved.body.word).toMatchObject({
      word: "Podcast!",
      normalizedWord: "podcast",
      pos: "noun",
      ipa: "/ˈpɑdˌkæst/",
      definitions: ["A program delivered over the Internet."],
      arabic: ["بُودْكَاسْت"],
      episodeId: episode.id,
      episodeTitle: "Episode One & Friends",
      podcastTitle: "Test English Show",
      cueIndex: 2,
      startMs: 4000,
      status: "learning",
    });

    const again = await api("/api/vocabulary", {
      method: "POST",
      body: JSON.stringify({
        word: "podcast",
        entryId: 1,
        episodeId: episode.id,
        cueIndex: 2,
        context: "Updated context.",
      }),
    });
    expect(again.status).toBe(200);
    expect(again.body.word.id).toBe(saved.body.word.id);
    expect(again.body.word.context).toBe("Updated context.");

    const updated = await api(`/api/vocabulary/${saved.body.word.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "known", notes: "Test note." }),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.word).toMatchObject({ status: "known", notes: "Test note." });

    const listed = await api("/api/vocabulary?status=known&q=podcast");
    expect(listed.status).toBe(200);
    expect(listed.body.total).toBe(1);
    expect(listed.body.words[0].id).toBe(saved.body.word.id);

    const removed = await api(`/api/vocabulary/${saved.body.word.id}`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(204);
    expect((await api("/api/vocabulary")).body.total).toBe(0);
  });

  it("validates vocabulary input and missing resources", async () => {
    expect(
      (
        await api("/api/vocabulary", {
          method: "POST",
          body: JSON.stringify({ word: "" }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api("/api/vocabulary", {
          method: "POST",
          body: JSON.stringify({ word: "podcast", entryId: 999 }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api("/api/vocabulary", {
          method: "POST",
          body: JSON.stringify({ word: "podcast", episodeId: 999 }),
        })
      ).status,
    ).toBe(404);
    expect((await api("/api/vocabulary/999", { method: "DELETE" })).status).toBe(404);
  });
});

describe("transcripts", () => {
  async function addTestPodcast() {
    const added = await api("/api/podcasts", {
      method: "POST",
      body: JSON.stringify({ feedUrl: "https://example.com/feed.xml" }),
    });
    const episodes = await api(`/api/episodes?podcastId=${added.body.podcast.id}`);
    return episodes.body.episodes as Array<{
      id: number;
      title: string;
      transcriptUrl: string | null;
    }>;
  }

  it("loads a feed transcript, caches it locally, and removes it", async () => {
    const episodes = await addTestPodcast();
    const episode = episodes.find((item) => item.title === "Episode One & Friends")!;
    expect(episode.transcriptUrl).toBe("https://example.com/one.vtt");

    const empty = await api(`/api/episodes/${episode.id}/transcript`);
    expect(empty.status).toBe(200);
    expect(empty.body.transcript).toBeNull();

    const loaded = await api(`/api/episodes/${episode.id}/transcript`, {
      method: "POST",
      body: JSON.stringify({ source: "feed" }),
    });
    expect(loaded.status).toBe(201);
    expect(loaded.body.transcript).toMatchObject({
      episodeId: episode.id,
      sourceUrl: "https://example.com/one.vtt",
      format: "vtt",
      origin: "feed",
      timed: true,
      cueCount: 2,
    });
    expect(loaded.body.transcript.cues[0]).toMatchObject({
      index: 0,
      startMs: 1000,
      endMs: 3000,
      speaker: "Host",
      text: "Welcome to the test.",
    });

    const cached = await api(`/api/episodes/${episode.id}/transcript`);
    expect(cached.body.transcript.importedAt).toBe(loaded.body.transcript.importedAt);
    expect(cached.body.transcript.cues).toHaveLength(2);

    const removed = await api(`/api/episodes/${episode.id}/transcript`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(204);
    expect((await api(`/api/episodes/${episode.id}/transcript`)).body.transcript).toBeNull();
  });

  it("imports pasted text for an episode without a feed transcript", async () => {
    const episodes = await addTestPodcast();
    const episode = episodes.find((item) => item.title === "Episode Two")!;

    const noSource = await api(`/api/episodes/${episode.id}/transcript`, {
      method: "POST",
      body: JSON.stringify({ source: "feed" }),
    });
    expect(noSource.status).toBe(422);
    expect(noSource.body.error).toMatch(/does not advertise/i);

    const imported = await api(`/api/episodes/${episode.id}/transcript`, {
      method: "POST",
      body: JSON.stringify({
        text: "00:01 Hello there.\n00:03 Next line.",
        format: "text",
      }),
    });
    expect(imported.status).toBe(201);
    expect(imported.body.transcript).toMatchObject({
      origin: "manual",
      sourceUrl: null,
      format: "text",
      timed: true,
      cueCount: 2,
    });
    expect(imported.body.transcript.cues[1]).toMatchObject({
      startMs: 3000,
      text: "Next line.",
    });
  });

  it("rejects HTML pages and invalid JSON", async () => {
    const episodes = await addTestPodcast();
    const episode = episodes.find((item) => item.title === "Episode Two")!;

    const html = await api(`/api/episodes/${episode.id}/transcript`, {
      method: "POST",
      body: JSON.stringify({ source: "url", url: "https://example.com/transcript-page" }),
    });
    expect(html.status).toBe(422);
    expect(html.body.error).toMatch(/web page/i);

    const invalid = await api(`/api/episodes/${episode.id}/transcript`, {
      method: "POST",
      body: JSON.stringify({ text: "{not json", format: "json" }),
    });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error).toMatch(/valid JSON/i);
  });

  it("returns 404 for an unknown episode", async () => {
    expect((await api("/api/episodes/999/transcript")).status).toBe(404);
    expect(
      (
        await api("/api/episodes/999/transcript", {
          method: "POST",
          body: JSON.stringify({ source: "feed" }),
        })
      ).status,
    ).toBe(404);
  });
});

describe("shadowing recordings", () => {
  async function addTestPodcast() {
    const added = await api("/api/podcasts", {
      method: "POST",
      body: JSON.stringify({ feedUrl: "https://example.com/feed.xml" }),
    });
    const episodes = await api(`/api/episodes?podcastId=${added.body.podcast.id}`);
    return {
      podcastId: added.body.podcast.id as number,
      episode: episodes.body.episodes.find(
        (item: { title: string }) => item.title === "Episode One & Friends",
      ) as { id: number },
    };
  }

  it("stores, lists, streams with range support, and deletes a take", async () => {
    const { episode } = await addTestPodcast();
    const bytes = Buffer.from("fake webm audio bytes");

    const saved = await upload(
      `/api/recordings?episodeId=${episode.id}&cueIndex=0&startMs=1000&endMs=3000&durationMs=2100`,
      bytes,
      "audio/webm;codecs=opus",
    );
    expect(saved.status).toBe(201);
    expect(saved.body.recording).toMatchObject({
      episodeId: episode.id,
      cueIndex: 0,
      startMs: 1000,
      endMs: 3000,
      durationMs: 2100,
      mimeType: "audio/webm",
      sizeBytes: bytes.length,
      label: "Take",
    });
    expect(saved.body.recording.audioUrl).toMatch(
      new RegExp(`^/api/recordings/\\d+/audio$`),
    );
    expect(fs.readdirSync(recordingsDir)).toHaveLength(1);

    const listed = await api(`/api/recordings?episodeId=${episode.id}&cueIndex=0`);
    expect(listed.status).toBe(200);
    expect(listed.body.recordings).toHaveLength(1);
    expect(listed.body.recordings[0].id).toBe(saved.body.recording.id);
    expect(
      (await api(`/api/recordings?episodeId=${episode.id}&cueIndex=9`)).body.recordings,
    ).toHaveLength(0);

    const audio = await fetch(`${base}${saved.body.recording.audioUrl}`);
    expect(audio.status).toBe(200);
    expect(audio.headers.get("content-type")).toBe("audio/webm");
    expect(Buffer.from(await audio.arrayBuffer())).toEqual(bytes);

    const ranged = await fetch(`${base}${saved.body.recording.audioUrl}`, {
      headers: { range: "bytes=0-3" },
    });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("content-range")).toBe(`bytes 0-3/${bytes.length}`);
    expect(Buffer.from(await ranged.arrayBuffer()).toString()).toBe("fake");

    const removed = await api(`/api/recordings/${saved.body.recording.id}`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(204);
    expect(
      (await api(`/api/recordings?episodeId=${episode.id}`)).body.recordings,
    ).toHaveLength(0);
    expect(fs.readdirSync(recordingsDir)).toHaveLength(0);
    expect(
      (await fetch(`${base}${saved.body.recording.audioUrl}`)).status,
    ).toBe(404);
  });

  it("validates missing episodes, formats, and empty uploads", async () => {
    const { episode } = await addTestPodcast();
    const bytes = Buffer.from("fake webm audio bytes");

    expect(
      (
        await upload(
          `/api/recordings?episodeId=999&cueIndex=0`,
          bytes,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await upload(
          `/api/recordings?cueIndex=0`,
          bytes,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await upload(
          `/api/recordings?episodeId=${episode.id}`,
          bytes,
          "audio/midi",
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await upload(
          `/api/recordings?episodeId=${episode.id}`,
          bytes,
          "text/plain",
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await upload(
          `/api/recordings?episodeId=${episode.id}`,
          Buffer.alloc(0),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await upload(
          `/api/recordings?episodeId=${episode.id}&startMs=5000&endMs=1000`,
          bytes,
        )
      ).status,
    ).toBe(400);
  });

  it("removes saved take files when their podcast is deleted", async () => {
    const { podcastId, episode } = await addTestPodcast();
    const saved = await upload(
      `/api/recordings?episodeId=${episode.id}&cueIndex=1&startMs=1000&endMs=3000`,
      Buffer.from("another fake take"),
    );
    expect(saved.status).toBe(201);
    expect(fs.readdirSync(recordingsDir)).toHaveLength(1);

    expect((await api(`/api/podcasts/${podcastId}`, { method: "DELETE" })).status).toBe(
      204,
    );
    expect(fs.readdirSync(recordingsDir)).toHaveLength(0);
    expect((await api(`/api/recordings?episodeId=${episode.id}`)).status).toBe(404);
  });
});
