import type { FetchText } from "./http.js";
import { looksLikeFeed, parseFeed, type ParsedEpisode, type ParsedFeed } from "./rss.js";

export interface ResolvedFeed {
  feedUrl: string;
  feed: ParsedFeed;
}

export interface FeedPreview extends Omit<ParsedFeed, "episodes"> {
  episodes: ParsedEpisode[];
  episodeCount: number;
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    if (!name) continue;
    attrs[name] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

/**
 * Find RSS/Atom discovery links in a normal website page. This is the
 * standards-based path (`<link rel="alternate">`) that podcast sites publish
 * for feed readers; no scraping or proprietary API is involved.
 */
export function extractFeedLinks(html: string, baseUrl: string): string[] {
  const links: { url: string; rank: number }[] = [];

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/);
    if (!rel.includes("alternate")) continue;

    const type = (attrs.type ?? "").toLowerCase();
    const href = attrs.href ?? "";
    if (!href) continue;

    let rank = -1;
    if (type.includes("rss+xml")) rank = 0;
    else if (type.includes("atom+xml")) rank = 1;
    else if (type.includes("rdf+xml")) rank = 2;
    if (rank === -1) continue;

    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        links.push({ url: resolved.href, rank });
      }
    } catch {
      // Ignore malformed discovery links and keep looking.
    }
  }

  const seen = new Set<string>();
  return links
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.url)
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, 5);
}

function friendlyFetchError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return "The server took too long to answer. Try again in a moment.";
    }
    return error.message;
  }
  return "The feed could not be read.";
}

/**
 * Accept either a feed URL or the public website of a podcast. For a website,
 * follow its declared RSS/Atom discovery links. Never guesses URLs like
 * /feed by brute force.
 */
export async function resolveFeedUrl(
  input: string,
  fetchText: FetchText,
): Promise<ResolvedFeed> {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Paste a complete address starting with http:// or https://.");
  }

  let first;
  try {
    first = await fetchText(trimmed);
  } catch (error) {
    throw new Error(friendlyFetchError(error));
  }

  if (looksLikeFeed(first.text, first.contentType)) {
    try {
      return { feedUrl: first.finalUrl, feed: parseFeed(first.text) };
    } catch (error) {
      throw new Error(
        `That address returned a file, but not a usable podcast feed: ${friendlyFetchError(error)}`,
      );
    }
  }

  const candidates = extractFeedLinks(first.text, first.finalUrl);
  if (candidates.length === 0) {
    throw new Error(
      "That page does not advertise an RSS feed. Try the podcast's RSS address, or add a different website.",
    );
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const next = await fetchText(candidate);
      if (!looksLikeFeed(next.text, next.contentType)) continue;
      return { feedUrl: next.finalUrl, feed: parseFeed(next.text) };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `The page advertises a feed, but it could not be read. ${
      lastError instanceof Error ? lastError.message : ""
    }`.trim(),
  );
}

/** Keep previews small; the full feed is fetched again when the user adds it. */
export function previewFeed(feed: ParsedFeed, limit = 8): FeedPreview {
  return {
    title: feed.title,
    description: feed.description,
    author: feed.author,
    imageUrl: feed.imageUrl,
    language: feed.language,
    websiteUrl: feed.websiteUrl,
    episodes: feed.episodes.slice(0, limit),
    episodeCount: feed.episodes.length,
  };
}
