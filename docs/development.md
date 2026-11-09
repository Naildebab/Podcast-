# Development notes

This document records the architecture and the decisions behind Phase 5. It is meant for
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
keys are enabled on every connection. Shadowing audio lives in a `recordings/` subfolder;
media files are never stored as SQLite blobs. The old prototype directory
(`~/.local/share/podcast-language-studio`) is used only as the default location of the
borrowed, read-only dictionary database; no other file there is read or written.

### Schema

`podcasts`

- `id`, unique `feed_url`, title, description, author, image, language, website
- `last_refreshed_at`, `created_at`

`episodes`

- `id`, `podcast_id` (cascade delete), `guid`
- title, description, `audio_url`, image, `published_at`, `duration_sec`
- `transcript_url`, `transcript_type`, `created_at`
- unique `(podcast_id, guid)`

`transcripts`

- one row per cached episode transcript: `episode_id` primary key, `source_url`, `format`,
  `origin` (`feed`, `manual`, or `whisper`), `language`, `timed`, `cue_count`, `imported_at`
- migration 3 recreates this table with the extra `whisper` origin while preserving rows
- cascade delete when an episode or podcast is removed

`transcript_cues`

- one row per line: `episode_id`, `cue_index`, nullable `start_ms` and `end_ms`,
  `speaker`, `text`
- unique `(episode_id, cue_index)`; indexed by `(episode_id, start_ms)`
- cascade delete when an episode or podcast is removed; deleted explicitly when a
  transcript is replaced or removed

`progress`

- one row per episode: `position_ms`, `status` (`new`, `in_progress`, `completed`),
  `updated_at`
- cascade delete when an episode or podcast is removed

`vocabulary`

- one row per saved word/source pair: display word, normalized word, lemma, part of speech,
  IPA, JSON definition and Arabic arrays, context sentence, optional episode/cue/timestamp,
  status (`new`, `learning`, `known`), notes, and timestamps
- a unique index on `(normalized_word, episode_id, cue_index)` prevents saving the same
  word from the same transcript line twice while still allowing the same word from
  different episodes or lines; SQLite treats null episode/cue pairs as distinct, and the
  service checks for an existing unsourced save before inserting
- `episode_id` uses `ON DELETE SET NULL`, so deleting a podcast keeps the word and its
  definition but clears the broken source link; nullable unique columns avoid a collision
  when several saved words lose their episode at once

`shadowing_recordings` (migration 5)

- one row per saved take: `episode_id` (cascade delete), optional `cue_index`,
  `start_ms`/`end_ms`, `duration_ms`, `mime_type`, `size_bytes`, `label`, unique generated
  `file_name`, and `created_at`
- indexed by `(episode_id, cue_index, created_at DESC)` so the practice dialog can list a
  line's takes without scanning the table
- the audio bytes live in `<dataDir>/recordings/<uuid>.<ext>`, never in SQLite. Deleting a
  take removes both the row and its file. Podcast deletion explicitly purges take files
  before the episode cascade removes the rows, because SQLite cannot delete files.

`settings`

- reserved for later server-side preferences. Theme, playback speed, and volume are
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

## Transcript pipeline

Transcripts are **not** fetched when an episode page opens. The page first asks
`GET /api/episodes/:id/transcript` for a local copy. If none exists, the user can choose
“Load transcript” (feed URL), or import pasted text/a file. This keeps network behavior
explicit and local-first.

### Fetching

`loadTranscriptFromUrl` in `app.ts` reuses the injected `fetchText` layer, with:

- a 4 MB body cap (the feed path keeps its 20 MB cap)
- the same DNS/private-address checks and redirect validation
- rejection of `image/*`, `audio/*`, `video/*`, NUL-containing bodies, and HTML pages
- a clear 422 error explaining that HTML transcript pages must be pasted manually

The final URL after redirects is stored as `source_url`. Reloading a feed transcript calls
the feed again; reloading an imported URL calls that URL.

