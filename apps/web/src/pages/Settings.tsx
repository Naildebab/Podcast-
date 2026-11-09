import { BookIcon, MicIcon, MonitorIcon, MoonIcon, SunIcon } from "../components/Icons";
import { Badge } from "../components/Badge";
import { ErrorPanel, Notice, Skeleton } from "../components/Notice";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import { PLAYBACK_RATES, usePlayerActions, usePlayerSnapshot } from "../player/PlayerContext";
import { useTheme, type ThemeSetting } from "../theme/ThemeContext";

const themeOptions: { value: ThemeSetting; label: string; description: string; icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", description: "Warm paper and ink.", icon: SunIcon },
  { value: "dark", label: "Dark", description: "Low-light listening.", icon: MoonIcon },
  { value: "system", label: "System", description: "Follow the OS setting.", icon: MonitorIcon },
];

const shortcuts = [
  ["Space", "Play or pause the current episode"],
  ["← / →", "Seek back or forward 10 seconds"],
  ["[ / ]", "Slow down or speed up playback"],
  ["M", "Mute or unmute"],
];

export function Settings() {
  useDocumentTitle("Settings");
  const { theme, setTheme } = useTheme();
  const meta = useAsync(() => api.meta(), []);
  const resources = useAsync(() => api.resources(), []);
  const player = usePlayerSnapshot();
  const actions = usePlayerActions();

  return (
    <div className="space-y-8">
      <section className="animate-rise">
        <p className="eyebrow">Studio preferences</p>
        <h1 className="mt-2 font-serif text-4xl leading-none text-fg sm:text-5xl">Settings</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Small choices, kept on this computer. The studio does not create an account or send
          listening data anywhere.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="animate-rise delay-1 rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <SunIcon size={18} className="text-amber" />
            <h2 className="font-serif text-2xl text-fg">Appearance</h2>
          </div>
          <p className="mt-1 text-xs text-muted">
            The inline theme script avoids a flash when the page loads.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {themeOptions.map(({ value, label, description, icon: Icon }) => {
              const active = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  aria-pressed={active}
                  className={`rounded-2xl border p-3 text-left transition ${
                    active
                      ? "border-accent bg-accent-soft text-accent-strong"
                      : "border-line bg-bg text-muted hover:bg-surface-2 hover:text-fg"
                  }`}
                >
                  <Icon size={18} />
                  <span className="mt-2 block text-sm font-semibold text-fg">{label}</span>
                  <span className="mt-0.5 block text-[0.65rem] leading-relaxed">
                    {description}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="animate-rise delay-1 rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <span className="text-accent">◉</span>
            <h2 className="font-serif text-2xl text-fg">Playback</h2>
          </div>
          <p className="mt-1 text-xs text-muted">
            This becomes the default speed for the next episode you open.
          </p>
          <label className="mt-5 block text-xs font-semibold text-muted">
            Default speed
            <select
              value={player.rate}
              onChange={(event) => actions.setRate(Number(event.target.value))}
              className="mt-2 h-11 w-full rounded-full border border-line bg-bg px-4 text-sm font-semibold text-fg outline-none focus:border-accent"
              aria-label="Default playback speed"
            >
              {PLAYBACK_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}× {rate === 1 ? "(normal)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-5">
            <p className="eyebrow">Keyboard controls</p>
            <dl className="mt-2 space-y-2">
              {shortcuts.map(([key, description]) => (
                <div key={key} className="flex items-center justify-between gap-3 text-xs">
                  <dt className="shrink-0 rounded-md border border-line bg-bg px-2 py-1 font-mono text-[0.65rem] text-fg">
                    {key}
                  </dt>
                  <dd className="text-right text-muted">{description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </div>

      <section className="animate-rise delay-2 rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Local data</p>
            <h2 className="mt-1 font-serif text-2xl text-fg">Where your library lives</h2>
          </div>
          <Badge tone="pine">No cloud sync</Badge>
        </div>

        {meta.error ? <ErrorPanel message={meta.error} onRetry={meta.reload} className="mt-4" /> : null}
        {meta.loading && !meta.data ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : meta.data ? (
          <>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              The SQLite database, subscriptions, and playback positions are stored in this
              folder. Audio is normally streamed from the publisher; local transcription
              downloads a temporary copy and deletes it when the job finishes.
            </p>
            <code className="mt-3 block break-all rounded-2xl border border-line bg-bg px-4 py-3 text-xs text-fg">
              {meta.data.dataDir}
            </code>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Podcasts", meta.data.stats.podcasts],
                ["Episodes", meta.data.stats.episodes],
                ["Completed", meta.data.stats.completed],
                ["In progress", meta.data.stats.inProgress],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-surface-2 px-3 py-3">
                  <p className="font-serif text-2xl leading-none text-fg">{value}</p>
                  <p className="mt-1 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted">
                    {label}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[0.65rem] text-muted">
              API version {meta.data.version} · Phase {meta.data.phase} · Checked{" "}
              {formatDate(new Date().toISOString())}
            </p>
          </>
        ) : null}
      </section>

      <section className="animate-rise delay-2 rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Local language tools</p>
            <h2 className="mt-1 font-serif text-2xl text-fg">Resources already on this PC</h2>
          </div>
          <Badge tone="pine">Borrowed, not copied</Badge>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          The dictionary is opened read-only and Whisper is run from its existing virtual
          environment. No model weights or dictionary files are duplicated in this project.
        </p>

        {resources.error ? (
          <ErrorPanel
            message={resources.error}
            onRetry={resources.reload}
            className="mt-4"
          />
        ) : null}
        {resources.loading && !resources.data ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : resources.data ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-bg p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BookIcon size={18} className="text-accent" />
                  <h3 className="font-serif text-lg text-fg">Wiktionary database</h3>
                </div>
                <Badge tone={resources.data.dictionary.available ? "pine" : "outline"}>
                  {resources.data.dictionary.available ? "Available" : "Unavailable"}
                </Badge>
              </div>
              {resources.data.dictionary.available ? (
                <>
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    {resources.data.dictionary.entries?.toLocaleString()} entries ·{" "}
                    {resources.data.dictionary.forms?.toLocaleString()} forms ·{" "}
                    {resources.data.dictionary.license}
                  </p>
                  <code className="mt-2 block break-all rounded-xl bg-surface-2 px-3 py-2 text-[0.65rem] text-fg">
                    {resources.data.dictionary.path}
                  </code>
                </>
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-danger">
                  {resources.data.dictionary.error}
                </p>
              )}
              <p className="mt-2 text-[0.65rem] text-muted">
                Configure with <code>PODCAST_DICTIONARY_DB</code>.
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-bg p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MicIcon size={18} className="text-accent" />
                  <h3 className="font-serif text-lg text-fg">OpenAI Whisper</h3>
                </div>
                <Badge tone={resources.data.whisper.available ? "pine" : "outline"}>
                  {resources.data.whisper.available ? "Available" : "Unavailable"}
                </Badge>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                {resources.data.whisper.engine} · model {resources.data.whisper.model} ·{" "}
                {resources.data.whisper.device}
              </p>
              <code className="mt-2 block break-all rounded-xl bg-surface-2 px-3 py-2 text-[0.65rem] text-fg">
                {resources.data.whisper.binary}
              </code>
              {resources.data.whisper.available ? (
                <p className="mt-2 text-[0.65rem] text-muted">
                  Model cached at{" "}
                  <code className="break-all">{resources.data.whisper.modelPath}</code>.
                </p>
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-danger">
                  {resources.data.whisper.reason}
                </p>
              )}
              <p className="mt-2 text-[0.65rem] text-muted">
                Configure with <code>PODCAST_WHISPER_BIN</code>,{" "}
                <code>PODCAST_WHISPER_MODEL</code>, and <code>PODCAST_WHISPER_MODEL_DIR</code>.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="animate-rise delay-3 rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <p className="eyebrow">Roadmap</p>
        <h2 className="mt-1 font-serif text-2xl text-fg">What is next</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            {
              phase: "Phase 1",
              title: "Listening foundation",
              body: "Library, RSS import, curated discovery, audio player, and saved positions.",
              done: true,
            },
            {
              phase: "Phase 2",
              title: "Transcripts",
              body: "Publisher and pasted transcripts, line-synced highlighting, and click-to-seek reading.",
              done: true,
            },
            {
              phase: "Phase 3",
              title: "Local tools",
              body: "Read the local Wiktionary database and transcribe episodes with the existing Whisper install.",
              done: true,
            },
            {
              phase: "Phase 4",
              title: "Vocabulary",
              body: "Click words in a transcript, pause for the definition and Arabic translation, then save words with their source context.",
              done: true,
            },
            {
              phase: "Phase 5",
              title: "Shadowing",
              body: "Loop transcript lines, record takes with your microphone, and compare them locally.",
              done: true,
            },
            {
              phase: "Later",
              title: "Study and offline",
              body: "Spaced repetition, OPML import/export, offline audio, and an Android client.",
            },
          ].map((item) => (
            <div
              key={item.phase}
              className={`rounded-2xl border p-4 ${
                item.done ? "border-pine/30 bg-pine/5" : "border-line bg-bg"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted">
                  {item.phase}
                </span>
                {item.done ? <Badge tone="pine">Done</Badge> : <Badge tone="outline">Planned</Badge>}
              </div>
              <h3 className="mt-2 font-serif text-lg text-fg">{item.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{item.body}</p>
            </div>
          ))}
        </div>
        <Notice className="mt-4">
          Phase 5 remains a local web app; no mobile build has been started.
        </Notice>
      </section>
    </div>
  );
}
