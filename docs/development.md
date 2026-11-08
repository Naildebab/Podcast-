# Development notes

This document records the architecture and the decisions behind Phase 1. It is meant for
whoever maintains the project next — including future me.

## Stack

| Layer      | Choice                          | Why                                                                 |
| ---------- | ------------------------------- | ------------------------------------------------------------------- |
| UI         | React 19 + TypeScript           | Explicit state and predictable component boundaries                 |
| Build/dev  | Vite 7                          | Fast HMR, simple production build, good default proxying            |
| Styling    | Tailwind CSS 4                  | Tokenized colors and responsive utilities without a component kit   |
| API        | Express 5 + TypeScript          | Small, familiar HTTP layer with first-class async error handling    |
| Database   | SQLite via `better-sqlite3`     | Local ownership, zero server process, synchronous queries, WAL mode |
| Validation | Zod                             | One schema for query/body validation and readable 400 responses     |
| XML        | `fast-xml-parser`               | Handles RSS, Atom, RDF, CDATA, and podcast namespaces               |
| Tests      | Vitest                          | Fast unit/API tests with no network dependency                      |

The repository is an npm workspaces monorepo:

- `apps/server` — API, RSS, SQLite, discovery, fetching
- `apps/web` — React application and player
- `catalog/podcasts.json` — hand-checked starter feeds

## Runtime shape

In development:

```
Browser :5173  →  Vite dev server  →  proxy /api  →  Express :3010  →  SQLite
```

In production:

```
Browser :3010  →  Express  →  static files from apps/web/dist
                         └→  /api  →  SQLite
```

`apps/server/src/index.ts` opens the database, creates the app, and listens on `HOST` and
`PORT` (`127.0.0.1:3010` by default). Express serves the built UI only when
`apps/web/dist/index.html` exists. Otherwise the root route returns a short instruction
message, so the API can run alone during development.

## Data directory and database

`dataDir()` resolves in this order:

1. `PODCAST_STUDIO_DATA`
2. `~/.local/share/podcast-plus`

The folder is created on demand. The database is `app.db` inside it. WAL mode and foreign
keys are enabled on every connection. The old prototype directory
(`~/.local/share/podcast-language-studio`) is never read or written.

### Schema

`podcasts`

- `id`, unique `feed_url`, title, description, author, image, language, website
- `last_refreshed_at`, `created_at`

`episodes`

- `id`, `podcast_id` (cascade delete), `guid`
- title, description, `audio_url`, image, `published_at`, `duration_sec`
- `transcript_url`, `transcript_type`, `created_at`
- unique `(podcast_id, guid)`

`progress`

- one row per episode: `position_ms`, `status` (`new`, `in_progress`, `completed`),
  `updated_at`
- cascade delete when an episode or podcast is removed

`settings`

- reserved for later server-side preferences. Phase 1 theme, playback speed, and volume are
  intentionally browser-local (`localStorage`) because they are device preferences, not
  library data.

Indexes cover episode lists by podcast and publication date. The schema uses an append-only
`PRAGMA user_version` migration list: add a new SQL string at the end, never edit an applied
entry.

### Upserts and progress

- `upsertEpisodes` uses `INSERT ... ON CONFLICT (podcast_id, guid) DO UPDATE`. Refreshing a
  feed updates metadata without deleting progress.
- Progress is saved with `INSERT ... ON CONFLICT (episode_id) DO UPDATE`.
- When the client sends only `positionMs`, the server derives `in_progress` for a positive
  position and `new` for zero. Explicit `completed` is preserved.
- `listContinueListening` returns only `in_progress` rows with a positive position, newest
  updated first.

## Feed parsing

`apps/server/src/rss.ts` normalizes RSS 2.0, Atom, and RDF-style feeds into one shape:

- Title, description, author, image, language, website
- Episodes with GUID fallback (link, enclosure URL, or a deterministic hash)
- Publication date parsing (RFC 822 and ISO variants)
- Duration parsing (`HH:MM:SS`, `MM:SS`, seconds, and a few text forms)
- Transcript links from common podcast namespace fields
- Audio enclosure selection; episodes without a usable audio URL are skipped

