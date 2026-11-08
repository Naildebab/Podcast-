import { useEffect, useState } from "react";
import { LogoMark } from "./Icons";

export function Cover({
  src,
  alt,
  title,
  className = "aspect-square w-full",
  eager = false,
}: {
  src: string | null | undefined;
  alt: string;
  title?: string;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`relative overflow-hidden rounded-2xl bg-surface-2 ${className}`}
        role="img"
        aria-label={alt}
      >
        <div
          className="absolute inset-0 opacity-55"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 12%, var(--accent) 0, transparent 46%), radial-gradient(circle at 82% 88%, var(--pine) 0, transparent 48%)",
          }}
        />
        <div className="relative flex h-full w-full flex-col items-center justify-center gap-2.5 p-3 text-center">
          <LogoMark size={38} />
          {title ? (
            <span className="line-clamp-2 font-serif text-sm leading-tight text-fg/75">
              {title}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`rounded-2xl bg-surface-2 object-cover ${className}`}
    />
  );
}
