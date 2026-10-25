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
    return { id, pos, lastPos: vec2(0, 0), ai }
}
