import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { formatTime } from "../lib/format";
import type { DictionaryResult, Episode } from "../lib/types";
import { Badge } from "./Badge";
import { Button, Spinner } from "./Button";
import {
  BookIcon,
  CheckIcon,
  CloseIcon,
  PlusIcon,
  RefreshIcon,
} from "./Icons";

export interface TranslationSelection {
  word: string;
  cueIndex: number;
  tokenIndex: number;
  startMs: number | null;
  context: string;
}

export function WordTranslationPanel({
  selection,
  episode,
  onClose,
}: {
  selection: TranslationSelection;
  episode: Episode;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<DictionaryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setResult(null);
    api
      .dictionary(selection.word)
      .then((found) => {
        if (active) setResult(found);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : "The lookup could not be completed.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selection.word, attempt]);

  useEffect(() => {
    setSaved(false);
    setSaveError(null);
  }, [selection.word, selection.cueIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (panelRef.current?.contains(target)) return;
      if (target.closest("[data-translate-word]")) return;
      onClose();
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("click", onClickOutside, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("click", onClickOutside, true);
    };
  }, [onClose]);

  const firstEntry = result?.entries[0] ?? null;
  const entries = result?.entries.slice(0, 6) ?? [];
  const extraEntries = (result?.entries.length ?? 0) - entries.length;

  async function saveWord() {
    setSaving(true);
    setSaveError(null);
    try {
      await api.saveVocabulary({
        word: selection.word,
        entryId: firstEntry?.id,
        episodeId: episode.id,
        cueIndex: selection.cueIndex,
        startMs: selection.startMs ?? undefined,
        context: selection.context,
      });
      setSaved(true);
    } catch (caught) {
      setSaveError(
        caught instanceof Error ? caught.message : "The word could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Translation for ${selection.word}`}
      className="fixed inset-x-3 bottom-24 z-[70] max-h-[min(72vh,38rem)] overflow-y-auto rounded-3xl border border-line bg-surface shadow-[0_24px_70px_-24px_rgba(0,0,0,0.55)] sm:inset-x-auto sm:right-5 sm:w-[27rem]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line bg-surface-2/45 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-muted">
            Click-to-translate
          </p>
          <h2 className="mt-0.5 truncate font-serif text-2xl text-fg">
            {selection.word}
          </h2>
          {firstEntry?.ipa ? (
            <p className="mt-0.5 font-mono text-xs text-pine">{firstEntry.ipa}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close translation"
          className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="px-4 py-4" aria-live="polite">
        {loading ? (
          <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-bg px-3 py-3 text-sm text-muted">
            <Spinner className="text-accent" />
            Looking up {selection.word} in the local dictionary…
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-danger/30 bg-danger-soft px-3 py-3 text-sm text-danger">
            <p>{error}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => setAttempt((value) => value + 1)}
            >
              <RefreshIcon size={13} /> Try again
            </Button>
          </div>
        ) : !result || result.entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-bg px-3 py-4 text-sm leading-relaxed text-muted">
            No dictionary entry was found for “{selection.word}”. It may be a name, a
            misspelling, or a word that is not in this Wiktionary extract.
          </div>
        ) : (
          <div className="space-y-2.5">
            {entries.map((entry) => (
              <article
                key={entry.id}
                className="rounded-2xl border border-line bg-bg p-3"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="outline">{entry.pos || "word"}</Badge>
                  {entry.lemma ? (
                    <span className="text-[0.62rem] text-muted">form of {entry.lemma}</span>
                  ) : null}
                  {entry.ipa ? (
                    <span className="ml-auto font-mono text-[0.68rem] text-pine">
                      {entry.ipa}
                    </span>
                  ) : null}
                </div>

                {entry.definitions.length > 0 ? (
                  <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm leading-relaxed text-fg">
                    {entry.definitions.map((definition, index) => (
                      <li key={`${entry.id}-${index}`}>{definition}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-muted">No definition text is available.</p>
                )}

                {entry.arabic.length > 0 ? (
                  <div className="mt-2.5 rounded-xl border border-line bg-surface-2/60 px-2.5 py-2">
                    <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-muted">
                      Arabic
                    </p>
                    <p dir="rtl" lang="ar" className="mt-0.5 text-base leading-relaxed text-fg">
                      {entry.arabic.join(" · ")}
                    </p>
                  </div>
                ) : null}
              </article>
            ))}
            {extraEntries > 0 ? (
              <p className="px-1 text-[0.65rem] text-muted">
                Showing 6 of {result?.entries.length ?? 0} entries. Search this word in the
                Dictionary page to see all senses.
              </p>
            ) : null}
          </div>
        )}

        <div className="mt-3 rounded-2xl border border-line bg-bg px-3 py-2.5">
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-muted">
            In this episode
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">“{selection.context}”</p>
          {selection.startMs !== null ? (
            <p className="mt-1 text-[0.65rem] tabular-nums text-muted">
              Around {formatTime(selection.startMs / 1000)}
            </p>
          ) : null}
        </div>

        {saveError ? (
          <p className="mt-2 text-xs leading-relaxed text-danger" role="alert">
            {saveError}
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[0.6rem] text-muted">
            <BookIcon size={12} /> Wiktionary · CC BY-SA 4.0
          </span>
          <Button
            size="sm"
            variant={saved ? "secondary" : "primary"}
            onClick={() => void saveWord()}
            loading={saving}
            disabled={saved || loading}
          >
            {saved ? (
              <>
                <CheckIcon size={13} /> Saved
              </>
            ) : (
              <>
                <PlusIcon size={13} /> Save word
              </>
            )}
          </Button>
        </div>

        <p className="mt-2 text-center text-[0.6rem] text-muted">
          Click another word to update this panel · Esc or click outside to close
        </p>
      </div>
    </div>,
    document.body,
  );
}