### Parsing and normalization

`apps/server/src/transcript.ts` owns format detection and parsing:

- **WebVTT** — `WEBVTT` header, cue identifiers, settings after the timestamp, NOTE/STYLE
  blocks, `<v Speaker>` voices, inline tags, and entities
- **SubRip** — comma decimal timestamps, numeric cue indexes, multiline cue text
- **Podcasting 2.0 JSON** — `segments`, `transcript`, or `cues` arrays; `startTime`/
  `endTime` seconds; `startMs`/`endMs` milliseconds; `text`/`body`/`transcript`/
  `content`; optional speaker
- **Plain text** — timestamp prefixes such as `[00:01:20]`, `00:01:20`, or `01:20`;
  otherwise blank-line-separated paragraphs become untimed reading blocks

All parsers strip markup, decode entities, separate an obvious `Speaker:` prefix, sort
cues by start time, discard empty lines, and cap the result at 50,000 cues. If the caller
supplies a format hint and it produces nothing, the parser retries once with the detected
format. A transcript with no readable cues is a 422, not an empty cached record.

`transcripts.ts` replaces the transcript and all cue rows in one SQLite transaction, so a
failed re-import cannot leave a half-written transcript.

### Cue storage

Times are stored as integer milliseconds with nullable starts. Nullable starts let plain
text use the same table as timed subtitles. An end time is kept only when it is positive
and later than the start. The UI treats a missing end as “active until the next cue”.

## Local dictionary

`apps/server/src/dictionary.ts` borrows the existing Wiktextract database instead of
building or copying one. The default path is
`~/.local/share/podcast-language-studio/dictionary.db`; `PODCAST_DICTIONARY_DB` overrides
it.

- `better-sqlite3` opens the file with `{ readonly: true, fileMustExist: true }` and sets
  `PRAGMA query_only = ON`. The app has no write path for this database.
- The connection is cached per process and closed on shutdown.
- `lookupDictionary` normalizes the query (Unicode NFKC, lowercase, apostrophe cleanup,
  internal spaces) and first looks for direct matches by `entries.word_lc`.
- If there is no direct entry, it resolves inflected forms through the `forms` table
  (`form_lc` to `lemma_lc`) and loads the lemma entries. The response includes both the
  lemma names and all available forms, capped at 200 for display.
- Definitions and Arabic translations are stored as JSON arrays in the source database and
  are parsed defensively. Invalid JSON becomes an empty list, not a crash.
- `GET /api/dictionary/lookup` returns `400` for an empty query and `503` when the file is
  missing. Source, license, and kaikki.org attribution travel with every result.
- `GET /api/resources` reports availability and counts without exposing dictionary contents.

The real database has 1,165,874 entries and 579,157 forms and uses `journal_mode=delete`.
Read-only access works without changing the source file or creating a second copy.

## Vocabulary and click-to-translate

`apps/server/src/vocabulary.ts` owns saved-word persistence. A save request carries the
clicked word, optional dictionary entry id, episode/cue/timestamp, and context sentence.
The service re-runs the local dictionary lookup on the server rather than trusting a
client-supplied definition. It stores the selected entry (or the first entry) and caps the
stored definition/Arabic arrays at 12 items. If the dictionary is unavailable, the request
returns 503; if an entry id no longer exists, it returns 400.

The unique source index makes saves idempotent per word and transcript line. A repeat save
updates the dictionary snapshot and context but preserves the learner’s status and notes.
`GET /api/vocabulary` supports text search across the word, lemma, definitions, Arabic,
notes, and context, plus status and episode filters. `PATCH` updates status/notes and
`DELETE` removes a word.

On the client, `TranscriptPanel.tsx` tokenizes each cue with a Unicode letter pattern.
Word spans carry `data-translate-word`, stop click propagation so they do not seek, and
show a dotted underline. Clicking a word calls `openTranslation`, which:

