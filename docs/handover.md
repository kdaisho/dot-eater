# Handover

Last updated: 2026-10-27. Read `CLAUDE.md` first for project conventions.

## Where things stand

- **Organize code & tooling** (#2–#12), **Engine foundations** (#14–#21) and **Characters & breaths** (#37–#43) are done and live.
- **Characters & breaths:** KDA-208 breath system and energy meter (#37), KDA-209 character select (#38), KDA-216–220 the five breaths (#39–#43). All Done in Linear.
- **Stages:** stages 1–4 live (#23–#34). KDA-229 Splitter enemy merged (#44) but no stage uses it yet. **KDA-207 Stage 5 "Boss lair" is the only issue left**, unblocked, not started (Backlog).
- `main` is at `7d05986` (merge of #44): 767 tests passing, Pages deploy green. No open PRs, no feature branches, no worktrees.

### Start here (new session)

1. Read this file and `CLAUDE.md`, then KDA-207 in Linear.
2. Settle KDA-207's open product questions with the user (see "Open questions"; ask with a recommendation). Write the answers into KDA-207 and into "Decisions already made".
3. Plan KDA-207. It probably splits into an engine part (a 2×2 boss with health) and a level part (the stage map, minions, par). Run the parts in parallel only if a contract keeps them in separate files.
4. Offer the user a playable preview before asking to merge (see "How we work").

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
| `ai.ts`, `path.ts`                        | Enemy AI (random, chase, ambusher, patroller, phantom, splitter), `blockedView`/`goalView`; BFS `distanceMap`, `openNeighbours`                      |
| `ice.ts`, `fog.ts`                        | Sliding (`slideStep`, `slideReach`, `slideDistances`); fog distance and light centres                                                                |
| `level.ts`, `levels/`                     | `LevelData` format, `parseLevel` validation; `levels/index.ts` lists stages 1–4                                                                      |
| `input.ts`                                | Actions, `InputState`/`PlayerInput` (`ignoreHeld`), `KeyboardSource`                                                                                 |
| `render.ts`, `glide.ts`, `layout.ts`      | Canvas renderer (maze, ice, fog, breath looks, HUD energy meter), glide maths, layout/DPR                                                            |
| `ui.ts`                                   | DOM overlays per screen (title, stage select, character select, pause, end screens), confetti                                                        |
| `constants.ts`, `character.ts`, `vec2.ts` | Cells, AI types, ids, tick rate, speeds, points, lives; the `Character` record                                                                       |

## Current work: KDA-207 Stage 5 "Boss lair"

Linear spec: one big boss (2×2 cells) with a health bar that takes several breath hits, plus minions. Clearing needs all dots eaten **and** the boss defeated.

Where it touches the engine (not yet designed):

- **Size:** every character is one cell today (`Character.pos`, BFS, collisions, rendering). A 2×2 boss needs its own footprint in movement, collisions (`CATCH_DISTANCE` is centre to centre), what breaths hit (`hit.enemies` is per cell) and the renderer.
- **Health:** `defeat` is one hit today (`defeatEnemy`). Damage, and which breaths count, belong in the engine so breath files stay unchanged.
- **Win condition:** today eating the last dot always wins (`game.ts`). The boss stage needs an extra rule, probably a level `rules` flag, plus `parseLevel` validation.
- **Minions:** existing enemy types, e.g. Splitters (count 2 toward the cap of 4, and the boss needs a slot too).
- **Stage slot:** `STAGE_COUNT` is already 5; stage 5 shows "Coming soon" until a level exists in `levels/index.ts`. It unlocks after stage 4.

The breath contract every breath follows (and the boss must respect) is in `docs/decisions.md` under "Breath contract".

## Open questions and follow-ups

- **KDA-207 product questions (ask the user):** boss health and how damage shows; which breaths hurt it (suggest: those that defeat, i.e. the Dragon, plus maybe a smaller effect from the others); what freeze, push, stink and wall-break do to it; whether a defeated boss respawns or stays gone; boss movement (speed, AI); which minions; par time.
- **Gameplay since the five breaths are tunable:** the user hasn't commented on ranges and sizes (Dragon/Owl 5, Penguin cone 3, Skunk 3×3). A frozen Penguin enemy is solid, so refreezing every 1 s can block a 1-wide corridor for long. Revisit after playtesting.
- **Open with the user since Stages:** after a win, "Stage select" puts the cursor on the stage just played, not the newly unlocked one.
- **Filed:** KDA-245 reject sealed-off open areas in `parseLevel` (a Boar could get sealed in after a wall regrows; no current stage has one). KDA-225 runtime shape check for untrusted level JSON.
- **Noted, not filed:** a "ready" pause or lost-life signal after a respawn (KDA-198 comment); the phantom ignores wrap tunnels; a fog test for levels with tunnels; a Skunk cloud breathed over another shows two 💨 until the first runs out; an enemy pushed off the player's cell doesn't slide on ice.
- **Later milestones** in Linear: Controllers & local 2-player (KDA-210, 211, 221, 222), Polish (KDA-212–215), idea backlog (KDA-223–227). 2-player gives each player their own character, facing and energy, so keep breath state per player.

## Decisions already made

The decisions KDA-207 touches. All others (movement, input, screens, progress, rendering, each breath's details) are in `docs/decisions.md`.

- **Breaths and energy** (with the user): meter 100 (Skunk 150), +5 per dot, empty each stage, kept on a lost life. Costs Dragon 50, Penguin 50, Owl 25, Skunk 50, Boar 75; cooldown 1 s (Owl 0.5 s). Breath kills score 50. Refusing a breath costs nothing.
- **Defeated enemies** (with the user): back at their spawn after 5 s, blinking the last 1 s. A lost life resets every enemy to its spawn, in play, with no statuses; tiles, energy and cooldown carry over.
- **Splitter** (with the user): only `defeat` splits it (+50); halves at 2.5 cells/s, +50 each, back whole 5 s after both are gone; counts 2 toward the 4-slot cap; a split never catches the player. Details in `docs/decisions.md`.
- **Characters** (with the user): Dragon is the default; stars and par are the same for every character.
- **Collisions** (product decision): on drawn positions, caught within `CATCH_DISTANCE` 0.6, any touch counts. Eating the last dot always wins, even if caught on that tick (product decision; KDA-207 changes this for the boss stage only).
- **Stars:** 1 for clearing, +1 for no lives lost, +1 for beating `parTime`. Pars so far 60, 70, 80, 75 s.
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
