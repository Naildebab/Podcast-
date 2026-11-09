# Podcast Language Studio

A local-first podcast player for language learners. Phase 4 adds click-to-translate and a
vocabulary list on top of the listening foundation, transcripts, local Wiktionary
dictionary, and local Whisper transcription: import public RSS feeds, browse a hand-checked
catalog, play episodes in a persistent player, read along with publisher or imported
transcripts, click any word for its definition and Arabic translation, save words with
their source context, and transcribe an episode on your own CPU.

No account. No API keys. No analytics. Your library, listening positions, transcripts,
and vocabulary live in a SQLite file on your own computer; small display and playback
preferences stay in browser local storage. The dictionary and Whisper installation are
reused from their existing locations rather than copied into this project.

> Status: **Phase 4 — vocabulary and click-to-translate**. Shadowing, spaced repetition,
> and Android are planned for later phases. Labels in the interface say “Soon” when a
> feature is not built yet.

## What works

- **RSS and Atom import** — paste a feed URL or a podcast website. The server follows the
  page's declared `<link rel="alternate" type="application/rss+xml">` and validates the
  feed before saving anything.
- **Curated discovery** — 13 hand-checked public feeds across English learning, culture,
  news, and technology. Search, filter by category and level, and preview the newest
  episodes without adding the show.
- **Local library** — add, refresh, and remove podcasts. Episodes and their progress are
  stored locally; removing a podcast deletes its saved episodes and positions.
- **Persistent global player** — play/pause, seek, ±15/30-second skips, speed (0.75–2×),
  volume, mute, keyboard shortcuts, Media Session metadata, and a mini player that follows
  you between pages.
- **Resume and progress** — the position is saved every few seconds, on pause, on seek,
  when the page is hidden, and when playback ends. “Continue listening” on Home uses the
  same local progress table.
- **Episode library** — search all saved episodes, filter by progress, and page through
  large feeds without rendering thousands of rows at once.
- **Transcripts** — load a transcript advertised by a feed, or import your own WebVTT,
  SubRip, Podcasting 2.0 JSON, or plain-text file. Timed transcripts highlight the current
  line, scroll with playback, and let you click a timestamp to seek. Untimed text is kept
  as a reading view. Transcripts are stored locally and fetched only when you ask.
- **Click-to-translate** — click any word in a transcript to pause the audio and open a
  translation panel with the English definition, word type, IPA, Arabic translation, and
  the sentence where you found it. Clicking another word updates the panel without
  restarting playback. Closing the panel resumes the exact paused position only if the
  podcast was playing before the first word was clicked.
- **Vocabulary** — save words from the translation panel or the Dictionary page. Each
  entry keeps its dictionary data, source episode, timestamp, context sentence, note, and
  a simple New / Learning / Known status. The Vocabulary page supports search, filtering,
  editing notes, and removal.
- **Local dictionary** — search the existing Wiktionary SQLite database for definitions,
  IPA, Arabic translations, and available word forms. It is opened read-only; no lookup
  leaves the computer.
- **Local Whisper transcription** — start an explicit transcription job for an episode.
  The server downloads the audio to a temporary folder, runs the existing Whisper CLI on
  CPU, parses its WebVTT output, saves timestamped cues locally, and deletes the temporary
  audio. The job can be followed or cancelled in the transcript panel.
- **Resource status** — Settings shows whether the Whisper executable/model and dictionary
  database are available, which paths are being used, and how to override them.
- **Light / dark / system theme** — applied before paint to avoid a flash, and remembered
  in local storage.
- **Responsive interface** — desktop sidebar, mobile top navigation, bottom mini player,
  and layouts that work down to phone widths.
- **Local server hardening** — private, loopback, and link-local addresses are rejected
  before every request, including each redirect hop. Feed downloads are capped at 20 MB
  and transcript downloads at 4 MB; requests time out after 20 seconds.

## Transcripts

Transcripts are deliberately **on demand**. Opening an episode page does not contact the
publisher for a transcript. If the feed advertises one, you choose “Load transcript”; the
server fetches it through the same SSRF-safe path, parses it, and stores the cues in
SQLite. Later visits read the local copy.

Supported inputs:

- WebVTT (`.vtt`), including voice tags and cue settings
- SubRip (`.srt`)
- Podcasting 2.0 JSON (`segments` with `startTime`, `endTime`, `speaker`, and `text`)
- Plain text, including optional timestamp prefixes such as `[00:01:20]`

