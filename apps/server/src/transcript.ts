export type TranscriptFormat = "vtt" | "srt" | "json" | "text";

export interface TranscriptCue {
  startMs: number | null;
  endMs: number | null;
  speaker: string | null;
  text: string;
}

export interface ParsedTranscript {
  format: TranscriptFormat;
  language: string | null;
  cues: TranscriptCue[];
  timed: boolean;
}

export interface TranscriptParseOptions {
  /** The format advertised by the feed or chosen by the user. */
  format?: TranscriptFormat;
  /** Used only when the caller could not provide a format. */
  contentType?: string;
  language?: string | null;
}

export class TranscriptParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptParseError";
  }
}

const MAX_CUES = 50_000;
const TIMESTAMP =
  /^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?(?:[.,](\d{1,3}))?$/;

/**
 * Turn a feed MIME type or file extension into one of the formats this app
 * understands. Returning null means "detect it from the content".
 */
export function transcriptFormatFrom(value: string | null | undefined): TranscriptFormat | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.includes("vtt") || lower.endsWith(".vtt")) return "vtt";
  if (lower.includes("srt") || lower.includes("subrip") || lower.endsWith(".srt")) return "srt";
  if (lower.includes("json") || lower.endsWith(".json")) return "json";
  if (lower.includes("text/plain") || lower.endsWith(".txt")) return "text";
  return null;
}

/**
 * Choose a parser from the file contents when the publisher's type is
 * missing or wrong. The caller can always override this with an explicit
 * format, which is what the import dialog does.
 */
export function detectTranscriptFormat(
  content: string,
  contentType?: string,
): TranscriptFormat {
  const text = content.replace(/^\uFEFF/, "").trimStart();

  if (/^WEBVTT(?:[ \t]|\r?\n|$)/i.test(text)) return "vtt";

  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(text);
      const segments =
        Array.isArray(parsed)
          ? parsed
          : isRecord(parsed)
            ? (parsed.segments ?? parsed.transcript ?? parsed.cues)
            : null;
      if (Array.isArray(segments)) return "json";
    } catch {
      // Not JSON; continue with the timed-text checks.
    }
  }

  if (text.includes("-->")) {
    // SubRip uses a comma before milliseconds; WebVTT uses a full stop.
    return /-->[^\n]*\d,\d{1,3}/.test(text) ||
      /^\s*\d+\s*\n\s*\d{1,2}:\d{2}:\d{2},\d{1,3}/m.test(text)
      ? "srt"
      : "vtt";
  }

  const fromType = transcriptFormatFrom(contentType);
  if (fromType) return fromType;

  return "text";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTimestamp(raw: string): number | null {
  const match = TIMESTAMP.exec(raw.trim().replace(/^\[|\]$/g, ""));
  if (!match) return null;

  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = match[3] === undefined ? null : Number(match[3]);
  const fraction = match[4] ?? "";
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  if (third !== null && !Number.isFinite(third)) return null;
  if (second > 59 || (third !== null && third > 59)) return null;

  const seconds = third === null ? first * 60 + second : first * 3600 + second * 60 + third;
  const millis = Number((fraction + "000").slice(0, 3));
  return Math.round(seconds * 1000 + (Number.isFinite(millis) ? millis : 0));
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) ? safeCodePoint(code, whole) : whole;
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? safeCodePoint(code, whole) : whole;
    }
    return named[lower] ?? whole;
  });
}

function safeCodePoint(code: number, fallback: string): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

