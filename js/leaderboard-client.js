// Local leaderboard store.
//
// The leaderboard is a high-score table saved in the browser's localStorage on the
// player's own device — there is no backend or network access. This module is the
// single seam the submission flow and the in-game leaderboard view call; it keeps
// the SAME interface a networked client would (isAvailable / submitScore /
// fetchLeaderboard) so the rest of the game does not care that storage is local.
//
// It loads the shared rules module (js/leaderboard-rules.js) for name validation,
// submission normalization, ranking, and the virtual combined board.
//
// Hard rule: leaderboards are an optional extra, so nothing here ever throws into
// gameplay. Every call resolves to a plain result object describing what happened
// ({ status: "ok" | "duplicate" | "invalid" | "offline" | "error", ... }) so the
// caller can show a state instead of crashing the game when storage is unavailable.
(function () {
  "use strict";

  const rules = window.LeaderboardRules;

  // Versioned storage key — bumping the suffix retires an incompatible schema
  // without colliding with the personal-bests key (8bit-satoshi:bests:v1).
  const STORAGE_KEY = "8bit-satoshi:leaderboard:v1";

  // Read the whole board. Returns [] for an empty/missing/corrupt store rather than
  // throwing — a garbled localStorage value must never break the game.
  function readAll() {
    let raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      return null; // storage blocked (private mode, disabled cookies, etc.)
    }
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  // Persist the whole board. Returns false if storage is unavailable or full.
  function writeAll(entries) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      return true;
    } catch (err) {
      return false;
    }
  }

  // Unique id for a stored entry. crypto.randomUUID is available in every browser
  // we target; the timestamp+counter fallback keeps ids unique if it is missing.
  let idCounter = 0;
  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    idCounter += 1;
    return "lb-" + Date.now().toString(36) + "-" + idCounter.toString(36);
  }

  // Liveness probe, kept for interface parity with a networked client. The local
  // board is "available" whenever localStorage can be read. Never rejects.
  async function isAvailable() {
    return readAll() !== null;
  }

  // Store a completed run. `submission` is the run payload from buildSubmission()
  // plus the envelope fields { playerName, clientTimestamp }. Resolves to one of:
  //   { status: "ok", entry }          stored (entry has id, serverTimestamp, ...)
  //   { status: "duplicate", entry }   an identical run is already saved
  //   { status: "invalid", errors }    rejected by validation
  //   { status: "offline" }            storage unavailable; caller can retry later
  //   { status: "error", message }     unexpected failure
  async function submitScore(submission) {
    if (!rules) {
      return { status: "error", message: "leaderboard rules unavailable" };
    }

    const validated = rules.validateSubmission(submission);
    if (!validated.ok) return { status: "invalid", errors: validated.errors };

    const entries = readAll();
    if (entries === null) return { status: "offline" };

    // serverTimestamp keeps the field name the UI reads; for a local store it is
    // simply when the run was saved on this device.
    const entry = Object.assign({}, validated.value, {
      id: makeId(),
      serverTimestamp: submission.clientTimestamp || new Date().toISOString()
    });

    // Treat an identical run (same level, same player, same time) as a duplicate so
    // a double-tap on SUBMIT TIME does not post the same run twice.
    const dupKey = rules.playerKey(entry.playerName);
    const existing = entries.find(function (e) {
      return e.levelId === entry.levelId &&
        rules.playerKey(e.playerName) === dupKey &&
        e.time === entry.time;
    });
    if (existing) return { status: "duplicate", entry: existing };

    entries.push(entry);
    if (!writeAll(entries)) return { status: "offline" };
    return { status: "ok", entry: entry };
  }

  // Read ranked rows for one board. `params` is { levelId, category, gameVersion,
  // rulesVersion, limit?, playerName? }. `playerName` only applies to the virtual
  // combined board (levelId "combined"), where it also reports that player's
  // progress toward qualifying. Resolves to:
  //   { status: "ok", board, total, entries, you? }
  //   { status: "offline" }
  // `you` is present only for the combined board and is null when no name was given.
  async function fetchLeaderboard(params) {
    const all = readAll();
    if (all === null) return { status: "offline" };

    const opts = {
      category: params.category,
      gameVersion: params.gameVersion,
      rulesVersion: params.rulesVersion
    };
    const limit = params.limit != null ? Number(params.limit) : null;

    if (params.levelId === rules.COMBINED_LEVEL_ID) {
      const combined = rules.rankEntries(rules.combineEntries(all, opts));
      const you = params.playerName ? rules.combinedProgress(all, params.playerName, opts) : null;
      const limited = limit != null ? combined.slice(0, limit) : combined;
      return {
        status: "ok",
        board: params.levelId,
        total: combined.length,
        entries: limited,
        you: you
      };
    }

    // A single level board: every entry for this exact (level, category, build,
    // ruleset) tuple, ranked by time.
    const matching = all.filter(function (entry) {
      return entry &&
        entry.levelId === params.levelId &&
        entry.category === opts.category &&
        entry.gameVersion === opts.gameVersion &&
        entry.rulesVersion === opts.rulesVersion;
    });
    const ranked = rules.rankEntries(matching);
    const limited = limit != null ? ranked.slice(0, limit) : ranked;
    return {
      status: "ok",
      board: params.levelId,
      total: ranked.length,
      entries: limited
    };
  }

  window.eightBitSatoshiLeaderboard = {
    storageKey: STORAGE_KEY,
    isAvailable: isAvailable,
    submitScore: submitScore,
    fetchLeaderboard: fetchLeaderboard
  };
})();
