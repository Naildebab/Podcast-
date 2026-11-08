import { describe, expect, it } from "vitest";
import { extractFeedLinks } from "../src/discovery.js";
import { looksLikeFeed, parseDuration, parseFeed } from "../src/rss.js";
import { SAMPLE_ATOM, SAMPLE_RSS, SAMPLE_SITE } from "./fixtures.js";

describe("parseFeed", () => {
  it("reads channel metadata and audio episodes", () => {
    const feed = parseFeed(SAMPLE_RSS);
    expect(feed.title).toBe("Test English Show");
    expect(feed.description).toBe("A show for & about testing.");
    expect(feed.author).toBe("Test Host");
    expect(feed.imageUrl).toBe("https://example.com/cover.jpg");
    expect(feed.websiteUrl).toBe("https://example.com/show");
    expect(feed.language).toBe("en");
    expect(feed.episodes).toHaveLength(2);
  });

  it("decodes entities, strips HTML, and parses durations", () => {
    const feed = parseFeed(SAMPLE_RSS);
    const first = feed.episodes[0];
    expect(first?.title).toBe("Episode One & Friends");
    expect(first?.description).toBe("Hello world & friends.");
    expect(first?.durationSec).toBe(754);
    expect(first?.publishedAt).toBe("2024-10-01T10:00:00.000Z");
  });

  it("keeps transcript links and skips items without audio", () => {
    const feed = parseFeed(SAMPLE_RSS);
    expect(feed.episodes[0]?.transcriptUrl).toBe("https://example.com/one.vtt");
    expect(feed.episodes[0]?.transcriptType).toBe("text/vtt");
    expect(feed.episodes[1]?.transcriptUrl).toBeNull();
  });

  it("supports Atom feeds with enclosure links", () => {
    const feed = parseFeed(SAMPLE_ATOM);
    expect(feed.title).toBe("Atom Audio Show");
    expect(feed.author).toBe("Atom Host");
    expect(feed.episodes).toHaveLength(1);
    expect(feed.episodes[0]?.audioUrl).toBe("https://example.com/audio/atom.mp3");
    expect(feed.episodes[0]?.durationSec).toBe(310);
  });

  it("rejects documents that are not feeds", () => {
    expect(() => parseFeed("<html><body>hello</body></html>")).toThrow(
      /does not look like an RSS or Atom podcast feed/i,
    );
  });
});

describe("parseDuration", () => {
  it("handles seconds, minutes, and hours", () => {
    expect(parseDuration("42")).toBe(42);
    expect(parseDuration("12:34")).toBe(754);
    expect(parseDuration("1:02:03")).toBe(3723);
  });

  it("rejects junk", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("hello")).toBeNull();
    expect(parseDuration("1:2:3:4")).toBeNull();
  });
});

describe("extractFeedLinks", () => {
  it("prefers RSS over Atom and resolves relative URLs", () => {
    const links = extractFeedLinks(SAMPLE_SITE, "https://example.com/show");
    expect(links[0]).toBe("https://example.com/feed.xml");
    expect(links).toContain("https://example.com/comments/feed");
    expect(links).toContain("https://example.com/atom.xml");
  });

  it("returns nothing for a page without discovery links", () => {
    expect(extractFeedLinks("<html><head></head></html>", "https://example.com")).toEqual(
      [],
    );
  });
});

describe("looksLikeFeed", () => {
  it("recognises XML content types and feed declarations", () => {
    expect(looksLikeFeed("", "application/rss+xml")).toBe(true);
    expect(looksLikeFeed('<?xml version="1.0"?><rss></rss>', "text/plain")).toBe(true);
    expect(looksLikeFeed("<!doctype html>", "text/html")).toBe(false);
  });
});
