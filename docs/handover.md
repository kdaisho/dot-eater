# Handover

Last updated: 2026-10-25. Read `CLAUDE.md` first for project conventions.

## Where things stand

- **Milestone 1 "Organize code & tooling" is done and live.** Vite+ toolchain, modules, 54 unit tests, CI on PRs, deploy to Pages via Actions, and fixes for the chase AI, restart listeners, swap collision, dead-end enemies and confetti. All issues are Done in Linear; PRs #2–#12 are merged.
- **Next: milestone "Engine foundations"** (KDA-193 to KDA-199). Nothing started yet.

## Next milestone: Engine foundations

All issues are in Linear with checklists and "blocked by" links. Suggested order:

1. In parallel (independent): **KDA-193** fixed-tick game loop, **KDA-194** input action layer, **KDA-195** level data format and loader, **KDA-196** BFS chase AI.
2. Then: **KDA-199** canvas renderer with animated movement (blocked by KDA-193), **KDA-197** game state machine, **KDA-198** score and lives.

Expect overlap in `main.ts` and `game.ts` between KDA-193, KDA-197 and KDA-198; stack those branches or run them in sequence.

Read the comments on KDA-193 and KDA-196 before starting them: they carry deferred findings from the M1 review (enemies keep moving after the game ends; `lastPos` timing for simultaneous moves; chase AI ignoring wrap-around).

Later milestones (Stages, Characters & breaths, Controllers & local 2-player, Polish) and an idea backlog (KDA-223 to KDA-227) are also in Linear.

## Decisions already made

- **Gameplay:** grid-based movement with smooth animation (not free movement); each character has a signature breath plus one stat; breaths use an energy meter refilled by eating dots; local 2-player has both co-op and versus; stages unlock in order.
- **Code:** the swap-collision check in `collides()` now matters: on the fixed-tick loop all moves in a tick apply together, so a player and enemy swapping cells never share one; an unknown AI type throws; `GameState.intervalId` is gone (the rAF loop in `main.ts` replaced `setInterval`).
- **Collisions** are checked once per tick against start-of-tick positions (not `lastPos`, which may be from an older tick), and enemies aim at the player's start-of-tick cell.
- **Tap buffer:** the newest freshly pressed direction is kept in `GameState.bufferedStep` and tried first at the player's next move opportunity, falling back to the held direction if blocked; it is cleared at that opportunity either way. This stops quick taps made mid-move from being lost.
- **Level 1 speeds:** player 4 cells/s, enemies 2 cells/s (the defaults; level 1 sets no speeds). Levels may override `playerSpeed` and per-enemy `speed`.
- **Tooling:** CI uses `setup-vp` with `run-install: false` and runs on PRs only; pnpm 10 pinned.

## How we work

- The main session acts as PM: it creates and updates Linear issues, delegates each issue to an agent in its own git worktree, verifies the agent's result itself (clean `pnpm install --frozen-lockfile`, check, test, build), and comments the outcome on the issue.
- One branch per issue, stacked when dependent. Agents commit but don't push unless asked.
- Review: run `/code-review` per branch or have a reviewer session leave PR comments. Clear bugs are fixed directly; judgment calls go to the user. Fixes are added as new commits, then branches above are rebased and force-pushed, and each comment gets a reply with the fixing commit and is resolved.
- Only findings deferred past the PR become Linear issues or comments on existing issues.
- Disk space is tight: remove agent worktrees and temporary build copies when done.
