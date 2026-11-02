// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { BOSS_BREATH } from "./bossBreath"
import {
    addStatus,
    addTileEffect,
    CHARGE_SECONDS,
    defeatEnemy,
    type BreathDef,
} from "./breath"
import { BREATHS } from "./breaths"
import {
    AiType,
    BLINK_RATE,
    Cell,
    CharacterId,
    ENEMY_IDS,
    PLAYER_RESPAWN_DELAY,
    RESPAWN_BLINK,
    RESPAWN_DELAY,
    SPRITE_SCALE,
    TICK_RATE,
} from "./constants"
import { createCharacter } from "./character"
import { ENEMY_BREATH } from "./enemyBreath"
import {
    createGameState,
    HURT_INVULNERABLE_TICKS,
    movePlayer,
    takeOut,
    type GameState,
    type Player,
} from "./game"
import { MIN_CELL_PX } from "./layout"
import type { LevelRules } from "./level"
import {
    BOSS_SCALE,
    BOSS_SPRITE,
    createRenderer,
    HALF_SCALE,
    outLabel,
    PLAYER_COLORS,
    IMMUNE_BADGE,
    STUN_BADGE,
    createGuardSprites,
    GUARD_SPRITES_KEPT,
    stanceLook,
    STANCE_OUTLINE,
    STANCE_TINT,
    stunLabel,
    type Effects,
    CROUCH_HEIGHT,
    CROUCH_WIDTH,
    CHARGE_AURA_ALPHA,
    CHARGE_AURA_BASE,
    CHARGE_AURA_FULL_ALPHA,
    CHARGE_AURA_GROWTH,
    CHARGE_FLICKER_HZ,
    chargeAura,
} from "./render"
import { GUARD_STANCE } from "./guard"
import { SNEAK_ALPHA, SNEAK_FAR, SNEAK_NEAR, sneakAlpha } from "./intercept"
import { FIST_BOUNCE, FIST_BOUNCE_SECONDS, JAB_LUNGE, JAB_SECONDS } from "./jab"
import type { Particle } from "./particles"
import { createSplitter } from "./splitter"
import { DEFAULT_ANIMAL } from "./roster"
import {
    BIG_LEVEL,
    makeBoss,
    makeEnemy,
    makeState,
    OLD_LEVEL,
    parseFlat,
    textMap,
} from "./test/helpers"
import { vec2 } from "./vec2"
import { stun } from "./versus"

// canvas-confetti crashes under happy-dom; keep it out in case anything
// imported here pulls it in.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// The solo health gauge's colour.
const HEALTH_COLOR = "#16a34a"

