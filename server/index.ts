import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { initLockoutStore, initRateLimitStore } from "./middleware/rateLimiter";
import { initBgRemovalStore } from "./bgRemovalStore";
import { buildOAuthRelayUrl } from "../lib/oauth-callback";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { reportError } from "../shared/observability";

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

/**
 * Security headers applied to every response.
 *
 * X-Content-Type-Options  — blocks MIME-sniffing attacks
 * X-Frame-Options         — blocks clickjacking via iframes
 * X-XSS-Protection        — legacy browser XSS filter (belt + suspenders)
 * Referrer-Policy         — limits referrer info sent to third parties
 * Permissions-Policy      — locks down sensitive browser APIs this server
 *                           never intentionally uses
 *
 * A strict Content-Security-Policy is applied only to /api routes (pure JSON
 * endpoints) so it doesn't interfere with the HTML landing page.
 */
function setupSecurityHeaders(app: express.Application) {
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=(), payment=()",
    );
    next();
  });

  // JSON-only endpoints: forbid all resource loads, iframes, and inline scripts.
  app.use("/api", (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    next();
  });
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    // Allow localhost origins for Expo web development (any port).
    // Restricted to non-production environments only.
    const isDevelopment = process.env.NODE_ENV !== "production";
    const isLocalhost =
      isDevelopment &&
      (origin?.startsWith("http://localhost:") ||
        origin?.startsWith("http://127.0.0.1:"));

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    const callerRequestId = req.header("x-request-id");
    const requestId = callerRequestId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(callerRequestId)
      ? callerRequestId
      : randomUUID();
    res.setHeader("x-request-id", requestId);
    res.locals.requestId = requestId;

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;
      log(JSON.stringify({
        type: "request",
        requestId,
        method: req.method,
        route: path,
        status: res.statusCode,
        durationMs: duration,
      }));
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    if (req.path === "/") {
      // Expo Go OAuth relay ─────────────────────────────────────────────────
      // signInWithGoogle (native, Expo Go) passes:
      //   redirectTo = "https://<domain>?nativeCallback=exp://<devserver>"
      // Supabase validates the base domain (query-params stripped from the
      // allow-list check) then redirects here with code= appended.
      //
      // Serve a minimal HTML page that sets window.location to the exp:// URL
      // so ASWebAuthenticationSession (callbackURLScheme = 'exp') can intercept
      // it and resolve openAuthSessionAsync in the native app — no Supabase
      // allow-list changes required.
      const nativeCallback = req.query.nativeCallback
        ? String(req.query.nativeCallback)
        : null;
      const oauthCode = req.query.code ? String(req.query.code) : null;

      if (nativeCallback && oauthCode) {
        // Security: only relay to registered app schemes. The shared validator
        // parses the URL and permits only amodka://, exp://localhost[:port],
        // exp://127.0.0.1[:port], or the exact Replit dev host. It deliberately
        // avoids prefix/sub-string matching so a lookalike host cannot receive
        // an authorization code.
        const allowedExpHost = process.env.REPLIT_DEV_DOMAIN ?? null;
        const oauthType = req.query.type ? String(req.query.type) : null;
        const targetUrl = buildOAuthRelayUrl(
          nativeCallback,
          oauthCode,
          oauthType,
          allowedExpHost ?? undefined,
        );

        if (targetUrl) {
          // Use an HTTP 302 redirect rather than a JS window.location.href.
          //
          // Android Chrome Custom Tabs block JavaScript-initiated navigations
          // to custom URI schemes (exp://, amodka://) as a security
          // measure. An HTTP 302 is treated as a genuine navigation event:
          // Chrome follows the redirect, detects the custom scheme, and
          // dispatches it as an Android intent — which opens Expo Go and
          // closes the Custom Tab.
          //
          // On iOS, ASWebAuthenticationSession monitors HTTP-level redirects
          // and intercepts any Location header matching callbackURLScheme
          // ('exp' or 'amodka'), so 302 works identically to the JS
          // approach there.
          return res.redirect(302, targetUrl);
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const requestId = res.locals.requestId as string | undefined;
    reportError(err, "http_request", {
      route: req.path,
      status,
      requestId,
      dependency: "server",
    });

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({
      error: status >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED",
      requestId,
    });
  });
}

(async () => {
  app.set("trust proxy", 1);
  setupSecurityHeaders(app);
  setupCors(app);
  setupRequestLogging(app);
  setupBodyParsing(app);

  // Register API routes BEFORE static-file / landing-page middleware so that
  // no express.static handler can ever shadow an API path. The landing-page
  // middleware already guards /api routes with an explicit next() call, but
  // registering API routes first is the canonical Express safety pattern.
  await initLockoutStore();
  await initRateLimitStore();
  await initBgRemovalStore();

  const server = await registerRoutes(app);

  // Static-file and landing-page serving comes after API routes so it only
  // handles requests that no API route matched.
  configureExpoAndLanding(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
    },
  );
})();
