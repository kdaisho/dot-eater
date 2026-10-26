import {
    AiType,
    CharacterId,
    ENEMY_SPEED,
    PHANTOM_SPEED,
    PLAYER_SPEED,
} from "./constants"
import { vec2, type Vec2 } from "./vec2"

export type Character = {
    id: CharacterId
    pos: Vec2
    // The cell it came from on its latest move.
    lastPos: Vec2
    ai: AiType
    // Movement speed in cells per second.
    speed: number
    // Progress towards the next move, from 0 (just moved) to 1 (ready to
    // move). It grows by speed * dt each tick and stays at 1 while the
    // character can't or doesn't want to move. Just after a move it can be a
    // little above 0: the progress left over past 1, so slow ticks don't
    // round speeds down.
    moveProgress: number
    // Patrollers only: the waypoints walked in a loop, and the index of the
    // one it is heading for. Other characters have no route.
    route?: readonly Vec2[]
    routeIndex: number
}

export function createCharacter(
    id: CharacterId,
    pos: Vec2,
    ai: AiType = AiType.random,
    // Cells per second. Omitted means the default speed for the id: the one
    // place the default speeds are applied.
    speed?: number,
    route?: readonly Vec2[]
): Character {
    return {
        id,
        pos,
        // Until its first move a character has not come from anywhere else.
        lastPos: vec2(pos.x, pos.y),
        ai,
        speed: speed ?? defaultSpeed(id, ai),
        moveProgress: 0,
        ...(route === undefined
            ? {}
            : { route: route.map((p) => vec2(p.x, p.y)) }),
        routeIndex: 0,
    }
}

function defaultSpeed(id: CharacterId, ai: AiType): number {
    if (id === CharacterId.player) return PLAYER_SPEED
    return ai === AiType.phantom ? PHANTOM_SPEED : ENEMY_SPEED
}
