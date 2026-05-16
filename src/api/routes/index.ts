import { Router } from "express";
import { authRouter } from "./auth";
import { employeesRouter } from "./employees";
import { employersRouter } from "./employers";
import { streamsRouter } from "./streams";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/employers", employersRouter);
apiRouter.use("/employees", employeesRouter);
apiRouter.use("/streams", streamsRouter);

apiRouter.get("/health", (_request, response) => {
  response.json({ status: "ok", scope: "api" });
});
