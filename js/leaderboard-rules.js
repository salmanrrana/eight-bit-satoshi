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

  // Display-name constraints. These are the baseline limits enforced on both
  // sides; ticket 7f02e282 (privacy & moderation) layers a profanity/abuse filter
  // and the public-data notice on top of this — it does not loosen these bounds.
  const NAME_MIN = 1;
  const NAME_MAX = 12;
  const NAME_ALLOWED = /^[A-Za-z0-9 ._-]+$/;

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
    NAME_MIN: NAME_MIN,
    NAME_MAX: NAME_MAX,
    NAME_ALLOWED: NAME_ALLOWED,
    MAX_TIME_SECONDS: MAX_TIME_SECONDS,
    roundCentis: roundCentis,
    boardKey: boardKey,
    validateName: validateName,
    validateSubmission: validateSubmission,
    rankEntries: rankEntries
  };
});
