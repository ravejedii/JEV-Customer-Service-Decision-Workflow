import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { SAMPLE_MESSAGES } from "./config.js";
import { AppError } from "./errors.js";
import { runWorkflow } from "./workflow/run.js";

export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/samples", (_req, res) => {
    res.json(SAMPLE_MESSAGES);
  });

  app.post("/api/triage", async (req, res) => {
    try {
      const message =
        typeof req.body?.message === "string" ? req.body.message : "";
      const result = await runWorkflow(message);
      res.json(result);
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      const message =
        error instanceof Error ? error.message : "Unexpected triage failure";
      const status = message.startsWith("NVIDIA chat") ? 502 : 500;
      res.status(status).json({ error: message });
    }
  });

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const parseError = error instanceof SyntaxError && "body" in error;
    if (parseError) {
      res.status(400).json({ error: "Request body must be JSON." });
      return;
    }
    next(error);
  });

  return app;
}
