import type { Request, Response, NextFunction } from "express";

export function rateLimitMiddleware(
  _request: Request,
  _response: Response,
  next: NextFunction,
): void {
  next();
}
