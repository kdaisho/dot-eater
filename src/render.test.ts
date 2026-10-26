// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { CharacterId } from "./constants"
import { createCharacter } from "./character"
import { createGameState } from "./game"
import { createRenderer } from "./render"
import { vec2 } from "./vec2"

// canvas-confetti crashes under happy-dom; keep it out in case anything
// imported here pulls it in.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// happy-dom has no 2D canvas, so record the calls on a stub context: every
// method call is logged and property writes are accepted.
function stubContext() {
    const calls: { name: string; args: unknown[] }[] = []
    const ctx = new Proxy(
        {},
        {
            get(_target, name) {
                return (...args: unknown[]) => {
                    calls.push({ name: String(name), args })
                }
            },
            set() {
                return true
            },
        }
    )
    return { ctx, calls }
}

function setup() {
    const view = { innerWidth: 1000, innerHeight: 400, devicePixelRatio: 2 }
    const canvas = document.createElement("canvas")
    const { ctx, calls } = stubContext()
    vi.spyOn(canvas, "getContext").mockReturnValue(ctx as never)
    const renderer = createRenderer(canvas, { view })
    const texts = () =>
        calls.filter((c) => c.name === "fillText").map((c) => c.args[0])
    return { canvas, calls, renderer, texts, view }
}

describe("createRenderer", () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("draws the maze and every character without throwing", () => {
        const { calls, renderer, texts } = setup()
        expect(() => renderer.draw(createGameState(), 0.5)).not.toThrow()
        expect(calls.some((c) => c.name === "fillRect")).toBe(true)
        expect(texts()).toEqual(["🪰", "👹", "👺"])
    })

    it("sizes the canvas for the window and devicePixelRatio", () => {
        const { canvas, renderer } = setup()
        renderer.draw(createGameState(), 0)
        // The 9x9 level plus the HUD row into 400 px high: 36 px cells.
        expect(canvas.style.width).toBe("324px")
        expect(canvas.style.height).toBe("360px")
        expect(canvas.width).toBe(648)
        expect(canvas.height).toBe(720)
    })

    it("refits and redraws the last frame on resize", () => {
        const { canvas, calls, renderer, view } = setup()
        renderer.draw(createGameState(), 0)
        view.innerHeight = 200
        view.devicePixelRatio = 1
        const before = calls.length
        renderer.resize()
        // (200 - 32) / 10 rows: 16 px cells.
        expect(canvas.style.width).toBe(`${16 * 9}px`)
        expect(canvas.width).toBe(16 * 9)
        expect(calls.length).toBeGreaterThan(before)
    })

    it("clears to the background without drawing the game", () => {
        const { calls, canvas, renderer, texts } = setup()
        renderer.draw(createGameState(), 0)
        const size = [canvas.width, canvas.height]
        calls.length = 0
        renderer.clear()
        expect(calls.map((c) => c.name)).toEqual(["setTransform", "fillRect"])
        expect(calls[1].args).toEqual([0, 0, ...size])
        expect([canvas.width, canvas.height]).toEqual(size)
        expect(texts()).toEqual([])
    })

    it("stays cleared on resize instead of redrawing the old game", () => {
        const { calls, canvas, renderer, texts, view } = setup()
        renderer.draw(createGameState(), 0)
        renderer.clear()
        view.innerHeight = 200
        view.devicePixelRatio = 1
        calls.length = 0
        renderer.resize()
        expect(canvas.width).toBe(16 * 9)
        expect(texts()).toEqual([])
        expect(calls.filter((c) => c.name === "fillRect")).toHaveLength(1)
    })

    it("draws a character in a tunnel on both edges", () => {
        const { renderer, texts } = setup()
        const state = createGameState()
        const player = createCharacter(CharacterId.player, vec2(0, 4))
        player.lastPos = vec2(8, 4)
        player.moveProgress = 0.5
        state.player = player
        state.enemies = []
        renderer.draw(state, 0)
        expect(texts()).toEqual(["🪰", "🪰"])
    })

    it("draws only the HUD fields given", () => {
        const state = createGameState()
        state.enemies = []

        const empty = setup()
        empty.renderer.draw(state, 0, {})
        expect(empty.texts()).toEqual(["🪰"])

        const full = setup()
        full.renderer.draw(state, 0, { score: 120, lives: 2 })
        expect(full.texts()).toEqual(["Score 120", "🪰🪰", "🪰"])
    })

    it("does nothing without a 2D context", () => {
        const canvas = document.createElement("canvas")
        vi.spyOn(canvas, "getContext").mockReturnValue(null)
        const renderer = createRenderer(canvas)
        expect(() => renderer.draw(createGameState(), 0)).not.toThrow()
    })
})
