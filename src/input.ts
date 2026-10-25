import { vec2, type Vec2 } from "./vec2"

// Map a key to the step the player attempts. Any other key yields a zero
// step, which still counts as a (no-op) move.
export function keyToStep(key: string): Vec2 {
    switch (key) {
        case "ArrowUp":
            return vec2(0, -1)
        case "ArrowDown":
            return vec2(0, 1)
        case "ArrowLeft":
            return vec2(-1, 0)
        case "ArrowRight":
            return vec2(1, 0)
        default:
            return vec2(0, 0)
    }
}
