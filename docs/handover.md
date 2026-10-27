# Handover

Last updated: 2026-10-27. Read `CLAUDE.md` first for project conventions.

## Where things stand

- **Organize code & tooling** (#2–#12), **Engine foundations** (#14–#21), **Characters & breaths** (#37–#43) and **Stages** (#23–#34, #44, #46) are done and live.
- **Stages** finished with KDA-207 Stage 5 "Boss lair" (https://github.com/kdaisho/dot-eater/pull/46, merge `1a09e73`): a 2×2 boss 🐙 with health, plus a Splitter and a chaser. All five stages are live, unlocked in order.
- `main` is at `1a09e73`: 850 tests passing, Pages deploy green. No open PRs, no feature branches, no worktrees.
- Nothing is in progress. Open Linear issues: Controllers & local 2-player (KDA-210, 211, 221, 222), Polish (KDA-212–215), the idea backlog (KDA-223–227) and KDA-245, all in Backlog.

### Start here (new session)

1. Read this file and `CLAUDE.md`.
2. Ask the user which milestone is next. Recommend **Controllers & local 2-player**, starting with KDA-211 (two players in the game state and input), since the engine already keeps breath state per player in anticipation of it. The other option is **Polish** (KDA-212–215).
3. Read that milestone's issues in Linear, settle their product questions with the user (ask with a recommendation), and write the answers into the issues and into "Decisions already made".
4. Plan, delegate to agents in worktrees, verify, review, and offer a playable preview before asking to merge (see "How we work").

## Code map

| Module                                    | What it does                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`                                 | Entry and wiring: loop, input, screen machine, renderer, overlays; the only place with listeners and timers                                          |
| `loop.ts`                                 | Fixed-timestep loop (`createLoop`), clock and frame scheduler injected                                                                               |
| `flow.ts`                                 | Screen state machine (`Screen`, `update`, `startLevel`); only `playing` steps the game; game screens carry `animal`                                  |
| `progress.ts`, `lastPick.ts`              | Saved progress (unlocks, bests, `recordClear`); the last character pick. Storage injected, every access in try/catch                                 |
| `stars.ts`                                | Star rating (`rateClear`), clear-time and par formatting                                                                                             |
| `game.ts`                                 | `GameState`, `createGameState(level, animal)`, `step(state, dt, move, random)`, collisions, sliding, facing, `playerRate`, respawn, `settle`         |
| `breath.ts`                               | Breath engine: `BreathDef`, `resolveShape`, `breathe`, statuses, tile effects, `defeatEnemy`, `pushEnemy`, `tickEffects`, `enemyBlocks`, `energyHud` |
| `breaths/`                                | One `BreathDef` per animal plus `<animal>.test.ts`; `index.ts` maps `AnimalId` → `BREATHS`                                                           |
| `roster.ts`                               | `AnimalId`, `ANIMALS` (name, emoji, card text), `ANIMAL_IDS`, `DEFAULT_ANIMAL`, `isAnimalId`                                                         |
| `splitter.ts`                             | Splitter slots (main + spare), `splitSplitter`/`spread`, `halfDefeated`, `resetSplitter`, `GONE`                                                     |
| `boss.ts`                                 | The 2×2 boss (`GameState.boss`): `createBoss`, `bossFits`/`bossReach`/`bossMove`, `damageBoss`, `resetBoss`, footprint and collision helpers         |
| `ai.ts`, `path.ts`                        | Enemy AI (random, chase, ambusher, patroller, phantom, splitter), `blockedView`/`goalView`; BFS `distanceMap`, `openNeighbours`                      |
| `ice.ts`, `fog.ts`                        | Sliding (`slideStep`, `slideReach`, `slideDistances`); fog distance and light centres                                                                |
| `level.ts`, `levels/`                     | `LevelData` format, `parseLevel` validation; `levels/index.ts` lists stages 1–5                                                                      |
| `input.ts`                                | Actions, `InputState`/`PlayerInput` (`ignoreHeld`), `KeyboardSource`                                                                                 |
| `render.ts`, `glide.ts`, `layout.ts`      | Canvas renderer (maze, ice, fog, breath looks, HUD energy meter), glide maths, layout/DPR                                                            |
| `ui.ts`                                   | DOM overlays per screen (title, stage select, character select, pause, end screens), confetti                                                        |
| `constants.ts`, `character.ts`, `vec2.ts` | Cells, AI types, ids, tick rate, speeds, points, lives; the `Character` record                                                                       |

## Open questions and follow-ups

- **Boss lair tuning:** the user played the preview and kept the defaults (par 90 s, boss speed 1.5 cells/s, refill 10/s, Dragon fire and Skunk stink knocking the boss back). Two things to watch in later playtests: the arena doors are quite safe (a player in a door can breathe at the boss waiting at the mouth), and after a Boar wall regrows next to the boss the player lands beside it and can be caught right after.
- **Breath tuning:** the user hasn't commented on ranges and sizes (Dragon/Owl 5, Penguin cone 3, Skunk 3×3). A frozen Penguin enemy is solid, so refreezing every 1 s can block a 1-wide corridor for long.
- **Open with the user since Stages:** after a win, "Stage select" puts the cursor on the stage just played, not the newly unlocked one.
- **Filed:** KDA-245 reject sealed-off open areas in `parseLevel`. KDA-225 runtime shape check for untrusted level JSON.
- **Noted, not filed:** a "ready" pause or lost-life signal after a respawn (KDA-198 comment); the phantom ignores wrap tunnels; a fog test for levels with tunnels; a Skunk cloud breathed over another shows two 💨 until the first runs out; an enemy pushed off the player's cell doesn't slide on ice; the boss can't use tunnels or ice, so `parseLevel` keeps them off boss levels.
- **2-player** will give each player their own character, facing and energy (`Breather` is per player; character select keeps `picks` per player; P2 keys WASD, ShiftLeft breath, Q pause, E confirm are defined but not attached). Decide with the user how a boss, collisions and lives work with two players.

## Decisions already made

The decisions the next milestone is likely to touch. Everything else (movement, input, screens, progress, rendering, each breath, the Splitter, the boss) is in `docs/decisions.md`.

- **Gameplay** (with the user): grid-based movement with smooth animation; each character has a signature breath plus one stat; breaths use an energy meter refilled by eating dots; local 2-player has both co-op and versus; stages unlock in order.
- **Breaths and energy** (with the user): meter 100 (Skunk 150), +5 per dot, empty each stage, kept on a lost life. Costs Dragon 50, Penguin 50, Owl 25, Skunk 50, Boar 75; cooldown 1 s (Owl 0.5 s). Breath kills score 50.
- **Characters** (with the user): Dragon is the default; stars and par are the same for every character. The last pick is saved under `dot-eater:character:v1`.
- **Input** (product decision): keys by `KeyboardEvent.code`. P1 arrows, ShiftRight breath, P/Escape pause, Space confirm. Auto-repeat never presses.
- **Collisions** (product decision): on drawn positions, caught within `CATCH_DISTANCE` 0.6, any touch counts. Eating the last dot always wins, even if caught on that tick, except on a boss level, where the boss must also be defeated.
- **Boss** (KDA-207, with the user): health 12, damage `cost ÷ 25` per breath, can't be frozen or pushed, 2×2 so it can't enter 1-wide corridors, keeps its damage over a lost life, +500 and gone for good when defeated. Details in `docs/decisions.md`.
- **Code:** an unknown AI type throws. Breath looks come from data; `render.ts` has no per-breath code.

## How we work

- **PM role:** the main session creates and updates Linear issues, delegates each issue to an agent in its own worktree, verifies the result itself, and comments the outcome on the issue. Product and judgment calls go to the user, asked with a recommendation (`AskUserQuestion`, up to 4 per call).
- **Parallel work:** give each agent the files it owns and the API the others call. When parallel branches need a shared type, the PM commits that file first and branches both from it (KDA-208/209 shared `roster.ts` this way). One file per feature (`src/breaths/<animal>.ts`) kept five parallel PRs nearly conflict-free.
- **Agent worktrees** (`isolation: "worktree"`) live in `.claude/worktrees/agent-*` on a `worktree-agent-*` branch. Brief the agent to `git checkout -b KDA-NNN/... <base>` (or `git checkout` an existing branch). Agents commit but don't push. When done: `git worktree remove --force` it and `git branch -D` its `worktree-agent-*` branch.
- **Verify on a clean copy:** `git archive <branch> | tar -x -C <scratch dir>`, `pnpm install --frozen-lockfile`, then check, test, build. `pnpm check` must print two `pass:` lines; empty output means no `node_modules`. Read the test count from the `Tests` line together with `Test Files` (one run once reported a partial count). For several branches, reuse one install and swap the files in.
- **Check that parallel branches combine:** merge them all into a detached preview worktree (`git merge` of several branches at once) and run check and test there. That's how the KDA-229 × KDA-217/218 conflicts were found before merging.
- **Review:** one subagent per PR (or one for several small PRs) runs `code-review` at high effort, report only, and tries the repro in a scratch copy. Fix real bugs as new commits with regression tests that fail without the fix (an agent can fix several branches in turn), verify, push, and comment the fixes on each PR.
- **No force-push:** the auto-mode safety check blocks `git push --force-with-lease`. To bring a PR up to date with `main`, merge `main` into the branch (`git merge main`) and push normally. Merge commits are the house style anyway. If a rebase is really needed, ask the user to run the force-push (`! git push --force-with-lease ...`).
- **Merging:** merge commits only, `gh api -X PUT repos/kdaisho/dot-eater/pulls/N/merge -f merge_method=merge`. For a stack, retarget the next PR to `main` before deleting the merged branch. Wait for CI first when a branch changed after review (poll `commits/<sha>/check-runs` in an `until` loop; plain `sleep` is blocked). Then mark issues Done and watch the Pages deploy.
- **Previews for the user:** offer one for every gameplay or visual PR before asking to merge; the user judges feel by playing. Use a detached worktree (`.claude/worktrees/preview-*`), merge all the PRs in review into it so one preview covers the batch, make preview-only edits there (e.g. put a new enemy in stage 1), `pnpm dev --port 5199 --strictPort` in the background, and `open` the URL. Never commit preview edits; stop the server and remove the worktree afterwards.
- **Gotchas:** zsh (write `${B}:path`, not `$B:path`); `rm -rf "${VAR:?}/..."`, never an unguarded variable; disk space is tight, so remove worktrees and scratch copies when done; in Linear write full GitHub PR URLs (a bare "PR #N" links to another repo); an agent can't check out a branch another worktree holds; the user may merge docs PRs themselves, so check `merged` before adding to one.
