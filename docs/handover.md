# Handover

Last updated: 2026-10-26. Read `CLAUDE.md` first for project conventions.

## Where things stand

- **Milestone 1 "Organize code & tooling"** is done and live (PRs #2–#12).
- **Milestone 2 "Engine foundations"** is done and live (PRs #14–#20, all KDA-193 to KDA-199 Done in Linear), plus the fix #21 (the last move finishes before the end screen).
- The game now has: a 60 Hz fixed-tick loop, an input action layer, ASCII level files, BFS chase AI, a canvas renderer with gliding movement and a HUD, a screen state machine (title → stage select → playing ⇄ paused → ending → stage clear / game over), score and lives, star ratings with best stars and times, fog, and ice with sliding. Four stages are live, unlocked in order: 1 "Classic", 2 "Wrap maze", 3 "Ice rink", 4 "Fog" (`src/levels/stage1.ts`–`stage4.ts`, all 17x15).
- **Milestone "Stages": stages 1–4 are done and live.** Batch 1: PRs #23–#25 (KDA-203 Stage 1, KDA-200 stage select with unlocks, KDA-202 new enemy types). Batch 2: #29 (KDA-201 stars and bests), #27 (KDA-204 Stage 2), #28 (KDA-206 fog, Stage 4), #30 (KDA-205 ice, Stage 3, and Stage 4 registered). Follow-ups: #32 (KDA-230 ice-aware enemy pathing), #33 (KDA-231 collisions on drawn positions), #34 (KDA-232 a sprite per enemy type), then #35 (handover). Code is unchanged since #34: 562 tests, no open code PRs.
- **What's left in Stages** waits on the breath system (KDA-208): KDA-207 Boss lair and KDA-229 Splitter.
- **Next: milestone "Characters & breaths"**, starting now. See "Current milestone" below. Nothing in it has started: no branches, no code, every issue in Backlog.

### Start here (new session)

1. Read this file and `CLAUDE.md`. Then read KDA-208, KDA-209 and KDA-216–220 in Linear: the per-character breath specs are there.
2. Settle the open product questions below with the user (ask, with a recommendation). Write the answers into the Linear issues and into "Decisions already made" here.
3. Run KDA-208 alone. Once it's merged, run KDA-209 and KDA-216–220 in parallel, plus KDA-229 and then KDA-207 for Stages.

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

## Current milestone: Characters & breaths

Five playable animals, each with a signature breath and one stat. Breaths spend energy from a meter that eating dots refills. A character select screen sits between stage select and play.

| Issue   | Title                                    | Blocked by | Linear spec (summary)                                                                                                             | Main files (expected)                                              |
| ------- | ---------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| KDA-208 | Add a breath system with an energy meter | —          | Checklist: facing, `breath` action, energy meter in HUD, breath definition, timed tile/enemy effects, respawn of defeated enemies | `game.ts`, new `breath.ts`, `character.ts`, `render.ts`, `main.ts` |
| KDA-209 | Add a character select screen            | KDA-208    | Checklist: after stage select; cards show emoji, breath, stat; remembers last pick; 2-player picking later                        | `flow.ts`, `ui.ts`, `progress.ts` or own storage key               |
| KDA-216 | Dragon 🐉, fire breath                   | KDA-208    | Line; defeats the first enemy hit; passed cells burn 2 s and block enemies. Stat: balanced (default)                              | breath definition + tile effect                                    |
| KDA-217 | Penguin 🐧, ice breath                   | KDA-208    | Cone; freezes enemies 3 s; frozen floor becomes slippery (reuses ice). Stat: slides farther/faster on ice                         | breath + `ice.ts`                                                  |
| KDA-218 | Owl 🦉, wind breath                      | KDA-208    | Pushes every enemy in a line back 3 cells, through tunnels; doesn't defeat. Stat: low cost, short cooldown                        | breath + enemy displacement                                        |
| KDA-219 | Skunk 🦨, smelly breath                  | KDA-208    | Stink cloud on the surrounding area 5 s; enemies won't enter and turn around inside. Stat: bigger meter                           | breath + tile effect + `ai.ts`                                     |
| KDA-220 | Boar 🐗, wall-break breath               | KDA-208    | Breaks the wall in front; regrows after 10 s, pushing out anything inside; outer walls unbreakable. Stat: high cost, slower       | breath + `cells` changes                                           |

**Still open with the user (not decided):** these are the PM's suggested defaults, written up for the user but not yet asked. Don't treat them as decisions.

- **Energy economy.** Suggested: a meter of 100, +5 per dot, Dragon costs 50 (about 10 dots), Owl 25, Boar 75, Skunk's meter 150. The meter starts empty each stage and is kept when a life is lost. Alternatives: +10 per dot, or starting full.
- **The fly 🪰** (today's player sprite). Suggested: retire it, with the Dragon as the default character (KDA-216 already says "default"). Alternatives: keep it as a breathless "classic" pick, or make it a sixth character.
- **Defeated enemies.** Suggested: they come back at their spawn after 5 s, with a short blink before they reappear. Alternatives: 10 s, or gone for the stage.
- **Penguin's ice.** Suggested: temporary ice that melts after 5 s, using Stage 3's slide rules. Alternatives: permanent ice, or freeze enemies only.
- **Also undecided:**
    - whether a breath has a cooldown on top of its cost, and how long;
    - whether breath kills score points;
    - whether stars or par change with the character (par times were set without breaths);
    - whether the player can breathe while sliding;
    - the default facing before the first move.

**Engineering notes for KDA-208** (checked against the code at the #35 merge):

- **No facing yet.** The player's heading is only implied by `pos - lastPos`, which is zero before the first move and must be unwrapped across tunnels (see `wrapDelta` in `glide.ts`). KDA-208 needs an explicit facing that survives waiting against a wall.
- **The breath key does nothing yet.** `breath` is mapped in `input.ts` (ShiftRight for P1, ShiftLeft for P2) but nothing reads it: `step(state, dt, move, random)` takes only a `MoveInput`. Pass the breath press in alongside, keeping game logic DOM-free.
- **The HUD has a free slot.** The middle of the strip is reserved for the energy meter (`render.ts`, the HUD comment).
- **Grids change during a game for the first time.** `GameState.ice` is documented as "never changes during a game", and `hasIce` caches per ice-grid object in a `WeakMap` (`ice.ts`). The Penguin's temporary ice and the Boar's broken walls change grids mid-game. Either replace the grid object when it changes or drop the cache, and update that comment. AI distance maps are computed every tick from `cells`, so wall changes are picked up.
- **Run-time strand risk.** `parseLevel` checks reachability and slide stranding only at load. Temporary ice and regrowing walls can create states those checks never saw. The Boar's regrow "pushes out" is the spec's answer for walls; decide the same for ice under a character.
- **Respawn.** Defeated enemies respawn alone after a delay, unlike `respawn()` in `game.ts`, which resets everyone after the player is caught. A patroller restarts its route on respawn.
- **Collisions.** These use drawn positions (see Decisions). A defeated or frozen enemy needs a clear rule: it should probably not catch the player, and a frozen one probably still blocks.
- **A contract for parallel work.** Have KDA-208 define a character/breath registry (one definition object per character: emoji, stat, breath shape, range, cost, cooldown, effect hooks) and land one breath end to end, at least as a test fixture. Then KDA-216–220 can each add one file plus tests with few rebase conflicts, and KDA-209 can read the registry for its cards.
- **Previews.** Breaths are all feel: offer the user a playable preview (see How we work) before asking to merge any of these.

## Previous milestone: Stages

"5 stages, each built around one idea, unlocked one after another. Includes star ratings, best scores, and new enemy types." Stages 1–4 are done. KDA-207 and KDA-229 remain and wait on KDA-208.

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
| KDA-230 | Ice-aware enemy pathing and patrol checks | Done (#32)          | `ai.ts`, `level.ts`, `ice.ts`                                    |
| KDA-231 | Collisions on drawn positions             | Done (#33)          | `game.ts`, `glide.ts`, `constants.ts`                            |
| KDA-232 | A sprite per enemy type                   | Done (#34)          | `render.ts`                                                      |

Still open with the user: after a win, "Stage select" puts the cursor on the stage just played, not the newly unlocked one.

Follow-ups already noted on issues: a runtime shape check for untrusted level JSON (KDA-225); maybe a short "ready" pause or a lost-life signal after a respawn (KDA-198 comment); the phantom ignores wrap tunnels (Stage 4 has none); a fog test case for levels with tunnels (`fogWrap` treats a whole axis as wrapping).

Later milestones (Controllers & local 2-player: KDA-210, 211, 221, 222; Polish: KDA-212 to 215) and an idea backlog (KDA-223 to KDA-227) are in Linear. 2-player will give each player their own character, facing and energy, so keep breath state per character, not global.

## Decisions already made

- **Gameplay:** grid-based movement with smooth animation (not free movement); each character has a signature breath plus one stat; breaths use an energy meter refilled by eating dots; local 2-player has both co-op and versus; stages unlock in order.
- **Code:** an unknown AI type throws.
- **Collisions** (KDA-231, product decision) are on drawn positions, not cells: cells change the instant a move starts while sprites glide, so cell checks caught the player before the sprites touched. A character's collision position is its glide position (`drawnPos`: `lastPos` to `pos` by `moveProgress` capped at 1, no frame alpha). The player is caught when an enemy comes within `CATCH_DISTANCE` (0.6; sprites are `SPRITE_SCALE` 0.8 wide) at any moment of the tick: each character's path within a tick is one segment, or two when it moves mid-tick (to its old cell's centre, then out), and the closest approach over the combined pieces is exact and wrap-aware (`wrapDelta`). Any touch is a catch, including running into an enemy from behind (product decision). This replaced the shared-cell and swap checks. Enemies still aim at the player's start-of-tick cell; a chaser standing on the player's logical cell (the player's sprite still gliding in) aims at the player's `lastPos`.
- **Chase AI** scores each forward candidate by BFS distance to the player with the enemy's own cell blocked, so the no-reverse rule can't send it into a dead end. Ties go to direction order; an unreachable player falls back to the first candidate. On levels with ice the distance is slide-aware (`slideDistances` in `ice.ts`: a backward BFS over cell plus slide-heading states, where passing over the target mid-slide counts); on levels without ice (`hasIce`, cached per grid) it uses plain `distanceMap`, which gives identical choices.
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
- **Enemy types:** up to 4 enemies. Ambusher aims `AMBUSH_AHEAD` (4) cells ahead along the player's latest move (straight line, no wrap; walks back to the first open cell, else the player; the player itself when it has no heading or the ambusher already stands on the aim point) and reuses chase scoring. Patroller follows a looped `route: [[x, y], ...]` by shortest path, may turn back, restarts the route on respawn. Phantom ignores walls, stays on the map, doesn't use tunnels, and defaults to `PHANTOM_SPEED` (1.5). Sprites follow the AI type, not the enemy slot (`ENEMY_SPRITES: Record<AiType, string>`): random 👺, chase 👹, ambusher 🦊, patroller 🤖, phantom 👻; the player is 🪰.
- **Stars and bests:** 1 star for clearing, +1 for losing no lives, +1 for a clear time at or under the level's `parTime` (par rounded to whole ticks). Clear time is `GameState.ticks`, counted only by `step()`, so pauses and the ending outro don't count; shown as `m:ss.s`, rounded up. Bests are per stage in the v1 save as `stars` (max) and `bestTime` (min, ticks); merging with another tab keeps the better of each. Par times so far: 60, 70, 80, 75 s.
- **Fog:** `rules.fog.radius` (cells, at least 1.5) is purely visual. Things wholly outside the radius around the player's gliding position aren't drawn, and a radial-gradient darkness with a 1.5-cell soft edge covers the rest; the HUD stays visible. Distance is wrap-aware when the map has tunnels.
- **Ice:** a separate ice grid beside the cells. A character is sliding when it stands on ice, its latest move was one cell and the next cell that way isn't a wall; it then moves that way on its normal move turns, ignoring input and AI, and stops on normal floor or against a wall. Slides go through tunnels and eat dots. A mid-slide tap stays buffered until the first free move. The phantom floats (never slides). A patroller reaches an ice waypoint it slides onto or is carried off. Chase, ambusher and patroller pathing are slide-aware (KDA-230), and `parseLevel` walks each patrol route slide-aware and reports the first leg sliding makes impossible.
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
- The shell safety check blocks `rm -rf $VAR/...` on unguarded variables: write `rm -rf "${VAR:?}/..."`.
- In Linear, a bare "PR #N" auto-links to a PR in another repo; write the full GitHub URL.
- **Previews for the user:** offer one for every gameplay or visual PR before asking to merge. The user judges feel by playing, and that's how KDA-231 and KDA-232 were found. Use a detached worktree (`.claude/worktrees/preview-*`) on the PR branch, local-only edits there (e.g. a stage moved first in `levels`), `pnpm dev --port 5199 --strictPort` in the background, `open` the URL. Never commit preview edits; remove the worktree and stop the server afterwards. Tell review agents to judge only the committed PR, since they may notice preview worktrees.
- An agent can't check out a branch another worktree holds: remove your own rebase/fix worktrees before briefing an agent to work on that branch.
- The user may merge docs PRs themselves: check `merged` before adding to an open docs PR.
