import { describe, expect, it, vi } from "vite-plus/test"
import { AiType, TICK_RATE } from "./constants"
import { IDLE, step } from "./game"
import { slideDistances } from "./ice"
import { fixedRandom, makeEnemy, makeState, textMap } from "./test/helpers"
import { vec2 } from "./vec2"

// slideDistances is spied on (still doing its real work) so the test can
// count the searches a tick of enemy moves makes.
vi.mock("./ice", async (importOriginal) => {
    const ice = await importOriginal<typeof import("./ice")>()
    return { ...ice, slideDistances: vi.fn(ice.slideDistances) }
})

describe("step: chase distances", () => {
    it("shares one search per target between the enemies moving in a tick", () => {
        const rink = textMap([
            "#########",
            "#.~~~~~.#",
            "#.##.####",
            "#.##.####",
            "#.......#",
            "#########",
        ])
        // Each heading the way the player is, so none needs a search of
        // its own (see chaseStep in ai.ts).
        const enemies = [
            makeEnemy(1, 2, AiType.chase, { x: 1, y: 3 }),
            makeEnemy(4, 3, AiType.chase, { x: 4, y: 4 }),
            makeEnemy(2, 4, AiType.chase, { x: 1, y: 4 }),
        ]
        const state = makeState(rink.map, { x: 7, y: 1 }, enemies, {
            ice: rink.ice,
        })
        for (const enemy of enemies) enemy.moveProgress = 1
        vi.mocked(slideDistances).mockClear()
        step(state, 1 / TICK_RATE, IDLE, fixedRandom(0))
        expect(enemies.map((e) => e.pos)).toEqual([
            vec2(1, 1),
            vec2(4, 2),
            vec2(3, 4),
        ])
        expect(slideDistances).toHaveBeenCalledTimes(1)
    })
})