1. opens the panel on the first click and asks the player to enter translation mode;
2. stores whether audio was really playing (`!audio.paused && !audio.ended`);
3. pauses through the single player instance;
4. updates only the selection on later word clicks.

`PlayerContext.tsx` keeps a `translationLockRef`. `toggle`, `play`, `playAt`, `loadAndPlay`,
`seek`/`skip`, the global keyboard handler, Media Session play/seek, and the audio `play`
event all respect the lock. `endTranslationMode(resume)` unlocks and, only when the caller
recorded that audio was playing, calls `audio.play()` without resetting `currentTime`.
Closing via X, Escape, or outside click all route through the same `closeTranslation`
function. Unmounting the transcript releases the lock without resuming.

The panel is a portal-rendered, non-modal card fixed above the player area. It is not a
modal because clicking another word must remain possible. Its capture-phase click handler
ignores clicks on `[data-translate-word]`. Using click rather than pointerdown also means a
touch scroll does not close the panel or resume audio by accident. Dictionary requests are
cancelled defensively with an `active` flag when the selected word changes.

## Shadowing and local recordings

The transcript reader adds a microphone button to each cue that has a start timestamp.
Clicking it opens `ShadowingDialog`, which receives the cue, its end, and the next cue's
start time. Untimed reading blocks have no practice button because a loop needs a range.

### Looping a cue

The dialog resolves the end of the line in this order:

1. the cue's own `end_ms`;
2. the next cue's start;
3. an estimate based on word count (2.5–12 seconds), capped by the episode duration.

It never allows a range shorter than 500 ms. The dialog pauses the episode when it mounts,
so practising does not compete with background audio.

“Play line” calls the existing `playAt(episode, startMs / 1000)` player action and marks a
one-shot boundary. A time watcher pauses when playback reaches the cue end. “Loop line”
does the same and then watches `PlayerTime`:

- when `currentTime` reaches the cue end, the player is paused;
- a timeout waits the selected gap (1, 2, 3, or 5 seconds);
- the timeout calls `playAt` again from the cue start; stopping the loop clears the timer.

This keeps one episode audio element and one source of truth. The loop is deliberately not
implemented with `audio.loop`, because a cue is a range, not the whole file. Timers are
cleared when the loop is stopped, the dialog unmounts, or the loaded episode changes.
`PlayerContext` does not need a shadowing lock: the dialog is modal and only exposes
explicit player actions.

The take preview uses a second `<audio controls>` element. That is separate from the global
player on purpose: it only plays local take files, never episode audio, and it does not
touch progress or resume state. Starting the original pauses a playing take; starting a
take or changing the loop pauses the original.

### Recording

`navigator.mediaDevices.getUserMedia({ audio: ... })` requests the microphone and
`MediaRecorder` captures the take. The client tries WebM/Opus, WebM, Ogg/Opus, Ogg, then
MP4. Starting a recording pauses the loop and the original. The UI:

- shows elapsed time and stops automatically at five minutes;
- stops all media tracks on stop, cancel, unmount, or error;
- rejects an empty blob and a blob over 25 MB;
- creates an object URL for immediate playback and revokes it after save, discard, or
  unmount;
- keeps an unsaved take in the dialog and asks before closing if a take exists or a
  recording is still active.

Permission and device failures are translated into readable messages (denied, no device,
device busy). Recording needs `localhost` or HTTPS because browsers only expose
`getUserMedia` in a secure context.

### Storage and API

`apps/server/src/recordings.ts` owns metadata and files:

- `saveRecording` validates the MIME type and size, creates the recordings folder with mode
  `0700`, writes a generated UUID filename with mode `0600`, inserts the row, and removes
  the file if the insert fails.
- `getRecordingAudio` returns the row plus a path assembled from the stored generated
  filename. `path.basename` is applied before joining, so a malformed row cannot escape the
  folder.
- `deleteRecording` removes the row and file. `purgePodcastRecordings` collects and removes
  the files for a podcast before the episode cascade deletes their rows.
