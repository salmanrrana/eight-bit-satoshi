import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "vendor/**",
      "js/animation.js",
      "js/audio.js",
      "js/chapters.js",
      "js/dialog.js",
      "js/input.js",
      "js/movement.js",
      "js/renderer.js",
      "js/state.js",
      "js/utils.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: globals.browser,
    },
    rules: {
      "no-unused-vars": [
        "error",
        { caughtErrors: "none", varsIgnorePattern: "^bayBase$" },
      ],
    },
  },
  {
    files: [
      "js/brawler.js",
      "js/leaderboard-rules.js",
      "js/number-go-up.js",
      "js/proof-of-work.js",
    ],
    languageOptions: { globals: { module: "readonly" } },
  },
  {
    files: ["js/proof-of-work/**/*.js"],
    languageOptions: { sourceType: "module" },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node,
    },
  },
  {
    files: ["tools/**/*.mjs", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
  },
];
