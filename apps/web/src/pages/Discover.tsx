import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AddFeedForm, FeedPreviewModal } from "../components/AddFeed";
import { Button } from "../components/Button";
import { CatalogCard } from "../components/Cards";
import {
  CloseIcon,
  CompassIcon,
  SearchIcon,
  SparklesIcon,
} from "../components/Icons";
import { EmptyState, ErrorPanel, Notice, Skeleton } from "../components/Notice";
import { api } from "../lib/api";
import { useAsync, useDebounced, useDocumentTitle } from "../lib/hooks";
import type { CatalogPodcast, Podcast, ResolveResponse } from "../lib/types";

const DEFAULT_CATEGORIES = ["English learning", "News", "Technology", "Culture"];

export function Discover() {
  useDocumentTitle("Discover");
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [category, setCategory] = useState("All");
  const [level, setLevel] = useState("all");
  const debouncedQuery = useDebounced(query);

  const catalog = useAsync(
    () =>
      api.catalog({
        q: debouncedQuery.trim() || undefined,
        category: category === "All" ? undefined : category,
        level: level === "all" ? undefined : level,
      }),
    [debouncedQuery, category, level],
  );

  const [preview, setPreview] = useState<ResolveResponse | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const categories = catalog.data?.categories ?? DEFAULT_CATEGORIES;

  async function previewCatalog(item: CatalogPodcast) {
    setPreviewOpen(true);
    setPreview(null);
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await api.resolve(item.feedUrl);
      setPreview(result);
    } catch (caught) {
      setPreviewError(caught instanceof Error ? caught.message : "The feed could not be read.");
    } finally {
      setPreviewLoading(false);
    }
  }

  function previewResolved(result: ResolveResponse) {
    setPreview(result);
    setPreviewError(null);
    setPreviewLoading(false);
    setPreviewOpen(true);
  }

  function handleAdded(podcast: Podcast) {
    setNotice(`Added “${podcast.title}” to your library.`);
    setPreviewOpen(false);
    catalog.reload();
  }

  const existingId =
    preview && catalog.data
      ? (catalog.data.podcasts.find((item) => item.feedUrl === preview.feedUrl)?.libraryId ??
        null)
      : null;

  return (
    <div className="space-y-8">
      <section className="animate-rise grid gap-6 lg:grid-cols-[1fr_380px] lg:items-end">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <CompassIcon size={14} /> Discover
          </p>
          <h1 className="mt-2 font-serif text-4xl leading-[1.05] text-fg sm:text-5xl">
            Find your next listen.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            A hand-checked starter catalog of public podcast feeds, plus standards-based RSS
            discovery. Search a topic or paste any podcast website. No accounts and no API
            keys.
          </p>
        </div>

        <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
          <div className="flex items-center gap-2">
            <SparklesIcon size={17} className="text-accent" />
            <h2 className="font-serif text-xl text-fg">Add a feed</h2>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Paste a feed URL or a podcast website. The studio follows the site's declared
            RSS link.
          </p>
          <div className="mt-4">
            <AddFeedForm onResolved={previewResolved} compact />
          </div>
        </div>
      </section>

      {notice ? (
        <Notice tone="success" className="animate-rise">
          {notice}
        </Notice>
      ) : null}

      <section className="animate-rise delay-1 rounded-3xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <SearchIcon
              size={19}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search shows, topics, or accents…"
              aria-label="Search the starter catalog"
              className="h-12 w-full rounded-full border border-line bg-bg pl-11 pr-11 text-sm text-fg outline-none transition placeholder:text-muted/80 focus:border-accent"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg"
              >
                <CloseIcon size={16} />
              </button>
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-muted">
            <span className="sr-only">Filter by level</span>
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              className="h-11 rounded-full border border-line bg-bg px-4 text-xs font-semibold text-fg outline-none"
              aria-label="Filter by level"
            >
              <option value="all">All levels</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
        </div>

        <div className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto pb-1">
          {["All", ...categories].map((item) => {
            const active = category === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                aria-pressed={active}
                className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  active
                    ? "bg-fg text-bg"
                    : "border border-line bg-bg text-muted hover:bg-surface-2 hover:text-fg"
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>
      </section>

      {catalog.error ? (
        <ErrorPanel message={catalog.error} onRetry={catalog.reload} />
      ) : null}

      <section className="animate-rise delay-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Starter catalog</p>
            <h2 className="mt-1 font-serif text-3xl text-fg">
              {catalog.data
                ? `${catalog.data.total} ${catalog.data.total === 1 ? "show" : "shows"}`
                : "Shows"}
            </h2>
          </div>
          <p className="max-w-md text-right text-[0.68rem] leading-relaxed text-muted">
            Every feed is fetched live from its publisher. The catalog is a starting point,
            not a ranking.
          </p>
        </div>

        <div className="mt-4">
          {catalog.loading && !catalog.data ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((item) => (
                <div key={item} className="rounded-3xl border border-line bg-surface p-3">
                  <Skeleton className="aspect-square w-full" />
                  <Skeleton className="mt-4 h-5 w-3/4" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                  <Skeleton className="mt-3 h-3 w-full" />
                </div>
              ))}
            </div>
          ) : catalog.data && catalog.data.podcasts.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {catalog.data.podcasts.map((item) => (
                <CatalogCard key={item.id} item={item} onPreview={previewCatalog} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<SearchIcon size={22} />}
              title="No shows match that search"
              body="Try a broader topic, clear the filters, or paste the podcast's website above. The studio can follow any public RSS feed."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setCategory("All");
                    setLevel("all");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          )}
        </div>
      </section>

      <FeedPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        data={preview}
        loading={previewLoading}
        error={previewError}
        existingId={existingId}
        onAdded={handleAdded}
      />
    </div>
  );
}
