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
    // splitter.ts). Takes two enemy slots.
    splitter: 5,
} as const
export type AiType = (typeof AiType)[keyof typeof AiType]

export const CharacterId = {
    player: 0,
    enemy1: 1,
    enemy2: 2,
    enemy3: 3,
    enemy4: 4,
} as const
export type CharacterId = (typeof CharacterId)[keyof typeof CharacterId]

// Enemy ids in spawn order; also the most enemies a level can have.
export const ENEMY_IDS: readonly CharacterId[] = [
    CharacterId.enemy1,
    CharacterId.enemy2,
    CharacterId.enemy3,
    CharacterId.enemy4,
]

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
// Lives at the start of a game.
export const START_LIVES = 3
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
// drawn from a player's spawn for it to come back there (see spawnClear in
// game.ts): far enough that nothing gliding in can catch it a tick later.
export const RESPAWN_CLEAR_DISTANCE = 1.5

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
// Energy per second the player's meter refills by itself once every dot is
// eaten with the boss still about, so there is always a way to finish it.
export const BOSS_TRICKLE = 10
// Seconds the boss flashes white after each hit.
export const BOSS_FLASH = 0.15