- Accepted types are WebM, Ogg, MP4/M4A, WAV, MPEG, and AAC. Codec parameters are stripped
  before matching, so `audio/webm;codecs=opus` is stored as `audio/webm` with a `.webm`
  extension.

The API uses `express.raw({ type: "audio/*", limit: 25 MB })` on `POST /api/recordings`.
Metadata travels in the query string (`episodeId`, optional `cueIndex`, `startMs`, `endMs`,
`durationMs`, `label`), because the body is the raw audio. The episode must exist. Format,
empty-body, and range errors become `415`, `400`, and `400` respectively.

`GET /api/recordings/:id/audio` sends the stored MIME type, `Cache-Control: private,
no-store`, and `Accept-Ranges: bytes`. It handles ordinary and suffix byte ranges with a
`206` response, or `416` for an unsatisfiable range. This lets the native audio controls
seek inside a take. The default storage directory is `<dataDir>/recordings`; tests inject
`AppOptions.recordingsDir` so they never write to the real data folder.

There is no practiced-cue table, streak counter, or pronunciation score. A take is evidence
that a line was practised, but Phase 5 deliberately stops at recording and A/B playback.

## Local Whisper transcription

`apps/server/src/whisper.ts` manages explicit, asynchronous jobs. It never starts when an
episode page opens.

1. `POST /api/episodes/:id/transcribe` checks the executable and cached model first. Missing
   resources return `503`; an English-only model with a non-English language returns `422`.
2. The job downloads the episode audio through `downloadToFile` in `http.ts` to a unique
   directory under the OS temp folder. The same SSRF checks and redirect validation as feed
   fetching apply. Audio is capped at 250 MB and the download times out after five minutes
   by default; HTML responses are rejected.
3. The server spawns the configured Whisper executable with `--device`, `--task
   transcribe`, `--output_format vtt`, `--output_dir`, `--threads`, and `--fp16 False` on
   CPU. It never lets Whisper download a model: the model file is checked before spawning,
   and `--model_dir` points at the existing cache.
4. The VTT output is read through the existing `parseTranscript` path, then saved with
   origin `whisper` through `saveTranscript`. The temporary folder is removed in a `finally`
   block after success, failure, cancellation, or timeout.
5. Status lives in an in-memory map keyed by episode. The UI polls every two seconds.
   `DELETE /api/episodes/:id/transcription` aborts the download or sends `SIGTERM` to the
   child. A server restart loses job state, but completed transcripts remain in SQLite.
6. Only one job per episode can run. Starting another episode is allowed; starting the same
   episode while it is active returns the existing job instead of spawning a duplicate.

The process timeout defaults to one hour. `PODCAST_WHISPER_THREADS` defaults to 4 so a
transcription does not consume every core on a modest machine. `base.en` is English-only;
multilingual use requires a cached multilingual model and the matching environment vars.

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
- Caps feed/website responses at 20 MB and transcript responses at 4 MB (declared and
  actual body).
- Times out after 20 seconds.
- Rejects non-success statuses with a readable error.
- `downloadToFile` applies the same checks for temporary transcription audio, with its own
  size cap and timeout and caller cancellation. It rejects HTML responses, writes to a temp
  file, and cleans up on failure.

A DNS-rebinding race is still theoretically possible between the check and the connection.
The server binds to localhost by default and the app is single-user; this is a deliberate
trade-off. A future hardening step could pin the resolved address into the request or use a
proxy that enforces the same policy.

The fetch function is injected into `createApp` (`AppOptions.fetchText`), which makes the
API and discovery tests fast and deterministic.

## API design

All responses are JSON except `204` deletes. Errors are `{ "error": "..." }`.