The parser treats XML as data. It does not execute scripts or resolve entities.

## Discovery without an API

The app intentionally avoids paid podcast directories and provider keys.

`resolveFeedUrl` in `discovery.ts`:

1. Requires `http://` or `https://`.
2. Fetches the address through the SSRF-safe fetch layer.
3. If the response looks like RSS/Atom, parses it directly.
4. Otherwise scans the HTML for `<link rel="alternate">` tags with RSS, Atom, or RDF
   types, ranked in that order, and tries up to five candidates.
5. Never brute-forces `/feed` or scrapes a search engine.

`/api/discovery/catalog` reads the curated JSON and does a simple case-insensitive
substring search over title, author, description, level, categories, and tags. There is no
fuzzy ranking: a match is explainable.

`previewFeed` returns the show metadata plus the first eight episodes. Adding a podcast
fetches and validates the feed again, so the saved data is current.

Known limitation: some sites sit behind Cloudflare challenges, login walls, or regional
blocks. The app reports the failure instead of claiming to have searched them. OPML import
is not implemented yet.

## SSRF-safe fetching

Local apps that fetch user-supplied URLs can be tricked into reaching the user's own
network. `http.ts` therefore:

- Parses the URL and allows only HTTP(S).
- Rejects literal loopback, private, link-local, unique-local, and unspecified addresses.
- Resolves DNS and checks every returned address before the request.
- Uses `redirect: "manual"` and validates each redirect target before following it.
- Follows at most five redirects.
- Caps the response at 20 MB (declared and actual body).
- Times out after 20 seconds.
- Rejects non-success statuses with a readable error.

A DNS-rebinding race is still theoretically possible between the check and the connection.
The server binds to localhost by default and the app is single-user; this is a deliberate
Phase 1 trade-off. A future hardening step could pin the resolved address into the request
or use a proxy that enforces the same policy.

The fetch function is injected into `createApp` (`AppOptions.fetchText`), which makes the
API and discovery tests fast and deterministic.

## API design

All responses are JSON except `204` deletes. Errors are `{ "error": "..." }`.

| Method | Route                         | Notes                                              |
| ------ | ----------------------------- | -------------------------------------------------- |
| GET    | `/api/health`                 | Version and phase                                  |
| GET    | `/api/meta`                   | Data directory and stats                           |
| GET    | `/api/discovery/catalog`      | `q`, `category`, `level`; returns `inLibrary`      |
| POST   | `/api/discovery/resolve`      | `{ url }`; preview without saving                  |
| GET    | `/api/podcasts`               | Saved podcasts                                     |
| POST   | `/api/podcasts`               | `{ feedUrl }`; resolves and saves                  |
| GET    | `/api/podcasts/:id`           | One podcast                                        |
| POST   | `/api/podcasts/:id/refresh`   | Re-fetch the stored feed URL                       |
| DELETE | `/api/podcasts/:id`           | Cascade delete                                     |
| GET    | `/api/episodes`               | `podcastId`, `q`, `status`, `limit`, `offset`      |
| GET    | `/api/episodes/:id`           | Episode plus progress                              |
| PUT    | `/api/episodes/:id/progress`  | `{ positionMs, status? }`                          |
| GET    | `/api/home`                   | Stats, continue-listening, recent episodes         |

New API routes must be declared before the `/api` 404 middleware. Unknown API routes return
a JSON 404; non-API routes fall through to the SPA shell when static files are present.

## Frontend architecture

- `App.tsx` defines the route map inside `Layout` and providers.
- `lib/api.ts` is the typed fetch wrapper. Errors are converted to `Error` with the server's
  message.
- `lib/hooks.ts` provides `useAsync`, `useDebounced`, and document-title helpers.
- `Layout.tsx` owns the desktop rail, mobile header/navigation, and the mini-player slot.
- Pages own their query state. Episodes and podcast detail use explicit offset pagination
  (50 per page) with a “Showing X–Y of Z” label and Previous/Next controls; the list scrolls
  back into view when the page changes.
