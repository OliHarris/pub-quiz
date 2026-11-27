"use client";

import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DIFFICULTIES, type BankQuestion, type Difficulty } from "@pub-quiz/shared";
import { api, queryKeys } from "@/lib/api";
import { inputClass, OPTION_LETTERS, smallButtonClass } from "../ui";
import { ErrorNotice } from "./PageShell";

const PAGE_SIZE = 20;

/**
 * A pop-up for browsing the question bank and adding questions to a quiz.
 * It uses the browser's own <dialog> element, which handles focus, the Escape
 * key and the dimmed backdrop for us, accessibly.
 */
export function BankPicker({
  open,
  onClose,
  onAdd,
  alreadyAdded,
  full,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (question: BankQuestion) => void;
  alreadyAdded: Set<string>;
  full: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput.trim(), 300);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      searchRef.current?.focus(); // ready to type straight away
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const categories = useQuery({ queryKey: queryKeys.bankCategories, queryFn: api.bankCategories, enabled: open });
  const filters = { category: category || undefined, difficulty: difficulty || undefined, search: search || undefined, limit };
  const results = useQuery({
    queryKey: queryKeys.bankSearch(filters),
    queryFn: () => api.searchBank(filters),
    enabled: open,
    // Keep showing the old results while new ones load, instead of flashing empty.
    placeholderData: keepPreviousData,
  });

  // New filters start from the first page again.
  const filterKey = `${category}|${difficulty}|${search}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setLimit(PAGE_SIZE);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="bank-title"
      className="m-auto max-h-[88dvh] w-[min(52rem,calc(100%-1.5rem))] overflow-hidden rounded-[1.75rem] bg-felt-light p-0 text-chalk shadow-2xl backdrop:bg-black/70"
    >
      <div className="flex max-h-[88dvh] flex-col">
        <div className="flex flex-col gap-4 border-b border-felt-lighter p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 id="bank-title" className="font-display text-2xl font-bold">
              Question bank
            </h2>
            <button type="button" onClick={onClose} className={`${smallButtonClass} border-2 border-felt-lighter`}>
              Done
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
            <input
              ref={searchRef}
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search questions…"
              aria-label="Search questions"
              className={inputClass}
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className={inputClass}>
              <option value="">All categories</option>
              {categories.data?.map((c) => (
                <option key={c.category} value={c.category}>
                  {c.category} ({c.count})
                </option>
              ))}
            </select>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty | "")}
              aria-label="Difficulty"
              className={inputClass}
            >
              <option value="">Any difficulty</option>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d[0]!.toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          </div>
          {full && <p className="text-sm font-semibold text-opt-c">Your quiz is full. Remove a question to add more.</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6" aria-busy={results.isFetching}>
          {results.isError ? (
            <ErrorNotice message={results.error.message} onRetry={() => void results.refetch()} />
          ) : results.isPending ? (
            <p className="text-chalk-dim">Loading questions…</p>
          ) : results.data.questions.length === 0 ? (
            <p className="text-chalk-dim">No questions match. Try a different search.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-chalk-dim">
                Showing {results.data.questions.length} of {results.data.total}
              </p>
              <ul className="flex flex-col gap-3">
                {results.data.questions.map((question) => {
                  const added = alreadyAdded.has(question.text);
                  return (
                    <li key={question.id} className="flex items-start justify-between gap-4 rounded-2xl bg-felt p-4">
                      <div className="min-w-0">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.15em] text-chalk-dim">
                          {question.category} · {question.difficulty}
                        </p>
                        <p className="font-semibold">{question.text}</p>
                        <p className="mt-1.5 text-sm text-chalk-dim">
                          {question.options.map((option, i) => (
                            <span key={i} className={`mr-3 ${i === question.correctIndex ? "font-semibold text-correct" : ""}`}>
                              {OPTION_LETTERS[i]}: {option}
                              {i === question.correctIndex && " ✓"}
                            </span>
                          ))}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={added || full}
                        onClick={() => onAdd(question)}
                        className={`${smallButtonClass} shrink-0 ${added ? "text-correct" : "bg-brass text-felt"}`}
                        aria-label={added ? `Added: ${question.text}` : `Add: ${question.text}`}
                      >
                        {added ? "Added ✓" : "Add"}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {results.data.questions.length < results.data.total && (
                <button
                  type="button"
                  onClick={() => setLimit((l) => l + PAGE_SIZE)}
                  disabled={results.isFetching}
                  className={`${smallButtonClass} mx-auto mt-4 flex border-2 border-felt-lighter`}
                >
                  {results.isFetching ? "Loading…" : "Show more"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

/** The value, but only after it has stopped changing for `ms`, so we don't search on every keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
