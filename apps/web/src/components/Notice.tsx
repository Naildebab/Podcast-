import type { ReactNode } from "react";
import { Button } from "./Button";
import { CheckIcon, SparklesIcon, WifiOffIcon } from "./Icons";

type Tone = "info" | "success" | "error";

export function Notice({
  tone = "info",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const styles: Record<Tone, string> = {
    info: "border-line bg-surface-2 text-muted",
    success: "border-pine/30 bg-pine/10 text-pine",
    error: "border-danger/30 bg-danger-soft text-danger",
  };
  const Icon = tone === "success" ? CheckIcon : tone === "error" ? WifiOffIcon : SparklesIcon;

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm leading-relaxed ${styles[tone]} ${className}`}
    >
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ErrorPanel({
  message,
  onRetry,
  className = "",
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border border-danger/30 bg-danger-soft p-6 ${className}`}
      role="alert"
    >
      <p className="font-serif text-xl text-fg">That did not work.</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{message}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-surface-2 ${className}`}
      aria-hidden="true"
    />
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  body: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-3xl border border-dashed border-line bg-surface/55 px-6 py-12 text-center ${className}`}
    >
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          {icon}
        </div>
      ) : null}
      <h3 className="font-serif text-2xl text-fg">{title}</h3>
      <div className="mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</div>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
