import { createApp } from "./app.js";
import { dataDir, HOST, PORT } from "./config.js";
import { openDb } from "./db.js";

const db = openDb();
const app = createApp(db);

const server = app.listen(PORT, HOST, () => {
  console.log(`Podcast Language Studio API: http://${HOST}:${PORT}`);
  console.log(`Local data: ${dataDir()}`);
});

function shutdown(signal: string): void {
  console.log(`\n${signal} received. Closing the local database...`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
