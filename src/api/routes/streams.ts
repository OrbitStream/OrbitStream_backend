import { Router } from "express";

export const streamsRouter = Router();

streamsRouter.get("/", (_request, response) => {
  response.json({ message: "streams route placeholder" });
});
