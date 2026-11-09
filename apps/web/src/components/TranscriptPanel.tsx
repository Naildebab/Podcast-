import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { api } from "../lib/api";
import { formatDate, formatTime } from "../lib/format";
import { useAsync } from "../lib/hooks";
import type {
  Episode,
  Transcript,
  TranscriptCue,
  TranscriptFormat,
  TranscriptionJob,
} from "../lib/types";
import { usePlayerActions, usePlayerSnapshot, usePlayerTime } from "../player/PlayerContext";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { ErrorPanel, Notice, Skeleton } from "./Notice";
import { ConfirmDialog, Modal } from "./Modal";
import {
  BookIcon,
  ExternalIcon,
  LinkIcon,
  MicIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from "./Icons";

const FORMAT_LABELS: Record<TranscriptFormat, string> = {
  vtt: "WebVTT",
  srt: "SubRip",
  json: "Podcasting 2.0 JSON",
  text: "Plain text",
};

const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

const ACTIVE_TRANSCRIPTION_STATES = new Set<TranscriptionJob["state"]>([
  "queued",
  "downloading",
  "transcribing",
  "saving",
]);

const TRANSCRIPTION_LABELS: Record<TranscriptionJob["state"], string> = {
  queued: "Preparing",
  downloading: "Downloading audio",
  transcribing: "Transcribing on this computer",
  saving: "Saving transcript",
  completed: "Finished",
  failed: "Failed",
  cancelled: "Cancelled",
};

function transcriptionActive(job: TranscriptionJob | null): boolean {
  return job !== null && ACTIVE_TRANSCRIPTION_STATES.has(job.state);
}

function findActiveCue(cues: TranscriptCue[], millis: number): number {
  let low = 0;
  let high = cues.length - 1;
  let found = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const cue = cues[middle];
    if (!cue || cue.startMs === null) {
      high = middle - 1;
      continue;
    }
    if (cue.startMs <= millis) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  if (found < 0) return -1;
  const cue = cues[found];
  if (cue?.endMs !== null && cue?.endMs !== undefined && millis > cue.endMs) return -1;
  return found;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "ig"));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === needle.toLowerCase() ? (
          <mark
            key={`${part}-${index}`}
            className="rounded bg-amber/30 px-0.5 text-fg"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function TranscriptPanel({ episode }: { episode: Episode }) {
  const request = useAsync(() => api.transcript(episode.id), [episode.id]);
  const [busy, setBusy] = useState<"feed" | "reload" | "delete" | "transcribe" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transcribeConfirmOpen, setTranscribeConfirmOpen] = useState(false);
  const [job, setJob] = useState<TranscriptionJob | null>(null);
  const [transcribeAvailable, setTranscribeAvailable] = useState(false);
  const [transcribeChecked, setTranscribeChecked] = useState(false);
  const [transcribeReason, setTranscribeReason] = useState<string | null>(null);

  const transcript = request.data?.transcript ?? null;

  useEffect(() => {
    let active = true;
    setJob(null);
    setTranscribeChecked(false);
    setTranscribeAvailable(false);
    setTranscribeReason(null);
    api
      .transcriptionStatus(episode.id)
      .then((status) => {
        if (!active) return;
        setTranscribeAvailable(status.available);
        setTranscribeReason(status.reason);
        setTranscribeChecked(true);
        setJob(status.job);
      })
      .catch(() => {
        if (active) {
          setTranscribeAvailable(false);
          setTranscribeChecked(true);
        }
      });
    return () => {
      active = false;
    };
  }, [episode.id]);

  const reloadTranscriptRequest = request.reload;
  useEffect(() => {
    if (!transcriptionActive(job)) return;

    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const status = await api.transcriptionStatus(episode.id);
        if (cancelled) return;
        setTranscribeAvailable(status.available);
        setTranscribeReason(status.reason);
        setJob(status.job);
        if (status.job && transcriptionActive(status.job)) {
          timer = window.setTimeout(poll, 2_000);
        } else if (status.job?.state === "completed") {
          reloadTranscriptRequest();
          setNotice("Local transcription finished. The timestamped transcript was saved.");
        }
      } catch (error) {
        if (!cancelled) {
          setActionError(
            error instanceof Error
              ? error.message
              : "The local transcription status could not be checked.",
          );
        }
      }
    }

    timer = window.setTimeout(poll, 2_000);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [episode.id, job?.id, job?.state, reloadTranscriptRequest]);

  async function loadFromFeed() {
    setBusy("feed");
    setActionError(null);
    setNotice(null);
    try {
      await api.importTranscript(episode.id, { source: "feed" });
      request.reload();
      setNotice("Transcript loaded from the publisher and stored locally.");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "The transcript could not be loaded.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function reloadTranscript() {
    if (!transcript?.sourceUrl) return;
    setBusy("reload");
    setActionError(null);
    setNotice(null);
    try {
      await api.importTranscript(
        episode.id,
        transcript.origin === "feed" && episode.transcriptUrl
          ? { source: "feed" }
          : { source: "url", url: transcript.sourceUrl },
      );
      request.reload();
      setNotice("Transcript refreshed from its source.");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "The transcript could not be refreshed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function importPasted(input: { text: string; format?: TranscriptFormat }) {
    await api.importTranscript(episode.id, {
      source: "text",
      text: input.text,
      format: input.format,
    });
    request.reload();
    setImportOpen(false);
    setNotice("Transcript imported and stored locally.");
  }

  async function removeTranscript() {
    setBusy("delete");
    setActionError(null);
    setNotice(null);
    try {
      await api.deleteTranscript(episode.id);
      setConfirmOpen(false);
      request.reload();
      setNotice("The local transcript copy was removed.");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "The transcript could not be removed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function transcribeLocally() {
    setBusy("transcribe");
    setActionError(null);
    setNotice(null);
    setTranscribeConfirmOpen(false);
    try {
      const result = await api.startTranscription(episode.id);
      setJob(result.job);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "The local transcription could not start.",
      );
    } finally {
      setBusy(null);
    }
  }

  function requestTranscription() {
    if (transcript) {
      setTranscribeConfirmOpen(true);
      return;
    }
    void transcribeLocally();
  }

  async function cancelTranscription() {
    setActionError(null);
    try {
      const result = await api.cancelTranscription(episode.id);
      setJob(result.job);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "The transcription could not be cancelled.",
      );
    }
  }

  return (
    <section className="animate-rise delay-3 rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookIcon size={19} className="text-accent" />
          <div>
            <h2 className="font-serif text-2xl text-fg">Transcript</h2>
            <p className="mt-0.5 text-xs text-muted">
              Read along, transcribe locally, or import a transcript you already have.
            </p>
          </div>
        </div>
        {transcript ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="outline">{FORMAT_LABELS[transcript.format]}</Badge>
            <Badge tone={transcript.timed ? "pine" : "outline"}>
              {transcript.timed ? "Line-synced" : "Untimed"}
            </Badge>
            <Badge tone={transcript.origin === "whisper" ? "pine" : "outline"}>
              {transcript.origin === "feed"
                ? "From feed"
                : transcript.origin === "whisper"
                  ? "Local Whisper"
                  : transcript.sourceUrl
                    ? "Imported URL"
                    : "Pasted locally"}
            </Badge>
          </div>
        ) : null}
      </div>

      {notice ? (
        <Notice tone="success" className="mt-4">
          {notice}
        </Notice>
      ) : null}
      {actionError ? (
        <Notice tone="error" className="mt-4">
          {actionError}
        </Notice>
      ) : null}
      {job ? <TranscriptionProgress job={job} onCancel={cancelTranscription} /> : null}

      {request.loading && !request.data ? (
        <div className="mt-5 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : request.error && !request.data ? (
        <ErrorPanel
          message={request.error}
          onRetry={request.reload}
          className="mt-5"
        />
      ) : transcript ? (
        <TranscriptReader
          key={transcript.importedAt}
          transcript={transcript}
          episode={episode}
          busy={busy}
          transcribeAvailable={transcribeAvailable}
          onReload={reloadTranscript}
          onImport={() => setImportOpen(true)}
          onRemove={() => setConfirmOpen(true)}
          onTranscribe={requestTranscription}
        />
      ) : (
        <TranscriptEmpty
          episode={episode}
          busy={busy}
          transcribeAvailable={transcribeAvailable}
          transcribeChecked={transcribeChecked}
          transcribeReason={transcribeReason}
          onLoad={loadFromFeed}
          onImport={() => setImportOpen(true)}
          onTranscribe={requestTranscription}
        />
      )}

      <TranscriptImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSubmit={importPasted}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Remove local transcript?"
        message={
          <>
            This removes the saved transcript for this episode from your local database.
            The audio and your listening progress are not affected.
          </>
        }
        confirmLabel="Remove transcript"
        busy={busy === "delete"}
        onConfirm={removeTranscript}
        onClose={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={transcribeConfirmOpen}
        title="Replace this transcript with a local transcription?"
        message={
          <>
            Whisper will download this episode's audio temporarily, transcribe it on this
            computer, and replace the saved transcript for this episode. The audio is deleted
            after transcription.
          </>
        }
        confirmLabel="Transcribe locally"
        busy={busy === "transcribe"}
        onConfirm={transcribeLocally}
        onClose={() => setTranscribeConfirmOpen(false)}
      />
    </section>
  );
}

