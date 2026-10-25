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

export const TICK_MS = 1000
