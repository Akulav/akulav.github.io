# CLAUDE.md

Notes for working on **akulav.github.io**, the home page of every project made by Akulav. Plain HTML, CSS and
JavaScript: no framework, no build step, no trackers. GitHub Pages publishes `main` as-is.

## Files

- `index.html` — page structure
- `script.js` — project data (featured + "more on GitHub" lists) and the code that renders the cards and marquee
- `style.css` — all styling
- `tools/make-icon.js` — regenerates the site icon
- `.github/workflows/check.yml` — CI (on push and weekly): `node --check script.js`, and every `repo:` in
  `script.js` must exist as a public `Akulav/<repo>`. Renaming or making a repo private breaks it.

## Run and verify

- Preview: the `site` config in `.claude/launch.json` serves the folder on port 5173 (`npx http-server`).
- `node --check script.js` before committing.

## Rules

- **Everything committed to `main` is published.** Never commit scratch files, local tooling output or anything
  private. `graphify-out/` is git-ignored for this reason; keep it that way.
- Project cards are built with `innerHTML` from the hardcoded list in `script.js`. That is safe only because the data
  is static: never feed fetched or user-provided text into those templates.
- External links use `target="_blank" rel="noopener"`.
- Keep it dependency-free: no CDNs, analytics or web fonts from third parties.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships. It is local only (`graphify-out/` is git-ignored).

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question. Read raw files only for lines the graph or an earlier read already located.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
