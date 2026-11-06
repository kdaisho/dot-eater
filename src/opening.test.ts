import { describe, expect, it } from "vite-plus/test"
import { Cell } from "./constants"
import { levels } from "./levels"
import {
    BOSS_ABOVE,
    BOSS_REVEAL,
    bossReveal,
    dimPixels,
    HERO_PACK,
    LOGO_TOP,
    logoTop,
    mazeBox,
    mazeCodes,
    MINION_PACK,
    OPENING_DRUM,
    OPENING_HEIGHT,
    OPENING_WIDTH,
    PACK_DELAY,
    PACK_GONE,
    PACK_LAP,
    packAt,
    packLap,
    RISE_FROM,
    runnerFeet,
    runnerWidth,
    runnerX,
    shine,
    SKY_STARS,
    starShown,
} from "./opening"
import { ENEMY_SPRITES, spriteSize } from "./sprites"
import { ART, TileCode } from "./tiles"

describe("logoTop", () => {
    it("starts with the boss above the logo out of sight", () => {
        expect(logoTop(0) - BOSS_ABOVE).toBeGreaterThanOrEqual(OPENING_HEIGHT)
        expect(logoTop(RISE_FROM)).toBe(logoTop(0))
    })

    it("rises evenly and rests from the drum on", () => {
        const mid = logoTop((RISE_FROM + OPENING_DRUM) / 2)
        expect(mid).toBeCloseTo((logoTop(0) + LOGO_TOP) / 2, 0)
        expect(logoTop(OPENING_DRUM - 0.1)).toBeGreaterThan(LOGO_TOP)
        expect(logoTop(OPENING_DRUM)).toBe(LOGO_TOP)
        expect(logoTop(60)).toBe(LOGO_TOP)
    })
})

describe("bossReveal", () => {
    it("keeps the boss a silhouette until the drum", () => {
        expect(bossReveal(0)).toBe(0)
        expect(bossReveal(OPENING_DRUM - 0.01)).toBe(0)
        expect(bossReveal(OPENING_DRUM)).toBe(0)
    })

    it("fades its colours in over half a second after the drum", () => {
        expect(BOSS_REVEAL).toBe(0.5)
        expect(bossReveal(OPENING_DRUM + 0.25)).toBeCloseTo(0.5, 9)
        expect(bossReveal(OPENING_DRUM + 0.5)).toBe(1)
        expect(bossReveal(60)).toBe(1)
    })
})

describe("the stars", () => {
    it("are 60, all on the screen", () => {
        expect(SKY_STARS).toHaveLength(60)
        for (const s of SKY_STARS) {
            expect(s.x).toBeGreaterThanOrEqual(0)
            expect(s.x).toBeLessThan(OPENING_WIDTH)
            expect(s.y).toBeGreaterThanOrEqual(0)
            expect(s.y).toBeLessThan(OPENING_HEIGHT)
            expect(Number.isInteger(s.x) && Number.isInteger(s.y)).toBe(true)
        }
    })

    it("twinkle: each is out a sixth of the time, at its own moment", () => {
        const star = SKY_STARS[0]!
        let out = 0
        for (let i = 0; i < 1500; i++) if (!starShown(star, i / 1000)) out++
        expect(out / 1500).toBeCloseTo(1 / 6, 2)
        const at = (t: number) => SKY_STARS.filter((s) => starShown(s, t))
        expect(at(1).length).toBeGreaterThan(30)
        expect(at(1)).not.toEqual(at(1.3))
    })
})