function TranscriptionProgress({
  job,
  onCancel,
}: {
  job: TranscriptionJob;
  onCancel: () => void;
}) {
  const active = transcriptionActive(job);
  const tone = job.state === "failed" ? "error" : job.state === "completed" ? "success" : "info";

  return (
    <Notice tone={tone} className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-semibold">Local Whisper:</span>{" "}
          {TRANSCRIPTION_LABELS[job.state]}
          {job.state === "transcribing" ? " — this can take several minutes on CPU." : null}
        </span>
        {active ? (
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
      {job.state === "completed" ? (
        <p className="mt-1 text-xs">
          Saved {job.cueCount ?? 0} timestamped {job.cueCount === 1 ? "line" : "lines"} locally
          using {job.model}.
        </p>
      ) : null}
      {job.state === "failed" && job.error ? (
        <p className="mt-1 text-xs">{job.error}</p>
      ) : null}
    </Notice>
  );
}

function TranscriptEmpty({
  episode,
  busy,
  transcribeAvailable,
  transcribeChecked,
  transcribeReason,
  onLoad,
  onImport,
  onTranscribe,
}: {
  episode: Episode;
  busy: "feed" | "reload" | "delete" | "transcribe" | null;
  transcribeAvailable: boolean;
  transcribeChecked: boolean;
  transcribeReason: string | null;
  onLoad: () => void;
  onImport: () => void;
  onTranscribe: () => void;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-line bg-bg p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <LinkIcon size={17} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">
            {episode.transcriptUrl
              ? "This feed advertises a transcript."
              : "No transcript is advertised by this feed."}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {episode.transcriptUrl
              ? "Load it once from the publisher. It is parsed and stored in your local database, so the next visit is instant and does not contact the publisher again."
              : "Use the local Whisper install to transcribe this episode, or paste a transcript you already have. Everything stays on this computer."}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {episode.transcriptUrl ? (
          <Button onClick={onLoad} loading={busy === "feed"}>
            <RefreshIcon size={15} /> Load transcript
          </Button>
        ) : null}
        {transcribeAvailable ? (
          <Button
            variant={episode.transcriptUrl ? "secondary" : "primary"}
            onClick={onTranscribe}
            loading={busy === "transcribe"}
          >
            <MicIcon size={15} /> Transcribe locally
          </Button>
        ) : null}
        <Button
          variant={episode.transcriptUrl || transcribeAvailable ? "secondary" : "primary"}
          onClick={onImport}
        >
          Import transcript
        </Button>
        {episode.transcriptUrl ? (
          <a
            href={episode.transcriptUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-1 text-xs font-semibold text-pine hover:underline"
          >
            Open source <ExternalIcon size={13} />
          </a>
        ) : null}
      </div>

      <p className="mt-3 text-[0.65rem] leading-relaxed text-muted">
        Supported formats: WebVTT, SubRip, Podcasting 2.0 JSON, and plain text. Publishers
        sometimes publish an HTML transcript page instead; those need to be pasted in
        manually.
      </p>
      {transcribeChecked && !transcribeAvailable ? (
        <p className="mt-2 text-[0.65rem] leading-relaxed text-muted">
          Local Whisper is unavailable. {transcribeReason}
        </p>
      ) : null}
    </div>
  );
}

function TranscriptReader({
  transcript,
  episode,
  busy,
  transcribeAvailable,
  onReload,
  onImport,
  onRemove,
  onTranscribe,
}: {
  transcript: Transcript;
  episode: Episode;
  busy: "feed" | "reload" | "delete" | "transcribe" | null;
  transcribeAvailable: boolean;
  onReload: () => void;
  onImport: () => void;
  onRemove: () => void;
  onTranscribe: () => void;
}) {
  const player = usePlayerSnapshot();
  const time = usePlayerTime();
  const actions = usePlayerActions();
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isCurrent = player.episode?.id === episode.id;
  const activeIndex = useMemo(
    () =>
      transcript.timed && isCurrent
        ? findActiveCue(transcript.cues, time.currentTime * 1000 + 120)
        : -1,
    [transcript, isCurrent, time.currentTime],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return transcript.cues;
    return transcript.cues.filter((cue) =>
      `${cue.speaker ?? ""} ${cue.text}`.toLowerCase().includes(needle),
    );
  }, [transcript.cues, query]);

  useEffect(() => {
    if (!follow || !isCurrent || activeIndex < 0) return;
    const container = scrollRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>(
      `[data-cue-index="${activeIndex}"]`,
    );
    if (!active) return;
    const top = active.offsetTop - container.clientHeight / 2 + active.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [activeIndex, follow, isCurrent, query]);

  function seekTo(cue: TranscriptCue) {
    if (cue.startMs === null) return;
    actions.playAt(episode, cue.startMs / 1000);
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <SearchIcon
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this transcript…"
            aria-label="Search this transcript"
            className="h-10 w-full rounded-full border border-line bg-bg pl-9 pr-3 text-xs text-fg outline-none transition placeholder:text-muted/80 focus:border-accent"
          />
        </div>

        {transcript.timed ? (
          <button
            type="button"
            aria-pressed={follow}
            onClick={() => setFollow((value) => !value)}
            className={`inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition ${
              follow
                ? "border-pine/30 bg-pine/10 text-pine"
                : "border-line bg-surface text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${follow ? "bg-pine" : "bg-muted/60"}`}
              aria-hidden="true"
            />
            Follow playback
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] text-muted">
        <span>
          {transcript.cueCount} {transcript.cueCount === 1 ? "line" : "lines"} ·{" "}
          {FORMAT_LABELS[transcript.format]}
          {transcript.language ? ` · ${transcript.language}` : ""}
        </span>
        <span aria-hidden="true">·</span>
        <span>Imported {formatDate(transcript.importedAt)}</span>
        {transcript.sourceUrl ? (
          <>
            <span aria-hidden="true">·</span>
            <a
              href={transcript.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-pine hover:underline"
            >
              Source <ExternalIcon size={11} />
            </a>
          </>
        ) : null}
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={onReload}
          disabled={!transcript.sourceUrl || busy === "reload"}
          className="inline-flex items-center gap-1 font-semibold text-pine hover:underline disabled:pointer-events-none disabled:opacity-40"
        >
          <RefreshIcon size={12} /> Reload
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={onImport}
          className="inline-flex items-center gap-1 font-semibold text-pine hover:underline"
        >
          Import
        </button>
        {transcribeAvailable ? (
          <>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onTranscribe}
              disabled={busy === "transcribe"}
              className="inline-flex items-center gap-1 font-semibold text-pine hover:underline disabled:pointer-events-none disabled:opacity-40"
            >
              <MicIcon size={12} /> Transcribe locally
            </button>
          </>
        ) : null}
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 font-semibold text-danger hover:underline"
        >
          <TrashIcon size={12} /> Remove
        </button>
      </div>

      {transcript.timed ? (
        <p className="mt-2 text-[0.65rem] text-muted">
          Click a timestamp to play from that line.{" "}
          {isCurrent ? (
            <>The current line follows the audio.</>
          ) : (
            <>Press play to load this episode before following along.</>
          )}
        </p>
      ) : (
        <p className="mt-2 text-[0.65rem] text-muted">
          This transcript has no timestamps, so it is a reading view only.
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-line bg-bg px-4 py-8 text-center text-sm text-muted">
          No transcript lines match “{query.trim()}”.
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="relative mt-3 max-h-[65vh] min-h-40 overflow-y-auto rounded-2xl border border-line bg-bg p-1.5 sm:p-2"
        >
          {filtered.map((cue) => {
            const active = cue.index === activeIndex;
            return (
              <button
                key={cue.index}
                type="button"
                data-cue-index={cue.index}
                onClick={() => seekTo(cue)}
                disabled={cue.startMs === null}
                aria-current={active ? "true" : undefined}
                className={`group flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left transition ${
                  active
                    ? "bg-accent-soft text-fg ring-1 ring-accent/20"
                    : "text-muted hover:bg-surface-2 hover:text-fg"
                } ${cue.startMs === null ? "cursor-default" : ""}`}
              >
                <span
                  className={`w-12 shrink-0 pt-0.5 text-right font-mono text-[0.65rem] tabular-nums ${
                    active ? "font-bold text-accent-strong" : "text-muted"
                  }`}
                >
                  {cue.startMs === null ? "—" : formatTime(cue.startMs / 1000)}
                </span>
                <span className="min-w-0 text-sm leading-relaxed">
                  {cue.speaker ? (
                    <span className="mr-1 font-semibold text-pine">{cue.speaker}:</span>
                  ) : null}
                  <HighlightedText text={cue.text} query={query} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TranscriptImportDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { text: string; format?: TranscriptFormat }) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"auto" | TranscriptFormat>("auto");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX_IMPORT_BYTES) {
      setError("That file is larger than 4 MB. Split it into a smaller transcript.");
      event.target.value = "";
      return;
    }
    try {
      const content = await file.text();
      setText(content);
      setFileName(file.name);
      const extension = file.name.split(".").pop()?.toLowerCase();
      setFormat(
        extension === "vtt"
          ? "vtt"
          : extension === "srt"
            ? "srt"
            : extension === "json"
              ? "json"
              : extension === "txt"
                ? "text"
                : "auto",
      );
    } catch {
      setError("That file could not be read as text.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) {
      setError("Paste a transcript or choose a file first.");
      return;
    }
    if (new Blob([text]).size > MAX_IMPORT_BYTES) {
      setError("That transcript is larger than 4 MB. Split it into a smaller file.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        text,
        format: format === "auto" ? undefined : format,
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The transcript could not be imported.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import a transcript"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="transcript-import-form" loading={busy}>
            Store locally
          </Button>
        </>
      }
    >
      <form id="transcript-import-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-2xl border border-line bg-bg p-3">
          <p className="text-xs leading-relaxed text-muted">
            Paste text or choose a file. The transcript is stored only in your local
            SQLite database; nothing is uploaded to a service.
          </p>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-pine hover:underline">
          <LinkIcon size={15} />
          Choose a .vtt, .srt, .json, or .txt file
          <input
            type="file"
            accept=".vtt,.srt,.json,.txt,text/vtt,text/plain,application/json"
            onChange={chooseFile}
            className="sr-only"
          />
        </label>
        {fileName ? (
          <p className="text-[0.65rem] text-muted">
            Loaded <span className="font-semibold text-fg">{fileName}</span>
          </p>
        ) : null}

        <div>
          <label htmlFor="transcript-format" className="text-xs font-semibold text-fg">
            Format
          </label>
          <select
            id="transcript-format"
            value={format}
            onChange={(event) =>
              setFormat(event.target.value as "auto" | TranscriptFormat)
            }
            className="mt-1.5 h-10 w-full rounded-xl border border-line bg-bg px-3 text-xs text-fg outline-none focus:border-accent"
          >
            <option value="auto">Detect automatically</option>
            <option value="vtt">WebVTT</option>
            <option value="srt">SubRip (SRT)</option>
            <option value="json">Podcasting 2.0 JSON</option>
            <option value="text">Plain text</option>
          </select>
        </div>

        <div>
          <label htmlFor="transcript-text" className="text-xs font-semibold text-fg">
            Transcript text
          </label>
          <textarea
            id="transcript-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={11}
            maxLength={4_000_000}
            spellCheck={false}
            placeholder={`WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nWelcome to the show.`}
            className="mt-1.5 w-full resize-y rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-xs leading-relaxed text-fg outline-none transition placeholder:text-muted/60 focus:border-accent"
          />
          <p className="mt-1 text-[0.65rem] text-muted">
            Up to 4 MB. Plain text may include timestamps such as [00:01:20] to enable
            line syncing.
          </p>
        </div>

        {error ? <Notice tone="error">{error}</Notice> : null}
      </form>
    </Modal>
  );
}