// happy-dom has no 2D canvas, so record the calls on a stub context: every
// method call is logged, with the fillStyle, strokeStyle, font,
// globalAlpha and globalCompositeOperation set at the time, and property
// writes are accepted.
function stubContext() {
    const calls: {
        name: string
        args: unknown[]
        fillStyle?: unknown
        strokeStyle?: unknown
        font?: unknown
        globalAlpha?: unknown
        composite?: unknown
    }[] = []
    let fillStyle: unknown
    let strokeStyle: unknown
    let font: unknown
    let globalAlpha: unknown = 1
    let composite: unknown
    const ctx = new Proxy(
        {},
        {
            get(_target, name) {
                return (...args: unknown[]) => {
                    calls.push({
                        name: String(name),
                        args,
                        fillStyle,
                        strokeStyle,
                        font,
                        globalAlpha,
                        composite,
                    })
                    if (name === "createRadialGradient") {
                        return { addColorStop() {} }
                    }
                }
            },
            set(_target, name, value) {
                if (name === "fillStyle") fillStyle = value
                if (name === "strokeStyle") strokeStyle = value
                if (name === "font") font = value
                if (name === "globalAlpha") globalAlpha = value
                if (name === "globalCompositeOperation") composite = value
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
        expect(() =>
            renderer.draw(createGameState(OLD_LEVEL), 0.5)
        ).not.toThrow()
        expect(calls.some((c) => c.name === "fillRect")).toBe(true)
        expect(texts()).toEqual(["🐉", "👺", "👹"])
    })

    // A one-row corridor with the player at (1, 2) and `enemies` along row 1.
    function drawEnemies(enemies: ReturnType<typeof makeEnemy>[]) {
        const { renderer, texts } = setup()
        renderer.draw(
            makeState(
                [
                    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                    [1, 2, 2, 2, 2, 2, 2, 2, 2, 1],
                    [1, 0, 1, 1, 1, 1, 1, 1, 1, 1],
                ],
                { x: 1, y: 2 },
                enemies
            ),
            0
        )
        return texts()
    }

    it("draws each enemy by its AI type, not its slot", () => {
        const ids = [ENEMY_IDS[0], ENEMY_IDS[1], ENEMY_IDS[2], ENEMY_IDS[3]]
        const types = [
            AiType.phantom,
            AiType.patroller,
            AiType.ambusher,
            AiType.chase,
        ]
        const enemies = ids.map((id, i) =>
            makeEnemy(i + 1, 1, types[i], undefined, id)
        )
        expect(drawEnemies(enemies)).toEqual(["🐉", "👻", "🤖", "🦊", "👹"])
        enemies.push(makeEnemy(5, 1, AiType.random, undefined, ENEMY_IDS[0]))
        expect(drawEnemies(enemies).at(-1)).toBe("👺")
    })

    it("draws a Splitter's halves smaller than the whole one", () => {
        const [whole] = createSplitter([ENEMY_IDS[0], ENEMY_IDS[1]], vec2(1, 1))
        const [main, spare] = createSplitter(
            [ENEMY_IDS[2], ENEMY_IDS[3]],
            vec2(3, 1)
        )
        const state = makeState(
            [
                [1, 1, 1, 1, 1, 1, 1],
                [1, 2, 2, 2, 2, 2, 1],
                [1, 0, 1, 1, 1, 1, 1],
            ],
            { x: 1, y: 2 },
            [whole, main, spare]
        )
        defeatEnemy(state, main)
        const { renderer, calls } = setup()
        renderer.draw(state, 0)
        const sizes = calls
            .filter((c) => c.name === "fillText" && c.args[0] === "🦠")
            .map((c) => parseInt(String(c.font)))
        const player = calls.find(
            (c) => c.name === "fillText" && c.args[0] === "🐉"
        )!
        const full = parseInt(String(player.font))
        expect(sizes).toEqual([
            full,
            Math.round(full * HALF_SCALE),
            Math.round(full * HALF_SCALE),
        ])
    })

    // KDA-292: an interceptor sneaks up, faint until it is near.
    it("draws an interceptor faint far from the player, fading in as it closes in", () => {
        const alphaAt = (x: number) => {
            const { renderer, calls } = setup()
            const state = makeState(
                [
                    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
                    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                ],
                { x: 1, y: 1 },
                [
                    makeEnemy(
                        x,
                        1,
                        AiType.interceptor,
                        undefined,
                        ENEMY_IDS[0]
                    ),
                    makeEnemy(10, 1, AiType.chase, undefined, ENEMY_IDS[1]),
                ]
            )
            renderer.draw(state, 0)
            const sprite = (text: string) =>
                calls.find((c) => c.name === "fillText" && c.args[0] === text)
            // Everything else is drawn as usual.
            expect(sprite("👹")?.globalAlpha).toBe(1)
            expect(sprite("🐉")?.globalAlpha).toBe(1)
            return sprite("🐺")?.globalAlpha
        }
        expect(alphaAt(10)).toBeCloseTo(SNEAK_ALPHA)
        expect(alphaAt(1 + SNEAK_FAR)).toBeCloseTo(SNEAK_ALPHA)
        expect(alphaAt(1 + SNEAK_FAR - 1)).toBeCloseTo(
            sneakAlpha(SNEAK_FAR - 1)
        )
        expect(alphaAt(1 + SNEAK_NEAR)).toBe(1)
        expect(alphaAt(2)).toBe(1)
    })

    it("draws enemies of one AI type with the same sprite", () => {
        const enemies = [
            makeEnemy(1, 1, AiType.chase, undefined, ENEMY_IDS[0]),
            makeEnemy(2, 1, AiType.chase, undefined, ENEMY_IDS[2]),
        ]
        expect(drawEnemies(enemies)).toEqual(["🐉", "👹", "👹"])
    })

    it("gives every AI type its own sprite", () => {
        const types = Object.values(AiType)
        const sprites = drawEnemies(
            types.map((ai, i) => makeEnemy(i + 1, 1, ai))
        ).slice(1)
        expect(sprites).toHaveLength(types.length)
        expect(sprites).not.toContain("🐉")
        expect(new Set(sprites).size).toBe(types.length)
    })

    it("draws the player as its character whatever its AI type", () => {
        for (const ai of Object.values(AiType)) {
            const { renderer, texts } = setup()
            const state = makeState(
                [
                    [1, 1, 1],
                    [1, 0, 1],
                    [1, 1, 1],
                ],
                { x: 1, y: 1 }
            )
            state.players[0].character.ai = ai
            renderer.draw(state, 0)
            expect(texts()).toEqual(["🐉"])
        }
    })

    it("sizes the canvas for the window and devicePixelRatio", () => {
        const { canvas, renderer } = setup()
        renderer.draw(createGameState(OLD_LEVEL), 0)
        // The 9x9 level plus the HUD row into 400 px high: 36 px cells.
        expect(canvas.style.width).toBe("324px")
        expect(canvas.style.height).toBe("360px")
        expect(canvas.width).toBe(648)
        expect(canvas.height).toBe(720)
    })

    it("refits and redraws the last frame on resize", () => {
        const { canvas, calls, renderer, view } = setup()
        renderer.draw(createGameState(OLD_LEVEL), 0)
        view.innerHeight = 280
        view.devicePixelRatio = 1
        const before = calls.length
        renderer.resize()
        // (280 - 32) / 10 rows: 24 px cells.
        expect(canvas.style.width).toBe(`${24 * 9}px`)
        expect(canvas.width).toBe(24 * 9)
        expect(calls.length).toBeGreaterThan(before)
    })

    it("clears to the background without drawing the game", () => {
        const { calls, canvas, renderer, texts } = setup()
        renderer.draw(createGameState(OLD_LEVEL), 0)
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
        renderer.draw(createGameState(OLD_LEVEL), 0)
        renderer.clear()
        view.innerHeight = 280
        view.devicePixelRatio = 1
        calls.length = 0
        renderer.resize()
        expect(canvas.width).toBe(24 * 9)
        expect(texts()).toEqual([])
        expect(calls.filter((c) => c.name === "fillRect")).toHaveLength(1)
    })

    it("draws a character in a tunnel on both edges", () => {
        const { renderer, texts } = setup()
        const state = createGameState(OLD_LEVEL)
        const player = createCharacter(CharacterId.player, vec2(0, 4))
        player.lastPos = vec2(8, 4)
        player.moveProgress = 0.5
        state.players[0].character = player
        state.enemies = []
        renderer.draw(state, 0)
        expect(texts()).toEqual(["🐉", "🐉"])
    })

    it("draws only the HUD fields given", () => {
        const state = createGameState(OLD_LEVEL)
        state.enemies = []

        const empty = setup()
        empty.renderer.draw(state, 0, {})
        expect(empty.texts()).toEqual(["🐉"])

        const full = setup()
        full.renderer.draw(state, 0, {
            score: 120,
            health: { health: 50, max: 100 },
        })
        expect(full.texts()).toEqual(["Score 120", "🐉"])
        expect(full.calls.some((c) => c.name === "strokeRect")).toBe(true)
    })

    it("draws the health gauge on the right, filled up to the health", () => {
        const state = createGameState(OLD_LEVEL)
        state.enemies = []
        const { calls, canvas, renderer } = setup()
        renderer.draw(state, 0, { health: { health: 75, max: 100 } })
        const width = parseFloat(canvas.style.width)
        const frame = calls.find((c) => c.name === "strokeRect")!
        expect(frame.strokeStyle).toBe(HEALTH_COLOR)
        const [left, , w] = frame.args as number[]
        expect(left + w).toBeGreaterThan(width * 0.9)
        const fill = calls.find(
            (c) => c.name === "fillRect" && c.fillStyle === HEALTH_COLOR
        )!
        expect(fill.args[0]).toBe(left)
        expect(fill.args[2]).toBeCloseTo(w * 0.75)
    })

    it("draws the boss's band along the bottom of the HUD, filled to its health", () => {
        const state = createGameState(OLD_LEVEL)
        state.enemies = []
        const band = (calls: ReturnType<typeof setup>["calls"]) =>
            calls.filter(
                (c) =>
                    c.name === "fillRect" &&
                    (c.fillStyle === "#dc2626" || c.fillStyle === "#fecaca")
            )
        const none = setup()
        none.renderer.draw(state, 0, { score: 0 })
        expect(band(none.calls)).toHaveLength(0)

        const { calls, canvas, renderer } = setup()
        renderer.draw(state, 0, { score: 0, boss: { health: 3, max: 12 } })
        const [track, fill] = band(calls)
        expect(track.fillStyle).toBe("#fecaca")
        expect(fill.fillStyle).toBe("#dc2626")
        const width = parseFloat(canvas.style.width)
        const [left, top, w, h] = track.args as number[]
        // Nearly the strip's whole width, at the strip's bottom (the maze
        // starts a cell down: the HUD strip is a cell high).
        expect(w).toBeGreaterThan(width * 0.9)
        const hudHeight = width / OLD_LEVEL.cells[0].length
        expect(top + h).toBeCloseTo(hudHeight)
        expect(fill.args[0]).toBe(left)
        expect(fill.args[2]).toBeCloseTo(w / 4)
    })

    it("blinks a player invulnerable after a hit", () => {
        const state = createGameState(OLD_LEVEL)
        state.enemies = []
        const player = state.players[0]
        player.invulnerableFor = HURT_INVULNERABLE_TICKS
        const on = setup()
        on.renderer.draw(state, 0)
        expect(on.texts()).toEqual(["🐉"])
        // A blink later it is hidden.
        player.invulnerableFor -= TICK_RATE / (BLINK_RATE * 2)
        const off = setup()
        off.renderer.draw(state, 0)
        expect(off.texts()).toEqual([])
    })

    // Regression: the dot the player eats is gone from the cells at once, but
    // the player is drawn gliding in over the next move, so the dot used to
    // vanish a cell ahead of it.
    it("keeps drawing the eaten dot until the player's glide reaches it", () => {
        const { calls, canvas, renderer } = setup()
        const state = makeState(
            [
                [1, 1, 1, 1, 1],
                [2, 2, 2, 2, 2],
                [1, 1, 1, 1, 1],
            ],
            { x: 1, y: 1 }
        )
        movePlayer(state, vec2(1, 0))
        expect(state.cells[1][2]).toBe(Cell.none)
        // Whether a dot (a square well under half a cell) was drawn centred
        // on cell (x, y).
        const dotAt = (x: number, y: number) => {
            const cell = parseFloat(canvas.style.width) / 5
            return calls.some((c) => {
                if (c.name !== "fillRect") return false
                const [left, top, w, h] = c.args as number[]
                return (
                    w === h &&
                    w < cell / 2 &&
                    left + w / 2 === (x + 0.5) * cell &&
                    top + h / 2 === (y + 0.5) * cell
                )
            })
        }
        const drawAt = (progress: number) => {
            state.players[0].character.moveProgress = progress
            calls.length = 0
            renderer.draw(state, 0)
        }

        drawAt(0)
        expect(dotAt(3, 1)).toBe(true)
        expect(dotAt(2, 1)).toBe(true)
        drawAt(0.4)
        expect(dotAt(2, 1)).toBe(true)
        drawAt(0.6)
        expect(dotAt(2, 1)).toBe(false)
        drawAt(1)
        expect(dotAt(2, 1)).toBe(false)
        expect(dotAt(3, 1)).toBe(true)

        // A move that eats nothing leaves nothing to draw.
        movePlayer(state, vec2(-1, 0))
        drawAt(0)
        expect(dotAt(2, 1)).toBe(false)
        expect(dotAt(1, 1)).toBe(false)
    })

    describe("fog", () => {
        // A corridor of dots 13 cells long between walls; with `tunnel` its
        // ends are open, a wrap tunnel.
        function corridor(tunnel = false) {
            const end = tunnel ? 2 : 1
            return [
                Array(13).fill(1),
                [end, ...Array(11).fill(2), end],
                Array(13).fill(1),
            ] as const
        }

        // The cells (as "x,y") where a dot or a wall block was drawn.
        function drawnCells(
            calls: { name: string; args: unknown[] }[],
            canvas: HTMLCanvasElement,
            cols: number
        ) {
            const cell = parseFloat(canvas.style.width) / cols
            const dots = new Set<string>()
            const walls = new Set<string>()
            for (const c of calls) {
                if (c.name !== "fillRect") continue
                const [left, top, w, h] = c.args as number[]
                if (w !== h || w >= cell) continue
                const x = Math.round((left + w / 2) / cell - 0.5)
                const y = Math.round((top + h / 2) / cell - 0.5)
                ;(w < cell / 2 ? dots : walls).add(`${x},${y}`)
            }
            return { dots, walls }
        }

        const enemies = () => [
            makeEnemy(4, 1, AiType.random, undefined, ENEMY_IDS[0]),
            makeEnemy(9, 1, AiType.chase, undefined, ENEMY_IDS[1]),
        ]

        it("hides dots, walls and enemies outside the radius", () => {
            const { calls, canvas, renderer, texts } = setup()
            const state = makeState(corridor(), { x: 2, y: 1 }, enemies())
            renderer.draw(state, 0, {}, { fog: { radius: 3 } })
            // enemy1 (random) is 2 cells away, enemy2 (chase) 7.
            expect(texts()).toEqual(["🐉", "👺"])
            const { dots, walls } = drawnCells(calls, canvas, 13)
            expect([...dots].sort()).toEqual(["1,1", "3,1", "4,1", "5,1"])
            expect(walls.has("0,1")).toBe(true)
            expect(walls.has("2,0")).toBe(true)
            expect(walls.has("6,0")).toBe(false)
            expect(walls.has("12,1")).toBe(false)
        })

        // User feedback 2026-11-01: the Owl sees 1.5 times as far.
        it("lights 1.5 times the radius round the Owl", () => {
            const fogged = (breath = BREATHS.dragon) => {
                const { calls, canvas, renderer, texts } = setup()
                const state = makeState(
                    corridor(),
                    { x: 2, y: 1 },
                    [makeEnemy(8, 1, AiType.chase, undefined, ENEMY_IDS[0])],
                    { breath }
                )
                renderer.draw(state, 0, {}, { fog: { radius: 4 } })
                const cell = parseFloat(canvas.style.width) / 13
                const [light] = calls.filter(
                    (c) => c.name === "createRadialGradient"
                )
                // The light's inner and outer radius, in cells.
                const radii = [light.args[2], light.args[5]].map(
                    (r) => (r as number) / cell
                )
                return { texts: texts(), radii }
            }
            // The chaser is 6 cells off: out of a radius of 4, in one of 6.
            expect(fogged()).toEqual({ texts: ["🐉"], radii: [2.5, 4] })
            expect(fogged(BREATHS.owl)).toEqual({
                texts: ["🦉", "👹"],
                radii: [4.5, 6],
            })
        })

        // Regression: only things whose centre was inside the radius were
        // drawn, so walls and enemies popped in at the soft edge.
        it("draws what reaches into the light, so it fades in", () => {
            const { calls, canvas, renderer, texts } = setup()
            const state = makeState(corridor(), { x: 2, y: 1 }, [
                makeEnemy(5, 1, AiType.random, undefined, ENEMY_IDS[0]),
            ])
            renderer.draw(state, 0, {}, { fog: { radius: 2.5 } })
            // The enemy's centre is 3 cells away, the wall at (4, 0) 2.24 and
            // the one at (5, 0) 3.16: past 2.5, but their near edges aren't.
            expect(texts()).toEqual(["🐉", "👺"])
            const { walls } = drawnCells(calls, canvas, 13)
            expect(walls.has("4,0")).toBe(true)
            expect(walls.has("5,0")).toBe(true)
            expect(walls.has("6,0")).toBe(false)
        })

        it("draws everything without fog", () => {
            const { calls, canvas, renderer, texts } = setup()
            const state = makeState(corridor(), { x: 2, y: 1 }, enemies())
            renderer.draw(state, 0, {}, {})
            expect(texts()).toEqual(["🐉", "👺", "👹"])
            expect(drawnCells(calls, canvas, 13).dots.size).toBe(10)
            expect(calls.some((c) => c.name === "createRadialGradient")).toBe(
                false
            )
        })

        it("centres the light on the player's drawn, gliding position", () => {
            const { calls, canvas, renderer } = setup()
            const state = makeState(corridor(), { x: 5, y: 1 })
            // Just moved from (4, 1): drawn there at the start of the glide.
            state.players[0].character.lastPos = vec2(4, 1)
            state.players[0].character.moveProgress = 0
            renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            const { dots } = drawnCells(calls, canvas, 13)
            expect(dots.has("2,1")).toBe(true)
            expect(dots.has("7,1")).toBe(false)
            const gradients = calls.filter(
                (c) => c.name === "createRadialGradient"
            )
            const cell = parseFloat(canvas.style.width) / 13
            expect(gradients).toHaveLength(1)
            expect(gradients[0].args.slice(0, 2)).toEqual([
                4.5 * cell,
                1.5 * cell,
            ])
        })

        it("sees through a wrap tunnel onto the opposite edge", () => {
            const { calls, canvas, renderer, texts } = setup()
            const state = makeState(corridor(true), { x: 1, y: 1 }, [
                makeEnemy(11, 1, AiType.random, undefined, ENEMY_IDS[0]),
                makeEnemy(8, 1, AiType.chase, undefined, ENEMY_IDS[1]),
            ])
            renderer.draw(state, 0, {}, { fog: { radius: 3 } })
            expect(texts()).toEqual(["🐉", "👺"])
            const { dots } = drawnCells(calls, canvas, 13)
            expect(dots.has("11,1")).toBe(true)
            expect(dots.has("12,1")).toBe(true)
            expect(dots.has("10,1")).toBe(false)
            // The light is drawn around the player and its copy past the
            // right edge.
            expect(
                calls.filter((c) => c.name === "createRadialGradient")
            ).toHaveLength(2)
        })

        it("keeps the HUD visible", () => {
            const { renderer, texts } = setup()
            const state = makeState(corridor(), { x: 2, y: 1 }, enemies())
            renderer.draw(state, 0, { score: 10 }, { fog: { radius: 1 } })
            expect(texts()).toEqual(["Score 10", "🐉"])
        })

        it("keeps the fog when redrawing on resize", () => {
            const { renderer, texts, view } = setup()
            const state = makeState(corridor(), { x: 2, y: 1 }, enemies())
            renderer.draw(state, 0, {}, { fog: { radius: 1 } })
            view.innerHeight = 200
            renderer.resize()
            expect(texts()).toEqual(["🐉", "🐉"])
        })
    })

    describe("ice", () => {
        // The whole-cell tiles drawn (as "x,y", in drawing order), with the
        // index of each call, and the fill styles used for them.
        function iceTiles(
            calls: { name: string; args: unknown[]; fillStyle?: unknown }[],
            canvas: HTMLCanvasElement,
            cols: number
        ) {
            const cell = parseFloat(canvas.style.width) / cols
            const tiles: { at: string; call: number }[] = []
            const styles = new Set<unknown>()
            calls.forEach((c, i) => {
                if (c.name !== "fillRect") return
                const [left, top, w, h] = c.args as number[]
                if (Math.abs(w - cell) > 1 || Math.abs(h - cell) > 1) return
                const x = Math.round(left / cell)
                const y = Math.round(top / cell)
                tiles.push({ at: `${x},${y}`, call: i })
                styles.add(c.fillStyle)
            })
            return { tiles, styles }
        }

        it("draws a pale tile on each ice cell, with its dot on top", () => {
            const { calls, canvas, renderer } = setup()
            const { map, ice } = textMap(["######", "# :~ #", "######"])
            renderer.draw(makeState(map, { x: 1, y: 1 }, [], { ice }), 0)
            const { tiles, styles } = iceTiles(calls, canvas, 6)
            expect(tiles.map((t) => t.at)).toEqual(["2,1", "3,1"])
            // One colour for all ice, not the background, walls or dots.
            expect(styles.size).toBe(1)
            const [style] = styles
            expect(["#fff", "#000"]).not.toContain(style)
            // The dot at (2, 1) comes after its tile, in the dot colour.
            const cell = parseFloat(canvas.style.width) / 6
            const dot = calls.findIndex(
                (c, i) =>
                    i > tiles[0].call &&
                    c.name === "fillRect" &&
                    (c.args[2] as number) < cell / 2
            )
            expect(dot).toBeGreaterThan(tiles[0].call)
            expect(dot).toBeLessThan(tiles[1].call)
            expect(calls[dot].fillStyle).not.toBe(style)
        })

        it("draws no ice tiles on a map without ice", () => {
            const { calls, canvas, renderer } = setup()
            renderer.draw(createGameState(OLD_LEVEL), 0)
            expect(iceTiles(calls, canvas, 9).tiles).toEqual([])
        })

        it("hides ice outside the fog's light like any other cell", () => {
            const { calls, canvas, renderer } = setup()
            const { map, ice } = textMap([
                "#############",
                "#~~~~~~~~~~~#",
                "############.",
            ])
            const state = makeState(map, { x: 1, y: 1 }, [], { ice })
            renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            const drawn = iceTiles(calls, canvas, 13).tiles.map((t) => t.at)
            expect(drawn).toContain("1,1")
            expect(drawn).toContain("3,1")
            expect(drawn).not.toContain("5,1")
            expect(drawn).not.toContain("11,1")
        })
    })

    it("does nothing without a 2D context", () => {
        const canvas = document.createElement("canvas")
        vi.spyOn(canvas, "getContext").mockReturnValue(null)
        const renderer = createRenderer(canvas)
        expect(() => renderer.draw(createGameState(OLD_LEVEL), 0)).not.toThrow()
    })

    describe("breaths", () => {
        const room = () =>
            makeState(
                [
                    [1, 1, 1, 1, 1],
                    [1, 0, 0, 0, 1],
                    [1, 1, 1, 1, 1],
                ],
                { x: 1, y: 1 }
            )

        it("draws the player as the playing character", () => {
            const { renderer, texts } = setup()
            const state = createGameState(OLD_LEVEL, "penguin")
            state.enemies = []
            renderer.draw(state, 0, {})
            expect(texts()).toEqual(["🐧"])
        })

        it("draws the energy meter only when the HUD has it", () => {
            const state = room()
            const without = setup()
            without.renderer.draw(state, 0, {})
            expect(without.calls.some((c) => c.name === "strokeRect")).toBe(
                false
            )

            const { renderer, calls } = setup()
            renderer.draw(state, 0, {
                energy: { energy: 50, max: 100, cost: 25, ready: true },
            })
            expect(calls.filter((c) => c.name === "strokeRect")).toHaveLength(1)
            // The fill is half the frame's width, in the ready colour.
            const frame = calls.find((c) => c.name === "strokeRect")!
            const fill = calls.find(
                (c) => c.name === "fillRect" && c.fillStyle === "#f59e0b"
            )!
            expect(fill.args[2]).toBeCloseTo((frame.args[2] as number) / 2)
            // Marks at 25, 50 and 75.
            const marks = calls.filter(
                (c) =>
                    c.name === "fillRect" &&
                    c.fillStyle === "#000" &&
                    c.args[2] === 1
            )
            expect(marks).toHaveLength(3)
            // Not charging: nothing in the charge colour.
            expect(
                calls.some(
                    (c) => c.name === "fillRect" && c.fillStyle === "#dc2626"
                )
            ).toBe(false)
        })

        it("fills a segment per charged level while the breath charges", () => {
            const { renderer, calls } = setup()
            renderer.draw(room(), 0, {
                energy: {
                    energy: 80,
                    max: 100,
                    cost: 20,
                    ready: true,
                    charge: 3,
                },
            })
            const frame = calls.find((c) => c.name === "strokeRect")!
            const charged = calls.filter(
                (c) => c.name === "fillRect" && c.fillStyle === "#dc2626"
            )
            // Three levels of 20, over the 80 of energy: 60% of the meter,
            // drawn after the energy's fill so it shows over it.
            expect(charged).toHaveLength(1)
            expect(charged[0].args[2]).toBeCloseTo(
                (frame.args[2] as number) * 0.6
            )
            const fill = calls.findIndex(
                (c) => c.name === "fillRect" && c.fillStyle === "#f59e0b"
            )
            expect(calls.indexOf(charged[0])).toBeGreaterThan(fill)
        })

        it("greys the meter while a breath isn't ready", () => {
            const { renderer, calls } = setup()
            renderer.draw(room(), 0, {
                energy: { energy: 10, max: 100, cost: 50, ready: false },
            })
            expect(
                calls.some(
                    (c) => c.name === "fillRect" && c.fillStyle === "#9ca3af"
                )
            ).toBe(true)
        })

        it("draws tile effects by their look", () => {
            const { renderer, calls, texts } = setup()
            const state = room()
            addTileEffect(
                state,
                vec2(2, 1),
                { name: "test.fire", look: { color: "red", emoji: "🔥" } },
                1
            )
            renderer.draw(state, 0)
            expect(calls.some((c) => c.fillStyle === "red")).toBe(true)
            expect(texts()).toEqual(["🔥", "🐉"])
        })

        it("draws enemy statuses by their look", () => {
            const { renderer, calls, texts } = setup()
            const enemy = makeEnemy(3, 1)
            const state = makeState(
                [
                    [1, 1, 1, 1, 1],
                    [1, 0, 0, 0, 1],
                    [1, 1, 1, 1, 1],
                ],
                { x: 1, y: 1 },
                [enemy]
            )
            addStatus(
                enemy,
                { name: "test.frozen", look: { color: "blue", emoji: "❄️" } },
                1
            )
            renderer.draw(state, 0)
            expect(
                calls.some((c) => c.name === "fill" && c.fillStyle === "blue")
            ).toBe(true)
            expect(texts()).toEqual(["🐉", "👺", "❄️"])
        })

        // Regression (PR #74 review): the sprite and badge were drawn with
        // the look's translucent fill still set, and canvas draws colour
        // emoji with the fill's alpha, so they came out see-through.
        it("draws a sprite with a look opaque, not in its disc's colour", () => {
            const enemy = makeEnemy(3, 1)
            const state = makeState(
                [
                    [1, 1, 1, 1, 1],
                    [1, 0, 0, 0, 1],
                    [1, 1, 1, 1, 1],
                ],
                { x: 1, y: 1 },
                [enemy]
            )
            const color = "rgba(255, 110, 20, 0.45)"
            addStatus(
                enemy,
                { name: "test.burning", look: { color, emoji: "🔥" } },
                1
            )
            const { renderer, calls } = setup()
            renderer.draw(state, 0)
            for (const text of ["👺", "🔥"]) {
                const drawn = calls.find(
                    (c) => c.name === "fillText" && c.args[0] === text
                )!
                expect(drawn.fillStyle, text).toBe("#000")
            }
        })

        // Regression (KDA-260): a player that walked onto a frozen enemy was
        // hidden under its disc, sprite and badge.
        it("draws a held enemy under the players, the others over them", () => {
            const frozen = makeEnemy(2, 1)
            const moving = makeEnemy(2, 1, AiType.chase)
            const state = makeState(
                [
                    [1, 1, 1, 1, 1],
                    [1, 0, 0, 0, 1],
                    [1, 1, 1, 1, 1],
                ],
                [
                    { x: 2, y: 1 },
                    { x: 2, y: 1 },
                ],
                [moving, frozen]
            )
            addStatus(
                frozen,
                {
                    name: "test.frozen",
                    holds: true,
                    look: { color: "blue", emoji: "🧊" },
                },
                1
            )
            const { renderer, calls, texts } = setup()
            renderer.draw(state, 0)
            // The frozen enemy and its badge, both players with their
            // markers, then the moving enemy.
            expect(texts().filter((t) => t !== "1" && t !== "2")).toEqual([
                "👺",
                "🧊",
                "🐉",
                "🐉",
                "👹",
            ])
            const disc = calls.findIndex(
                (c) => c.name === "fill" && c.fillStyle === "blue"
            )
            const player = calls.findIndex(
                (c) => c.name === "fillText" && c.args[0] === "🐉"
            )
            expect(disc).toBeGreaterThanOrEqual(0)
            expect(disc).toBeLessThan(player)
        })

        // Regression: the frame alpha moved a held enemy on between ticks,
        // then the next tick drew it back where it was held.
        it("draws a held enemy where it is held, whatever the frame alpha", () => {
            const enemy = makeEnemy(3, 1, AiType.random, { x: 2, y: 1 })
            enemy.moveProgress = 0.5
            const state = makeState(
                [
                    [1, 1, 1, 1, 1],
                    [1, 0, 0, 0, 1],
                    [1, 1, 1, 1, 1],
                ],
                { x: 1, y: 1 },
                [enemy]
            )
            addStatus(enemy, { name: "test.frozen", holds: true }, 1)
            const spriteX = (alpha: number) => {
                const { renderer, calls } = setup()
                renderer.draw(state, alpha)
                return calls.find(
                    (c) => c.name === "fillText" && c.args[0] === "👺"
                )!.args[1]
            }
            expect(spriteX(0.9)).toBe(spriteX(0))
        })

        // Regression: frames between ticks moved the player at its normal
        // speed during a faster slide, so it fell behind and snapped forward
        // each tick.
        it("glides the player between ticks at its current rate", () => {
            const state = room()
            state.players[0].character.pos = vec2(2, 1)
            state.players[0].character.lastPos = vec2(1, 1)
            state.players[0].character.moveProgress = 0.5
            const spriteX = (rate: number, alpha: number) => {
                state.players[0].rate = rate
                const { renderer, calls } = setup()
                renderer.draw(state, alpha)
                return calls.find(
                    (c) => c.name === "fillText" && c.args[0] === "🐉"
                )!.args[1] as number
            }
            // At 1.5x it gets 1.5 times as far through the frame.
            const start = spriteX(1.5, 0)
            expect(spriteX(1.5, 0.9) - start).toBeCloseTo(
                1.5 * (spriteX(1, 0.9) - start)
            )
        })

        it("hides a defeated enemy until it blinks back", () => {
            const enemy = makeEnemy(3, 1)
            const state = makeState(
                [
                    [1, 1, 1, 1, 1],
                    [1, 0, 0, 0, 1],
                    [1, 1, 1, 1, 1],
                ],
                { x: 1, y: 1 },
                [enemy]
            )
            enemy.respawnIn = RESPAWN_DELAY
            const gone = setup()
            gone.renderer.draw(state, 0)
            expect(gone.texts()).toEqual(["🐉"])
            enemy.respawnIn = RESPAWN_BLINK
            const blink = setup()
            blink.renderer.draw(state, 0)
            expect(blink.texts()).toEqual(["🐉", "👺"])
        })
    })

    describe("the boss", () => {
        // A 9x5 room with the player at (1, 1) and the boss's footprint at
        // (3, 1) to (4, 2).
        const room = textMap([
            "#########",
            "#       #",
            "#       #",
            "#       #",
            "#########",
        ]).map
        function bossState() {
            return makeState(room, { x: 1, y: 1 }, [], { boss: makeBoss(3, 1) })
        }
        const cellOf = (canvas: HTMLCanvasElement) =>
            parseFloat(canvas.style.width) / 9

        it("draws it twice the size of a sprite, centred on its footprint, under the others", () => {
            const { calls, canvas, renderer, texts } = setup()
            renderer.draw(bossState(), 0)
            expect(texts()).toEqual([BOSS_SPRITE, "🐉"])
            const cell = cellOf(canvas)
            const boss = calls.find(
                (c) => c.name === "fillText" && c.args[0] === BOSS_SPRITE
            )!
            expect(boss.args[1]).toBeCloseTo(4 * cell)
            expect(boss.args[2]).toBeCloseTo(2 * cell)
            expect(boss.font).toBe(
                `${Math.round(cell * SPRITE_SCALE * BOSS_SCALE)}px sans-serif`
            )
        })

        it("glides it between cells like any character", () => {
            const state = bossState()
            const boss = state.boss!
            boss.lastPos = vec2(4, 1)
            boss.moveProgress = 0.5
            const { calls, canvas, renderer } = setup()
            renderer.draw(state, 0)
            const sprite = calls.find(
                (c) => c.name === "fillText" && c.args[0] === BOSS_SPRITE
            )!
            expect(sprite.args[1]).toBeCloseTo(4.5 * cellOf(canvas))
        })

        // The health bar's fill: the fillRect drawn in its colour.
        const healthBar = (calls: ReturnType<typeof setup>["calls"]) =>
            calls.filter(
                (c) => c.name === "fillRect" && c.fillStyle === "#dc2626"
            )

        it("draws a health bar above it, filled to its health", () => {
            const state = bossState()
            const full = setup()
            full.renderer.draw(state, 0)
            const [fullBar] = healthBar(full.calls)
            const cell = cellOf(full.canvas)
            const [left, top, width] = fullBar.args as number[]
            expect(width).toBeCloseTo(cell * SPRITE_SCALE * BOSS_SCALE)
            expect(left + width / 2).toBeCloseTo(4 * cell)
            // Inside the footprint's top row, above the sprite.
            expect(top).toBeGreaterThanOrEqual(1 * cell)
            expect(top).toBeLessThan(2 * cell - (cell * SPRITE_SCALE * 2) / 2)

            state.boss!.health = state.boss!.maxHealth / 4
            const hurt = setup()
            hurt.renderer.draw(state, 0)
            expect(healthBar(hurt.calls)[0].args[2]).toBeCloseTo(width / 4)
        })

        it("flashes it white just after a hit", () => {
            const state = bossState()
            const flashes = (calls: ReturnType<typeof setup>["calls"]) =>
                calls.filter((c) => c.name === "fill" && c.fillStyle === "#fff")
            const calm = setup()
            calm.renderer.draw(state, 0)
            expect(flashes(calm.calls)).toHaveLength(0)
            state.boss!.flash = 0.1
            const hit = setup()
            hit.renderer.draw(state, 0)
            expect(flashes(hit.calls)).toHaveLength(1)
        })

        // The boss winding up its breath (see bossBreath.ts) at the player,
        // to its left.
        function windingUp() {
            const state = bossState()
            state.boss!.breath.windingUp = 10
            state.boss!.breath.facing = vec2(-1, 0)
            return state
        }
        // On the board in play, paused or ending (see Effects.bossBreath).
        const IN_GAME = { bossBreath: true } as const

        // The cells (as "x,y") filled in the warning colour.
        const tinted = ({ calls, canvas }: ReturnType<typeof setup>) =>
            calls
                .filter(
                    (c) =>
                        c.name === "fillRect" &&
                        c.fillStyle === BOSS_BREATH.warning
                )
                .map((c) => {
                    const cell = cellOf(canvas)
                    const [x, y] = c.args as number[]
                    return `${Math.round(x / cell)},${Math.round(y / cell)}`
                })
        // The first fill of its glow, or -1.
        const glows = (calls: ReturnType<typeof setup>["calls"]) =>
            calls.findIndex(
                (c) =>
                    c.name === "fill" &&
                    String(c.fillStyle).startsWith(`rgba(${BOSS_BREATH.glow},`)
            )

        it("tints the cells its breath will strike while it winds up", () => {
            const calm = setup()
            calm.renderer.draw(bossState(), 0, {}, {}, IN_GAME)
            expect(tinted(calm)).toEqual([])
            // Whatever the facing guide: it is a warning, not a guide.
            const warned = setup()
            warned.renderer.draw(windingUp(), 0, {}, {}, IN_GAME)
            expect(tinted(warned).sort()).toEqual(["1,1", "1,2", "2,1", "2,2"])
            // With an edge round it in the same colour, as an aim's.
            expect(
                warned.calls.some(
                    (c) =>
                        c.name === "stroke" &&
                        c.strokeStyle === BOSS_BREATH.warning
                )
            ).toBe(true)
        })

        it("glows behind it while it winds up", () => {
            const calm = setup()
            calm.renderer.draw(bossState(), 0, {}, {}, IN_GAME)
            expect(glows(calm.calls)).toBe(-1)
            const { calls, renderer } = setup()
            renderer.draw(windingUp(), 0, {}, {}, IN_GAME)
            const glow = glows(calls)
            const sprite = calls.findIndex(
                (c) => c.name === "fillText" && c.args[0] === BOSS_SPRITE
            )
            expect(glow).toBeGreaterThanOrEqual(0)
            expect(glow).toBeLessThan(sprite)
        })

        // Regression (PR #74 review): the sprite was drawn with the glow's
        // translucent fill still set, and canvas draws colour emoji with
        // the fill's alpha, so the boss faded out as it wound up.
        it("draws its sprite opaque over the glow", () => {
            const { calls, renderer } = setup()
            renderer.draw(windingUp(), 0, {}, {}, IN_GAME)
            const sprite = calls.find(
                (c) => c.name === "fillText" && c.args[0] === BOSS_SPRITE
            )!
            expect(sprite.fillStyle).toBe("#000")
        })

        it("shows no wind-up on end screens", () => {
            const end = setup()
            end.renderer.draw(windingUp(), 0, {}, {}, {})
            expect(tinted(end)).toEqual([])
            expect(glows(end.calls)).toBe(-1)
            expect(end.texts()).toContain(BOSS_SPRITE)
        })

        it("doesn't draw it once defeated", () => {
            const state = bossState()
            state.boss!.defeated = true
            const { calls, renderer, texts } = setup()
            renderer.draw(state, 0)
            expect(texts()).toEqual(["🐉"])
            expect(healthBar(calls)).toHaveLength(0)
        })

        it("hides it in fog when none of it reaches into the light", () => {
            const state = bossState()
            state.boss!.pos = vec2(6, 1)
            state.boss!.lastPos = vec2(6, 1)
            const dark = setup()
            dark.renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            expect(dark.texts()).toEqual(["🐉"])
            // Its nearest cell, (3, 1), is 2 cells from the player.
            state.boss!.pos = vec2(3, 1)
            state.boss!.lastPos = vec2(3, 1)
            const lit = setup()
            lit.renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            expect(lit.texts()).toEqual([BOSS_SPRITE, "🐉"])
        })
    })

    // KDA-291, see enemyBreath.ts.
    describe("a breather", () => {
        // A 9x5 room with the player at (1, 1) and a breather at (4, 1).
        const room = textMap([
            "#########",
            "#       #",
            "#       #",
            "#       #",
            "#########",
        ]).map
        // The breather winding up its breath at the player, to its left,
        // unless `winding` is false.
        function breatherState(winding = true) {
            const enemy = makeEnemy(4, 1, AiType.breather)
            if (winding) {
                enemy.breath!.windingUp = 10
                enemy.breath!.facing = vec2(-1, 0)
            }
            return makeState(room, { x: 1, y: 1 }, [enemy])
        }
        const cellOf = (canvas: HTMLCanvasElement) =>
            parseFloat(canvas.style.width) / 9
        // On the board in play, paused or ending (see Effects.bossBreath).
        const IN_GAME = { bossBreath: true } as const
        // The cells (as "x,y") filled in the warning colour.
        const tinted = ({ calls, canvas }: ReturnType<typeof setup>) =>
            calls
                .filter(
                    (c) =>
                        c.name === "fillRect" &&
                        c.fillStyle === ENEMY_BREATH.warning
                )
                .map((c) => {
                    const cell = cellOf(canvas)
                    const [x, y] = c.args as number[]
                    return `${Math.round(x / cell)},${Math.round(y / cell)}`
                })
        // The first fill of its glow, or -1.
        const glows = (calls: ReturnType<typeof setup>["calls"]) =>
            calls.findIndex(
                (c) =>
                    c.name === "fill" &&
                    String(c.fillStyle).startsWith(`rgba(${ENEMY_BREATH.glow},`)
            )

        it("tints the cells its breath will strike while it winds up", () => {
            const calm = setup()
            calm.renderer.draw(breatherState(false), 0, {}, {}, IN_GAME)
            expect(tinted(calm)).toEqual([])
            const warned = setup()
            warned.renderer.draw(breatherState(), 0, {}, {}, IN_GAME)
            // Up to the wall: three cells, the player's included.
            expect(tinted(warned).sort()).toEqual(["1,1", "2,1", "3,1"])
            expect(
                warned.calls.some(
                    (c) =>
                        c.name === "stroke" &&
                        c.strokeStyle === ENEMY_BREATH.warning
                )
            ).toBe(true)
        })

        it("glows behind its sprite while it winds up, drawn opaque", () => {
            const calm = setup()
            calm.renderer.draw(breatherState(false), 0, {}, {}, IN_GAME)
            expect(glows(calm.calls)).toBe(-1)
            const { calls, renderer } = setup()
            renderer.draw(breatherState(), 0, {}, {}, IN_GAME)
            const glow = glows(calls)
            const sprite = calls.findIndex(
                (c) => c.name === "fillText" && c.args[0] === "🐍"
            )
            expect(glow).toBeGreaterThanOrEqual(0)
            expect(glow).toBeLessThan(sprite)
            expect(calls[sprite].fillStyle).toBe("#000")
        })

        it("shows no wind-up on end screens", () => {
            const end = setup()
            end.renderer.draw(breatherState(), 0, {}, {}, {})
            expect(tinted(end)).toEqual([])
            expect(glows(end.calls)).toBe(-1)
            expect(end.texts()).toContain("🐍")
        })
    })
})

