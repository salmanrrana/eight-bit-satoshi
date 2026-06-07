// Shared leaderboard rules: name validation, submission normalization, ranking,
// and the virtual combined board.
//
// Scope note: the leaderboard is a LOCAL high-score table backed by the browser's
// localStorage (js/leaderboard-client.js). There is no server, so there is no
// anti-cheat or content-moderation layer here — the scores live only on the
// player's own device. This module is just the shared shape-and-ranking logic the
// client and the in-game leaderboard view both rely on.
//
// The module is dependency-free and environment-agnostic: in Node it is a
// CommonJS module (`require`), in the browser it attaches `window.LeaderboardRules`.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LeaderboardRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Active categories. v1 ships exactly one because the game exposes a single
  // timing ruleset.
  const CATEGORIES = ["ANY%"];

  // Stable level keys that may be submitted, mapped to their canonical display
  // title. "combined" is a *virtual* board derived from level entries (see
  // combineEntries) and is never submitted directly.
  const SUBMITTABLE_LEVELS = {
    "whitepaper-run": "THE WHITEPAPER RUN",
    "running-bitcoin": "RUNNING BITCOIN"
  };

  // The virtual combined board's levelId. It is never submitted; it is derived on
  // read from a player's best entry on every submittable level.
  const COMBINED_LEVEL_ID = "combined";

  // Display-name constraints.
  const NAME_MIN = 1;
  const NAME_MAX = 12;
  const NAME_ALLOWED = /^[A-Za-z0-9 ._-]+$/;

  // Round to centisecond precision — the precision the board ranks at and the
  // on-screen m:ss.cc display shows.
  function roundCentis(n) {
    return Math.round(n * 100) / 100;
  }

  function isFiniteNumber(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function isNonNegativeInt(n) {
    return Number.isInteger(n) && n >= 0;
  }

  // Stable identifier for a board. Runs are only ever compared within the same
  // tuple: a run is never ranked against a different build or ruleset.
  function boardKey(levelId, category, gameVersion, rulesVersion) {
    return [levelId, category, gameVersion, rulesVersion].join("::");
  }

  // Normalize and validate a display name. Returns { ok, value } or { ok:false, error }.
  // Trimming is intentional: leading/trailing spaces are stripped before the length
  // check so " AB " and "AB" are the same 2-character name.
  function validateName(rawName) {
    if (typeof rawName !== "string") return { ok: false, error: "playerName must be a string" };
    const name = rawName.trim();
    if (name.length < NAME_MIN) return { ok: false, error: "playerName is empty" };
    if (name.length > NAME_MAX) return { ok: false, error: "playerName exceeds " + NAME_MAX + " characters" };
    if (!NAME_ALLOWED.test(name)) return { ok: false, error: "playerName has disallowed characters" };
    return { ok: true, value: name };
  }

  // Validate and normalize a submission (run payload + envelope) before it is
  // stored. Since storage is local-only, this is a light shape check — it ensures
  // the fields the leaderboard view reads are present and well-typed, and drops any
  // arbitrary extra client keys so storage only ever holds known fields.
  //
  // Returns { ok: true, value } with a normalized run-payload object, or
  // { ok: false, errors: [string, ...] } listing every problem found.
  function validateSubmission(input) {
    const errors = [];
    if (typeof input !== "object" || input === null) {
      return { ok: false, errors: ["submission must be a JSON object"] };
    }

    // levelId — grouping key. "combined" is derived, never submitted.
    if (typeof input.levelId !== "string" || !Object.prototype.hasOwnProperty.call(SUBMITTABLE_LEVELS, input.levelId)) {
      errors.push("levelId must be one of: " + Object.keys(SUBMITTABLE_LEVELS).join(", "));
    }

    // level — display title, UI only. Must be a non-empty string but is never a key.
    if (typeof input.level !== "string" || input.level.length === 0) {
      errors.push("level (display title) must be a non-empty string");
    }

    if (typeof input.gameVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(input.gameVersion)) {
      errors.push("gameVersion must be a semver string like \"1.0.0\"");
    }

    if (!Number.isInteger(input.rulesVersion) || input.rulesVersion < 1) {
      errors.push("rulesVersion must be a positive integer");
    }

    if (typeof input.category !== "string" || CATEGORIES.indexOf(input.category) === -1) {
      errors.push("category must be one of: " + CATEGORIES.join(", "));
    }

    if (!isFiniteNumber(input.time) || input.time <= 0) {
      errors.push("time must be a positive number of seconds");
    }

    if (!isNonNegativeInt(input.deaths)) errors.push("deaths must be a non-negative integer");
    if (!isNonNegativeInt(input.coins)) errors.push("coins must be a non-negative integer");
    if (!isNonNegativeInt(input.pages)) errors.push("pages must be a non-negative integer");
    if (!Number.isInteger(input.pagesTotal) || input.pagesTotal < 1) {
      errors.push("pagesTotal must be a positive integer");
    }
    if (isNonNegativeInt(input.pages) && Number.isInteger(input.pagesTotal) && input.pages > input.pagesTotal) {
      errors.push("pages cannot exceed pagesTotal");
    }

    const nameResult = validateName(input.playerName);
    if (!nameResult.ok) errors.push(nameResult.error);

    if (errors.length > 0) return { ok: false, errors: errors };

    // Build the normalized entry from known fields only — never echo arbitrary
    // client keys into storage. Times are rounded to the ranked precision so two
    // runs that display identically are stored identically (and thus tie).
    const value = {
      levelId: input.levelId,
      level: input.level,
      gameVersion: input.gameVersion,
      rulesVersion: input.rulesVersion,
      category: input.category,
      time: roundCentis(input.time),
      deaths: input.deaths,
      coins: input.coins,
      pages: input.pages,
      pagesTotal: input.pagesTotal,
      lives: Number.isInteger(input.lives) ? input.lives : 0,
      isNewBest: input.isNewBest === true,
      splits: Array.isArray(input.splits)
        ? input.splits.map(function (s) {
            return {
              index: s.index,
              name: s.name,
              total: roundCentis(s.total),
              split: roundCentis(s.split)
            };
          })
        : [],
      playerName: nameResult.value
    };
    return { ok: true, value: value };
  }

  // Normalized player identity. The game has no accounts, so a "player" on the
  // combined board is just a display name compared case-insensitively after
  // trimming, so "Sat" and "SAT" are one person across both levels.
  function playerKey(name) {
    return typeof name === "string" ? name.trim().toLowerCase() : "";
  }

  // Group raw level entries into each player's BEST entry per level, restricted to
  // a single board tuple's category/gameVersion/rulesVersion (the combined board
  // never mixes builds or rulesets). Only the two submittable levels contribute.
  // Returns a Map(playerKey -> { displayName, levels }) where `levels[levelId]` is
  // that player's fastest entry for the level. "Best" means lowest time, earliest
  // serverTimestamp breaking a tie — so the combined total automatically improves
  // whenever a faster level time lands.
  function groupBestByPlayer(entries, opts) {
    const wantedLevels = Object.keys(SUBMITTABLE_LEVELS);
    const players = new Map();
    if (!Array.isArray(entries)) return players;

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (!entry || typeof entry !== "object") continue;
      if (entry.category !== opts.category) continue;
      if (entry.gameVersion !== opts.gameVersion) continue;
      if (entry.rulesVersion !== opts.rulesVersion) continue;
      if (wantedLevels.indexOf(entry.levelId) === -1) continue;
      if (!isFiniteNumber(entry.time)) continue;
      const key = playerKey(entry.playerName);
      if (!key) continue;

      let player = players.get(key);
      if (!player) {
        player = { displayName: entry.playerName, latestTs: "", levels: {} };
        players.set(key, player);
      }
      // Display-name casing follows the player's most recent submission.
      const ts = entry.serverTimestamp || "";
      if (ts >= player.latestTs) {
        player.latestTs = ts;
        player.displayName = entry.playerName;
      }
      const current = player.levels[entry.levelId];
      if (
        !current ||
        entry.time < current.time ||
        (entry.time === current.time && ts < (current.serverTimestamp || ""))
      ) {
        player.levels[entry.levelId] = entry;
      }
    }
    return players;
  }

  // Build the combined board: for every player who has an entry on BOTH levels, sum
  // their best level times into a single virtual entry. Players missing either level
  // are excluded. Returned entries are NOT yet ranked; pass them through
  // rankEntries() to stamp `rank`. Each entry carries a `levels` breakdown so the UI
  // can show the contributing level times alongside the total.
  function combineEntries(entries, opts) {
    const players = groupBestByPlayer(entries, opts);
    const wantedLevels = Object.keys(SUBMITTABLE_LEVELS);
    const combined = [];

    players.forEach(function (player, key) {
      const hasAll = wantedLevels.every(function (levelId) {
        return player.levels[levelId];
      });
      if (!hasAll) return;

      let total = 0;
      let latestTs = "";
      const levels = {};
      wantedLevels.forEach(function (levelId) {
        const entry = player.levels[levelId];
        total += entry.time;
        const ts = entry.serverTimestamp || "";
        if (ts > latestTs) latestTs = ts;
        levels[levelId] = {
          levelId: levelId,
          level: entry.level || SUBMITTABLE_LEVELS[levelId],
          time: roundCentis(entry.time),
          serverTimestamp: entry.serverTimestamp,
          id: entry.id
        };
      });

      combined.push({
        // Deterministic, stable virtual id — used by the final id tiebreak and
        // never collides with a real entry id.
        id: "combined::" + key,
        levelId: COMBINED_LEVEL_ID,
        category: opts.category,
        gameVersion: opts.gameVersion,
        rulesVersion: opts.rulesVersion,
        playerName: player.displayName,
        time: roundCentis(total),
        // The combined run is "achieved" when the LATER of the two level times was
        // posted — that is the instant the player qualified. Tie-break uses it.
        serverTimestamp: latestTs,
        levels: levels
      });
    });
    return combined;
  }

  // Describe one player's progress toward the combined board so the UI can tell
  // them exactly what they still need. Returns { playerName, qualified, time,
  // levels, missing } where `levels[levelId]` is { time, level } or null, and
  // `missing` lists the level ids still needed. `time` is the combined total only
  // once qualified. Returns null when no usable name is given.
  function combinedProgress(entries, playerName, opts) {
    const key = playerKey(playerName);
    if (!key) return null;

    const player = groupBestByPlayer(entries, opts).get(key);
    const wantedLevels = Object.keys(SUBMITTABLE_LEVELS);
    const levels = {};
    const missing = [];
    let total = 0;

    wantedLevels.forEach(function (levelId) {
      const entry = player && player.levels[levelId];
      if (entry) {
        levels[levelId] = {
          levelId: levelId,
          level: entry.level || SUBMITTABLE_LEVELS[levelId],
          time: roundCentis(entry.time)
        };
        total += entry.time;
      } else {
        levels[levelId] = null;
        missing.push(levelId);
      }
    });

    return {
      playerName: player ? player.displayName : playerName.trim(),
      qualified: missing.length === 0,
      time: missing.length === 0 ? roundCentis(total) : null,
      levels: levels,
      missing: missing
    };
  }

  // Sort entries into ranked order and stamp a 1-based `rank`:
  //   1. time ascending (only ranking signal)
  //   2. earlier serverTimestamp wins ties
  //   3. ascending id as a final deterministic tiebreak
  // Returns a new array; does not mutate the input.
  function rankEntries(entries) {
    const sorted = entries.slice().sort(function (a, b) {
      if (a.time !== b.time) return a.time - b.time;
      const ta = a.serverTimestamp || "";
      const tb = b.serverTimestamp || "";
      if (ta !== tb) return ta < tb ? -1 : 1;
      const ia = a.id || "";
      const ib = b.id || "";
      if (ia !== ib) return ia < ib ? -1 : 1;
      return 0;
    });
    return sorted.map(function (entry, index) {
      return Object.assign({}, entry, { rank: index + 1 });
    });
  }

  return {
    CATEGORIES: CATEGORIES,
    SUBMITTABLE_LEVELS: SUBMITTABLE_LEVELS,
    COMBINED_LEVEL_ID: COMBINED_LEVEL_ID,
    NAME_MIN: NAME_MIN,
    NAME_MAX: NAME_MAX,
    NAME_ALLOWED: NAME_ALLOWED,
    roundCentis: roundCentis,
    boardKey: boardKey,
    playerKey: playerKey,
    validateName: validateName,
    validateSubmission: validateSubmission,
    combineEntries: combineEntries,
    combinedProgress: combinedProgress,
    rankEntries: rankEntries
  };
});
