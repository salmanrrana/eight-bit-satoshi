---
name: 8-Bit Satoshi
description: Five classic pixel levels and a distinct Level 6 street brawler, For the People.
colors:
  ink: "oklch(8% 0.01 255)"
  panel: "oklch(15% 0.02 255)"
  panel-2: "oklch(23% 0.025 255)"
  paper: "oklch(93% 0.018 80)"
  muted: "oklch(70% 0.035 95)"
  bitcoin: "oklch(72% 0.18 62)"
  green: "oklch(66% 0.18 145)"
  red: "oklch(58% 0.2 25)"
  arcade-ink: "#141922"
  arcade-cream: "#fff0c2"
  arcade-gold: "#ffb34c"
  arcade-mint: "#7af0be"
  arcade-background: "#101820"
  arcade-bezel: "#a78160"
  arcade-secondary: "#293644"
  arcade-button-text: "#ffe5b7"
typography:
  body:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
    fontSize: "clamp(11px, 2.4vw, 16px)"
    lineHeight: 1.55
  display:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
    fontSize: "clamp(24px, 7vw, 58px)"
    lineHeight: 0.98
    letterSpacing: "0"
  arcade-display:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
    fontSize: "clamp(28px, 4vw, 48px)"
    lineHeight: 0.98
  arcade-label:
    fontFamily: 'Arial, sans-serif'
    fontSize: "11px"
    fontWeight: 700
  arcade-body:
    fontFamily: 'Arial, sans-serif'
    fontSize: "16px"
    lineHeight: 1.4
  arcade-data:
    fontFamily: 'Arial, sans-serif'
    fontSize: "14px"
    fontWeight: 700
rounded:
  direction-key: "9px"
  direction-cradle: "12px"
  action-key: "50%"
spacing:
  compact: "8px"
  controls: "10px"
  actions: "12px"
  shell: "16px"
components:
  button-primary:
    backgroundColor: "{colors.bitcoin}"
    textColor: "{colors.ink}"
    padding: "0 18px"
  button-arcade-secondary:
    backgroundColor: "{colors.arcade-secondary}"
    textColor: "{colors.arcade-button-text}"
    padding: "0 18px"
  level-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.paper}"
    padding: "clamp(6px, 1.6vw, 10px)"
  level-card-selected:
    backgroundColor: "{colors.panel-2}"
  name-input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.paper}"
    padding: "0 12px"
  leaderboard-tab:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.paper}"
    padding: "6px 14px"
  people-power:
    backgroundColor: "{colors.arcade-mint}"
    textColor: "#102b2a"
    rounded: "{rounded.action-key}"
    width: "60px"
    height: "60px"
---

# Design System: 8-Bit Satoshi

## Overview

**Creative North Star: "For the People"**

This documents the implemented game, with its existing classic presentation and the distinct Level 6 extension. The first five levels retain their compact 8-bit world. Level 6 gives four selectable fighters a richer, dusk-lit arcade street fight across eight districts and sixteen fights. “32-bit” describes the aesthetic, not a literal hardware or palette restriction.

**Key Characteristics:**

- Crisp pixels, dark outlines, readable silhouettes, and direct arcade labels.
- Warm financial-district scenery behind a clear fighting lane.
- Sharp status and instructions around a pixel playfield, with expressive characters and throwable street objects.

## Colors

Primary accents are Bitcoin orange in shared menus and warm arcade gold for Level 6 headings, health, combos, and district cues. Secondary mint marks People Power and cleared-block feedback. Warm cream carries arcade text and score; dark blue ink separates sprites, signage, and HUD panels from the city.

Classic menus use the root ink, panel, paper, and muted colors. Selected level cards use orange borders and an inset orange stroke; cleared status is green. The Level 6 outer bezel is warm brown over a dark blue page. Its secondary buttons use a quieter blue surface and warm text.

## Typography

Shared menus use the system monospace stack above; no webfont is loaded. Uppercase headings carry the arcade character. Body copy stays within 44 characters per line in shared overlays; the Level 6 brief allows 66. Numbers use tabular figures in timers and results. Level 6 uses Arial for its essential status and instructions: 20px fighter names, 18px district headings, 16px dialogue, and 14px meters and controls. Portrait dialogue is 15px, or 14px on short phones. Compact landscape uses 11–14px labels to keep the entire fight and controls visible.