function cleanText(value: string): string {
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * WebVTT supports `<v Speaker>...</v>` voice spans. Pull the speaker out
 * before stripping the remaining markup, and fall back to an obvious
 * "Speaker: text" prefix for ordinary pasted transcripts.
 */
function extractSpeaker(raw: string): { speaker: string | null; text: string } {
  let speaker: string | null = null;
  let text = raw;

  text = text.replace(
    /<v(?:\.[^ >]+)?\s+([^>]+)>([\s\S]*?)<\/v>/gi,
    (_whole, name: string, inner: string) => {
      speaker ??= cleanText(name);
      return inner;
    },
  );
  text = text.replace(
    /<v(?:\.[^ >]+)?\s+([^>]+)>/gi,
    (_whole, name: string) => {
      speaker ??= cleanText(name);
      return "";
    },
  );

  text = cleanText(text);
  if (!speaker) {
    const prefix = /^([A-Z][A-Za-z0-9 .'’\-]{0,40}):\s+(.+)$/.exec(text);
    if (prefix) {
      speaker = prefix[1]!.trim();
      text = prefix[2]!.trim();
    }
  }

  return { speaker: speaker || null, text };
}

function splitIntoBlocks(content: string): string[][] {
  const lines = content.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "").split("\n");
  const blocks: string[][] = [];
  let block: string[] = [];

  for (const line of lines) {
    if (line.trim() === "") {
      if (block.length > 0) {
        blocks.push(block);
        block = [];
      }
    } else {
      block.push(line);
    }
  }
  if (block.length > 0) blocks.push(block);
  return blocks;
}

function parseTimedSheet(content: string): TranscriptCue[] {
  const cues: TranscriptCue[] = [];

  for (const block of splitIntoBlocks(content)) {
    const timeIndex = block.findIndex((line) => line.includes("-->"));
    if (timeIndex < 0) continue;

    const line = block[timeIndex]!;
    const [left, right] = line.split("-->");
    if (!left || !right) continue;

    const start = parseTimestamp((left.trim().split(/\s+/)[0] ?? "").trim());
    const end = parseTimestamp((right.trim().split(/\s+/)[0] ?? "").trim());
    if (start === null) continue;

    const extracted = extractSpeaker(block.slice(timeIndex + 1).join("\n"));
    if (!extracted.text) continue;

    cues.push({
      startMs: start,
      endMs: end !== null && end > start ? end : null,
      speaker: extracted.speaker,
      text: extracted.text,
    });
  }

  return cues;
}

function numberToMs(value: unknown, key: string): number | null {
  if (typeof value === "string" && value.includes(":")) return parseTimestamp(value);
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const lower = key.toLowerCase();
  if (lower.endsWith("ms")) return Math.round(value);
  // Podcasting 2.0 uses seconds. A value above a day is almost certainly
  // milliseconds from a looser exporter; keep it readable rather than
  // turning it into a cue tens of hours away.
  return Math.round(value > 86_400 ? value : value * 1000);
}

function recordText(segment: Record<string, unknown>): string | null {
  const value = segment.text ?? segment.body ?? segment.transcript ?? segment.content;
  return typeof value === "string" ? value : null;
}

function parseJsonTranscript(content: string): { cues: TranscriptCue[]; language: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    throw new TranscriptParseError("That transcript is not valid JSON.");
  }

  const root = isRecord(parsed) ? parsed : null;
  const segments = Array.isArray(parsed)
    ? parsed
    : root
      ? (root.segments ?? root.transcript ?? root.cues)
      : null;

  if (!Array.isArray(segments)) {
    throw new TranscriptParseError(
      "That JSON transcript does not contain a segments, transcript, or cues list.",
    );
  }

  const cues: TranscriptCue[] = [];
  for (const item of segments) {
    if (!isRecord(item)) continue;
    const rawText = recordText(item);
    if (!rawText) continue;

    const startKey =
      item.startTime !== undefined ? "startTime" : item.startMs !== undefined ? "startMs" : "start";
    const endKey =
      item.endTime !== undefined ? "endTime" : item.endMs !== undefined ? "endMs" : "end";
    const start = numberToMs(item[startKey], startKey);
    const end = numberToMs(item[endKey], endKey);
    const extracted = extractSpeaker(rawText);
    if (!extracted.text) continue;

    const rawSpeaker = item.speaker ?? item.voice;
    const speaker =
      typeof rawSpeaker === "string"
        ? cleanText(rawSpeaker) || null
        : isRecord(rawSpeaker) && typeof rawSpeaker.name === "string"
          ? cleanText(rawSpeaker.name) || null
          : null;

    cues.push({
      startMs: start,
      endMs: end !== null && start !== null && end > start ? end : null,
      speaker: speaker ?? extracted.speaker,
      text: extracted.text,
    });
  }

  return {
    cues,
    language: root && typeof root.language === "string" ? root.language : null,
  };
}

/**
 * Plain text has no required timing. This parser understands common
 * timestamp-prefixed lines, and otherwise keeps blank-line-separated
 * paragraphs as untimed reading blocks.
 */
function parsePlainText(content: string): TranscriptCue[] {
  const lines = content.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "").split("\n");
  const cues: TranscriptCue[] = [];
  let timed: { startMs: number; lines: string[] } | null = null;
  let paragraph: string[] = [];

  const finishTimed = () => {
    if (!timed) return;
    const extracted = extractSpeaker(timed.lines.join(" "));
    if (extracted.text) {
      cues.push({
        startMs: timed.startMs,
        endMs: null,
        speaker: extracted.speaker,
        text: extracted.text,
      });
    }
    timed = null;
  };

  const finishParagraph = () => {
    const extracted = extractSpeaker(paragraph.join(" "));
    if (extracted.text) {
      cues.push({
        startMs: null,
        endMs: null,
        speaker: extracted.speaker,
        text: extracted.text,
      });
    }
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (timed) finishTimed();
      else if (paragraph.length > 0) finishParagraph();
      continue;
    }

    const stamped = /^(?:\[)?(\d{1,3}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)(?:\])?\s*(?:[-–—:]\s*)?(.+)$/.exec(
      line,
    );
    const start = stamped ? parseTimestamp(stamped[1] ?? "") : null;
    if (stamped && start !== null) {
      if (timed) finishTimed();
      if (paragraph.length > 0) finishParagraph();
      timed = { startMs: start, lines: [stamped[2] ?? ""] };
    } else if (timed) {
      timed.lines.push(line);
    } else {
      paragraph.push(line);
    }
  }

  finishTimed();
  finishParagraph();
  return cues;
}