describe("createRenderer with two players", () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    // Two players in a corridor of dots, player 1 at (1, 1) and player 2 at
    // (5, 1).
    function pair(breaths?: BreathDef[]) {
        return makeState(
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
            breaths ? { breath: breaths } : {}
        )
    }

    it("draws both players, each with its number in its colour", () => {
        const { calls, renderer, texts } = setup()
        renderer.draw(pair([BREATHS.owl, BREATHS.boar]), 0)
        expect(texts()).toEqual(["🦉", "1", "🐗", "2"])
        const labels = calls.filter(
            (c) =>
                c.name === "fillText" &&
                (c.args[0] === "1" || c.args[0] === "2")
        )
        expect(labels.map((c) => c.fillStyle)).toEqual([...PLAYER_COLORS])
        // A ring round each.
        expect(calls.filter((c) => c.name === "stroke")).toHaveLength(2)
    })

    it("tells two players of the same character apart", () => {
        const { renderer, texts } = setup()
        renderer.draw(pair([BREATHS.penguin, BREATHS.penguin]), 0)
        expect(texts()).toEqual(["🐧", "1", "🐧", "2"])
    })

    it("draws no marker with one player", () => {
        const { calls, renderer, texts } = setup()
        const state = createGameState(OLD_LEVEL)
        state.enemies = []
        renderer.draw(state, 0)
        expect(texts()).toEqual(["🐉"])
        expect(calls.some((c) => c.name === "stroke")).toBe(false)
    })

    it("draws each player's score, meter and health", () => {
        const { calls, renderer, texts } = setup()
        const meter = { energy: 50, max: 100, cost: 50, ready: true }
        renderer.draw(pair(), 0, {
            players: [
                { score: 30, energy: meter, health: { health: 100, max: 100 } },
                {
                    score: 10,
                    energy: { ...meter, ready: false },
                    health: { health: 40, max: 100 },
                },
            ],
        })
        expect(texts().slice(0, 2)).toEqual(["1P 30", "2P 10"])
        // A meter and a health gauge each.
        expect(calls.filter((c) => c.name === "strokeRect")).toHaveLength(4)
        // Each gauge in its player's colour, filled up to its health.
        PLAYER_COLORS.forEach((color, i) => {
            // The gauge is drawn after the meter, framed in the same colour.
            const frame = calls
                .filter(
                    (c) => c.name === "strokeRect" && c.strokeStyle === color
                )
                .at(-1)!
            const fill = calls.find(
                (c) =>
                    c.name === "fillRect" &&
                    c.fillStyle === color &&
                    c.args[1] === frame.args[1]
            )!
            const w = frame.args[2] as number
            expect(fill.args[2]).toBeCloseTo(w * [1, 0.4][i])
        })
        const scores = calls.filter(
            (c) => c.name === "fillText" && String(c.args[0]).includes("P ")
        )
        expect(scores.map((c) => c.fillStyle)).toEqual([...PLAYER_COLORS])
        // Player 1's meter is ready, player 2's isn't.
        const fills = calls
            .filter((c) => c.name === "fillRect")
            .map((c) => c.fillStyle)
        expect(fills).toContain("#f59e0b")
        expect(fills).toContain("#9ca3af")
    })

    it("keeps drawing each player's eaten dot until its glide reaches it", () => {
        const { calls, canvas, renderer } = setup()
        const state = pair()
        movePlayer(state, vec2(-1, 0), state.players[1])
        state.players[1].character.moveProgress = 0
        renderer.draw(state, 0)
        const cell = parseFloat(canvas.style.width) / 7
        const dotAt = (x: number) =>
            calls.some((c) => {
                if (c.name !== "fillRect") return false
                const [left, , w, h] = c.args as number[]
                return (
                    w === h && w < cell / 2 && left + w / 2 === (x + 0.5) * cell
                )
            })
        expect(state.cells[1][4]).toBe(Cell.none)
        expect(dotAt(4)).toBe(true)
    })

    describe("fog", () => {
        const corridor = [
            Array(13).fill(1),
            [1, ...Array(11).fill(2), 1],
            Array(13).fill(1),
        ] as const

        it("lights up round both players", () => {
            const { renderer, texts } = setup()
            const state = makeState(
                corridor,
                [
                    { x: 1, y: 1 },
                    { x: 11, y: 1 },
                ],
                [
                    makeEnemy(3, 1, AiType.random, undefined, ENEMY_IDS[0]),
                    makeEnemy(6, 1, AiType.chase, undefined, ENEMY_IDS[1]),
                    makeEnemy(10, 1, AiType.ambusher, undefined, ENEMY_IDS[2]),
                ]
            )
            renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            // The chaser in the middle is out of both lights.
            expect(texts()).toEqual(["🐉", "1", "🐉", "2", "👺", "🦊"])
        })

        it("draws the darkness on a layer with a light per player", () => {
            const { calls, canvas, renderer } = setup()
            // The layer is a canvas of its own, with its own stub context.
            const layerCanvas = document.createElement("canvas")
            const layer = stubContext()
            vi.spyOn(layerCanvas, "getContext").mockReturnValue(
                layer.ctx as never
            )
            vi.spyOn(document, "createElement").mockReturnValue(layerCanvas)
            const state = makeState(corridor, [
                { x: 1, y: 1 },
                { x: 11, y: 1 },
            ])
            renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            const cell = parseFloat(canvas.style.width) / 13
            expect(calls.some((c) => c.name === "createRadialGradient")).toBe(
                false
            )
            const lights = layer.calls.filter(
                (c) => c.name === "createRadialGradient"
            )
            expect(lights.map((c) => c.args[0])).toEqual([
                1.5 * cell,
                11.5 * cell,
            ])
            const images = calls.filter((c) => c.name === "drawImage")
            expect(images).toHaveLength(1)
            expect(images[0].args[0]).toBe(layerCanvas)
            expect(images[0].args.slice(1)).toEqual([0, 0, 13 * cell, 3 * cell])
        })

        it("gives each player its own light: the Owl's 1.5 times as wide", () => {
            const { canvas, renderer } = setup()
            const layerCanvas = document.createElement("canvas")
            const layer = stubContext()
            vi.spyOn(layerCanvas, "getContext").mockReturnValue(
                layer.ctx as never
            )
            vi.spyOn(document, "createElement").mockReturnValue(layerCanvas)
            const state = makeState(
                corridor,
                [
                    { x: 1, y: 1 },
                    { x: 11, y: 1 },
                ],
                [],
                { breath: [BREATHS.dragon, BREATHS.owl] }
            )
            renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            const cell = parseFloat(canvas.style.width) / 13
            const outer = layer.calls
                .filter((c) => c.name === "createRadialGradient")
                .map((c) => (c.args[5] as number) / cell)
            expect(outer).toEqual([2, 3])
        })

        // Resizing a canvas reallocates it: the layer is sized, and its
        // context taken, once, and again only when the size changes.
        it("reuses the layer from frame to frame", () => {
            const { renderer, view } = setup()
            const layerCanvas = document.createElement("canvas")
            const layer = stubContext()
            const getContext = vi
                .spyOn(layerCanvas, "getContext")
                .mockReturnValue(layer.ctx as never)
            vi.spyOn(document, "createElement").mockReturnValue(layerCanvas)
            const widths: number[] = []
            const proto = Object.getPrototypeOf(layerCanvas)
            const width = Object.getOwnPropertyDescriptor(proto, "width")!
            Object.defineProperty(layerCanvas, "width", {
                configurable: true,
                get: () => width.get!.call(layerCanvas),
                set: (w: number) => {
                    widths.push(w)
                    width.set!.call(layerCanvas, w)
                },
            })
            const state = makeState(corridor, [
                { x: 1, y: 1 },
                { x: 11, y: 1 },
            ])
            for (let i = 0; i < 3; i++) {
                renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            }
            expect(getContext).toHaveBeenCalledTimes(1)
            expect(widths).toHaveLength(1)
            // Each frame starts from a clear layer.
            expect(
                layer.calls.filter((c) => c.name === "clearRect")
            ).toHaveLength(3)
            // A smaller window shrinks the map, and the layer with it.
            view.innerWidth = 500
            renderer.resize()
            renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            expect(widths).toHaveLength(2)
            expect(widths[1]).toBeLessThan(widths[0])
            expect(getContext).toHaveBeenCalledTimes(1)
        })

        it("draws one player's darkness straight onto the map", () => {
            const { calls, renderer } = setup()
            const state = makeState(corridor, { x: 1, y: 1 })
            renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            expect(calls.some((c) => c.name === "drawImage")).toBe(false)
        })
    })
})

