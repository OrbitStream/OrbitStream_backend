import { Router } from "express";

export const employersRouter = Router();

employersRouter.get("/", (_request, response) => {
  response.json({ message: "employers route placeholder" });
});
