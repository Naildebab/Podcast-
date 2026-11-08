import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Episode, ProgressStatus } from "../lib/types";

export interface PlayerSnapshot {
  episode: Episode | null;
  playing: boolean;
  loading: boolean;
  error: string | null;
  rate: number;
  volume: number;
  muted: boolean;
}

export interface PlayerTime {
  currentTime: number;
  duration: number;
}

export interface PlayerActions {
  play: (episode: Episode) => void;
  toggle: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  skip: (seconds: number) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  close: () => void;
  updateStatus: (status: ProgressStatus) => void;
}

export type PlayerApi = PlayerSnapshot & PlayerTime & PlayerActions;

export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

const PlayerStateContext = createContext<PlayerSnapshot | null>(null);
const PlayerTimeContext = createContext<PlayerTime | null>(null);
const PlayerActionsContext = createContext<PlayerActions | null>(null);

function storedRate(): number {
  try {
    const value = Number(localStorage.getItem("pls.rate"));
    return PLAYBACK_RATES.includes(value) ? value : 1;
  } catch {
    return 1;
  }
}

function storedVolume(): number {
  try {
    const value = Number(localStorage.getItem("pls.volume"));
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.85;
  } catch {
    return 0.85;
  }
}

function audioErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "";
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "The browser blocked playback. Press play again.";
  }
  return "This audio could not play. The publisher may block direct playback, or the file may be offline.";
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const episodeRef = useRef<Episode | null>(null);
  const snapshotRef = useRef<PlayerSnapshot>({
    episode: null,
    playing: false,
    loading: false,
    error: null,
    rate: storedRate(),
    volume: storedVolume(),
    muted: false,
  });
  const timeRef = useRef<PlayerTime>({ currentTime: 0, duration: 0 });
  const pendingSeekRef = useRef(0);
  const lastSavedRef = useRef(0);
  const suppressPauseSaveRef = useRef(false);

  const [snapshot, setSnapshot] = useState<PlayerSnapshot>(snapshotRef.current);
  const [time, setTime] = useState<PlayerTime>(timeRef.current);

  const commitSnapshot = useCallback(
    (update: Partial<PlayerSnapshot> | ((previous: PlayerSnapshot) => PlayerSnapshot)) => {
      setSnapshot((previous) => {
        const next =
          typeof update === "function" ? update(previous) : { ...previous, ...update };
        snapshotRef.current = next;
        return next;
      });
    },
    [],
  );

  const commitTime = useCallback((next: PlayerTime) => {
    timeRef.current = next;
    setTime(next);
  }, []);

  const persist = useCallback(
    (positionMs: number, status?: ProgressStatus, keepalive = false) => {
      const episode = episodeRef.current;
      if (!episode) return;
      const body = JSON.stringify({
        positionMs: Math.max(0, Math.round(positionMs)),
        ...(status ? { status } : {}),
      });
      fetch(`/api/episodes/${episode.id}/progress`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive,
      }).catch(() => {
        // Playback is local; a failed save should not interrupt listening.
      });
    },
    [],
  );

  const loadAndPlay = useCallback(
    (next: Episode) => {
      const audio = audioRef.current;
      if (!audio) return;

      episodeRef.current = next;
      suppressPauseSaveRef.current = true;
      pendingSeekRef.current =
        next.status !== "completed" && next.positionMs > 0 ? next.positionMs : 0;
      lastSavedRef.current = 0;

      commitSnapshot({
        episode: next,
        playing: false,
        loading: true,
        error: null,
      });
      commitTime({
        currentTime: pendingSeekRef.current / 1000,
        duration: next.durationSec ?? 0,
      });

      audio.src = next.audioUrl;
      audio.load();
      audio.playbackRate = snapshotRef.current.rate;
      audio.volume = snapshotRef.current.volume;
      audio.muted = snapshotRef.current.muted;

      const promise = audio.play();
      if (promise) {
        promise
          .then(() => commitSnapshot({ playing: true, loading: false }))
          .catch((error: unknown) => {
            const message = audioErrorMessage(error);
            if (message) {
              commitSnapshot({ playing: false, loading: false, error: message });
            }
          });
      }
    },
    [commitSnapshot, commitTime],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !episodeRef.current) return;
    if (audio.paused) {
      const promise = audio.play();
      if (promise) {
        promise
          .then(() => commitSnapshot({ playing: true, error: null }))
          .catch((error: unknown) => {
            const message = audioErrorMessage(error);
            if (message) commitSnapshot({ playing: false, error: message });
          });
      }
    } else {
      audio.pause();
    }
  }, [commitSnapshot]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const play = useCallback(
    (next: Episode) => {
      if (episodeRef.current?.id === next.id && audioRef.current && !audioRef.current.error) {
        toggle();
        return;
      }
      loadAndPlay(next);
    },
    [loadAndPlay, toggle],
  );

  const seek = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio || !episodeRef.current) return;
      const duration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : timeRef.current.duration;
      const next = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);
      audio.currentTime = next;
      commitTime({ ...timeRef.current, currentTime: next });
      persist(next * 1000);
    },
    [commitTime, persist],
  );

  const skip = useCallback(
    (seconds: number) => {
      seek(timeRef.current.currentTime + seconds);
    },
    [seek],
  );

  const setRate = useCallback(
    (rate: number) => {
      const next = Math.min(Math.max(rate, 0.5), 2);
      const audio = audioRef.current;
      if (audio) audio.playbackRate = next;
      try {
        localStorage.setItem("pls.rate", String(next));
      } catch {
        // Persisting the preference is optional.
      }
      commitSnapshot({ rate: next });
    },
    [commitSnapshot],
  );

  const setVolume = useCallback(
    (volume: number) => {
      const next = Math.min(Math.max(volume, 0), 1);
      const audio = audioRef.current;
      if (audio) {
        audio.volume = next;
        audio.muted = next === 0;
      }
      try {
        localStorage.setItem("pls.volume", String(next));
      } catch {
        // Persisting the preference is optional.
      }
      commitSnapshot({ volume: next, muted: next === 0 });
    },
    [commitSnapshot],
  );

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    commitSnapshot({ muted: audio.muted });
  }, [commitSnapshot]);

  const close = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      if (episodeRef.current && audio.currentTime > 0) {
        persist(audio.currentTime * 1000);
      }
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    episodeRef.current = null;
    pendingSeekRef.current = 0;
    suppressPauseSaveRef.current = false;
    commitSnapshot({
      episode: null,
      playing: false,
      loading: false,
      error: null,
    });
    commitTime({ currentTime: 0, duration: 0 });
  }, [commitSnapshot, commitTime, persist]);

  const updateStatus = useCallback(
    (status: ProgressStatus) => {
      const episode = episodeRef.current;
      const audio = audioRef.current;
      if (!episode) return;

      if (status === "completed") {
        suppressPauseSaveRef.current = true;
        audio?.pause();
        if (audio) audio.currentTime = 0;
        persist(0, "completed");
        commitTime({ currentTime: 0, duration: timeRef.current.duration });
        commitSnapshot((previous) => ({
          ...previous,
          playing: false,
          episode: previous.episode
            ? { ...previous.episode, status: "completed", positionMs: 0 }
            : previous.episode,
        }));
        window.setTimeout(() => {
          suppressPauseSaveRef.current = false;
        }, 150);
      } else if (status === "new") {
        suppressPauseSaveRef.current = true;
        audio?.pause();
        if (audio) audio.currentTime = 0;
        persist(0, "new");
        commitTime({ currentTime: 0, duration: timeRef.current.duration });
        commitSnapshot((previous) => ({
          ...previous,
          playing: false,
          episode: previous.episode
            ? { ...previous.episode, status: "new", positionMs: 0 }
            : previous.episode,
        }));
        window.setTimeout(() => {
          suppressPauseSaveRef.current = false;
        }, 150);
      } else {
        const position = Math.round(timeRef.current.currentTime * 1000);
        persist(position, "in_progress");
        commitSnapshot((previous) => ({
          ...previous,
          episode: previous.episode
            ? { ...previous.episode, status: "in_progress", positionMs: position }
            : previous.episode,
        }));
      }
    },
    [commitSnapshot, commitTime, persist],
  );

  // Wire the single audio element to React state.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      const duration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : timeRef.current.duration;
      if (pendingSeekRef.current > 0) {
        const target = pendingSeekRef.current / 1000;
        if (!Number.isFinite(duration) || duration <= 0 || target < duration) {
          audio.currentTime = target;
        }
        pendingSeekRef.current = 0;
      }
      commitTime({ currentTime: audio.currentTime, duration });
      commitSnapshot({ loading: false });
    };

    const onTimeUpdate = () => {
      const duration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : timeRef.current.duration;
      const current = audio.currentTime;
      commitTime({ currentTime: current, duration });

      if (!audio.paused && current > 0) {
        const now = Date.now();
        if (now - lastSavedRef.current >= 5000) {
          lastSavedRef.current = now;
          persist(current * 1000);
        }
      }
    };

    const onPlay = () => {
      suppressPauseSaveRef.current = false;
      commitSnapshot({ playing: true, error: null, loading: false });
    };

    const onPause = () => {
      if (suppressPauseSaveRef.current || audio.ended) return;
      commitSnapshot({ playing: false });
      const position = audio.currentTime * 1000;
      if (!episodeRef.current || position <= 0) return;
      persist(position);
      commitSnapshot((previous) =>
        previous.episode
          ? {
              ...previous,
              episode: { ...previous.episode, positionMs: Math.round(position) },
            }
          : previous,
      );
    };

    const onEnded = () => {
      commitSnapshot((previous) => ({ ...previous, playing: false }));
      commitTime({ currentTime: 0, duration: timeRef.current.duration });
      persist(0, "completed");
      commitSnapshot((previous) =>
        previous.episode
          ? {
              ...previous,
              episode: { ...previous.episode, status: "completed", positionMs: 0 },
            }
          : previous,
      );
    };

    const onWaiting = () => commitSnapshot({ loading: true });
    const onCanPlay = () => commitSnapshot({ loading: false });
    const onError = () => {
      if (!episodeRef.current) return;
      commitSnapshot({
        playing: false,
        loading: false,
        error:
          "This audio could not play. The publisher may block direct playback, or the file may be offline.",
      });
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("error", onError);
    };
  }, [commitSnapshot, commitTime, persist]);

  // Apply stored preferences once the audio element exists.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = snapshotRef.current.rate;
    audio.volume = snapshotRef.current.volume;
    audio.muted = snapshotRef.current.muted;
  }, []);

  // Save one last position when the page is hidden or closed.
  useEffect(() => {
    const save = () => {
      const audio = audioRef.current;
      if (!audio || !episodeRef.current || audio.currentTime <= 0) return;
      persist(audio.currentTime * 1000, undefined, true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") save();
    };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [persist]);

  // OS media controls and lock-screen metadata where supported.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const episode = snapshot.episode;
    if (!episode) {
      navigator.mediaSession.metadata = null;
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: episode.title,
      artist: episode.podcastTitle,
      album: "Podcast Language Studio",
      artwork: episode.imageUrl
        ? [{ src: episode.imageUrl, sizes: "512x512", type: "image/jpeg" }]
        : [],
    });

    const audio = audioRef.current;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => void audio?.play()],
      ["pause", () => audio?.pause()],
      [
        "seekbackward",
        () => {
          if (audio) audio.currentTime = Math.max(0, audio.currentTime - 15);
        },
      ],
      [
        "seekforward",
        () => {
          if (audio) {
            audio.currentTime = Math.min(
              Number.isFinite(audio.duration) ? audio.duration : audio.currentTime + 30,
              audio.currentTime + 30,
            );
          }
        },
      ],
      [
        "seekto",
        (details) => {
          if (audio && details.seekTime !== undefined) audio.currentTime = details.seekTime;
        },
      ],
    ];

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Not every browser supports every action.
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Ignore unsupported actions.
        }
      }
    };
  }, [snapshot.episode]);

  useEffect(() => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = snapshot.playing ? "playing" : "paused";
    }
  }, [snapshot.playing]);

  const actions = useMemo<PlayerActions>(
    () => ({
      play,
      toggle,
      pause,
      seek,
      skip,
      setRate,
      setVolume,
      toggleMute,
      close,
      updateStatus,
    }),
    [
      play,
      toggle,
      pause,
      seek,
      skip,
      setRate,
      setVolume,
      toggleMute,
      close,
      updateStatus,
    ],
  );

  // Global keyboard controls. Typing in a field or pressing a button always
  // wins over the shortcuts.
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const rateRef = useRef(snapshot.rate);
  rateRef.current = snapshot.rate;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input, textarea, select, button, a, [contenteditable='true'], [role='textbox']",
        )
      ) {
        return;
      }
      if (!episodeRef.current) return;
      const current = actionsRef.current;

      if (event.code === "Space") {
        event.preventDefault();
        current.toggle();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        current.skip(-10);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        current.skip(10);
      } else if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        current.toggleMute();
      } else if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        const index = PLAYBACK_RATES.indexOf(rateRef.current);
        const next =
          event.key === "]"
            ? PLAYBACK_RATES[Math.min(index + 1, PLAYBACK_RATES.length - 1)]
            : PLAYBACK_RATES[Math.max(index - 1, 0)];
        if (next) current.setRate(next);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <PlayerActionsContext.Provider value={actions}>
      <PlayerStateContext.Provider value={snapshot}>
        <PlayerTimeContext.Provider value={time}>
          <audio ref={audioRef} preload="metadata" className="hidden" />
          {children}
        </PlayerTimeContext.Provider>
      </PlayerStateContext.Provider>
    </PlayerActionsContext.Provider>
  );
}

export function usePlayerSnapshot(): PlayerSnapshot {
  const value = useContext(PlayerStateContext);
  if (!value) throw new Error("usePlayerSnapshot must be used inside PlayerProvider");
  return value;
}

export function usePlayerTime(): PlayerTime {
  const value = useContext(PlayerTimeContext);
  if (!value) throw new Error("usePlayerTime must be used inside PlayerProvider");
  return value;
}

export function usePlayerActions(): PlayerActions {
  const value = useContext(PlayerActionsContext);
  if (!value) throw new Error("usePlayerActions must be used inside PlayerProvider");
  return value;
}

export function usePlayer(): PlayerApi {
  const snapshot = usePlayerSnapshot();
  const time = usePlayerTime();
  const actions = usePlayerActions();
  return useMemo(() => ({ ...snapshot, ...time, ...actions }), [snapshot, time, actions]);
}
