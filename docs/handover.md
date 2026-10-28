# Handover

Last updated: 2026-10-28. Read `CLAUDE.md` first for project conventions.

## Where things stand

- **Organize code & tooling** (#2–#12), **Engine foundations** (#14–#21), **Characters & breaths** (#37–#43), **Stages** (#23–#34, #44, #46), **Controllers & local 2-player** (#49–#52) and **Polish** (#54–#59) are done and live.
- **Polish** (KDA-246, 212, 213, 214, 215, 247, all Done), merged 2026-10-28 as one stack:
    - Game events and a settings screen: https://github.com/kdaisho/dot-eater/pull/54
    - Particles and screen shake: https://github.com/kdaisho/dot-eater/pull/55
    - Sound and music: https://github.com/kdaisho/dot-eater/pull/57
    - Touch and swipe: https://github.com/kdaisho/dot-eater/pull/56
    - Remap controls: https://github.com/kdaisho/dot-eater/pull/58
    - Facing guide (arrow or aim preview): https://github.com/kdaisho/dot-eater/pull/59
    - The user played the whole stack in a preview (desktop and phone) and approved it.
- `main` is at `ea12129`, with 1681 tests passing (checked on the KDA-247 branch head, which `main` matches). No open PRs.
- **Another session is working on the Promo video milestone:** KDA-248 (gameplay input recorder) has a locked agent worktree `.claude/worktrees/agent-aa2f607ab723bbbe1` on `KDA-248/add-a-gameplay-input-recorder`. Don't touch it or its branch.
- Other open Linear issues, all in Backlog: the idea backlog (KDA-223–227) and KDA-245.

### Start here (new session)

1. Read this file and `CLAUDE.md`.
2. Ask the user whether the Promo video work (KDA-248) is still running in another session before starting anything that touches `main.ts` or `flow.ts`.
3. Ask the user the open Polish questions below, each with the recommendation given.
4. Otherwise ask which milestone or issue is next, settle its product questions (with a recommendation), write the answers into the issues, then plan, delegate, verify, review and preview (see "How we work").

## Code map

| Module                                                  | What it does                                                                                                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`                                               | Entry and wiring (loop, input, pads, screen machine, renderer, overlays, toast); the only place with listeners and timers; `padAssignment` by mode                            |
| `loop.ts`                                               | Fixed-timestep loop (`createLoop`), clock and frame scheduler injected                                                                                                        |
| `flow.ts`                                               | Screen machine; screens carry `mode`, `animals`, versus `match`; `MODE_CHOICES`, `TITLE_CHOICES`, `PAUSE_CHOICES`, settings screen (`back`), `playerCount`, `recordsProgress` |
| `progress.ts`, `lastPick.ts`                            | Saved progress (unlocks, bests, `recordClear`) and the last pick, solo only. Storage injected, every access in try/catch                                                      |
| `settings.ts`, `settingsMenu.ts`                        | Saved settings (volumes, mute, `screenShake`, `showDpad`, `facingGuide`, `bindings`); the settings rows as data (slider, toggle, action, choice)                              |
| `events.ts`, `eventEffects.ts`                          | `GameEvent` union in `GameState.events`, `takeEvents`; maps events to particles and shake                                                                                     |
| `particles.ts`, `shake.ts`                              | Pure visual effects (never read by the game); reduced-motion scaling                                                                                                          |
| `audio.ts`, `sfx.ts`, `music.ts`, `tone.ts`, `sound.ts` | Web Audio synth: unlock, gains, effects, per-stage loops; `soundForEvent`, `musicForScreen`, `menuSound`                                                                      |
| `touch.ts`, `dpad.ts`                                   | `TouchSource` (sticky swipes, taps), the optional DOM D-pad                                                                                                                   |
| `bindings.ts`, `controlsMenu.ts`                        | Remappable keys/pad buttons (`rebind` swaps, `parseBindings`, `captureKey`), the controls screen rows                                                                         |
| `game.ts`                                               | `GameState` (`players`, `mode`), `createGameState(level, animals, mode)`, `step`, collisions, `resolveCatch` per mode, `takeOut`/`bringBack`                                  |
| `versus.ts`                                             | Versus rules: stuns and immunity (`opponentsStruck`), `loseDots`, round and match results (`roundWinner`, `matchWinner`, `tallyText`)                                         |
| `breath.ts`, `breaths/`                                 | Breath engine (`BreathDef`, `breathe`, statuses, tile effects, `defeatEnemy`, `energyHud`, `playersInPlay`); one `BreathDef` per animal                                       |
| `roster.ts`                                             | `AnimalId`, `ANIMALS`, `ANIMAL_IDS`, `DEFAULT_ANIMAL`, `isAnimalId`                                                                                                           |
| `splitter.ts`, `boss.ts`                                | Splitter slots and spread; the 2×2 boss (`bossTarget`, `bossMove`, `bossHomeStep`, `damageBoss`)                                                                              |
| `ai.ts`, `path.ts`                                      | Enemy AI and `nearestTarget`; `blockedView`/`goalView`; BFS `distanceMap`                                                                                                     |
| `ice.ts`, `fog.ts`                                      | Sliding (`slideStep`, `slideReach`, `slideDistances`); fog distance and light centres                                                                                         |
| `level.ts`, `levels/`                                   | `LevelData`, `parseLevel` (`P`/`Q` spawns); `levels/index.ts` lists stages 1–5                                                                                                |
| `input.ts`, `gamepad.ts`                                | Actions, `InputState`/`PlayerInput`, `KeyboardSource` (P1 + P2 maps); `GamepadSource` (`"shared"`/`"perPad"`, `browserPadList`)                                               |
| `render.ts`, `glide.ts`, `layout.ts`                    | Canvas renderer (maze, ice, fog, breath looks, 1P/2P/versus HUD, P1/P2 markers, 💫/🛡️ badges), glide maths, layout/DPR                                                        |
| `ui.ts`                                                 | DOM overlays (title mode menu, stage/character select, pause, end screens, round and match results), toast, confetti                                                          |
| `constants.ts`, `character.ts`, `vec2.ts`               | Cells, AI types, ids, tick rate, speeds, points, lives, `PLAYER_RESPAWN_DELAY`, `RESPAWN_CLEAR_DISTANCE`; the `Character` record                                              |

## Open questions and follow-ups

- **Polish, ask the user:**
    - Make Screen shake a three-way Auto / On / Off row? Today it's a toggle whose unset value follows the OS reduced-motion setting, and once flipped it can't go back to "follow the OS". Recommend yes.
    - Does sound survive locking an iPhone or taking a call? `audio.ts` handles the `interrupted` state, but it's untested on a device.
    - Should the Boar's aim preview show only breakable walls (today it tints its wall shape plus the wall it would break)?
- **Playtests to watch:** particle looks and amounts, shake strength and music are placeholders the user has only lightly tried; sticky swipes are a PM call to try on a phone; boss lair door safety; versus stun tuning (2 s stun, 1.5 s immunity).
- **Gamepads:** a gamepad press doesn't unlock audio (browser rule), so a pad-only player hears nothing until a key or tap. Pads without the `"standard"` mapping are still read as standard.
- **Filed:** KDA-245 (reject sealed-off open areas in `parseLevel`); KDA-225 (runtime shape check for untrusted level JSON).
- **Noted, not filed:** `README.md` is out of date (still mentions the fly; no 2-player, sound, touch or settings). `bossReach` runs twice per boss move in 2P. The phantom ignores wrap tunnels.

## Decisions already made

Everything settled lives in `docs/decisions.md`, grouped by topic, including the full **Polish** section (sound, settings, reduced motion, touch, remapping, game events, particles, facing guide, settings storage) and **Two players**. Keep to them; the user decided them. The key ones for future work:

- **Settings** persist instantly in localStorage (`dot-eater:settings:v1`), per browser and origin; new fields are optional, without a version bump.
- **Input:** Escape is fixed (pause/back); every other action is remappable, and binding a key in use swaps. Touch drives P1 only.
- **Code:** game logic takes randomness, time and input as parameters; `main.ts` is the only place with listeners and timers; sound and effects hook into game events, never into game logic; `render.ts` has no per-breath code.

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
- **Autonomy** (with the user, 2026-10-28): create and edit Linear issues, comment, push feature branches and open PRs without asking. Merging to `main` (it deploys) waits for the user to say "merge", after a playable preview for gameplay changes.
- **Merging:**
    - The auto-mode check blocks merging unless the user's own message says to merge. "This is the plan" wasn't enough; "merge" was.
    - A merged stack can go in one loop: merge the bottom PR, then for each next PR retarget to `main` and merge; delete branches only at the end.
    - Use merge commits only: `gh api -X PUT repos/kdaisho/dot-eater/pulls/N/merge -f merge_method=merge`.
    - For a stack, retarget the next PR to `main` (`gh api -X PATCH .../pulls/N -f base=main`) before deleting the merged branch (`gh api -X DELETE .../git/refs/heads/<branch>`).
    - Check CI first: poll `commits/<sha>/check-runs`, or for the deploy `actions/runs?head_sha=<sha>`, in an `until` loop with `perl -e 'select(undef,undef,undef,10)'`. Plain `sleep` is blocked.
    - Then mark the issues Done and watch the Pages deploy.
- **Previews for the user:**
    - Offer one for every gameplay or visual PR before asking to merge; the user judges feel by playing.
    - Use a detached worktree (`.claude/worktrees/preview-*`) holding the top of the batch, and make preview-only edits there.
    - Run `pnpm dev --port 5199 --strictPort --host` in the background, then `open` the URL; `--host` gives a LAN URL for trying touch on the user's phone.
    - Expect several rounds of small feel tweaks (spacing, sizes, opacity); make each a commit with tests on the branch, and re-push.
    - When showing a placeholder rule, say up front that it's a placeholder and which issue replaces it. The user was confused by 2P's temporary shared-life reset.
    - Never commit preview edits. Stop the server (`pkill -f "vite.*5199"`) and remove the worktree afterwards.
- **Gotchas:**
    - zsh: write `${B}:path`, not `$B:path`.
    - Use `rm -rf "${VAR:?}/..."`, never an unguarded variable.
    - Disk space is tight, so remove worktrees and scratch copies when done.
    - In Linear, write full GitHub PR URLs; a bare "PR #N" links to another repo.
    - The user may merge docs PRs themselves, so check `merged` before adding to one.
