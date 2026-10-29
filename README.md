# dot-eater

A tiny browser maze game: eat all the dots.

Play it at [kdaisho.github.io/dot-eater](https://kdaisho.github.io/dot-eater).

## How to play

- You are the fly 🪰. Move with the arrow keys.
- Eat every dot in the maze to win.
- Avoid the two enemies, 👹 and 👺. If one catches you, you lose.
- The openings in the outer wall lead to the opposite side.
- After a win or a loss, press Space to restart.

## Development

Prerequisites:

- Node.js 22.18+, 24.11+ or 26+ (CI uses Node 24)
- pnpm 10 (pinned in `package.json#packageManager`; run `corepack enable` to use it)

Install dependencies:

```sh
pnpm install
```

Scripts:

| Command        | What it does                                       |
| -------------- | -------------------------------------------------- |
| `pnpm dev`     | Start the dev server                               |
| `pnpm build`   | Build the site into `dist/`                        |
| `pnpm preview` | Serve the production build locally                 |
| `pnpm check`   | Format check (Oxfmt), lint (Oxlint) and type check |
| `pnpm test`    | Run tests (Vitest)                                 |
| `pnpm fmt`     | Format the code                                    |

CI runs `pnpm check`, `pnpm test` and `pnpm build` on every pull request.

## Recording gameplay

Add `?record` to the URL (e.g. `http://localhost:5173/dot-eater/?record`, or the live site) to record runs for videos. A small "● REC" badge shows in the top-right corner while it's on.

- Each run is recorded from the moment play starts until its end screen: a stage clear or game over, or in versus each round. When it ends, the browser downloads it as a JSON file, e.g. `dot-eater-stage1-solo-dragon-lost-2026-10-28T19-40-05.json`.
- Pausing is fine: paused time is left out of the recording.
- A recording holds the run's input and the seed of its randomness, so `src/replay.ts` (`createReplayer`, `verify`) replays it exactly, tick by tick.
- Without `?record` nothing is recorded.

## Tech

TypeScript, built with [Vite+](https://viteplus.dev).

## Deployment

On every push to `main`, GitHub Actions builds the site and publishes it to GitHub Pages.

One-time setup: in the repository's Settings → Pages, set Source to "GitHub Actions".
