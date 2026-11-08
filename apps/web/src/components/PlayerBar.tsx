import type { CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { formatTime } from "../lib/format";
import { PLAYBACK_RATES, usePlayer } from "../player/PlayerContext";
import { Cover } from "./Cover";
import {
  CloseIcon,
  ForwardIcon,
  MuteIcon,
  PauseIcon,
  PlayIcon,
  RewindIcon,
  VolumeIcon,
} from "./Icons";

export function PlayerBar() {
  const player = usePlayer();
  const { pathname } = useLocation();
  const episode = player.episode;
  if (!episode) return null;

  // The full player on an episode page already has every control. Keep the
  // mini bar for every other page, and for a different episode while browsing.
  if (pathname === `/episodes/${episode.id}`) return null;

  const percent =
    player.duration > 0
      ? Math.min(Math.max((player.currentTime / player.duration) * 100, 0), 100)
      : 0;
  const sliderStyle = { "--pct": `${percent}%` } as CSSProperties;
  const error = player.error;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 shadow-[0_-16px_40px_-30px_rgba(0,0,0,0.6)] backdrop-blur-xl md:left-64">
      <div className="h-0.5 w-full bg-line">
        <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>

      {/* Compact mobile bar */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 md:hidden">
        <Link to={`/episodes/${episode.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
          <Cover
            src={episode.imageUrl}
            alt=""
            title={episode.podcastTitle}
            className="h-11 w-11 rounded-xl"
          />
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-fg">{episode.title}</span>
            <span className="mt-0.5 block truncate text-[0.65rem] text-muted">
              {error ?? episode.podcastTitle}
            </span>
          </span>
        </Link>
        <button
          type="button"
          onClick={player.toggle}
          aria-label={player.playing ? "Pause" : "Play"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white"
        >
          {player.loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : player.playing ? (
            <PauseIcon size={18} />
          ) : (
            <PlayIcon size={18} />
          )}
        </button>
        <button
          type="button"
          onClick={player.skip.bind(null, 30)}
          aria-label="Skip forward 30 seconds"
          className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
        >
          <ForwardIcon size={20} />
        </button>
        <button
          type="button"
          onClick={player.close}
          aria-label="Close player"
          className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {/* Desktop bar */}
      <div className="mx-auto hidden max-w-[1500px] items-center gap-4 px-5 py-3 md:flex">
        <Link
          to={`/episodes/${episode.id}`}
          className="flex min-w-0 items-center gap-3 md:w-56 lg:w-64"
        >
          <Cover
            src={episode.imageUrl}
            alt=""
            title={episode.podcastTitle}
            className="h-12 w-12 rounded-xl"
          />
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-fg">{episode.title}</span>
            <span className="mt-0.5 block truncate text-[0.65rem] text-muted">
              {episode.podcastTitle}
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={player.skip.bind(null, -15)}
            aria-label="Back 15 seconds"
            className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
          >
            <RewindIcon size={21} />
          </button>
          <button
            type="button"
            onClick={player.toggle}
            aria-label={player.playing ? "Pause" : "Play"}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-sm transition hover:bg-accent-strong"
          >
            {player.loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : player.playing ? (
              <PauseIcon size={18} />
            ) : (
              <PlayIcon size={18} />
            )}
          </button>
          <button
            type="button"
            onClick={player.skip.bind(null, 30)}
            aria-label="Skip forward 30 seconds"
            className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
          >
            <ForwardIcon size={21} />
          </button>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="w-10 text-right text-[0.65rem] tabular-nums text-muted">
            {formatTime(player.currentTime)}
          </span>
          <input
            className="range min-w-20 flex-1"
            type="range"
            min={0}
            max={Math.max(player.duration, 0)}
            step={1}
            value={Math.min(player.currentTime, player.duration || 0)}
            onChange={(event) => player.seek(Number(event.target.value))}
            style={sliderStyle}
            aria-label="Seek in episode"
            disabled={player.duration <= 0}
          />
          <span className="w-10 text-[0.65rem] tabular-nums text-muted">
            {formatTime(player.duration)}
          </span>
        </div>

        <label className="flex items-center gap-1.5 text-[0.65rem] font-semibold text-muted">
          <span className="sr-only">Playback speed</span>
          <select
            value={player.rate}
            onChange={(event) => player.setRate(Number(event.target.value))}
            className="rounded-full border border-line bg-bg px-2 py-1.5 text-[0.7rem] text-fg outline-none"
            aria-label="Playback speed"
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={player.toggleMute}
            aria-label={player.muted ? "Unmute" : "Mute"}
            className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
          >
            {player.muted ? <MuteIcon size={18} /> : <VolumeIcon size={18} />}
          </button>
          <input
            className="range w-20"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={player.muted ? 0 : player.volume}
            onChange={(event) => player.setVolume(Number(event.target.value))}
            style={{ "--pct": `${(player.muted ? 0 : player.volume) * 100}%` } as CSSProperties}
            aria-label="Volume"
          />
        </div>

        <button
          type="button"
          onClick={player.close}
          aria-label="Close player"
          className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {error ? (
        <div className="hidden px-5 pb-2 md:block">
          <p className="truncate text-[0.68rem] text-danger" role="status">
            {error}
          </p>
        </div>
      ) : null}
    </div>
  );
}
