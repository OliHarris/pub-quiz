"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DIFFICULTIES, sampleQuiz, SAMPLE_QUIZ_ID, type Difficulty } from "@pub-quiz/shared";
import { api, queryKeys } from "@/lib/api";
import { plural, timeAgo } from "@/lib/format";
import { cardClass, primaryButtonClass, secondaryButtonClass, smallButtonClass } from "../ui";
import { ErrorNotice, PageShell, Skeleton } from "./PageShell";

/**
 * The host's home: start a game quickly, manage saved quizzes, look back at past games.
 * Each section fetches its own data with TanStack Query, so they load independently.
 */
export function HostDashboard() {
  return (
    <PageShell
      actions={
        <Link href="/host/quizzes/new" className={primaryButtonClass}>
          + New quiz
        </Link>
      }
    >
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">Host a quiz</h1>
        <p className="text-lg text-chalk-dim">Pick a quiz, put this laptop on the TV, and let teams scan in.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <QuickQuizCard />
        <section className={`${cardClass} flex flex-col gap-4`}>
          <h2 className="font-display text-2xl font-bold">Sample quiz</h2>
          <p className="text-chalk-dim">
            <strong className="text-chalk">{sampleQuiz.title}</strong> · {plural(sampleQuiz.questions.length, "question")} of
            general knowledge, ready to go.
          </p>
          <Link href={`/host/live/${SAMPLE_QUIZ_ID}`} className={`${primaryButtonClass} mt-auto`}>
            Play the sample quiz
          </Link>
        </section>
      </div>

      <YourQuizzes />
      <PastGames />
    </PageShell>
  );
}

// ─── Quick quiz ─────────────────────────────────────────────────────────────

const COUNTS = [5, 10, 15, 20];

