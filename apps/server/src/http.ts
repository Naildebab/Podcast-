import dns from "node:dns/promises";
import net from "node:net";

export interface FetchedText {
  text: string;
  finalUrl: string;
  contentType: string;
}

export interface FetchOptions {
  /** Upper bound for the response body. Defaults to 20 MB. */
  maxBytes?: number;
  /** Request timeout. Defaults to 20 seconds. */
  timeoutMs?: number;
  /** Custom Accept header for a specific kind of resource. */
  accept?: string;
}

export type FetchText = (url: string, options?: FetchOptions) => Promise<FetchedText>;

const MAX_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;
const DEFAULT_ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*";

/**
 * Local apps can be tricked into fetching internal addresses. Reject
 * loopback, private, link-local, and unique-local targets before every
 * request, including redirects.
 */
const blocked = new net.BlockList();
blocked.addSubnet("10.0.0.0", 8, "ipv4");
blocked.addSubnet("172.16.0.0", 12, "ipv4");
blocked.addSubnet("192.168.0.0", 16, "ipv4");
blocked.addSubnet("127.0.0.0", 8, "ipv4");
blocked.addSubnet("169.254.0.0", 16, "ipv4");
blocked.addSubnet("0.0.0.0", 8, "ipv4");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");

function isBlockedAddress(address: string, family: number): boolean {
  return blocked.check(address, family === 6 ? "ipv6" : "ipv4");
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Please enter a complete http:// or https:// address.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http:// and https:// addresses are supported.");
  }

  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "[::1]"
  ) {
    throw new Error("For safety, this app does not fetch local or private network addresses.");
  }

  const literalFamily = net.isIP(host);
  if (literalFamily !== 0) {
    if (isBlockedAddress(host, literalFamily)) {
      throw new Error("For safety, this app does not fetch local or private network addresses.");
    }
    return url;
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new Error("That address could not be found. Check the spelling and try again.");
  }

  if (addresses.length === 0) {
    throw new Error("That address could not be found. Check the spelling and try again.");
  }
  if (addresses.some((entry) => isBlockedAddress(entry.address, entry.family))) {
    throw new Error("For safety, this app does not fetch local or private network addresses.");
  }

  return url;
}

export const realFetchText: FetchText = async (
  input: string,
  options: FetchOptions = {},
): Promise<FetchedText> => {
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const accept = options.accept ?? DEFAULT_ACCEPT;
  let current = await assertPublicUrl(input);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual",
      headers: {
        "User-Agent": "PodcastLanguageStudio/0.2 (+local personal podcast app)",
        Accept: accept,
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) {
        throw new Error("The server redirected without a destination.");
      }
      if (hop === MAX_REDIRECTS) {
        throw new Error("That address redirected too many times.");
      }
      // Validate every hop, not only the original URL. This prevents a public
      // page from bouncing the local server onto a private network address.
      current = await assertPublicUrl(new URL(location, current).href);
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`The server answered with an error (HTTP ${response.status}).`);
    }

    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("That file is too large to read safely.");
    }

    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > maxBytes) {
      throw new Error("That file is too large to read safely.");
    }

    return {
      text: body,
      finalUrl: current.href,
      contentType: response.headers.get("content-type") ?? "",
    };
  }

  throw new Error("That address redirected too many times.");
};
