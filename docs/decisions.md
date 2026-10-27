# Decisions

Settled decisions, grouped by topic. "Product decision" or "with the user" means the user decided: don't reopen it without asking. The handover (`docs/handover.md`) keeps only the decisions the next work touches.

## Gameplay and characters

- **Core** (product decisions): grid-based movement with smooth animation (not free movement); each character has a signature breath plus one stat; breaths use an energy meter refilled by eating dots; local 2-player has both co-op and versus; stages unlock in order.
- **Characters** (with the user): five animals in `roster.ts` (Dragon, Penguin, Owl, Skunk, Boar). The Dragon 🐉 is the default; the fly 🪰 is retired. The player sprite and the HUD lives are the playing character's emoji. Stars and par are the same for every character (revisit after playtesting).
- **Score and lives:** `DOT_POINTS` 10, `START_LIVES` 3. A collision with lives left costs one and respawns everyone at their spawns in the same tick, keeping dots and score. A collision on the last life is game over. Eating the last dot always wins, even if caught on that tick (product decision).
- **Stars and bests:** 1 star for clearing, +1 for losing no lives, +1 for a clear time at or under the level's `parTime` (par rounded to whole ticks). Clear time is `GameState.ticks`, counted only by `step()`, so pauses and the ending outro don't count; shown as `m:ss.s`, rounded up. Bests are per stage in the v1 save as `stars` (max) and `bestTime` (min, ticks); merging with another tab keeps the better of each. Par times: 60, 70, 80, 75 s.

## Breaths

