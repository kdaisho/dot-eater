import { describe, expect, it } from "vite-plus/test"
import { createShields, SHIELD_SECONDS } from "./shield"

describe("shields", () => {
    it("last SHIELD_SECONDS, then are gone", () => {
        const shields = createShields()
        shields.add(2)
        expect(shields.list).toEqual([{ enemy: 2, age: 0 }])
        shields.update(SHIELD_SECONDS / 2)
        expect(shields.list).toHaveLength(1)
        shields.update(SHIELD_SECONDS / 2)
        expect(shields.list).toEqual([])
    })

    it("keeps one per enemy, the newest", () => {
        const shields = createShields()
        shields.add(0)
        shields.add(1)
        shields.update(0.1)
        shields.add(0)
        expect(shields.list).toEqual([
            { enemy: 1, age: 0.1 },
            { enemy: 0, age: 0 },
        ])
        shields.clear()
        expect(shields.list).toEqual([])
    })
})
