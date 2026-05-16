import type { NextFunction, Request, Response } from "express";

export function errorHandlerMiddleware(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  const message =
    error instanceof Error ? error.message : "Internal server error";
  response.status(500).json({ message });
}
