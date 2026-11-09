import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatTime, percent } from "../lib/format";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import type { CatalogPodcast, Episode } from "../lib/types";
import { usePlayerActions, usePlayerSnapshot } from "../player/PlayerContext";
import { Cover } from "../components/Cover";
import { EpisodeRow } from "../components/EpisodeRow";
import { ErrorPanel, EmptyState, Skeleton } from "../components/Notice";
import {
  ArrowRightIcon,
  CompassIcon,
  HeadphonesIcon,
  PauseIcon,
  PlayIcon,
  SparklesIcon,
} from "../components/Icons";
import { Badge } from "../components/Badge";

function ContinueCard({ episode }: { episode: Episode }) {
  const { episode: current, playing } = usePlayerSnapshot();
  const { play } = usePlayerActions();
  const isCurrent = current?.id === episode.id;
  const isPlaying = isCurrent && playing;
  const progress = percent(episode.positionMs / 1000, episode.durationSec ?? 0);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-bg/70 p-3">
      <Link to={`/episodes/${episode.id}`} className="shrink-0">
        <Cover
          src={episode.imageUrl}
          alt=""
          title={episode.podcastTitle}
          className="h-16 w-16 rounded-xl"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-pine">
          {episode.podcastTitle}
        </p>
        <Link
          to={`/episodes/${episode.id}`}
          className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-fg hover:text-accent"
        >
          {episode.title}
        </Link>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-1 text-[0.65rem] text-muted">
          {formatTime(episode.positionMs / 1000)} listened
        </p>
      </div>
      <button
        type="button"
        onClick={() => play(episode)}
        aria-label={isPlaying ? "Pause" : "Resume"}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition hover:bg-accent-strong"
      >
        {isPlaying ? <PauseIcon size={17} /> : <PlayIcon size={17} />}
      </button>
    </div>
  );
}

function MiniCatalog({ item }: { item: CatalogPodcast }) {
  return (
    <Link
      to={`/discover?q=${encodeURIComponent(item.title)}`}
      className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition hover:-translate-y-0.5 hover:shadow-soft"
    >
      <Cover
        src={item.imageUrl}
        alt=""
        title={item.title}
        className="h-16 w-16 shrink-0 rounded-xl"
      />
      <div className="min-w-0">
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted">
          {item.level}
        </p>
        <h4 className="mt-0.5 line-clamp-2 font-serif text-base leading-tight text-fg group-hover:text-accent">
          {item.title}
        </h4>
        <p className="mt-0.5 truncate text-xs text-muted">{item.author}</p>
      </div>
      <ArrowRightIcon size={16} className="ml-auto shrink-0 text-muted" />
    </Link>
  );
}

export function Home() {
  useDocumentTitle("Home");
  const home = useAsync(() => api.home(), []);
  const catalog = useAsync(() => api.catalog({ category: "English learning" }), []);

  const stats = home.data?.stats;
  const picks = catalog.data?.podcasts.slice(0, 3) ?? [];

  return (
    <div className="space-y-10">
      <section className="animate-rise relative overflow-hidden rounded-[2rem] border border-line bg-surface p-6 shadow-soft sm:p-9 md:p-12">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-line/70" />
        <div className="pointer-events-none absolute -right-4 -top-10 h-48 w-48 rounded-full border border-line/60" />
        <div className="relative max-w-2xl">
          <p className="eyebrow">Your listening desk · Phase 4</p>
          <h1 className="mt-4 font-serif text-4xl leading-[1.02] text-fg sm:text-5xl md:text-6xl">
            Listen closely.
            <br />
            <span className="text-accent">Learn naturally.</span>
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            Real podcasts, a calm player, and a library that remembers exactly where you
            stopped. Everything stays on this computer — no account, no cloud, no API keys.
          </p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link
              to="/discover"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            >
              <CompassIcon size={17} /> Find a podcast
            </Link>
            <Link
              to="/library"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-3 text-sm font-semibold text-fg transition hover:bg-surface-2"
            >
              Open my library
            </Link>
          </div>
          <div className="mt-8 grid max-w-md grid-cols-3 gap-3">
            {[
              ["Podcasts", stats?.podcasts ?? 0],
              ["Episodes", stats?.episodes ?? 0],
              ["Completed", stats?.completed ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-line bg-bg/55 px-3 py-2.5">
                <p className="font-serif text-2xl leading-none text-fg">{value}</p>
                <p className="mt-1 text-[0.6rem] font-bold uppercase tracking-[0.15em] text-muted">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-10 right-10 hidden items-end gap-2 lg:flex">
          {[20, 38, 56, 30, 48, 68, 42, 26, 18].map((height, index) => (
            <span
              key={index}
              className="sound-bar w-2.5 rounded-full bg-accent/65"
              style={{ height: `${height}px`, animationDelay: `${index * 0.12}s` }}
            />
          ))}
        </div>
      </section>

      {home.error ? (
        <ErrorPanel message={home.error} onRetry={home.reload} />
      ) : null}

      <section className="animate-rise delay-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Pick up where you left off</p>
            <h2 className="mt-1 font-serif text-3xl text-fg">Continue listening</h2>
          </div>
          <Link to="/episodes" className="text-xs font-semibold text-pine hover:underline">
            View every episode
          </Link>
        </div>

        <div className="mt-4">
          {home.loading && !home.data ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : home.data && home.data.continueListening.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {home.data.continueListening.map((episode) => (
                <ContinueCard key={episode.id} episode={episode} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-surface/50 px-5 py-6 text-sm text-muted">
              Nothing is in progress yet. Play an episode and the studio will keep your
              position here.
            </div>
          )}
        </div>
      </section>

      <section className="animate-rise delay-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Fresh from your library</p>
            <h2 className="mt-1 font-serif text-3xl text-fg">Recent episodes</h2>
          </div>
          <Link to="/episodes" className="text-xs font-semibold text-pine hover:underline">
            All episodes
          </Link>
        </div>

        <div className="mt-4 rounded-3xl border border-line bg-surface p-2 sm:p-3">
          {home.loading && !home.data ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : home.data && home.data.recent.length > 0 ? (
            <div className="divide-y divide-line/70">
              {home.data.recent.slice(0, 5).map((episode) => (
                <EpisodeRow key={episode.id} episode={episode} showPodcast />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<HeadphonesIcon size={24} />}
              title="Your listening desk is empty"
              body="Add a podcast feed and its latest episodes will appear here. The starter catalog is hand-checked and needs no API key."
              action={
                <Link
                  to="/discover"
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong"
                >
                  <CompassIcon size={16} /> Browse the catalog
                </Link>
              }
              className="border-0 bg-transparent py-8"
            />
          )}
        </div>
      </section>

      <section className="animate-rise delay-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow flex items-center gap-1.5">
              <SparklesIcon size={13} /> Hand-checked starter set
            </p>
            <h2 className="mt-1 font-serif text-3xl text-fg">Good places to begin</h2>
          </div>
          <Link to="/discover" className="text-xs font-semibold text-pine hover:underline">
            Explore the full catalog
          </Link>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {catalog.loading && !catalog.data
            ? [1, 2, 3].map((item) => <Skeleton key={item} className="h-24" />)
            : picks.map((item) => <MiniCatalog key={item.id} item={item} />)}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone="pine">No API keys</Badge>
          <span>Curated public feeds plus standards-based RSS autodiscovery.</span>
        </div>
      </section>
    </div>
  );
}