describe("createRenderer with a player out of play", () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    const corridor = [
        Array(13).fill(1),
        [1, ...Array(11).fill(2), 1],
        Array(13).fill(1),
    ] as const

    function pair() {
        return makeState(
            corridor,
            [
                { x: 1, y: 1 },
                { x: 11, y: 1 },
            ],
            [],
            { breath: [BREATHS.owl, BREATHS.boar], mode: "coop" }
        )
    }

    it("doesn't draw it", () => {
        const { renderer, texts } = setup()
        const state = pair()
        takeOut(state.players[0], PLAYER_RESPAWN_DELAY)
        renderer.draw(state, 0)
        expect(texts()).toEqual(["🐗", "2"])
    })

    it("shows its countdown, or that it is out for good, in place of its meter", () => {
        const { calls, renderer, texts } = setup()
        const meter = { energy: 50, max: 100, cost: 50, ready: true }
        const health = { health: 0, max: 100 }
        renderer.draw(pair(), 0, {
            players: [
                { score: 30, energy: meter, health, out: { respawnIn: 2.5 } },
                { score: 10, energy: meter, health, out: { respawnIn: null } },
            ],
        })
        expect(texts().slice(0, 4)).toEqual([
            "1P 30",
            "back in 3",
            "2P 10",
            "OUT",
        ])
        expect(calls.filter((c) => c.name === "strokeRect")).toHaveLength(0)
        // Each label fits its meter's slot.
        const labels = calls.filter(
            (c) =>
                c.name === "fillText" &&
                (c.args[0] === "back in 3" || c.args[0] === "OUT")
        )
        expect(labels).toHaveLength(2)
        for (const c of labels) expect(c.args[3]).toBeGreaterThan(0)
    })

    it("counts down in whole seconds, rounding up", () => {
        expect(outLabel({ respawnIn: 3 })).toBe("back in 3")
        expect(outLabel({ respawnIn: 2.01 })).toBe("back in 3")
        expect(outLabel({ respawnIn: 2 })).toBe("back in 2")
        expect(outLabel({ respawnIn: 0.2 })).toBe("back in 1")
        // Due, waiting for its spawn to be clear.
        expect(outLabel({ respawnIn: 0 })).toBe("back soon")
        expect(outLabel({ respawnIn: null })).toBe("OUT")
    })

    it("lights the fog round the players in play only", () => {
        const { canvas, calls, renderer } = setup()
        const state = pair()
        takeOut(state.players[0], PLAYER_RESPAWN_DELAY)
        renderer.draw(state, 0, {}, { fog: { radius: 2 } })
        const cell = parseFloat(canvas.style.width) / 13
        const lights = calls.filter((c) => c.name === "createRadialGradient")
        expect(lights.map((c) => c.args[0])).toEqual([11.5 * cell])
    })

    it("keeps the light where they went out while nobody is in play", () => {
        const { calls, renderer } = setup()
        const layerCanvas = document.createElement("canvas")
        const layer = stubContext()
        vi.spyOn(layerCanvas, "getContext").mockReturnValue(layer.ctx as never)
        vi.spyOn(document, "createElement").mockReturnValue(layerCanvas)
        const state = pair()
        takeOut(state.players[0], PLAYER_RESPAWN_DELAY)
        takeOut(state.players[1], PLAYER_RESPAWN_DELAY)
        renderer.draw(state, 0, {}, { fog: { radius: 2 } })
        expect(calls.some((c) => c.name === "createRadialGradient")).toBe(false)
        expect(
            layer.calls.filter((c) => c.name === "createRadialGradient")
        ).toHaveLength(2)
    })
})

