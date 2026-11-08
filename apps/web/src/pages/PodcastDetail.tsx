import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Cover } from "../components/Cover";
import { EpisodeRow } from "../components/EpisodeRow";
import {
  ArrowLeftIcon,
  ExternalIcon,
  ListIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from "../components/Icons";
import { ConfirmDialog } from "../components/Modal";
import { EmptyState, ErrorPanel, Notice, Skeleton } from "../components/Notice";
import { Pagination } from "../components/Pagination";
import { api } from "../lib/api";
import { formatDate, percent, timeAgo } from "../lib/format";
import { useAsync, useDebounced, useDocumentTitle } from "../lib/hooks";
import type { ProgressStatus } from "../lib/types";

type StatusFilter = "all" | ProgressStatus;

export function PodcastDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const podcastId = Number(id);
  const validId = Number.isInteger(podcastId) && podcastId > 0;

  const podcast = useAsync(
    () => (validId ? api.podcast(podcastId) : Promise.reject(new Error("Invalid podcast id."))),
    [podcastId, validId],
  );
  useDocumentTitle(podcast.data?.podcast.title ?? "Podcast");

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setOffset(0);
  }, [debouncedQuery, status]);

  const episodes = useAsync(
    () =>
      validId
        ? api.episodes({
            podcastId,
            q: debouncedQuery.trim() || undefined,
            status: status === "all" ? undefined : status,
            limit: 50,
            offset,
          })
        : Promise.reject(new Error("Invalid podcast id.")),
    [podcastId, validId, debouncedQuery, status, offset],
  );

  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function refresh() {
    if (!podcast.data) return;
    setRefreshing(true);
    setNotice(null);
    setRefreshError(null);
    try {
      const result = await api.refreshPodcast(podcastId);
      setNotice(
        `Refreshed “${result.podcast.title}”. ${result.podcast.episodeCount} episodes are now saved.`,
      );
      podcast.reload();
      episodes.reload();
    } catch (caught) {
      setRefreshError(caught instanceof Error ? caught.message : "The feed could not be refreshed.");
    } finally {
      setRefreshing(false);
    }
  }

  async function remove() {
    if (!podcast.data) return;
    setRemoving(true);
    try {
      await api.deletePodcast(podcastId);
      navigate("/library", {
        state: { notice: `Removed “${podcast.data.podcast.title}” from your library.` },
      });
    } catch (caught) {
      setRefreshError(caught instanceof Error ? caught.message : "The podcast could not be removed.");
      setRemoving(false);
      setRemoveOpen(false);
    }
  }

  if (!validId) {
    return <ErrorPanel message="That podcast id is not valid." />;
  }

  if (podcast.error && !podcast.data) {
    return <ErrorPanel message={podcast.error} onRetry={podcast.reload} />;
  }

  if (podcast.loading && !podcast.data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-4 w-28" />
        <div className="flex gap-5">
          <Skeleton className="h-40 w-40 shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </div>
    );
  }

  const show = podcast.data?.podcast;
  if (!show) return <ErrorPanel message="That podcast could not be found." />;

  const progress = percent(show.completedCount, show.episodeCount);
  const totalEpisodes = episodes.data?.total ?? show.episodeCount;

  function changePage(next: number) {
    setOffset(next);
    window.requestAnimationFrame(() => {
      document.getElementById("episode-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="space-y-8">
      <Link
        to="/library"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-fg"
      >
        <ArrowLeftIcon size={15} /> My podcasts
      </Link>

      {notice ? (
        <Notice tone="success" className="animate-rise">
          {notice}
        </Notice>
      ) : null}
      {refreshError ? <Notice tone="error">{refreshError}</Notice> : null}

      <section className="animate-rise flex flex-col gap-6 sm:flex-row">
        <Cover
          src={show.imageUrl}
          alt={`${show.title} cover`}
          title={show.title}
          className="h-40 w-40 shrink-0 rounded-3xl shadow-soft sm:h-48 sm:w-48"
          eager
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow">Podcast</p>
            {show.language ? <Badge tone="outline">{show.language}</Badge> : null}
            <Badge tone="pine">{show.episodeCount} episodes</Badge>
          </div>
          <h1 className="mt-2 font-serif text-3xl leading-[1.05] text-fg sm:text-5xl">{show.title}</h1>
          <p className="mt-2 text-sm font-semibold text-pine">{show.author}</p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{show.description}</p>

          <div className="mt-4 max-w-sm">
            <div className="flex items-center justify-between text-[0.68rem] text-muted">
              <span>
                {show.completedCount} of {show.episodeCount} complete
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-pine" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={refresh} loading={refreshing}>
              <RefreshIcon size={16} /> Refresh feed
            </Button>
            {show.websiteUrl ? (
              <a
                href={show.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-fg transition hover:bg-surface-2"
              >
                <ExternalIcon size={15} /> Website
              </a>
            ) : null}
            <Button variant="ghost" onClick={() => setRemoveOpen(true)}>
              <TrashIcon size={16} /> Remove
            </Button>
          </div>

          <p className="mt-4 text-[0.65rem] text-muted">
            Added {formatDate(show.createdAt)} · Updated {timeAgo(show.lastRefreshedAt)}
          </p>
        </div>
      </section>

      <section className="animate-rise delay-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow flex items-center gap-1.5">
              <ListIcon size={14} /> Episodes
            </p>
            <h2 className="mt-1 font-serif text-3xl text-fg">
              {totalEpisodes} {totalEpisodes === 1 ? "episode" : "episodes"}
            </h2>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <SearchIcon
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search episode titles and notes…"
              aria-label="Search this podcast's episodes"
              className="h-10 w-full rounded-full border border-line bg-bg pl-10 pr-4 text-sm text-fg outline-none transition placeholder:text-muted/80 focus:border-accent"
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="h-10 rounded-full border border-line bg-bg px-4 text-xs font-semibold text-fg outline-none"
            aria-label="Filter episodes by progress"
          >
            <option value="all">All episodes</option>
            <option value="new">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {episodes.error ? (
          <ErrorPanel message={episodes.error} onRetry={episodes.reload} className="mt-4" />
        ) : null}

        <div
          id="episode-list"
          className="mt-4 scroll-mt-24 rounded-3xl border border-line bg-surface p-2 sm:p-3"
        >
          {episodes.loading && !episodes.data ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3, 4].map((item) => (
                <Skeleton key={item} className="h-16" />
              ))}
            </div>
          ) : episodes.data && episodes.data.episodes.length > 0 ? (
            <div className="divide-y divide-line/70">
              {episodes.data.episodes.map((episode) => (
                <EpisodeRow key={episode.id} episode={episode} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ListIcon size={22} />}
              title={totalEpisodes === 0 ? "No episodes yet" : "No episodes match"}
              body={
                totalEpisodes === 0
                  ? "Refresh the feed to look for new audio episodes."
                  : "Try another search or change the progress filter."
              }
              action={
                totalEpisodes === 0 ? (
                  <Button variant="secondary" onClick={refresh} loading={refreshing}>
                    <RefreshIcon size={16} /> Refresh feed
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setQuery("");
                      setStatus("all");
                    }}
                  >
                    Clear filters
                  </Button>
                )
              }
              className="border-0 bg-transparent"
            />
          )}
        </div>

        {episodes.data ? (
          <Pagination
            offset={offset}
            limit={50}
            total={episodes.data.total}
            loading={episodes.loading}
            onChange={changePage}
          />
        ) : null}
      </section>

      <ConfirmDialog
        open={removeOpen}
        title="Remove podcast?"
        message={
          <>
            Remove <strong className="text-fg">{show.title}</strong> and its saved episodes
            from this library? Playback positions for those episodes will be deleted too.
            Audio files were never downloaded.
          </>
        }
        confirmLabel="Remove podcast"
        busy={removing}
        onConfirm={remove}
        onClose={() => setRemoveOpen(false)}
      />
    </div>
  );
}
