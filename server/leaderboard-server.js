// 8-Bit Satoshi leaderboard backend.
//
// Why a backend at all: the game is a static browser app, and browser-only storage
// (localStorage) is per-device — it cannot back a *shared* public ranking. This is
// the smallest thing that can: a dependency-free Node HTTP service (Node built-ins
// only, matching the project's zero-dependency ethos) that persists entries to a
// JSON file. It implements the contract in docs/leaderboard-contract.md via the
// shared rules module (js/leaderboard-rules.js), the same module the browser loads,
// so validation and ranking can never drift between the two.
//
// Run it:   npm run server      (or: node server/leaderboard-server.js)
// Config:   PORT (default 5050), LEADERBOARD_DATA (default server/data/leaderboard.json)
//
// Endpoints:
//   GET  /api/health                                  liveness probe
//   GET  /api/leaderboard?levelId&category&gameVersion&rulesVersion[&limit]
//                                                     ranked rows for one board
//   POST /api/leaderboard                             submit a run (full submission body)
//
// See docs/leaderboard-backend.md for setup and deployment, including how to put a
// managed datastore behind the same two endpoints if you outgrow the JSON file.

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const rules = require("../js/leaderboard-rules.js");

const PORT = Number(process.env.PORT) || 5050;
const DATA_FILE = process.env.LEADERBOARD_DATA
  ? path.resolve(process.env.LEADERBOARD_DATA)
  : path.join(__dirname, "data", "leaderboard.json");

// Cap on accepted request bodies. A submission is a few KB at most; anything past
// this is abuse or a bug, so we reject early instead of buffering it.
const MAX_BODY_BYTES = 64 * 1024;

// Default page size when a reader does not pass ?limit. The board UI only shows a
// top slice; callers can ask for more explicitly.
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

// ---------------------------------------------------------------------------
// Storage. The whole board fits comfortably in memory for this game's scale, so
// we load once at boot and persist the full array after each accepted write.
// Writes go through a temp-file + rename so a crash mid-write can never leave a
// half-written (corrupt) JSON file on disk.
// ---------------------------------------------------------------------------

let entries = loadEntries();

function loadEntries() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    // A present-but-malformed store must fail loud, not be silently treated as
    // empty: starting empty would let the next accepted POST overwrite (and
    // destroy) the existing file. Only a genuinely-absent file starts empty.
    throw new Error("data file " + DATA_FILE + " does not contain a JSON array");
  } catch (err) {
    if (err.code === "ENOENT") return []; // first run, no file yet — expected
    // A corrupt/unreadable store should fail loud, not silently discard history.
    console.error("[leaderboard] failed to read data file:", err.message);
    throw err;
  }
}

function persistEntries() {
  const dir = path.dirname(DATA_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

// Permissive CORS: the static game is served from a different origin/port than
// this API in every setup (python http.server on :5000 in dev, a CDN in prod), so
// the browser needs cross-origin access. The API is public read/write by design —
// it stores nothing but freely-chosen names and run stats.
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  setCors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on("data", function (chunk) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject({ status: 413, message: "request body too large" });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", function () {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", function (err) {
      reject({ status: 400, message: err.message });
    });
  });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleHealth(res) {
  sendJson(res, 200, {
    ok: true,
    service: "8bit-satoshi-leaderboard",
    entryCount: entries.length
  });
}

