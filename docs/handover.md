# Handover

Last updated: 2026-11-03. Read `CLAUDE.md` first for project conventions.

## Where things stand

- **Done and live:**
    - Organize code & tooling (#2–#12), engine (#14–#21), characters & breaths (#37–#43), stages (#23–#34, #44, #46), controllers & 2-player (#49–#52), polish (#55–#66).
    - The "harder and more exciting" upgrade (#67–#97, KDA-257–287) and tougher enemies (#98–#103, KDA-288–293).
    - Presentation (no Linear issues): recorded music (#105, #109), the Gold opening (#106), the end roll (#107, #108, #110, #114, #122), admin debug mode (#111, #120), iOS sound and mute (#113), two feedback rounds (#115–#121).
    - **Refinement milestone (2026-11-02/03, KDA-294–307, PRs #124–#135), all merged and deployed:**
        - Punch and guard removed (#127, KDA-294). The breath can be charged during the cooldown; a let-go charge fires when the cooldown ends (#124, KDA-295). The Tengu moves 3.5–4 cells/s, uncapped (#125, KDA-296). The clear jingle waits for the glide into the last dot (#126, KDA-302). "Quit to title" on every pause menu (#128, KDA-305).
        - The Boar's breath is **Rush** (#129, KDA-304): dash 1–3 cells, rammed enemies fly 2–6 cells and are defeated on the slam, chain pushes, walls break, the boss is staggered 0.6 s. `bossFight.test.ts` proves every animal can beat both bosses.
        - Pixel sprites replace all character emoji (#130, KDA-297/298/300): variant C of everything, Kitsune (stage 5) and the opening's final boss (stage 10). Per-stage pixel walls, floors, dots, fog tints and breath-effect tiles (#131, KDA-299/300).
        - Boss defeats (#132, KDA-301/303): Kitsune shatters (2.0 s), the final boss dies in an explosion chain (2.5 s), then everyone hops with hearts over the freed enemies (2.4 s).
        - After play (2026-11-03): a Rush ram does 2× boss damage (`RAM_BOSS_SCALE`, `BreathDef.bossDamageScale`; #134, KDA-306). The Rush dash glides in `DASH_SECONDS` 0.1 s and the rammed enemy is drawn flying (`FLIGHT_SECONDS` 0.18, one spin) from the impact to its slam; `src/rushView.ts` holds the impact and defeat events until then, render-only (#135, KDA-307). The user approved it ("good") and asked to deploy.
- **State:** `main` at `9e2a41f`, live on Pages (deploy run 41583974718, green on its second attempt). 3525 tests passing. Open PRs: none. Linear: every Refinement issue is Done.
- **Play-tested so far:** the Rush (damage and timing). The rest of the Refinement work hasn't had feedback yet. A preview of `main` runs at `http://127.0.0.1:5241/` (worktree `.claude/worktrees/preview-refine`, `pnpm dev --port 5241 --strictPort --host`; LAN `http://192.168.25.55:5241/`). It may be gone in a new session: restart it the same way after `git checkout --detach origin/main`.

### Start here (new session)

1. Ask the user what the next tasks are (they said they have some). Offer a preview of `main` if they want to play first, and use the placeholders and visual questions below as prompts.
2. File each piece of feedback as a Linear issue in project Dot Eater (milestone Refinement, or a new one), ship each as its own small PR, merge when CI and tests are green.

## Code map

The older modules are listed in `CLAUDE.md`. Newer or reshaped ones:

| Module                                       | What it does                                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `difficulty.ts`                              | `ENEMY_COUNT`, `MAP_SIZE`, `ENEMY_SPEED_SCALE` and `enemySpeed()`, `TENGU_SPEED` and `tenguSpeed()`                               |
| `game.ts`                                    | `step`, `hurtPlayer`, `knockBack` (the player's, on a hit), `checkEnd`, ice slides                                                |
| `breath.ts`, `breaths/`                      | Breath engine: shapes line/cone/area/flood/self/spread (`resolveShape`), `chargeTick`, `chargeLevel`, `affordable`, `sightScale`  |
| `ai.ts`, `intercept.ts`                      | Enemy AI and the spread rule; the interceptor's route prediction and fade                                                         |
| `enemyBreath.ts`, `bossBreath.ts`, `boss.ts` | The breather's and the boss's breaths; boss health                                                                                |
| `render.ts`                                  | Canvas: sprites, fog lights (`createFog`, one `Light` per player), aim tints; scales the maze art from `tiles.ts` on              |
| `tiles.ts`                                   | Per-stage pixel tiles (KDA-300/299): `STAGE_STYLES`, `wallPixel`, `tileCodes`, `MapArt` (repaints changed cells), `EFFECT_TILES`  |
| `sprites.ts`, `spriteData.ts`                | Pixel sprites (KDA-300): grids and palettes, lookups by animal/AI/boss, outline, facing, walk frames, Kitsune tails, raster cache |
| `touch.ts`                                   | Flick-to-run (`TouchSource.follow(heading(player))` from main's tick), the Breath button                                          |
| `audio.ts`, `music.ts`, `recorded.ts`        | Music and effects, `LIMITER`, `browserAudioContext` (iOS session); recorded tracks and loop points                                |
| `muteButton.ts`                              | The 🔊/🔇 button; its toggle saves `settings.muted`                                                                               |
| `opening.ts`, `openingView.ts`               | The Gold opening before the title                                                                                                 |
| `endRoll.ts`, `endRollRender.ts`             | The end roll after the story ending                                                                                               |
| `bossDefeat.ts`, `defeatRender.ts`           | A boss's defeat in the outro (KDA-301) and the final boss's hops (KDA-303): the timeline, and its drawing                         |
| `admin.ts`, `adminPanel.ts`, `adminHash.ts`  | Debug mode behind the passphrase hash; `adminBadge.ts` is its on-screen label and Clear button                                    |
| `flow.ts`, `progress.ts`                     | Difficulty select, story and stage modes; bests by difficulty                                                                     |

## Open questions and follow-ups

- **Tuning to judge at preview** (all placeholders):
    - Rush: reach `rushRange` 1,2,2,3,3; knock flight level+1; boss stagger `RAM_STAGGER` 0.6 s; chain into boss `CHAIN_BOSS_SHARE` 0.25; ram 2× boss damage (`RAM_BOSS_SCALE`); dash `DASH_SECONDS` 0.1, flight `FLIGHT_SECONDS` 0.18, `FLIGHT_TURNS` 1.
    - `TENGU_SPEED` 3.5/3.65/3.8/4: at Easy it equals the Boar, and stage 1's first enemy is near player speed.
    - A charge let go during the cooldown fires at its release level (it doesn't keep growing).
    - A short silence (up to one glide) between the music stopping and the clear jingle.
    - Older: Dragon spread reach and cost, charge glow, damage numbers, enemy speed scale, breather and interceptor numbers.
- **Visual questions to ask at preview:**
    - A frozen enemy shows both the ice-cube badge and the ice-block frame tile (`breaths/penguin.ts` FROZEN). Keep both or drop one?
    - Quit from stage mode goes to the title; should it go to the stage select instead?
    - End roll: 15 cards in a 5×3 grid is tight vertically; staff credits now show ~3.3 s each.
    - Defaults we chose (user didn't answer): sprite outline on, light outline on dark floors (stages 8–10), Oni blue, walls fill the cell, per-stage fog tint, regrow markers, tunnel marks.
- **Follow-ups not filed:** the per-dot eat sound and sparkle fire ~0.125 s before the sprite reaches the dot (KDA-302 left it). Remaining emoji: mute button, touch Breath button 💨, menu title icons.
- **Known gaps:** iOS before 17 has no `audioSession`; a tab on an old build during a deploy can cut stage 6+ progress; stage 7's middle patroller crosses the spawn corridor; `README.md` is out of date.
- **Promo package (`video/`, another session's):** its tests run in our suite, so our PRs re-recorded scenes: the punch and guard scenes are deleted, promo3's fight is one Breather shot, the dragon scene's seed is 36, the boar scene's is 30, and the boss scene ends mid-outro. Tell that session's owner (the user) if asked.

## Decisions already made

All are in `docs/decisions.md` by topic. With the user in the Refinement round (settled):

- **Punch and guard:** removed. **Breath:** keep the cooldown for firing so the boss can't be burst; only charging ignores it.
- **Tengu:** about as fast as the animals. **Boar:** Rush, and a rammed enemy is defeated on the slam; shoved enemies are only pushed; a shoved player takes no damage; a boss hit by a flying enemy takes a little damage.
- **Sprites:** variant C of every character; Owl C with bigger 3×3 pupils. **Mid-boss:** Kitsune, tails show its health. **Final boss:** the opening's boss. **Stage styles:** 1 C, 2 C, 3 B, 4 A, 5 A, 6 B, 7 A, 8 B, 9 C, 10 B (KDA-299 has the names).
- **Boss defeats:** Kitsune "freeze-frame and burst", final boss "explosion chain", then everyone hops for joy. Design pages: sprites https://claude.ai/artifact/7iB8DBTZm6timchYVZDcja, stages https://claude.ai/artifact/4iQjJ92S949GWFckFmGZPP, defeats https://claude.ai/artifact/GPAWjs8h2xnNsN9eTFmUHL.

## How we work

- **Merging:** the user's standing rule: merge once CI is green and tests pass, with merge commits (`gh api -X PUT repos/kdaisho/dot-eater/pulls/N/merge -f merge_method=merge`). In the Refinement round the user said to merge gameplay and visual PRs on green too, and preview afterwards; ask if unsure for a new round. Before deleting a branch, check `pulls?state=open&base=<branch>` is empty, then `gh api -X DELETE .../git/refs/heads/<branch>`.
- **Design choices go to the user as Artifact pages** with A/B/C variants (scratchpad HTML, read before publishing, then `Artifact` publish); record the picks in the Linear issue.
- **Overlapping PRs:** merge one at a time; recheck `mergeable_state` (it reads `null`/`unknown` for a few seconds after a merge) and run tests on the combination. A `dirty` PR gets no CI run.
- **Previews:** a detached worktree (`git worktree add --detach .claude/worktrees/preview-N origin/<branch>`, merge the other PR's branch locally, `pnpm install`), then `pnpm dev --port <own port> --strictPort --host`. Never commit preview edits.
    - **Use a port no other session uses and give the user `127.0.0.1`, not `localhost`.** Another session's server bound to `[::1]:5199` while ours held `*:5199`; `localhost` resolves to `::1` first, so the user tested the wrong build. Check with `lsof -nP -iTCP:<port> -sTCP:LISTEN`.
    - Scripted browser input pauses the game on blur, so play-testing is the user's; offer the iPad LAN URL for touch.
- **Other session's work:** the promo PRs (#63/#64/#66, #112, KDA-248–256), worktrees `agent-a…`, `promo3`, `preview-upgrade` and its port-5199 server. Don't touch, merge or remove them.
- **Gotchas:**
    - The local `gh` is 2.3.0: use `gh api`.
    - Plain `sleep` is blocked; poll in a bounded loop.
    - The deploy's `pnpm test` can time out on a slow runner (8 heavy simulation tests hit their 30 s / 5 s limits on 2026-11-03 while the same code passed PR CI). Check the log: if it's only timeouts, rerun with `gh api -X POST repos/kdaisho/dot-eater/actions/runs/<id>/rerun-failed-jobs`. Raising those limits is an unfiled follow-up.
    - `gh api .../actions/jobs/<id>/logs` needs `--allow-escape-sequences`, or it prints nothing useful.
    - A fresh worktree needs `pnpm install` before `pnpm check`, or check prints nothing.
    - Tests that are about line mechanics use `lineFire()` (`src/test/helpers.ts`), since the Dragon no longer fires a line.
    - Disk is tight: remove worktrees when done.
    - To check a regression test fails without the fix, commit (or copy the file) first: `git checkout <file>` to undo the mutation also wipes uncommitted work.
