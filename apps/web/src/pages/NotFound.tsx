import { Link } from "react-router-dom";
import { CompassIcon, HomeIcon } from "../components/Icons";
import { EmptyState } from "../components/Notice";

export function NotFound() {
  return (
    <div className="py-10">
      <EmptyState
        icon={<CompassIcon size={24} />}
        title="That page is not here"
        body="The link may be old, or the page has not been built yet. Your library is still available."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong"
            >
              <HomeIcon size={16} /> Go home
            </Link>
            <Link
              to="/library"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-fg transition hover:bg-surface-2"
            >
              My podcasts
            </Link>
          </div>
        }
      />
    </div>
  );
}
