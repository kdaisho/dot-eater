# Handover

Last updated: 2026-10-25. Read `CLAUDE.md` first for project conventions.

## Where things stand

- **Milestone 1 "Organize code & tooling" is done and live** (PRs #2–#12 merged).
- **Milestone 2 "Engine foundations" (KDA-193 to KDA-199) is implemented and in review** as one stack of PRs, each verified on a clean `pnpm install --frozen-lockfile` + check + test + build, code-reviewed, and with review fixes applied:

    | PR  | Issue                                              | Base   |
    | --- | -------------------------------------------------- | ------ |
    | #14 | KDA-196 BFS chase AI                               | `main` |
    | #15 | KDA-195 level data format and loader               | #14    |
    | #16 | KDA-194 input action layer                         | #15    |
    | #17 | KDA-193 fixed-tick game loop (+ stack integration) | #16    |
    | #18 | KDA-199 canvas renderer with animated movement     | #17    |
    | #19 | KDA-197 game state machine                         | #18    |
    | #20 | KDA-198 score and lives                            | #19    |

- **To land it:** merge #14 → #20 in order with merge commits, back to back (#16 alone changes movement to one cell per press, and every push to `main` deploys). Before deleting each merged branch, retarget the next PR to `main` (see CLAUDE.md). Then mark the issues Done in Linear.
- Not yet play-tested end to end in a browser; worth a manual pass (`pnpm dev`) for movement feel and speeds.

## Next

- **Milestone "Stages"** is next: start with KDA-200 (stage select with unlocks; the screen machine in `src/flow.ts` already has a stage select), then the stage issues KDA-203 to KDA-207.
- Follow-ups noted on issues: a runtime shape check for untrusted level JSON (KDA-225), lifting the 2-enemy cap (KDA-202), and maybe a short "ready" pause or a lost-life signal after a respawn (KDA-198 comment).
- Later milestones (Characters & breaths, Controllers & local 2-player, Polish) and an idea backlog (KDA-223 to KDA-227) are in Linear.

## Decisions already made

- **Gameplay:** grid-based movement with smooth animation (not free movement); each character has a signature breath plus one stat; breaths use an energy meter refilled by eating dots; local 2-player has both co-op and versus; stages unlock in order.
- **Code:** the swap-collision check in `collides()` now matters: on the fixed-tick loop all moves in a tick apply together, so a player and enemy swapping cells never share one; an unknown AI type throws; `GameState.intervalId` is gone (the rAF loop in `main.ts` replaced `setInterval`).
- **Collisions** are checked once per tick against start-of-tick positions (not `lastPos`, which may be from an older tick), and enemies aim at the player's start-of-tick cell.
- **Tap buffer:** the newest freshly pressed direction is kept in `GameState.bufferedStep` and tried first at the player's next move opportunity, falling back to the held directions if blocked; it is cleared at that opportunity either way. This stops quick taps made mid-move from being lost.
- **Held directions are an ordered fallback:** `MoveInput.held` lists every held direction, newest first (`PlayerInput.heldSteps()`, held keys only; taps go through the buffer). The player tries the buffered step, then each held direction in order, so pressing a turn early while still holding the old direction doesn't stop the player at a wall.
- **Start of a game:** the player is ready to move on the first tick (`moveProgress` starts at 1); enemies start at 0, which gives the player a short grace period.
- **Move progress** keeps the leftover past 1 when a character moves, so speeds that don't divide the 60 Hz tick rate average out right. A character that is ready but can't move waits at exactly 1 and banks nothing.
- **Level 1 speeds:** player 4 cells/s, enemies 2 cells/s (the defaults, applied only in `createCharacter`; level 1 sets no speeds). Levels may override `playerSpeed` and per-enemy `speed`, up to `TICK_RATE` (one cell per tick).
- **Screens** (`src/flow.ts`, a DOM-free state machine driven by `main.ts`): the game opens on the title screen, then stage select, then play (product decision, kept). Retry is pre-selected on both end screens (stage clear and game over), so Space retries straight away (kept). `GameState.locked` is gone: the game is only stepped in `playing`, and the machine leaves `playing` on the tick the game ends, so nothing in a finished game changes afterwards (except moveProgress settling during the `ending` outro, see below). Screens without a game (title, stage select) show an empty canvas.
- **Score and lives** live in `GameState` (`score`, `lives`, plus `spawns` for respawning). A dot is worth `DOT_POINTS` (10); a game starts with `START_LIVES` (3). A collision with lives left costs one and respawns everyone at their spawns in the same tick (player ready, enemies back in their grace period, tap buffer cleared), keeping dots and score; `step` returns no outcome for it. A collision on the last life is "dead". Eating the last dot always wins, even if the player is caught on that same tick (no life lost; product decision). The end screens show the final score; retry starts a fresh game.
- **End of a game is seen, not jumped to:** the dot the player just ate stays drawn (`GameState.eatenAt`, `eatenDotVisible` in `glide.ts`) until the player's glide is halfway onto it, and a game that ends (won or lost) goes through a short `ending` screen in `flow.ts` where nothing is stepped and input is ignored; only `settle()` raises moveProgress so the glides finish, then the end screen, overlay and confetti follow. `ending` is never auto-paused.
- **Auto-pause:** during play, a window `blur` or the tab becoming hidden (`visibilitychange` with `document.hidden`) switches to the paused screen (`pauseIfPlaying` in `flow.ts`, wired in `main.ts`).
- **Tooling:** CI uses `setup-vp` with `run-install: false` and runs on PRs only; pnpm 10 pinned.

## How we work

- The main session acts as PM: it creates and updates Linear issues, delegates each issue to an agent in its own git worktree, verifies the agent's result itself (clean `pnpm install --frozen-lockfile`, check, test, build), and comments the outcome on the issue.
- One branch per issue, stacked when dependent. Agents commit but don't push unless asked.
- Review: run `/code-review` per branch or have a reviewer session leave PR comments. Clear bugs are fixed directly; judgment calls go to the user. Fixes are added as new commits, then branches above are rebased and force-pushed, and each comment gets a reply with the fixing commit and is resolved.
- Only findings deferred past the PR become Linear issues or comments on existing issues.
- Disk space is tight: remove agent worktrees and temporary build copies when done.
