import { Link } from "react-router-dom";
import type { CatalogPodcast, Podcast } from "../lib/types";
import { percent, timeAgo } from "../lib/format";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Cover } from "./Cover";
import { ArrowRightIcon, PlusIcon } from "./Icons";

export function PodcastCard({ podcast }: { podcast: Podcast }) {
  const progress = percent(podcast.completedCount, podcast.episodeCount);
  return (
    <Link
      to={`/library/${podcast.id}`}
      className="group flex flex-col rounded-3xl border border-line bg-surface p-3 transition duration-200 hover:-translate-y-1 hover:shadow-soft"
    >
      <div className="relative overflow-hidden rounded-2xl">
        <Cover
          src={podcast.imageUrl}
          alt={`${podcast.title} cover`}
          title={podcast.title}
          className="aspect-square w-full transition duration-500 group-hover:scale-[1.04]"
        />
        {podcast.inProgressCount > 0 ? (
          <span className="absolute left-2.5 top-2.5">
            <Badge tone="accent">In progress</Badge>
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col px-1 pt-4">
        <h3 className="line-clamp-2 font-serif text-xl leading-tight text-fg transition group-hover:text-accent">
          {podcast.title}
        </h3>
        <p className="mt-1 truncate text-xs font-medium text-muted">{podcast.author}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-[0.68rem] text-muted">
          <span>
            {podcast.episodeCount} {podcast.episodeCount === 1 ? "episode" : "episodes"}
          </span>
          <span>{podcast.completedCount} done</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-pine" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-[0.65rem] text-muted">Updated {timeAgo(podcast.lastRefreshedAt)}</p>
      </div>
    </Link>
  );
}

export function CatalogCard({
  item,
  onPreview,
}: {
  item: CatalogPodcast;
  onPreview: (item: CatalogPodcast) => void;
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-line bg-surface transition duration-200 hover:-translate-y-1 hover:shadow-soft">
      <div className="relative overflow-hidden">
        <Cover
          src={item.imageUrl}
          alt={`${item.title} cover`}
          title={item.title}
          className="aspect-[1.35/1] w-full transition duration-500 group-hover:scale-[1.03] sm:aspect-square"
        />
        <span className="absolute left-2.5 top-2.5">
          {item.inLibrary ? (
            <Badge tone="pine">In library</Badge>
          ) : (
            <Badge tone="neutral">{item.level}</Badge>
          )}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-serif text-xl leading-tight text-fg">{item.title}</h3>
          <ArrowRightIcon
            size={17}
            className="mt-1 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent"
          />
        </div>
        <p className="mt-1 text-xs font-medium text-pine">{item.author}</p>
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">
          {item.description}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.62rem] font-medium text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          <span className="text-[0.65rem] uppercase tracking-[0.14em] text-muted">
            {item.categories[0]}
          </span>
          {item.inLibrary && item.libraryId ? (
            <Link
              to={`/library/${item.libraryId}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-xs font-semibold text-fg transition hover:bg-surface-2"
            >
              Open <ArrowRightIcon size={13} />
            </Link>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => onPreview(item)}>
              <PlusIcon size={14} /> Preview
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