// GET ranked rows for a single board. Every board-identifying field is required so
// we never accidentally mix runs from different builds or rulesets (contract §6).
function handleGetLeaderboard(url, res) {
  const levelId = url.searchParams.get("levelId");
  const category = url.searchParams.get("category");
  const gameVersion = url.searchParams.get("gameVersion");
  const rulesVersionRaw = url.searchParams.get("rulesVersion");

  if (!levelId || !category || !gameVersion || !rulesVersionRaw) {
    sendJson(res, 400, {
      ok: false,
      error: "levelId, category, gameVersion and rulesVersion query params are required"
    });
    return;
  }
  const rulesVersion = Number(rulesVersionRaw);
  if (!Number.isInteger(rulesVersion)) {
    sendJson(res, 400, { ok: false, error: "rulesVersion must be an integer" });
    return;
  }

  let limit = DEFAULT_LIMIT;
  const limitRaw = url.searchParams.get("limit");
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      sendJson(res, 400, { ok: false, error: "limit must be a positive integer" });
      return;
    }
    limit = Math.min(parsed, MAX_LIMIT);
  }

  const board = {
    levelId: levelId,
    category: category,
    gameVersion: gameVersion,
    rulesVersion: rulesVersion
  };

  // The combined board is virtual (contract §5): it is derived from each player's
  // best entry on both levels rather than stored, so it is never submitted and not
  // matched by boardKey. An optional ?playerName lets the caller learn its own
  // progress ("what you still need to qualify") in the same round-trip.
  if (levelId === rules.COMBINED_LEVEL_ID) {
    const opts = { category: category, gameVersion: gameVersion, rulesVersion: rulesVersion };
    const combined = rules.combineEntries(entries, opts);
    const ranked = rules.rankEntries(combined).slice(0, limit);
    const playerName = url.searchParams.get("playerName");
    const you = playerName ? rules.combinedProgress(entries, playerName, opts) : null;
    sendJson(res, 200, {
      ok: true,
      board: board,
      total: combined.length,
      entries: ranked,
      you: you
    });
    return;
  }

  const key = rules.boardKey(levelId, category, gameVersion, rulesVersion);
  const matching = entries.filter(function (entry) {
    return rules.boardKey(entry.levelId, entry.category, entry.gameVersion, entry.rulesVersion) === key;
  });
  const ranked = rules.rankEntries(matching).slice(0, limit);

  sendJson(res, 200, {
    ok: true,
    board: board,
    total: matching.length,
    entries: ranked
  });
}

// Treat a submission as a duplicate of an existing row when the same player posts
// the same time on the same board. This makes accidental double-submits from the
// completion screen (a page refresh, a double tap) idempotent rather than spammy,
// and gives the client a distinct "duplicate" state to show (tickets d14a34a5,
// f5c6f03e). Name match is case-insensitive so "Sat" and "SAT" collide.
function findDuplicate(entry) {
  return entries.find(function (existing) {
    return (
      existing.levelId === entry.levelId &&
      existing.category === entry.category &&
      existing.gameVersion === entry.gameVersion &&
      existing.rulesVersion === entry.rulesVersion &&
      existing.time === entry.time &&
      existing.playerName.toLowerCase() === entry.playerName.toLowerCase()
    );
  });
}

async function handlePostLeaderboard(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    sendJson(res, err.status || 400, { ok: false, error: err.message || "could not read body" });
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    sendJson(res, 400, { ok: false, error: "body must be valid JSON" });
    return;
  }

  // Authoritative server-side validation. The client validates too, but we never
  // trust that — the backend re-decides everything that affects ranking (contract §2.3).
  const result = rules.validateSubmission(parsed);
  if (!result.ok) {
    sendJson(res, 400, { ok: false, error: "submission failed validation", details: result.errors });
    return;
  }

  // Server-assigned fields (contract §2.3): id and the authoritative accept time.
  // Client timestamps are advisory and never used for ranking.
  const entry = Object.assign({}, result.value, {
    id: crypto.randomUUID(),
    serverTimestamp: new Date().toISOString()
  });

  const duplicate = findDuplicate(entry);
  if (duplicate) {
    sendJson(res, 200, { ok: true, duplicate: true, entry: duplicate });
    return;
  }

  entries.push(entry);
  try {
    persistEntries();
  } catch (err) {
    // Roll the in-memory state back so it never claims to hold a row we failed to
    // persist; the client sees a clean failure it can retry.
    entries.pop();
    console.error("[leaderboard] failed to persist entry:", err.message);
    sendJson(res, 500, { ok: false, error: "failed to store submission" });
    return;
  }

  sendJson(res, 201, { ok: true, duplicate: false, entry: entry });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer(function (req, res) {
  if (req.method === "OPTIONS") {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch (err) {
    sendJson(res, 400, { ok: false, error: "invalid URL" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    handleHealth(res);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/leaderboard") {
    handleGetLeaderboard(url, res);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/leaderboard") {
    handlePostLeaderboard(req, res).catch(function (err) {
      console.error("[leaderboard] unexpected error:", err);
      sendJson(res, 500, { ok: false, error: "internal server error" });
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: "not found" });
});

// Only listen when run directly, so tests/tools can require this file for its
// handlers without binding a port.
if (require.main === module) {
  server.listen(PORT, function () {
    console.log("[leaderboard] listening on http://127.0.0.1:" + PORT);
    console.log("[leaderboard] data file: " + DATA_FILE);
  });
}

module.exports = { server: server };