Canvas labels use bold Arial with a minimum of 11 logical pixels and a thin dark outline behind light text. Sign headings are 13px, combo labels 17px, and GO prompts 24px. The essential instructions, health, charge, timer, score, district, and fight counts live in the DOM so canvas scaling cannot blur them.

## Layout

The game is a centered canvas with HTML overlays, not a scrolling website. Classic levels draw at 256×240; Level 6 uses 640×360 logical coordinates with a 1280×720 backing canvas and a 16:9 frame, up to 1320 CSS pixels wide. Canvas smoothing is disabled.

Level 6 keeps health and power above the playfield at left and district, wave, timer, and score at right. Dialogue and pickup prompts sit immediately below the canvas. Eight districts share four scenery themes, with two fights per district. The camera begins inside each new district when the checkpoint changes.

Coarse pointers or widths at or below 700px show touch controls. Portrait Level 6 places them below the canvas; its overlays grow taller and scroll internally. Touch landscape, including tablets, reserves side space for the controls; desktop landscape below 480px uses the same compact arrangement. Tablet landscape keeps larger status type than phones. Action keys form a two-by-two grid: 60px normally, 52px on short portrait phones, and 50px in landscape. Direction keys are 46px normally and 40px on short portrait phones. Short portrait layouts shrink the playfield separately from the status text. Menu buttons have a 44px minimum height.

## Elevation & Depth

Shared menus use hard ink shadows and inset selected-state strokes. Touch controls have recessed directional cradles and raised action keys that depress on contact. Level 6 adds a soft shadow beneath its bezel. Within the scene, sprite shading, ground shadows, depth sorting, and slower background movement provide depth.

Combat uses small particles, hit words, a mint special-attack ring, and brief screen shake. Reduced-motion preference suppresses screen shake; ambient animation continues.

## Shapes

Menu cards and panels remain rectangular with visible strokes. The touch pad uses rounded square keys inside a rounded cradle; action keys are circular. Runtime fighters use a two-pixel construction grid, ink silhouettes, shaded clothing, and separate moving limbs.

## Components

- **Level picker:** wrapping button cards with number, title, and status. Level 6 fits three columns when space allows; selection remains visibly outlined.
- **Buttons:** orange primary actions, dark secondary actions in arcade mode, brightness on hover, physical depression on press, and a visible paper-colored keyboard focus ring.
- **Overlays and results:** centered, darkened backdrops with internal scrolling. Results retain the existing timer, splits, statistics, name field, and leaderboard patterns.
- **Name field and leaderboard tabs:** paper strokes, dark surfaces, and orange focus or selected treatment; submission states keep their existing muted, green, orange, and red feedback.
- **Fighter picker:** four portrait cards with native radio inputs, a selected gold stroke, visible keyboard focus, and a description of the selected fighter's moves. Two columns on portrait phones.
- **Arcade HUD and controls:** gold health, mint special charge, labeled Attack/Jump/Power/Grab–Throw touch keys, and a separate Pause button. The throw key changes its label when an object is available. Gameplay labels stay clear of the fight.
- **City and actors:** `assets/brawler/city.png` is the generated background plate; fighters, props, thrown objects, signs, and effects are drawn in `js/brawler-art.js`. Asset provenance and the prompt live in `assets/brawler/README.md`.

## Do's and Don'ts

- **Do** preserve the first five levels and scope the arcade presentation to `body.brawler-mode` and the Level 6 renderer.
- **Do** keep gameplay pixels crisp and the lower street clear enough to read movement and attacks.
- **Do** retain the alternate-2026 satire label and distinguish imagined dialogue from real quotations.
- **Don't** apply the 16:9 viewport, arcade palette, or richer sprites to classic levels by default.
- **Don't** treat “32-bit” as a required hardware emulation limit.
- **Don't** claim an approved visual mockup; this system records the implemented game extension.

Sources: `index.html`, `styles/main.css`, `js/game.js`, `js/brawler.js`, `js/brawler-art.js`, and `assets/brawler/README.md`. Keep these documents descriptive of the running game when its visuals change.
