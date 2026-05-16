import type { Request, Response, NextFunction } from "express";

export function authMiddleware(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.locals.user = null;
  next();
}