The episode page highlights the active timed line, optionally scrolls with playback, and
lets you click a timestamp to seek there. If the episode is not loaded yet, clicking a cue
starts it at that point. Untimed transcripts remain readable but do not follow the audio.
You can search the transcript, reload it from its source, replace it with an imported file,
or remove the local copy.

The importer accepts pasted text or a file up to 4 MB. Publisher HTML transcript pages are
not scraped; the app explains that limitation and keeps the manual import path available.

## Click-to-translate and vocabulary

Words in a transcript are marked with a dotted underline. Clicking one:

1. pauses the current audio immediately;
2. looks up the word in the local dictionary;
3. opens a non-modal panel with definitions, word type, IPA, Arabic translations, and the
   transcript sentence as the example context.

The panel is intentionally non-modal so you can click another word while it is open. A
playback lock in the global player blocks play, seeking, media-session playback/seek, and
keyboard controls until the panel closes. The lock records whether audio was actually
playing before the first word click:

- If it was playing, closing with the X, Escape, or a click outside the panel resumes the
  same audio element from the exact paused timestamp.
- If it was already paused, closing leaves it paused.
- Clicking another word while the panel is open only updates the translation; it does not
  change the resume decision and never restarts the episode.

The panel’s “Save word” button stores the word with its dictionary entry, episode id,
timestamp, and context sentence. You can also save dictionary entries directly from the
Dictionary page. Saved words appear on the Vocabulary page, where you can search, filter
by status, write a note, and delete entries. Vocabulary is stored in this app’s SQLite
database, not in the borrowed Wiktionary file.

## Existing local language tools

This project does not install, download, copy, or rebuild Whisper models or dictionary
data. It deliberately reuses the two resources already present on this computer. Both
paths are configurable, and the application reports a clear unavailable state if either
one is missing.

### OpenAI Whisper

- Executable: `/home/nail/whisper-env/bin/whisper` by default.
- Model cache: `/home/nail/.cache/whisper` by default; the cached `base.en.pt` model is used.
- How a job runs: the server downloads the episode audio to a temporary OS folder, runs
  the existing CLI with `--device cpu`, `--task transcribe`, and `--output_format vtt`,
  then parses that VTT and stores the cues in this app's SQLite database. The temporary
  audio and VTT are deleted when the job finishes.
- No model is downloaded by this app. If the selected model is not already cached, the
  transcription starts with a clear error instead of fetching weights.
- `base.en` is English-only. Set `PODCAST_WHISPER_MODEL` to a multilingual model that is
  already cached before choosing another language.
- Only one job per episode is active at a time. Job status is kept in server memory; a
  server restart does not keep a running job alive. Completed transcripts are saved and
  remain available.
- Verified with the existing `openai-whisper 20250625`, `torch 2.15.0+cpu`, `base.en`
  model, and system `ffmpeg 6.1.1`. The application never upgrades or modifies that
  virtual environment.

### Wiktionary dictionary

- Database: `/home/nail/.local/share/podcast-language-studio/dictionary.db` by default.
- It is opened with SQLite read-only mode and `query_only`, so lookups cannot modify,
  delete, or rebuild it.
- Lookups return definitions, IPA, Arabic translations when present, and forms collected
  from the database's `forms` table. The database contains about 1.16 million entries and
  579,000 forms.
- Data source: Wiktionary, extracted by Wiktextract (kaikki.org). License: CC BY-SA 4.0
  and GFDL. The source and license are shown in the Dictionary page and Settings.
- The app does not create a second dictionary file or copy data into its own database.

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `PODCAST_DICTIONARY_DB` | `~/.local/share/podcast-language-studio/dictionary.db` | Read-only dictionary database |
| `PODCAST_WHISPER_BIN` | `~/whisper-env/bin/whisper` | Existing Whisper executable or command name |
| `PODCAST_WHISPER_MODEL` | `base.en` | Cached model name, without `.pt` |
| `PODCAST_WHISPER_MODEL_DIR` | `~/.cache/whisper` | Folder containing the cached model |
| `PODCAST_WHISPER_DEVICE` | `cpu` | Whisper device (`cpu` or a supported GPU device) |
| `PODCAST_WHISPER_LANGUAGE` | `en` | Default transcription language |
| `PODCAST_WHISPER_THREADS` | `4` | CPU threads passed to Whisper |
| `PODCAST_WHISPER_MAX_AUDIO_BYTES` | `262144000` (250 MB) | Safety cap for temporary audio |
| `PODCAST_WHISPER_DOWNLOAD_TIMEOUT_MS` | `300000` (5 min) | Temporary audio download timeout |
| `PODCAST_WHISPER_TIMEOUT_MS` | `3600000` (1 hour) | Maximum Whisper process time |

