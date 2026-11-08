import { Button } from "./Button";

interface PaginationProps {
  offset: number;
  limit: number;
  total: number;
  loading?: boolean;
  onChange: (offset: number) => void;
}

export function Pagination({ offset, limit, total, loading = false, onChange }: PaginationProps) {
  if (total <= limit) return null;

  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = offset + 1;
  const to = Math.min(offset + limit, total);

  return (
    <nav
      aria-label="Episode pages"
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-xs text-muted" aria-live="polite">
        Showing {from}–{to} of {total} · Page {page} of {pages}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={offset + limit >= total}
          loading={loading}
          onClick={() => onChange(offset + limit)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
