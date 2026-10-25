import { AiType, type CharacterId } from "./constants"
import { vec2, type Vec2 } from "./vec2"

export type Character = {
    id: CharacterId
    pos: Vec2
    lastPos: Vec2
    ai: AiType
}

export function createCharacter(
    id: CharacterId,
    pos: Vec2,
    ai: AiType = AiType.random
): Character {
    // Until its first move a character has not come from anywhere else.
    return { id, pos, lastPos: vec2(pos.x, pos.y), ai }
}
