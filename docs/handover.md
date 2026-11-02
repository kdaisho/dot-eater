# Handover

Last updated: 2026-11-01. Read `CLAUDE.md` first for project conventions.

## Where things stand

- **Done and live:**
    - Organize code & tooling (#2–#12), engine (#14–#21), characters & breaths (#37–#43), stages (#23–#34, #44, #46), controllers & 2-player (#49–#52), polish (#55–#66).
    - The "harder and more exciting" upgrade (#67–#97, KDA-257–287) and tougher enemies (#98–#103, KDA-288–293).
    - Presentation (2026-10-31 to 11-01, no Linear issues): recorded stage music (#105, trims #109), the Gold opening before the title (#106), the end roll after the story ending (#107, #108, #110, UFO spotlight #114).
    - Admin debug mode (#111): `#admin` opens a panel; the passphrase opens every stage and stops saving clears. The passphrase is in the env var `ADMIN_PASSPHRASE` (`.env.local` and the repo secret); only its salted hash ships. Never put it in code, docs or chat.
    - iOS sound and mute (#113): sound plays in iOS silent mode (`navigator.audioSession.type = "playback"`, iOS 17+ only); a 🔊/🔇 button (`muteButton.ts`, `#mute`) on every screen, unmuted by default.
    - User feedback round (#115, #116):
        - Dragon fire is a forward **spread**: round corners, split at junctions, each branch stops at the first enemy it defeats. Reach 2 for a tap, +1 a level, 6 at level 5 (`fireRange`; the user found 3–7 too strong).
        - Touch: a flick keeps the player running with no finger down; a flick opposite the motion stops it; a flick to the side turns at the next opening. Keys, pads and the D-pad still move only while held.
- **State:** `main` at `95e09b6`, deploy green, 3213 tests passing (run 2026-11-01 on #115 + #116 combined).
- **Open PRs:**
    - [#117](https://github.com/kdaisho/dot-eater/pull/117) `chore/let-the-owl-see-further-in-fog`: each player has its own fog light (`BreathDef.sightScale`); the Owl's is 1.5×, so 6 cells on stages 4 and 8. CI green.
    - [#118](https://github.com/kdaisho/dot-eater/pull/118) `chore/show-a-charging-breath-on-the-character`: a charging player glows (`chargeAura` in `render.ts`): amber, growing per level, red and flickering at full charge. CI green.
    - #63 → #64 → #66 and #112: promo video, another session's. Don't touch.

### Start here (new session)

1. Ask the user for their verdict on #117 and #118. A combined preview is at `.claude/worktrees/preview-117-118` on port 5201 (`http://127.0.0.1:5201/`, iPad `http://192.168.25.55:5201/`); if it's gone, rebuild it (see "Previews"). Tune what they ask, then merge both (they touch different parts of `render.ts` and merged cleanly together; 3221 tests passed combined).
2. After merging: delete the branches, pull `main`, wait for the deploy, stop the preview, remove worktrees `owl-sight`, `charge-aura`, `preview-117-118`, `handover`.
3. Ask the three open questions below if the user hasn't answered them.

## Code map

The older modules are listed in `CLAUDE.md`. Newer or reshaped ones:

| Module                                       | What it does                                                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `difficulty.ts`                              | `ENEMY_COUNT`, `MAP_SIZE`, `GUARD` odds, `ENEMY_SPEED_SCALE` and `enemySpeed()`                                                  |
| `game.ts`                                    | `step`, `hurtPlayer`, `knockBack`, `checkEnd`, knock state, ice slides                                                           |
| `punch.ts`, `guard.ts`                       | The punch and `knockEnemy`; guard rolls, `blockChance`, the 0.4 s stance                                                         |
| `breath.ts`, `breaths/`                      | Breath engine: shapes line/cone/area/flood/self/spread (`resolveShape`), `chargeTick`, `chargeLevel`, `affordable`, `sightScale` |
| `ai.ts`, `intercept.ts`                      | Enemy AI and the spread rule; the interceptor's route prediction and fade                                                        |
| `enemyBreath.ts`, `bossBreath.ts`, `boss.ts` | The breather's and the boss's breaths; boss health                                                                               |
| `render.ts`                                  | Canvas: sprites, fog lights (`createFog`, one `Light` per player), aim tints, guard sprites                                      |
| `touch.ts`                                   | Flick-to-run (`TouchSource.follow(heading(player))` from main's tick), the Punch/Breath buttons                                  |
| `audio.ts`, `music.ts`, `recorded.ts`        | Music and effects, `LIMITER`, `browserAudioContext` (iOS session); recorded tracks and loop points                               |
| `muteButton.ts`                              | The 🔊/🔇 button; its toggle saves `settings.muted`                                                                              |
| `opening.ts`, `openingView.ts`               | The Gold opening before the title                                                                                                |
| `endRoll.ts`, `endRollRender.ts`             | The end roll after the story ending                                                                                              |
| `admin.ts`, `adminPanel.ts`, `adminHash.ts`  | Debug mode behind the passphrase hash                                                                                            |
| `flow.ts`, `progress.ts`                     | Difficulty select, story and stage modes; bests by difficulty                                                                    |

## Open questions and follow-ups

- **Asked 2026-10-31, no answer recorded:**
    - **Boar charge cost:** a full charge at a single wall spends all 100 energy. Recommend paying only for walls broken.
    - **Touch Breath button:** show the charge level while held? (#118's glow may answer this; ask.)
    - **Boar breaking the outer wall:** A (dead-end notch, easy) or B (bores through and wraps, medium). Recommend B, own PR.
- **Tuning to judge at preview** (all placeholders): Dragon spread reach and cost (20 a level); the charge glow's size, colours, flicker; damage numbers; knockback decay; guard odds; charge 0.25 s per level; enemy speed scale; breather and interceptor numbers.
- **Known gaps:**
    - iOS before 17 has no `audioSession`, so silent mode still mutes the game there.
    - A tab open on an old build during a deploy can cut stage 6+ progress from the save.
    - Stage 7's middle patroller crosses the spawn corridor. `README.md` is out of date.

## Decisions already made

All are in `docs/decisions.md` by topic (Breaths: Energy, Charge, the five breaths, Fog; Enemies: Punch, Spread rule, Interceptor, Breather). With the user this round:

- **Dragon:** spreading fire that can't pass enemies (each branch stops at one), reach 2–6. Settled after play.
- **Touch:** flick to run, flick opposite to stop, flick sideways to turn. Only touch latches; other inputs are hold-to-move.
- **Mute button:** on every screen, default unmuted.
- **Owl:** sees 1.5× as far in fog (#117, awaiting play). **Charge glow:** visual on the character so players needn't watch the meter (#118, design was our call).

## How we work

- **Merging:** the user's standing rule: merge once CI is green and tests pass, with merge commits (`gh api -X PUT repos/kdaisho/dot-eater/pulls/N/merge -f merge_method=merge`). For gameplay or visual changes, give the user a local preview first and merge on their go-ahead. Before deleting a branch, check `pulls?state=open&base=<branch>` is empty, then `gh api -X DELETE .../git/refs/heads/<branch>`.
- **Overlapping PRs:** merge one at a time; recheck `mergeable_state` (it reads `null`/`unknown` for a few seconds after a merge) and run tests on the combination. A `dirty` PR gets no CI run.
- **Previews:** a detached worktree (`git worktree add --detach .claude/worktrees/preview-N origin/<branch>`, merge the other PR's branch locally, `pnpm install`), then `pnpm dev --port <own port> --strictPort --host`. Never commit preview edits.
    - **Use a port no other session uses and give the user `127.0.0.1`, not `localhost`.** Another session's server bound to `[::1]:5199` while ours held `*:5199`; `localhost` resolves to `::1` first, so the user tested the wrong build. Check with `lsof -nP -iTCP:<port> -sTCP:LISTEN`.
    - Scripted browser input pauses the game on blur, so play-testing is the user's; offer the iPad LAN URL for touch.
- **Other session's work:** the promo PRs (#63/#64/#66, #112, KDA-248–256), worktrees `agent-a…`, `promo3`, `preview-upgrade` and its port-5199 server. Don't touch, merge or remove them.
- **Gotchas:**
    - The local `gh` is 2.3.0: use `gh api`.
    - Plain `sleep` is blocked; poll in a bounded loop.
    - A fresh worktree needs `pnpm install` before `pnpm check`, or check prints nothing.
    - Tests that are about line mechanics use `lineFire()` (`src/test/helpers.ts`), since the Dragon no longer fires a line.
    - Disk is tight: remove worktrees when done.
