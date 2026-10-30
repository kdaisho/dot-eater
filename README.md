# dot-eater

A tiny browser maze game: eat all the dots.

Play it at [kdaisho.github.io/dot-eater](https://kdaisho.github.io/dot-eater).

## How to play

- You are the fly 🪰. Move with the arrow keys.
- Eat every dot in the maze to win.
- Avoid the enemies, 👹 and 👺. Each touch costs health and knocks you back; at 0 health you lose.
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

## Tech

TypeScript, built with [Vite+](https://viteplus.dev).

## Deployment

On every push to `main`, GitHub Actions builds the site and publishes it to GitHub Pages.

One-time setup: in the repository's Settings → Pages, set Source to "GitHub Actions".
