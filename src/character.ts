import { AiType, CharacterId, ENEMY_SPEED, PLAYER_SPEED } from "./constants"
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
    // character can't or doesn't want to move.
    moveProgress: number
}

export function createCharacter(
    id: CharacterId,
    pos: Vec2,
    ai: AiType = AiType.random,
    speed: number = id === CharacterId.player ? PLAYER_SPEED : ENEMY_SPEED
): Character {
    // Until its first move a character has not come from anywhere else.
    return { id, pos, lastPos: vec2(pos.x, pos.y), ai, speed, moveProgress: 0 }
}
