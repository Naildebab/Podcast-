import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { EpisodeRow } from "../components/EpisodeRow";
import { CompassIcon, ListIcon, SearchIcon } from "../components/Icons";
import { Pagination } from "../components/Pagination";
import { EmptyState, ErrorPanel, Skeleton } from "../components/Notice";
import { api } from "../lib/api";
import { useAsync, useDebounced, useDocumentTitle } from "../lib/hooks";
import type { ProgressStatus } from "../lib/types";

type StatusFilter = "all" | ProgressStatus;

const tabs: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All episodes" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "new", label: "Not started" },
];

export function Episodes() {
  useDocumentTitle("All episodes");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setOffset(0);
  }, [debouncedQuery, status]);

  const episodes = useAsync(
    () =>
      api.episodes({
        q: debouncedQuery.trim() || undefined,
        status: status === "all" ? undefined : status,
        limit: 50,
        offset,
      }),
    [debouncedQuery, status, offset],
  );

  const total = episodes.data?.total ?? 0;

  function changePage(next: number) {
    setOffset(next);
    window.requestAnimationFrame(() => {
      document.getElementById("episode-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="space-y-7">
      <section className="animate-rise flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <ListIcon size={14} /> Every episode
          </p>
          <h1 className="mt-2 font-serif text-4xl leading-none text-fg sm:text-5xl">All episodes</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Search across every saved show. Positions and completion are stored per episode,
            so you can move between podcasts without losing your place.
          </p>
        </div>
        <p className="whitespace-nowrap text-xs font-semibold text-muted">
          {episodes.data ? `${total} found` : "Loading…"}
        </p>
      </section>

      <section className="animate-rise delay-1 rounded-3xl border border-line bg-surface p-3 sm:p-4">
        <div className="relative">
          <SearchIcon
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search episodes across your library…"
            aria-label="Search all episodes"
            className="h-12 w-full rounded-full border border-line bg-bg pl-11 pr-4 text-sm text-fg outline-none transition placeholder:text-muted/80 focus:border-accent"
          />
        </div>
        <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {tabs.map((tab) => {
            const active = status === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatus(tab.value)}
                aria-pressed={active}
                className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  active
                    ? "bg-fg text-bg"
                    : "border border-line bg-bg text-muted hover:bg-surface-2 hover:text-fg"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {episodes.error ? <ErrorPanel message={episodes.error} onRetry={episodes.reload} /> : null}

      <section
        id="episode-list"
        className="animate-rise delay-2 scroll-mt-24 rounded-3xl border border-line bg-surface p-2 sm:p-3"
      >
        {episodes.loading && !episodes.data ? (
          <div className="space-y-2 p-2">
            {[1, 2, 3, 4, 5].map((item) => (
              <Skeleton key={item} className="h-16" />
            ))}
          </div>
        ) : episodes.data && episodes.data.episodes.length > 0 ? (
          <div className="divide-y divide-line/70">
            {episodes.data.episodes.map((episode) => (
              <EpisodeRow key={episode.id} episode={episode} showPodcast />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<ListIcon size={22} />}
            title={total === 0 && !query ? "No episodes yet" : "No episodes match"}
            body={
              total === 0 && !query
                ? "Add a podcast and refresh its feed. New audio episodes will appear here, newest first."
                : "Try a different search, or switch back to all episodes."
            }
            action={
              total === 0 && !query ? (
                <Link
                  to="/discover"
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong"
                >
                  <CompassIcon size={16} /> Find a podcast
                </Link>
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
      </section>

      {episodes.data ? (
        <Pagination
          offset={offset}
          limit={50}
          total={episodes.data.total}
          loading={episodes.loading}
          onChange={changePage}
        />
      ) : null}
    </div>
  );
}
