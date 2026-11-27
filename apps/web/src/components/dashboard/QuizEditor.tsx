"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_TIME_LIMIT,
  MAX_QUESTIONS,
  QUIZ_TITLE_MAX,
  quizInputSchema,
  type BankQuestion,
  type QuizDetail,
  type QuizInput,
} from "@pub-quiz/shared";
import { api, ApiError, queryKeys } from "@/lib/api";
import { plural } from "@/lib/format";
import { FieldError, primaryButtonClass, secondaryButtonClass, Splash } from "../ui";
import { BankPicker } from "./BankPicker";
import { ErrorNotice, PageShell, Skeleton } from "./PageShell";
import { blankQuestion, QuestionCard, type DraftQuestion } from "./QuestionCard";

interface Draft {
  title: string;
  questions: DraftQuestion[];
}

/** The quiz builder. With a quizId it loads and edits that quiz; without one it creates a new quiz. */
export function QuizEditor({ quizId }: { quizId?: string }) {
  const quiz = useQuery({
    queryKey: queryKeys.quiz(quizId ?? "new"),
    queryFn: () => api.getQuiz(quizId!),
    enabled: Boolean(quizId),
  });

  if (!quizId) return <QuizEditorForm quizId={null} initial={null} />;
  if (quiz.isPending) {
    return (
      <PageShell back={{ href: "/host", label: "Dashboard" }}>
        <Skeleton className="h-14 w-2/3" />
        <Skeleton className="h-64" />
      </PageShell>
    );
  }
  if (quiz.isError) {
    const notFound = quiz.error instanceof ApiError && quiz.error.status === 404;
    return (
      <Splash title={notFound ? "Quiz not found" : "Couldn't load the quiz"} detail={notFound ? undefined : quiz.error.message}>
        <Link href="/host" className="text-brass underline underline-offset-4">
          Back to dashboard
        </Link>
      </Splash>
    );
  }
  // `key` gives each quiz a fresh form, so switching quizzes never mixes up their drafts.
  return <QuizEditorForm key={quizId} quizId={quizId} initial={quiz.data} />;
}

function toDraft(quiz: QuizDetail | null): Draft {
  if (!quiz) return { title: "", questions: [blankQuestion()] };
  return { title: quiz.title, questions: quiz.questions.map((q) => ({ ...q, key: crypto.randomUUID() })) };
}

/** What gets sent to the server: the draft without React's list keys. */
function toInput(draft: Draft): QuizInput {
  return {
    title: draft.title,
    questions: draft.questions.map(({ text, options, correctIndex, timeLimitSec }) => ({ text, options, correctIndex, timeLimitSec })),
  };
}

