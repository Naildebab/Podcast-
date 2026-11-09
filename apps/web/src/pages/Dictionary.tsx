import { useState, type FormEvent } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { BookIcon, ExternalIcon, SearchIcon } from "../components/Icons";
import { Notice, Skeleton } from "../components/Notice";
import { api } from "../lib/api";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import type { DictionaryResult } from "../lib/types";

const SUGGESTIONS = ["podcast", "language", "listen", "running", "better"];

export function Dictionary() {
  useDocumentTitle("Dictionary");
  const resources = useAsync(() => api.resources(), []);
  const [word, setWord] = useState("");
  const [searched, setSearched] = useState<string | null>(null);
  const [result, setResult] = useState<DictionaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookup(next = word) {
    const query = next.trim();
    if (!query) {
      setError("Type a word or short phrase first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const found = await api.dictionary(query);
      setResult(found);
      setSearched(query);
      setWord(query);
    } catch (caught) {
      setResult(null);
      setSearched(query);
      setError(caught instanceof Error ? caught.message : "The lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void lookup();
  }

  const dictionary = resources.data?.dictionary;

  return (
    <div className="space-y-8">
      <section className="animate-rise">
        <p className="eyebrow">Local reference</p>
        <h1 className="mt-2 font-serif text-4xl leading-none text-fg sm:text-5xl">Dictionary</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Look up definitions, pronunciation, Arabic translations, and word forms from the
          Wiktionary database already on this computer. Nothing is sent to a dictionary service.
        </p>
      </section>

      <section className="animate-rise delay-1 rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              size={17}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={word}
              onChange={(event) => setWord(event.target.value)}
              placeholder="Type an English word or phrase…"
              aria-label="Look up a word"
              className="h-12 w-full rounded-full border border-line bg-bg pl-11 pr-4 text-sm text-fg outline-none transition placeholder:text-muted/80 focus:border-accent"
            />
          </div>
          <Button type="submit" loading={loading} className="h-12">
            Look up
          </Button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
            Try
          </span>
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void lookup(suggestion)}
              className="rounded-full border border-line bg-bg px-2.5 py-1 text-[0.68rem] font-semibold text-muted transition hover:border-accent/40 hover:text-fg"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {dictionary && !dictionary.available ? (
          <Notice tone="error" className="mt-4">
            The local dictionary is unavailable. {dictionary.error}
          </Notice>
        ) : null}
        {dictionary?.available ? (
          <p className="mt-3 text-[0.65rem] leading-relaxed text-muted">
            {dictionary.entries?.toLocaleString()} entries and{" "}
            {dictionary.forms?.toLocaleString()} word forms · {dictionary.source} ·{" "}
            {dictionary.license}
          </p>
        ) : null}
      </section>

      {error ? (
        <Notice tone="error">
          {error}
          {searched ? <span className="block mt-1 text-xs">Searched: {searched}</span> : null}
        </Notice>
      ) : null}

      {loading && !result ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : result ? (
        <DictionaryResultView result={result} />
      ) : (
        <section className="animate-rise delay-2 rounded-3xl border border-dashed border-line bg-surface/55 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <BookIcon size={22} />
          </div>
          <h2 className="mt-4 font-serif text-2xl text-fg">A dictionary on your own disk</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
            This page reads the existing dictionary.db in read-only mode. Use the suggestions
            above or search for any English word you hear in an episode.
          </p>
        </section>
      )}
    </div>
  );
}

function DictionaryResultView({ result }: { result: DictionaryResult }) {
  const forms = result.forms.slice(0, 80);
  const extraForms = result.forms.length - forms.length;

  return (
    <section className="animate-rise rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Lookup</p>
          <h2 className="mt-1 font-serif text-3xl text-fg">{result.normalized}</h2>
          <p className="mt-1 text-xs text-muted">
            {result.matchedBy === "form"
              ? `Shown through ${result.lemmas.join(", ")}`
              : result.matchedBy === "word"
                ? "Direct dictionary entry"
                : "No direct entry or word form was found"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={result.entries.length > 0 ? "pine" : "outline"}>
            {result.entries.length} {result.entries.length === 1 ? "entry" : "entries"}
          </Badge>
          <Badge tone="outline">{result.source.license}</Badge>
        </div>
      </div>

      {result.entries.length === 0 ? (
        <Notice className="mt-4">
          No entry was found for “{result.query}”. Try the base form of the word or a different
          spelling.
        </Notice>
      ) : (
        <div className="mt-5 space-y-3">
          {result.entries.map((entry) => (
            <article
              key={entry.id}
              className="rounded-2xl border border-line bg-bg p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-serif text-xl text-fg">{entry.word}</h3>
                <Badge tone="outline">{entry.pos}</Badge>
                {entry.lemma ? (
                  <span className="text-[0.65rem] text-muted">form of {entry.lemma}</span>
                ) : null}
                {entry.ipa ? (
                  <span className="ml-auto font-mono text-xs text-pine">{entry.ipa}</span>
                ) : null}
              </div>

              {entry.definitions.length > 0 ? (
                <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
                  {entry.definitions.map((definition, index) => (
                    <li key={`${entry.id}-${index}`}>{definition}</li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-sm text-muted">No definition text is available.</p>
              )}

              {entry.arabic.length > 0 ? (
                <div className="mt-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2">
                  <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted">
                    Arabic
                  </p>
                  <p
                    dir="rtl"
                    lang="ar"
                    className="mt-1 text-base leading-relaxed text-fg"
                  >
                    {entry.arabic.join(" · ")}
                  </p>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {forms.length > 0 ? (
        <div className="mt-5">
          <p className="eyebrow">Available word forms</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {forms.map((form) => (
              <span
                key={form}
                className="rounded-full border border-line bg-bg px-2.5 py-1 text-[0.68rem] text-muted"
              >
                {form}
              </span>
            ))}
            {extraForms > 0 ? (
              <span className="rounded-full px-2.5 py-1 text-[0.68rem] text-muted">
                +{extraForms} more
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-5 border-t border-line pt-4 text-[0.65rem] leading-relaxed text-muted">
        Definitions and translations come from {result.source.name}. Data is available under{" "}
        {result.source.license}.{" "}
        <a
          href={result.source.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-pine hover:underline"
        >
          Source <ExternalIcon size={11} />
        </a>
      </div>
    </section>
  );
}
