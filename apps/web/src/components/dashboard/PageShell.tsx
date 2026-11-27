import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "../ui";

/** The frame around the host's dashboard pages: logo, optional back link, page actions. */
export function PageShell({
  back,
  actions,
  children,
}: {
  back?: { href: string; label: string };
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <Link href="/">
            <Logo className="text-xl text-brass" />
          </Link>
          {back && (
            <Link href={back.href} className="text-chalk-dim transition hover:text-chalk">
              ← {back.label}
            </Link>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

/** A block shown while data loads, roughly the shape of what's coming. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse-soft rounded-2xl bg-felt-light ${className}`} />;
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-incorrect/50 px-5 py-4">
      <p className="font-semibold">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold text-brass underline underline-offset-4">
          Try again
        </button>
      )}
    </div>
  );
}
