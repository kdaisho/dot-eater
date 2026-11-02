# dot-eater

Tiny browser maze game in TypeScript. Live at https://kdaisho.github.io/dot-eater.
Planning lives in Linear: project **Dot Eater** (P-KDA-8), team **KDA**. For the current state and next steps, read `docs/handover.md`.

## Toolchain

- **Vite+** (`vite-plus`, CLI `vp`) bundles Vite, Vitest, Oxlint and Oxfmt. All tool config is in `vite.config.ts`.
- **pnpm 10** is pinned via `package.json#packageManager`. pnpm settings (overrides, peer rules) live in `pnpm-workspace.yaml`, not `package.json`. Always use pnpm, never npm or yarn.
- Node `^22.18.0 || ^24.11.0 || >=26.0.0` (see `engines`). CI uses Node 24.

| Command        | What it does                                                     |
| -------------- | ---------------------------------------------------------------- |
| `pnpm dev`     | Dev server                                                       |
| `pnpm build`   | Build to `dist/` (base `/dot-eater/`)                            |
| `pnpm preview` | Serve the build under `/dot-eater/`                              |
| `pnpm check`   | Format check + lint + type check. Must pass before every commit. |
| `pnpm test`    | Vitest                                                           |
| `pnpm fmt`     | Format (4 spaces, no semicolons, double quotes)                  |

The admin debug mode's passphrase is the env var `ADMIN_PASSPHRASE` (in the untracked `.env.local`, and a repo secret for the deploy). Only its salted hash goes into the bundle; never write the passphrase into code, docs or commits.

## Code layout

`src/main.ts` is the entry and the only place that adds listeners and starts timers. Game logic (`game.ts`, `ai.ts`, `path.ts`, `level.ts`, `flow.ts`, `loop.ts`, `glide.ts`, `layout.ts`) has no DOM access and takes randomness, time and input as parameters, so it is unit-tested directly. `input.ts` attaches to an injected `EventTarget`. `render.ts` (canvas) and `ui.ts` (overlays) touch the DOM. Levels live in `src/levels/`. See `docs/handover.md` for a module map.

## Testing

- Import test APIs from `vite-plus/test`, not `vitest`.
- Tests sit next to the code as `*.test.ts`; shared fixtures are in `src/test/helpers.ts`.
- DOM tests opt in per file with `// @vitest-environment happy-dom`. They must mock `canvas-confetti`, which crashes under happy-dom.
- Bug fixes need a regression test that fails without the fix. Check that it does.

## Git and GitHub

- Branches: `{ISSUE-ID}/{exact issue title in kebab-case}` for Linear issues (e.g. `KDA-193/add-a-fixed-tick-game-loop`); `chore/`, `fix/` or `bugfix/` otherwise.
- Merge PRs with **merge commits**, never squash: PRs are often stacked, and squashing breaks every PR above.
- **Stacked PRs:** before deleting a merged branch, retarget the PRs based on it to `main` with `gh api -X PATCH repos/kdaisho/dot-eater/pulls/N -f base=main`. Deleting the branch first (e.g. `gh pr merge --delete-branch`) closes those PRs instead of retargeting them.
- The local `gh` is 2.3.0: `gh pr edit --base` fails (Projects classic error) and `gh run list` has no `--json`. Use `gh api` for both.
- Never check out other branches in the main checkout; use a worktree or `git archive` into a temp folder.

## CI and deploy

- `.github/workflows/ci.yml`: on pull requests only. Runs install, check, test, build via `voidzero-dev/setup-vp`.
- `.github/workflows/deploy.yml`: on push to `main`. Runs check, test, build, then deploys `dist/` to GitHub Pages (Pages source is "GitHub Actions"). Only the latest queued deploy runs; earlier queued ones show as cancelled, which is expected.
