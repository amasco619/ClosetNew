import type { RequestHandler } from "express";

export const noApiCache: RequestHandler = (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  // Express' default ETag handling can turn a JSON API response into a bodyless
  // 304. Native fetch clients expect the JSON body, so never revalidate /api.
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  next();
};