| Method | Route                         | Notes                                              |
| ------ | ----------------------------- | -------------------------------------------------- |
| GET    | `/api/health`                 | Version and phase                                  |
| GET    | `/api/meta`                   | Data directory and stats                           |
| GET    | `/api/resources`              | Local Whisper and dictionary availability          |
| GET    | `/api/dictionary/lookup`      | `word`; read-only dictionary lookup                |
| GET    | `/api/vocabulary`             | `q`, `status`, `episodeId`, pagination             |
| POST   | `/api/vocabulary`             | Word plus optional `entryId`, episode, cue, context|
| PATCH  | `/api/vocabulary/:id`         | `{ status?, notes? }`                              |
| DELETE | `/api/vocabulary/:id`         | Remove a saved word                                |
| GET    | `/api/discovery/catalog`      | `q`, `category`, `level`; returns `inLibrary`      |
| POST   | `/api/discovery/resolve`      | `{ url }`; preview without saving                  |
| GET    | `/api/podcasts`               | Saved podcasts                                     |
| POST   | `/api/podcasts`               | `{ feedUrl }`; resolves and saves                  |
| GET    | `/api/podcasts/:id`           | One podcast                                        |
| POST   | `/api/podcasts/:id/refresh`   | Re-fetch the stored feed URL                       |
| DELETE | `/api/podcasts/:id`           | Cascade delete                                     |
| GET    | `/api/episodes`               | `podcastId`, `q`, `status`, `limit`, `offset`      |
| GET    | `/api/episodes/:id`           | Episode plus progress                              |
| GET    | `/api/episodes/:id/transcript`| Cached transcript or `{ transcript: null }`        |
| POST   | `/api/episodes/:id/transcript`| `{ source: "feed" \| "url" \| "text", ... }`       |
| DELETE | `/api/episodes/:id/transcript`| Remove transcript and cues                         |
| GET    | `/api/episodes/:id/transcription` | Current local Whisper job                      |
| POST   | `/api/episodes/:id/transcribe`| Start local Whisper; optional `language`           |
| DELETE | `/api/episodes/:id/transcription` | Cancel the active local job                    |
| PUT    | `/api/episodes/:id/progress`  | `{ positionMs, status? }`                          |
| GET    | `/api/recordings`             | `episodeId`, optional `cueIndex`; list takes       |
| POST   | `/api/recordings`             | Raw `audio/*` body plus metadata query params      |
| GET    | `/api/recordings/:id/audio`   | Byte-range-capable local audio stream              |
| DELETE | `/api/recordings/:id`         | Remove metadata and audio file                     |
| GET    | `/api/home`                   | Stats, continue-listening, recent episodes         |

Transcript imports accept `url` for a custom fetch, `text` plus optional `format`, and an
optional `language`. The body limit is 6 MB so a 4 MB text payload fits after JSON
escaping; the schema still caps pasted text at 4,000,000 characters. Oversized JSON
bodies return 413.

Recording uploads are the one non-JSON request body. The route's raw parser accepts
`audio/*` up to 25 MB; metadata is validated from the query string with Zod. Unsupported
audio MIME types return 415. The global payload-too-large handler names both the transcript
and recording limits rather than assuming every 413 came from a transcript.

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
  - `playAt(episode, seconds)`, which starts a new episode at a transcript cue without
    racing metadata loading, or seeks and resumes the current episode
- `components/TranscriptPanel.tsx` owns the local transcript request, import modal,
  reload/remove controls, search, follow toggle, cue list, word tokenization, and local
  Whisper controls. It checks `/transcription`, polls active jobs every two seconds, shows
  a cancellable progress notice, and reloads the transcript when a job completes. It only
  subscribes to player time inside the reader, computes the active cue with a binary
  search, and scrolls the transcript container rather than the page. A missing end time
  keeps the cue active until the next cue. Word clicks are handled by `openTranslation`,
  which owns the panel open/resume refs independently of React render timing. Timed cues
  also render a practice button that opens the shadowing dialog with the next cue's start.
- `components/ShadowingDialog.tsx` owns the cue loop, gap timer, microphone lifecycle,
  pending take, local preview audio, and saved-take list. It always uses the shared player
  actions for the original line, and its own `<audio>` only for take files. A close with an
  unsaved take or active recording shows an inline discard confirmation rather than
  silently losing audio.