describe("createRenderer in versus", () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    function pair() {
        return makeState(
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
            { breath: [BREATHS.owl, BREATHS.boar], mode: "versus" }
        )
    }

    it("draws each player's dots, a stun in place of its meter, and the round tally", () => {
        const { calls, renderer, texts } = setup()
        const meter = { energy: 50, max: 100, cost: 50, ready: true }
        renderer.draw(pair(), 0, {
            round: "Round 2 · 1–0",
            players: [
                { score: 30, dots: 3, energy: meter, stunned: 1.2 },
                { score: 60, dots: 6, energy: meter },
            ],
        })
        expect(texts().slice(0, 4)).toEqual([
            "1P ●3",
            `${STUN_BADGE} 2`,
            "2P ●6",
            "Round 2 · 1–0",
        ])
        // Only player 2's meter.
        expect(calls.filter((c) => c.name === "strokeRect")).toHaveLength(1)
    })

    it("counts a stun down in whole seconds, rounding up", () => {
        expect(stunLabel(2)).toBe(`${STUN_BADGE} 2`)
        expect(stunLabel(1.01)).toBe(`${STUN_BADGE} 2`)
        expect(stunLabel(0.1)).toBe(`${STUN_BADGE} 1`)
    })

    it("marks a stunned player's sprite with the stun badge", () => {
        const { renderer, texts } = setup()
        const state = pair()
        state.players[1].stunnedFor = 1
        renderer.draw(state, 0)
        expect(texts()).toEqual(["🦉", "1", "🐗", "2", STUN_BADGE])
    })

    it("marks a player immune after a stun with the immune badge", () => {
        const { renderer, texts } = setup()
        const state = pair()
        state.players[1].stunImmuneFor = 1
        renderer.draw(state, 0)
        expect(texts()).toEqual(["🦉", "1", "🐗", "2", IMMUNE_BADGE])
    })
})

