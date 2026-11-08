import type { CSSProperties } from "react";
import { formatTime } from "../lib/format";
import type { Episode } from "../lib/types";
import { PLAYBACK_RATES, usePlayer } from "../player/PlayerContext";
import { Badge } from "./Badge";
import { Cover } from "./Cover";
import {
  ForwardIcon,
  MuteIcon,
  PauseIcon,
  PlayIcon,
  RewindIcon,
  VolumeIcon,
} from "./Icons";

export function FullPlayer({ episode }: { episode: Episode }) {
  const player = usePlayer();
  const isCurrent = player.episode?.id === episode.id;
  const playing = isCurrent && player.playing;
  const current = isCurrent ? player.currentTime : episode.positionMs / 1000;
  const duration = isCurrent ? player.duration : (episode.durationSec ?? 0);
  const percent = duration > 0 ? Math.min(Math.max((current / duration) * 100, 0), 100) : 0;
  const sliderStyle = { "--pct": `${percent}%` } as CSSProperties;
  const stateLabel = playing
    ? "Now playing"
    : isCurrent
      ? "Loaded in player"
      : "Ready to listen";
  const statusLabel = isCurrent
    ? playing
      ? "Playing"
      : "Paused"
    : episode.status === "completed"
      ? "Completed"
      : episode.status === "in_progress"
        ? "In progress"
        : "Not started";
  const statusTone = playing
    ? "accent"
    : isCurrent
      ? "outline"
      : episode.status === "completed"
        ? "pine"
        : "outline";

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-soft">
      <div className="border-b border-line bg-surface-2/45 px-5 py-3 sm:px-7">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">{stateLabel}</span>
          <div className="flex items-center gap-2">
            {episode.transcriptUrl ? <Badge tone="pine">Transcript in feed</Badge> : null}
            <Badge tone={statusTone}>{statusLabel}</Badge>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Cover
            src={episode.imageUrl}
            alt={`${episode.title} artwork`}
            title={episode.podcastTitle}
            className="h-28 w-28 shrink-0 rounded-2xl shadow-sm sm:h-32 sm:w-32"
            eager
          />
          <div className="min-w-0">
            <p className="eyebrow">{episode.podcastTitle}</p>
            <h2 className="mt-2 font-serif text-2xl leading-tight text-fg sm:text-3xl">
              {episode.title}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {duration > 0 ? `${formatTime(duration)} total` : "Duration not listed"}
              {episode.positionMs > 0 && !isCurrent
                ? ` · resume at ${formatTime(episode.positionMs / 1000)}`
                : ""}
            </p>
          </div>
        </div>

        <div className="mt-7">
          <input
            className="range"
            type="range"
            min={0}
            max={Math.max(duration, 0)}
            step={1}
            value={Math.min(current, duration || 0)}
            onChange={(event) => player.seek(Number(event.target.value))}
            style={sliderStyle}
            aria-label="Seek in episode"
            disabled={!isCurrent || duration <= 0}
          />
          <div className="mt-2 flex items-center justify-between text-xs tabular-nums text-muted">
            <span>{formatTime(current)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => player.skip(-15)}
            disabled={!isCurrent}
            aria-label="Back 15 seconds"
            className="rounded-full border border-line p-2.5 text-muted transition hover:bg-surface-2 hover:text-fg disabled:opacity-40"
          >
            <RewindIcon size={21} />
          </button>
          <button
            type="button"
            onClick={() => player.play(episode)}
            aria-label={playing ? "Pause episode" : "Play episode"}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-sm transition hover:bg-accent-strong"
          >
            {isCurrent && player.loading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : playing ? (
              <PauseIcon size={24} />
            ) : (
              <PlayIcon size={24} />
            )}
          </button>
          <button
            type="button"
            onClick={() => player.skip(30)}
            disabled={!isCurrent}
            aria-label="Skip forward 30 seconds"
            className="rounded-full border border-line p-2.5 text-muted transition hover:bg-surface-2 hover:text-fg disabled:opacity-40"
          >
            <ForwardIcon size={21} />
          </button>

          <div className="ml-1 flex items-center gap-2">
            <label className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">
              Speed
              <select
                value={player.rate}
                onChange={(event) => player.setRate(Number(event.target.value))}
                className="ml-1.5 rounded-full border border-line bg-bg px-2.5 py-1.5 text-xs font-semibold text-fg outline-none"
                aria-label="Playback speed"
              >
                {PLAYBACK_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}×
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={player.toggleMute}
              aria-label={player.muted ? "Unmute" : "Mute"}
              className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
            >
              {player.muted ? <MuteIcon size={19} /> : <VolumeIcon size={19} />}
            </button>
            <input
              className="range w-24"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={player.muted ? 0 : player.volume}
              onChange={(event) => player.setVolume(Number(event.target.value))}
              style={{
                "--pct": `${(player.muted ? 0 : player.volume) * 100}%`,
              } as CSSProperties}
              aria-label="Volume"
            />
          </div>
        </div>

        {isCurrent && player.error ? (
          <p className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">
            {player.error}
          </p>
        ) : (
          <p className="mt-4 text-[0.68rem] leading-relaxed text-muted">
            Space play/pause · ←/→ 10 seconds · [ / ] speed · M mute
          </p>
        )}
      </div>
    </section>
  );
}
