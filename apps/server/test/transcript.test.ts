import { describe, expect, it } from "vitest";
import {
  detectTranscriptFormat,
  parseTranscript,
  transcriptFormatFrom,
  TranscriptParseError,
} from "../src/transcript.js";

describe("transcript formats", () => {
  it("recognizes feed types and file extensions", () => {
    expect(transcriptFormatFrom("text/vtt")).toBe("vtt");
    expect(transcriptFormatFrom("application/x-subrip")).toBe("srt");
    expect(transcriptFormatFrom("application/json")).toBe("json");
    expect(transcriptFormatFrom("text/plain; charset=utf-8")).toBe("text");
    expect(transcriptFormatFrom("text/html")).toBeNull();
  });

  it("detects WebVTT, SRT, JSON, and plain text", () => {
    expect(detectTranscriptFormat("WEBVTT\n\n00:00.000 --> 00:01.000\nHi")).toBe("vtt");
    expect(detectTranscriptFormat("1\n00:00:01,000 --> 00:00:02,000\nHi")).toBe("srt");
    expect(detectTranscriptFormat('{"segments":[]}')).toBe("json");
    expect(detectTranscriptFormat("Hello there.")).toBe("text");
  });
});

describe("parsing transcripts", () => {
  it("parses WebVTT cues, voices, tags, entities, and settings", () => {
    const parsed = parseTranscript(`WEBVTT

NOTE This note is ignored.

1
00:00:01.000 --> 00:00:03.500 align:start
<v Roger>Hello &amp; welcome.</v>

00:04.000 --> 00:06.000
Second <b>line</b>.
`);

    expect(parsed.format).toBe("vtt");
    expect(parsed.timed).toBe(true);
    expect(parsed.cues).toEqual([
      {
        startMs: 1000,
        endMs: 3500,
        speaker: "Roger",
        text: "Hello & welcome.",
      },
      {
        startMs: 4000,
        endMs: 6000,
        speaker: null,
        text: "Second line.",
      },
    ]);
  });

  it("parses SubRip cues and multiline text", () => {
    const parsed = parseTranscript(`1
00:00:01,000 --> 00:00:03,000
Hello
world

2
00:00:04,500 --> 00:00:06,000
Alice: Hi there
`);

    expect(parsed.format).toBe("srt");
    expect(parsed.cues).toEqual([
      {
        startMs: 1000,
        endMs: 3000,
        speaker: null,
        text: "Hello world",
      },
      {
        startMs: 4500,
        endMs: 6000,
        speaker: "Alice",
        text: "Hi there",
      },
    ]);
  });

  it("parses Podcasting 2.0 JSON with seconds and speakers", () => {
    const parsed = parseTranscript(
      JSON.stringify({
        version: "1.0.0",
        language: "en",
        segments: [
          { startTime: 1.5, endTime: 3, speaker: "Host", text: "Welcome." },
          { startTime: 4, endTime: 5, text: "Next part." },
        ],
      }),
    );

    expect(parsed.format).toBe("json");
    expect(parsed.language).toBe("en");
    expect(parsed.cues).toEqual([
      { startMs: 1500, endMs: 3000, speaker: "Host", text: "Welcome." },
      { startMs: 4000, endMs: 5000, speaker: null, text: "Next part." },
    ]);
  });

  it("understands timestamped plain text and keeps continuations together", () => {
    const parsed = parseTranscript(`[00:01] Hello there.
00:02:05 Second line.
Just a continuation.
`);

    expect(parsed.format).toBe("text");
    expect(parsed.timed).toBe(true);
    expect(parsed.cues).toEqual([
      {
        startMs: 1000,
        endMs: null,
        speaker: null,
        text: "Hello there.",
      },
      {
        startMs: 125_000,
        endMs: null,
        speaker: null,
        text: "Second line. Just a continuation.",
      },
    ]);
  });

  it("keeps untimed prose as paragraphs", () => {
    const parsed = parseTranscript(`First paragraph.

Second paragraph.

Alice: A short greeting.
`);

    expect(parsed.format).toBe("text");
    expect(parsed.timed).toBe(false);
    expect(parsed.cues).toEqual([
      { startMs: null, endMs: null, speaker: null, text: "First paragraph." },
      { startMs: null, endMs: null, speaker: null, text: "Second paragraph." },
      { startMs: null, endMs: null, speaker: "Alice", text: "A short greeting." },
    ]);
  });

  it("rejects empty and unreadable files", () => {
    expect(() => parseTranscript("   \n ")).toThrow(TranscriptParseError);
    expect(() => parseTranscript("WEBVTT\n\nNOTE only a note")).toThrow(
      /No readable cues/i,
    );
    expect(() => parseTranscript("{not json", { format: "json" })).toThrow(/valid JSON/i);
  });
});
