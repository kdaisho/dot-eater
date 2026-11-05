# Handover

Last updated: 2026-11-04. Read `CLAUDE.md` first for project conventions.

## Where things stand

- **Done and live (one line each):** organize code & tooling (#2–#12), engine (#14–#21), characters & breaths (#37–#43), stages (#23–#34, #44, #46), controllers & 2-player (#49–#52), polish (#55–#66), the "harder and more exciting" upgrade (#67–#103), presentation (music, Gold opening, end roll, admin mode, iOS sound; #105–#122), Refinement (#124–#136, KDA-294–307).
- **Menus & co-op milestone (Linear, 2026-11-03/04): 11 of 12 done and live, PRs #137–#148.**
    - Versus removed (#140, KDA-314); its stun code lives on as `src/panic.ts`. Players and Facing guide settings removed: players always bump, the arrow always shows (#139, KDA-315). Arrow outline (#137, KDA-325).
    - Co-op panic (#143, KDA-316): a friendly breath (Rush shove too) does no damage and panics the partner 1.5 s, then 1.5 s immunity. Panic sprites, variant A for all 13 characters (#145, KDA-317); players keep the "!" badge (`PANIC_MARK` in `render.ts`); enemies show the face while `enemyPanicked` (frozen by ice or the quake).
    - Left Shift breathes in 1-player games when 1P's breath is still the default (#138, KDA-322, `effectiveBindings`).
    - Main menu: 1 Player, 2 Players, Tutorial, Cards, Soundtrack, Settings (#142, KDA-318). Soundtrack page (#144, KDA-321). Cards page, tall-card variant B (#147, KDA-320; data in `cards.ts`, numbers filled from the code). Tutorial: tap-to-breathe on touch (#141) and pixel-kit pages B (#148, KDA-319).
    - Present boxes (#146, KDA-324): box A, quake look 2.
- **Not started: KDA-323** (redraw the opening and ending in pixel art). Waiting on the user's picks on https://claude.ai/artifact/DgMcNDdyHmpLsqP38PXoVJ : opening A/B/C, ending A/B/C, end-roll fix 1/2/3.
- **State:** `main` at `8f93a6a`, deployed (Pages run 41773460073, green). 3570 tests passing after the last merge. Open PRs: only #149 (`chore/update-the-promo-for-the-new-look`, another session's promo work: don't touch).
- **Not play-tested:** everything in the milestone. All its numbers are placeholders.

### Start here (new session)

1. The user has a new set of tasks: ask for them. File each as a Linear issue in project Dot Eater (new milestone unless it fits KDA-323's), one small PR each, merge when CI and tests are green.
2. KDA-323 is still open; ask the user for its picks if it isn't in the new list.
3. Offer a play-test preview of `main` (see "How we work"), and the tuning list below.

## Code map

Older modules are listed in `CLAUDE.md`. New or reshaped in this milestone:

| Module                                           | What it does                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `panic.ts`                                       | Co-op panic: `panic`, `panicked`, `tickPanics`, `playersStruck`, `panicPlayers`, `PANIC_SECONDS` |
| `present.ts`, `presentView.ts`, `presentData.ts` | Present box rules (drops, weights, contents, germ), reveal timing, pixel art                     |
| `cards.ts`, `cardsView.ts`, `cardArt.ts`         | Cards page data and view; the card frame shared with `endRollRender.ts`                          |
| `soundtrack.ts`                                  | Soundtrack track list and clock; `trackProgress` in `recorded.ts`                                |
| `tutorial.ts`, `tutorialView.ts`                 | Tutorial pages, binding text, scene scripts; DOM and drawing                                     |
| `flow.ts`                                        | Title menu (`TITLE_CHOICES`, `PAGE_CHOICES`), `pageScreen`/`pageBack` for the three pages        |
| `bindings.ts`                                    | `effectiveBindings(bindings, playerCount)` for the solo Left Shift rule                          |
| `touch.ts`                                       | Flick-to-run plus tap/hold to breathe (`TAP_CHARGE_DELAY`), `tick(dt)` from main                 |
| `sprites.ts`, `spriteData.ts`                    | Panic grids (`panicGrid`), badges incl. `panic` and `sweat`                                      |

## Open questions and follow-ups

- **Tuning at preview (placeholders):** `PRESENT_DROP_CHANCE` 0.15, `BOSS_DROP_AT` 75/50/25%, `PRESENT_SECONDS` 10, `PRESENT_WEIGHTS` 1/2/2.5/3/1.5, `HEAL_HEALTH` 25, `HUGE_DOT_DOTS` 10, `SPEED_BOOST` 1.4 for 5 s, `QUAKE_SECONDS` 4 (bosses not frozen), `TAP_CHARGE_DELAY` 0.2 s, `PANIC_SECONDS` 1.5 and its 1.5 s immunity. Older Rush/Tengu numbers in `docs/decisions.md` are also unjudged.
- **Things to check at preview:** a box opens as the move onto it starts; a Rush-rammed enemy's box appears while it's still flying; the germ shows the panic face in the air; soundtrack blips and loop jumps; tutorial arrow glyphs fall back to bold monospace (the Press Start 2P subset has no arrows).
- **Text fixes the user hasn't answered:** the Owl's card says "back 3 cells" (a level-1 tap pushes 2); `roster.ts` calls the Boar's Rush "Costly breath" (it costs 20, like Fire and Ice).
- **Card defaults the user didn't object to:** 15 cards incl. the Phantom Lord; Boar WALL BREAK / RUSH / "Slower, but rams the boss twice as hard"; Fox first seen stage 2.
- **Remaining emoji:** 💀 game over, 🔒, ✓, 💨 Breath button, 🔇/🔊 mute, 🎉 story end, ★/☆ on story clear. The KDA-323 page has pixel replacements for all of them.
- **Older follow-ups:** the per-dot eat sound fires ~0.125 s early (KDA-302); the deploy's `pnpm test` can time out on a slow runner (raise the 8 heavy simulation tests' limits); `README.md` is out of date.
- **Promo package (`video/`):** our PRs re-recorded `video/src/recordings/demo.json` (#146) and edited two lines for versus removal (#140) and the guide setting (#139). Tell the user if asked.

## Decisions already made

All settled decisions are in `docs/decisions.md` by topic. From this milestone, with the user:

- **2 players are co-op only**, always bumping; no Players or Facing guide settings. A friendly breath never hurts: 1.5 s panic, Rush shoves and panics.
- **Picks:** panic sprites A for all; cards B (tall card); tutorial B (pixel kit); present box A, quake look 2; germ lands next to the box, away from the player; bosses aren't frozen by the quake (default, to judge).
- **Menu:** flat list; the label is "2 Players", no "(co-op)". Soundtrack and Cards are all open from the start.
- **Present weights** (user): Heal 1, Huge dot 2, Speed 2.5, Earthquake 3, Germ 1.5; the germ never respawns.
- **Design pages:** sprites https://claude.ai/artifact/VFV6Hi2c3NcyaANzoPrAfX, cards https://claude.ai/artifact/WkfQhoWtzGT5DFVEp9yXWc, present box https://claude.ai/artifact/UjbnPMWndjAbezb1fJ2CLq, tutorial https://claude.ai/artifact/Bf5Rh38S755LX9Xtk31i75.

## How we work

- **Manager mode:** the user asked this session to run tickets as parallel agents and merge on green. Each agent gets its own worktree (`isolation: "worktree"`), merges origin/main before pushing, opens the PR, and doesn't merge. The manager waits for CI, merges with a merge commit (`gh api -X PUT repos/kdaisho/dot-eater/pulls/N/merge -f merge_method=merge`), and deletes the branch after checking `pulls?state=open&base=<branch>` is empty.
- **PRs branched before another merge:** test the combination first (detached worktree on the PR branch, `git merge origin/main`, `pnpm install`, `pnpm check`, `pnpm test`), merge one at a time, and send conflicts back to the PR's agent.
- **Design picks first:** visual tickets get an Artifact page with A/B/C variants (an agent writes scratchpad HTML; the manager reads all of it before publishing). Record picks as a Linear comment. Reject anything that resembles another game's famous designs (box B and C were redrawn for that).
- **Linear free plan:** the workspace hit its issue limit once (2026-11-03); the user deleted an old project to make room. If `save_issue` fails with "free issue limit", ask the user.
- **Previews:** detached worktree on `origin/main`, `pnpm install`, `pnpm dev --port <own port> --strictPort --host`, give the user `127.0.0.1`, not `localhost`. Scripted input pauses the game on blur, so play-testing is the user's.
- **Other sessions' work:** promo PRs and worktrees (`agent-a…` promo branches KDA-248–256, `promo3`, `promo4`, PR #149), `admin-debug`, `gold-opening`, `music-trims`, `preview-*`. Don't touch, merge or remove them.
- **Gotchas:**
    - The local `gh` is 2.3.0: use `gh api`. Plain `sleep` in the foreground is blocked; poll in a background loop.
    - A fresh worktree needs `pnpm install` before `pnpm check`, or check prints nothing.
    - The deploy's tests can time out on a slow runner; if the log shows only timeouts, rerun with `gh api -X POST repos/kdaisho/dot-eater/actions/runs/<id>/rerun-failed-jobs`.
    - `mergeable_state` reads `unknown` for a few seconds after a merge.
    - Disk is tight: remove agent worktrees once their PR merges.
