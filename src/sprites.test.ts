// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { AiType, BossKind } from "./constants"
import { ANIMAL_IDS } from "./roster"
import {
    ANIMAL_SPRITES,
    BADGES,
    badgePixels,
    BOSS_SPRITES,
    createSpriteCache,
    drawableKey,
    ENEMY_SPRITES,
    facesRight,
    mirrored,
    spriteGrid,
    spritePixels,
    SPRITES,
    SpriteId,
    TAIL_COUNT,
    visibleTails,
    walkFrame,
} from "./sprites"

// canvas-confetti crashes under happy-dom; keep it out in case anything
// imported here pulls it in.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

describe("the sprite data", () => {
    it("has a grid of one width per sprite, every letter in its palette", () => {
        for (const [id, def] of Object.entries(SPRITES)) {
            const grids = [...def.frames, ...(def.windUp ? [def.windUp] : [])]
            expect(def.frames.length, id).toBeGreaterThanOrEqual(1)
            expect(def.frames.length, id).toBeLessThanOrEqual(2)
            const w = grids[0]![0]!.length
            for (const grid of grids) {
                expect(grid.length, id).toBe(grids[0]!.length)
                for (const row of grid) {
                    expect(row.length, id).toBe(w)
                    for (const ch of row) {
                        if (ch !== ".")
                            expect(def.palette[ch], `${id} ${ch}`).toBeDefined()
                    }
                }
            }
        }
    })

    it("draws players and enemies 16x16, the Kitsune 24x24, the final boss 20x20", () => {
        const size = (id: SpriteId) => [
            spriteGrid({ id })[0]!.length,
            spriteGrid({ id }).length,
        ]
        for (const id of [
            ...Object.values(ANIMAL_SPRITES),
            ...Object.values(ENEMY_SPRITES),
        ]) {
            expect(size(id), id).toEqual([16, 16])
        }
        expect(size(SpriteId.splitterHalf)).toEqual([10, 10])
        expect(size(SpriteId.kitsune)).toEqual([24, 24])
        expect(size(SpriteId.finalBoss)).toEqual([20, 20])
    })

    // KDA-297's open point: Wolf C's second frame had lost its tail tip.
    it("keeps the Wolf's tail on both walk frames", () => {
        const [stand, walk] = SPRITES.wolf.frames
        const tail = (grid: readonly string[]) => grid.map((row) => row[15])
        expect(tail(walk!)).toEqual(tail(stand!))
    })
})

describe("sprite lookup", () => {
    it("has a sprite for every animal", () => {
        expect(Object.keys(ANIMAL_SPRITES).sort()).toEqual(
            [...ANIMAL_IDS].sort()
        )
        for (const id of ANIMAL_IDS) {
            expect(SPRITES[ANIMAL_SPRITES[id]], id).toBeDefined()
        }
    })

    it("has a sprite for every AI type, each its own", () => {
        const types = Object.values(AiType)
        const byNumber = (a: number, b: number) => a - b
        expect(Object.keys(ENEMY_SPRITES).map(Number).sort(byNumber)).toEqual(
            [...types].sort(byNumber)
        )
        const ids = types.map((ai) => ENEMY_SPRITES[ai])
        expect(new Set(ids).size).toBe(types.length)
        for (const id of ids) expect(SPRITES[id]).toBeDefined()
    })

    it("draws the Kitsune on stage 5's boss and the opening's on stage 10's", () => {
        expect(BOSS_SPRITES[BossKind.kitsune]).toBe(SpriteId.kitsune)
        expect(BOSS_SPRITES[BossKind.final]).toBe(SpriteId.finalBoss)
        expect(SPRITES.kitsune.tails).toBe(true)
        expect(SPRITES.finalBoss.windUp).toBeDefined()
    })
})

describe("visibleTails", () => {
    it("loses a tail for each ninth of the health gone", () => {
        expect(visibleTails(12, 12)).toBe(TAIL_COUNT)
        // A ninth of 18 is 2.
        expect(visibleTails(16.01, 18)).toBe(9)
        expect(visibleTails(16, 18)).toBe(8)
        expect(visibleTails(2, 18)).toBe(1)
        expect(visibleTails(0.01, 18)).toBe(1)
        expect(visibleTails(0, 18)).toBe(0)
    })

    it("hides tail n and its tip once n tails are gone", () => {
        const colours = (tails: number) =>
            spritePixels({ id: SpriteId.kitsune, tails }, false)
        const grid = spriteGrid({ id: SpriteId.kitsune })
        // Tail 9 is the digit "9", its tip "i"; tail 1 is "1" and "a".
        const where = (ch: string) =>
            grid.flatMap((row, y) =>
                [...row.matchAll(new RegExp(ch, "g"))].map((m) => [m.index, y])
            )
        const shown = (dots: (string | null)[][], ch: string) =>
            where(ch).every(([x, y]) => dots[y!]![x!] !== null)
        const hidden = (dots: (string | null)[][], ch: string) =>
            where(ch).every(([x, y]) => dots[y!]![x!] === null)
        expect(where("9").length).toBeGreaterThan(0)
        expect(where("i").length).toBeGreaterThan(0)
        const eight = colours(8)
        expect(hidden(eight, "9")).toBe(true)
        expect(hidden(eight, "i")).toBe(true)
        expect(shown(eight, "8")).toBe(true)
        expect(shown(eight, "h")).toBe(true)
        const one = colours(1)
        expect(shown(one, "1")).toBe(true)
        expect(shown(one, "a")).toBe(true)
        expect(hidden(one, "2")).toBe(true)
        // The body stays whatever the tails.
        expect(shown(colours(0), "G")).toBe(true)
    })
})

