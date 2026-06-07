// Browser-side leaderboard service calls.
//
// This is the seam the submission flow (ticket d14a34a5) and the leaderboard UI
// (ticket 3048aa3c) call — it owns all network access to the backend so those
// tickets never touch fetch directly. It loads the SAME validation module the
// server uses (js/leaderboard-rules.js) for instant client-side feedback, then
// lets the backend re-decide authoritatively.
//
// Hard rule: leaderboards are an optional extra, so nothing here ever throws into
// gameplay. Every call resolves to a plain result object describing what happened
// ({ status: "ok" | "duplicate" | "invalid" | "offline" | "error", ... }) so the
// caller can show a state instead of crashing the game when the backend is down.
(function () {
  "use strict";

  const rules = window.LeaderboardRules;

  // Where the API lives. Defaults to same-host :5050 (the dev backend), but a
  // deployment overrides it by setting `window.LEADERBOARD_API_BASE` before this
  // script runs, or via a <meta name="leaderboard-api-base" content="..."> tag.
  // This is what lets the static front-end be hosted anywhere and still find its API.
  function resolveApiBase() {
    if (typeof window.LEADERBOARD_API_BASE === "string" && window.LEADERBOARD_API_BASE) {
      return window.LEADERBOARD_API_BASE.replace(/\/$/, "");
    }
    const meta = document.querySelector('meta[name="leaderboard-api-base"]');
    if (meta && meta.content) return meta.content.replace(/\/$/, "");
    return window.location.protocol + "//" + window.location.hostname + ":5050";
  }

  const API_BASE = resolveApiBase();

  // Network calls get a hard timeout so a hung/unreachable backend degrades to an
  // "offline" state quickly instead of leaving the UI spinning forever.
  const REQUEST_TIMEOUT_MS = 8000;

  function fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    const opts = Object.assign({}, options, { signal: controller.signal });
    return fetch(url, opts).finally(function () {
      clearTimeout(timer);
    });
  }

  // Distinguish "backend unreachable" (offline, network error, timeout) from a
  // real HTTP error response. The former is a normal, non-alarming state for an
  // optional feature; the latter is worth surfacing differently.
  function isNetworkError(err) {
    return err && (err.name === "AbortError" || err.name === "TypeError");
  }

  // Liveness probe used by the UI to decide whether to even offer leaderboard
  // actions. Never rejects.
  async function isAvailable() {
    try {
      const res = await fetchWithTimeout(API_BASE + "/api/health", { method: "GET" });
      return res.ok;
    } catch (err) {
      return false;
    }
  }

  // Submit a completed run. `submission` is the run payload from buildSubmission()
  // plus the envelope fields { playerName, clientTimestamp }. We validate locally
  // first for instant feedback, then POST and let the server be the authority.
  //
  // Resolves to one of:
  //   { status: "ok", entry }          stored (entry has id, serverTimestamp, ...)
  //   { status: "duplicate", entry }   identical run already on the board
  //   { status: "invalid", errors }    rejected by validation (client or server)
  //   { status: "offline" }            backend unreachable; caller can retry later
  //   { status: "error", message }     backend returned an unexpected failure
  async function submitScore(submission) {
    if (rules) {
      const local = rules.validateSubmission(submission);
      if (!local.ok) return { status: "invalid", errors: local.errors };
    }

    const body = Object.assign({}, submission, {
      clientTimestamp: submission.clientTimestamp || new Date().toISOString()
    });

    let res;
    try {
      res = await fetchWithTimeout(API_BASE + "/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (err) {
      if (isNetworkError(err)) return { status: "offline" };
      return { status: "error", message: String(err && err.message ? err.message : err) };
    }

    let data = null;
    try {
      data = await res.json();
    } catch (err) {
      return { status: "error", message: "backend returned an unreadable response" };
    }

    if (res.status === 400) {
      return { status: "invalid", errors: (data && data.details) || [(data && data.error) || "validation failed"] };
    }
    if (!res.ok || !data || data.ok !== true) {
      return { status: "error", message: (data && data.error) || ("backend error " + res.status) };
    }
    return { status: data.duplicate ? "duplicate" : "ok", entry: data.entry };
  }

  // Read ranked rows for one board. `params` is { levelId, category, gameVersion,
  // rulesVersion, limit?, playerName? }. `playerName` only applies to the virtual
  // combined board (levelId "combined"), where it asks the server to also report
  // that player's progress toward qualifying. Resolves to:
  //   { status: "ok", board, total, entries, you? }
  //   { status: "offline" }
  //   { status: "error", message }
  // `you` is present only for the combined board and is null when no name was given
  // or the player has no qualifying times yet.
  async function fetchLeaderboard(params) {
    const query = new URLSearchParams({
      levelId: params.levelId,
      category: params.category,
      gameVersion: params.gameVersion,
      rulesVersion: String(params.rulesVersion)
    });
    if (params.limit != null) query.set("limit", String(params.limit));
    if (params.playerName != null && params.playerName !== "") {
      query.set("playerName", String(params.playerName));
    }

    let res;
    try {
      res = await fetchWithTimeout(API_BASE + "/api/leaderboard?" + query.toString(), { method: "GET" });
    } catch (err) {
      if (isNetworkError(err)) return { status: "offline" };
      return { status: "error", message: String(err && err.message ? err.message : err) };
    }

    let data = null;
    try {
      data = await res.json();
    } catch (err) {
      return { status: "error", message: "backend returned an unreadable response" };
    }

    if (!res.ok || !data || data.ok !== true) {
      return { status: "error", message: (data && data.error) || ("backend error " + res.status) };
    }
    return { status: "ok", board: data.board, total: data.total, entries: data.entries, you: data.you };
  }

  window.eightBitSatoshiLeaderboard = {
    apiBase: API_BASE,
    isAvailable: isAvailable,
    submitScore: submitScore,
    fetchLeaderboard: fetchLeaderboard
  };
})();
