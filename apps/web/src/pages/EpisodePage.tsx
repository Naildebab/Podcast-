import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Cover } from "../components/Cover";
import { FullPlayer } from "../components/FullPlayer";
import {
  ArrowLeftIcon,
  BookIcon,
  CheckIcon,
  ClockIcon,
  ExternalIcon,
  LinkIcon,
  RefreshIcon,
} from "../components/Icons";
import { ErrorPanel, Notice, Skeleton } from "../components/Notice";
import { api } from "../lib/api";
import { formatDate, formatDuration, formatTime, percent } from "../lib/format";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import type { ProgressStatus } from "../lib/types";
import { usePlayerActions, usePlayerSnapshot } from "../player/PlayerContext";

export function EpisodePage() {
  const { id } = useParams();
  const episodeId = Number(id);
  const validId = Number.isInteger(episodeId) && episodeId > 0;

  const episodeRequest = useAsync(
    () => (validId ? api.episode(episodeId) : Promise.reject(new Error("Invalid episode id."))),
    [episodeId, validId],
  );
  useDocumentTitle(episodeRequest.data?.episode.title ?? "Episode");

  const player = usePlayerSnapshot();
  const actions = usePlayerActions();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyStatus, setBusyStatus] = useState<ProgressStatus | null>(null);

  async function setStatus(status: ProgressStatus) {
    const current = episodeRequest.data?.episode;
    if (!current) return;
    setBusyStatus(status);
    setNotice(null);
    setError(null);
    try {
      if (player.episode?.id === current.id) {
        actions.updateStatus(status);
      } else {
        await api.saveProgress(current.id, status === "in_progress" ? current.positionMs : 0, status);
      }
      setNotice(
        status === "completed"
          ? "Marked this episode as completed."
          : status === "new"
            ? "Progress reset. This episode is ready to start again."
            : "Episode marked as in progress.",
      );
      episodeRequest.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Progress could not be saved.");
    } finally {
      setBusyStatus(null);
    }
  }

  if (!validId) return <ErrorPanel message="That episode id is not valid." />;
  if (episodeRequest.error && !episodeRequest.data) {
    return <ErrorPanel message={episodeRequest.error} onRetry={episodeRequest.reload} />;
  }
  if (episodeRequest.loading && !episodeRequest.data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-5">
          <Skeleton className="h-28 w-28 shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const episode = episodeRequest.data?.episode;
  if (!episode) return <ErrorPanel message="That episode could not be found." />;

  const positionSec = episode.positionMs / 1000;
  const progress = percent(positionSec, episode.durationSec ?? 0);
  const isCurrent = player.episode?.id === episode.id;

  return (
    <div className="space-y-7">
      <Link
        to={`/library/${episode.podcastId}`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-fg"
      >
        <ArrowLeftIcon size={15} /> Back to {episode.podcastTitle}
      </Link>

      {notice ? (
        <Notice tone="success" className="animate-rise">
          {notice}
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <header className="animate-rise flex flex-col gap-5 sm:flex-row sm:items-center">
        <Cover
          src={episode.imageUrl}
          alt={`${episode.title} artwork`}
          title={episode.podcastTitle}
          className="h-28 w-28 shrink-0 rounded-2xl shadow-soft sm:h-32 sm:w-32"
          eager
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/library/${episode.podcastId}`}
              className="eyebrow text-pine hover:underline"
            >
              {episode.podcastTitle}
            </Link>
            <Badge tone={episode.status === "completed" ? "pine" : episode.status === "in_progress" ? "accent" : "outline"}>
              {episode.status === "completed"
                ? "Completed"
                : episode.status === "in_progress"
                  ? "In progress"
                  : "Not started"}
            </Badge>
          </div>
          <h1 className="mt-2 font-serif text-3xl leading-[1.08] text-fg sm:text-4xl md:text-5xl">
            {episode.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>{formatDate(episode.publishedAt)}</span>
            <span aria-hidden="true">·</span>
            <span>{formatDuration(episode.durationSec)}</span>
            {episode.transcriptUrl ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-pine">Transcript available</span>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="animate-rise delay-1 space-y-6">
          <FullPlayer episode={episode} />

          <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <BookIcon size={18} className="text-accent" />
              <h2 className="font-serif text-2xl text-fg">About this episode</h2>
            </div>
            <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted">
              {episode.description || "The publisher did not include episode notes for this audio."}
            </div>
          </section>
        </div>

        <aside className="animate-rise delay-2 space-y-4">
          <section className="rounded-3xl border border-line bg-surface p-5">
            <p className="eyebrow">Your progress</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="font-serif text-3xl leading-none text-fg">
                  {Math.round(progress)}%
                </p>
                <p className="mt-1 text-xs text-muted">
                  {positionSec > 0
                    ? `${formatTime(positionSec)} listened`
                    : "Not started yet"}
                </p>
              </div>
              <Badge
                tone={
                  episode.status === "completed"
                    ? "pine"
                    : episode.status === "in_progress"
                      ? "accent"
                      : "outline"
                }
              >
                {episode.status === "completed"
                  ? "Done"
                  : episode.status === "in_progress"
                    ? "Active"
                    : "New"}
              </Badge>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {episode.status !== "completed" ? (
                <Button
                  variant="secondary"
                  onClick={() => setStatus("completed")}
                  loading={busyStatus === "completed"}
                >
                  <CheckIcon size={16} /> Mark completed
                </Button>
              ) : null}
              {episode.status !== "new" ? (
                <Button
                  variant="ghost"
                  onClick={() => setStatus("new")}
                  loading={busyStatus === "new"}
                >
                  <RefreshIcon size={15} /> Reset progress
                </Button>
              ) : null}
              {!isCurrent ? (
                <p className="text-[0.65rem] leading-relaxed text-muted">
                  Press play above to load this episode into the player.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl border border-line bg-surface p-5">
            <div className="flex items-center gap-2">
              <LinkIcon size={17} className="text-pine" />
              <h2 className="font-serif text-xl text-fg">Transcript</h2>
            </div>
            {episode.transcriptUrl ? (
              <>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  This feed advertises a transcript
                  {episode.transcriptType ? ` (${episode.transcriptType})` : ""}. The
                  synchronized reading view is planned for Phase 2; the publisher's link is
                  available now.
                </p>
                <a
                  href={episode.transcriptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-pine hover:underline"
                >
                  Open transcript source <ExternalIcon size={13} />
                </a>
              </>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-muted">
                This feed does not advertise a transcript. Phase 2 will add local
                transcript import and line-synced playback.
              </p>
            )}
          </section>

          <section className="rounded-3xl border border-line bg-surface p-5">
            <div className="flex items-center gap-2">
              <ClockIcon size={17} className="text-muted" />
              <h2 className="font-serif text-xl text-fg">Details</h2>
            </div>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Published</dt>
                <dd className="text-right font-medium text-fg">{formatDate(episode.publishedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Duration</dt>
                <dd className="text-right font-medium text-fg">
                  {formatDuration(episode.durationSec)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Podcast</dt>
                <dd className="max-w-[10rem] truncate text-right font-medium text-fg">
                  {episode.podcastTitle}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Episode id</dt>
                <dd className="text-right font-mono text-fg">#{episode.id}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
