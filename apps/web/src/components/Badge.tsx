import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "pine" | "amber" | "danger" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent-strong",
  pine: "bg-pine/10 text-pine",
  amber: "bg-amber/15 text-amber",
  danger: "bg-danger-soft text-danger",
  outline: "border border-line text-muted",
};

export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.14em] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