describe("createRenderer with effects", () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    // A one-row corridor 9 cells long, the player at (1, 1).
    const corridor = () =>
        makeState(
            [Array(9).fill(1), [1, ...Array(7).fill(0), 1], Array(9).fill(1)],
            { x: 1, y: 1 }
        )

    function particle(overrides: Partial<Particle> = {}): Particle {
        return {
            x: 3,
            y: 1,
            vx: 0,
            vy: 0,
            age: 0,
            life: 1,
            size: 0.2,
            color: "lime",
            shape: "circle",
            gravity: 0,
            drag: 0,
            ...overrides,
        }
    }

    // The cell size, in CSS pixels.
    const cellOf = (canvas: HTMLCanvasElement) =>
        parseFloat(canvas.style.width) / 9

    it("draws each particle as a disc of its colour at its cell position", () => {
        const { calls, canvas, renderer } = setup()
        renderer.draw(corridor(), 0, {}, {}, { particles: [particle()] })
        const cell = cellOf(canvas)
        const arcs = calls.filter((c) => c.name === "arc")
        expect(arcs).toHaveLength(1)
        const [x, y, r] = arcs[0].args as number[]
        expect(x).toBeCloseTo(3.5 * cell)
        expect(y).toBeCloseTo(1.5 * cell)
        expect(r).toBeCloseTo(0.1 * cell)
        const fills = calls.filter((c) => c.name === "fill")
        expect(fills.map((c) => c.fillStyle)).toEqual(["lime"])
    })

    // KDA-293: the block's pale sparks are outlined.
    it("outlines only a particle whose look has an outline", () => {
        const strokes = (p: Particle) => {
            const { calls, renderer } = setup()
            renderer.draw(corridor(), 0, {}, {}, { particles: [p] })
            return calls.filter(
                (c) => c.name === "stroke" || c.name === "strokeRect"
            )
        }
        const none = strokes(particle())
        const disc = strokes(particle({ outline: "#a16207" }))
        expect(disc).toHaveLength(none.length + 1)
        expect(disc.at(-1)).toMatchObject({
            name: "stroke",
            strokeStyle: "#a16207",
        })
        const square = strokes(
            particle({ outline: "#a16207", shape: "square" })
        )
        expect(square.at(-1)).toMatchObject({
            name: "strokeRect",
            strokeStyle: "#a16207",
        })
    })

    it("draws a square particle as a square", () => {
        const { calls, canvas, renderer } = setup()
        renderer.draw(
            corridor(),
            0,
            {},
            {},
            { particles: [particle({ shape: "square", color: "brown" })] }
        )
        const cell = cellOf(canvas)
        const square = calls.find(
            (c) => c.name === "fillRect" && c.fillStyle === "brown"
        )
        expect(square?.args[2]).toBeCloseTo(0.2 * cell)
        expect(calls.some((c) => c.name === "arc")).toBe(false)
    })

    it("draws particles over the characters", () => {
        const { calls, renderer } = setup()
        renderer.draw(corridor(), 0, {}, {}, { particles: [particle()] })
        const sprite = calls.findIndex((c) => c.name === "fillText")
        const arc = calls.findIndex((c) => c.name === "arc")
        expect(arc).toBeGreaterThan(sprite)
    })

    it("skips a particle whose life is over", () => {
        const { calls, renderer } = setup()
        renderer.draw(
            corridor(),
            0,
            {},
            {},
            { particles: [particle({ age: 1, life: 1 })] }
        )
        expect(calls.some((c) => c.name === "arc")).toBe(false)
    })

    it("hides particles outside the fog's light", () => {
        const { calls, canvas, renderer } = setup()
        renderer.draw(
            corridor(),
            0,
            {},
            { fog: { radius: 2 } },
            {
                particles: [
                    particle({ x: 2, color: "near" }),
                    particle({ x: 7, color: "far" }),
                ],
            }
        )
        const cell = cellOf(canvas)
        const arcs = calls.filter((c) => c.name === "arc")
        expect(arcs).toHaveLength(1)
        expect(arcs[0].args[0]).toBeCloseTo(2.5 * cell)
    })

    it("draws nothing extra without effects", () => {
        const plain = setup()
        plain.renderer.draw(corridor(), 0)
        const empty = setup()
        empty.renderer.draw(corridor(), 0, {}, {}, { particles: [] })
        expect(empty.calls.map((c) => c.name)).toEqual(
            plain.calls.map((c) => c.name)
        )
    })

    it("shakes the maze, not the HUD", () => {
        const { calls, canvas, renderer } = setup()
        renderer.draw(
            corridor(),
            0,
            { score: 5 },
            {},
            { shake: vec2(0.2, -0.1) }
        )
        const cell = cellOf(canvas)
        const translates = calls.filter((c) => c.name === "translate")
        // Down past the HUD strip, then the shake.
        expect(translates).toHaveLength(2)
        expect(translates[1].args[0]).toBeCloseTo(0.2 * cell)
        expect(translates[1].args[1]).toBeCloseTo(-0.1 * cell)
        const shakeAt = calls.indexOf(translates[1])
        const hud = calls.findIndex((c) => c.args[0] === "Score 5")
        const sprite = calls.findIndex((c) => c.args[0] === "🐉")
        expect(hud).toBeLessThan(shakeAt)
        expect(sprite).toBeGreaterThan(shakeAt)
        // The clip is set before the shake, so the maze moves inside it.
        const clip = calls.findIndex((c) => c.name === "clip")
        expect(clip).toBeLessThan(shakeAt)
    })

    it("doesn't move the fog's darkness with the shake", () => {
        const { calls, renderer } = setup()
        renderer.draw(
            corridor(),
            0,
            {},
            { fog: { radius: 2 } },
            { shake: vec2(0.2, 0.2) }
        )
        const shakeAt = calls.findIndex(
            (c) => c.name === "translate" && c.args[0] !== 0
        )
        const restoreAfter = calls.findIndex(
            (c, i) => i > shakeAt && c.name === "restore"
        )
        const gradient = calls.findIndex(
            (c) => c.name === "createRadialGradient"
        )
        expect(restoreAfter).toBeGreaterThan(shakeAt)
        expect(gradient).toBeGreaterThan(restoreAfter)
    })

    it("doesn't translate for a zero shake", () => {
        const { calls, renderer } = setup()
        renderer.draw(corridor(), 0, {}, {}, { shake: vec2(0, 0) })
        expect(calls.filter((c) => c.name === "translate")).toHaveLength(1)
    })

    it("keeps the effects when redrawing on resize", () => {
        const { calls, renderer } = setup()
        renderer.draw(corridor(), 0, {}, {}, { particles: [particle()] })
        calls.length = 0
        renderer.resize()
        expect(calls.filter((c) => c.name === "arc")).toHaveLength(1)
    })

    describe("a jab", () => {
        const sprite = (
            calls: ReturnType<typeof setup>["calls"],
            text: string
        ) => calls.find((c) => c.name === "fillText" && c.args[0] === text)

        it("lunges the player along it, with a fist just ahead", () => {
            const { calls, canvas, renderer } = setup()
            const jab = {
                player: 0,
                facing: vec2(1, 0),
                age: JAB_SECONDS / 2,
                lunge: JAB_LUNGE,
            }
            renderer.draw(corridor(), 0, {}, {}, { jabs: [jab] })
            const cell = cellOf(canvas)
            const player = sprite(calls, "🐉")
            expect(player?.args[1]).toBeCloseTo((1.5 + JAB_LUNGE) * cell)
            expect(player?.args[2]).toBeCloseTo(1.5 * cell)
            const fist = sprite(calls, "👊")
            expect(fist?.args[1]).toBeGreaterThan(player?.args[1] as number)
            expect(fist?.args[2]).toBeCloseTo(1.5 * cell)
        })

        it("shows nothing without one, or for another player", () => {
            const { calls, canvas, renderer } = setup()
            const other = {
                player: 1,
                facing: vec2(1, 0),
                age: 0.05,
                lunge: JAB_LUNGE,
            }
            renderer.draw(corridor(), 0, {}, {}, { jabs: [other] })
            expect(sprite(calls, "🐉")?.args[1]).toBeCloseTo(
                1.5 * cellOf(canvas)
            )
            expect(sprite(calls, "👊")).toBeUndefined()
        })

        // Regression: the fist was drawn with the player, before the
        // enemies, so the enemy it hit covered it.
        it("draws the fist over the enemy it hits", () => {
            const { calls, renderer } = setup()
            const state = corridor()
            state.enemies.push(makeEnemy(2, 1))
            const jab = {
                player: 0,
                facing: vec2(1, 0),
                age: 0.05,
                lunge: JAB_LUNGE,
            }
            renderer.draw(state, 0, {}, {}, { jabs: [jab] })
            const at = (text: string) =>
                calls.findIndex(
                    (c) => c.name === "fillText" && c.args[0] === text
                )
            expect(at("👺")).toBeGreaterThan(-1)
            expect(at("👊")).toBeGreaterThan(at("👺"))
        })
    })

    const sprite = (calls: ReturnType<typeof setup>["calls"], text: string) =>
        calls.find((c) => c.name === "fillText" && c.args[0] === text)

    it("bounces a blocked jab's fist back towards the player (KDA-293)", () => {
        const fistAt = (blocked: boolean, age: number) => {
            const { calls, canvas, renderer } = setup()
            const jab = {
                player: 0,
                facing: vec2(1, 0),
                age,
                lunge: 0,
                blocked,
            }
            renderer.draw(corridor(), 0, {}, {}, { jabs: [jab] })
            const fist = sprite(calls, "👊")
            return (fist?.args[1] as number) / cellOf(canvas)
        }
        expect(fistAt(false, 0) - fistAt(true, 0)).toBeCloseTo(FIST_BOUNCE)
        const half = FIST_BOUNCE_SECONDS / 2
        expect(fistAt(false, half) - fistAt(true, half)).toBeCloseTo(
            FIST_BOUNCE / 2
        )
        expect(fistAt(true, FIST_BOUNCE_SECONDS)).toBeCloseTo(fistAt(false, 0))
    })

    describe("an enemy in its guard stance (KDA-293)", () => {
        // Each canvas the renderer makes for a guarding sprite shares one
        // stub context.
        function setupLayers() {
            const drawn = setup()
            const image = document.createElement("canvas")
            const layer = stubContext()
            vi.spyOn(image, "getContext").mockReturnValue(layer.ctx as never)
            vi.spyOn(document, "createElement").mockReturnValue(image)
            return { ...drawn, image, layer }
        }
        const guarding = (stance = GUARD_STANCE) => {
            const state = corridor()
            const enemy = makeEnemy(2, 1)
            enemy.stance = stance
            state.enemies.push(enemy)
            return state
        }

        it("crouches, tinted, with its feet where they were", () => {
            const { calls, canvas, image, layer, renderer } = setupLayers()
            renderer.draw(guarding(), 0, {}, {}, {})
            const cell = cellOf(canvas)
            const size = cell * SPRITE_SCALE
            // Drawn from its tinted canvas, not as text.
            expect(sprite(calls, "👺")).toBeUndefined()
            const draws = calls.filter((c) => c.name === "drawImage")
            expect(draws).toHaveLength(1)
            const [source, left, top, width, height] = draws[0].args as [
                unknown,
                number,
                number,
                number,
                number,
            ]
            expect(source).toBe(image)
            expect(left + width / 2).toBeCloseTo(2.5 * cell)
            const box = width / CROUCH_WIDTH
            expect(height).toBeCloseTo(box * CROUCH_HEIGHT)
            // Its box is the sprite and its outline on each side; the
            // feet stay put.
            const edge = (box - size) / 2
            expect(edge).toBeGreaterThan(0)
            expect(top + height - edge * CROUCH_HEIGHT).toBeCloseTo(
                1.5 * cell + size / 2
            )
            // Tinted steel-blue, outlined in pale blue.
            const fills = layer.calls
                .filter((c) => c.name === "fillRect")
                .map((c) => c.fillStyle)
            expect(fills).toContain(STANCE_TINT)
            expect(fills).toContain(STANCE_OUTLINE)
            expect(
                layer.calls.some(
                    (c) => c.name === "fillText" && c.args[0] === "👺"
                )
            ).toBe(true)
        })

        it("doesn't crouch with reduced motion, but stays tinted", () => {
            const { calls, renderer } = setupLayers()
            renderer.draw(guarding(), 0, {}, {}, { reducedMotion: true })
            const [draw] = calls.filter((c) => c.name === "drawImage")
            const [, , , width, height] = draw.args as number[]
            expect(width).toBeCloseTo(height)
        })

        it("makes its tinted sprite once and keeps it", () => {
            const { layer, renderer } = setupLayers()
            renderer.draw(guarding(), 0, {}, {}, {})
            const made = layer.calls.length
            renderer.draw(guarding(), 0, {}, {}, {})
            expect(layer.calls.length).toBe(made)
        })

        it("is drawn as usual without a stance", () => {
            const { calls, layer, renderer } = setupLayers()
            renderer.draw(guarding(0), 0, {}, {}, {})
            expect(sprite(calls, "👺")?.args[1]).toBeDefined()
            expect(calls.some((c) => c.name === "drawImage")).toBe(false)
            expect(layer.calls).toEqual([])
        })

        it("still crouches, untinted, where a canvas has no 2D context", () => {
            const { calls, renderer } = setup()
            renderer.draw(guarding(), 0, {}, {}, {})
            const scales = calls.filter((c) => c.name === "scale")
            expect(scales.map((c) => c.args)).toEqual([
                [CROUCH_WIDTH, CROUCH_HEIGHT],
            ])
            expect(sprite(calls, "👺")).toBeDefined()
        })
    })
})

describe("stanceLook (KDA-293)", () => {
    it("crouches an enemy in its guard stance, and not without one", () => {
        const enemy = makeEnemy(2, 1)
        expect(stanceLook(enemy, false)).toBeNull()
        expect(stanceLook(enemy, true)).toBeNull()
        enemy.stance = GUARD_STANCE
        expect(stanceLook(enemy, false)).toEqual({
            width: CROUCH_WIDTH,
            height: CROUCH_HEIGHT,
        })
        expect(CROUCH_HEIGHT).toBeCloseTo(0.85)
        expect(CROUCH_WIDTH).toBeCloseTo(1.06)
        // Reduced motion: no crouch, but still the stance's look.
        expect(stanceLook(enemy, true)).toEqual({ width: 1, height: 1 })
    })
})

// User feedback 2026-11-01: a charging breath shows on the character, so
// the player needn't watch the meter.
describe("chargeAura", () => {
    // Amber while charging, the meter's charge red once full.
    const AMBER = "#f59e0b"
    const RED = "#dc2626"

    function breather(energy = 100) {
        const { breather } = makeState(textMap(["#.#"]).map, { x: 1, y: 0 })
            .players[0]
        breather.energy = energy
        return breather
    }

    it("is null while the breath isn't charging", () => {
        expect(chargeAura(breather(), false)).toBeNull()
    })

    it("grows a step each level, in amber", () => {
        const b = breather()
        const scales = [1, 2, 3, 4].map((level) => {
            b.charge = (level - 1) * CHARGE_SECONDS
            const aura = chargeAura(b, false)!
            expect(aura.color).toBe(AMBER)
            expect(aura.alpha).toBe(CHARGE_AURA_ALPHA)
            return aura.scale
        })
        expect(scales).toEqual(
            [0, 1, 2, 3].map((n) => CHARGE_AURA_BASE + n * CHARGE_AURA_GROWTH)
        )
    })

    it("turns red and flickers once fully charged", () => {
        const b = breather()
        b.charge = 4 * CHARGE_SECONDS
        const bright = chargeAura(b, false)!
        expect(bright).toEqual({
            color: RED,
            alpha: CHARGE_AURA_FULL_ALPHA,
            scale: CHARGE_AURA_BASE + 4 * CHARGE_AURA_GROWTH,
        })
        // Half a flicker on: faint.
        b.charge += 0.5 / CHARGE_FLICKER_HZ
        expect(chargeAura(b, false)!.alpha).toBe(CHARGE_AURA_ALPHA / 2)
        // Reduced motion: steady.
        expect(chargeAura(b, true)!.alpha).toBe(CHARGE_AURA_FULL_ALPHA)
    })

    it("is full at the level the meter pays for", () => {
        // 40 energy pays for the Dragon's level 2.
        const b = breather(40)
        b.charge = CHARGE_SECONDS
        expect(chargeAura(b, false)!.color).toBe(RED)
        b.charge = 0
        expect(chargeAura(b, false)!.color).toBe(AMBER)
    })
})

describe("createRenderer with a charging breath", () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    const discs = (calls: ReturnType<typeof setup>["calls"]) =>
        calls.filter((c) => c.name === "arc")

    function charging() {
        const state = makeState(textMap(["#####", "#. .#", "#####"]).map, {
            x: 2,
            y: 1,
        })
        state.players[0].breather.energy = 100
        return state
    }

    it("draws the aura behind the player's sprite", () => {
        const { calls, canvas, renderer } = setup()
        const state = charging()
        state.players[0].breather.charge = CHARGE_SECONDS
        renderer.draw(state, 0)
        const cell = parseFloat(canvas.style.width) / 5
        const [disc] = discs(calls)
        const [x, y, r] = disc.args as number[]
        expect(x).toBeCloseTo(2.5 * cell)
        expect(y).toBeCloseTo(1.5 * cell)
        expect(r).toBeCloseTo(
            ((SPRITE_SCALE * cell) / 2) *
                (CHARGE_AURA_BASE + CHARGE_AURA_GROWTH)
        )
        const fill = calls.findIndex((c) => c.name === "fill")
        expect(calls[fill]).toMatchObject({
            fillStyle: "#f59e0b",
            globalAlpha: CHARGE_AURA_ALPHA,
        })
        const sprite = calls.findIndex(
            (c) => c.name === "fillText" && c.args[0] === "🐉"
        )
        expect(sprite).toBeGreaterThan(fill)
        expect(calls[sprite].globalAlpha).toBe(1)
    })

    it("draws none while not charging, or while stunned", () => {
        const idle = setup()
        idle.renderer.draw(charging(), 0)
        expect(discs(idle.calls)).toEqual([])
        const dazed = setup()
        const state = charging()
        state.players[0].breather.charge = 0
        stun(state.players[0])
        dazed.renderer.draw(state, 0)
        expect(discs(dazed.calls)).toEqual([])
    })
})

