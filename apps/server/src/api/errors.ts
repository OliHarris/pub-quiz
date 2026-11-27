import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@pub-quiz/shared';

/** Throw one of these from a route to send a specific status code and message. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' } satisfies ApiErrorBody);
};

/**
 * Every error ends up here, so every error response has the same shape
 * ({ error, issues? }) and nothing internal (stack traces, SQL) ever leaks out.
 *
 * Express 5 passes errors from async route handlers here automatically. In
 * Express 4 you had to wrap every handler in try/catch.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const body: ApiErrorBody = {
      error: err.issues[0]?.message ?? 'Invalid request',
      issues: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    };
    res.status(400).json(body);
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message } satisfies ApiErrorBody);
    return;
  }
  // Errors from express.json(), e.g. a body that isn't valid JSON, or is far too big.
  if (typeof err === 'object' && err && 'type' in err) {
    if (err.type === 'entity.parse.failed') return void res.status(400).json({ error: 'Invalid JSON' });
    if (err.type === 'entity.too.large') return void res.status(413).json({ error: 'Request is too large' });
  }
  console.error('Unexpected API error', err);
  res.status(500).json({ error: 'Something went wrong on our side' } satisfies ApiErrorBody);
};
