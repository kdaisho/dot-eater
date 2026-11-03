// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { createBoss } from "./boss"
import {
    BIG_BLAST_AT,
    SHATTER_AT,
    jingleAt,
    startDefeat,
    type BossDefeat,
} from "./bossDefeat"
import { AiType, BossKind } from "./constants"
import { defeatLook, flashAlpha, shardsOf } from "./defeatRender"
import type { GameState } from "./game"
import { createRenderer } from "./render"
import { spritePixels } from "./sprites"
import { makeEnemy, makeState, textMap } from "./test/helpers"
import { vec2 } from "./vec2"

// canvas-confetti crashes under happy-dom; keep it out in case anything
// imported here pulls it in.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// Drawing a boss's defeat (KDA-301) and the hops and hearts after the
// final boss's (KDA-303), on a stub context, as render.test.ts does.

const WHITE = "#fcfcfc"

type Call = {
    name: string
    args: unknown[]
    fillStyle?: unknown
    globalAlpha?: unknown
}

// A 2D context that records every call with the fill and alpha set then.
function stubContext() {
    const calls: Call[] = []
    let fillStyle: unknown
    let globalAlpha: unknown = 1
    const saved: unknown[] = []
    const ctx = new Proxy(
        {},
        {
            get(_target, name) {
                return (...args: unknown[]) => {
                    calls.push({
                        name: String(name),
                        args,
                        fillStyle,
                        globalAlpha,
                    })
                    if (name === "createRadialGradient") {
                        return { addColorStop() {} }
                    }
                    if (name === "save") saved.push(globalAlpha)
                    if (name === "restore" && saved.length > 0) {
                        globalAlpha = saved.pop()
                    }
                }
            },
            set(_target, name, value) {
                if (name === "fillStyle") fillStyle = value
                if (name === "globalAlpha") globalAlpha = value
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
    return { calls, renderer: createRenderer(canvas, { view }) }
}

// The sprite (or badge) a drawImage drew, and where its middle went.
function sprites(calls: readonly Call[]) {
    return calls.flatMap((c) => {
        if (c.name !== "drawImage") return []
        const [img, left, top, w, h] = c.args as [
            HTMLCanvasElement,
            number,
            number,
            number,
            number,
        ]
        return [{ name: img.dataset.sprite, y: top + h / 2, x: left + w / 2 }]
    })
}

// A 9x6 room: player 1 at (1, 1), an Oni at (7, 4) and the boss of `kind`
// at (3, 1), felled `e` seconds ago.
function fallen(kind: BossKind, e: number): GameState {
    const room = textMap([
        "#########",
        "#       #",
        "#       #",
        "#       #",
        "#       #",
        "#########",
    ]).map
    const boss = createBoss(vec2(3, 1), undefined, undefined, 12, kind)
    boss.moveProgress = 1
    const state = makeState(room, vec2(1, 1), [makeEnemy(7, 4, AiType.chase)], {
        boss,
    })
    boss.health = 0
    boss.defeated = true
    state.defeat = startDefeat(state, kind === BossKind.final)
    state.defeat.elapsed = e
    return state
}

// Whether a call filled the whole maze white (a flash).
const fullFlash = (c: Call) =>
    c.name === "fillRect" &&
    c.fillStyle === WHITE &&
    (c.args[2] as number) > 300 &&
    (c.globalAlpha as number) > 0

describe("drawing the Kitsune's burst", () => {
    afterEach(() => vi.restoreAllMocks())

    it("flashes the screen and the boss white on the blow, no sprite raster", () => {
        const { calls, renderer } = setup()
        renderer.draw(fallen(BossKind.kitsune, 0.02), 0)
        expect(calls.some(fullFlash)).toBe(true)
        // The boss is drawn dot by dot, all white.
        const white = calls.filter(
            (c) => c.name === "fillRect" && c.fillStyle === WHITE
        )
        expect(white.length).toBeGreaterThan(50)
        expect(sprites(calls).map((s) => s.name)).not.toContain("kitsune")
    })

    it("zooms the view in on the boss", () => {
        const { calls, renderer } = setup()
        renderer.draw(fallen(BossKind.kitsune, 1), 0)
        const scale = calls.find((c) => c.name === "scale")
        expect(scale?.args[0]).toBeCloseTo(1.06)
    })

    it("draws its shards in the sprite's colours after the shatter, and nothing once over", () => {
        const { calls, renderer } = setup()
        renderer.draw(fallen(BossKind.kitsune, SHATTER_AT + 0.3), 0)
        const colours = new Set(
            calls.filter((c) => c.name === "fillRect").map((c) => c.fillStyle)
        )
        // The Kitsune's blue tail tips are among them.
        expect(colours.has("#3cbcfc") || colours.has("#2060d8")).toBe(true)
        calls.length = 0
        renderer.draw(fallen(BossKind.kitsune, 2), 0)
        expect(calls.some(fullFlash)).toBe(false)
    })
})

describe("drawing the final boss's chain", () => {
    afterEach(() => vi.restoreAllMocks())

    it("whites the screen out after the big blast", () => {
        const { calls, renderer } = setup()
        renderer.draw(fallen(BossKind.final, BIG_BLAST_AT + 0.15), 0)
        expect(calls.some((c) => fullFlash(c) && c.globalAlpha === 1)).toBe(
            true
        )
    })

    it("hops everyone after the jingle and pops a heart over the enemy only", () => {
        const before = setup()
        before.renderer.draw(fallen(BossKind.final, 2.4), 0)
        const rest = sprites(before.calls)
        expect(rest.map((s) => s.name)).not.toContain("heart")

        const during = setup()
        // Mid-hop for player 1 (first) and the Oni (0.11 s after).
        during.renderer.draw(fallen(BossKind.final, 2.5 + 0.32), 0)
        const hop = sprites(during.calls)
        const y = (list: typeof hop, name: string) =>
            list.find((s) => s.name === name)!.y
        expect(y(hop, "dragon")).toBeLessThan(y(rest, "dragon"))
        expect(y(hop, "oni")).toBeLessThan(y(rest, "oni"))
        const hearts = hop.filter((s) => s.name === "heart")
        expect(hearts).toHaveLength(1)
        expect(hearts[0].x).toBeCloseTo(hop.find((s) => s.name === "oni")!.x)
    })
})

describe("the defeat's pieces", () => {
    it("breaks the sprite into 2x2 shards that keep every dot once", () => {
        const look = defeatLook(createBoss(vec2(0, 0)))
        const dots = spritePixels(look, true)
        const coloured = dots.flat().filter((d) => d !== null).length
        const shards = shardsOf(dots)
        expect(shards.reduce((n, s) => n + s.dots.length, 0)).toBe(coloured)
        for (const s of shards) expect(s.dots.length).toBeLessThanOrEqual(4)
        // The same every time.
        expect(shardsOf(dots)).toEqual(shards)
    })

    it("keeps the Kitsune's last tail as it falls", () => {
        const boss = createBoss(vec2(0, 0))
        boss.health = 0
        expect(defeatLook(boss).tails).toBe(1)
        expect(
            defeatLook(
                createBoss(vec2(0, 0), undefined, undefined, 12, BossKind.final)
            ).tails
        ).toBeUndefined()
    })

    it("flashes on the blow and the shatter (burst), and whites out after the big blast (chain)", () => {
        const burst = { effect: "burst" } as BossDefeat
        expect(flashAlpha(burst, 0)).toBeCloseTo(0.85)
        expect(flashAlpha(burst, 0.2)).toBe(0)
        expect(flashAlpha(burst, SHATTER_AT)).toBeCloseTo(0.45)
        const chain = { effect: "chain" } as BossDefeat
        expect(flashAlpha(chain, 0)).toBe(0)
        expect(flashAlpha(chain, 1.6)).toBe(1)
        expect(flashAlpha(chain, 1.86)).toBeCloseTo(0.5)
        expect(flashAlpha(chain, 2)).toBe(0)
        expect(jingleAt({ effect: "chain" } as BossDefeat)).toBeCloseTo(2.5)
    })
})
