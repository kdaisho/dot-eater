import { describe, expect, it } from "vite-plus/test"
import { computeLayout, HUD_ROWS, MAX_CELL, MIN_CELL, PADDING } from "./layout"

describe("computeLayout", () => {
    it("fits the maze plus the HUD strip into the height", () => {
        // 9 rows + 1 HUD row into 400 - 32 px: 36.8 -> 36 px cells.
        const layout = computeLayout(1000, 400, 9, 9)
        expect(layout.cell).toBe(Math.floor((400 - 2 * PADDING) / 10))
        expect(layout.cell).toBe(36)
        expect(layout.hudHeight).toBe(36 * HUD_ROWS)
        expect(layout.width).toBe(36 * 9)
        expect(layout.height).toBe(36 * 10)
    })

    it("fits a wide maze into the width", () => {
        // 20 columns into 300 - 32 px: 13.4 -> 13 px cells.
        const layout = computeLayout(300, 1000, 20, 5)
        expect(layout.cell).toBe(13)
        expect(layout.width).toBe(260)
        expect(layout.height).toBe(13 * 6)
    })

    it("keeps cells square, whole and within bounds", () => {
        expect(computeLayout(5000, 5000, 9, 9).cell).toBe(MAX_CELL)
        expect(computeLayout(50, 50, 9, 9).cell).toBe(MIN_CELL)
        expect(Number.isInteger(computeLayout(777, 555, 9, 9).cell)).toBe(true)
    })

    it("sizes the backing store in device pixels", () => {
        const layout = computeLayout(1000, 400, 9, 9, 2)
        expect(layout.dpr).toBe(2)
        expect(layout.pixelWidth).toBe(layout.width * 2)
        expect(layout.pixelHeight).toBe(layout.height * 2)
        const odd = computeLayout(1000, 400, 9, 9, 1.5)
        expect(odd.pixelWidth).toBe(Math.round(odd.width * 1.5))
        // The CSS size doesn't depend on the ratio.
        expect(odd.cell).toBe(layout.cell)
    })

    it("treats a missing or zero ratio as 1", () => {
        expect(computeLayout(1000, 400, 9, 9).dpr).toBe(1)
        expect(computeLayout(1000, 400, 9, 9, 0).pixelWidth).toBe(36 * 9)
    })
})
