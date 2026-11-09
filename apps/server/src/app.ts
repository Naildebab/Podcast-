import express, { type NextFunction, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z, ZodError } from "zod";
import { catalogCategories, loadCatalog, searchCatalog } from "./catalog.js";
import { dataDir } from "./config.js";
import type { Db } from "./db.js";
import { previewFeed, resolveFeedUrl } from "./discovery.js";
import { type FetchText, realFetchText } from "./http.js";
import {
  addPodcast,
  AlreadyExistsError,
  deletePodcast,
  findPodcastByFeedUrl,
  getEpisode,
  getPodcast,
  getStats,
  listContinueListening,
  listEpisodes,
  listPodcasts,
  refreshPodcast,
  saveProgress,
} from "./library.js";
import { looksLikeFeed, parseFeed, type ParsedFeed } from "./rss.js";
import { parseTranscript, TranscriptParseError, type TranscriptFormat } from "./transcript.js";
import {
  deleteTranscript,
  getTranscript,
  saveTranscript,
  type StoredTranscript,
} from "./transcripts.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface AppOptions {
  fetchText?: FetchText;
  webDist?: string | null;
}

const urlSchema = z.string().trim().min(1, "Paste an address first.").max(2000);

const catalogQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().max(50).optional(),
  level: z.enum(["beginner", "intermediate", "advanced", "all"]).optional(),
});

const episodeQuerySchema = z.object({
  podcastId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(200).optional(),
  status: z.enum(["new", "in_progress", "completed"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const progressSchema = z.object({
  positionMs: z.number().int().min(0).max(12 * 60 * 60 * 1000),
  status: z.enum(["new", "in_progress", "completed"]).optional(),
});

const transcriptFormatSchema = z.enum(["vtt", "srt", "json", "text"]);

const transcriptImportSchema = z.object({
  source: z.enum(["feed", "url", "text"]).optional(),
  url: z.string().trim().min(1, "Paste a transcript address first.").max(2000).optional(),
  text: z.string().min(1, "Paste a transcript first.").max(4_000_000).optional(),
  format: transcriptFormatSchema.optional(),
  language: z.string().trim().max(20).optional(),
});

const TRANSCRIPT_MAX_BYTES = 4 * 1024 * 1024;
const TRANSCRIPT_ACCEPT =
  "text/vtt, application/x-subrip, text/srt, application/json, text/plain, */*";

function payloadTooLarge(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as { type?: unknown }).type === "entity.too.large"
  );
}

function isBinaryContentType(contentType: string): boolean {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return type.startsWith("image/") || type.startsWith("audio/") || type.startsWith("video/");
}

async function loadTranscriptFromUrl(
  url: string,
  fetchText: FetchText,
  options: { language?: string | null; format?: TranscriptFormat } = {},
): Promise<{ parsed: ReturnType<typeof parseTranscript>; sourceUrl: string }> {
  try {
    const fetched = await fetchText(url, {
      maxBytes: TRANSCRIPT_MAX_BYTES,
      timeoutMs: 20_000,
      accept: TRANSCRIPT_ACCEPT,
    });

    if (isBinaryContentType(fetched.contentType)) {
      throw new Error("That link returned an image, audio, or video file, not a transcript.");
    }
    if (
      !/^\s*WEBVTT(?:[ \t]|\r?\n|$)/i.test(fetched.text) &&
      (fetched.contentType.toLowerCase().includes("text/html") ||
        /^\s*(?:<!doctype html|<html[\s>])/i.test(fetched.text))
    ) {
      throw new Error(
        "That link returned a web page, not a transcript file. Paste the transcript text instead.",
      );
    }
    if (fetched.text.includes("\u0000")) {
      throw new Error("That link returned a binary file, not a transcript.");
    }

    const parsed = parseTranscript(fetched.text, {
      contentType: fetched.contentType,
      format: options.format,
      language: options.language,
    });
    return { parsed, sourceUrl: fetched.finalUrl };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, messageOf(error));
  }
}

function saveTranscriptOrThrow(
  db: Db,
  episodeId: number,
  parsed: ReturnType<typeof parseTranscript>,
  sourceUrl: string | null,
  origin: "feed" | "manual",
): StoredTranscript {
  try {
    return saveTranscript(db, episodeId, parsed, { sourceUrl, origin });
  } catch (error) {
    if (error instanceof TranscriptParseError) {
      throw new HttpError(422, error.message);
    }
    throw error;
  }
}

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, "That episode or podcast id is not valid.");
  }
  return id;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

