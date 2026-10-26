# Handover

Last updated: 2026-10-26. Read `CLAUDE.md` first for project conventions.

## Where things stand

- **Milestone 1 "Organize code & tooling"** is done and live (PRs #2–#12).
- **Milestone 2 "Engine foundations"** is done and live (PRs #14–#20, all KDA-193 to KDA-199 Done in Linear), plus the fix #21 (the last move finishes before the end screen).
- The game now has: a 60 Hz fixed-tick loop, an input action layer, ASCII level files, BFS chase AI, a canvas renderer with gliding movement and a HUD, a screen state machine (title → stage select → playing ⇄ paused → ending → stage clear / game over), score and lives, star ratings with best stars and times, fog, and ice with sliding. Four stages are live, unlocked in order: 1 "Classic", 2 "Wrap maze", 3 "Ice rink", 4 "Fog" (`src/levels/stage1.ts`–`stage4.ts`, all 17x15).
- **Milestone "Stages": stages 1–4 are done and live.** Batch 1: PRs #23–#25 (KDA-203 Stage 1, KDA-200 stage select with unlocks, KDA-202 new enemy types). Batch 2: #29 (KDA-201 stars and bests), #27 (KDA-204 Stage 2), #28 (KDA-206 fog, Stage 4), #30 (KDA-205 ice, Stage 3, and Stage 4 registered). `main` is at the #30 merge; 533 tests.
- **What's left in Stages** waits on the breath system (KDA-208, milestone "Characters & breaths"): KDA-207 Boss lair and KDA-229 Splitter. KDA-230 (ice-aware enemy pathing) is a backlog follow-up.

## Code map

| Module                                 | What it does                                                                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`                              | Entry and wiring: loop, input, screen machine, renderer, overlays; the only place with listeners and timers                                                                         |
| `loop.ts`                              | Fixed-timestep loop (`createLoop`), clock and frame scheduler injected                                                                                                              |
| `flow.ts`                              | Screen state machine (`Screen` union, `update`, `pauseIfPlaying`); only `playing` steps the game                                                                                    |
| `progress.ts`                          | Saved progress (`STAGE_COUNT`, unlocks, bests, `stageSlots`, `recordClear`); storage injected, every access in try/catch                                                            |
| `stars.ts`                             | Star rating (`rateClear`), star text, clear-time and par formatting                                                                                                                 |
| `ice.ts`, `fog.ts`                     | Sliding (`slideStep`) and the slide-aware movement graph (`slideReach`); wrap-aware fog distance and light centres for the renderer                                                 |
| `game.ts`                              | `GameState`, `createGameState(level)`, `step(state, dt, move, random)`, collisions, sliding, score, lives, ticks, respawn, `settle`                                                 |
| `ai.ts`, `path.ts`                     | Enemy AI (`random`, `chase`, `ambusher`, `patroller`, `phantom`); BFS `distanceMap` and `openNeighbours` (wrap-aware)                                                               |
| `level.ts`, `levels/`                  | Level format (`LevelData`: name, ASCII `map`, `parTime`, enemies with `ai`, `speed`, `route`, `rules.fog`), `parseLevel` with validation; `levels/index.ts` lists the parsed levels |
| `input.ts`                             | Actions (`up/down/left/right/breath/pause/confirm`), `InputState`/`PlayerInput`, `KeyboardSource` (P1 arrows, P2 WASD defined)                                                      |
| `render.ts`, `glide.ts`, `layout.ts`   | Canvas renderer (`createRenderer` → `draw(state, alpha, hud, rules)`, `clear`, `resize`; ice and fog), glide maths, layout/DPR maths                                                |
| `ui.ts`                                | DOM overlays, one per screen (`showTitle`, `showStageSelect`, `showPause`, `showStageClear`, `showGameOver`), confetti                                                              |
| `constants.ts`, `character.ts`, `vec2` | Cells, AI types, character ids (`player`, `enemy1`–`enemy4`), tick rate, speeds, points, lives                                                                                      |

## Current milestone: Stages

"5 stages, each built around one idea, unlocked one after another. Includes star ratings, best scores, and new enemy types." All issues are in Linear with checklists and "blocked by" links.

| Issue   | Title                                     | Status / blocked by | Main files                                                       |
| ------- | ----------------------------------------- | ------------------- | ---------------------------------------------------------------- |
| KDA-200 | Stage select screen with unlocks          | Done (#24)          | `flow.ts`, `ui.ts`, `progress.ts`                                |
| KDA-201 | Star ratings and best scores per stage    | Done (#29)          | `stars.ts`, `game.ts` (ticks), `progress.ts`, `ui.ts`            |
| KDA-202 | New enemy types                           | Done (#25)          | `ai.ts`, `constants.ts`, `level.ts`, `render.ts`                 |
| KDA-203 | Stage 1: Classic                          | Done (#23)          | `levels/`                                                        |
| KDA-204 | Stage 2: Wrap maze (ambusher enemy)       | Done (#27)          | `levels/`                                                        |
| KDA-205 | Stage 3: Ice rink (ice tile, sliding)     | Done (#30)          | `ice.ts`, `level.ts`, `game.ts`, `render.ts`, `levels/`          |
| KDA-206 | Stage 4: Fog (visibility, phantom enemy)  | Done (#28, #30)     | `fog.ts`, `render.ts`, `level.ts` (rules), `levels/`             |
| KDA-207 | Stage 5: Boss lair (2×2 boss with health) | KDA-208, KDA-229    | needs the breath system from "Characters & breaths", so it waits |
| KDA-229 | Splitter enemy (split out of KDA-202)     | KDA-208             | `ai.ts`, `game.ts`                                               |
| KDA-230 | Ice-aware enemy pathing and patrol checks | Backlog             | `ai.ts`, `level.ts`, `ice.ts`                                    |

Still open with the user: after a win, "Stage select" puts the cursor on the stage just played, not the newly unlocked one.

Follow-ups already noted on issues: a runtime shape check for untrusted level JSON (KDA-225); maybe a short "ready" pause or a lost-life signal after a respawn (KDA-198 comment); the phantom ignores wrap tunnels (Stage 4 has none); a fog test case for levels with tunnels (`fogWrap` treats a whole axis as wrapping).

Later milestones (Characters & breaths, Controllers & local 2-player, Polish) and an idea backlog (KDA-223 to KDA-227) are in Linear.

## Decisions already made

- **Gameplay:** grid-based movement with smooth animation (not free movement); each character has a signature breath plus one stat; breaths use an energy meter refilled by eating dots; local 2-player has both co-op and versus; stages unlock in order.
- **Code:** the swap-collision check in `collides()` matters: all moves in a tick apply together, so a player and enemy swapping cells never share one. An unknown AI type throws.
- **Collisions** are checked once per tick against start-of-tick positions (not `lastPos`, which may be from an older tick), and enemies aim at the player's start-of-tick cell.
- **Chase AI** scores each forward candidate by BFS distance to the player with the enemy's own cell blocked, so the no-reverse rule can't send it into a dead end. Ties go to direction order; an unreachable player falls back to the first candidate.
- **Levels:** typed `.ts` modules exporting plain JSON-serializable `LevelData`. Map characters: `#` wall, `.` dot, space empty, `~` ice, `:` ice with a dot, `P` player spawn, `E` enemy spawn (starts on a dot). Enemies pair with `E`s in reading order. The map is the only source of dots. `parseLevel` rejects: no dots, unreachable dots, an open edge cell that wraps into a wall, wrong spawn counts, more than 4 enemies (the `ENEMY_IDS` cap), bad patroller routes, speeds above `TICK_RATE`, a `parTime` that isn't positive whole tenths of a second, bad `rules` (unknown keys, fog radius below 1.5), and (slide-aware) any reachable state from which sliding can strand the player away from the spawn.
- **Input:** keys are matched by `KeyboardEvent.code`. P1: arrows, ShiftRight breath, P/Escape pause, Space confirm. P2 (defined, not attached): WASD, ShiftLeft, Q, E. Auto-repeat never presses; a missed keyup or keydown recovers on the next keydown.
- **Tap buffer:** the newest freshly pressed direction is kept in `GameState.bufferedStep` and tried first at the player's next move opportunity, then the held directions; it is cleared at that opportunity either way.
- **Held directions are an ordered fallback:** `MoveInput.held` lists every held direction, newest first (`PlayerInput.heldSteps()`), so pressing a turn early while still holding the old direction doesn't stop the player at a wall.
- **Start of a game:** the player is ready to move on the first tick (`moveProgress` 1); enemies start at 0, a short grace period.
- **Move progress** keeps the leftover past 1 when a character moves, so speeds that don't divide 60 Hz average out right. A character that is ready but can't move waits at exactly 1.
- **Speeds:** player 4 cells/s, enemies 2 cells/s by default (applied only in `createCharacter`); levels may override `playerSpeed` and per-enemy `speed`.
- **Rendering:** characters glide from `lastPos` to `pos`, lagging at most one cell behind the logic. Wrap tunnels slide (the sprite is drawn on both edges, clipped). The HUD strip is above the maze: score left, lives right, middle reserved for the energy meter.
- **Screens:** the game opens on title → stage select → play (product decision). Retry is pre-selected on both end screens. The game is only stepped in `playing`; nothing in a finished game changes afterwards except moveProgress settling in `ending`. Screens without a game show an empty canvas. Each screen change uses a whole tick and presses are cleared every tick, so menu presses never reach the game.
- **Stages and progress:** stage 1 "Classic" replaced the old 9x9 level 1, which lives on as a test fixture (`OLD_LEVEL` in `src/test/helpers.ts`; map-dependent tests use it, not `levels[0]`). Stage select always shows `STAGE_COUNT` (5) slots: open, locked ("🔒 Name") or "Coming soon" when no level exists yet; the cursor lands on locked slots but confirm does nothing there. Progress is `{ version: 1, stages: [{ cleared, ...extra }] }` under `dot-eater:progress:v1`; bad JSON, another version or a wrong shape resets to empty (no migrations). Extra per-stage fields survive a load and save, for KDA-201. A win records the clear via `recordClear`, which merges what storage holds first, so another tab's clears aren't overwritten; a loss saves nothing.
- **Enemy types:** up to 4 enemies. Ambusher aims `AMBUSH_AHEAD` (4) cells ahead along the player's latest move (straight line, no wrap; walks back to the first open cell, else the player; the player itself when it has no heading or the ambusher already stands on the aim point) and reuses chase scoring. Patroller follows a looped `route: [[x, y], ...]` by shortest path, may turn back, restarts the route on respawn. Phantom ignores walls, stays on the map, doesn't use tunnels, and defaults to `PHANTOM_SPEED` (1.5).
- **Stars and bests:** 1 star for clearing, +1 for losing no lives, +1 for a clear time at or under the level's `parTime` (par rounded to whole ticks). Clear time is `GameState.ticks`, counted only by `step()`, so pauses and the ending outro don't count; shown as `m:ss.s`, rounded up. Bests are per stage in the v1 save as `stars` (max) and `bestTime` (min, ticks); merging with another tab keeps the better of each. Par times so far: 60, 70, 80, 75 s.
- **Fog:** `rules.fog.radius` (cells, at least 1.5) is purely visual. Things wholly outside the radius around the player's gliding position aren't drawn, and a radial-gradient darkness with a 1.5-cell soft edge covers the rest; the HUD stays visible. Distance is wrap-aware when the map has tunnels.
- **Ice:** a separate ice grid beside the cells. A character is sliding when it stands on ice, its latest move was one cell and the next cell that way isn't a wall; it then moves that way on its normal move turns, ignoring input and AI, and stops on normal floor or against a wall. Slides go through tunnels and eat dots. A mid-slide tap stays buffered until the first free move. The phantom floats (never slides). A patroller reaches an ice waypoint it slides onto or is carried off. Enemy BFS treats ice as floor (KDA-230).
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