- `player/PlayerContext.tsx` owns the single `<audio>` element and splits state into
  snapshot/time/actions contexts to limit re-renders. It handles:
  - resume position on load (unless the episode is completed)
  - a five-second progress save while playing
  - save on pause, seek, page hide, and close
  - completed/restart transitions
  - keyboard shortcuts (`Space`, arrows, `[`/`]`, `M`) except while typing or focused on a
    control
  - Media Session metadata and action handlers where supported
  - persisted speed and volume in `localStorage`
- The mini player hides itself on the page of the episode it is playing, so it does not
  duplicate or overlap the full player. On desktop it starts to the right of the sidebar.
- `theme/ThemeContext.tsx` stores `theme` as `light`, `dark`, or `system`; an inline script
  in `index.html` applies the dark class before paint.

### Player state transitions

- `play(episode)` toggles if the same episode is already loaded and healthy; otherwise it
  resets the source, seeks to the stored position, and calls `audio.play()`.
- A completed episode starts at 0.
- Seeking writes the new position immediately.
- `onEnded` saves position 0 with `completed`.
- “Mark completed” pauses, seeks to 0, saves `completed`, and suppresses the pause handler
  for 150 ms so it cannot overwrite the status.
- “Reset progress” saves `new` with position 0.
- Audio failures are shown as an inline message; they never crash the page.

## Styling and theme

`apps/web/src/index.css` defines the Tailwind 4 tokens:

- warm paper background, ink text, ember accent, pine secondary
- serif display type for headings, sans for UI text
- custom range slider styling using a `--pct` CSS variable
- dark variants selected by the `.dark` class on `<html>`

The layout is mobile-first. The desktop sidebar appears at `md` (768px); the episode page
switches to a two-column player/progress layout at `lg` (1024px). Mobile navigation uses
short labels (“Library”, “Episodes”) so all four items fit at phone widths.

Planned practice areas are rendered as disabled “Soon” items, not clickable placeholders.

## Testing strategy

`npm test` runs `apps/server/test` with Vitest:

- `rss.test.ts` — feed formats, dates, durations, GUIDs, audio selection, transcripts
- `api.test.ts` — catalog, discovery, library CRUD, episodes, progress, error cases
- `http.test.ts` — public/private address policy, manual redirects, size limits

Tests inject a fake `fetchText`; they never depend on a live publisher. A temp SQLite
database is created per suite.

Manual checks after changes:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. Start the server, add a real feed, play an episode, seek, reload, and confirm the
   position returns.
5. Check the mini player across routes and the full player on the episode route.
6. Check light/dark and a 390px-wide viewport.

## Common maintenance tasks

### Add a curated show

Edit `catalog/podcasts.json`. Each entry needs a stable `id`, title, author, description,
feed URL, website URL, optional image, language, level, categories, and tags. Verify the
feed resolves before committing. The catalog is cached in memory for the server process;
restart after editing.

### Add a database migration

Append a new SQL string to `MIGRATIONS` in `db.ts`. Never edit an applied migration. The
next server start runs it and increments `user_version`. Add tests for new behavior.

### Add an API route

Add the route in `app.ts` before the `/api` 404 handler. Validate input with Zod. Throw
`HttpError` for expected statuses, or let the central error handler return 500 and log the
unexpected error. Add API coverage in `api.test.ts`.

### Change the player

Keep the single audio element. Avoid creating a second `<audio>` for a second screen; that
would break resume and duplicate sound. Update progress through the existing `persist`
helper so keepalive/page-hide behavior stays consistent.

## Deliberate non-goals in Phase 1

- Offline audio downloads (audio is streamed)
- Transcript display (URLs are parsed and stored; the episode page shows a placeholder)
- Vocabulary, shadowing, and recording
- OPML import/export
- Android
- A hosted directory API
- Multi-user accounts or sync

These are visible in the Settings roadmap and are not represented as finished features.
