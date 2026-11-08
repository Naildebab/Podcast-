import { XMLParser } from "fast-xml-parser";

export interface ParsedEpisode {
  guid: string;
  title: string;
  description: string;
  audioUrl: string;
  imageUrl: string | null;
  publishedAt: string | null;
  durationSec: number | null;
  transcriptUrl: string | null;
  transcriptType: string | null;
}

export interface ParsedFeed {
  title: string;
  description: string;
  author: string;
  imageUrl: string | null;
  language: string | null;
  websiteUrl: string | null;
  episodes: ParsedEpisode[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

const asArray = <T>(value: unknown): T[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? (value as T[]) : [value as T];
};

/** Text from a node that may be a string, CDATA, or {"#text": "..."}. */
function text(node: unknown): string {
  if (node === undefined || node === null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (record["#text"] !== undefined) return String(record["#text"]);
    if (record["#cdata"] !== undefined) return String(record["#cdata"]);
  }
  return "";
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(x?)([0-9a-f]+);/gi, (_all, hex: string, digits: string) => {
      const code = Number.parseInt(digits, hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    });
}

function stripHtml(input: string): string {
  return decodeEntities(input)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attr(node: unknown, name: string): string {
  if (node && typeof node === "object") {
    const value = (node as Record<string, unknown>)[`@_${name}`];
    if (typeof value === "string") return value;
  }
  return "";
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** "1:02:03", "62:03", "3723" or "3723.5" to whole seconds. */
export function parseDuration(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length > 3 || parts.some((part) => !/^\d+(\.\d+)?$/.test(part))) {
    return null;
  }
  const seconds = parts
    .map(Number)
    .reduce((total, part) => total * 60 + part, 0);
  return Number.isFinite(seconds) ? Math.round(seconds) : null;
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Podcasting 2.0 transcript links. Prefer formats the app will support first:
 * WebVTT, then SRT, then JSON, then plain text.
 */
function pickTranscript(nodes: unknown[]): { url: string; type: string } | null {
  const rank = (type: string, url: string): number => {
    const t = type.toLowerCase();
    const u = url.toLowerCase().split("?")[0] ?? "";
    if (t.includes("vtt") || u.endsWith(".vtt")) return 0;
    if (t.includes("srt") || t.includes("subrip") || u.endsWith(".srt")) return 1;
    if (t.includes("json") || u.endsWith(".json")) return 2;
    if (t.startsWith("text/plain") || u.endsWith(".txt")) return 3;
    return 4;
  };

  const candidates = nodes
    .map((node) => ({ url: attr(node, "url"), type: attr(node, "type") }))
    .filter((candidate) => isHttpUrl(candidate.url));

  candidates.sort((a, b) => rank(a.type, a.url) - rank(b.type, b.url));
  return candidates[0] ?? null;
}

function feedImage(channel: Record<string, unknown>): string | null {
  const itunes = attr(channel["itunes:image"], "href");
  if (isHttpUrl(itunes)) return itunes;

  const imageNode = channel.image;
  if (typeof imageNode === "string" && isHttpUrl(imageNode)) return imageNode;
  if (imageNode && typeof imageNode === "object") {
    const url = text((imageNode as Record<string, unknown>).url);
    if (isHttpUrl(url)) return url;
    const href = attr(imageNode, "href");
    if (isHttpUrl(href)) return href;
  }
  return null;
}

function channelLink(channel: Record<string, unknown>): string | null {
  const raw = text(channel.link);
  if (isHttpUrl(raw)) return raw;
  const href = attr(channel.link, "href");
  return isHttpUrl(href) ? href : null;
}

function itemImage(item: Record<string, unknown>, fallback: string | null): string | null {
  const itunes = attr(item["itunes:image"], "href");
  if (isHttpUrl(itunes)) return itunes;
  const thumbnail = attr(item["media:thumbnail"], "url");
  if (isHttpUrl(thumbnail)) return thumbnail;
  return fallback;
}

function audioUrl(item: Record<string, unknown>): string {
  const enclosure = attr(item.enclosure, "url");
  if (isHttpUrl(enclosure)) return enclosure;

  // Some feeds use media:content instead of enclosure.
  for (const node of asArray(item["media:content"])) {
    const url = attr(node, "url");
    const type = attr(node, "type");
    const medium = attr(node, "medium");
    if (isHttpUrl(url) && (type.startsWith("audio/") || medium === "audio")) return url;
  }
  return "";
}

function parseRssChannel(channel: Record<string, unknown>): ParsedFeed {
  const title = stripHtml(text(channel.title));
  if (!title) throw new Error("The feed has no title.");

  const imageUrl = feedImage(channel);
  const language = stripHtml(text(channel.language) || text(channel["itunes:language"])) || null;
  const episodes: ParsedEpisode[] = [];

  for (const rawItem of asArray<Record<string, unknown>>(channel.item)) {
    const url = audioUrl(rawItem);
    if (!url) continue; // not an audio episode

    const guid = text(rawItem.guid) || attr(rawItem.guid, "isPermaLink") || url;
    const description = stripHtml(
      text(rawItem["content:encoded"]) ||
        text(rawItem.description) ||
        text(rawItem["itunes:summary"]),
    ).slice(0, 3000);
    const transcript = pickTranscript(asArray(rawItem["podcast:transcript"]));

    episodes.push({
      guid,
      title: stripHtml(text(rawItem.title)) || "Untitled episode",
      description,
      audioUrl: url,
      imageUrl: itemImage(rawItem, imageUrl),
      publishedAt: parseDate(text(rawItem.pubDate) || text(rawItem.published)),
      durationSec: parseDuration(text(rawItem["itunes:duration"])),
      transcriptUrl: transcript?.url ?? null,
      transcriptType: transcript?.type ?? null,
    });
  }

  return {
    title,
    description: stripHtml(
      text(channel.description) || text(channel["itunes:summary"]) || text(channel.subtitle),
    ).slice(0, 5000),
    author: stripHtml(
      text(channel["itunes:author"]) || text(channel.managingEditor) || text(channel.author),
    ),
    imageUrl,
    language,
    websiteUrl: channelLink(channel),
    episodes,
  };
}

function atomAuthor(node: unknown): string {
  if (typeof node === "string") return stripHtml(node);
  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    return stripHtml(text(record.name) || text(record));
  }
  return "";
}

function atomLink(entry: Record<string, unknown>, rel: string): string {
  for (const link of asArray(entry.link)) {
    if (attr(link, "rel") === rel) {
      const href = attr(link, "href");
      if (isHttpUrl(href)) return href;
    }
  }
  return "";
}

function parseAtomFeed(feed: Record<string, unknown>): ParsedFeed {
  const title = stripHtml(text(feed.title));
  if (!title) throw new Error("The feed has no title.");

  const imageUrl = (() => {
    const logo = text(feed.logo);
    if (isHttpUrl(logo)) return logo;
    const icon = text(feed.icon);
    return isHttpUrl(icon) ? icon : null;
  })();

  const episodes: ParsedEpisode[] = [];
  for (const entry of asArray<Record<string, unknown>>(feed.entry)) {
    const url = atomLink(entry, "enclosure");
    if (!url) continue;

    episodes.push({
      guid: text(entry.id) || url,
      title: stripHtml(text(entry.title)) || "Untitled episode",
      description: stripHtml(text(entry.summary) || text(entry.content)).slice(0, 3000),
      audioUrl: url,
      imageUrl,
      publishedAt: parseDate(text(entry.published) || text(entry.updated)),
      durationSec: parseDuration(text(entry["itunes:duration"])),
      transcriptUrl: null,
      transcriptType: null,
    });
  }

  return {
    title,
    description: stripHtml(text(feed.subtitle) || text(feed.description)).slice(0, 5000),
    author: atomAuthor(feed.author) || atomAuthor(feed["itunes:author"]),
    imageUrl,
    language: stripHtml(text(feed.language)) || null,
    websiteUrl: (() => {
      const href = atomLink(feed, "alternate");
      return href || null;
    })(),
    episodes,
  };
}

export function parseFeed(xml: string): ParsedFeed {
  let document: Record<string, any>;
  try {
    document = parser.parse(xml);
  } catch {
    throw new Error("This is not valid XML, so it cannot be a podcast feed.");
  }

  if (document?.rss?.channel) {
    return parseRssChannel(document.rss.channel as Record<string, unknown>);
  }
  if (document?.feed) {
    return parseAtomFeed(document.feed as Record<string, unknown>);
  }
  throw new Error("This does not look like an RSS or Atom podcast feed.");
}

/** A quick check before spending time on HTML feed discovery. */
export function looksLikeFeed(body: string, contentType: string): boolean {
  const type = contentType.toLowerCase();
  if (type.includes("rss") || type.includes("atom") || type.includes("xml")) return true;
  const start = body.trimStart().slice(0, 300).toLowerCase();
  return start.startsWith("<?xml") || start.startsWith("<rss") || start.startsWith("<feed");
}
