import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/**"] },
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
    files: ["js/brawler.js", "js/leaderboard-rules.js"],
    languageOptions: { globals: { module: "readonly" } },
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
