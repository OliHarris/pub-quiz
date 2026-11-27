"use client";

import { DEFAULT_TIME_LIMIT, OPTION_TEXT_MAX, QUESTION_TEXT_MAX, TIME_LIMIT_OPTIONS, type Question } from "@pub-quiz/shared";
import { FieldError, inputClass, OPTION_LETTERS, smallButtonClass } from "../ui";

/** A question while it's being edited. `key` is only for React's list rendering; it's never saved. */
export interface DraftQuestion extends Question {
  key: string;
}

export function blankQuestion(): DraftQuestion {
  return { key: crypto.randomUUID(), text: "", options: ["", "", "", ""], correctIndex: -1, timeLimitSec: DEFAULT_TIME_LIMIT };
}

const OPTION_RINGS = ["border-opt-a", "border-opt-b", "border-opt-c", "border-opt-d"];

interface QuestionCardProps {
  index: number;
  total: number;
  question: DraftQuestion;
  /** Validation messages keyed by path within this question, e.g. "text" or "options.2". */
  errors: Map<string, string>;
  onChange: (question: DraftQuestion) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

export function QuestionCard({ index, total, question, errors, onChange, onMove, onRemove }: QuestionCardProps) {
  const id = `q-${question.key}`;
  const update = (patch: Partial<DraftQuestion>) => onChange({ ...question, ...patch });

  function setOption(i: number, value: string) {
    update({ options: question.options.map((o, j) => (j === i ? value : o)) });
  }

  function removeOption(i: number) {
    const options = question.options.filter((_, j) => j !== i);
    // Keep the "correct" mark on the same answer after the ones above it shift up.
    const correctIndex =
      question.correctIndex === i ? -1 : question.correctIndex > i ? question.correctIndex - 1 : question.correctIndex;
    update({ options, correctIndex });
  }

  return (
    <li className="rounded-[1.5rem] bg-felt-light p-5 sm:p-6" aria-labelledby={`${id}-label`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 id={`${id}-label`} className="font-display text-lg font-bold text-brass">
          Question {index + 1}
        </h3>
        <div className="flex items-center gap-1">
          <IconButton label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
            ↑
          </IconButton>
          <IconButton label="Move down" disabled={index === total - 1} onClick={() => onMove(1)}>
            ↓
          </IconButton>
          <IconButton label={`Delete question ${index + 1}`} disabled={total === 1} onClick={onRemove}>
            ✕
          </IconButton>
        </div>
      </div>

      <label htmlFor={`${id}-text`} className="sr-only">
        Question {index + 1} text
      </label>
      <textarea
        id={`${id}-text`}
        value={question.text}
        onChange={(e) => update({ text: e.target.value })}
        maxLength={QUESTION_TEXT_MAX}
        rows={2}
        placeholder="Type your question…"
        className={`${inputClass} resize-none text-lg font-semibold`}
        aria-invalid={errors.has("text")}
        aria-describedby={errors.has("text") ? `${id}-text-error` : undefined}
      />
      <FieldError id={`${id}-text-error`} message={errors.get("text")} />

      <fieldset className="mt-4">
        <legend className="mb-2 text-sm text-chalk-dim">Answers: tick the correct one</legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {question.options.map((option, i) => (
            <div key={i}>
              <div className={`flex items-center gap-2 rounded-xl border-l-[6px] bg-felt pr-2 ${OPTION_RINGS[i]}`}>
                <label className="flex cursor-pointer items-center gap-2 py-2.5 pl-3" title="Mark as the correct answer">
                  <input
                    type="radio"
                    name={`${id}-correct`}
                    checked={question.correctIndex === i}
                    onChange={() => update({ correctIndex: i })}
                    className="size-5 accent-correct"
                  />
                  <span className="sr-only">Answer {OPTION_LETTERS[i]} is correct</span>
                  <span aria-hidden className="w-4 font-display font-bold text-chalk-dim">
                    {OPTION_LETTERS[i]}
                  </span>
                </label>
                <input
                  value={option}
                  onChange={(e) => setOption(i, e.target.value)}
                  maxLength={OPTION_TEXT_MAX}
                  placeholder={`Answer ${OPTION_LETTERS[i]}`}
                  aria-label={`Question ${index + 1}, answer ${OPTION_LETTERS[i]}`}
                  aria-invalid={errors.has(`options.${i}`)}
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-chalk placeholder:text-chalk-dim/50 focus:outline-none"
                />
                {question.options.length > 2 && (
                  <IconButton label={`Remove answer ${OPTION_LETTERS[i]}`} onClick={() => removeOption(i)}>
                    ✕
                  </IconButton>
                )}
              </div>
              <FieldError message={errors.get(`options.${i}`)} />
            </div>
          ))}
        </div>
        <FieldError message={errors.get("options") ?? errors.get("correctIndex")} />
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {question.options.length < 4 ? (
          <button
            type="button"
            className={`${smallButtonClass} border-2 border-felt-lighter`}
            onClick={() => update({ options: [...question.options, ""] })}
          >
            + Add an answer
          </button>
        ) : (
          <span />
        )}
        <label className="flex items-center gap-2 text-sm text-chalk-dim">
          Time limit
          <select
            value={question.timeLimitSec}
            onChange={(e) => update({ timeLimitSec: Number(e.target.value) })}
            className="rounded-lg border-2 border-felt-lighter bg-felt px-2 py-1.5 text-chalk focus:border-brass focus:outline-none"
          >
            {TIME_LIMIT_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s} seconds
              </option>
            ))}
          </select>
        </label>
      </div>
    </li>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-full text-chalk-dim transition hover:bg-felt-lighter hover:text-chalk disabled:pointer-events-none disabled:opacity-25"
    >
      {children}
    </button>
  );
}
