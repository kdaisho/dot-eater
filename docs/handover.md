# Handover

Last updated: 2026-10-26. Read `CLAUDE.md` first for project conventions.

## Where things stand

- **Milestone 1 "Organize code & tooling"** is done and live (PRs #2–#12).
- **Milestone 2 "Engine foundations"** is done and live (PRs #14–#20, all KDA-193 to KDA-199 Done in Linear), plus the fix #21 (the last move finishes before the end screen). `main` is at the #21 merge; 275 tests.
- The game now has: a 60 Hz fixed-tick loop, an input action layer, ASCII level files, BFS chase AI, a canvas renderer with gliding movement and a HUD, a screen state machine (title → stage select → playing ⇄ paused → ending → stage clear / game over), and score and lives. There is one level, Stage 1 "Classic" (`src/levels/stage1.ts`, 17x15).
- **Next: milestone "Stages"** (KDA-200 to KDA-207). Nothing started yet.

## Code map

| Module                                 | What it does                                                                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`                              | Entry and wiring: loop, input, screen machine, renderer, overlays; the only place with listeners and timers                                           |
| `loop.ts`                              | Fixed-timestep loop (`createLoop`), clock and frame scheduler injected                                                                                |
| `flow.ts`                              | Screen state machine (`Screen` union, `update`, `pauseIfPlaying`); only `playing` steps the game                                                      |
| `game.ts`                              | `GameState`, `createGameState(level)`, `step(state, dt, move, random)`, collisions, score, lives, respawn, `settle`                                   |
| `ai.ts`, `path.ts`                     | Enemy AI (`random`, `chase`); BFS `distanceMap` and `openNeighbours` (wrap-aware)                                                                     |
| `level.ts`, `levels/`                  | Level format (`LevelData`: name, ASCII `map`, enemies with `ai` and `speed`), `parseLevel` with validation; `levels/index.ts` lists the parsed levels |
| `input.ts`                             | Actions (`up/down/left/right/breath/pause/confirm`), `InputState`/`PlayerInput`, `KeyboardSource` (P1 arrows, P2 WASD defined)                        |
| `render.ts`, `glide.ts`, `layout.ts`   | Canvas renderer (`createRenderer` → `draw(state, alpha, hud)`, `clear`, `resize`), glide maths, layout/DPR maths                                      |
| `ui.ts`                                | DOM overlays, one per screen (`showTitle`, `showStageSelect`, `showPause`, `showStageClear`, `showGameOver`), confetti                                |
| `constants.ts`, `character.ts`, `vec2` | Cells, AI types, character ids (`player`, `enemy1`, `enemy2`), tick rate, speeds, points, lives                                                       |

## Next milestone: Stages

"5 stages, each built around one idea, unlocked one after another. Includes star ratings, best scores, and new enemy types." All issues are in Linear with checklists and "blocked by" links.

| Issue   | Title                                     | Blocked by (open)   | Main files                                                           |
| ------- | ----------------------------------------- | ------------------- | -------------------------------------------------------------------- |
| KDA-200 | Stage select screen with unlocks          | —                   | `flow.ts`, `ui.ts`, new progress storage (`localStorage`, try/catch) |
| KDA-201 | Star ratings and best scores per stage    | — (uses 200's save) | `game.ts` (clear time), progress storage, `ui.ts`                    |
| KDA-202 | New enemy types                           | Splitter: KDA-208   | `ai.ts`, `constants.ts`, `level.ts` (patroller routes), `render.ts`  |
| KDA-203 | Stage 1: Classic                          | —                   | `levels/`                                                            |
| KDA-204 | Stage 2: Wrap maze (ambusher enemy)       | KDA-202 (ambusher)  | `levels/`                                                            |
| KDA-205 | Stage 3: Ice rink (ice tile, sliding)     | —                   | `level.ts` (new tile), `game.ts` (sliding), `render.ts`              |
| KDA-206 | Stage 4: Fog (visibility, phantom enemy)  | KDA-202 (phantom)   | `render.ts` (fog), `levels/`                                         |
| KDA-207 | Stage 5: Boss lair (2×2 boss with health) | KDA-208, KDA-202    | needs the breath system from "Characters & breaths", so it waits     |

Suggested order:

1. **First, in Linear:** split the Splitter checkbox out of KDA-202 into its own issue blocked by KDA-208 (breath system), so KDA-202 can finish now. KDA-207 also stays parked until KDA-208 is done.
2. **Batch 1, in parallel:** KDA-200 (stage select + unlocks), KDA-202 (ambusher, patroller, phantom; lift the 2-enemy cap), KDA-203 (stage 1 level). Overlap: `levels/index.ts` (203 adds a level; 200 reads the list) is small. 202 touches `constants.ts` (`CharacterId`, `ENEMY_IDS`), `level.ts` and `render.ts` sprites.
3. **Batch 2:** KDA-201 (on top of 200), KDA-204 and KDA-206 (on top of 202), KDA-205 (independent, but it changes movement in `game.ts`, so keep it out of parallel work on `game.ts`).

Questions to settle with the user before starting (product decisions):

- Does Stage 1 "Classic" replace today's level 1, or stay alongside it?
- Stage select before all 5 stages exist: show only real stages, or show locked placeholders for the missing ones?
- KDA-201 star thresholds (time and lives left per star).
- Saved progress: a versioned `localStorage` key, and what happens when a save from an older version is found.

Follow-ups already noted on issues: a runtime shape check for untrusted level JSON (KDA-225); maybe a short "ready" pause or a lost-life signal after a respawn (KDA-198 comment).

Later milestones (Characters & breaths, Controllers & local 2-player, Polish) and an idea backlog (KDA-223 to KDA-227) are in Linear.

## Decisions already made

- **Gameplay:** grid-based movement with smooth animation (not free movement); each character has a signature breath plus one stat; breaths use an energy meter refilled by eating dots; local 2-player has both co-op and versus; stages unlock in order.
- **Code:** the swap-collision check in `collides()` matters: all moves in a tick apply together, so a player and enemy swapping cells never share one. An unknown AI type throws.
- **Collisions** are checked once per tick against start-of-tick positions (not `lastPos`, which may be from an older tick), and enemies aim at the player's start-of-tick cell.
- **Chase AI** scores each forward candidate by BFS distance to the player with the enemy's own cell blocked, so the no-reverse rule can't send it into a dead end. Ties go to direction order; an unreachable player falls back to the first candidate.
- **Levels:** typed `.ts` modules exporting plain JSON-serializable `LevelData`. Map characters: `#` wall, `.` dot, space empty, `P` player spawn, `E` enemy spawn (starts on a dot). Enemies pair with `E`s in reading order. The map is the only source of dots. `parseLevel` rejects: no dots, unreachable dots, an open edge cell that wraps into a wall, wrong spawn counts, more than 2 enemies (the current `CharacterId` cap), speeds above `TICK_RATE`.
- **Input:** keys are matched by `KeyboardEvent.code`. P1: arrows, ShiftRight breath, P/Escape pause, Space confirm. P2 (defined, not attached): WASD, ShiftLeft, Q, E. Auto-repeat never presses; a missed keyup or keydown recovers on the next keydown.
- **Tap buffer:** the newest freshly pressed direction is kept in `GameState.bufferedStep` and tried first at the player's next move opportunity, then the held directions; it is cleared at that opportunity either way.
- **Held directions are an ordered fallback:** `MoveInput.held` lists every held direction, newest first (`PlayerInput.heldSteps()`), so pressing a turn early while still holding the old direction doesn't stop the player at a wall.
- **Start of a game:** the player is ready to move on the first tick (`moveProgress` 1); enemies start at 0, a short grace period.
- **Move progress** keeps the leftover past 1 when a character moves, so speeds that don't divide 60 Hz average out right. A character that is ready but can't move waits at exactly 1.
- **Speeds:** player 4 cells/s, enemies 2 cells/s by default (applied only in `createCharacter`); levels may override `playerSpeed` and per-enemy `speed`.
- **Rendering:** characters glide from `lastPos` to `pos`, lagging at most one cell behind the logic. Wrap tunnels slide (the sprite is drawn on both edges, clipped). The HUD strip is above the maze: score left, lives right, middle reserved for the energy meter.
- **Screens:** the game opens on title → stage select → play (product decision). Retry is pre-selected on both end screens. The game is only stepped in `playing`; nothing in a finished game changes afterwards except moveProgress settling in `ending`. Screens without a game show an empty canvas. Each screen change uses a whole tick and presses are cleared every tick, so menu presses never reach the game.
- **Score and lives:** `DOT_POINTS` 10, `START_LIVES` 3. A collision with lives left costs one and respawns everyone at their spawns in the same tick, keeping dots and score. A collision on the last life is game over. Eating the last dot always wins, even if caught on that tick (product decision).
- **End of a game is seen, not jumped to:** the dot the player just ate stays drawn (`GameState.eatenAt`) until the player's glide is halfway onto it, and a finished game goes through the `ending` screen (only `settle()` runs, input ignored, never auto-paused) before the end screen and confetti.
- **Auto-pause:** during play, window `blur` or a hidden tab switches to the paused screen.
- **Tooling:** CI uses `setup-vp` with `run-install: false` and runs on PRs only; pnpm 10 pinned.

## How we work

- The main session acts as PM: it creates and updates Linear issues, delegates each issue to an agent in its own git worktree, verifies the agent's result itself, and comments the outcome on the issue. Product and judgment calls go to the user (ask, with a recommendation).
- **Verify on a clean copy:** `git archive <sha> | tar -x -C <scratch dir>`, then `pnpm install --frozen-lockfile`, check, test, build. Treat empty `pnpm check` output as a failure: a fresh worktree has no `node_modules` until `pnpm install` runs.
- **Agent worktrees** (`isolation: "worktree"`) live in `.claude/worktrees/agent-*` on a `worktree-agent-*` branch. Brief the agent to create the real branch (`git checkout -b KDA-NNN/... <base>`). When done: `git worktree remove` it and delete its `worktree-agent-*` branch; the real branch stays. Review agents may leave `prNN` refs from `fetch pull/NN/head`; delete them.
- One branch per issue, stacked when dependent. Agents commit but don't push; the PM pushes and opens the PRs. Give each agent the contract it must keep with parallel work (who owns which file, the API the other side will call) to keep rebase conflicts small.
- **Review:** run `/code-review` per PR with a subagent (report only), then fix clear bugs as new commits on the right branch, rebase the branches above, force-push with `--force-with-lease`, and comment the fixes on each PR. Only findings deferred past the PR become Linear issues or comments.
- **Merging a stack:** for each PR in order: merge with a merge commit (`gh api -X PUT repos/kdaisho/dot-eater/pulls/N/merge -f merge_method=merge`), retarget the next PR to `main`, then delete the merged branch. Then mark the issues Done and watch the Pages deploy.
- Shell is zsh: write `${B}:path`, not `$B:path` (zsh reads `:s`/`:p` as modifiers).
- Disk space is tight: remove agent worktrees and temporary build copies when done.
