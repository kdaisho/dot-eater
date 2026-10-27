# Handover

Last updated: 2026-10-27. Read `CLAUDE.md` first for project conventions.

## Where things stand

- **Organize code & tooling** (#2–#12), **Engine foundations** (#14–#21), **Characters & breaths** (#37–#43), **Stages** (#23–#34, #44, #46) and **Controllers & local 2-player** (#49–#52) are done and live.
- **Controllers & local 2-player** (KDA-210, 211, 221, 222, all Done):
    - Gamepads: https://github.com/kdaisho/dot-eater/pull/49
    - Two players in state and input: https://github.com/kdaisho/dot-eater/pull/50
    - Co-op: https://github.com/kdaisho/dot-eater/pull/51
    - Versus: https://github.com/kdaisho/dot-eater/pull/52
    - The user played co-op and versus in a preview and approved them.
- `main` is at `6a54c0f`, with 1132 tests passing (checked on the KDA-222 branch head, which `main` matches) and the Pages deploy green. No open PRs, no feature branches, no worktrees.
- Nothing is in progress. Open Linear issues, all in Backlog:
    - Polish (KDA-212–215)
    - the idea backlog (KDA-223–227)
    - KDA-245

### Start here (new session)

1. Read this file and `CLAUDE.md`.
2. Ask the user which milestone is next. Recommend **Polish** (KDA-212 sound and music, KDA-213 particles and screen shake, KDA-214 touch controls, KDA-215 remap controls). They are mostly independent, so they suit one parallel batch.
    - KDA-215 overlaps gamepads (`src/gamepad.ts`, `PAD_BUTTONS`) and the key maps in `input.ts`.
    - KDA-214 adds a third input source next to the keyboard and pads.
3. Read the chosen issues in Linear, settle their product questions with the user (ask with a recommendation), and write the answers into the issues and into "Decisions already made".
4. Plan, delegate to agents in worktrees, verify, review, and offer a playable preview before asking to merge (see "How we work").

## Code map

| Module                                    | What it does                                                                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`                                 | Entry and wiring (loop, input, pads, screen machine, renderer, overlays, toast); the only place with listeners and timers; `padAssignment` by mode |
| `loop.ts`                                 | Fixed-timestep loop (`createLoop`), clock and frame scheduler injected                                                                             |
| `flow.ts`                                 | Screen machine; screens carry `mode`, `animals`, versus `match`; `MODE_CHOICES`, `playerCount`, `recordsProgress`, `END_CONFIRM_DELAY`             |
| `progress.ts`, `lastPick.ts`              | Saved progress (unlocks, bests, `recordClear`) and the last pick, solo only. Storage injected, every access in try/catch                           |
| `game.ts`                                 | `GameState` (`players`, `mode`), `createGameState(level, animals, mode)`, `step`, collisions, `resolveCatch` per mode, `takeOut`/`bringBack`       |
| `versus.ts`                               | Versus rules: stuns and immunity (`opponentsStruck`), `loseDots`, round and match results (`roundWinner`, `matchWinner`, `tallyText`)              |
| `breath.ts`, `breaths/`                   | Breath engine (`BreathDef`, `breathe`, statuses, tile effects, `defeatEnemy`, `energyHud`, `playersInPlay`); one `BreathDef` per animal            |
| `roster.ts`                               | `AnimalId`, `ANIMALS`, `ANIMAL_IDS`, `DEFAULT_ANIMAL`, `isAnimalId`                                                                                |
| `splitter.ts`, `boss.ts`                  | Splitter slots and spread; the 2×2 boss (`bossTarget`, `bossMove`, `bossHomeStep`, `damageBoss`)                                                   |
| `ai.ts`, `path.ts`                        | Enemy AI and `nearestTarget`; `blockedView`/`goalView`; BFS `distanceMap`                                                                          |
| `ice.ts`, `fog.ts`                        | Sliding (`slideStep`, `slideReach`, `slideDistances`); fog distance and light centres                                                              |
| `level.ts`, `levels/`                     | `LevelData`, `parseLevel` (`P`/`Q` spawns); `levels/index.ts` lists stages 1–5                                                                     |
| `input.ts`, `gamepad.ts`                  | Actions, `InputState`/`PlayerInput`, `KeyboardSource` (P1 + P2 maps); `GamepadSource` (`"shared"`/`"perPad"`, `browserPadList`)                    |
| `render.ts`, `glide.ts`, `layout.ts`      | Canvas renderer (maze, ice, fog, breath looks, 1P/2P/versus HUD, P1/P2 markers, 💫/🛡️ badges), glide maths, layout/DPR                             |
| `ui.ts`                                   | DOM overlays (title mode menu, stage/character select, pause, end screens, round and match results), toast, confetti                               |
| `constants.ts`, `character.ts`, `vec2.ts` | Cells, AI types, ids, tick rate, speeds, points, lives, `PLAYER_RESPAWN_DELAY`, `RESPAWN_CLEAR_DISTANCE`; the `Character` record                   |

## Open questions and follow-ups

- **Playtests to watch:**
    - Boss lair: the arena doors are quite safe, and a player can be caught right after a Boar wall regrows next to the boss.
    - Breath ranges and sizes have had no comment yet. A frozen Penguin enemy can block a 1-wide corridor for long.
    - Versus stun tuning: 2 s stun, then 1.5 s immunity.
- **PM calls this milestone the user hasn't commented on:**
    - In co-op, enemies head home while nobody is in play.
    - A stunned player finishes an ice slide.
    - Pads: the A button does both breath and confirm, and a pad disconnect pauses only if that pad was in use.
- **Still open with the user:** after a win, "Stage select" puts the cursor on the stage just played, not the newly unlocked one.
- **Gamepads:**
    - Pads whose `mapping` isn't `"standard"` (common on Firefox for macOS and Linux) are still read with the standard layout.
    - It's unconfirmed whether the user tried a real controller.
    - On-screen hints only name keys.
- **Filed:** KDA-245 (reject sealed-off open areas in `parseLevel`); KDA-225 (runtime shape check for untrusted level JSON).
- **Noted, not filed:**
    - `README.md` is out of date: it still mentions the fly and doesn't mention 2-player.
    - `bossReach` runs twice per boss move in 2P.
    - `bringBack` finds the spawn with `indexOf`.
    - The `!p.out` filter is repeated instead of calling `playersInPlay`.
    - Behaviour gaps:
        - The phantom ignores wrap tunnels.
        - There's no fog test for levels with tunnels.
        - A Skunk cloud over another shows two 💨.
        - An enemy pushed off the player's cell doesn't slide on ice.

## Decisions already made

Everything settled lives in `docs/decisions.md`, grouped by topic. That includes the full "Two players" section: targeting, catches, co-op, respawning, versus, modes, gamepads and progress. These are the parts the Polish milestone is likely to touch:

- **Input** (product decision): keys are matched by `KeyboardEvent.code`.
    - P1: arrows, ShiftRight breath, P/Escape pause, Space confirm.
    - P2: WASD, ShiftLeft breath, Q pause, E confirm.
    - Auto-repeat never presses.
- **Gamepads** (with the user):
    - Standard mapping: D-pad and left stick (dead zone 0.5, stronger axis only), A for breath and confirm, Start for pause.
    - In 1P any pad drives P1. In 2P, pad 1 drives P1 and pad 2 drives P2.
    - End screens ignore confirm for their first 0.5 s.
- **Two players** (with the user): players pass through each other, and enemies chase the nearest player they can reach. 2-player modes never touch saved data. Both players may pick the same animal.
- **Co-op** (with the user): one shared pool of `START_LIVES`. A caught player is out alone for 3 s. A player caught with the pool empty is out for good, and the game is lost when all are out for good.
- **Versus** (with the user):
    - A breath hit stuns for 2 s, then gives 1.5 s of immunity.
    - There are no lives. A catch costs −5 dots, even on the last-dot tick.
    - Best of 3 on the same stage, decided by most dots. A tie goes to the higher score; an exact tie replays the round.
    - The round result offers Next round or Quit.
- **Code:** game logic takes randomness, time and input as parameters. An unknown AI type throws. Breath looks come from data; `render.ts` has no per-breath code.

## How we work

- **PM role:** the main session creates and updates Linear issues, delegates each issue to an agent in its own worktree, verifies the result itself, and comments the outcome on the issue. Product and judgment calls go to the user, asked with a recommendation (`AskUserQuestion`, up to 4 per call).
- **Parallel work:** give each agent the files it owns and the API the others call.
    - **Shared foundation first:** when parallel branches need the same foundation, build it first and branch both from it. KDA-221's phase 1 (per-player out/respawn, `GameState.mode`) was committed alone, KDA-222 branched from that commit, and KDA-221 phase 2 continued in parallel.
    - **Shared field names:** tell the other agent mid-run when one side adds a field both need (`Player.dots`).
- **Agent worktrees:**
    - `isolation: "worktree"` puts each agent in `.claude/worktrees/agent-*` on a `worktree-agent-*` branch. Brief the agent to `git checkout -b KDA-NNN/... <base>`, or `git checkout` an existing branch. Agents commit but don't push.
    - When an agent is done: `git worktree remove --force` its worktree and `git branch -D` its `worktree-agent-*` branch.
    - An agent can't check out a branch another worktree holds.
- **Verify on a clean copy:** `git archive <branch> | tar -x -C <scratch dir>`, `pnpm install --frozen-lockfile`, then check, test and build.
    - `pnpm check` must print two `pass:` lines; empty output means there's no `node_modules`.
    - Read the test count from the `Tests` line together with `Test Files`.
    - `console.log` from a test doesn't show in `pnpm test`'s output. To read a value, assert it against a dummy and read "Received".
- **Combine and stack:** to check that parallel branches combine, merge them all into a detached worktree and run check and test there. When they conflict (KDA-210 × 211), have an agent merge one into the other and open the second PR stacked on the first.
- **Review:** one subagent per PR runs `code-review` at high effort, report only, and tries the repro in a scratch copy.
    - Fix real bugs as new commits with regression tests that fail without the fix, verify, push, and comment on the PR and the issue.
    - Treat a reviewer's numbers as claims. One review's dot counts were wrong, and the fixer caught it.
- **No force-push:** the auto-mode safety check blocks `git push --force-with-lease`. To bring a branch up to date, merge `main` into it and push normally. If a rebase is really needed, ask the user to run the force-push.
- **Merging:**
    - The auto-mode check blocks merging unless the user's own message says to merge. "This is the plan" wasn't enough; "merge" was.
    - Use merge commits only: `gh api -X PUT repos/kdaisho/dot-eater/pulls/N/merge -f merge_method=merge`.
    - For a stack, retarget the next PR to `main` (`gh api -X PATCH .../pulls/N -f base=main`) before deleting the merged branch (`gh api -X DELETE .../git/refs/heads/<branch>`).
    - Check CI first: poll `commits/<sha>/check-runs`, or for the deploy `actions/runs?head_sha=<sha>`, in an `until` loop with `perl -e 'select(undef,undef,undef,10)'`. Plain `sleep` is blocked.
    - Then mark the issues Done and watch the Pages deploy.
- **Previews for the user:**
    - Offer one for every gameplay or visual PR before asking to merge; the user judges feel by playing.
    - Use a detached worktree (`.claude/worktrees/preview-*`) holding the top of the batch, and make preview-only edits there.
    - Run `pnpm dev --port 5199 --strictPort` in the background, then `open` the URL.
    - When showing a placeholder rule, say up front that it's a placeholder and which issue replaces it. The user was confused by 2P's temporary shared-life reset.
    - Never commit preview edits. Stop the server (`pkill -f "vite.*5199"`) and remove the worktree afterwards.
- **Gotchas:**
    - zsh: write `${B}:path`, not `$B:path`.
    - Use `rm -rf "${VAR:?}/..."`, never an unguarded variable.
    - Disk space is tight, so remove worktrees and scratch copies when done.
    - In Linear, write full GitHub PR URLs; a bare "PR #N" links to another repo.
    - The user may merge docs PRs themselves, so check `merged` before adding to one.
