import { Router } from "express";

export const authRouter = Router();

authRouter.get("/challenge", (_request, response) => {
  response.json({ message: "challenge route placeholder" });
});

authRouter.post("/verify", (_request, response) => {
  response.json({ message: "verify route placeholder" });
});
