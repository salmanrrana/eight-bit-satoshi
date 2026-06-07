# Leaderboard Privacy & Name Moderation

8-Bit Satoshi's leaderboard is public, account-free, and intentionally small. A
submission stores only a player-chosen display name plus run data needed to rank
and audit the score.

## What becomes public

Accepted leaderboard rows expose:

- display name (`playerName`)
- level and category
- final time
- run stats: deaths, coins, pages, lives, splits, and whether the run was a local
  personal best
- game/rules versions
- server-assigned entry id and submit time

The results screen tells players this before they submit. Submitting is optional;
PLAY AGAIN and LEVELS keep working without a submission.

## What is not collected by the game

The leaderboard submission flow does not ask for or store:

- email addresses
- accounts or passwords
- wallet addresses
- IP addresses or device identifiers
- location data

The Node API also does not write request metadata to the leaderboard JSON store.
Production hosts, proxies, CDNs, or platform logs can still record IP addresses
or user agents outside this app. Configure those logs with the shortest retention
that fits your operational needs.

## Display-name rules

Display names are validated in `js/leaderboard-rules.js` and enforced both in the
browser and on the server:

- trim leading/trailing spaces before validation
- require 1-12 characters after trimming
- allow only letters, numbers, spaces, dots, underscores, and dashes
- reject obvious abusive/profane names via the moderation blocklist

The blocklist is deliberately lightweight. It catches obvious public-board abuse;
it is not a full moderation service. If the community finds a new abusive pattern,
add it to `NAME_BLOCKED_TERMS` in `js/leaderboard-rules.js`. The backend applies
the current name policy on reads as well as writes, so newly blocked names stop
appearing even before old rows are deleted from storage.

## Rejecting and removing names

New submissions with invalid or blocked names are rejected with a validation
response and are not stored. Existing rows can be handled in two ways:

- **Filter on read.** Any stored row whose name no longer passes
  `validateName()` is omitted from normal and combined leaderboard responses.
- **Delete from storage.** Permanently remove the row with the private
  maintenance path for your deployment, or edit the JSON store while the API is
  stopped. Do not expose public unauthenticated deletes.

## Deployment checklist

Before exposing a public leaderboard:

- run the API behind HTTPS
- persist `LEADERBOARD_DATA` on a durable volume
- keep any storage or admin-maintenance access private
- review host/proxy/CDN access-log retention
- review the display-name blocklist for the audience you expect
- document where players should report abusive names if you publish the game
