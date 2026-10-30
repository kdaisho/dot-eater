// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { BREATHS } from "./breaths"
import { createGameState, type Mode } from "./game"
import { createRenderer } from "./render"
import { makeState, OLD_LEVEL } from "./test/helpers"

// The difficulty in the HUD (KDA-265).

// canvas-confetti crashes under happy-dom; keep it out in case anything
// imported here pulls it in.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

afterEach(() => {
    vi.restoreAllMocks()
})

// happy-dom has no 2D canvas: record each fillText with the font set then.
function setup() {
    const view = { innerWidth: 1000, innerHeight: 400, devicePixelRatio: 1 }
    const canvas = document.createElement("canvas")
    const texts: {
        text: unknown
        x: number
        y: number
        max?: number
        font: unknown
    }[] = []
    let font: unknown
    const ctx = new Proxy(
        {},
        {
            get(_target, name) {
                return (...args: unknown[]) => {
                    if (name === "fillText") {
                        const [text, x, y, max] = args as [
                            unknown,
                            number,
                            number,
                            number | undefined,
                        ]
                        texts.push({
                            text,
                            x,
                            y,
                            ...(max === undefined ? {} : { max }),
                            font,
                        })
                    }
                    if (name === "createRadialGradient") {
                        return { addColorStop() {} }
                    }
                }
            },
            set(_target, name, value) {
                if (name === "font") font = value
                return true
            },
        }
    )
    vi.spyOn(canvas, "getContext").mockReturnValue(ctx as never)
    const renderer = createRenderer(canvas, { view })
    // The canvas's width, and the HUD's height: one cell, for a map of
    // `rows` rows.
    const size = (rows: number) => ({
        width: parseFloat(canvas.style.width),
        hud: parseFloat(canvas.style.height) / (rows + 1),
    })
    return { renderer, texts, size }
}

const meter = { energy: 50, max: 100, cost: 50, ready: true }
const health = { health: 100, max: 100 }

const pair = (mode: Mode) =>
    makeState(
        [
            [1, 1, 1, 1, 1, 1, 1],
            [1, 2, 2, 2, 2, 2, 1],
            [1, 1, 1, 1, 1, 1, 1],
        ],
        [
            { x: 1, y: 1 },
            { x: 5, y: 1 },
        ],
        [],
        { breath: [BREATHS.owl, BREATHS.boar], mode }
    )

describe("the HUD's difficulty", () => {
    it("is drawn small with one player, between the meter and the health gauge", () => {
        const { renderer, texts, size } = setup()
        const state = createGameState(OLD_LEVEL)
        renderer.draw(state, 0, {
            score: 10,
            energy: meter,
            health,
            difficulty: "Super Hard",
        })
        const { width, hud } = size(9)
        const label = texts.find((t) => t.text === "Super Hard")
        expect(label).toBeDefined()
        // Right of the meter (the middle quarter), left of the gauge (the
        // right fifth).
        expect(label!.x).toBeGreaterThan(width * 0.625)
        expect(label!.x).toBeLessThan(width * 0.8)
        expect(label!.y).toBeCloseTo(hud / 2)
        // Squeezed to fit the gap, and smaller than the score.
        expect(label!.max).toBeGreaterThan(0)
        expect(label!.max).toBeLessThan(width * 0.175)
        const score = texts.find((t) => t.text === "Score 10")
        expect(parseFloat(String(label!.font))).toBeLessThan(
            parseFloat(String(score!.font))
        )
    })

    it("is left out when the HUD hasn't got one", () => {
        const { renderer, texts } = setup()
        renderer.draw(createGameState(OLD_LEVEL), 0, { score: 10 })
        expect(texts.map((t) => t.text)).toEqual(["Score 10", "🐉", "👺", "👹"])
    })

    it("goes in the middle in co-op", () => {
        const { renderer, texts, size } = setup()
        renderer.draw(pair("coop"), 0, {
            players: [
                { score: 0, energy: meter, health },
                { score: 0, energy: meter, health },
            ],
            difficulty: "Hard",
        })
        const label = texts.find((t) => t.text === "Hard")
        expect(label?.x).toBeCloseTo(size(3).width / 2)
        expect(label?.y).toBeCloseTo(size(3).hud / 2)
        expect(label?.max).toBeLessThan(size(3).width * 0.3)
    })

    it("goes under the round in versus, both in the middle", () => {
        const { renderer, texts, size } = setup()
        renderer.draw(pair("versus"), 0, {
            round: "Round 2 · 1–0",
            players: [
                { score: 0, dots: 1, energy: meter, health },
                { score: 0, dots: 2, energy: meter, health },
            ],
            difficulty: "Easy",
        })
        const round = texts.find((t) => t.text === "Round 2 · 1–0")
        const label = texts.find((t) => t.text === "Easy")
        const { width, hud } = size(3)
        expect(round?.x).toBeCloseTo(width / 2)
        expect(label?.x).toBeCloseTo(width / 2)
        expect(round!.y).toBeLessThan(hud / 2)
        expect(label!.y).toBeGreaterThan(hud / 2)
        expect(label!.y).toBeLessThan(hud)
    })
})
