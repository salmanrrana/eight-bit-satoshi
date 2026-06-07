// Shared leaderboard validation + ranking rules.
//
// This is the single executable source of truth that BOTH the backend
// (server/leaderboard-server.js) and the browser client (js/leaderboard-client.js)
// load, so the two never drift apart. It implements the data contract documented
// in docs/leaderboard-contract.md — read that file for the field-by-field spec and
// the reasoning behind it. If the contract changes, change it here once.
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

  // Active categories (contract §1). v1 ships exactly one active category because
  // the game exposes a single timing ruleset. Reserved variants (All Pages, No
  // Deaths) are intentionally NOT accepted as submitted categories.
  const CATEGORIES = ["ANY%"];

  // Stable level keys that may be submitted, mapped to their canonical display
  // title (contract §2.1). "combined" is a *virtual* board derived from level
  // entries (contract §5) and must never be submitted directly.
  const SUBMITTABLE_LEVELS = {
    "whitepaper-run": "THE WHITEPAPER RUN",
    "running-bitcoin": "RUNNING BITCOIN"
  };

  // The virtual combined board's levelId (contract §1/§5). It is never submitted;
  // it is derived on read from a player's best entry on every submittable level.
  const COMBINED_LEVEL_ID = "combined";

  // Display-name constraints. These are the baseline limits enforced on both
  // sides; ticket 7f02e282 (privacy & moderation) layers a profanity/abuse filter
  // and the public-data notice on top of this — it does not loosen these bounds.
  const NAME_MIN = 1;
  const NAME_MAX = 12;
  const NAME_ALLOWED = /^[A-Za-z0-9 ._-]+$/;
  // Small public-board moderation blocklist. This deliberately catches obvious
  // abusive/profane display names without pretending to be a full trust & safety
  // system; maintainers can expand it and old rows will be filtered on read by the
  // server as soon as the rule changes.
  const NAME_BLOCKED_TERMS = [
    { value: "fuck", match: "compact" },
    { value: "shit", match: "compact" },
    { value: "bitch", match: "compact" },
    { value: "asshole", match: "compact" },
    { value: "whore", match: "compact" },
    { value: "slut", match: "compact" },
    { value: "killyourself", match: "compact" },
    { value: "killurself", match: "compact" },
    { value: "cunt", match: "token" },
    { value: "nazi", match: "token" },
    { value: "hitler", match: "token" },
    { value: "kkk", match: "token" },
    { value: "rape", match: "token" },
    { value: "rapist", match: "token" },
    { value: "kys", match: "token" }
  ];

  // Sanity ceiling for a submitted time. A real run is minutes long; anything past
  // a day is malformed or a clock/overflow bug, not a slow player. Deeper plausibility
  // checks (impossible-fast times, stat/split inconsistencies) live in the
  // anti-cheat ticket f5c6f03e; this is the "obviously malformed" floor/ceiling.
  const MAX_TIME_SECONDS = 24 * 60 * 60;

  // Float comparison slack (one centisecond) for monotonic split checks, so
  // sub-frame rounding never trips a "split exceeds final time" rejection.
  const EPSILON = 0.011;

  // Round to centisecond precision — the precision the contract ranks at (§3) and
  // the precision the on-screen m:ss.cc display shows.
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
  // tuple (contract §6): a run is never ranked against a different build or ruleset.
  function boardKey(levelId, category, gameVersion, rulesVersion) {
    return [levelId, category, gameVersion, rulesVersion].join("::");
  }

  function normalizeModerationChars(name) {
    return name
      .toLowerCase()
      .replace(/0/g, "o")
      .replace(/1/g, "i")
      .replace(/3/g, "e")
      .replace(/4/g, "a")
      .replace(/5/g, "s")
      .replace(/7/g, "t");
  }

  function normalizeNameForModeration(name) {
    return normalizeModerationChars(name).replace(/[^a-z0-9]+/g, "");
  }

  function tokenizeNameForModeration(name) {
    return normalizeModerationChars(name).split(/[^a-z0-9]+/).filter(Boolean);
  }

  function validateNameModeration(name) {
    const compact = normalizeNameForModeration(name);
    const tokens = tokenizeNameForModeration(name);
    for (let i = 0; i < NAME_BLOCKED_TERMS.length; i += 1) {
      const term = NAME_BLOCKED_TERMS[i];
      const blocked = term.match === "token"
        ? tokens.indexOf(term.value) !== -1
        : compact.indexOf(term.value) !== -1;
      if (blocked) {
        return { ok: false, error: "playerName is not allowed" };
      }
    }
    return { ok: true };
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
    const moderationResult = validateNameModeration(name);
    if (!moderationResult.ok) return moderationResult;
    return { ok: true, value: name };
  }

  // Validate one split object. Index/name/total/split shapes per contract §2.1.
  function validateSplit(split, position) {
    const where = "splits[" + position + "]";
    if (typeof split !== "object" || split === null) return where + " is not an object";
    if (!Number.isInteger(split.index) || split.index < 1) return where + ".index must be a positive integer";
    if (typeof split.name !== "string" || split.name.length === 0) return where + ".name must be a non-empty string";
    if (!isFiniteNumber(split.total) || split.total < 0) return where + ".total must be a non-negative number";
    if (!isFiniteNumber(split.split) || split.split < 0) return where + ".split must be a non-negative number";
    return null;
  }

  // Validate a full submission (run payload + envelope). This is the authoritative
  // server-side gate, but the client runs it too for instant feedback (contract:
  // "validated client-side and server-side").
  //
  // Returns { ok: true, value } where `value` is a normalized run-payload object
  // containing ONLY known contract fields (arbitrary extra client keys are dropped),
  // or { ok: false, errors: [string, ...] } listing every problem found.
  function validateSubmission(input) {
    const errors = [];
    if (typeof input !== "object" || input === null) {
      return { ok: false, errors: ["submission must be a JSON object"] };
    }

    // levelId — authoritative grouping key. "combined" is derived, never submitted.
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

    if (!isFiniteNumber(input.time) || input.time <= 0 || input.time > MAX_TIME_SECONDS) {
      errors.push("time must be a positive number of seconds within range");
    }

    if (!isNonNegativeInt(input.deaths)) errors.push("deaths must be a non-negative integer");
    if (!isNonNegativeInt(input.coins)) errors.push("coins must be a non-negative integer");
    if (!isNonNegativeInt(input.pages)) errors.push("pages must be a non-negative integer");
    if (!Number.isInteger(input.pagesTotal) || input.pagesTotal < 1) {
      errors.push("pagesTotal must be a positive integer");
    }
    // pages can never exceed the pages available in the level.
    if (isNonNegativeInt(input.pages) && Number.isInteger(input.pagesTotal) && input.pages > input.pagesTotal) {
      errors.push("pages cannot exceed pagesTotal");
    }
    if (!Number.isInteger(input.lives) || input.lives < 1) {
      // A run that reached the goal must have at least one life left; 0 lives is a failure.
      errors.push("lives must be an integer >= 1");
    }

    // splits — array, each well-formed, cumulative totals non-decreasing and never
    // past the final time (with one centisecond of float slack).
    if (!Array.isArray(input.splits)) {
      errors.push("splits must be an array");
    } else {
      let prevTotal = 0;
      for (let i = 0; i < input.splits.length; i += 1) {
        const splitError = validateSplit(input.splits[i], i);
        if (splitError) {
          errors.push(splitError);
          continue;
        }
        if (input.splits[i].total + EPSILON < prevTotal) {
          errors.push("splits[" + i + "].total is smaller than the previous split total");
        }
        if (isFiniteNumber(input.time) && input.splits[i].total > input.time + EPSILON) {
          errors.push("splits[" + i + "].total exceeds the final time");
        }
        prevTotal = input.splits[i].total;
      }
    }

    // Envelope: player-supplied name (run payload itself carries no name).
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
      lives: input.lives,
      isNewBest: input.isNewBest === true,
      splits: input.splits.map(function (s) {
        return {
          index: s.index,
          name: s.name,
          total: roundCentis(s.total),
          split: roundCentis(s.split)
        };
      }),
      playerName: nameResult.value
    };
    return { ok: true, value: value };
  }

  // Normalized player identity. The game has no accounts, so a "player" on the
  // combined board is just a display name compared case-insensitively after
  // trimming — the same identity rule the server uses for duplicate detection, so
  // "Sat" and "SAT" are one person across both levels.
  function playerKey(name) {
    return typeof name === "string" ? name.trim().toLowerCase() : "";
  }

  // Group raw level entries into each player's BEST qualifying entry per level,
  // restricted to a single board tuple's category/gameVersion/rulesVersion
  // (contract §5/§6 — combined never mixes builds or rulesets). Only the two
  // submittable levels contribute; the virtual "combined" levelId is ignored if it
  // somehow appears. Returns a Map(playerKey -> { displayName, levels }) where
  // `levels[levelId]` is that player's fastest entry for the level. "Best" means
  // lowest time, earliest serverTimestamp breaking a tie — so the combined total
  // automatically improves whenever a faster level time lands (acceptance: updates
  // when either level improves).
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
      // Display-name casing follows the player's most recent submission so the
      // combined row shows how they most recently spelled their name.
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

  // Build the combined board (contract §5): for every player who has a qualifying
  // entry on BOTH levels, sum their best level times into a single virtual entry.
  // Players missing either level are excluded — the combined board only ranks
  // fully-qualified runs. Returned entries are NOT yet ranked; pass them through
  // rankEntries() to stamp `rank` (they rank on the summed `time` exactly like a
  // real board, contract §3). Each entry carries a `levels` breakdown so the UI can
  // show the contributing level times alongside the total.
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
        // Deterministic, stable virtual id — used by §3's final id tiebreak and
        // never collides with a real (UUID) entry id.
        id: "combined::" + key,
        levelId: COMBINED_LEVEL_ID,
        category: opts.category,
        gameVersion: opts.gameVersion,
        rulesVersion: opts.rulesVersion,
        playerName: player.displayName,
        time: roundCentis(total),
        // The combined run is "achieved" when the LATER of the two level times was
        // posted — that is the instant the player qualified. Tie-break (§3) uses it.
        serverTimestamp: latestTs,
        levels: levels
      });
    });
    return combined;
  }

  // Describe one player's progress toward the combined board so the UI can tell
  // them exactly what they still need (acceptance: "understand what they still need
  // to complete to qualify"). Returns { playerName, qualified, time, levels,
  // missing } where `levels[levelId]` is { time, level } or null, and `missing`
  // lists the level ids still needed. `time` is the combined total only once
  // qualified. Returns null when no usable name is given.
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

  // Sort entries into ranked order and stamp a 1-based `rank` (contract §3):
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
    MAX_TIME_SECONDS: MAX_TIME_SECONDS,
    roundCentis: roundCentis,
    boardKey: boardKey,
    validateName: validateName,
    validateSubmission: validateSubmission,
    combineEntries: combineEntries,
    combinedProgress: combinedProgress,
    rankEntries: rankEntries
  };
});
