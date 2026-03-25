import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { classifyGarment } from "./classify-garment";

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/classify-garment", classifyGarment);

  const httpServer = createServer(app);

  return httpServer;
}
