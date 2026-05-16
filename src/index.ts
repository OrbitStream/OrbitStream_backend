import "dotenv/config";
import express, { type Express } from "express";
import { apiRouter } from "./api/routes";

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "orbitstream-backend" });
  });

  app.use("/api/v1", apiRouter);

  return app;
}

export async function startServer(): Promise<void> {
  const app = createApp();
  const port = Number(process.env.PORT ?? 3001);

  app.listen(port, () => {
    console.log(`OrbitStream API running on port ${port}`);
  });
}
