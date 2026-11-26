import Link from "next/link";
import { APP_NAME } from "@pub-quiz/shared";
import { JoinCodeForm } from "@/components/JoinCodeForm";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-12 px-5 py-16">
      <header className="flex flex-col gap-4">
        <p className="text-5xl" aria-hidden>
          🍺
        </p>
        <h1 className="font-display text-5xl font-bold tracking-tight sm:text-7xl">{APP_NAME}</h1>
        <p className="max-w-xl text-lg text-chalk-dim sm:text-xl">
          The questions go up on the big screen. Teams answer on their phones. No app to download, no paper, no
          arguments about whose handwriting says &ldquo;Petra&rdquo;.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-[1.75rem] bg-felt-light p-7">
          <h2 className="font-display text-2xl font-bold">Join a game</h2>
          <p className="text-chalk-dim">Enter the 4-letter code shown on the TV.</p>
          <JoinCodeForm />
        </section>

        <section className="flex flex-col gap-4 rounded-[1.75rem] bg-felt-light p-7">
          <h2 className="font-display text-2xl font-bold">Host a quiz</h2>
          <p className="text-chalk-dim">Open this on a laptop connected to the TV. Teams scan the QR code to join.</p>
          <Link
            href="/host"
            className="mt-auto rounded-full bg-chalk px-7 py-3.5 text-center font-display text-lg font-bold text-felt transition hover:brightness-95"
          >
            Start hosting →
          </Link>
        </section>
      </div>
    </main>
  );
}
