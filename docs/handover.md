# Handover

Last updated: 2026-10-31. Read `CLAUDE.md` first for project conventions.

## Where things stand

- **Done and live:**
    - Organize code & tooling (#2–#12)
    - Engine foundations (#14–#21)
    - Characters & breaths (#37–#43)
    - Stages (#23–#34, #44, #46)
    - Controllers & local 2-player (#49–#52)
    - Polish (#55–#59, plus follow-ups #61, #62, #65)
    - The "harder and more exciting" upgrade (#67–#97, KDA-257 to KDA-287). It brought health and punch, difficulties, two map sizes, the boss fight, story mode and ten stages.
- **Tougher enemies: done and live** (2026-10-30 to 31). These came from user feedback after playing the upgrade. KDA-288 to KDA-293, no milestone:
    - **Press on and guard** ([#98](https://github.com/kdaisho/dot-eater/pull/98), KDA-288):
        - A punched enemy comes straight back.
        - Knockback shrinks with repeated hits and recovers after a lull.
        - Enemies roll a guard skill, and mashing gets blocked.
    - **Charged breath** ([#99](https://github.com/kdaisho/dot-eater/pull/99), KDA-289): hold to charge (levels 1–5), release to fire. Every breath grows with the level: the Skunk floods corridors, and the Boar bores up to 5 walls.
    - **Stronger enemies** ([#100](https://github.com/kdaisho/dot-eater/pull/100), KDA-290):
        - Faster enemies (`ENEMY_SPEED_SCALE`) and better guards.
        - Super Hard is much harder: 3 s respawn, faster boss breath.
    - **Guard stance** ([#101](https://github.com/kdaisho/dot-eater/pull/101), KDA-293): a blocking enemy stops for 0.4 s. The user picked the look (a hunch, a steel tint and sparks) and the sound (a wooden thock).
    - **Breather 🐍** ([#103](https://github.com/kdaisho/dot-eater/pull/103), KDA-291): an enemy with a small boss-like breath. It keeps its distance, and every stage list has at least one.
    - **Interceptor 🐺** ([#102](https://github.com/kdaisho/dot-eater/pull/102), KDA-292): an enemy that predicts the player's route, heads it off, and fades when far away. Every stage has some.
    - **Music volume** ([#65](https://github.com/kdaisho/dot-eater/pull/65)): `MUSIC_LEVEL` 2, plus a master limiter (`LIMITER` in `audio.ts`).
- **State:** `main` is at `337108d` and the Pages deploy is green. Its test count, 3124 tests in 113 files, comes from a run on a detached copy of `337108d`.
- **Open PRs:** only #63 → #64 → #66, the promo video stack. It belongs to another session; see "How we work".
- **Backlog:** the idea backlog (KDA-223–227) and the Promo video milestone (KDA-250, owned by the other session).

### Start here (new session)

1. Ask the user the three open questions under "Open questions" (each has a recommendation).
2. Offer a preview of `main` and collect tuning feedback on the list below: `git worktree add --detach .claude/worktrees/preview-main origin/main`, `pnpm install`, then `pnpm dev --port 5199 --strictPort`.
3. File the answers and the feedback as Linear issues in project Dot Eater, then run them as a batch (see "How we work").

## Code map

The older modules are listed in `CLAUDE.md`. These are the ones the last two rounds of work added or reshaped:

| Module                     | What it does                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `difficulty.ts`            | `ENEMY_COUNT` (3/4/6/8), `MAP_SIZE`, `GUARD` odds per difficulty (`GUARD_CAP` 0.85), `ENEMY_SPEED_SCALE` and `enemySpeed()` (cap 3.4)     |
| `game.ts`                  | `step`, `hurtPlayer`, `knockBack`, `checkEnd`; the knock state (`GameState.knock`, `USUAL_KNOCK`, `KNOCK_DECAY`) and the ice-slide branch |
| `punch.ts`, `guard.ts`     | The punch and `knockEnemy`; guard rolls, `blockChance` (interval-based), and the 0.4 s stance (`GUARD_STANCE`, `tickStances`)             |
| `breath.ts`, `breaths/`    | Breath engine; `chargeTick`, `CHARGE_SECONDS` 0.25, `MAX_CHARGE` 5; `BreathDef.shape(level)` and cost per level; two-pass wall regrowth   |
| `ai.ts`                    | Enemy AI, the spread rule (`stacksOn`, `spreadChoice`, `mayHold`), `breatherStep`, `breatherOn`, `interceptStep`                          |
| `enemyBreath.ts`           | The breather's breath (wind-up, line, damage) and its warning looks                                                                       |
| `intercept.ts`             | Route prediction (`predictRoute`, `INTERCEPT_AHEAD` 10), `interceptAim`, and the fade (`sneakAlpha`)                                      |
| `bossBreath.ts`, `boss.ts` | The boss breath and `boss.health` (breath damage is energy/25)                                                                            |
| `render.ts`                | `ENEMY_SPRITES` (👺 👹 🦊 🤖 👻 🦠 🐍 🐺), cached steel-tinted guard sprites (`createGuardSprites`)                                       |
| `audio.ts`                 | Music and effects, `MUSIC_LEVEL`, the master `LIMITER`                                                                                    |
| `flow.ts`, `progress.ts`   | Difficulty select, story and stage modes; bests by difficulty, `STAGE_COUNT` 10                                                           |
| `camera.ts`, `touch.ts`    | The follow view (`MIN_CELL_PX` 20, `MIN_FIT_CELL_PX` 16); drag to move and the Punch/Breath buttons                                       |

## Open questions and follow-ups

- **Questions for the user (asked, no answer yet):**
    - **Boar charge cost:** a full charge facing a single wall still spends all 100 energy. Recommend paying only for the walls actually broken.
    - **Touch Breath button:** should it show the charge level while held? No recommendation was given; PM view: yes.
    - **Boar breaking the outer wall:** the user asked whether it's possible.
        - Option A (easy) leaves a dead-end notch.
        - Option B (medium effort) bores through the edge and wraps to the other side.
        - Recommend B, as its own PR.
- **Tuning to judge at preview.** Every number is a PM placeholder:
    - **Earlier:**
        - Damage: enemy touch 25, boss touch 40, boss breath 30 (35 on stage 10).
        - Touch: 24 px drag, 72 px buttons.
        - Long pars on stages 3, 4 and 8, and speed 2.25 on stage 9.
        - Blind slides into fog on stage 8.
        - The view settings `MIN_CELL_PX` and `MIN_FIT_CELL_PX`.
        - The punch itself: the user said "punch is good" after KDA-288.
    - **Knockback:** 1 → 0.7 → 0.5 → 0.3 → 0 cells, recovering after about 2 s.
    - **Guards:** odds of 0.35/0.55/0.75/0.95 of being a guarder, by difficulty; the stance lasts 0.4 s.
    - **Charge:** 0.25 s per level, and the cost per level of each breath.
    - **Enemy speed scale:** 1.1/1.25/1.4/1.65, capped at 3.4.
    - **Breather:** its breath interval and damage.
    - **Interceptor:** its look-ahead and its fade.
- **Things to watch when playing:**
    - Stage 9 at Hard and Super Hard has no plain chaser or ambusher.
    - On six large maps, an interceptor is among the first three enemies to come out.
- **Known gaps:**
    - During a deploy, a tab still open on an old build can cut stage 6+ progress from the save.
    - Stage 7's middle patroller crosses the spawn corridor.
    - `README.md` is out of date.

## Decisions already made

All of these are in `docs/decisions.md`, by topic. See the Breaths section (Energy, Charge) and the Enemies section (Punch, Spread rule, Interceptor, Breather). The ones made with the user this round:

- **Punch** (KDA-288):
    - A knocked enemy comes back.
    - Knockback recovers after a lull.
    - The guard skill is random per enemy, and better on harder difficulties.
    - Faster spam gets more blocks.
    - A blocked punch doesn't push the enemy.
- **Guard stance** (KDA-293):
    - A short 0.4 s stance that stops the enemy.
    - The look is B+C (a hunch, a steel tint and sparks), and the sound is a wooden thock. The user chose them from the mock-up at https://claude.ai/artifact/7CfPTfdwLThuUs6Eup6Qyj.
- **Charge** (KDA-289):
    - Hold to charge and release to fire, for all five animals.
    - The Boar bores straight ahead, one wall per level.
    - The Skunk flows along corridors.
- **Breather** (KDA-291):
    - Damage like a small boss breath.
    - Keeps its distance.
    - Added to every stage list, and defeated like any enemy.
- **PM calls the user delegated:**
    - The interceptor's design and numbers.
    - How the stage lists combine breathers, interceptors and a chaser at Hard.
    - Super Hard's 3 s respawn and faster boss breath.

## How we work

- **PM role:** the main session plans in Linear and delegates each issue to an agent in its own worktree (`isolation: "worktree"`, preview on its own port). The main session then:
    - opens the PR and gets it reviewed by a separate agent
    - sends fixes back to the author with SendMessage
    - merges, cleans up and sets the issue to Done
- **Product calls** go to the user with a recommendation (`AskUserQuestion`).
    - For a visual or sound choice, publish a mock-up artifact with each option playable (as with the guard looks). The user picked from it quickly.
- **Merging:**
    - Only with the user's own go-ahead. This session it was "merge PRs once CI is green and the review is clean", and "merge the ready ones" for the gameplay PRs after the preview.
    - Merge commits only: `gh api -X PUT repos/kdaisho/dot-eater/pulls/N/merge -f merge_method=merge`.
    - For a stack, retarget first (`pulls?state=open&base=<branch>`), then delete with `gh api -X DELETE .../git/refs/heads/<branch>`.
- **Overlapping PRs:** merge one at a time. Before the next merge, merge `main` into the next PR (in a detached worktree, then `git push origin HEAD:<branch>`) and wait for CI.
    - A PR in conflict with `main` (`mergeable_state: dirty`) gets **no CI run**, so a wait loop on its checks never ends. Check `mergeable_state` first.
    - `docs/decisions.md` and the stage lists in `src/levels/` conflict on most merges.
- **Reviews:** one subagent per PR, high effort, report only, in its own `git worktree add --detach` copy.
    - Seeded simulations and mutation checks were the strongest evidence.
    - Re-review after a sizeable fix.
- **Previews:** keep `.claude/worktrees/preview-upgrade` (detached) at the top of the batch, on port 5199. After each merge, move it to `origin/main`. Never commit preview edits.
- **Cleanup after a merge:**
    - Stop the agent's preview.
    - Check that its head is an ancestor of `origin/main`, then `git worktree remove -f -f` it (it's locked while the agent lives).
    - Delete its local branches.
- **Other session's work:** the promo stack (#63/#64/#66, KDA-248–256) and its worktrees `.claude/worktrees/agent-a1679…`, `a2a56…`, `a4a2d…`, `a52ee…`, `a6f05…` and `aeabe…` belong to another session. Don't touch, merge or remove them.
- **Gotchas:**
    - The local `gh` is 2.3.0, so use `gh api`.
    - Plain `sleep` is blocked. Use a background `until` loop on `commits/<sha>/check-runs`.
    - In Linear, write full GitHub PR URLs.
    - Disk is tight, so remove worktrees when done.
    - The sprite 🦊 is the ambusher; the interceptor is 🐺.
