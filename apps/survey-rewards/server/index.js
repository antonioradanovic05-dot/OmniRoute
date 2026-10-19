/**
 * PointPilot server — zero-dependency HTTP API + static host.
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildState,
  claimDailyBonus,
  completeSurvey,
  ensureUser,
  getMeta,
  getSurvey,
  redeemReward,
  resetUser,
  saveProgress,
  startSurvey,
  updateProfile,
} from "./store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "..", "public");
const PORT = Number(process.env.PORT) || 4317;
const HOST = process.env.HOST || "0.0.0.0";
const MAX_BODY = 256 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return resolve({});
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error("Invalid JSON body"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function clientIdFrom(req, url) {
  const header = req.headers["x-client-id"];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  return typeof fromHeader === "string" && fromHeader.trim()
    ? fromHeader.trim()
    : url.searchParams.get("clientId") || undefined;
}

async function handleApi(req, res, url, segments) {
  const method = req.method || "GET";
  const clientId = clientIdFrom(req, url);
  const [, , ...rest] = segments; // ["", "api", ...]

  if (method === "GET" && rest[0] === "health") {
    return sendJson(res, 200, { ok: true, uptime: process.uptime() });
  }

  if (method === "GET" && rest[0] === "meta") {
    return sendJson(res, 200, { ok: true, ...getMeta() });
  }

  if (method === "GET" && rest[0] === "bootstrap") {
    const user = ensureUser(clientId);
    return sendJson(res, 200, { ok: true, state: buildState(user) });
  }

  if (rest[0] === "surveys" && rest[1]) {
    const surveyId = decodeURIComponent(rest[1]);
    if (method === "GET" && rest.length === 2) {
      const survey = getSurvey(clientId, surveyId);
      if (!survey) return sendJson(res, 404, { error: "Survey not found" });
      return sendJson(res, 200, { ok: true, survey });
    }
    if (method === "POST" && rest[2] === "start") {
      const result = startSurvey(clientId, surveyId);
      if (result.error) return sendJson(res, result.status || 400, { error: result.error });
      return sendJson(res, 200, result);
    }
    if (method === "POST" && rest[2] === "progress") {
      const body = await readBody(req);
      const result = saveProgress(clientId, surveyId, body.answers, body.currentQuestion);
      if (result.error) return sendJson(res, result.status || 400, { error: result.error });
      return sendJson(res, 200, result);
    }
    if (method === "POST" && rest[2] === "complete") {
      const body = await readBody(req);
      const result = completeSurvey(clientId, surveyId, body.answers, Number(body.durationSeconds));
      if (result.error) {
        return sendJson(res, result.status || 400, {
          error: result.error,
          missing: result.missing,
        });
      }
      return sendJson(res, 200, result);
    }
  }

  if (method === "POST" && rest[0] === "daily-bonus") {
    const result = claimDailyBonus(clientId);
    if (result.error) return sendJson(res, result.status || 400, { error: result.error });
    return sendJson(res, 200, result);
  }

  if (method === "POST" && rest[0] === "rewards" && rest[1] && rest[2] === "redeem") {
    const result = redeemReward(clientId, decodeURIComponent(rest[1]));
    if (result.error) {
      return sendJson(res, result.status || 400, {
        error: result.error,
        shortfall: result.shortfall,
      });
    }
    return sendJson(res, 200, result);
  }

  if (method === "POST" && rest[0] === "profile") {
    const body = await readBody(req);
    const result = updateProfile(clientId, body);
    return sendJson(res, 200, result);
  }

  if (method === "POST" && rest[0] === "reset") {
    const result = resetUser(clientId);
    return sendJson(res, 200, result);
  }

  return sendJson(res, 404, { error: "Not found" });
}

function serveStatic(req, res, url) {
  const method = req.method || "GET";
  if (method !== "GET" && method !== "HEAD") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const target = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!target.startsWith(PUBLIC_DIR + path.sep)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }
  fs.stat(target, (err, stat) => {
    // Client-side hash routes all load index.html; anything else 404s.
    if (err || !stat.isFile()) {
      if (!path.extname(pathname)) return serveStatic(req, res, new URL("/", "http://local"));
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      "content-length": stat.size,
      "cache-control": ext === ".html" ? "no-cache" : "public, max-age=60",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
    });
    if (method === "HEAD") return res.end();
    const stream = fs.createReadStream(target);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url, url.pathname.split("/"));
    }
    return serveStatic(req, res, url);
  } catch (error) {
    const status = error?.status || 500;
    if (status >= 500) console.error("[pointpilot]", error);
    if (!res.headersSent) sendJson(res, status, { error: error?.message || "Server error" });
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`PointPilot running at http://localhost:${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
