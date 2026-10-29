import { describe, expect, it, vi } from "vite-plus/test"
import type { Renderer } from "../../src/render"
import { rendererFor, type RendererSlot } from "./rendererSlot"

const canvas = {} as HTMLCanvasElement

describe("rendererFor", () => {
    it("keeps the renderer while the canvas and resolution stay", () => {
        const create = vi.fn(() => ({}) as Renderer)
        const slot: RendererSlot = { current: null }
        const a = rendererFor(slot, canvas, 4, create)
        expect(rendererFor(slot, canvas, 4, create)).toBe(a)
        expect(create).toHaveBeenCalledTimes(1)
    })

    it("makes a new one at a new resolution", () => {
        const create = vi.fn(() => ({}) as Renderer)
        const slot: RendererSlot = { current: null }
        const a = rendererFor(slot, canvas, 4, create)
        const b = rendererFor(slot, canvas, 2, create)
        expect(b).not.toBe(a)
        expect(create).toHaveBeenLastCalledWith(canvas, {
            view: { innerWidth: 1e5, innerHeight: 1e5, devicePixelRatio: 2 },
        })
    })
})
