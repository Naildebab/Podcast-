import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatDate, formatDuration } from "../lib/format";
import type { Podcast, ResolveResponse } from "../lib/types";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Cover } from "./Cover";
import { ExternalIcon, LinkIcon, LoaderIcon, PlusIcon } from "./Icons";
import { Modal } from "./Modal";
import { Notice, Skeleton } from "./Notice";

export function AddFeedForm({
  onResolved,
  compact = false,
}: {
  onResolved: (result: ResolveResponse) => void;
  compact?: boolean;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const address = value.trim();
    if (!address) {
      setError("Paste a podcast website or RSS address first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.resolve(address);
      onResolved(result);
      setValue("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The feed could not be read.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor={compact ? "feed-url-compact" : "feed-url"} className="eyebrow block">
        RSS or website address
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <LinkIcon
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            id={compact ? "feed-url-compact" : "feed-url"}
            type="url"
            inputMode="url"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="https://example.com/podcast"
            className="h-11 w-full rounded-full border border-line bg-bg pl-10 pr-4 text-sm text-fg outline-none transition placeholder:text-muted/80 focus:border-accent"
            disabled={busy}
          />
        </div>
        <Button type="submit" variant="secondary" loading={busy} className="sm:shrink-0">
          {busy ? "Looking" : "Find feed"}
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        Paste a podcast website and the studio will follow its published RSS link. No
        API key or account is used.
      </p>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </form>
  );
}

export function FeedPreviewModal({
  open,
  onClose,
  data,
  loading,
  error,
  existingId = null,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  data: ResolveResponse | null;
  loading: boolean;
  error: string | null;
  existingId?: number | null;
  onAdded: (podcast: Podcast) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [added, setAdded] = useState<Podcast | null>(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setAddError(null);
      setAdded(null);
    }
  }, [open]);

  useEffect(() => {
    setAddError(null);
  }, [data]);

  async function add() {
    if (!data) return;
    setBusy(true);
    setAddError(null);
    try {
      const result = await api.addPodcast(data.feedUrl);
      setAdded(result.podcast);
      onAdded(result.podcast);
    } catch (caught) {
      setAddError(caught instanceof Error ? caught.message : "The podcast could not be added.");
    } finally {
      setBusy(false);
    }
  }

  const libraryId = added?.id ?? existingId;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Preview podcast"
      footer={
        data ? (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Close
            </Button>
            {libraryId ? (
              <Link
                to={`/library/${libraryId}`}
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-4.5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong"
              >
                Open podcast
              </Link>
            ) : (
              <Button onClick={add} loading={busy}>
                <PlusIcon size={16} /> Add to library
              </Button>
            )}
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {loading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-6 text-sm text-muted">
          <LoaderIcon size={18} className="animate-spin" />
          Reading the feed and its latest episodes…
        </div>
      ) : error ? (
        <Notice tone="error">{error}</Notice>
      ) : data ? (
        <div className="space-y-5">
          {addError ? <Notice tone="error">{addError}</Notice> : null}
          {added ? (
            <Notice tone="success">Added “{added.title}” to your library.</Notice>
          ) : null}

          <div className="flex flex-col gap-4 sm:flex-row">
            <Cover
              src={data.feed.imageUrl}
              alt={`${data.feed.title} cover`}
              title={data.feed.title}
              className="h-32 w-32 shrink-0 rounded-2xl"
              eager
            />
            <div className="min-w-0">
              <h3 className="font-serif text-2xl leading-tight text-fg">{data.feed.title}</h3>
              <p className="mt-1 text-sm font-medium text-pine">{data.feed.author}</p>
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">
                {data.feed.description}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone="neutral">
                  {data.feed.episodeCount}{" "}
                  {data.feed.episodeCount === 1 ? "episode" : "episodes"}
                </Badge>
                {data.feed.language ? <Badge tone="outline">{data.feed.language}</Badge> : null}
                {data.feed.websiteUrl ? (
                  <a
                    href={data.feed.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-pine hover:underline"
                  >
                    Website <ExternalIcon size={13} />
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-bg px-4 py-3">
            <p className="eyebrow">Resolved feed</p>
            <code className="mt-1 block break-all text-xs text-muted">{data.feedUrl}</code>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-serif text-lg text-fg">Latest episodes</h4>
              <span className="text-xs text-muted">First {data.feed.episodes.length} shown</span>
            </div>
            <div className="mt-3 divide-y divide-line rounded-2xl border border-line bg-bg">
              {data.feed.episodes.length === 0 ? (
                <p className="px-4 py-5 text-sm text-muted">
                  This feed has no audio episodes yet.
                </p>
              ) : (
                data.feed.episodes.map((episode) => (
                  <div
                    key={episode.guid}
                    className="flex items-start justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-medium text-fg">{episode.title}</p>
                      <p className="mt-0.5 text-[0.7rem] text-muted">
                        {formatDate(episode.publishedAt)} · {formatDuration(episode.durationSec)}
                      </p>
                    </div>
                    {episode.transcriptUrl ? <Badge tone="pine">Transcript</Badge> : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <p className="text-xs leading-relaxed text-muted">
            This preview was fetched from the publisher just now. Nothing is stored until
            you add it to your library.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