function normalizeCues(cues: TranscriptCue[]): TranscriptCue[] {
  const normalized = cues
    .map((cue) => {
      const startMs = cue.startMs !== null && cue.startMs >= 0 ? Math.round(cue.startMs) : null;
      const endMs =
        cue.endMs !== null && cue.endMs >= 0 && (startMs === null || cue.endMs > startMs)
          ? Math.round(cue.endMs)
          : null;
      const text = cue.text.replace(/\s+/g, " ").trim();
      const speaker = cue.speaker?.replace(/\s+/g, " ").trim() || null;
      return { startMs, endMs, speaker, text };
    })
    .filter((cue) => cue.text.length > 0);

  normalized.sort((a, b) => {
    const left = a.startMs ?? Number.MAX_SAFE_INTEGER;
    const right = b.startMs ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  });

  if (normalized.length > MAX_CUES) {
    throw new TranscriptParseError(
      "That transcript has too many lines. Split it into smaller files and try again.",
    );
  }

  return normalized;
}

export function parseTranscript(
  content: string,
  options: TranscriptParseOptions = {},
): ParsedTranscript {
  const text = content.replace(/^\uFEFF/, "");
  if (!text.trim()) {
    throw new TranscriptParseError("That transcript is empty.");
  }

  const detected = detectTranscriptFormat(text, options.contentType);
  const format = options.format ?? detected;
  let actualFormat = format;
  let cues: TranscriptCue[] = [];
  let language = options.language ?? null;

  if (format === "vtt" || format === "srt") {
    cues = parseTimedSheet(text);
  } else if (format === "json") {
    const parsed = parseJsonTranscript(text);
    cues = parsed.cues;
    language = options.language ?? parsed.language;
  } else {
    cues = parsePlainText(text);
  }

  // A feed can advertise the wrong type (or a server can send the wrong
  // Content-Type). If the preferred parser found nothing, try the detected
  // format once before giving up.
  if (cues.length === 0 && options.format && options.format !== detected) {
    actualFormat = detected;
    if (detected === "vtt" || detected === "srt") {
      cues = parseTimedSheet(text);
    } else if (detected === "json") {
      const parsed = parseJsonTranscript(text);
      cues = parsed.cues;
      language = options.language ?? parsed.language;
    } else if (detected === "text") {
      cues = parsePlainText(text);
    }
  }

  const normalized = normalizeCues(cues);
  if (normalized.length === 0) {
    throw new TranscriptParseError(
      "No readable cues were found. Check that the file is WebVTT, SRT, Podcasting 2.0 JSON, or plain text.",
    );
  }

  return {
    format: actualFormat,
    language,
    cues: normalized,
    timed: normalized.some((cue) => cue.startMs !== null),
  };
}
