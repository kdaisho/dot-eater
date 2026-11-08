# Handover

Last updated: 2026-11-04. Read `CLAUDE.md` first for project conventions.

## Where things stand

- **Done and live (one line each):** organize code & tooling (#2–#12), engine (#14–#21), characters & breaths (#37–#43), stages (#23–#34, #44, #46), controllers & 2-player (#49–#52), polish (#55–#66), the "harder and more exciting" upgrade (#67–#103), presentation (music, Gold opening, end roll, admin mode, iOS sound; #105–#122), Refinement (#124–#136, KDA-294–307), Menus & co-op (#137–#148, KDA-314–325 except KDA-323).
- **UI polish milestone (Linear, 2026-11-04): all 6 done and live, PRs #151–#156.**
    - Type scale and tutorial zoom (#152, KDA-326): `--text-title/menu/body/small/tiny`, `--text-px`, `--text-px-small`, `--leading` on `:root` in `css/style.css`, `clamp()` on `vmin`; `body *` no longer forces 30px. `tutorialZoom(w, h)` (quarter steps 1–3; 1.5 at 1900×1150) and `pixelScale` in `tutorialView.ts`, `--z` scales the kit; main's resize listener redraws the tutorial.
    - Cards page (#151, KDA-327): `--page-s` from the window with no 2.2 cap, snapped to whole (1x) or half (2x) pixels above 2.2 via `round()`; bar, arrows and dots scale with `--u = --s / 2.2`. Phone layout unchanged.
    - Menu cursor (#153, KDA-328): every menu label is a `.menu-label` with `data-mark`; the ▶ hangs out of flow (Menu A). Soundtrack: one mark per row, ▶ selected, bobbing ♪ playing (Soundtrack C); no "▶ Play"/"■ Stop"; "(playing)" for screen readers.
    - Knockout (#155, KDA-329, Knockout C): `src/knockoutView.ts` (flash 0.09 s, white+gold rings to 2.75 cells by 0.55 s, grey 0.05–0.3, crumble 0.45–1.1 s into a pile kept until a new game; fog light on the fallen cell until 1.3 s). New `caught` sfx; the red caught particles are gone. Solo/last-player loss is held 1.3 s by `GameState.lossHeld` in `game.ts` (the `winHeld` pattern, counted down in `settle`) before `gameLost`.
    - Mute key (#154, KDA-330) and touch Pause (#156, KDA-331): pixel-kit keys (2px black border, #5c5c5c face, bevel, pressed state), icons from `PixelArt` grids via `src/pixelSvg.ts`; 36px, 44px on coarse pointers. Pause sits 8px left of mute (it used to sit under it).
- **Not started: KDA-323** (redraw the opening and ending in pixel art). Waiting on the user's picks on https://claude.ai/artifact/DgMcNDdyHmpLsqP38PXoVJ : opening A/B/C, ending A/B/C, end-roll fix 1/2/3.
- **State:** `main` at `550e4ec`, deployed (Pages run 41967130915, green). 3617 tests passing on the last combination. Open PRs: only #149 (another session's promo work: don't touch).
- **Play-tested:** the user previewed and approved ("good") the whole UI polish round before merge. The Menus & co-op tuning list below is still unjudged.

### Start here (new session)

1. Ask the user for the next tasks. File each as a Linear issue in project Dot Eater (new milestone unless it fits KDA-323's), one small PR each.
2. KDA-323 is still open; ask for its picks if it isn't in the new list.
3. Offer a play-test preview of `main` (see "How we work") and the tuning list below.

## Code map

Older modules are listed in `CLAUDE.md`. New or reshaped recently:

| Module                                           | What it does                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `knockoutView.ts`                                | Knockout C timeline and pile, render-only; drawn from `render.ts`                                |
| `pixelSvg.ts`                                    | `pixelSvg(doc, art)`: a `PixelArt` grid as crisp inline SVG (mute and pause icons)               |
| `muteButton.ts`, `dpad.ts`                       | `MUTE_ICONS`; `PAUSE_ICON` and the touch controls                                                |
| `tutorial.ts`, `tutorialView.ts`                 | Tutorial pages and scenes; `tutorialZoom`, `pixelScale`                                          |
| `cards.ts`, `cardsView.ts`, `cardArt.ts`         | Cards page data and view; the card frame shared with `endRollRender.ts`                          |
| `panic.ts`                                       | Co-op panic: `panic`, `panicked`, `tickPanics`, `playersStruck`, `panicPlayers`, `PANIC_SECONDS` |
| `present.ts`, `presentView.ts`, `presentData.ts` | Present box rules (drops, weights, contents, germ), reveal timing, pixel art                     |
| `soundtrack.ts`, `playerPage.ts`, `playlist.ts`  | Soundtrack track list; the player page at `soundtrack/` (KDA-332/333), its queue logic           |
| `flow.ts`                                        | Title menu (`TITLE_CHOICES`, `PAGE_CHOICES`), `pageScreen`/`pageBack` for the three pages        |
| `bindings.ts`, `touch.ts`                        | `effectiveBindings` (solo Left Shift); flick-to-run, tap/hold to breathe (`TAP_CHARGE_DELAY`)    |

## Open questions and follow-ups

- **Tuning (placeholders):** knockout timings (1.3 s hold; game-over input is ignored that much longer). Menus & co-op: `PRESENT_DROP_CHANCE` 0.15, `BOSS_DROP_AT` 75/50/25%, `PRESENT_SECONDS` 10, `PRESENT_WEIGHTS` 1/2/2.5/3/1.5, `HEAL_HEALTH` 25, `HUGE_DOT_DOTS` 10, `SPEED_BOOST` 1.4 for 5 s, `QUAKE_SECONDS` 4, `TAP_CHARGE_DELAY` 0.2 s, `PANIC_SECONDS` 1.5 + 1.5 s immunity. Older Rush/Tengu numbers in `docs/decisions.md`.
- **Unfiled UI notes:** on 320px phones the mute and Pause keys cover the right end of the HUD's health gauge (fine at 390px+). Tutorial zoom stops at 1.5 on 1900×1150 because the Keyboard/Controller/Breath pages would scroll at 2; a fuller screen needs a new layout for them. Cards snap down to whole pixels, so at 1x the card fills ~70% of the height (half-pixel steps would fill more).
- **Text fixes the user hasn't answered:** the Owl's card says "back 3 cells" (a level-1 tap pushes 2); `roster.ts` calls the Boar's Rush "Costly breath" (it costs 20, like Fire and Ice).
- **Remaining emoji:** 💀 game over, 🔒, ✓, 💨 Breath button, 🎉 story end, ★/☆ on story clear. The KDA-323 page has pixel replacements; `pixelSvg.ts` is the way to draw them.
- **Older follow-ups:** the per-dot eat sound fires ~0.125 s early (KDA-302); the deploy's `pnpm test` can time out on a slow runner (raise the 8 heavy simulation tests' limits); `README.md` is out of date.
- **Promo package (`video/`):** #155 switched `video/src/effects.test.ts`'s sample burst from a knockout to a hurt event; the promo doesn't draw the new knockout. Earlier: `demo.json` re-recorded (#146), two lines edited (#139, #140). Tell the user if asked.

## Decisions already made

All settled decisions are in `docs/decisions.md` by topic. Recent ones, with the user:

- **UI polish picks** (https://claude.ai/artifact/MA6pcxBy8Z1u1LBQwBoLYd): Menu A (hanging ▶) on every menu, Soundtrack C (▶/♪ gutter mark), Knockout C (shockwave crumble). One type scale for all overlay views. Mute and Pause as pixel keys.
- **2 players are co-op only**, always bumping; a friendly breath never hurts (1.5 s panic; Rush shoves and panics).
- **Earlier picks:** panic sprites A; cards B (tall card); tutorial B (pixel kit); present box A, quake look 2; germ lands next to the box; bosses aren't frozen by the quake. Menu: flat list, "2 Players". Present weights Heal 1, Huge dot 2, Speed 2.5, Earthquake 3, Germ 1.5.

## How we work

- **Manager mode:** run tickets as parallel agents, each in its own worktree (`isolation: "worktree"`); the agent merges origin/main before pushing, opens the PR and doesn't merge. Keep its worktree until the PR merges (removing it makes the agent unresumable).
- **Visual or gameplay PRs:** combine them in one detached preview worktree (`git worktree add --detach .claude/worktrees/preview-<name> origin/main`, `git merge` the PR branches, `pnpm install`, `pnpm check`, `pnpm test`), serve with `pnpm dev --port <free port> --strictPort --host`, give the user `127.0.0.1:<port>` and the LAN URL for the iPad. Merge after the user says "good" and CI is green, one at a time with a merge commit (`gh api -X PUT repos/kdaisho/dot-eater/pulls/N/merge -f merge_method=merge`), then delete the branch after checking `pulls?state=open&base=<branch>` is empty. Mark the Linear issues Done.
- **Design picks first:** an agent writes A/B/C variants as scratchpad HTML; the manager reads all of it before publishing it as an Artifact. Record picks as a Linear comment. Reject anything resembling another game's famous designs.
- **Linear free plan:** if `save_issue` fails with "free issue limit", ask the user.
- **Other sessions' work:** promo PRs and worktrees (`agent-a…` promo branches KDA-248–256, `promo3`, `promo4`, PR #149), `admin-debug`, `gold-opening`, `music-trims`, `preview-followups`, `preview-refine`, `preview-upgrade`. Don't touch, merge or remove them.
- **Gotchas:**
    - The local `gh` is 2.3.0: use `gh api`. Plain `sleep` in the foreground is blocked; poll with a bounded loop (e.g. `perl -e 'select(undef,undef,undef,10)'`).
    - A fresh worktree needs `pnpm install` before `pnpm check`, or check prints nothing.
    - The local main checkout can fall behind other sessions' merges: `git fetch` and `git merge --ff-only origin/main` before reading the handover's state.
    - Chrome via the extension won't resize the window; agents check other sizes by loading the game in fixed-size iframes.
    - The deploy's tests can time out on a slow runner; if the log shows only timeouts, rerun with `gh api -X POST repos/kdaisho/dot-eater/actions/runs/<id>/rerun-failed-jobs`.
    - `mergeable_state` reads `unknown` for a few seconds after a merge.
    - Disk is tight: remove agent and preview worktrees once their PRs merge.