describe("the final boss's wind-up", () => {
    it("uses its windUp grid only while winding up", () => {
        const def = SPRITES.finalBoss
        expect(spriteGrid({ id: SpriteId.finalBoss, windUp: true })).toBe(
            def.windUp
        )
        expect(spriteGrid({ id: SpriteId.finalBoss })).toBe(def.frames[0])
        // A sprite without one ignores it.
        expect(spriteGrid({ id: SpriteId.kitsune, windUp: true })).toBe(
            SPRITES.kitsune.frames[0]
        )
    })
})

describe("walkFrame", () => {
    it("shows frame 1 for the first half of each move, else frame 0", () => {
        expect(walkFrame(2, true, 0)).toBe(1)
        expect(walkFrame(2, true, 0.49)).toBe(1)
        expect(walkFrame(2, true, 0.5)).toBe(0)
        expect(walkFrame(2, true, 1)).toBe(0)
        expect(walkFrame(2, false, 0)).toBe(0)
        // No walk: always frame 0.
        expect(walkFrame(1, true, 0)).toBe(0)
    })
})

describe("facing", () => {
    it("faces the way it last went sideways", () => {
        expect(facesRight(false, 1)).toBe(true)
        expect(facesRight(true, -1)).toBe(false)
        expect(facesRight(true, 0)).toBe(true)
        expect(facesRight(false, 0)).toBe(false)
    })

    it("mirrors side views facing right, never front views", () => {
        expect(mirrored(SpriteId.fox, true)).toBe(true)
        expect(mirrored(SpriteId.fox, false)).toBe(false)
        expect(mirrored(SpriteId.owl, true)).toBe(false)
        expect(mirrored(SpriteId.kitsune, true)).toBe(false)
    })

    it("flips the pixels when mirrored", () => {
        const left = spritePixels({ id: SpriteId.fox })
        const right = spritePixels({ id: SpriteId.fox, mirror: true })
        expect(right).toEqual(left.map((row) => [...row].reverse()))
        expect(right).not.toEqual(left)
    })
})

describe("the outline", () => {
    it("rings every sprite in one black dot", () => {
        const look = { id: SpriteId.ghost }
        const plain = spritePixels(look, false)
        const lined = spritePixels(look)
        expect(lined).toHaveLength(plain.length + 2)
        expect(lined[0]).toHaveLength(plain[0]!.length + 2)
        // Every coloured dot keeps its colour (clear ones inside can turn
        // black: the outline rings holes too).
        plain.forEach((row, y) =>
            row.forEach((dot, x) => {
                if (dot !== null) expect(lined[y + 1]![x + 1]).toBe(dot)
            })
        )
        // Every clear dot next to a coloured one is black; the rest clear.
        const at = (x: number, y: number) =>
            y < 0 || x < 0 || y >= plain.length || x >= plain[0]!.length
                ? null
                : plain[y]![x]!
        lined.forEach((row, j) =>
            row.forEach((dot, i) => {
                const x = i - 1
                const y = j - 1
                if (at(x, y) !== null) return
                const next =
                    at(x + 1, y) !== null ||
                    at(x - 1, y) !== null ||
                    at(x, y + 1) !== null ||
                    at(x, y - 1) !== null
                expect(dot).toBe(next ? "#000000" : null)
            })
        )
    })

    it("follows the tails that show", () => {
        const all = spritePixels({ id: SpriteId.kitsune })
        const none = spritePixels({ id: SpriteId.kitsune, tails: 0 })
        const black = (dots: (string | null)[][]) =>
            dots.flat().filter((d) => d === "#000000").length
        expect(black(none)).not.toBe(black(all))
    })

    it("rings the badges too", () => {
        for (const id of Object.keys(BADGES) as (keyof typeof BADGES)[]) {
            const dots = badgePixels(id)
            expect(dots).toHaveLength(BADGES[id].grid.length + 2)
            expect(dots.flat()).toContain("#000000")
        }
    })
})

describe("createSpriteCache", () => {
    it("rasterises each look once per size, tagged with its name", () => {
        const make = vi.fn(() => document.createElement("canvas"))
        const cache = createSpriteCache(make)
        const fox = cache.get({ id: SpriteId.fox }, 36)
        expect(cache.get({ id: SpriteId.fox }, 36)).toBe(fox)
        expect(make).toHaveBeenCalledTimes(1)
        // 16 dots and the outline fill the box.
        expect([fox.width, fox.height]).toEqual([36, 36])
        expect(fox.dataset.sprite).toBe("fox")
        expect(fox.dataset.look).toBe("fox:0")
        // Another size, frame or facing is another raster.
        cache.get({ id: SpriteId.fox }, 20)
        cache.get({ id: SpriteId.fox, frame: 1 }, 36)
        const right = cache.get({ id: SpriteId.fox, mirror: true }, 36)
        expect(make).toHaveBeenCalledTimes(4)
        expect(right.dataset.look).toBe("fox:0:mirror")
        const badge = cache.get({ badge: "frozen" }, 10)
        expect(badge.dataset.sprite).toBe("frozen")
    })

    it("keys a look by what changes how it is drawn", () => {
        expect(drawableKey({ id: SpriteId.snake, frame: 1 })).toBe("snake:0")
        expect(drawableKey({ id: SpriteId.kitsune })).toBe("kitsune:0:tails9")
        expect(drawableKey({ id: SpriteId.kitsune, tails: 3 })).toBe(
            "kitsune:0:tails3"
        )
        expect(drawableKey({ id: SpriteId.finalBoss, windUp: true })).toBe(
            "finalBoss:0:windUp"
        )
        expect(drawableKey({ id: SpriteId.oni, windUp: true })).toBe("oni:0")
    })
})