## Not built yet

These are honest Phase 4 boundaries, not hidden buttons:

- Automatic transcription on episode open (transcription is always explicit)
- Cloud transcription, translation, or dictionary APIs
- Scraping arbitrary HTML transcript pages (paste the text instead)
- Spaced-repetition scheduling and generated study sheets (the Vocabulary page is a
  simple status list, not an SRS system)
- Shadowing and local recording (Phase 5)
- OPML import/export
- Offline audio downloads (temporary transcription audio is deleted)
- Android app
- A podcast directory API or scraping of sites that block automated requests
- Editing or adding entries in the borrowed dictionary database

## Requirements

- Node.js **20 or newer** (the project was developed and tested on Node 24)
- A modern browser with HTML audio support
- Linux, macOS, or Windows. The data path defaults to a Linux-style `~/.local/share`
  location; set `PODCAST_STUDIO_DATA` on other systems if you prefer another folder.
- Optional, for the local tools: an existing OpenAI Whisper environment with a cached
  model, and an existing `dictionary.db` created by Wiktextract. The rest of the app works
  without them; the dictionary page and transcribe button report the missing resource
  instead of pretending it exists.

## Quick start

```bash
npm install
npm run build
npm start
```

Open <http://127.0.0.1:3010>.

The first run creates the database automatically. `npm start` serves the built web app and
the API from the same local port, so there is no separate frontend server in production.

### Development mode

Run the API and the Vite dev server in two terminals:

```bash
# terminal 1 — API on http://127.0.0.1:3010
npm run dev:server

# terminal 2 — UI on http://127.0.0.1:5173
npm run dev:web
```

Open <http://127.0.0.1:5173>. Vite proxies `/api` to the server on port 3010.

### Useful commands

| Command             | What it does                                            |
| ------------------- | ------------------------------------------------------- |
| `npm run dev:server`| Start the Express API with file watching                |
| `npm run dev:web`   | Start the Vite development server                       |
| `npm run build`     | Type-check and build the web app into `apps/web/dist`   |
| `npm start`         | Serve the built app and API on port 3010                |
| `npm run typecheck` | Type-check both workspaces                              |
| `npm test`          | Run the server test suite with Vitest                   |

## Your data

By default:

```
~/.local/share/podcast-plus/app.db
```

Set a different folder before starting the server:

```bash
PODCAST_STUDIO_DATA=/path/to/podcast-data npm start
```

- The database uses SQLite in WAL mode with foreign keys enabled.
- Audio is normally **streamed from the publisher** and is not copied into the database.
  A local transcription temporarily downloads the episode audio to the OS temp folder and
  deletes it after Whisper finishes or the job is cancelled.
- The dictionary database and Whisper model live outside this project's data folder and
  are never copied into it. The dictionary is opened read-only.
- Transcripts are stored in the same database as parsed cues. Removing a podcast or
  episode removes its transcript; removing a transcript does not affect the audio or your
  progress.
- Vocabulary entries and their notes are stored in the same database. Deleting a podcast
  keeps the saved word and definition but clears its link to the removed episode.
- Cover images and audio load directly from the publisher in your browser, so the
  publisher can see your IP address just as it would with any podcast app.
- The server binds to `127.0.0.1` by default and is not exposed to your local network.
  Override with `HOST` and `PORT` if you know what you are doing.
- To back up, stop the server and copy the whole data folder (including `app.db-wal` and
  `app.db-shm` if present).
- The old prototype's dictionary is read from `~/.local/share/podcast-language-studio`
  only when you request a lookup; the file is opened read-only and is never modified. The
  rest of that prototype's data is not used by this project.

## Privacy and network behavior

- No accounts, tracking scripts, analytics, or third-party APIs.
- The server only fetches a URL when you ask it to resolve, preview, add, or refresh a
  feed, explicitly load a transcript, or start a local transcription (which fetches the
  episode audio).
