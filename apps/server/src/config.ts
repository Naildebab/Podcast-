import os from "node:os";
import path from "node:path";
import fs from "node:fs";

/**
 * Runtime data lives outside the repository and outside the old project's
 * data folder. This keeps the new studio and the earlier prototype separate.
 */
export function dataDir(): string {
  const dir =
    process.env.PODCAST_STUDIO_DATA ??
    path.join(os.homedir(), ".local", "share", "podcast-plus");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const PORT = Number(process.env.PORT ?? 3010);
export const HOST = process.env.HOST ?? "127.0.0.1";
