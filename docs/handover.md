# Handover

Last updated: 2026-10-30. Read `CLAUDE.md` first for project conventions.

## Where things stand

- **Done and live:**
    - Organize code & tooling (#2–#12)
    - Engine foundations (#14–#21)
    - Characters & breaths (#37–#43)
    - Stages (#23–#34, #44, #46)
    - Controllers & local 2-player (#49–#52)
    - Polish (#55–#59)
- **"Harder and more exciting" upgrade: done and live** (planned with the user on 2026-10-29). Six milestones, PRs #67–#95, Linear KDA-257 to KDA-286:
    - **Health & punch** (#71, #73): a 100-health gauge replaces lives; a spammable punch knocks enemies back.
    - **Rule & control tweaks** (#67, #68, #69, #79):
        - 2P Bump setting.
        - The Penguin walks normally on ice.
        - Frozen enemies are walkable.
        - Touch is drag-to-move, with Punch and Breath buttons.
    - **Difficulty & bigger mazes** (#70, #72, #75, #86):
        - Easy, Medium, Hard and Super Hard, with 3/4/6/8 enemies.
        - Every stage has a medium (~21×17) and a large (~29×21) map.
        - The view follows the player on big mazes.
        - The enemy cap is 8.
    - **Boss fight** (#74, #76, #77, #78): a boss stage is won by defeating the boss. The boss breathes, dots regrow, and Splitters drop dots.
    - **Story & stage modes** (#88, #90): stages unlock only through story mode.
    - **Ten stages:**
        - Stages 1–4 remade (#84, #85, #80, #81).
        - Stage 5 remade (#89, #94).
        - New stages 6–9 (#82, #83, #91, #92).
        - Stage 10, the final boss (#93).
        - Same-type enemies no longer merge into one sprite (#87, #95).
- `main` is at `5107f7b`. CI is green, with about 2770 tests passing.
- **Backlog:**
    - KDA-287 (polish on the spread rule)
    - the idea backlog (KDA-223–227)
    - the Promo video milestone (another session)
- **Open PRs from other sessions:**
    - #60 rewrites this handover for Polish and is now superseded; ask the user to close it.
    - #61 and #62, Polish follow-ups.
    - #63 → #64 → #66, the promo video stack.
    - #65, a music volume fix.

### Start here (new session)

1. Ask the user to play the preview and give feedback on the tuning list under "Open questions". Preview: `pnpm dev --port 5199 --strictPort` from a detached worktree of `main`.
2. Turn their feedback into Linear issues (milestone "Ten stages", or a new "Tuning" milestone), then run them as a batch (see "How we work").
3. Ask whether the promo video (KDA-250 and the #63–#66 stack) should show the new game. Its recorded runs predate health and punch, so `src/replay.ts` (PR #63) needs its checksum (`lives` → health) and the punch letter added, and the scenes need re-recording.

## Code map

The older modules are listed in `CLAUDE.md`. These are the ones the upgrade added or reshaped:

| Module                             | What it does                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `difficulty.ts`                    | `Difficulty`, `ENEMY_COUNT` (3/4/6/8), `MAP_SIZE`, labels                                                                                  |
| `level.ts`                         | `LevelData` with `medium`/`large` variants, `parseStage`, `sameForBoth`. Rejects sealed and trapped areas. A boss level needs `regrowDots` |
| `game.ts`                          | `hurtPlayer`, `knockBack`, `checkEnd`/`cleared`, `playerBlocks` (Bump), and `playerTurn`/`defersMove`                                      |
| `punch.ts`, `jab.ts`               | The punch and `knockEnemy`; the jab look                                                                                                   |
| `ai.ts`                            | `ChaseDistances` (shared per tick), and the spread rule (`stacksOn`, `spreadChoice`, `mayHold`) for chase, ambusher, Splitter and phantom  |
| `bossBreath.ts`, `boss.ts`         | The boss breath (wind-up, 2-wide line) and `boss.health`                                                                                   |
| `regrow.ts`, `splitter.ts`         | Regrowing dots; Splitter drops                                                                                                             |
| `camera.ts`, `layout.ts`           | The follow view (`MIN_CELL_PX` 20, `MIN_FIT_CELL_PX` 16)                                                                                   |
| `touch.ts`, `dpad.ts`              | Drag to move (with a fallback), and the Punch/Breath buttons                                                                               |
| `flow.ts`                          | The difficulty select, story mode (`Run`, `storyClear`, `storyEnd`) and stage mode                                                         |
| `progress.ts`                      | `byDifficulty` bests, `storyBests`, `recordClear(..., { unlocks })`, `STAGE_COUNT` 10                                                      |
| `src/test/bossArena.ts`, `maze.ts` | Arena escape and dodge sweeps (`dodgeHits`), and maze chokepoint checks                                                                    |

## Open questions and follow-ups

- **Tuning to judge at preview.** Every number below is a PM placeholder:
    - **Damage:** enemy touch 25, boss touch 40, boss breath 30 (stage 10: 35), invulnerability 1.5 s.
    - **Punch:** a reach of about 1.07 cells, and whether `/` is a good P1 key.
    - **Touch:** whether a 24 px drag, 72 px buttons and the fallback feel right on a real phone.
    - **Pars:** stages 3, 4 and 8 have long pars (110–220 s).
    - **Stage 9:** enemy speed 2.25.
    - **Boss stages:** the Boar is weak at Hard and above.
    - **Stage 8:** blind slides into fog.
    - **View:** `MIN_CELL_PX` and `MIN_FIT_CELL_PX`.
- **Known gaps:**
    - During a deploy, a tab still open on the old 5-stage build can cut stage 6+ progress from the save.
    - Stage 7's middle patroller crosses the spawn corridor.
    - A thawing enemy catches a player standing on it, but it blinks first.
- **Filed:** KDA-287. The README is still out of date.

## Decisions already made

All of these are in `docs/decisions.md`, by topic. The ones made with the user on 2026-10-29:

- **Health:** health is the only life bar, with no lives. At 0 the stage is failed. In story mode you retry that stage.
- **Maze sizes:** two map sizes per stage.
- **Touch:** drag to move plus two buttons.
- **Unlocks:** shared across difficulties, with bests kept per difficulty. Stages unlock only through story mode, in order.
- **PM calls the user delegated** ("I trust your judgement"):
    - Co-op plays story mode but saves nothing.
    - Versus is stage-only.
    - Stage themes 6–10.
    - The spread rule: slack 2, hold for at most one move.
    - The `RESPAWN_BLOCK_GRACE` spawn-camping cap.

## How we work

- **PM role:** the main session plans in Linear and delegates each issue to an agent in its own worktree (`isolation: "worktree"`). Agents push their branches; the main session opens the PRs, gets them reviewed, merges them and comments on the issues. Product calls go to the user with a recommendation.
- **Merging:**
    - Only when the user's own message authorizes it, once per session. In this session it was "merge PRs once CI is green and the review is clean".
    - Use merge commits only: `gh api -X PUT repos/kdaisho/dot-eater/pulls/N/merge -f merge_method=merge`.
    - For a stack, retarget the next PR (`gh api -X PATCH .../pulls/N -f base=main`) before deleting the merged branch.
- **Reviews:** one subagent per PR, at high effort, report only. Real bugs are fixed with regression tests that fail without the fix, then re-reviewed when the fix is sizeable.
    - Tell reviewers to work only in their own `git worktree add --detach` copy. The `code-review` skill once ran `git checkout` in the main checkout.
    - Treat a reviewer's numbers as claims. Fuzzes and differential runs against `main` were the strongest evidence.
- **Merge order and conflicts:**
    - Many branches hit the same `docs/decisions.md` lines (the par line, Stages, Progress), so expect a conflict on every merge.
    - Resolving them in the finished agent's worktree with a small Python edit plus `pnpm fmt` was faster than asking agents.
    - GitHub's `mergeable_state: clean` can be stale. Test the merged result locally before trusting it.
- **CI:** the tests that sweep every stage's maps need `describe(..., { timeout: 30_000 }, ...)`. Some hit 5 s on CI as stages were added.
- **Previews:** run `pnpm dev --port 5199 --strictPort` from a detached worktree (`.claude/worktrees/preview-*`). Never commit preview edits.
- **Gotchas:**
    - The local `gh` is 2.3.0, so use `gh api`.
    - `gh run view --log-failed` needs `--allow-escape-sequences` or a grep.
    - The GitHub API sometimes resets connections, so check whether a PR was created before retrying.
    - The Linear workspace has a free-plan issue cap; the user clears old issues when it's hit.
    - The auto-mode check sometimes returns no verdict; just retry once.
    - In Linear, write full GitHub PR URLs.
    - Disk is tight: remove worktrees when done (`git worktree remove --force --force` if an agent holds the lock).
