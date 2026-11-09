import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useTheme } from "../theme/ThemeContext";
import {
  BookIcon,
  CompassIcon,
  HeadphonesIcon,
  HomeIcon,
  LibraryIcon,
  ListIcon,
  MoonIcon,
  SettingsIcon,
  SparklesIcon,
  SunIcon,
} from "./Icons";
import { LogoMark } from "./Icons";
import { PlayerBar } from "./PlayerBar";

const primaryNav = [
  { to: "/", label: "Home", shortLabel: "Home", icon: HomeIcon },
  { to: "/discover", label: "Discover", shortLabel: "Discover", icon: CompassIcon },
  { to: "/library", label: "My podcasts", shortLabel: "Library", icon: LibraryIcon },
  { to: "/episodes", label: "All episodes", shortLabel: "Episodes", icon: ListIcon },
];

function isActivePath(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}

export function Layout() {
  const { pathname } = useLocation();
  const { resolvedDark, toggle } = useTheme();

  return (
    <div className="min-h-screen">
      <ScrollToTop />

      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface/65 backdrop-blur-xl md:flex">
        <div className="px-5 py-7">
          <Link to="/" className="flex items-center gap-3" aria-label="Podcast Language Studio home">
            <LogoMark size={40} />
            <span>
              <span className="block font-serif text-xl leading-none text-fg">Podcast</span>
              <span className="mt-1 block text-[0.58rem] font-bold uppercase tracking-[0.2em] text-muted">
                Language Studio
              </span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <p className="eyebrow px-3 pb-2">Listen</p>
          <div className="space-y-1">
            {primaryNav.map(({ to, label, icon: Icon }) => {
              const active = isActivePath(pathname, to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    active
                      ? "bg-accent-soft text-accent-strong"
                      : "text-muted hover:bg-surface-2 hover:text-fg"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={19} />
                  {label}
                </Link>
              );
            })}
          </div>

          <p className="eyebrow px-3 pb-2 pt-6">Practice</p>
          <div className="space-y-1">
            <Link
              to="/dictionary"
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                isActivePath(pathname, "/dictionary")
                  ? "bg-accent-soft text-accent-strong"
                  : "text-muted hover:bg-surface-2 hover:text-fg"
              }`}
              aria-current={isActivePath(pathname, "/dictionary") ? "page" : undefined}
            >
              <BookIcon size={19} /> Dictionary
            </Link>
            <Link
              to="/vocabulary"
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                isActivePath(pathname, "/vocabulary")
                  ? "bg-accent-soft text-accent-strong"
                  : "text-muted hover:bg-surface-2 hover:text-fg"
              }`}
              aria-current={isActivePath(pathname, "/vocabulary") ? "page" : undefined}
            >
              <SparklesIcon size={19} /> Vocabulary
            </Link>
          </div>
        </nav>

        <div className="px-3">
          <div className="rounded-2xl border border-line bg-bg/70 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-pine">
              <HeadphonesIcon size={16} /> Local-first
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Your library, notes, recordings, and playback positions stay on this
              computer.
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between px-4 pb-5">
          <Link
            to="/settings"
            className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition ${
              pathname === "/settings"
                ? "bg-surface-2 text-fg"
                : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <SettingsIcon size={16} /> Settings
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-label={resolvedDark ? "Switch to light theme" : "Switch to dark theme"}
            className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
          >
            {resolvedDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Podcast Language Studio home">
            <LogoMark size={32} />
            <span className="font-serif text-lg leading-none text-fg">
              Podcast <span className="text-muted">Studio</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <Link
              to="/discover"
              aria-label="Discover podcasts"
              className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
            >
              <CompassIcon size={20} />
            </Link>
            <Link
              to="/dictionary"
              aria-label="Dictionary"
              className={`rounded-full p-2 transition hover:bg-surface-2 hover:text-fg ${
                pathname === "/dictionary" ? "bg-surface-2 text-fg" : "text-muted"
              }`}
            >
              <BookIcon size={20} />
            </Link>
            <Link
              to="/vocabulary"
              aria-label="Vocabulary"
              className={`rounded-full p-2 transition hover:bg-surface-2 hover:text-fg ${
                pathname === "/vocabulary" ? "bg-surface-2 text-fg" : "text-muted"
              }`}
            >
              <SparklesIcon size={20} />
            </Link>
            <button
              type="button"
              onClick={toggle}
              aria-label={resolvedDark ? "Switch to light theme" : "Switch to dark theme"}
              className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
            >
              {resolvedDark ? <SunIcon size={19} /> : <MoonIcon size={19} />}
            </button>
            <Link
              to="/settings"
              aria-label="Settings"
              className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
            >
              <SettingsIcon size={19} />
            </Link>
          </div>
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2">
          {primaryNav.map(({ to, label, shortLabel, icon: Icon }) => {
            const active = isActivePath(pathname, to);
            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  active ? "bg-accent-soft text-accent-strong" : "text-muted hover:bg-surface-2"
                }`}
              >
                <Icon size={15} />
                {shortLabel ?? label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="md:pl-64">
        <main className="mx-auto w-full max-w-[1180px] px-4 pb-44 pt-6 sm:px-6 md:px-10 md:pt-10">
          <Outlet />
          <footer className="mt-16 flex flex-col items-start justify-between gap-2 border-t border-line pt-5 text-[0.68rem] text-muted sm:flex-row sm:items-center">
            <span>Podcast Language Studio · Phase 5</span>
            <span>Local data. No accounts. No tracking.</span>
          </footer>
        </main>
      </div>

      <PlayerBar />
    </div>
  );
}