function QuickQuizCard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: queryKeys.bankCategories, queryFn: api.bankCategories });
  const [selected, setSelected] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty | "mixed">("mixed");
  const [count, setCount] = useState(10);

  const create = useMutation({
    mutationFn: async (then: "play" | "edit") => ({
      quiz: await api.quizFromBank({ categories: selected, difficulty, count }),
      then,
    }),
    onSuccess: ({ quiz, then }) => {
      queryClient.setQueryData(queryKeys.quiz(quiz.id), quiz);
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes });
      router.push(then === "play" ? `/host/live/${quiz.id}` : `/host/quizzes/${quiz.id}`);
    },
  });

  const total = categories.data?.reduce((sum, c) => sum + c.count, 0) ?? 0;
  const toggle = (category: string) =>
    setSelected((s) => (s.includes(category) ? s.filter((c) => c !== category) : [...s, category]));

  return (
    <section className={`${cardClass} flex flex-col gap-5`} aria-labelledby="quick-quiz-title">
      <div>
        <h2 id="quick-quiz-title" className="font-display text-2xl font-bold">
          Quick quiz
        </h2>
        <p className="text-chalk-dim">
          Random questions from the question bank{total ? ` (${total.toLocaleString("en-GB")} questions)` : ""}. Save it,
          tweak it, or play it straight away.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-chalk-dim">Categories</legend>
        {categories.isPending ? (
          <Skeleton className="h-10" />
        ) : categories.isError ? (
          <ErrorNotice message="Couldn't load the categories." onRetry={() => void categories.refetch()} />
        ) : (
          <div className="flex flex-wrap gap-2">
            <Chip pressed={selected.length === 0} onClick={() => setSelected([])}>
              All
            </Chip>
            {categories.data.map(({ category, count }) => (
              <Chip key={category} pressed={selected.includes(category)} onClick={() => toggle(category)}>
                {category} <span className="opacity-60">{count}</span>
              </Chip>
            ))}
          </div>
        )}
      </fieldset>

      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <Segmented
          label="Difficulty"
          value={difficulty}
          options={(["mixed", ...DIFFICULTIES] as const).map((d) => ({ value: d, label: d[0]!.toUpperCase() + d.slice(1) }))}
          onChange={setDifficulty}
        />
        <Segmented
          label="Questions"
          value={count}
          options={COUNTS.map((n) => ({ value: n, label: String(n) }))}
          onChange={setCount}
        />
      </div>

      {create.isError && <ErrorNotice message={create.error.message} />}
      <div className="mt-auto flex flex-wrap gap-3">
        <button type="button" className={primaryButtonClass} disabled={create.isPending} onClick={() => create.mutate("play")}>
          {create.isPending && create.variables === "play" ? "Making it…" : "Play now"}
        </button>
        <button type="button" className={secondaryButtonClass} disabled={create.isPending} onClick={() => create.mutate("edit")}>
          Edit first
        </button>
      </div>
    </section>
  );
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-full border-2 px-3.5 py-1.5 text-sm font-semibold transition ${
        pressed ? "border-brass bg-brass text-felt" : "border-felt-lighter hover:border-chalk-dim"
      }`}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      <span className="text-sm font-semibold uppercase tracking-[0.2em] text-chalk-dim">{label}</span>
      <div className="flex rounded-full bg-felt p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              option.value === value ? "bg-felt-lighter text-chalk" : "text-chalk-dim hover:text-chalk"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Saved quizzes ──────────────────────────────────────────────────────────

function YourQuizzes() {
  const quizzes = useQuery({ queryKey: queryKeys.quizzes, queryFn: api.listQuizzes });

  return (
    <section className="flex flex-col gap-4" aria-labelledby="your-quizzes-title">
      <h2 id="your-quizzes-title" className="font-display text-2xl font-bold">
        Your quizzes
      </h2>
      {quizzes.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : quizzes.isError ? (
        <ErrorNotice message={quizzes.error.message} onRetry={() => void quizzes.refetch()} />
      ) : quizzes.data.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-felt-lighter px-6 py-8 text-center text-chalk-dim">
          No quizzes yet.{" "}
          <Link href="/host/quizzes/new" className="font-semibold text-brass underline underline-offset-4">
            Write your own
          </Link>{" "}
          or make a quick quiz above.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {quizzes.data.map((quiz) => (
            <QuizRow key={quiz.id} quiz={quiz} />
          ))}
        </ul>
      )}
    </section>
  );
}

function QuizRow({ quiz }: { quiz: { id: string; title: string; questionCount: number; updatedAt: string } }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deleteQuiz(quiz.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.quiz(quiz.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes });
    },
  });

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-felt-light px-5 py-4">
      <div className="min-w-0">
        <Link href={`/host/quizzes/${quiz.id}`} className="block truncate text-lg font-semibold hover:text-brass">
          {quiz.title}
        </Link>
        <p className="text-sm text-chalk-dim">
          {plural(quiz.questionCount, "question")} · edited {timeAgo(quiz.updatedAt)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {confirming ? (
          <>
            <span className="text-sm text-chalk-dim">Delete for good?</span>
            <button
              type="button"
              className={`${smallButtonClass} bg-incorrect text-felt`}
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Yes, delete
            </button>
            <button type="button" className={`${smallButtonClass} text-chalk-dim`} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <Link href={`/host/live/${quiz.id}`} className={`${smallButtonClass} bg-brass text-felt`}>
              Play
            </Link>
            <Link href={`/host/quizzes/${quiz.id}`} className={`${smallButtonClass} border-2 border-felt-lighter`}>
              Edit
            </Link>
            <button
              type="button"
              className={`${smallButtonClass} text-chalk-dim hover:text-incorrect`}
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${quiz.title}`}
            >
              Delete
            </button>
          </>
        )}
      </div>
      {remove.isError && <p className="w-full text-sm font-semibold text-incorrect">{remove.error.message}</p>}
    </li>
  );
}

// ─── Past games ─────────────────────────────────────────────────────────────

function PastGames() {
  const games = useQuery({ queryKey: queryKeys.games, queryFn: api.listGames });

  return (
    <section className="flex flex-col gap-4" aria-labelledby="past-games-title">
      <h2 id="past-games-title" className="font-display text-2xl font-bold">
        Past games
      </h2>
      {games.isPending ? (
        <Skeleton className="h-16" />
      ) : games.isError ? (
        <ErrorNotice message={games.error.message} onRetry={() => void games.refetch()} />
      ) : games.data.length === 0 ? (
        <p className="text-chalk-dim">Games you host will appear here, with everyone&apos;s scores.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-felt-lighter overflow-hidden rounded-2xl bg-felt-light">
          {games.data.map((game) => (
            <li key={game.id}>
              <Link
                href={`/host/games/${game.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 transition hover:bg-felt-lighter"
              >
                <span className="font-semibold">{game.quizTitle}</span>
                <span className="text-sm text-chalk-dim">
                  {timeAgo(game.finishedAt)} · {plural(game.teamCount, "team")}
                  {game.winners.length > 0 && <> · 🏆 {game.winners.join(" & ")}</>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
