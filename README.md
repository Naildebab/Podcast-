# Podcast Language Studio

A local-first podcast player for language learners. Phase 2 gives you a real listening
foundation plus transcripts: import public RSS feeds, browse a hand-checked catalog,
preview shows before adding them, play episodes in a persistent player, and read along
with publisher or imported transcripts.

No account. No API keys. No analytics. Your library, listening positions, and transcripts
live in a SQLite file on your own computer; small display and playback preferences stay in
browser local storage.

> Status: **Phase 2 — transcripts**. Vocabulary, shadowing, and Android are planned for
> later phases. Labels in the interface say “Soon” when a feature is not built yet.

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

## Not built yet

These are honest Phase 2 boundaries, not hidden buttons:

- Automatic speech-to-text transcription of audio
- Translation of transcripts
- Scraping arbitrary HTML transcript pages (paste the text instead)
- Vocabulary collection and study sheets (Phase 3)
- Shadowing and local recording (Phase 4)
- OPML import/export
- Offline audio downloads
- Android app
- A podcast directory API or scraping of sites that block automated requests

## Requirements

- Node.js **20 or newer** (the project was developed and tested on Node 24)
- A modern browser with HTML audio support
- Linux, macOS, or Windows. The data path defaults to a Linux-style `~/.local/share`
  location; set `PODCAST_STUDIO_DATA` on other systems if you prefer another folder.

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
- Audio is **streamed from the publisher** and is not downloaded or copied into the
  database.
- Transcripts are stored in the same database as parsed cues. Removing a podcast or
  episode removes its transcript; removing a transcript does not affect the audio or your
  progress.
- Cover images and audio load directly from the publisher in your browser, so the
  publisher can see your IP address just as it would with any podcast app.
- The server binds to `127.0.0.1` by default and is not exposed to your local network.
  Override with `HOST` and `PORT` if you know what you are doing.
- To back up, stop the server and copy the whole data folder (including `app.db-wal` and
  `app.db-shm` if present).
- The old prototype's data folder (`~/.local/share/podcast-language-studio`) is never
  touched by this project.

## Privacy and network behavior

- No accounts, tracking scripts, analytics, or third-party APIs.
- The server only fetches a URL when you ask it to resolve, preview, add, or refresh a
  feed, or when you explicitly load a transcript.
- Before fetching, it resolves the hostname and rejects loopback, private, link-local,
  unique-local, and unspecified addresses. Redirects are followed manually, one hop at a
  time, and every hop is checked again.
- Feed downloads are limited to 20 MB and 20 seconds; transcript downloads are limited to
  4 MB.
- Feed and transcript contents are parsed as data, never executed.
- Imported transcripts are sent only to your local server and written to your local
  database; they are not uploaded to a third-party service.
- The UI has no fake “implemented” states: planned practice features are visibly marked
  “Soon”.

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
│   │   │   ├── http.ts     SSRF-safe fetch with manual redirect checks
│   │   │   ├── discovery.ts Website/feed resolution and previews
│   │   │   ├── catalog.ts  Curated catalog loading and search
│   │   │   └── library.ts  Podcast, episode, and progress queries
│   │   └── test/           Vitest unit and API tests
│   └── web/               React 19 + TypeScript + Vite + Tailwind 4
│       └── src/
│           ├── pages/      Home, Discover, Library, Episodes, Episode, Settings
│           ├── components/ Layout, player, cards, dialogs, pagination
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
| PUT    | `/episodes/:id/progress`     | Save position and/or status                |
| GET    | `/home`                      | Stats, continue-listening, recent episodes |

Errors return `{ "error": "..." }` with a meaningful status code: `400` for validation,
`404` for missing records, `409` for duplicate feeds, `413` for oversized transcript
imports, `422` for feeds or transcripts that cannot be read, and `500` for unexpected
server errors.

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

The tests use fixtures and an injected fetch function, so they do not need the network.
Manual QA should still try a real feed with transcripts, such as
`https://podnews.net/rss`, and confirm that loading, seeking, and removing a transcript
work. Also try a feed without transcripts and import a pasted VTT file.

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
- **Phase 3** — vocabulary collection and study sheets.
- **Phase 4** — shadowing loops and local recording.
- **Later** — OPML import/export, offline audio, Android client.

## Independence

This is an independent, from-scratch project. It is not affiliated with Podling, and it
does not copy Podling's branding, assets, or source code.