- `components/WordTranslationPanel.tsx` is portal-rendered and non-modal. It fetches the
  selected word from the local dictionary, renders definitions/type/IPA/Arabic/context,
  and saves the word to vocabulary. Its outside-click listener ignores transcript word
  clicks so another word can update the panel in place.
- `pages/Dictionary.tsx` provides the search form, suggested words, per-entry definitions,
  IPA, Arabic translations, forms, source/license attribution, and per-entry save buttons.
  It reads only through `lib/api.ts`; there is no client-side dictionary file.
- `pages/Vocabulary.tsx` lists saved words with search, status filters, notes, episode
  context links, status changes, and deletion. It uses the same vocabulary API as the
  translation panel.
- Settings uses the same `/api/resources` response as the Dictionary page to report missing
  resources, paths, counts, and environment variables.
- The mini player hides itself on the page of the episode it is playing, so it does not
  duplicate or overlap the full player. On desktop it starts to the right of the sidebar.
- `theme/ThemeContext.tsx` stores `theme` as `light`, `dark`, or `system`; an inline script
  in `index.html` applies the dark class before paint.

### Player state transitions

- `play(episode)` toggles if the same episode is already loaded and healthy; otherwise it
  resets the source, seeks to the stored position, and calls `audio.play()`.
- `playAt(episode, seconds)` behaves like `play` but uses the cue time instead of the saved
  position when loading a different episode. For the current episode it seeks immediately
  and resumes if paused.
- A completed episode starts at 0.
- Seeking writes the new position immediately.
- `onEnded` saves position 0 with `completed`.
- “Mark completed” pauses, seeks to 0, saves `completed`, and suppresses the pause handler
  for 150 ms so it cannot overwrite the status.
- “Reset progress” saves `new` with position 0.
- Translation mode is a playback lock, not a second player. The first word click records
  whether `audio.paused` was false, pauses, and sets the lock. All playback entry points
  are blocked while the lock is set. Closing unlocks; resuming uses `audio.play()` on the
  existing element, preserving `currentTime`. It never calls `loadAndPlay`.
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

Dictionary and Vocabulary are practice routes; shadowing opens from any timed transcript
cue. The practice dialog uses the existing modal, buttons, badges, and notices rather than
a parallel component system. Clickable transcript words use a dotted underline and a
selected-word amber highlight; the translation panel floats above the player on desktop
and becomes a near-full-width bottom card on phones. Practice buttons sit at the end of
each timed cue and use the same accent hover treatment as other quiet controls.

## Testing strategy

`npm test` runs `apps/server/test` with Vitest:

- `rss.test.ts` — feed formats, dates, durations, GUIDs, audio selection, transcript links
- `transcript.test.ts` — VTT/SRT/JSON/plain text, voices, entities, timestamp prefixes,
  fallback detection, and unreadable input
- `api.test.ts` — catalog, discovery, library CRUD, episodes, progress, transcript
  load/cache/import/delete, shadowing recording upload/list/range/delete and podcast file
  cleanup, HTML rejection, and error cases
- `dictionary.test.ts` — direct lookup, form-to-lemma lookup, IPA/Arabic parsing, forms,
  attribution, empty queries, and a missing database, all against a temporary fixture DB
- `vocabulary.test.ts` — dictionary enrichment, source deduplication, status/notes,
  search/filter/list/delete, invalid entry ids, and a missing dictionary
- `http.test.ts` — public/private address policy, manual redirects, size limits

Tests inject a fake `fetchText`; they never depend on a live publisher. A temp SQLite
database is created per suite, and API tests also inject a temporary `recordingsDir`, so no
test audio reaches the real data folder.

Manual checks after changes:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. Start the server, add a real feed, play an episode, seek, reload, and confirm the
   position returns.