- Before fetching, it resolves the hostname and rejects loopback, private, link-local,
  unique-local, and unspecified addresses. Redirects are followed manually, one hop at a
  time, and every hop is checked again.
- Feed downloads are limited to 20 MB and 20 seconds; transcript downloads are limited to
  4 MB. Temporary audio for transcription is capped at 250 MB and five minutes by default.
- Feed, transcript, and audio response bodies are treated as untrusted data. Feed and
  transcript text is parsed, never executed.
- Whisper runs locally. The model, executable, and dictionary are never uploaded. The
  dictionary lookup path has no network code at all.
- Imported transcripts are sent only to your local server and written to your local
  database; they are not uploaded to a third-party service.
- The UI has no fake “implemented” states: planned practice features are visibly marked
  “Soon”. When Whisper or the dictionary is missing, the UI says so instead of showing a
  button that cannot work.

## Discovery, without an API

The app deliberately does not depend on a paid podcast directory or an API key.

1. **Curated catalog** — `catalog/podcasts.json` contains 13 feeds that were checked
   against their publishers. It is a starting point, not a ranking or a complete index.
2. **Website autodiscovery** — paste a podcast website; the server looks for its declared
   RSS/Atom link.
3. **Direct feed URL** — paste any public RSS or Atom URL.

Sites behind Cloudflare challenges, login walls, or provider-key requirements are not
scraped. If a site does not publish a discoverable feed, the app reports that honestly
instead of pretending to search it. OPML import is planned.

## Project layout

```
.
├── apps/
│   ├── server/            Express 5 + SQLite API
│   │   ├── src/
│   │   │   ├── app.ts      Routes, validation, error handling, static serving
│   │   │   ├── db.ts       Schema migrations and database opening
│   │   │   ├── rss.ts      RSS/Atom parsing and normalization
│   │   │   ├── transcript.ts  VTT/SRT/JSON/plain-text parsing
│   │   │   ├── transcripts.ts Transcript and cue storage queries
│   │   │   ├── dictionary.ts Read-only Wiktionary database queries
│   │   │   ├── vocabulary.ts Saved words, dictionary enrichment, and notes
│   │   │   ├── whisper.ts   Local Whisper job manager and VTT import
│   │   │   ├── http.ts     SSRF-safe fetch and temporary audio downloads
│   │   │   ├── discovery.ts Website/feed resolution and previews
│   │   │   ├── catalog.ts  Curated catalog loading and search
│   │   │   └── library.ts  Podcast, episode, and progress queries
│   │   └── test/           Vitest unit and API tests
│   └── web/               React 19 + TypeScript + Vite + Tailwind 4
│       └── src/
│           ├── pages/      Home, Discover, Library, Episodes, Episode, Dictionary, Vocabulary, Settings
│           ├── components/ Layout, player, transcript, translation panel, cards, dialogs
│           ├── player/     Global audio state and progress saving
│           └── theme/      Light/dark/system handling
├── catalog/podcasts.json  Hand-checked starter feeds
└── docs/development.md    Architecture, API, and maintenance notes
```

## API overview

All routes are under `/api`.

| Method | Route                        | Purpose                                    |
| ------ | ---------------------------- | ------------------------------------------ |
| GET    | `/health`                    | Health check                               |
| GET    | `/meta`                      | Version, data directory, library stats     |
| GET    | `/resources`                 | Local Whisper and dictionary status        |
| GET    | `/dictionary/lookup?word=...`| Read-only dictionary lookup                 |
| GET    | `/vocabulary`                | List/search saved words                    |
| POST   | `/vocabulary`                | Save a word with optional source context   |
| PATCH  | `/vocabulary/:id`            | Update status or notes                     |
| DELETE | `/vocabulary/:id`            | Remove a saved word                        |
| GET    | `/discovery/catalog`         | Search/filter the curated catalog          |
| POST   | `/discovery/resolve`         | Resolve a feed or website and preview it   |
| GET    | `/podcasts`                  | List saved podcasts                        |
| POST   | `/podcasts`                  | Resolve and add a podcast                  |
| GET    | `/podcasts/:id`              | Podcast detail                             |
| POST   | `/podcasts/:id/refresh`      | Re-fetch and upsert episodes               |
| DELETE | `/podcasts/:id`              | Remove a podcast and its episodes          |
| GET    | `/episodes`                  | Search, filter, and page episodes          |
| GET    | `/episodes/:id`              | Episode detail and progress                 |
| GET    | `/episodes/:id/transcript`   | Read the cached transcript                  |
| POST   | `/episodes/:id/transcript`   | Load from feed/URL or import pasted text    |
| DELETE | `/episodes/:id/transcript`   | Remove the local transcript copy            |
| GET    | `/episodes/:id/transcription`| Check the current local Whisper job         |
| POST   | `/episodes/:id/transcribe`   | Start a local Whisper transcription         |
| DELETE | `/episodes/:id/transcription`| Cancel the active local transcription       |
| PUT    | `/episodes/:id/progress`     | Save position and/or status                |
| GET    | `/home`                      | Stats, continue-listening, recent episodes |

