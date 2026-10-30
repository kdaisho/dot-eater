import { describe, expect, it } from "vite-plus/test"
import {
    computeLayout,
    controlsSpace,
    DPAD_SPACE,
    HUD_ROWS,
    MAX_CELL,
    MIN_CELL_PX,
    PADDING,
} from "./layout"

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
        // 20 columns into 500 - 32 px: 23.4 -> 23 px cells.
        const layout = computeLayout(500, 1000, 20, 5)
        expect(layout.cell).toBe(23)
        expect(layout.width).toBe(460)
        expect(layout.height).toBe(23 * 6)
    })

    it("keeps cells square, whole and within bounds", () => {
        expect(computeLayout(5000, 5000, 9, 9).cell).toBe(MAX_CELL)
        expect(computeLayout(50, 50, 9, 9).cell).toBe(MIN_CELL_PX)
        expect(Number.isInteger(computeLayout(777, 555, 9, 9).cell)).toBe(true)
    })

    it("keeps cells at the minimum and the canvas to the viewport when the maze won't fit", () => {
        // 29 columns on a phone in portrait with the D-pad's band: 12 px
        // cells to fit, so 20 px cells and as wide as the screen allows.
        const layout = computeLayout(390, 844 - DPAD_SPACE, 29, 21)
        expect(layout.cell).toBe(MIN_CELL_PX)
        expect(layout.hudHeight).toBe(MIN_CELL_PX * HUD_ROWS)
        expect(layout.width).toBe(390 - 2 * PADDING)
        // The height still fits all 21 rows.
        expect(layout.height).toBe(MIN_CELL_PX * 22)
        expect(layout.pixelWidth).toBe(layout.width)
    })

    it("cuts the canvas along each axis the maze doesn't fit", () => {
        const layout = computeLayout(1000, 300, 29, 21)
        expect(layout.cell).toBe(MIN_CELL_PX)
        expect(layout.width).toBe(MIN_CELL_PX * 29)
        expect(layout.height).toBe(300 - 2 * PADDING)
    })

    it("keeps a cell of maze below the HUD on a tiny viewport", () => {
        const layout = computeLayout(20, 20, 29, 21)
        expect(layout.width).toBe(MIN_CELL_PX)
        expect(layout.height).toBe(MIN_CELL_PX * (HUD_ROWS + 1))
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

describe("controlsSpace", () => {
    it("keeps no room without the D-pad", () => {
        expect(controlsSpace(390, 844, false)).toEqual({ width: 0, height: 0 })
        expect(controlsSpace(844, 390, false)).toEqual({ width: 0, height: 0 })
    })

    it("keeps a band below the maze in portrait", () => {
        expect(controlsSpace(390, 844, true)).toEqual({
            width: 0,
            height: DPAD_SPACE,
        })
        // A square viewport counts as portrait.
        expect(controlsSpace(500, 500, true).height).toBe(DPAD_SPACE)
    })

    it("keeps a band on each side of the maze in landscape", () => {
        expect(controlsSpace(844, 390, true)).toEqual({
            width: 2 * DPAD_SPACE,
            height: 0,
        })
    })
})
