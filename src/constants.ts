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

// How many cells ahead of the player's heading an ambusher aims.
export const AMBUSH_AHEAD = 4

// How close (in cells, centre to centre) an enemy's drawn position must come
// to the player's for a catch. Sprites are drawn 0.8 of a cell wide
// (SPRITE_SCALE in render.ts), so at 0.6 they visibly overlap by a fifth of a
// cell: the player sees the touch, and sprites that only graze don't count.
export const CATCH_DISTANCE = 0.6

// Points for eating one dot.
export const DOT_POINTS = 10
// Lives at the start of a game.
export const START_LIVES = 3