- **Energy** (KDA-208, with the user): the meter holds 100 (Skunk 150) and gains 5 per dot; it starts empty each stage and is kept when a life is lost. Costs: Dragon 50, Penguin 50, Owl 25, Skunk 50, Boar 75; no breath without enough energy. Cooldown 1 s after each breath (Owl 0.5 s). Breath kills score 50. A press that can't breathe is dropped, not buffered. A breath that refuses (`fire` returns `false`) spends nothing and starts no cooldown.
- **Defeated enemies** (with the user): respawn alone at their spawn after 5 s, blinking for the last 1 s; while gone they don't move, catch or show. When the player loses a life, every enemy goes back to its spawn in play with no statuses, a pending respawn included. Tile effects, energy and the cooldown carry over a lost life. An enemy coming back onto a player standing on its spawn can catch at once (the blink is the warning).
- **Facing** (with the user: starts right, breathing mid-slide allowed): explicit on the player (`Breather.facing`), the way it last moved, including slide steps and tunnels. At a move opportunity where every tried way is blocked it turns to the first one tried, so it can face a wall. It faces right again after a lost life. A mid-slide breath fires along the slide.
- **Statuses:** a held enemy stays where it is drawn (drawn without frame alpha), a harmless one doesn't catch, a solid one blocks the player like a wall and ends a slide next to it. Enemies still overlap each other.
- **Changing grids:** `GameState.ice` is the level's ice (`floorIce`) plus ice tile effects and is replaced, never mutated, when it changes, so `hasIce`'s per-grid cache holds. Opened walls change `cells` directly. Temporary ice never forms under a character.
- **The five breaths** (KDA-216–220; the numbers are tunable after playtesting):
    - 🐉 Dragon: line, range 5. Defeats the first enemy hit (an enemy on the player's own cell counts first) and stops there; the cells it passed burn 2 s (`dragon.burning`, blocks enemies, not the player). Refuses facing a wall with nothing to hit.
    - 🐧 Penguin: cone, range 3. Freezes enemies 3 s (holds, harmless, solid); covered floor becomes ice for 5 s. Refuses facing straight into a wall with no enemy on its cell. Stat (PM decision): "slides faster on ice", 1.5× speed on forced slide steps only (`BreathDef.slideSpeedScale`, applied through `GameState.playerRate`, set in `movePlayerTick`; the renderer glides the player at that rate). "Farther" was dropped: slides already run to normal floor or a wall.
    - 🦉 Owl: line, range 5. Pushes every enemy in it, one on the player's cell included, 3 cells along the facing; a 0.25 s look-only gust. Refuses when the line is empty and nobody is on the player's cell.
    - 🦨 Skunk: area, radius 1 (3×3 through open cells, the player's cell included), 5 s where breathed; blocks enemies. The 💨 centre is its own effect (`skunk.stink.centre`). An enemy already on the player's cell still catches.
    - 🐗 Boar: line, range 1. Opens the inner wall in front for 10 s (rubble look, no dot); refuses outer (border) walls and empty floor. Moves at 3.5 cells/s (`speedScale` 0.875).

## Breath contract

A breath file exports one `BreathDef` (types in `src/breath.ts`): `animal`, `shape` (`line`/`cone` with `range`, `area` with `radius`, or `self`), `cost`, `cooldown`, `duration` (informational), `maxEnergy`, `speedScale`, optional `slideSpeedScale`, and `fire(hit)`. Return `false` from `fire`, before changing anything, to refuse.

`fire` gets a `BreathHit`: `origin` (the player's cell), `facing`, `cells` (the shape resolved against the maze, nearest first, never walls; walls stop it, tunnels wrap; never the origin), `wall` (the wall a line, or a cone's first cell, stopped at), `enemies` (enemies in play on `cells`, nearest first; a line or cone also lists enemies on `origin` first), `state` (read only), and the effects:

- `defeat(enemy)`: +50; the enemy waits at its spawn, out of play and not drawn, blinks for the last 1 s and is back after 5 s (a patroller restarts its route). A whole Splitter splits instead.
- `addStatus(enemy, status, seconds)`: `EnemyStatus` flags `holds`, `harmless`, `solid`, and a `look`. The same `name` again refreshes to the longer time.
- `addTile(pos, effect, seconds)`: `TileEffect` flags `blocksEnemies` (every AI, phantoms too, treats it as a wall; an enemy inside leaves by the shortest way; a player or patrol waypoint inside still draws enemies to the patch's nearest edge), `ice` (never under a character; the ice grid is rebuilt once after `fire`), `opensWall` (only on a wall; grows back when it ends, pushing anyone inside back where they came from, else to the nearest open cell), and a `look`. Tiles dedupe by `name` and position. A look-only tile is a pure visual.
- `push(enemy, step, distance)`: up to `distance` cells, through tunnels, stopping before walls (not at `blocksEnemies` cells); it glides in over the last cell, so it slides on if it lands on ice. Collisions that tick start from where it lands. If the glide-in would start where the player is drawn (its cell or `lastPos`), the enemy is drawn on its new cell at once and doesn't slide, so a push never catches on its own tick.

`Look` is `{ color?, emoji? }`: for a tile, a fill under any dot plus an emoji on top; for an enemy, a disc behind the sprite plus a small badge. Give each status and effect a unique `name` such as `"dragon.burning"`. Test with `makeState(..., { breath })` and `MoveInput.breath: true` (`src/game.breath.test.ts`, `testBreath` in `src/test/helpers.ts`, one `src/breaths/<animal>.test.ts` per breath).

Order inside `step`: breath timers count down (expiries, regrowth, respawns), the player moves (setting its facing), the breath fires from the player's new cell, enemies' tick starts are re-read, enemies move, then collisions.

## Enemies

- **Types:** up to 4 enemy slots (`ENEMY_IDS`). An unknown AI type throws. Sprites follow the AI type (`ENEMY_SPRITES`): random 👺, chase 👹, ambusher 🦊, patroller 🤖, phantom 👻, splitter 🦠.
- **Chase AI** scores each forward candidate by BFS distance to the player with the enemy's own cell blocked, so the no-reverse rule can't send it into a dead end. Ties go to direction order; an unreachable player falls back to the first candidate. On levels with ice the distance is slide-aware (`slideDistances` in `ice.ts`); without ice (`hasIce`) it uses plain `distanceMap`. Blocked tiles: enemies move on `blockedView` (blocked cells are walls) but measure distance on `goalView`, which reopens the blocked patch containing the goal, so they head for its nearest edge.
- **Ambusher** aims `AMBUSH_AHEAD` (4) cells ahead along the player's latest move (straight line, no wrap; walks back to the first open cell, else the player) and reuses chase scoring.
- **Patroller** follows a looped `route: [[x, y], ...]` by shortest path, may turn back, restarts the route on respawn; pathing is slide-aware (KDA-230).
- **Phantom** ignores walls, stays on the map, doesn't use tunnels, defaults to `PHANTOM_SPEED` (1.5), never slides.
- **Splitter** (KDA-229, with the user): `ai: "splitter"`, chases at the default enemy speed. Only `defeat` splits it (+50), through `defeatEnemy`, so every defeating breath gets it. Two halves on its cell chase at `SPLITTER_HALF_SPEED` (2.5), drawn at `HALF_SCALE` (0.65), never split again, +50 each, and don't respawn alone; when both are gone it is back whole at its spawn after 5 s with the blink. A lost life resets it to one whole Splitter. It owns two adjacent enemy slots (the spare is out of play with `respawnIn = GONE`, Infinity), so `parseLevel` counts it as 2 toward the cap. Spreading: halves go to the two open neighbours farthest from the player, never onto the player's cell or `lastPos`; in a dead end they share a cell; with no free neighbour they go to the nearest free cells further out; if the Splitter stood on either player cell they start at rest. Guarantee: a split never catches the player on the split tick or right after.

## Movement, input and collisions

- **Speeds:** player 4 cells/s, enemies 2 cells/s by default (applied only in `createCharacter`); levels may override `playerSpeed` and per-enemy `speed`.
- **Move progress** keeps the leftover past 1 when a character moves, so speeds that don't divide 60 Hz average out. A character that is ready but can't move waits at exactly 1. The player starts ready (`moveProgress` 1); enemies start at 0, a short grace period.
- **Input:** keys are matched by `KeyboardEvent.code`. P1: arrows, ShiftRight breath, P/Escape pause, Space confirm. P2 (defined, not attached): WASD, ShiftLeft, Q, E. Auto-repeat never presses; a missed keyup or keydown recovers on the next keydown. A direction held when play starts from a menu (character select or Retry) is ignored until pressed again (`InputState.ignoreHeld`); resuming from pause isn't affected.
- **Tap buffer:** the newest freshly pressed direction is kept in `GameState.bufferedStep` and tried first at the next move opportunity, then the held directions (`MoveInput.held`, newest first); cleared at that opportunity either way.
- **Collisions** (KDA-231, product decision) are on drawn positions (`drawnPos`: `lastPos` to `pos` by `moveProgress` capped at 1, no frame alpha). The player is caught when an enemy comes within `CATCH_DISTANCE` (0.6; sprites are `SPRITE_SCALE` 0.8 wide) at any moment of the tick, exact and wrap-aware (`wrapDelta`). Any touch is a catch, including from behind (product decision). Enemies aim at the player's start-of-tick cell; a chaser on the player's logical cell aims at its `lastPos`.
- **Ice:** a separate ice grid beside the cells. A character slides when it stands on ice, its latest move was one cell and the next cell that way isn't a wall (or a solid enemy, for the player); it moves that way on its move turns, ignoring input and AI, and stops on normal floor or against a wall. Slides go through tunnels and eat dots. A mid-slide tap stays buffered until the first free move.

## Levels, stages and screens

- **Levels:** typed `.ts` modules exporting JSON-serializable `LevelData`. Map characters: `#` wall, `.` dot, space empty, `~` ice, `:` ice with a dot, `P` player spawn, `E` enemy spawn (starts on a dot). Enemies pair with `E`s in reading order. The map is the only source of dots. `parseLevel` rejects: no dots, unreachable dots, an open edge cell that wraps into a wall, wrong spawn counts, more enemy slots than 4 (a Splitter counts 2), bad patroller routes, speeds above `TICK_RATE`, a `parTime` that isn't positive whole tenths of a second, bad `rules` (unknown keys, fog radius below 1.5), and any reachable state from which sliding can strand the player.
- **Stages:** stage 1 "Classic" replaced the old 9x9 level 1, kept as the `OLD_LEVEL` test fixture (map-dependent tests use it, not `levels[0]`). Stage select always shows `STAGE_COUNT` (5) slots: open, locked ("🔒 Name") or "Coming soon"; the cursor lands on locked slots but confirm does nothing there.
- **Progress:** `{ version: 1, stages: [{ cleared, ...extra }] }` under `dot-eater:progress:v1`; bad JSON, another version or a wrong shape resets to empty (no migrations). A win records the clear via `recordClear`, which merges what storage holds first; a loss saves nothing.
- **Screens** (product decision): title → stage select → character select → play. Back is the pause action: character select → stage select (same stage) → title. Character select shows one card per `ANIMAL_IDS` entry; ←/→ move, stopping at the ends; Space plays. The cursor starts on the last pick (plain id under `dot-eater:character:v1`; unknown → Dragon). Every game screen carries `animal`, so Retry keeps the character and skips character select. `picks` is per player for 2-player (KDA-211). Retry is pre-selected on both end screens. Only `playing` steps the game. Each screen change uses a whole tick and presses are cleared every tick, so menu presses never reach the game.
- **End of a game is seen, not jumped to:** the dot just eaten stays drawn (`GameState.eatenAt`) until the player's glide is halfway onto it, and a finished game goes through `ending` (only `settle()` runs) before the end screen and confetti.
- **Auto-pause:** during play, window `blur` or a hidden tab switches to paused.

## Rendering

- Characters glide from `lastPos` to `pos`, lagging at most one cell behind the logic; wrap tunnels slide (drawn on both edges, clipped). The HUD strip is above the maze: score left, lives right, energy meter in the middle (a mark per breath's cost, amber when ready). Breath looks come from breath data; `render.ts` has no per-breath code.
- **Fog:** `rules.fog.radius` (at least 1.5) is purely visual: things wholly outside the radius around the player's glide position aren't drawn, with a 1.5-cell soft edge; the HUD stays visible; wrap-aware with tunnels.

## Tooling

- CI uses `setup-vp` with `run-install: false` and runs on PRs only; pnpm 10 pinned.
