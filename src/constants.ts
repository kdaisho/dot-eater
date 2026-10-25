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
} as const
export type AiType = (typeof AiType)[keyof typeof AiType]

export const CharacterId = {
    player: 0,
    enemy1: 1,
    enemy2: 2,
} as const
export type CharacterId = (typeof CharacterId)[keyof typeof CharacterId]

// Enemy ids in spawn order; also the most enemies a level can have.
export const ENEMY_IDS: readonly CharacterId[] = [
    CharacterId.enemy1,
    CharacterId.enemy2,
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