describe("createRenderer with the facing guide", () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    // The aim preview while playing.
    const AIM = { guide: "aim", aim: true } as const

    // A dotted corridor 9 cells long: player 1 at (1, 1) and, with two
    // players, player 2 at (7, 1) facing it. Both breathe the Dragon's
    // line, 2 cells for a tap (level 1).
    const corridor = [
        Array(9).fill(1),
        [1, ...Array(7).fill(2), 1],
        Array(9).fill(1),
    ] as const
    function game(players = 1) {
        const starts = [
            { x: 1, y: 1 },
            { x: 7, y: 1 },
        ].slice(0, players)
        const state = makeState(corridor, starts, [], {
            mode: players > 1 ? "versus" : "solo",
        })
        if (players > 1) state.players[1].breather.facing = vec2(-1, 0)
        return state
    }
    function charge(state: ReturnType<typeof game>) {
        for (const p of state.players) {
            p.breather.energy = p.breather.breath.maxEnergy
        }
    }

    const cellOf = (canvas: HTMLCanvasElement) =>
        parseFloat(canvas.style.width) / 9
    // The cells (by x on row 1) tinted in player `i`'s colour.
    function tinted(
        calls: ReturnType<typeof setup>["calls"],
        canvas: HTMLCanvasElement,
        i = 0
    ) {
        const cell = cellOf(canvas)
        return calls
            .filter(
                (c) => c.name === "fillRect" && c.fillStyle === PLAYER_COLORS[i]
            )
            .map((c) => Math.round((c.args[0] as number) / cell))
    }
    // The edge's line segments.
    const edges = (calls: ReturnType<typeof setup>["calls"]) =>
        calls.filter((c) => c.name === "lineTo").length

    it("tints the cells a charged breath would hit, in the player's colour", () => {
        const { calls, canvas, renderer } = setup()
        const state = game()
        charge(state)
        renderer.draw(state, 0, {}, {}, AIM)
        expect(tinted(calls, canvas)).toEqual([2, 3])
        // An edge round the line: its top and bottom along each cell, and
        // its two ends.
        expect(edges(calls)).toBe(2 * 2 + 2)
    })

    it("tints the cells of the level a held breath has charged to", () => {
        const { calls, canvas, renderer } = setup()
        const state = game()
        charge(state)
        // Held long enough for level 3: the Dragon's line is 4 cells.
        state.players[0].breather.charge = CHARGE_SECONDS * 2
        renderer.draw(state, 0, {}, {}, AIM)
        expect(tinted(calls, canvas)).toEqual([2, 3, 4, 5])
    })

    it("draws the tint under the dots and the characters", () => {
        const { calls, canvas, renderer } = setup()
        const state = game()
        charge(state)
        renderer.draw(state, 0, {}, {}, AIM)
        const cell = cellOf(canvas)
        const tint = calls.findIndex(
            (c) => c.name === "fillRect" && c.fillStyle === PLAYER_COLORS[0]
        )
        // The dot on that cell, (2, 1), after it.
        const dot = calls.findIndex(
            (c) =>
                c.name === "fillRect" &&
                c.fillStyle === "#000" &&
                (c.args[0] as number) > 2 * cell &&
                (c.args[0] as number) < 3 * cell &&
                (c.args[1] as number) > cell
        )
        const sprite = calls.findIndex((c) => c.name === "fillText")
        expect(tint).toBeGreaterThanOrEqual(0)
        expect(dot).toBeGreaterThan(tint)
        expect(sprite).toBeGreaterThan(tint)
    })

    it("draws nothing while the breath isn't charged", () => {
        const { calls, canvas, renderer } = setup()
        renderer.draw(game(), 0, {}, {}, AIM)
        expect(tinted(calls, canvas)).toEqual([])
        expect(edges(calls)).toBe(0)
    })

    it("draws nothing unless asked (paused, end screens)", () => {
        const { calls, canvas, renderer } = setup()
        const state = game()
        charge(state)
        renderer.draw(state, 0, {}, {}, { guide: "aim" })
        expect(tinted(calls, canvas)).toEqual([])
        expect(edges(calls)).toBe(0)
    })

    it("tints both players' aims, each in its colour, overlapping", () => {
        const { calls, canvas, renderer } = setup()
        const state = game(2)
        charge(state)
        renderer.draw(state, 0, {}, {}, AIM)
        expect(tinted(calls, canvas, 0)).toEqual([2, 3])
        expect(tinted(calls, canvas, 1)).toEqual([5, 6])
    })

    it("draws no aim for a player out of play", () => {
        const { calls, canvas, renderer } = setup()
        const state = game(2)
        charge(state)
        takeOut(state.players[0], 3)
        renderer.draw(state, 0, {}, {}, AIM)
        expect(tinted(calls, canvas, 0)).toEqual([])
        expect(tinted(calls, canvas, 1)).toEqual([5, 6])
    })

    it("draws no aim for a stunned player", () => {
        const { calls, canvas, renderer } = setup()
        const state = game(2)
        charge(state)
        stun(state.players[1])
        renderer.draw(state, 0, {}, {}, AIM)
        expect(tinted(calls, canvas, 0)).toEqual([2, 3])
        expect(tinted(calls, canvas, 1)).toEqual([])
    })

    it("hides the aim outside the fog's light", () => {
        const { calls, canvas, renderer } = setup()
        const state = game()
        charge(state)
        // Held for level 2: 3 cells, the last out of the light.
        state.players[0].breather.charge = CHARGE_SECONDS
        renderer.draw(state, 0, {}, { fog: { radius: 1.5 } }, AIM)
        expect(tinted(calls, canvas)).toEqual([2, 3])
        // The edge of those two cells only: top and bottom of each, and
        // the near end.
        expect(edges(calls)).toBe(2 * 2 + 1)
    })

    it("draws no aim tint with the arrow guide", () => {
        const { calls, canvas, renderer } = setup()
        const state = game(2)
        charge(state)
        renderer.draw(state, 0, {}, {}, { guide: "arrow", aim: true })
        expect(tinted(calls, canvas, 0)).toEqual([])
        expect(tinted(calls, canvas, 1)).toEqual([])
    })

    describe("the facing arrow", () => {
        const ARROW = { guide: "arrow" } as const
        // A game whose players can all breathe, so they get their arrows.
        function charged(players?: number) {
            const state = game(players)
            charge(state)
            return state
        }
        // The arrows drawn, as each one's colour and tip (in cells).
        function arrows(
            calls: ReturnType<typeof setup>["calls"],
            canvas: HTMLCanvasElement
        ) {
            const cell = cellOf(canvas)
            return calls.flatMap((c, i) => {
                if (c.name !== "fill") return []
                const color = PLAYER_COLORS.findIndex((p) => p === c.fillStyle)
                if (color < 0) return []
                const tip = calls
                    .slice(0, i)
                    .filter((m) => m.name === "moveTo")
                    .at(-1)!.args as number[]
                return [
                    {
                        color,
                        tip: [
                            Math.round((tip[0] / cell) * 10) / 10,
                            Math.round((tip[1] / cell) * 10) / 10,
                        ],
                    },
                ]
            })
        }

        it("points right before the first move", () => {
            const { calls, canvas, renderer } = setup()
            renderer.draw(charged(), 0, {}, {}, ARROW)
            expect(arrows(calls, canvas)).toEqual([
                { color: 0, tip: [2.2, 1.5] },
            ])
        })

        // Regression: the arrow was drawn on the lunging sprite, so it
        // bobbed with every punch.
        it("stays with the glide while the player jabs", () => {
            const { calls, canvas, renderer } = setup()
            const jab = {
                player: 0,
                facing: vec2(1, 0),
                age: JAB_SECONDS / 2,
                lunge: JAB_LUNGE,
            }
            renderer.draw(charged(), 0, {}, {}, { ...ARROW, jabs: [jab] })
            expect(arrows(calls, canvas)).toEqual([
                { color: 0, tip: [2.2, 1.5] },
            ])
        })

        it.each([
            ["up", vec2(0, -1), [1.5, 0.8]],
            ["down", vec2(0, 1), [1.5, 2.2]],
            ["left", vec2(-1, 0), [0.8, 1.5]],
            ["right", vec2(1, 0), [2.2, 1.5]],
        ])("points %s the way the player faces", (_, facing, tip) => {
            const { calls, canvas, renderer } = setup()
            const state = charged()
            state.players[0].breather.facing = facing
            renderer.draw(state, 0, {}, {}, ARROW)
            expect(arrows(calls, canvas)).toEqual([{ color: 0, tip }])
        })

        it("gives each player its own, in its colour", () => {
            const { calls, canvas, renderer } = setup()
            renderer.draw(charged(2), 0, {}, {}, ARROW)
            expect(arrows(calls, canvas)).toEqual([
                { color: 0, tip: [2.2, 1.5] },
                { color: 1, tip: [6.8, 1.5] },
            ])
        })

        it("draws none for a player out of play", () => {
            const { calls, canvas, renderer } = setup()
            const state = charged(2)
            takeOut(state.players[1], 3)
            renderer.draw(state, 0, {}, {}, ARROW)
            expect(arrows(calls, canvas).map((a) => a.color)).toEqual([0])
        })

        it("draws none for a stunned player", () => {
            const { calls, canvas, renderer } = setup()
            const state = charged(2)
            stun(state.players[1])
            renderer.draw(state, 0, {}, {}, ARROW)
            expect(arrows(calls, canvas).map((a) => a.color)).toEqual([0])
        })

        it("travels with the gliding sprite", () => {
            const { calls, canvas, renderer } = setup()
            const state = charged()
            const player = state.players[0].character
            player.lastPos = vec2(1, 1)
            player.pos = vec2(2, 1)
            player.moveProgress = 0.5
            renderer.draw(state, 0, {}, {}, ARROW)
            expect(arrows(calls, canvas)).toEqual([
                { color: 0, tip: [2.7, 1.5] },
            ])
        })

        it("draws none while the breath isn't charged", () => {
            const { calls, canvas, renderer } = setup()
            renderer.draw(game(2), 0, {}, {}, ARROW)
            expect(arrows(calls, canvas)).toEqual([])
        })

        it("draws none with the aim guide, or without a guide", () => {
            for (const effects of [{ guide: "aim", aim: true } as const, {}]) {
                const { calls, canvas, renderer } = setup()
                const state = game(2)
                charge(state)
                renderer.draw(state, 0, {}, {}, effects)
                expect(arrows(calls, canvas)).toEqual([])
            }
        })
    })
})