5. Add a real podcast with transcripts (for example `https://podnews.net/rss`), load a
   transcript, click a cue, confirm the active line follows playback, search the
   transcript, reload it, and remove the local copy.
6. Import a pasted VTT/SRT/JSON/plain-text file for an episode without a feed transcript.
7. Open Settings and confirm Whisper and the dictionary show as available with the expected
   paths. Temporarily point `PODCAST_DICTIONARY_DB` at a missing path to confirm the 503 and
   “Unavailable” state are graceful.
8. Look up `podcast`, `running`, and `better` in Dictionary. Confirm definitions, IPA, forms,
   Arabic where present, and the CC BY-SA attribution. Save an entry and confirm it appears
   on Vocabulary.
9. With a transcript loaded and audio playing, click words. Check: playing → click pauses;
   another word updates without resuming; X/Escape/outside click resumes from the same
   timestamp; initially paused → click and close remains paused. Save the word, then edit
   status and notes on Vocabulary and delete it.
10. Open the practice button on a timed cue. Check play-from-cue, loop with each gap,
    pause/stop, microphone denial, a recorded take, save, reload persistence, playback,
    delete, and the unsaved-take close prompt. Delete a test podcast and confirm its
    recording files are removed.
11. Transcribe a short real episode, watch the job progress, cancel once, then run it again.
    Confirm the saved transcript badge says “Local Whisper”, cues seek the player, and no
    `podcast-plus-whisper-*` temp folder remains.
12. Check the mini player across routes and the full player on the episode route.
13. Check light/dark and a 390px-wide viewport, including the translation panel,
    Vocabulary list, and shadowing dialog.

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
unexpected error. Add API coverage in `api.test.ts`. A raw-audio route must declare its own
`express.raw` parser and body limit before the handler; do not relax the global JSON parser.

### Add or change a recording format

Extend `MIME_EXTENSIONS` in `recordings.ts` and the browser preference list in
`ShadowingDialog.tsx`, then add an API test that uploads that content type and one that
rejects an unsupported type. Keep filenames generated by the server; never derive a path
from a request field. The raw upload route stays `audio/*`, and `normalizeRecordingMime`
remains the single allow-list shared by save and stream paths.

### Change the player

Keep the single episode audio element. The shadowing dialog's preview `<audio>` is the one
deliberate exception: it only plays local take files and never owns episode progress or
resume state. Avoid adding a second episode player for a second screen; that would break
resume and duplicate sound. Update progress through the existing `persist` helper so
keepalive/page-hide behavior stays consistent. If you add a new seek entry point, use
`playAt` rather than assigning `audio.currentTime` before metadata has loaded. Shadowing
loops call `playAt` for the original line and keep their timers in the dialog, not in the
global player.

Any new playback entry point (button, shortcut, media key, or integration) must respect
`translationLockRef` while the word panel is open. Do not work around the lock by calling
`audio.play()` directly; add the guard to the shared player action instead. Resume after
translation must call the player’s `endTranslationMode` path rather than resetting the
source, so the exact paused timestamp is preserved.

### Add a transcript format

Add a parser in `transcript.ts`, extend `TranscriptFormat` and `transcriptFormatFrom`, and
make `detectTranscriptFormat` recognize the format. Normalize every parser through
`normalizeCues`, then add parser and API tests. The UI consumes the same cue shape, so no
schema change is needed unless the format adds new metadata.

## Deliberate non-goals in Phase 5

- Automatic transcription when an episode page opens
- Cloud transcription, translation, or dictionary APIs
- Scraping arbitrary HTML transcript pages
- Offline audio downloads (temporary transcription audio is deleted)
- Spaced-repetition scheduling or generated study sheets
- Pronunciation scoring, recording analysis, streaks, or practice-time analytics
- Cloud sync or upload of shadowing takes
- Editing or adding dictionary entries
- OPML import/export
- Android
- A hosted directory API
- Multi-user accounts or sync

These are visible in the Settings roadmap and are not represented as finished features.
