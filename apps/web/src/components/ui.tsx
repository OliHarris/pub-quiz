import type { ReactNode } from "react";
import { APP_NAME } from "@pub-quiz/shared";

/* Literal class names so Tailwind can find them when it scans the code. */
const OPTION_COLOURS = ["bg-opt-a", "bg-opt-b", "bg-opt-c", "bg-opt-d"] as const;
export const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

type OptionTone = "idle" | "correct" | "faded" | "chosen";

interface OptionTileProps {
  index: number;
  text: string;
  tone?: OptionTone;
  size?: "tv" | "phone";
  /** How many teams picked this option (shown on the TV after the reveal). */
  count?: number;
  onClick?: () => void;
  disabled?: boolean;
}

/** One answer: a coloured tile with a letter, so it's identifiable without relying on colour. */
export function OptionTile({ index, text, tone = "idle", size = "tv", count, onClick, disabled }: OptionTileProps) {
  const letter = OPTION_LETTERS[index] ?? "?";
  const tv = size === "tv";
  const className = [
    "relative flex w-full items-center rounded-[1.25rem] text-left text-felt font-semibold transition duration-300",
    OPTION_COLOURS[index] ?? "bg-chalk",
    tv ? "gap-[1.5vw] px-[2vw] py-[1.5vw] text-[clamp(1.25rem,2.6vw,3.25rem)]" : "gap-4 px-5 py-5 text-xl",
    tone === "faded" && "opacity-25 saturate-50",
    tone === "correct" && "ring-[6px] ring-correct ring-offset-4 ring-offset-felt scale-[1.02]",
    tone === "chosen" && "ring-4 ring-chalk ring-offset-4 ring-offset-felt",
    onClick && !disabled && "active:scale-[0.97] hover:brightness-110 cursor-pointer",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <span
        aria-hidden
        className={`grid shrink-0 place-items-center rounded-full bg-felt/90 font-display text-chalk ${
          tv ? "size-[clamp(2.5rem,4.5vw,5.5rem)]" : "size-11 text-lg"
        }`}
      >
        {letter}
      </span>
      <span className="min-w-0 flex-1 text-balance">{text}</span>
      {tone === "correct" && (
        <span aria-label="Correct answer" className={tv ? "text-[3vw]" : "text-2xl"}>
          ✓
        </span>
      )}
      {count !== undefined && (
        <span className={`rounded-full bg-felt/85 px-3 py-1 font-display text-chalk ${tv ? "text-[1.6vw]" : "text-base"}`}>
          {count} {count === 1 ? "team" : "teams"}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={className}>
        <span className="sr-only">{letter}: </span>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}

/** A shrinking ring with the seconds left in the middle. */
export function CountdownRing({ msLeft, totalMs, className = "" }: { msLeft: number; totalMs: number; className?: string }) {
  const seconds = Math.ceil(msLeft / 1000);
  const fraction = totalMs > 0 ? msLeft / totalMs : 0;
  const circumference = 2 * Math.PI * 44;
  const urgent = seconds <= 5;
  return (
    <div role="timer" aria-label={`${seconds} seconds left`} className={`relative shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r="44" fill="none" strokeWidth="8" className="stroke-felt-lighter" />
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className={`transition-[stroke-dashoffset] duration-100 ease-linear ${urgent ? "stroke-opt-c" : "stroke-brass"}`}
        />
      </svg>
      <span
        className={`absolute inset-0 grid place-items-center font-display text-[3.6vw] font-bold tabular-nums ${urgent ? "text-opt-c" : ""}`}
      >
        {seconds}
      </span>
    </div>
  );
}

/** The room code as big letter tiles, like a pub's letter board. */
export function RoomCode({ code, size = "tv" }: { code: string; size?: "tv" | "phone" }) {
  return (
    <div data-testid="room-code" aria-label={`Room code ${code.split("").join(" ")}`} className="flex gap-[0.6vw]">
      {code.split("").map((letter, i) => (
        <span
          key={i}
          className={`grid place-items-center rounded-xl bg-felt font-display font-bold text-brass shadow-[inset_0_-4px_0_rgb(0_0_0/0.35)] ${
            size === "tv" ? "h-[6.5vw] w-[5.2vw] text-[4.4vw]" : "h-14 w-11 text-3xl"
          }`}
        >
          {letter}
        </span>
      ))}
    </div>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-bold tracking-tight ${className}`}>
      <span aria-hidden className="mr-1.5">🍺</span>
      {APP_NAME}
    </span>
  );
}

/** Full-screen message for loading and error states. */
export function Splash({ title, detail, children }: { title: string; detail?: string; children?: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo className="text-xl text-chalk-dim" />
      <h1 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h1>
      {detail && <p className="max-w-md text-chalk-dim">{detail}</p>}
      {children}
    </main>
  );
}

export function Toast({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-md animate-rise rounded-2xl bg-incorrect px-5 py-3 text-center font-semibold text-felt shadow-2xl"
    >
      {children}
    </div>
  );
}

export function ConnectionDot({ status }: { status: "connecting" | "connected" | "reconnecting" }) {
  const label = status === "connected" ? "Connected" : status === "connecting" ? "Connecting" : "Reconnecting…";
  return (
    <span className="flex items-center gap-2 text-sm text-chalk-dim" aria-live="polite">
      <span
        className={`size-2.5 rounded-full ${status === "connected" ? "bg-correct" : "animate-pulse-soft bg-brass"}`}
      />
      {label}
    </span>
  );
}

export function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-full bg-brass px-7 py-3.5 font-display text-lg font-bold text-felt shadow-[0_6px_0_rgb(0_0_0/0.3)] transition hover:brightness-110 active:translate-y-0.5 active:shadow-[0_3px_0_rgb(0_0_0/0.3)] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

/* Shared class names for elements that aren't PrimaryButton, e.g. links styled as buttons. */
export const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full bg-brass px-6 py-3 font-display text-base font-bold text-felt shadow-[0_5px_0_rgb(0_0_0/0.3)] transition hover:brightness-110 active:translate-y-0.5 active:shadow-[0_2px_0_rgb(0_0_0/0.3)] disabled:cursor-not-allowed disabled:opacity-40";
export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full border-2 border-felt-lighter px-5 py-2.5 font-semibold text-chalk transition hover:border-chalk-dim disabled:cursor-not-allowed disabled:opacity-40";
export const smallButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";
export const cardClass = "rounded-[1.75rem] bg-felt-light p-6 sm:p-7";
export const inputClass =
  "w-full rounded-xl border-2 border-felt-lighter bg-felt px-4 py-2.5 text-chalk placeholder:text-chalk-dim/50 focus:border-brass focus:outline-none aria-[invalid=true]:border-incorrect";

export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm font-semibold text-incorrect">
      {message}
    </p>
  );
}