describe("createRenderer on a maze too big for the screen", () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    // BIG_LEVEL (29x21) in a 390 x 400 window: 12 px cells to fit it whole,
    // so MIN_CELL_PX (20 px) cells and a 358 x 368 canvas, 348 px of it maze
    // below the HUD: 17.9 x 17.4 cells in view.
    const VIEWPORT = { width: 358, height: 348 }
    const CELL = MIN_CELL_PX
    // How far the view scrolls at most, in CSS pixels.
    const MAX_X = 29 * CELL - VIEWPORT.width
    const MAX_Y = 21 * CELL - VIEWPORT.height

    function bigSetup() {
        const view = { innerWidth: 390, innerHeight: 400, devicePixelRatio: 1 }
        const clock = { now: 0 }
        const canvas = document.createElement("canvas")
        const { ctx, calls } = stubContext()
        vi.spyOn(canvas, "getContext").mockReturnValue(ctx as never)
        const renderer = createRenderer(canvas, {
            view,
            now: () => clock.now,
        })
        const texts = () =>
            calls.filter((c) => c.name === "fillText").map((c) => c.args[0])
        // How far the view scrolled the maze this frame: the translate after
        // the HUD's, undone; [0, 0] without one.
        const scroll = () => {
            const move = calls.filter((c) => c.name === "translate")[1]
            const [x, y] = (move?.args ?? [0, 0]) as number[]
            // + 0 turns -0 into 0.
            return [-x + 0, -y + 0]
        }
        // Draw a frame `ms` after the last one.
        const frame = (
            state: GameState,
            ms = 0,
            rules: LevelRules = {},
            effects: Effects = {}
        ) => {
            calls.length = 0
            clock.now += ms
            renderer.draw(state, 0, {}, rules, effects)
        }
        return { calls, canvas, texts, scroll, frame, view }
    }

    // Put `player` at `pos`, standing still.
    function place(player: Player, pos: { x: number; y: number }) {
        player.character.pos = vec2(pos.x, pos.y)
        player.character.lastPos = vec2(pos.x, pos.y)
        player.character.moveProgress = 1
    }

    const coop = () =>
        createGameState(BIG_LEVEL, [DEFAULT_ANIMAL, DEFAULT_ANIMAL], "coop")

    const font = (cell: number) =>
        `${Math.round(cell * SPRITE_SCALE)}px sans-serif`

    it("zooms in to the minimum cell size and shows the player's corner", () => {
        const { canvas, calls, frame, scroll, texts } = bigSetup()
        // Player 1 starts bottom left.
        frame(createGameState(BIG_LEVEL))
        expect(canvas.style.width).toBe(`${VIEWPORT.width}px`)
        expect(canvas.style.height).toBe(`${VIEWPORT.height + CELL}px`)
        // Held at the maze's left and bottom edges.
        expect(scroll()).toEqual([0, MAX_Y])
        const sprite = calls.find((c) => c.args[0] === "🐉")
        expect(sprite?.args.slice(1)).toEqual([1.5 * CELL, 19.5 * CELL])
        expect(sprite?.font).toBe(font(CELL))
        // The enemy top right is out of view; the one in the middle isn't.
        expect(texts()).toEqual(["🐉", "👹"])
    })

    it("centres the player when it is away from the edges", () => {
        const { frame, scroll } = bigSetup()
        const state = createGameState(BIG_LEVEL)
        place(state.players[0], { x: 14, y: 9 })
        frame(state)
        const [x, y] = scroll()
        expect(x).toBeCloseTo(14.5 * CELL - VIEWPORT.width / 2)
        expect(y).toBeCloseTo(9.5 * CELL - VIEWPORT.height / 2)
    })

    it("keeps the maze inside its part of the canvas, off the HUD", () => {
        const { calls, frame } = bigSetup()
        frame(createGameState(BIG_LEVEL))
        const clip = calls.findIndex((c) => c.name === "clip")
        const rect = calls[clip - 1]
        expect(rect.name).toBe("rect")
        expect(rect.args).toEqual([0, 0, VIEWPORT.width, VIEWPORT.height])
        // The view moves the maze inside the clip.
        const translates = calls.filter((c) => c.name === "translate")
        expect(calls.indexOf(translates[1])).toBeGreaterThan(clip)
    })

    it("draws a jab's fist in the view, with the characters", () => {
        const { calls, frame } = bigSetup()
        const jab = {
            player: 0,
            facing: vec2(1, 0),
            age: 0.05,
            lunge: JAB_LUNGE,
        }
        frame(createGameState(BIG_LEVEL), 0, {}, { jabs: [jab] })
        const clip = calls.findIndex((c) => c.name === "clip")
        const view = calls.indexOf(
            calls.filter((c) => c.name === "translate")[1]!
        )
        const fist = calls.findIndex(
            (c) => c.name === "fillText" && c.args[0] === "👊"
        )
        expect(fist).toBeGreaterThan(Math.max(clip, view))
        // In maze space: just right of player 1 at (1, 19).
        const [x, y] = calls[fist]!.args.slice(1) as number[]
        expect(x).toBeGreaterThan(1.5 * CELL)
        expect(y).toBeCloseTo(19.5 * CELL)
    })

    it("draws only the cells in view", () => {
        const { calls, frame } = bigSetup()
        frame(createGameState(BIG_LEVEL))
        // Wall blocks, not dots.
        const walls = calls.filter(
            (c) => c.name === "fillRect" && (c.args[2] as number) > CELL / 2
        )
        // The maze has 211 walls; about 19 columns by 19 rows of it are in
        // or near the view, none past column 19.
        expect(walls.length).toBeLessThan(150)
        expect(walls.every((c) => (c.args[0] as number) < 19 * CELL)).toBe(true)
    })

    it("eases after the player over time, not by frames", () => {
        const { frame, scroll } = bigSetup()
        const state = createGameState(BIG_LEVEL)
        place(state.players[0], { x: 14, y: 9 })
        frame(state)
        const [x0] = scroll()
        place(state.players[0], { x: 18, y: 9 })
        // No time passed: the view hasn't moved.
        frame(state)
        expect(scroll()[0]).toBeCloseTo(x0)
        frame(state, 50)
        const [x1] = scroll()
        const target = 18.5 * CELL - VIEWPORT.width / 2
        expect(x1).toBeGreaterThan(x0)
        expect(x1).toBeLessThan(target)
        frame(state, 10_000)
        expect(scroll()[0]).toBeCloseTo(target)
    })

    it("starts a new game's view right on its player", () => {
        const { frame, scroll } = bigSetup()
        const first = createGameState(BIG_LEVEL)
        place(first.players[0], { x: 27, y: 1 })
        frame(first)
        frame(createGameState(BIG_LEVEL), 16)
        expect(scroll()).toEqual([0, MAX_Y])
    })

    it("draws an enemy in a tunnel whose other half is in view", () => {
        const { calls, frame, scroll } = bigSetup()
        const state = createGameState(BIG_LEVEL)
        place(state.players[0], { x: 27, y: 10 })
        // The chaser halfway through the tunnel, from the right edge to the
        // left: half off the left edge, out of view, and half on the right.
        const enemy = state.enemies[1]
        enemy.lastPos = vec2(28, 10)
        enemy.pos = vec2(0, 10)
        enemy.moveProgress = 0.5
        frame(state)
        expect(scroll()[0]).toBeCloseTo(MAX_X)
        const drawn = calls.filter((c) => c.args[0] === "👹")
        expect(drawn.map((c) => c.args[1])).toEqual([0, 29 * CELL])
    })

    it("draws a maze that fits whole under MIN_CELL_PX whole, without zooming in", () => {
        const { calls, frame, view } = bigSetup()
        // A 17x15 maze (the size the stages were before KDA-264) on an
        // Android phone in portrait: 19 px cells.
        view.innerWidth = 360
        view.innerHeight = 740
        const open = "#" + ".".repeat(15) + "#"
        const level = parseFlat({
            name: "17x15",
            parTime: 60,
            map: [
                "#".repeat(17),
                "#P" + ".".repeat(14) + "#",
                ...Array<string>(12).fill(open),
                "#".repeat(17),
            ],
            enemies: [],
        })
        frame(createGameState(level))
        expect(calls.filter((c) => c.name === "translate")).toHaveLength(1)
        const rect = calls.find((c) => c.name === "rect")
        expect(rect?.args).toEqual([0, 0, 17 * 19, 15 * 19])
        const sprite = calls.find((c) => c.args[0] === "🐉")
        expect(sprite?.font).toBe(font(19))
    })

    it("draws a maze that fits whole as before, unmoved", () => {
        const { calls, frame, view } = bigSetup()
        view.innerWidth = 1000
        view.innerHeight = 800
        frame(createGameState(BIG_LEVEL))
        // (1000 - 32) / 29 columns: 33 px cells.
        expect(calls.filter((c) => c.name === "translate")).toHaveLength(1)
        const rect = calls.find((c) => c.name === "rect")
        expect(rect?.args).toEqual([0, 0, 29 * 33, 21 * 33])
    })

    describe("with two players", () => {
        it("follows their midpoint while they are close", () => {
            const { calls, frame, scroll } = bigSetup()
            const state = coop()
            place(state.players[0], { x: 12, y: 9 })
            place(state.players[1], { x: 16, y: 9 })
            frame(state)
            expect(scroll()[0]).toBeCloseTo(14.5 * CELL - VIEWPORT.width / 2)
            const sprite = calls.find((c) => c.args[0] === "🐉")
            expect(sprite?.args[1]).toBe(12.5 * CELL)
        })

        it("zooms out to keep both in view, down to the whole maze", () => {
            const { calls, frame, scroll } = bigSetup()
            // On their spawns, bottom left and bottom right.
            frame(coop())
            const cell = VIEWPORT.width / 29
            const sprites = calls.filter((c) => c.args[0] === "🐉")
            expect(sprites.map((c) => c.args[1])).toEqual([
                1.5 * cell,
                27.5 * cell,
            ])
            expect(sprites[0].font).toBe(font(cell))
            // The whole maze across, and centred down.
            const [x, y] = scroll()
            expect(x).toBe(0)
            expect(y).toBeCloseTo((21 * cell - VIEWPORT.height) / 2, 0)
        })

        it("ignores a player out of play", () => {
            const { calls, frame, scroll } = bigSetup()
            const state = coop()
            takeOut(state.players[1], PLAYER_RESPAWN_DELAY)
            frame(state)
            expect(scroll()).toEqual([0, MAX_Y])
            const sprite = calls.find((c) => c.args[0] === "🐉")
            expect(sprite?.font).toBe(font(CELL))
        })

        it("holds the view while nobody is in play", () => {
            const { frame, scroll } = bigSetup()
            const state = coop()
            place(state.players[0], { x: 12, y: 9 })
            place(state.players[1], { x: 16, y: 9 })
            frame(state)
            const held = scroll()
            takeOut(state.players[0], PLAYER_RESPAWN_DELAY)
            takeOut(state.players[1], PLAYER_RESPAWN_DELAY)
            // Out far from where the view is.
            place(state.players[0], { x: 1, y: 19 })
            place(state.players[1], { x: 27, y: 19 })
            frame(state, 1000)
            expect(scroll()).toEqual(held)
        })

        it("draws the fog's darkness over the screen, with only the lights on it", () => {
            const { calls, frame } = bigSetup()
            const layerCanvas = document.createElement("canvas")
            const layer = stubContext()
            vi.spyOn(layerCanvas, "getContext").mockReturnValue(
                layer.ctx as never
            )
            vi.spyOn(document, "createElement").mockReturnValue(layerCanvas)
            const state = coop()
            place(state.players[1], { x: 3, y: 19 })
            frame(state, 0, { fog: { radius: 2 } })
            // The layer covers the screen, not the whole maze.
            expect(layerCanvas.width).toBe(VIEWPORT.width)
            expect(layerCanvas.height).toBe(VIEWPORT.height)
            const image = calls.find((c) => c.name === "drawImage")
            expect(image?.args.slice(1)).toEqual([
                0,
                MAX_Y,
                VIEWPORT.width,
                VIEWPORT.height,
            ])
            // The maze wraps across, but the lights' copies one maze-width
            // away are off screen.
            const lights = layer.calls.filter(
                (c) => c.name === "createRadialGradient"
            )
            expect(lights.map((c) => c.args[0])).toEqual([
                1.5 * CELL,
                3.5 * CELL,
            ])
        })
    })
})

describe("createGuardSprites (KDA-293)", () => {
    // A document whose every canvas has a stub context of its own; `made`
    // lists them, in the order made. A guarding sprite takes two.
    function fakeDocument() {
        const made: ReturnType<typeof stubContext>[] = []
        const doc = {
            createElement: () => {
                const stub = stubContext()
                made.push(stub)
                return { width: 0, height: 0, getContext: () => stub.ctx }
            },
        }
        return { doc: doc as never, made, builds: () => made.length / 2 }
    }

    // Regression (PR #101 review): keyed by the exact size, a view easing
    // its cell size made a new sprite on nearly every frame.
    it("makes one sprite for sizes within a pixel of each other", () => {
        const { doc, builds } = fakeDocument()
        const sprites = createGuardSprites(doc)
        for (let i = 0; i < 40; i++) sprites("👺", 38 + i * 0.01, 2)
        expect(builds()).toBe(1)
        expect(sprites("👺", 38.3, 2)?.size).toBe(38)
        sprites("👺", 39, 2)
        expect(builds()).toBe(2)
    })

    it("makes one per sprite and per pixel ratio", () => {
        const { doc, builds } = fakeDocument()
        const sprites = createGuardSprites(doc)
        sprites("👺", 38, 1)
        sprites("👺", 38, 2)
        sprites("👹", 38, 2)
        expect(builds()).toBe(3)
        sprites("👺", 38, 1)
        sprites("👺", 38, 2)
        expect(builds()).toBe(3)
    })

    it("drops them all once there are too many", () => {
        const { doc, builds } = fakeDocument()
        const sprites = createGuardSprites(doc)
        for (let size = 1; size <= GUARD_SPRITES_KEPT; size++) {
            sprites("👺", size, 1)
        }
        sprites("👺", 1, 1)
        expect(builds()).toBe(GUARD_SPRITES_KEPT)
        // One more: the rest go, so the first is made again.
        sprites("👺", GUARD_SPRITES_KEPT + 1, 1)
        sprites("👺", 1, 1)
        expect(builds()).toBe(GUARD_SPRITES_KEPT + 2)
    })

    it("tints by colour, keeping the sprite's shape, then outlines it", () => {
        const { doc, made } = fakeDocument()
        createGuardSprites(doc)("👺", 38, 2)
        const [tinted, outlined] = made
        const tint = tinted.calls.find(
            (c) => c.name === "fillRect" && c.fillStyle === STANCE_TINT
        )
        // "color" keeps the sprite's lightness, so its shading shows.
        expect(tint?.composite).toBe("color")
        // Then cut back to the sprite's own shape.
        expect(tinted.calls.at(-1)).toMatchObject({
            name: "fillText",
            composite: "destination-in",
        })
        const outline = outlined.calls.find(
            (c) => c.name === "fillRect" && c.fillStyle === STANCE_OUTLINE
        )
        expect(outline?.composite).toBe("source-in")
        // The tinted sprite goes over its outline.
        expect(outlined.calls.at(-1)).toMatchObject({
            name: "drawImage",
            composite: "source-over",
        })
    })
})