Errors return `{ "error": "..." }` with a meaningful status code: `400` for validation,
`404` for missing records, `409` for duplicate feeds, `413` for oversized transcript
imports, `422` for feeds or transcripts that cannot be read, `503` when a local resource
is missing, and `500` for unexpected server errors.

## Testing

```bash
npm test
npm run typecheck
npm run build
```

The server suite covers:

- RSS and Atom parsing, including durations, dates, GUID fallbacks, and transcript links
- WebVTT, SubRip, Podcasting 2.0 JSON, and plain-text transcript parsing
- Transcript load/cache/import/delete routes, error cases, and HTML-page rejection
- Catalog loading, categories, search, and filters
- Feed resolution from direct URLs and website autodiscovery
- Adding, refreshing, and deleting podcasts
- Episode listing, pagination, and progress status transitions
- Private/loopback address rejection, redirect re-validation, and fetch size limits
- Dictionary direct lookups, lemma/form lookups, JSON fields, attribution, and missing DBs
  using a temporary fixture database
- Vocabulary save/deduplicate/list/filter/search/update/delete behavior, dictionary
  enrichment, source context, and API error cases

The tests use fixtures and an injected fetch function, so they do not need the network.
Manual QA should still try a real feed with transcripts, such as
`https://podnews.net/rss`, and confirm that loading, seeking, and removing a transcript
work. Also try a feed without transcripts and import a pasted VTT file.

For the local tools, run `npm start`, open Settings, and confirm both resources show as
available. Look up `podcast`, `language`, and `running` in the Dictionary page, then
transcribe a short episode from the transcript panel. The actual verification used a
three-minute Podnews episode; Whisper `base.en` produced 40 timestamped cues, which were
saved with origin `whisper`, and the temporary audio folder was removed.

For click-to-translate, play an episode with a loaded transcript and check all playback
cases: playing → click a word pauses; panel stays open while paused; clicking another word
updates the translation without resuming; X, Escape, and outside-click close it and resume
only when appropriate. Then repeat from an initially paused player and confirm closing
still leaves it paused. Save a word from the panel and from Dictionary, confirm it appears
on Vocabulary, change its status, save a note, then delete it.

## Design notes

The visual direction is warm paper and ember: serif display type, soft borders, and a calm
reading pace rather than a dense dashboard. The UI is deliberately not a clone of any
existing podcast app; no Podling branding, assets, or source code is used.

Technical decisions are explained in [docs/development.md](docs/development.md), including
why the project uses SQLite, why discovery is API-free, how SSRF protection works, how
playback progress is saved, and how transcripts are fetched, parsed, and stored.

## Roadmap

- **Phase 1 (done)** — library, RSS import, catalog discovery, global player, saved
  positions, themes, responsive UI.
- **Phase 2 (done)** — feed and imported transcripts, line-synced highlighting,
  click-to-seek, search, and local transcript storage.
- **Phase 3 (done)** — read-only Wiktionary dictionary lookups and explicit local Whisper
  transcription using the resources already on this computer.
- **Phase 4 (done)** — click-to-translate with reliable pause/resume, vocabulary capture,
  source context, notes, and status filters.
- **Phase 5** — shadowing loops and local recording.
- **Later** — spaced-repetition scheduling, OPML import/export, offline audio, Android
  client.

## Independence

This is an independent, from-scratch project. It is not affiliated with Podling, and it
does not copy Podling's branding, assets, or source code.
