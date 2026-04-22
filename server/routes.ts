import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { classifyGarment } from "./classify-garment";
import { extractColor } from "./extract-color";

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/classify-garment", classifyGarment);
  app.post("/api/extract-color", extractColor);

  const httpServer = createServer(app);

  return httpServer;
}
