import { describe, expect, it } from "vite-plus/test"
import { vec2 } from "../../src/vec2"
import { directionTo } from "./bot"

describe("directionTo", () => {
    it("steps to a neighbour", () => {
        expect(directionTo(vec2(3, 3), vec2(4, 3))).toBe("right")
        expect(directionTo(vec2(3, 3), vec2(2, 3))).toBe("left")
        expect(directionTo(vec2(3, 3), vec2(3, 4))).toBe("down")
        expect(directionTo(vec2(3, 3), vec2(3, 2))).toBe("up")
    })

    it("steps through a tunnel across the board, either way", () => {
        expect(directionTo(vec2(16, 3), vec2(0, 3))).toBe("right")
        expect(directionTo(vec2(0, 3), vec2(16, 3))).toBe("left")
        expect(directionTo(vec2(3, 14), vec2(3, 0))).toBe("down")
        expect(directionTo(vec2(3, 0), vec2(3, 14))).toBe("up")
    })
})
