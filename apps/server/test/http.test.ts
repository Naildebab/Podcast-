import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPublicUrl, realFetchText } from "../src/http.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("assertPublicUrl", () => {
  it("allows a public literal address", async () => {
    await expect(assertPublicUrl("https://93.184.216.34/feed.xml")).resolves.toBeInstanceOf(
      URL,
    );
  });

  it.each([
    "http://localhost/feed",
    "http://127.0.0.1/feed",
    "http://10.1.2.3/feed",
    "http://192.168.1.5/feed",
    "http://169.254.169.254/latest/meta-data",
    "http://0.0.0.0/feed",
    "http://[::1]/feed",
    "http://printer.local/feed",
  ])("rejects local or private address %s", async (address) => {
    await expect(assertPublicUrl(address)).rejects.toThrow(/private|local/i);
  });

  it("rejects non-http protocols", async () => {
    await expect(assertPublicUrl("ftp://example.com/feed")).rejects.toThrow(/http/i);
  });

  it("rejects malformed addresses", async () => {
    await expect(assertPublicUrl("not a url")).rejects.toThrow(/complete/i);
  });
});

describe("realFetchText", () => {
  it("reads a public response", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response("<rss></rss>", {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      }),
    );
    vi.stubGlobal("fetch", mock);

    const result = await realFetchText("https://93.184.216.34/feed.xml");
    expect(result.text).toBe("<rss></rss>");
    expect(result.contentType).toBe("application/rss+xml");
    expect(result.finalUrl).toBe("https://93.184.216.34/feed.xml");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("follows a public redirect and reports the final address", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: "/final.xml" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("<rss></rss>", {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        }),
      );
    vi.stubGlobal("fetch", mock);

    const result = await realFetchText("https://93.184.216.34/feed.xml");
    expect(result.finalUrl).toBe("https://93.184.216.34/final.xml");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("refuses to follow a redirect onto a private address", async () => {
    const mock = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1:3010/api/meta" },
      }),
    );
    vi.stubGlobal("fetch", mock);

    await expect(realFetchText("https://93.184.216.34/feed.xml")).rejects.toThrow(
      /private|local/i,
    );
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("stops after too many redirects", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "/loop" },
      }),
    );
    vi.stubGlobal("fetch", mock);

    await expect(realFetchText("https://93.184.216.34/feed.xml")).rejects.toThrow(
      /too many/i,
    );
  });
});
