export const Cell = {
    none: 0,
    wall: 1,
    dot: 2,
} as const
export type Cell = (typeof Cell)[keyof typeof Cell]

export const Direction = {
    up: 0,
    left: 1,
    down: 2,
    right: 3,
} as const
export type Direction = (typeof Direction)[keyof typeof Direction]

export const AiType = {
    random: 0,
    chase: 1,
    // Aims a few cells ahead of where the player is heading.
    ambusher: 2,
    // Walks a fixed route of waypoints from the level file, in a loop.
    patroller: 3,
    // Slow, but passes through walls.
    phantom: 4,
    // Chases; a defeating breath splits it into two faster halves (see
    // splitter.ts). Takes two enemy slots but counts as one enemy toward
    // MAX_ENEMIES.
    splitter: 5,
} as const
export type AiType = (typeof AiType)[keyof typeof AiType]

// The most enemies a level can have (parseLevel checks it). A Splitter
// counts as one, though it takes two enemy slots.
export const MAX_ENEMIES = 8
// The most enemy slots a game can need: one per enemy, two per Splitter
// (see splitter.ts), so a level of MAX_ENEMIES Splitters still fits.
export const MAX_ENEMY_SLOTS = 2 * MAX_ENEMIES

// Every player is CharacterId.player; enemy slots are numbered from 1 in
// spawn order (ENEMY_IDS).
export const CharacterId = {
    player: 0,
} as const
export type CharacterId = number

// Enemy ids in spawn order, one per enemy slot.
export const ENEMY_IDS: readonly CharacterId[] = Array.from(
    { length: MAX_ENEMY_SLOTS },
    (_, i) => i + 1
)

// Game logic runs this many fixed ticks per second, whatever the frame rate.
export const TICK_RATE = 60
export const TICK_MS = 1000 / TICK_RATE
// Longest frame gap the loop catches up on. After a longer one (e.g. the tab
// was in the background) the game carries on instead of jumping ahead.
export const MAX_FRAME_MS = 250

// Default movement speeds in cells per second.
export const PLAYER_SPEED = 4
export const ENEMY_SPEED = 2
// Phantoms pass through walls, so they get a slower default to stay fair.
export const PHANTOM_SPEED = 1.5
// A Splitter's halves are faster than the whole (see splitter.ts).
export const SPLITTER_HALF_SPEED = 2.5

// How many cells ahead of the player's heading an ambusher aims.
export const AMBUSH_AHEAD = 4

// How wide characters are drawn, as a fraction of a cell (the emoji's font
// size; see render.ts).
export const SPRITE_SCALE = 0.8

// How close (in cells, centre to centre) an enemy's drawn position must come
// to the player's for a catch. Two sprites start to touch at SPRITE_SCALE
// apart; at 0.6 they visibly overlap by SPRITE_SCALE - 0.6 (a fifth of a
// cell), so the player sees the touch and sprites that only graze don't
// count. Keep it below SPRITE_SCALE if that changes.
export const CATCH_DISTANCE = 0.6

// Points for eating one dot.
export const DOT_POINTS = 10
// Seconds a player knocked out in versus stays out of play before it is
// back at its own spawn (see takeOut in game.ts).
export const PLAYER_RESPAWN_DELAY = 3
// ---- Health (KDA-257; the numbers are placeholders to tune at preview) ----

// A player's health at the start of every stage, and when it is back in
// play in versus. A hit takes some off (see hurtPlayer in game.ts); at 0
// the player is knocked out.
export const MAX_HEALTH = 100
// Health an enemy's touch costs.
export const ENEMY_DAMAGE = 25
// Health the boss's touch costs.
export const BOSS_DAMAGE = 40
// Seconds after a hit in which the player can't be hurt again (counted in
// ticks), blinking: enemies and the boss pass through it meanwhile.
export const HURT_INVULNERABLE_SECONDS = 1.5

// How far (in cells, centre to centre) every enemy and the boss must be
// drawn from a player's spawn for it to come back there (see
// clearOfEnemies in game.ts): far enough that nothing gliding in can catch it a tick later.
export const RESPAWN_CLEAR_DISTANCE = 1.5
// Seconds a player due back waits while the other player is on its spawn
// or moving onto it (when players bump, KDA-262) before it comes back on
// the nearest free cell instead (see tickPlayersOut in game.ts), so a
// player can't camp on the other's spawn.
export const RESPAWN_BLOCK_GRACE = 2

// ---- Breaths (see breath.ts) ----

// Energy a dot adds to the player's meter (up to the character's maxEnergy).
export const DOT_ENERGY = 5
// Points for each enemy a breath defeats.
export const DEFEAT_POINTS = 50
// Seconds a defeated enemy stays gone before it is back at its spawn.
export const RESPAWN_DELAY = 5
// For the last this-many seconds of RESPAWN_DELAY, the enemy is drawn
// blinking at its spawn as a warning. It still can't move or catch.
export const RESPAWN_BLINK = 1
// Blinks per second during RESPAWN_BLINK (each one shown, then hidden).
export const BLINK_RATE = 4

// ---- The boss (see boss.ts) ----

// Hit points a boss starts with. A breath that reaches it does
// BOSS_DAMAGE_PER_ENERGY of its cost in damage, so it takes 12 Owl breaths,
// 6 Dragon, Penguin or Skunk breaths, or 4 Boar breaths.
export const BOSS_HEALTH = 12
// Damage per energy a breath costs: the Owl's 25 does 1, a 50 does 2, the
// Boar's 75 does 3. Pricier breaths hit harder, so every character needs
// about the same energy (300) to bring a boss down.
export const BOSS_DAMAGE_PER_ENERGY = 1 / 25
// The boss's default speed in cells per second: slower than a normal enemy,
// since it is big and catches on any touch.
export const BOSS_SPEED = 1.5
// Points for defeating the boss.
export const BOSS_DEFEAT_POINTS = 500
// Seconds the boss flashes white after each hit.
export const BOSS_FLASH = 0.15

// ---- The punch (see punch.ts; placeholders to tune at preview) ----

// How far ahead of the player's drawn position (in cells, centre to centre,
// along its facing) a punch reaches an enemy's drawn position: the fist
// reaches a third of a sprite past the player's front, and touches an
// enemy whose own front (half a sprite from its centre) is within that.
// About 1.07, so an enemy resting on the next cell is in reach.
export const PUNCH_REACH =
    SPRITE_SCALE / 2 + SPRITE_SCALE / 3 + SPRITE_SCALE / 2
// How far to either side of the facing line (in cells) a punch still
// reaches: half a cell, so it hits in its own lane only.
export const PUNCH_ACROSS = 0.5
