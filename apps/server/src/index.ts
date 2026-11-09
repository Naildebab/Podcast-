import { createApp } from "./app.js";
import { dataDir, HOST, PORT } from "./config.js";
import { openDb } from "./db.js";
import { closeDictionary, dictionaryStatus } from "./dictionary.js";
import { shutdownTranscriptions, whisperStatus } from "./whisper.js";

const db = openDb();
const app = createApp(db);
const whisper = whisperStatus();
const dictionary = dictionaryStatus();

const server = app.listen(PORT, HOST, () => {
  console.log(`Podcast Language Studio API: http://${HOST}:${PORT}`);
  console.log(`Local data: ${dataDir()}`);
  console.log(
    whisper.available
      ? `Whisper: ${whisper.engine} (${whisper.model}, ${whisper.device})`
      : `Whisper: unavailable — ${whisper.reason}`,
  );
  console.log(
    dictionary.available
      ? `Dictionary: ${dictionary.entries?.toLocaleString() ?? "?"} entries from ${dictionary.source}`
      : `Dictionary: unavailable — ${dictionary.error}`,
  );
});

function shutdown(signal: string): void {
  console.log(`\n${signal} received. Closing the local database...`);
  shutdownTranscriptions();
  closeDictionary();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