describe("the dark castle's maze", () => {
    const final = levels[levels.length - 1]!

    it("codes the final stage's walls, floor and growing-back dots", () => {
        const codes = mazeCodes(final)
        expect(codes).toHaveLength(final.width * final.height)
        final.cells.forEach((row, y) =>
            row.forEach((cell, x) => {
                const code = codes[y * final.width + x]!
                if (cell === Cell.wall) expect(code).toBe(TileCode.wall)
                else if (cell === Cell.dot)
                    expect(code).toBe(
                        TileCode.floor | TileCode.dot | TileCode.regrow
                    )
                else expect(code).toBe(TileCode.floor)
            })
        )
    })

    it("fits on the screen, centred", () => {
        const box = mazeBox(final.width, final.height)
        expect(box.left).toBeGreaterThanOrEqual(0)
        expect(box.top).toBeGreaterThanOrEqual(0)
        expect(box.left * 2 + box.width).toBeLessThanOrEqual(OPENING_WIDTH)
        expect(box.left * 2 + box.width).toBeGreaterThan(OPENING_WIDTH - 2)
        expect(box.top * 2 + box.height).toBeLessThanOrEqual(OPENING_HEIGHT)
    })

    it("puts the runners' feet on the floor of its bottom corridor", () => {
        const feet = runnerFeet(final.height)
        const { top } = mazeBox(final.width, final.height)
        const row = Math.floor((feet - top) / ART)
        expect(row).toBe(final.height - 2)
        expect((feet - top) % ART).toBe(ART - 1)
        // a corridor: open from wall to wall
        const open = final.cells[row]!.slice(1, -1)
        expect(open.every((c) => c !== Cell.wall)).toBe(true)
    })

    it("dims towards the sky, leaving clear pixels clear", () => {
        const px = new Uint8ClampedArray([200, 100, 50, 255, 9, 9, 9, 0])
        dimPixels(px, [0, 0, 100], 0.4)
        expect([...px]).toEqual([80, 40, 80, 255, 9, 9, 9, 0])
    })
})

describe("the pack", () => {
    const run = OPENING_DRUM + PACK_DELAY

    it("first runs a moment after the drum, then every lap", () => {
        expect(packLap(run - 0.01)).toBeUndefined()
        expect(packLap(run + 1e-9)).toBeCloseTo(0, 6)
        expect(packLap(run + PACK_LAP + 1)).toBeCloseTo(1, 9)
    })

    it("is all eight minions, then the Kitsune chased by the heroes, in turn", () => {
        expect(new Set(MINION_PACK.map((r) => r.id))).toEqual(
            new Set(Object.values(ENEMY_SPRITES))
        )
        expect(MINION_PACK).toHaveLength(8)
        expect(HERO_PACK.map((r) => r.id)).toEqual([
            "kitsune",
            "dragon",
            "penguin",
            "owl",
            "skunk",
            "boar",
        ])
        expect(packAt(run + 1)).toBe(MINION_PACK)
        expect(packAt(run + PACK_LAP + 1)).toBe(HERO_PACK)
        expect(packAt(run + PACK_LAP * 2 + 1)).toBe(MINION_PACK)
        expect(packAt(run + PACK_LAP * 3 + 1)).toBe(HERO_PACK)
    })

    it("comes in from off the right edge", () => {
        expect(runnerX(0, 0)).toBeGreaterThan(OPENING_WIDTH)
    })

    it("measures each runner by its sprite", () => {
        expect(runnerWidth(HERO_PACK[0]!)).toBe(
            spriteSize({ id: "kitsune" })[0]
        )
        expect(runnerWidth(MINION_PACK[0]!)).toBe(16)
    })

    it("is all gone from the screen when the R shines, on either pack", () => {
        // eight runners take longer to pass than five did (3.18 s)
        expect(PACK_GONE).toBeCloseTo(3.63, 2)
        for (const r of [...MINION_PACK, ...HERO_PACK])
            expect(
                runnerX(r.lag, PACK_GONE) + runnerWidth(r)
            ).toBeLessThanOrEqual(0)
        const last = MINION_PACK[MINION_PACK.length - 1]!
        expect(
            runnerX(last.lag, PACK_GONE - 0.05) + runnerWidth(last)
        ).toBeGreaterThan(0)
        // and every lap leaves time for the shine before the next run
        expect(PACK_GONE + 0.6).toBeLessThan(PACK_LAP)
    })
})

describe("shine", () => {
    const run = OPENING_DRUM + PACK_DELAY

    it("shines once the pack is gone, on every run", () => {
        expect(shine(run + PACK_GONE - 0.01)).toBeUndefined()
        expect(shine(run + PACK_GONE + 1e-9)).toBeCloseTo(0, 6)
        expect(shine(run + PACK_GONE + 0.3)).toBeCloseTo(0.5, 9)
        expect(shine(run + PACK_GONE + 0.7)).toBeUndefined()
        expect(shine(run + PACK_LAP * 2 + PACK_GONE + 0.3)).toBeCloseTo(0.5, 6)
    })

    it("doesn't shine before the first run", () => {
        expect(shine(1)).toBeUndefined()
    })
})
