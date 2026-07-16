import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

/** App-level error with an HTTP status. Throw this from routes/services. */
export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'validation_error', details: err.flatten() });
  }
  console.error('Unhandled error:', err);
  // Temporary: surface the real message to aid diagnosis of setup issues.
  return res
    .status(500)
    .json({ error: 'internal_server_error', message: err instanceof Error ? err.message : String(err) });
}

/** Wrap async route handlers so thrown errors reach errorHandler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
