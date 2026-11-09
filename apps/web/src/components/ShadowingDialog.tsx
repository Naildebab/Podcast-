import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../lib/api";
import { formatTime } from "../lib/format";
import type {
  Episode,
  ShadowingRecording,
  TranscriptCue,
} from "../lib/types";
import {
  usePlayerActions,
  usePlayerSnapshot,
  usePlayerTime,
} from "../player/PlayerContext";
import { Badge } from "./Badge";
import { Button } from "./Button";
import {
  MicIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  TrashIcon,
} from "./Icons";
import { Modal } from "./Modal";
import { Notice, Skeleton } from "./Notice";

const GAP_OPTIONS = [1, 2, 3, 5];
const MAX_TAKE_MS = 5 * 60 * 1000;
const MAX_TAKE_BYTES = 25 * 1024 * 1024;
const RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

function preferredMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return RECORDING_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function microphoneError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Microphone permission was denied. Allow microphone access in your browser and try again.";
    }
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      return "No usable microphone was found on this computer.";
    }
    if (error.name === "NotReadableError" || error.name === "AbortError") {
      return "The microphone is already in use or could not be started. Close other recording apps and try again.";
    }
  }
  return "The microphone could not start. Check your browser and system permissions.";
}

function cueEndMs(
  cue: TranscriptCue,
  nextCueStartMs: number | null,
  episodeDurationSec: number | null,
): number {
  const start = cue.startMs ?? 0;
  const words = cue.text.trim().split(/\s+/).filter(Boolean).length;
  const estimate = Math.min(12_000, Math.max(2_500, words * 420));
  let end = cue.endMs ?? nextCueStartMs ?? start + estimate;
  if (episodeDurationSec && episodeDurationSec > 0) {
    end = Math.min(end, episodeDurationSec * 1000);
  }
  return Math.max(start + 500, end);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRecordingDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function ShadowingDialog({
  episode,
  cue,
  nextCueStartMs,
  onClose,
}: {
  episode: Episode;
  cue: TranscriptCue;
  nextCueStartMs: number | null;
  onClose: () => void;
}) {
  const player = usePlayerSnapshot();
  const time = usePlayerTime();
  const actions = usePlayerActions();

  const isCurrent = player.episode?.id === episode.id;
  const startMs = cue.startMs ?? 0;
  const endMs = useMemo(
    () => cueEndMs(cue, nextCueStartMs, episode.durationSec),
    [cue, nextCueStartMs, episode.durationSec],
  );
  const linePlaying =
    isCurrent &&
    player.playing &&
    time.currentTime * 1000 >= startMs - 150 &&
    time.currentTime * 1000 <= endMs + 500;

  const [looping, setLooping] = useState(false);
  const [oneShot, setOneShot] = useState(false);
  const [gapWaiting, setGapWaiting] = useState(false);
  const [gapSeconds, setGapSeconds] = useState(2);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [take, setTake] = useState<{ blob: Blob; durationMs: number } | null>(null);
  const [preview, setPreview] = useState<{
    label: string;
    kind: "take" | "saved";
    recordingId?: number;
  } | null>(null);
  const [recordings, setRecordings] = useState<ShadowingRecording[]>([]);
  const [loadingRecordings, setLoadingRecordings] = useState(true);
  const [recordingsError, setRecordingsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closeConfirm, setCloseConfirm] = useState(false);

  const controlsRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLAudioElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartedRef = useRef(0);
  const recordTimerRef = useRef<number | null>(null);
  const gapTimerRef = useRef<number | null>(null);
  const loopRef = useRef(false);
  const mountedRef = useRef(false);

  const canRecord = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      typeof MediaRecorder !== "undefined",
    [],
  );

  const clearGapTimer = useCallback(() => {
    if (gapTimerRef.current !== null) {
      window.clearTimeout(gapTimerRef.current);
      gapTimerRef.current = null;
    }
    setGapWaiting(false);
  }, []);

  const stopLoop = useCallback(
    (pauseOriginal = true) => {
      loopRef.current = false;
      setLooping(false);
      setOneShot(false);
      clearGapTimer();
      if (pauseOriginal) actions.pause();
    },
    [actions, clearGapTimer],
  );

  function clearPreview() {
    const audio = previewRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setPreview(null);
  }

  function clearRecordingTimer() {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }

  function stopMicrophoneTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function abortRecording() {
    clearRecordingTimer();
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      recorder.onerror = null;
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        // The stream may already be gone.
      }
      recorderRef.current = null;
    }
    stopMicrophoneTracks();
    chunksRef.current = [];
    setRecording(false);
    setElapsedMs(0);
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  function revokeTakeUrl() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  function startLine() {
    previewRef.current?.pause();
    loopRef.current = false;
    setLooping(false);
    setOneShot(true);
    clearGapTimer();
    setError(null);
    actions.playAt(episode, startMs / 1000);
  }

  function startLoop() {
    previewRef.current?.pause();
    clearGapTimer();
    loopRef.current = true;
    setLooping(true);
    setOneShot(false);
    setError(null);
    actions.playAt(episode, startMs / 1000);
  }

  function togglePlay() {
    if (looping || linePlaying) {
      stopLoop();
      return;
    }
    startLine();
  }

  function toggleLoop() {
    if (looping) {
      stopLoop();
      return;
    }
    startLoop();
  }

  async function beginRecording() {
    if (take || saving) return;
    previewRef.current?.pause();
    clearPreview();
    stopLoop();
    setNotice(null);
    setError(null);
    setCloseConfirm(false);

    if (!canRecord) {
      setError(
        "This browser does not expose microphone recording. Try a current Chrome, Firefox, or Safari build over localhost or HTTPS.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const mimeType = preferredMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128_000 })
          : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      recorderRef.current = recorder;
      chunksRef.current = [];
      recordStartedRef.current = Date.now();
      setElapsedMs(0);
      setRecording(true);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setError("The microphone stopped unexpectedly. Check its connection and permission.");
        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch {
            // Ignore a recorder that is already shutting down.
          }
        }
      };

      recorder.onstop = () => {
        clearRecordingTimer();
        stopMicrophoneTracks();
        recorderRef.current = null;
        if (!mountedRef.current) return;

        const durationMs = Math.max(0, Date.now() - recordStartedRef.current);
        setRecording(false);
        setElapsedMs(durationMs);

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        chunksRef.current = [];
        if (blob.size === 0) {
          setError("No audio was captured. Check that the correct microphone is selected.");
          return;
        }
        if (blob.size > MAX_TAKE_BYTES) {
          setError("That take is larger than 25 MB. Record a shorter attempt.");
          return;
        }

        revokeTakeUrl();
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        const audio = previewRef.current;
        if (audio) {
          audio.src = url;
          audio.load();
        }
        setTake({ blob, durationMs });
        setPreview({ label: "Your unsaved take", kind: "take" });
        setNotice("Take recorded. Listen back, then save it to this computer.");
      };

      recorder.start(1_000);
      recordTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - recordStartedRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_TAKE_MS) {
          setNotice("Recording stopped at the 5-minute limit.");
          const active = recorderRef.current;
          if (active && active.state !== "inactive") active.stop();
        }
      }, 200);
    } catch (caught) {
      recorderRef.current = null;
      chunksRef.current = [];
      stopMicrophoneTracks();
      setRecording(false);
      setElapsedMs(0);
      setError(microphoneError(caught));
    }
  }

  function discardTake() {
    revokeTakeUrl();
    setTake(null);
    if (preview?.kind === "take") clearPreview();
    setNotice(null);
    setCloseConfirm(false);
  }

  async function saveTake() {
    if (!take || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.saveRecording(take.blob, {
        episodeId: episode.id,
        cueIndex: cue.index,
        startMs,
        endMs,
        durationMs: Math.round(take.durationMs),
      });
      setRecordings((previous) => [result.recording, ...previous]);
      revokeTakeUrl();
      setTake(null);
      if (preview?.kind === "take") clearPreview();
      setCloseConfirm(false);
      setNotice("Take saved. It stays on this computer with the episode.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The take could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function playSaved(recording: ShadowingRecording) {
    stopLoop();
    const audio = previewRef.current;
    if (!audio) return;
    audio.src = recording.audioUrl;
    audio.load();
    setPreview({
      label: `${recording.label} · ${formatRecordingDate(recording.createdAt)}`,
      kind: "saved",
      recordingId: recording.id,
    });
    void audio.play().catch(() => {
      // The native controls remain available if autoplay is blocked.
    });
  }

  async function removeRecording(id: number) {
    setDeletingId(id);
    setError(null);
    setNotice(null);
    try {
      await api.deleteRecording(id);
      setRecordings((previous) => previous.filter((item) => item.id !== id));
      if (preview?.kind === "saved" && preview.recordingId === id) clearPreview();
      setConfirmDeleteId(null);
      setNotice("Take deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The take could not be deleted.");
    } finally {
      setDeletingId(null);
    }
  }

  function finalizeClose() {
    stopLoop();
    actions.pause();
    const audio = previewRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    revokeTakeUrl();
    abortRecording();
    onClose();
  }

  function requestClose() {
    if (closeConfirm) {
      setCloseConfirm(false);
      return;
    }
    if (saving) {
      setError("Wait for the take to finish saving before closing.");
      return;
    }
    if (recording || take) {
      setCloseConfirm(true);
      return;
    }
    finalizeClose();
  }

  useEffect(() => {
    let active = true;
    setLoadingRecordings(true);
    setRecordingsError(null);
    api
      .recordings(episode.id, cue.index)
      .then((result) => {
        if (active) setRecordings(result.recordings);
      })
      .catch((caught) => {
        if (active) {
          setRecordingsError(
            caught instanceof Error ? caught.message : "Saved takes could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoadingRecordings(false);
      });
    return () => {
      active = false;
    };
  }, [episode.id, cue.index, reloadKey]);

  useEffect(() => {
    if (!looping || !isCurrent) return;
    if (time.currentTime * 1000 < endMs - 40) return;
    if (gapTimerRef.current !== null) return;

    actions.pause();
    setGapWaiting(true);
    gapTimerRef.current = window.setTimeout(() => {
      gapTimerRef.current = null;
      if (!mountedRef.current) return;
      setGapWaiting(false);
      if (!loopRef.current) return;
      actions.playAt(episode, startMs / 1000);
    }, gapSeconds * 1000);
  }, [
    actions,
    endMs,
    episode,
    gapSeconds,
    isCurrent,
    looping,
    startMs,
    time.currentTime,
  ]);

  useEffect(() => {
    if (!oneShot || !isCurrent) return;
    if (time.currentTime * 1000 < endMs - 40) return;
    setOneShot(false);
    actions.pause();
  }, [actions, endMs, isCurrent, oneShot, time.currentTime]);

  useEffect(() => {
    if (!looping || isCurrent) return;
    loopRef.current = false;
    setLooping(false);
    clearGapTimer();
  }, [clearGapTimer, isCurrent, looping]);

  useEffect(() => {
    mountedRef.current = true;
    actions.pause();
    const focusTimer = window.setTimeout(() => {
      controlsRef.current?.querySelector("button")?.focus();
    }, 0);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(focusTimer);
      if (gapTimerRef.current !== null) window.clearTimeout(gapTimerRef.current);
      if (recordTimerRef.current !== null) window.clearInterval(recordTimerRef.current);
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        recorder.onerror = null;
        try {
          if (recorder.state !== "inactive") recorder.stop();
        } catch {
          // The stream may already be closed.
        }
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const audio = previewRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      actions.pause();
    };
  }, [actions]);

  const loopStatus = !looping
    ? "Loop off. Play the line once, or turn the loop on to repeat it."
    : gapWaiting
      ? `Paused for a ${gapSeconds}-second gap. The next repeat starts automatically.`
      : player.loading
        ? "Loading the original audio…"
        : "Playing the line. It will repeat after the gap.";

  return (
    <Modal
      open
      onClose={requestClose}
      title="Shadowing practice"
      footer={
        <Button variant="secondary" onClick={requestClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-line bg-bg p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="accent">Line {cue.index + 1}</Badge>
            <span className="font-mono text-[0.68rem] tabular-nums text-muted">
              {formatTime(startMs / 1000)} – {formatTime(endMs / 1000)}
            </span>
          </div>
          <p className="mt-3 font-serif text-xl leading-snug text-fg sm:text-2xl">
            {cue.speaker ? (
              <span className="mr-1 font-sans text-base font-semibold text-pine">
                {cue.speaker}:
              </span>
            ) : null}
            {cue.text}
          </p>
        </div>

        {closeConfirm ? (
          <Notice tone="error">
            <p className="font-semibold">
              {recording
                ? "A recording is in progress."
                : "You have an unsaved recording."}
            </p>
            <p className="mt-1 text-xs">
              Closing now stops the microphone and discards this take. Saved takes are not
              affected.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="danger" onClick={finalizeClose}>
                Discard and close
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setCloseConfirm(false)}
              >
                Keep editing
              </Button>
            </div>
          </Notice>
        ) : null}

        {notice ? <Notice tone="success">{notice}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}

        <section className="rounded-2xl border border-line bg-surface-2/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="eyebrow">Listen and repeat</p>
              <h3 className="mt-1 font-serif text-xl text-fg">Loop this line</h3>
            </div>
            <Badge tone={looping ? "pine" : "outline"}>
              {looping ? (gapWaiting ? "Gap" : "Looping") : "Ready"}
            </Badge>
          </div>

          <div ref={controlsRef} className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={togglePlay} aria-label={looping || linePlaying ? "Pause the line" : "Play this line"}>
              {looping || linePlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
              {looping || linePlaying ? "Pause" : "Play line"}
            </Button>
            <Button
              variant={looping ? "dark" : "secondary"}
              onClick={toggleLoop}
              aria-pressed={looping}
            >
              <RefreshIcon size={16} /> {looping ? "Stop loop" : "Loop line"}
            </Button>
            <label className="ml-1 inline-flex items-center gap-2 text-xs font-semibold text-muted">
              Gap
              <select
                value={gapSeconds}
                onChange={(event) => setGapSeconds(Number(event.target.value))}
                className="h-9 rounded-full border border-line bg-bg px-3 text-xs font-semibold text-fg outline-none"
                aria-label="Gap between repeats"
              >
                {GAP_OPTIONS.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds}s
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="mt-3 text-[0.68rem] leading-relaxed text-muted" aria-live="polite">
            {loopStatus}
          </p>
          <p className="mt-1 text-[0.65rem] leading-relaxed text-muted">
            The episode pauses when this window opens. Headphones keep the microphone from
            hearing the original line.
          </p>
          {isCurrent && player.error ? (
            <Notice tone="error" className="mt-3">
              {player.error}
            </Notice>
          ) : null}
        </section>

        <section className="rounded-2xl border border-line bg-surface-2/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="eyebrow">Your voice</p>
              <h3 className="mt-1 font-serif text-xl text-fg">Record a take</h3>
            </div>
            <Badge tone={recording ? "danger" : "outline"}>
              {recording ? "Recording" : canRecord ? "Microphone ready" : "Unavailable"}
            </Badge>
          </div>

          {!canRecord ? (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              This browser does not expose microphone recording. Try a current Chrome,
              Firefox, or Safari build over localhost or HTTPS.
            </p>
          ) : recording ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-danger-soft px-3 py-1.5 text-xs font-bold text-danger">
                <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden="true" />
                {formatTime(elapsedMs / 1000)}
              </span>
              <Button variant="danger" onClick={stopRecording}>
                Stop recording
              </Button>
              <span className="text-[0.65rem] text-muted">Up to 5 minutes.</span>
            </div>
          ) : take ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={saveTake} loading={saving}>
                Save take
              </Button>
              <Button variant="secondary" onClick={discardTake} disabled={saving}>
                Discard
              </Button>
              <span className="text-[0.65rem] text-muted">
                {formatTime(take.durationMs / 1000)} · {formatBytes(take.blob.size)}
              </span>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={() => void beginRecording()}>
                <MicIcon size={16} /> Record your voice
              </Button>
              <span className="text-[0.65rem] text-muted">
                The original line pauses while you record.
              </span>
            </div>
          )}

          <audio
            ref={previewRef}
            controls
            onPlay={() => stopLoop()}
            className={preview ? "mt-3 w-full" : "hidden"}
          />
          {preview ? (
            <p className="mt-1 text-[0.65rem] text-muted">{preview.label}</p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-line bg-surface-2/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="eyebrow">Saved on this computer</p>
              <h3 className="mt-1 font-serif text-xl text-fg">Takes for this line</h3>
            </div>
            <Badge tone="outline">
              {recordings.length} {recordings.length === 1 ? "take" : "takes"}
            </Badge>
          </div>

          {loadingRecordings ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : recordingsError ? (
            <Notice tone="error" className="mt-3">
              <p>{recordingsError}</p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => setReloadKey((value) => value + 1)}
              >
                Try again
              </Button>
            </Notice>
          ) : recordings.length === 0 ? (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              No takes saved for this line yet. Record one above and save it to keep it with
              the episode.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recordings.map((recording) => (
                <li
                  key={recording.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-bg px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-fg">{recording.label}</p>
                    <p className="mt-0.5 text-[0.65rem] text-muted">
                      {formatRecordingDate(recording.createdAt)} ·{" "}
                      {formatTime(recording.durationMs / 1000)} ·{" "}
                      {formatBytes(recording.sizeBytes)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => playSaved(recording)}
                    >
                      <PlayIcon size={14} /> Play
                    </Button>
                    {confirmDeleteId === recording.id ? (
                      <>
                        <Button
                          size="sm"
                          variant="danger"
                          loading={deletingId === recording.id}
                          onClick={() => void removeRecording(recording.id)}
                        >
                          Delete
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${recording.label}`}
                        onClick={() => setConfirmDeleteId(recording.id)}
                      >
                        <TrashIcon size={15} />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}
