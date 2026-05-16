import { Router } from "express";

export const employeesRouter = Router();

employeesRouter.get("/", (_request, response) => {
  response.json({ message: "employees route placeholder" });
});
