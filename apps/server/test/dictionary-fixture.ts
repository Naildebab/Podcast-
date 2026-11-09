import Database from "better-sqlite3";

/**
 * A tiny stand-in for the borrowed Wiktionary extract. Tests use this instead
 * of the real dictionary so they stay deterministic and fast.
 */
export function createTestDictionary(file: string): Database.Database {
  const dictionary = new Database(file);
  dictionary.exec(`
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY,
      word TEXT NOT NULL,
      word_lc TEXT NOT NULL,
      pos TEXT NOT NULL,
      ipa TEXT,
      definitions TEXT NOT NULL,
      arabic TEXT,
      lemma TEXT
    );
    CREATE TABLE forms (
      form_lc TEXT NOT NULL,
      lemma_lc TEXT NOT NULL,
      PRIMARY KEY (form_lc, lemma_lc)
    ) WITHOUT ROWID;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  const insertEntry = dictionary.prepare(
    `INSERT INTO entries (id, word, word_lc, pos, ipa, definitions, arabic, lemma)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertEntry.run(
    1,
    "podcast",
    "podcast",
    "noun",
    "/ˈpɑdˌkæst/",
    JSON.stringify(["A program delivered over the Internet."]),
    JSON.stringify(["بُودْكَاسْت"]),
    null,
  );
  insertEntry.run(
    2,
    "run",
    "run",
    "verb",
    "/ɹʌn/",
    JSON.stringify(["To move quickly on foot."]),
    null,
    null,
  );
  insertEntry.run(
    3,
    "running",
    "running",
    "verb",
    "/ˈɹʌnɪŋ/",
    JSON.stringify(["present participle of run"]),
    null,
    "run",
  );

  const insertForm = dictionary.prepare("INSERT INTO forms (form_lc, lemma_lc) VALUES (?, ?)");
  for (const [form, lemma] of [
    ["podcasts", "podcast"],
    ["podcasted", "podcast"],
    ["run", "run"],
    ["runs", "run"],
    ["ran", "run"],
    ["running", "run"],
  ] as const) {
    insertForm.run(form, lemma);
  }

  const insertMeta = dictionary.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
  insertMeta.run("entries", "3");
  insertMeta.run("source", "Wiktionary test extract");
  insertMeta.run("licence", "CC BY-SA 4.0 (and GFDL)");
  return dictionary;
}
