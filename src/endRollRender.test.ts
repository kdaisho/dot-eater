import { describe, expect, it } from "vite-plus/test"
import { STAFF } from "./endRoll"
import { END_ROLL_HEIGHT, FINALE_LAYOUT, SAFE_EDGE } from "./endRollRender"
import { LETTER_H } from "./pixelFont"
import { spritePixels, SpriteId } from "./sprites"

// The end roll's finale keeps clear of the screen's top and bottom edges
// (KDA-323 feedback: the grid touched the top and © the bottom when the
// picture filled a tall window).

const MINI_H = 40
const MINI_DEPTH = 2
const WAVE = 4
const HOP = 4
const SPRITE_H = 16

describe("the finale's layout", () => {
    const L = FINALE_LAYOUT
    const gridTop = L.gridTop - MINI_H / 2 - WAVE
    const gridBottom = L.gridTop + 2 * L.gridPitch + MINI_H / 2 + MINI_DEPTH
    const names = Math.max(...STAFF.map((s) => s.names.length))
    const staffBottom =
        L.staffY + L.nameGap + (names - 1) * L.namePitch + LETTER_H
    const heroesTop = L.heroesY - HOP
    const heroesBottom = L.heroesY + SPRITE_H
    const copyBottom = L.copyY + LETTER_H

    it("keeps SAFE_EDGE (10-12 px) clear at the top and the bottom", () => {
        expect(SAFE_EDGE).toBeGreaterThanOrEqual(10)
        expect(gridTop).toBeGreaterThanOrEqual(SAFE_EDGE)
        expect(copyBottom).toBeLessThanOrEqual(END_ROLL_HEIGHT - SAFE_EDGE)
    })

    it("stacks the grid, the staff, the heroes and © without overlaps", () => {
        expect(gridBottom).toBeLessThan(L.staffY)
        expect(L.staffY + LETTER_H).toBeLessThan(L.staffY + L.nameGap)
        expect(L.namePitch).toBeGreaterThan(LETTER_H)
        expect(staffBottom).toBeLessThan(heroesTop)
        expect(heroesBottom).toBeLessThan(L.copyY)
        expect([
            gridTop,
            gridBottom,
            staffBottom,
            heroesBottom,
            copyBottom,
        ]).toEqual([12, 134, 175, 200, 211])
    })
})

describe("THE END on Hard", () => {
    it("keeps the dancing bosses clear of the bottom edge", () => {
        const kitsune = spritePixels({ id: SpriteId.kitsune }, false).length
        const boss = spritePixels({ id: SpriteId.finalBoss }, false).length
        expect(136 + kitsune * 2).toBeLessThanOrEqual(
            END_ROLL_HEIGHT - SAFE_EDGE
        )
        expect(146 + boss * 2).toBeLessThanOrEqual(END_ROLL_HEIGHT - SAFE_EDGE)
    })
})
