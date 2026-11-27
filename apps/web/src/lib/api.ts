import type {
  ApiErrorBody,
  BankCategory,
  BankQuery,
  BankSearchResult,
  FromBankInput,
  GameDetail,
  GameSummary,
  QuizDetail,
  QuizInput,
  QuizSummary,
} from "@pub-quiz/shared";
import { gameServerUrl } from "./config";
import { readJson, removeItem, writeJson } from "./storage";

/**
 * Talking to the REST API. Every call goes through `apiFetch`, which adds the
 * host key and turns error responses into a typed `ApiError`, so components
 * never handle raw `fetch` responses.
 */

const HOST_KEY_STORAGE = "pubquiz:hostKey";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: ApiErrorBody["issues"] = [],
  ) {
    super(message);
  }
}

let pendingHostKey: Promise<string> | null = null;

/**
 * This browser's host key. The first time it's needed, we ask the server for
 * one and keep it in localStorage. If several requests ask at once, they share
 * one request (we cache the promise) instead of creating several hosts.
 */
export function getHostKey(): Promise<string> {
  const saved = readJson<string>(HOST_KEY_STORAGE);
  if (saved) return Promise.resolve(saved);
  pendingHostKey ??= fetch(`${gameServerUrl()}/api/hosts`, { method: "POST" })
    .then(async (res) => {
      const body = await res.json();
      if (!res.ok) throw new ApiError(res.status, body.error ?? "Couldn't set up hosting");
      writeJson(HOST_KEY_STORAGE, body.hostKey);
      return body.hostKey as string;
    })
    .finally(() => {
      pendingHostKey = null;
    });
  return pendingHostKey;
}

async function apiFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const hostKey = await getHostKey();
  let res: Response;
  try {
    res = await fetch(`${gameServerUrl()}/api${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${hostKey}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Is it running?");
  }

  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // The server doesn't recognise our key (say, the database was reset), so forget it. A new one is made next time.
    if (res.status === 401) removeItem(HOST_KEY_STORAGE);
    const error = body as Partial<ApiErrorBody>;
    throw new ApiError(res.status, error.error ?? "Something went wrong", error.issues);
  }
  return body as T;
}

function queryString(params: object): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : "";
}

export const api = {
  listQuizzes: () => apiFetch<{ quizzes: QuizSummary[] }>("/quizzes").then((r) => r.quizzes),
  getQuiz: (id: string) => apiFetch<QuizDetail>(`/quizzes/${id}`),
  createQuiz: (input: QuizInput) => apiFetch<QuizDetail>("/quizzes", { method: "POST", body: input }),
  updateQuiz: (id: string, input: QuizInput) => apiFetch<QuizDetail>(`/quizzes/${id}`, { method: "PUT", body: input }),
  deleteQuiz: (id: string) => apiFetch<void>(`/quizzes/${id}`, { method: "DELETE" }),
  quizFromBank: (input: FromBankInput) => apiFetch<QuizDetail>("/quizzes/from-bank", { method: "POST", body: input }),
  bankCategories: () => apiFetch<{ categories: BankCategory[] }>("/bank/categories").then((r) => r.categories),
  searchBank: (query: BankQuery) => apiFetch<BankSearchResult>(`/bank/questions${queryString(query)}`),
  listGames: () => apiFetch<{ games: GameSummary[] }>("/games").then((r) => r.games),
  getGame: (id: string) => apiFetch<GameDetail>(`/games/${id}`),
};

/**
 * TanStack Query caches data under "keys". Keeping them in one place means a
 * save in the editor can refresh the dashboard's list by its key.
 */
export const queryKeys = {
  quizzes: ["quizzes"] as const,
  quiz: (id: string) => ["quizzes", id] as const,
  bankCategories: ["bank", "categories"] as const,
  bankSearch: (query: BankQuery) => ["bank", "search", query] as const,
  games: ["games"] as const,
  game: (id: string) => ["games", id] as const,
};
