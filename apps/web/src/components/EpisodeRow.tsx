import { Link } from "react-router-dom";
import type { Episode } from "../lib/types";
import { formatDate, formatDuration, formatTime, percent } from "../lib/format";
import { usePlayerActions, usePlayerSnapshot } from "../player/PlayerContext";
import { Badge } from "./Badge";
import { Cover } from "./Cover";
import { ArrowRightIcon, PauseIcon, PlayIcon } from "./Icons";

function statusBadge(status: Episode["status"]) {
  if (status === "completed") return <Badge tone="pine">Completed</Badge>;
  if (status === "in_progress") return <Badge tone="accent">In progress</Badge>;
  return <Badge tone="outline">New</Badge>;
}

export function EpisodeRow({
  episode,
  showPodcast = false,
}: {
  episode: Episode;
  showPodcast?: boolean;
}) {
  const { episode: current, playing } = usePlayerSnapshot();
  const { play } = usePlayerActions();
  const isCurrent = current?.id === episode.id;
  const isPlaying = isCurrent && playing;
  const positionSec = episode.positionMs / 1000;
  const progress = percent(positionSec, episode.durationSec ?? 0);

  return (
    <div
      className={`group flex items-start gap-3 rounded-2xl border p-2.5 transition ${
        isCurrent
          ? "border-accent/30 bg-accent-soft/40"
          : "border-transparent hover:border-line hover:bg-surface"
      }`}
    >
      <button
        type="button"
        onClick={() => play(episode)}
        aria-label={`${isPlaying ? "Pause" : "Play"} ${episode.title}`}
        className="relative shrink-0 rounded-xl"
      >
        <Cover
          src={episode.imageUrl}
          alt=""
          title={episode.podcastTitle}
          className="h-14 w-14 rounded-xl transition duration-200 group-hover:scale-[1.03]"
        />
        <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white shadow ring-2 ring-bg">
          {isPlaying ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
        </span>
      </button>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Link
            to={`/episodes/${episode.id}`}
            className="line-clamp-2 text-sm font-semibold leading-snug text-fg transition hover:text-accent"
          >
            {episode.title}
          </Link>
          <span className="shrink-0">{statusBadge(episode.status)}</span>
        </div>

        {showPodcast ? (
          <Link
            to={`/library/${episode.podcastId}`}
            className="mt-1 block truncate text-xs font-medium text-pine hover:underline"
          >
            {episode.podcastTitle}
          </Link>
        ) : null}

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.7rem] text-muted">
          <span>{formatDate(episode.publishedAt)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatDuration(episode.durationSec)}</span>
          {positionSec > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-accent">
                Resume at {formatTime(positionSec)}
              </span>
            </>
          ) : null}
        </div>

        {progress > 0 ? (
          <div
            className="mt-2 h-1 overflow-hidden rounded-full bg-line"
            aria-label={`${Math.round(progress)} percent listened`}
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}
      </div>

      <Link
        to={`/episodes/${episode.id}`}
        aria-label={`Open ${episode.title}`}
        className="mt-1 self-center rounded-full p-1.5 text-muted opacity-0 transition hover:bg-surface-2 hover:text-fg group-hover:opacity-100"
      >
        <ArrowRightIcon size={17} />
      </Link>
    </div>
  );
}