function QuizEditorForm({ quizId, initial }: { quizId: string | null; initial: QuizDetail | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [savedVersion, setSavedVersion] = useState(() => JSON.stringify(toInput(toDraft(initial))));
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<Map<string, string>>(new Map());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const input = useMemo(() => toInput(draft), [draft]);
  const dirty = JSON.stringify(input) !== savedVersion;

  // Check the draft against the same rules the server uses, on every change.
  const validation = useMemo(() => quizInputSchema.safeParse(input), [input]);
  const errors = useMemo(() => {
    const map = new Map(serverErrors);
    if (!validation.success) for (const issue of validation.error.issues) map.set(issue.path.join("."), issue.message);
    return map;
  }, [validation, serverErrors]);
  const errorCount = validation.success ? 0 : validation.error.issues.length;

  const save = useMutation({
    mutationFn: (data: QuizInput) => (quizId ? api.updateQuiz(quizId, data) : api.createQuiz(data)),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.quiz(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes });
      setSavedVersion(JSON.stringify(toInput(toDraft(saved))));
      setServerErrors(new Map());
    },
    onError: (error) => {
      if (error instanceof ApiError && error.issues?.length) {
        setServerErrors(new Map(error.issues.map((i) => [i.path, i.message])));
      }
    },
  });

  async function saveQuiz(): Promise<string | null> {
    setShowErrors(true);
    if (!validation.success) return null;
    try {
      const saved = await save.mutateAsync(validation.data);
      return saved.id;
    } catch {
      return null;
    }
  }

  async function handleSave() {
    const id = await saveQuiz();
    if (!id) return;
    if (!quizId) router.replace(`/host/quizzes/${id}`);
    else setNotice("Saved");
  }

  async function handlePlay() {
    const id = dirty || !quizId ? await saveQuiz() : quizId;
    if (id) router.push(`/host/live/${id}`);
  }

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(id);
  }, [notice]);

  // ─── Editing helpers ─────────────────────────────────────────────────────
  const setQuestions = (update: (questions: DraftQuestion[]) => DraftQuestion[]) =>
    setDraft((d) => ({ ...d, questions: update(d.questions) }));

  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions((qs) => {
      const next = [...qs];
      const [moved] = next.splice(index, 1);
      next.splice(index + direction, 0, moved!);
      return next;
    });
  }

  function addFromBank(question: BankQuestion) {
    setQuestions((qs) => {
      // Replace the starting blank question rather than leaving it empty at the top.
      const onlyBlank = qs.length === 1 && !qs[0]!.text && qs[0]!.options.every((o) => !o);
      const added: DraftQuestion = {
        key: crypto.randomUUID(),
        text: question.text,
        options: [...question.options],
        correctIndex: question.correctIndex,
        timeLimitSec: DEFAULT_TIME_LIMIT,
      };
      return onlyBlank ? [added] : [...qs, added];
    });
  }

  const questionErrors = (index: number) => {
    const prefix = `questions.${index}.`;
    const map = new Map<string, string>();
    if (!showErrors) return map;
    for (const [path, message] of errors) if (path.startsWith(prefix)) map.set(path.slice(prefix.length), message);
    return map;
  };
  const atLimit = draft.questions.length >= MAX_QUESTIONS;

  return (
    <PageShell
      back={{ href: "/host", label: "Dashboard" }}
      actions={
        <>
          <span className="text-sm text-chalk-dim" aria-live="polite">
            {save.isPending ? "Saving…" : notice ?? (dirty ? "Unsaved changes" : quizId ? "All changes saved" : "")}
          </span>
          <button type="button" className={secondaryButtonClass} onClick={handleSave} disabled={save.isPending || (!dirty && Boolean(quizId))}>
            Save
          </button>
          <button type="button" className={primaryButtonClass} onClick={handlePlay} disabled={save.isPending}>
            Save &amp; play ▶
          </button>
        </>
      }
    >
      <div>
        <p aria-hidden className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-chalk-dim">
          {quizId ? "Edit quiz" : "New quiz"}
        </p>
        <label htmlFor="quiz-title" className="sr-only">
          Quiz title
        </label>
        <input
          id="quiz-title"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          maxLength={QUIZ_TITLE_MAX}
          placeholder="Quiz title, e.g. Christmas Quiz 2026"
          className="w-full border-b-2 border-felt-lighter bg-transparent pb-2 font-display text-3xl font-bold text-chalk placeholder:text-chalk-dim/40 focus:border-brass focus:outline-none sm:text-4xl"
          aria-invalid={showErrors && errors.has("title")}
        />
        {showErrors && <FieldError message={errors.get("title")} />}
      </div>

      {showErrors && errorCount > 0 && (
        <ErrorNotice message={`Fix ${plural(errorCount, "problem")} before saving. They're marked in red below.`} />
      )}
      {save.isError && !(save.error instanceof ApiError && save.error.issues?.length) && (
        <ErrorNotice message={save.error.message} />
      )}

      <ol className="flex flex-col gap-4">
        {draft.questions.map((question, i) => (
          <QuestionCard
            key={question.key}
            index={i}
            total={draft.questions.length}
            question={question}
            errors={questionErrors(i)}
            onChange={(q) => setQuestions((qs) => qs.map((existing) => (existing.key === q.key ? q : existing)))}
            onMove={(direction) => moveQuestion(i, direction)}
            onRemove={() => setQuestions((qs) => qs.filter((q) => q.key !== question.key))}
          />
        ))}
      </ol>
      {showErrors && <FieldError message={errors.get("questions")} />}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={atLimit}
          onClick={() => setQuestions((qs) => [...qs, blankQuestion()])}
        >
          + Add a question
        </button>
        <button type="button" className={secondaryButtonClass} disabled={atLimit} onClick={() => setPickerOpen(true)}>
          📚 Add from the question bank
        </button>
        <span className="self-center text-sm text-chalk-dim">
          {plural(draft.questions.length, "question")}
          {atLimit && ` (the maximum)`}
        </span>
      </div>

      <BankPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAdd={addFromBank}
        alreadyAdded={new Set(draft.questions.map((q) => q.text))}
        full={atLimit}
      />
    </PageShell>
  );
}
