# dot-eater

A tiny browser maze game: eat all the dots.

Play it at [kdaisho.github.io/dot-eater](https://kdaisho.github.io/dot-eater).

## How to play

- Move with the arrow keys.
- Eat every dot in the maze to win.
- Avoid the two enemies, 👹 and 👺. If one catches you, you lose.
- The edges of the maze wrap around to the opposite side.
- After a win or a loss, press Space to restart.

## Development

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

## Tech

TypeScript, built with [Vite+](https://viteplus.dev).

## Deployment

On every push to `main`, GitHub Actions builds the site and publishes it to GitHub Pages.