async function readFeedDirect(url: string, fetchText: FetchText): Promise<ParsedFeed> {
  const fetched = await fetchText(url);
  if (!looksLikeFeed(fetched.text, fetched.contentType)) {
    throw new Error("That address did not return an RSS or Atom feed.");
  }
  return parseFeed(fetched.text);
}

export function createApp(db: Db, options: AppOptions = {}): express.Express {
  const app = express();
  const fetchText = options.fetchText ?? realFetchText;

  app.disable("x-powered-by");
  app.use(express.json({ limit: "6mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, version: "0.2.0", phase: 2 });
  });

  app.get("/api/meta", (_req, res) => {
    res.json({
      version: "0.2.0",
      phase: 2,
      dataDir: dataDir(),
      stats: getStats(db),
    });
  });

  // --- API-free discovery -------------------------------------------------

  app.get("/api/discovery/catalog", (req, res) => {
    const query = catalogQuerySchema.parse(req.query);
    const all = loadCatalog();
    const results = searchCatalog(all, query);
    const library = new Map(
      listPodcasts(db).map((podcast) => [podcast.feedUrl, podcast.id]),
    );

    res.json({
      podcasts: results.map((item) => ({
        ...item,
        inLibrary: library.has(item.feedUrl),
        libraryId: library.get(item.feedUrl) ?? null,
      })),
      categories: catalogCategories(all),
      total: results.length,
    });
  });

  app.post("/api/discovery/resolve", async (req, res) => {
    const body = z.object({ url: urlSchema }).parse(req.body);
    let resolved;
    try {
      resolved = await resolveFeedUrl(body.url, fetchText);
    } catch (error) {
      throw new HttpError(422, messageOf(error));
    }
    res.json({
      feedUrl: resolved.feedUrl,
      feed: previewFeed(resolved.feed),
    });
  });

  // --- Library ------------------------------------------------------------

  app.get("/api/podcasts", (_req, res) => {
    res.json({ podcasts: listPodcasts(db) });
  });

  app.post("/api/podcasts", async (req, res) => {
    const body = z.object({ feedUrl: urlSchema }).parse(req.body);

    let resolved;
    try {
      resolved = await resolveFeedUrl(body.feedUrl, fetchText);
    } catch (error) {
      throw new HttpError(422, messageOf(error));
    }

    if (findPodcastByFeedUrl(db, resolved.feedUrl)) {
      throw new AlreadyExistsError();
    }

    let podcast;
    try {
      podcast = addPodcast(db, resolved.feedUrl, resolved.feed);
    } catch (error) {
      if (error instanceof AlreadyExistsError) throw error;
      throw new HttpError(422, messageOf(error));
    }
    res.status(201).json({ podcast });
  });

  app.get("/api/podcasts/:id", (req, res) => {
    const podcast = getPodcast(db, parseId(req.params.id));
    if (!podcast) throw new HttpError(404, "That podcast is not in your library.");
    res.json({ podcast });
  });

  app.post("/api/podcasts/:id/refresh", async (req, res) => {
    const id = parseId(req.params.id);
    const existing = getPodcast(db, id);
    if (!existing) throw new HttpError(404, "That podcast is not in your library.");

    let feed;
    try {
      feed = await readFeedDirect(existing.feedUrl, fetchText);
    } catch (error) {
      throw new HttpError(422, `Could not refresh this feed. ${messageOf(error)}`);
    }

    const podcast = refreshPodcast(db, id, feed);
    if (!podcast) throw new HttpError(404, "That podcast is not in your library.");
    res.json({ podcast });
  });

  app.delete("/api/podcasts/:id", (req, res) => {
    const removed = deletePodcast(db, parseId(req.params.id));
    if (!removed) throw new HttpError(404, "That podcast is not in your library.");
    res.status(204).end();
  });

  // --- Episodes and progress ---------------------------------------------

  app.get("/api/episodes", (req, res) => {
    const query = episodeQuerySchema.parse(req.query);
    res.json(listEpisodes(db, query));
  });

  app.get("/api/episodes/:id", (req, res) => {
    const episode = getEpisode(db, parseId(req.params.id));
    if (!episode) throw new HttpError(404, "That episode could not be found.");
    res.json({ episode });
  });

  // --- Transcripts --------------------------------------------------------

  app.get("/api/episodes/:id/transcript", (req, res) => {
    const episode = getEpisode(db, parseId(req.params.id));
    if (!episode) throw new HttpError(404, "That episode could not be found.");
    res.json({ transcript: getTranscript(db, episode.id) });
  });

  app.post("/api/episodes/:id/transcript", async (req, res) => {
    const episode = getEpisode(db, parseId(req.params.id));
    if (!episode) throw new HttpError(404, "That episode could not be found.");

    const body = transcriptImportSchema.parse(req.body);
    const source = body.source ?? (body.text ? "text" : body.url ? "url" : "feed");
    const language = body.language ?? null;

    let parsed;
    let sourceUrl: string | null = null;
    let origin: "feed" | "manual" = "manual";

    if (source === "feed") {
      if (!episode.transcriptUrl) {
        throw new HttpError(
          422,
          "This episode does not advertise a transcript. Paste one manually or add a transcript address.",
        );
      }
      const loaded = await loadTranscriptFromUrl(episode.transcriptUrl, fetchText, {
        format: body.format,
        language,
      });
      parsed = loaded.parsed;
      sourceUrl = loaded.sourceUrl;
      origin = "feed";
    } else if (source === "url") {
      if (!body.url) {
        throw new HttpError(400, "Paste a transcript address first.");
      }
      const loaded = await loadTranscriptFromUrl(body.url, fetchText, {
        format: body.format,
        language,
      });
      parsed = loaded.parsed;
      sourceUrl = loaded.sourceUrl;
      origin = "manual";
    } else {
      if (!body.text) {
        throw new HttpError(400, "Paste a transcript first.");
      }
      try {
        parsed = parseTranscript(body.text, {
          format: body.format,
          language,
        });
      } catch (error) {
        if (error instanceof TranscriptParseError) {
          throw new HttpError(422, error.message);
        }
        throw error;
      }
      origin = "manual";
    }

    const transcript = saveTranscriptOrThrow(db, episode.id, parsed, sourceUrl, origin);
    res.status(201).json({ transcript });
  });

  app.delete("/api/episodes/:id/transcript", (req, res) => {
    const episode = getEpisode(db, parseId(req.params.id));
    if (!episode) throw new HttpError(404, "That episode could not be found.");
    deleteTranscript(db, episode.id);
    res.status(204).end();
  });

  app.put("/api/episodes/:id/progress", (req, res) => {
    const id = parseId(req.params.id);
    const body = progressSchema.parse(req.body);
    const progress = saveProgress(db, id, body.positionMs, body.status);
    if (!progress) throw new HttpError(404, "That episode could not be found.");
    res.json({ progress });
  });

  // --- Home summary -------------------------------------------------------

  app.get("/api/home", (_req, res) => {
    const recent = listEpisodes(db, { limit: 10 });
    res.json({
      stats: getStats(db),
      continueListening: listContinueListening(db, 4),
      recent: recent.episodes,
      podcasts: listPodcasts(db).slice(0, 6),
    });
  });

  // API routes are done. Anything else under /api is a real 404.
  app.use("/api", (_req, _res, next) => {
    next(new HttpError(404, "That API route does not exist."));
  });

  // --- Optional production static files -----------------------------------

  const defaultWebDist = fileURLToPath(new URL("../../web/dist", import.meta.url));
  const webDist = options.webDist === undefined ? defaultWebDist : options.webDist;
  if (webDist && fs.existsSync(path.join(webDist, "index.html"))) {
    app.use(express.static(webDist));
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(webDist, "index.html"));
    });
  } else if (options.webDist === undefined) {
    app.get("/", (_req, res) => {
      res
        .status(200)
        .type("text/plain")
        .send(
          "Podcast Language Studio API is running. Start the web app with `npm run dev:web`, or build it with `npm run build`.",
        );
    });
  }

  // --- Errors -------------------------------------------------------------

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (payloadTooLarge(error)) {
      res.status(413).json({
        error: "That transcript is too large. The limit is about 4 MB of text.",
      });
      return;
    }
    if (error instanceof ZodError) {
      const first = error.issues[0];
      res.status(400).json({
        error: first ? `${first.path.join(".") || "Request"}: ${first.message}` : "Invalid request.",
      });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof AlreadyExistsError) {
      res.status(409).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Something went wrong on the local server." });
  });

  return app;
}
