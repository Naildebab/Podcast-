import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AddFeedForm, FeedPreviewModal } from "../components/AddFeed";
import { Button } from "../components/Button";
import { PodcastCard } from "../components/Cards";
import {
  CompassIcon,
  LibraryIcon,
  PlusIcon,
  SearchIcon,
} from "../components/Icons";
import { EmptyState, ErrorPanel, Notice, Skeleton } from "../components/Notice";
import { api } from "../lib/api";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import type { Podcast, ResolveResponse } from "../lib/types";

export function Library() {
  useDocumentTitle("My podcasts");
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(
    (location.state as { notice?: string } | null)?.notice ?? null,
  );
  const [preview, setPreview] = useState<ResolveResponse | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const library = useAsync(() => api.podcasts(), []);
  const podcasts = library.data?.podcasts ?? [];
  const filtered = podcasts.filter((podcast) => {
    const value = query.trim().toLowerCase();
    if (!value) return true;
    return `${podcast.title} ${podcast.author} ${podcast.description}`
      .toLowerCase()
      .includes(value);
  });

  function previewResolved(result: ResolveResponse) {
    setPreview(result);
    setPreviewError(null);
    setPreviewLoading(false);
    setPreviewOpen(true);
  }

  function handleAdded(podcast: Podcast) {
    setNotice(`Added “${podcast.title}” to your library.`);
    setPreviewOpen(false);
    library.reload();
  }

  const existingId =
    preview && library.data
      ? (library.data.podcasts.find((podcast) => podcast.feedUrl === preview.feedUrl)?.id ?? null)
      : null;

  return (
    <div className="space-y-7">
      <section className="animate-rise flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <LibraryIcon size={14} /> My podcasts
          </p>
          <h1 className="mt-2 font-serif text-4xl leading-none text-fg sm:text-5xl">Your library</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            {podcasts.length > 0
              ? `${podcasts.length} ${podcasts.length === 1 ? "show" : "shows"} saved locally. Refresh a feed whenever you want new episodes.`
              : "Add a public podcast feed to begin. Your subscriptions and positions live in a local SQLite file."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/discover"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong"
          >
            <CompassIcon size={16} /> Find more
          </Link>
        </div>
      </section>

      {notice ? (
        <Notice tone="success" className="animate-rise">
          {notice}
        </Notice>
      ) : null}

      <section className="animate-rise delay-1 rounded-3xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 lg:w-64">
            <div className="flex items-center gap-2">
              <PlusIcon size={17} className="text-accent" />
              <h2 className="font-serif text-xl text-fg">Add a podcast</h2>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Paste an RSS feed or any podcast website. Nothing downloads until you press
              play.
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <AddFeedForm onResolved={previewResolved} compact />
          </div>
        </div>
      </section>

      {library.error ? <ErrorPanel message={library.error} onRetry={library.reload} /> : null}

      {podcasts.length > 0 ? (
        <div className="animate-rise delay-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <SearchIcon
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter your podcasts…"
              aria-label="Filter your podcasts"
              className="h-11 w-full rounded-full border border-line bg-surface pl-11 pr-4 text-sm text-fg outline-none transition placeholder:text-muted/80 focus:border-accent"
            />
          </div>
          <p className="text-xs text-muted">
            {filtered.length} of {podcasts.length}
          </p>
        </div>
      ) : null}

      <section>
        {library.loading && !library.data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="rounded-3xl border border-line bg-surface p-3">
                <Skeleton className="aspect-square w-full" />
                <Skeleton className="mt-4 h-5 w-3/4" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : podcasts.length === 0 ? (
          <EmptyState
            icon={<LibraryIcon size={24} />}
            title="No podcasts yet"
            body="Browse the hand-checked starter catalog, or paste a feed address above. You can always add a show later from its website."
            action={
              <Link
                to="/discover"
                className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong"
              >
                <CompassIcon size={16} /> Browse the catalog
              </Link>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<SearchIcon size={22} />}
            title="No matches in your library"
            body="Try a different word, or clear the filter to see every saved show."
            action={
              <Button variant="secondary" onClick={() => setQuery("")}>
                Clear filter
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((podcast) => (
              <PodcastCard key={podcast.id} podcast={podcast} />
            ))}
          </div>
        )}
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
