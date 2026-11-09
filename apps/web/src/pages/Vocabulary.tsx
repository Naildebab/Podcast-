import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import {
  BookIcon,
  CheckIcon,
  ExternalIcon,
  SearchIcon,
  SparklesIcon,
  TrashIcon,
} from "../components/Icons";
import { ConfirmDialog } from "../components/Modal";
import { ErrorPanel, Notice, Skeleton } from "../components/Notice";
import { api } from "../lib/api";
import { formatTime } from "../lib/format";
import { useAsync, useDebounced, useDocumentTitle } from "../lib/hooks";
import type { VocabularyItem, VocabularyStatus } from "../lib/types";

type StatusFilter = "all" | VocabularyStatus;

const STATUS_LABELS: Record<VocabularyStatus, string> = {
  new: "New",
  learning: "Learning",
  known: "Known",
};

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All words" },
  { value: "new", label: "New" },
  { value: "learning", label: "Learning" },
  { value: "known", label: "Known" },
];

export function Vocabulary() {
  useDocumentTitle("Vocabulary");
  const [query, setQuery] = useState("");
  const search = useDebounced(query, 250);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VocabularyItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const request = useAsync(
    () =>
      api.vocabulary({
        q: search.trim() || undefined,
        status: filter === "all" ? undefined : filter,
        limit: 100,
      }),
    [search, filter],
  );

  const words = request.data?.words ?? [];

  async function removeWord() {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    try {
      await api.deleteVocabulary(deleteTarget.id);
      setDeleteTarget(null);
      setNotice("Word removed from your vocabulary.");
      request.reload();
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : "The word could not be removed.",
      );
    } finally {
      setDeleting(false);
    }
  }

  function changed(message: string | null = null) {
    if (message) setNotice(message);
    request.reload();
  }

  return (
    <div className="space-y-8">
      <section className="animate-rise">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Local practice</p>
            <h1 className="mt-2 font-serif text-4xl leading-none text-fg sm:text-5xl">
              Vocabulary
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              Words you save keep their dictionary meaning, Arabic translation, and the
              transcript line where you found them. Everything stays in your local database.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-right">
            <p className="font-serif text-3xl leading-none text-fg">
              {request.data?.total ?? 0}
            </p>
            <p className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.15em] text-muted">
              saved {request.data?.total === 1 ? "word" : "words"}
            </p>
          </div>
        </div>
      </section>

      <section className="animate-rise delay-1 rounded-3xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search saved words, notes, or context…"
              aria-label="Search vocabulary"
              className="h-11 w-full rounded-full border border-line bg-bg pl-10 pr-4 text-sm text-fg outline-none transition placeholder:text-muted/80 focus:border-accent"
            />
          </div>
          <div className="no-scrollbar flex gap-1 overflow-x-auto" role="group" aria-label="Filter by status">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                aria-pressed={filter === item.value}
                className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  filter === item.value
                    ? "bg-accent-soft text-accent-strong"
                    : "text-muted hover:bg-surface-2 hover:text-fg"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {actionError ? <Notice tone="error">{actionError}</Notice> : null}
      {request.error && request.data ? (
        <Notice tone="error">{request.error}</Notice>
      ) : null}

      {request.loading && !request.data ? (
        <div className="space-y-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : request.error && !request.data ? (
        <ErrorPanel message={request.error} onRetry={request.reload} />
      ) : words.length === 0 ? (
        <section className="animate-rise delay-2 rounded-3xl border border-dashed border-line bg-surface/55 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <SparklesIcon size={22} />
          </div>
          <h2 className="mt-4 font-serif text-2xl text-fg">
            {search.trim() || filter !== "all"
              ? "No saved words match"
              : "Build your own word list"}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted">
            {search.trim() || filter !== "all"
              ? "Try a different search or choose another status."
              : "Open an episode transcript and click any word. The definition, Arabic translation, and example sentence can be saved here with one click."}
          </p>
          {!search.trim() && filter === "all" ? (
            <Link
              to="/episodes"
              className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-pine hover:underline"
            >
              <BookIcon size={14} /> Browse episodes <ExternalIcon size={11} />
            </Link>
          ) : null}
        </section>
      ) : (
        <section className="animate-rise delay-2 space-y-3">
          <div className="flex items-center justify-between text-[0.68rem] text-muted">
            <span>
              Showing {words.length} of {request.data?.total ?? words.length}
            </span>
            {request.loading ? <span>Updating…</span> : null}
          </div>
          {words.map((word) => (
            <VocabularyCard
              key={word.id}
              item={word}
              onChanged={changed}
              onError={setActionError}
              onDelete={() => setDeleteTarget(word)}
            />
          ))}
        </section>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Remove this saved word?"
        message={
          <>
            <span className="font-semibold text-fg">{deleteTarget?.word}</span> and its note
            will be removed from your local vocabulary. Your transcript and listening progress
            are not affected.
          </>
        }
        confirmLabel="Remove word"
        busy={deleting}
        onConfirm={removeWord}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function VocabularyCard({
  item,
  onChanged,
  onError,
  onDelete,
}: {
  item: VocabularyItem;
  onChanged: (message?: string | null) => void;
  onError: (message: string) => void;
  onDelete: () => void;
}) {
  const [status, setStatus] = useState<VocabularyStatus>(item.status);
  const [notes, setNotes] = useState(item.notes);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    setStatus(item.status);
  }, [item.status]);

  useEffect(() => {
    setNotes(item.notes);
  }, [item.id, item.notes]);

  const dirty = notes !== item.notes;
  const visibleDefinitions = item.definitions.slice(0, 4);
  const extraDefinitions = item.definitions.length - visibleDefinitions.length;

  async function changeStatus(next: VocabularyStatus) {
    const previous = status;
    setStatus(next);
    setSavingStatus(true);
    try {
      await api.updateVocabulary(item.id, { status: next });
      onChanged(`Moved “${item.word}” to ${STATUS_LABELS[next].toLowerCase()}.`);
    } catch (caught) {
      setStatus(previous);
      onError(caught instanceof Error ? caught.message : "The status could not be saved.");
    } finally {
      setSavingStatus(false);
    }
  }

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await api.updateVocabulary(item.id, { notes });
      onChanged("Note saved.");
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "The note could not be saved.");
    } finally {
      setSavingNotes(false);
    }
  }

  return (
    <article className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-2xl text-fg">{item.word}</h2>
            {item.pos ? <Badge tone="outline">{item.pos}</Badge> : null}
            {item.lemma ? (
              <span className="text-[0.65rem] text-muted">form of {item.lemma}</span>
            ) : null}
            {item.ipa ? (
              <span className="font-mono text-xs text-pine">{item.ipa}</span>
            ) : null}
          </div>
          <p className="mt-1 text-[0.65rem] text-muted">
            Added {new Date(item.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[0.65rem] font-semibold text-muted">
            <span className="sr-only">Learning status</span>
            <select
              value={status}
              onChange={(event) => void changeStatus(event.target.value as VocabularyStatus)}
              disabled={savingStatus}
              className="rounded-full border border-line bg-bg px-2.5 py-1.5 text-[0.68rem] font-semibold text-fg outline-none focus:border-accent disabled:opacity-60"
            >
              {(Object.keys(STATUS_LABELS) as VocabularyStatus[]).map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${item.word}`}
            className="rounded-full p-2 text-muted transition hover:bg-danger-soft hover:text-danger"
          >
            <TrashIcon size={16} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div>
          {visibleDefinitions.length > 0 ? (
            <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
              {visibleDefinitions.map((definition, index) => (
                <li key={`${item.id}-definition-${index}`}>{definition}</li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">
              No definition was available when this word was saved.
            </p>
          )}
          {extraDefinitions > 0 ? (
            <p className="mt-1 text-[0.65rem] text-muted">
              +{extraDefinitions} more {extraDefinitions === 1 ? "definition" : "definitions"}
            </p>
          ) : null}

          {item.arabic.length > 0 ? (
            <div className="mt-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2">
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted">
                Arabic
              </p>
              <p dir="rtl" lang="ar" className="mt-1 text-base leading-relaxed text-fg">
                {item.arabic.join(" · ")}
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          {item.context ? (
            <div className="rounded-xl border border-line bg-bg px-3 py-2.5">
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted">
                From your listening
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-fg">“{item.context}”</p>
              {item.episodeId ? (
                <Link
                  to={`/episodes/${item.episodeId}`}
                  className="mt-2 inline-flex items-center gap-1 text-[0.65rem] font-semibold text-pine hover:underline"
                >
                  {item.episodeTitle ?? "Episode"}
                  {item.startMs !== null ? ` · ${formatTime(item.startMs / 1000)}` : ""}
                  <ExternalIcon size={10} />
                </Link>
              ) : null}
            </div>
          ) : null}

          <div>
            <label
              htmlFor={`vocabulary-note-${item.id}`}
              className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted"
            >
              Your note
            </label>
            <textarea
              id={`vocabulary-note-${item.id}`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              maxLength={4000}
              placeholder="Add a memory hook, example, or question…"
              className="mt-1.5 w-full resize-y rounded-xl border border-line bg-bg px-3 py-2 text-xs leading-relaxed text-fg outline-none transition placeholder:text-muted/60 focus:border-accent"
            />
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-[0.62rem] text-muted">
                {dirty ? "Unsaved changes" : "Saved locally"}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void saveNotes()}
                loading={savingNotes}
                disabled={!dirty}
              >
                <CheckIcon size={13} /> Save note
              </Button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
