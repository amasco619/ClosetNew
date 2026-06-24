import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { classifyGarment } from "./classify-garment";
import { extractColor } from "./extract-color";
import { supabaseAdmin } from "./supabase";
import { aiLimiter, colorLimiter, accountLimiter, authLimiter, resetLimiter } from "./middleware/rateLimiter";

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/classify-garment", aiLimiter, classifyGarment);
  app.post("/api/extract-color", colorLimiter, extractColor);

  app.post("/api/auth/sign-in", authLimiter, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required." });
    }
    try {
      const { data, error } = await supabaseAdmin.auth.signInWithPassword({
        email: String(email).trim().toLowerCase(),
        password: String(password),
      });
      if (error) {
        return res.status(401).json({ error: error.message });
      }
      return res.json({ session: data.session });
    } catch (err: any) {
      console.error("[auth/sign-in]", err.message);
      return res.status(500).json({ error: "sign_in_failed" });
    }
  });

  app.post("/api/auth/reset-password", resetLimiter, async (req, res) => {
    const { email, redirectTo } = req.body;
    if (!email) {
      return res.status(400).json({ error: "email is required." });
    }
    try {
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(
        String(email).trim().toLowerCase(),
        { redirectTo: String(redirectTo || "") }
      );
      if (error) {
        return res.status(400).json({ error: error.message });
      }
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[auth/reset-password]", err.message);
      return res.status(500).json({ error: "reset_failed" });
    }
  });

  app.post("/api/user/upgrade-premium", accountLimiter, async (req, res) => {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: "userId is required." });
    }
    try {
      const { error } = await supabaseAdmin
        .from("user_profiles")
        .update({
          premium: true,
          premium_expires_at: new Date(
            Date.now() + 365 * 24 * 60 * 60 * 1000
          ).toISOString(),
        })
        .eq("id", userId);
      if (error) throw new Error(error.message);
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[upgrade-premium]", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete("/api/user/delete-account", accountLimiter, async (req, res) => {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: "userId is required." });
    }
    try {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[delete-account]", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
