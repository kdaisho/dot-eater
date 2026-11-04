// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { BOSS_BREATH } from "./bossBreath"
import {
    addStatus,
    addTileEffect,
    breathe,
    CHARGE_SECONDS,
    defeatEnemy,
    type BreathDef,
} from "./breath"
import { BREATHS } from "./breaths"
import { BREATH_ICE, FROZEN } from "./breaths/penguin"
import {
    AiType,
    BLINK_RATE,
    BossKind,
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
    createRenderer,
    HALF_SCALE,
    outLabel,
    PLAYER_COLORS,
    IMMUNE_BADGE,
    STUN_BADGE,
    stunLabel,
    type Effects,
    CHARGE_AURA_ALPHA,
    CHARGE_AURA_BASE,
    CHARGE_AURA_FULL_ALPHA,
    CHARGE_AURA_GROWTH,
    CHARGE_FLICKER_HZ,
    chargeAura,
} from "./render"
import { SNEAK_ALPHA, SNEAK_FAR, SNEAK_NEAR, sneakAlpha } from "./intercept"
import type { Particle } from "./particles"
import { createRushView, FLIGHT_SECONDS } from "./rushView"
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
import { ART, STAGE_STYLES } from "./tiles"
import { vec2 } from "./vec2"
import { stun } from "./versus"

// canvas-confetti crashes under happy-dom; keep it out in case anything
// imported here pulls it in.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// The solo health gauge's colour.
const HEALTH_COLOR = "#16a34a"

// happy-dom has no 2D canvas, so record the calls on a stub context: every
// method call is logged, with the fillStyle, strokeStyle, lineWidth, font,
// globalAlpha and globalCompositeOperation set at the time, and property
// writes are accepted. A gradient's colour stops are logged as
// addColorStop calls, and createImageData gives real pixels.
function stubContext() {
    const calls: {
        name: string
        args: unknown[]
        fillStyle?: unknown
        strokeStyle?: unknown
        lineWidth?: unknown
        font?: unknown
        globalAlpha?: unknown
        composite?: unknown
    }[] = []
    let fillStyle: unknown
    let strokeStyle: unknown
    let lineWidth: unknown
    let font: unknown
    let globalAlpha: unknown = 1
    const saved: unknown[] = []
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
                        lineWidth,
                        font,
                        globalAlpha,
                        composite,
                    })
                    if (name === "createRadialGradient") {
                        return {
                            addColorStop: (...stop: unknown[]) =>
                                calls.push({
                                    name: "addColorStop",
                                    args: stop,
                                }),
                        }
                    }
                    if (name === "createImageData") {
                        const [width, height] = args as number[]
                        const data = new Uint8ClampedArray(width * height * 4)
                        return { data, width, height }
                    }
                    // save and restore keep the alpha, as a canvas does.
                    if (name === "save") saved.push(globalAlpha)
                    if (name === "restore" && saved.length > 0) {
                        globalAlpha = saved.pop()
                    }
                }
            },
            set(_target, name, value) {
                if (name === "fillStyle") fillStyle = value
                if (name === "strokeStyle") strokeStyle = value
                if (name === "lineWidth") lineWidth = value
                if (name === "font") font = value
                if (name === "globalAlpha") globalAlpha = value
                if (name === "globalCompositeOperation") composite = value
                return true
            },
        }
    )
    return { ctx, calls }
}

// A canvas the renderer made for itself (its maze art, an effect tile, the
// 2-player darkness), with its stub context's calls.
type Offscreen = {
    canvas: HTMLCanvasElement
    calls: ReturnType<typeof stubContext>["calls"]
    // The spy on its getContext.
    getContext: { mock: { calls: unknown[] } }
}

// Give every canvas made from here on a stub context of its own, and list
// them as they are made.
function stubCanvases(): Offscreen[] {
    const made: Offscreen[] = []
    // The prototype's, as the spy is on the document itself.
    const create = Document.prototype.createElement.bind(document)
    vi.spyOn(document, "createElement").mockImplementation(
        (tag: string, options?: ElementCreationOptions) => {
            const el = create(tag, options)
            if (el instanceof HTMLCanvasElement) {
                const { ctx, calls } = stubContext()
                const getContext = vi
                    .spyOn(el, "getContext")
                    .mockReturnValue(ctx as never)
                made.push({ canvas: el, calls, getContext })
            }
            return el
        }
    )
    return made
}

// What a recorded call drew: a fillText's text, or for a drawImage of a
// sprite raster its sprite or badge name (see paintSprite);
// undefined for anything else.
function drawnName(c: { name: string; args: unknown[] }): unknown {
    if (c.name === "fillText") return c.args[0]
    if (c.name !== "drawImage") return undefined
    return (c.args[0] as HTMLCanvasElement).dataset?.sprite
}

// Where a drawImage of a sprite put it: its centre and its larger side, in
// the canvas's CSS pixels (drawSprite draws a raster centred on the spot).
function spriteBox(c: { args: unknown[] }): {
    x: number
    y: number
    size: number
} {
    const [, left, top, w, h] = c.args as [
        unknown,
        number,
        number,
        number,
        number,
    ]
    return { x: left + w / 2, y: top + h / 2, size: Math.max(w, h) }
}

function setup() {
    const view = { innerWidth: 1000, innerHeight: 400, devicePixelRatio: 2 }
    const canvas = document.createElement("canvas")
    const { ctx, calls } = stubContext()
    vi.spyOn(canvas, "getContext").mockReturnValue(ctx as never)
    const offscreen = stubCanvases()
    const renderer = createRenderer(canvas, { view })
    // The text drawn and the sprites (by name, see drawnName), in order.
    const texts = () => calls.flatMap((c) => drawnName(c) ?? [])
    // The maze art's canvas (see mapArt in render.ts): the one its pixels
    // were made for. And the colour of its art pixel (x, y) as "#rrggbb",
    // as last put on it.
    const art = () =>
        offscreen.find((o) =>
            o.calls.some(
                (c) =>
                    c.name === "createImageData" && (c.args[0] as number) > ART
            )
        )
    const artColor = (x: number, y: number) => {
        const put = art()
            ?.calls.filter((c) => c.name === "putImageData")
            .at(-1)
        const image = put?.args[0] as ImageData | undefined
        if (!image) return undefined
        const i = (y * image.width + x) * 4
        return `#${Array.from(image.data.slice(i, i + 3), (v) => v.toString(16).padStart(2, "0")).join("")}`
    }
    // The colour at the middle of cell (x, y) of the art.
    const cellColor = (x: number, y: number) =>
        artColor(x * ART + ART / 2, y * ART + ART / 2)
    return {
        canvas,
        calls,
        renderer,
        texts,
        view,
        offscreen,
        art,
        artColor,
        cellColor,
    }
}

// Whether a drawImage's source is one of the breaths' effect tiles (a
// canvas ART across that isn't a sprite raster).
function isEffectTile(source: unknown): boolean {
    return (
        source instanceof HTMLCanvasElement &&
        source.width === ART &&
        source.dataset.sprite === undefined
    )
}

// Stage 1's (the default's) dot colour, at the middle of its dot.
const DOT_COLOR = STAGE_STYLES[1].palette.D

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
        expect(texts()).toEqual(["dragon", "tengu", "oni"])
    })

    // KDA-300: pixel sprites face the way they go and walk while moving.
    describe("sprite looks", () => {
        // A one-row corridor with the player at (2, 1) and a fox at (4, 1).
        const corridor = [
            [1, 1, 1, 1, 1, 1, 1],
            [1, 0, 0, 0, 0, 0, 1],
            [1, 1, 1, 1, 1, 1, 1],
        ] as const
        const lookOf = (
            calls: ReturnType<typeof setup>["calls"],
            name: string
        ) => {
            const c = calls.find((c) => drawnName(c) === name)!
            return (c.args[0] as HTMLCanvasElement).dataset.look
        }

        it("mirrors a side-view player to face right, as it starts", () => {
            const state = makeState(corridor, { x: 2, y: 1 })
            const { calls, renderer } = setup()
            renderer.draw(state, 0)
            expect(lookOf(calls, "dragon")).toBe("dragon:0:mirror")
            state.players[0].breather.facing = vec2(-1, 0)
            renderer.draw(state, 0)
            calls.length = 0
            renderer.draw(state, 0)
            expect(lookOf(calls, "dragon")).toBe("dragon:0")
            // Facing up, it keeps the side it last faced.
            state.players[0].breather.facing = vec2(0, -1)
            calls.length = 0
            renderer.draw(state, 0)
            expect(lookOf(calls, "dragon")).toBe("dragon:0")
        })

        it("faces an enemy the way it last moved sideways", () => {
            const fox = makeEnemy(4, 1, AiType.ambusher)
            const state = makeState(corridor, { x: 2, y: 1 }, [fox])
            const { calls, renderer } = setup()
            renderer.draw(state, 0)
            // Not moved yet: facing left, as drawn.
            expect(lookOf(calls, "fox")).toBe("fox:0")
            fox.lastPos = vec2(3, 1)
            fox.moveProgress = 1
            calls.length = 0
            renderer.draw(state, 0)
            expect(lookOf(calls, "fox")).toBe("fox:0:mirror")
        })

        it("walks on frame 1 for the first half of each move", () => {
            const fox = makeEnemy(4, 1, AiType.ambusher, { x: 5, y: 1 })
            fox.lastPos = vec2(5, 1)
            const state = makeState(corridor, { x: 2, y: 1 }, [fox])
            const frameAt = (progress: number) => {
                fox.moveProgress = progress
                const { calls, renderer } = setup()
                renderer.draw(state, 0)
                return lookOf(calls, "fox")
            }
            expect(frameAt(0.2)).toBe("fox:1")
            expect(frameAt(0.7)).toBe("fox:0")
            // Arrived: standing.
            expect(frameAt(1)).toBe("fox:0")
        })

        it("draws a front-view enemy as it is whichever way it goes", () => {
            const oni = makeEnemy(4, 1, AiType.chase)
            oni.lastPos = vec2(3, 1)
            oni.moveProgress = 1
            const state = makeState(corridor, { x: 2, y: 1 }, [oni])
            const { calls, renderer } = setup()
            renderer.draw(state, 0)
            expect(lookOf(calls, "oni")).toBe("oni:0")
        })
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
        expect(drawEnemies(enemies)).toEqual([
            "dragon",
            "ghost",
            "robot",
            "fox",
            "oni",
        ])
        enemies.push(makeEnemy(5, 1, AiType.random, undefined, ENEMY_IDS[0]))
        expect(drawEnemies(enemies).at(-1)).toBe("tengu")
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
        const size = (name: string) =>
            calls
                .filter((c) => drawnName(c) === name)
                .map((c) => spriteBox(c).size)
        const [full] = size("dragon")
        expect(size("splitter")).toEqual([full])
        // The halves have a sprite of their own, drawn smaller.
        const halves = size("splitterHalf")
        expect(halves).toHaveLength(2)
        for (const half of halves) {
            expect(half).toBeCloseTo(full! * HALF_SCALE, 0)
        }
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
                calls.find((c) => drawnName(c) === text)
            // Everything else is drawn as usual.
            expect(sprite("oni")?.globalAlpha).toBe(1)
            expect(sprite("dragon")?.globalAlpha).toBe(1)
            return sprite("wolf")?.globalAlpha
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
        expect(drawEnemies(enemies)).toEqual(["dragon", "oni", "oni"])
    })

    it("gives every AI type its own sprite", () => {
        const types = Object.values(AiType)
        const sprites = drawEnemies(
            types.map((ai, i) => makeEnemy(i + 1, 1, ai))
        ).slice(1)
        expect(sprites).toHaveLength(types.length)
        expect(sprites).not.toContain("dragon")
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
            expect(texts()).toEqual(["dragon"])
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
        expect(texts()).toEqual(["dragon", "dragon"])
    })

    it("draws only the HUD fields given", () => {
        const state = createGameState(OLD_LEVEL)
        state.enemies = []

        const empty = setup()
        empty.renderer.draw(state, 0, {})
        expect(empty.texts()).toEqual(["dragon"])

        const full = setup()
        full.renderer.draw(state, 0, {
            score: 120,
            health: { health: 50, max: 100 },
        })
        expect(full.texts()).toEqual(["Score 120", "dragon"])
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
        expect(on.texts()).toEqual(["dragon"])
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
        const { cellColor, renderer } = setup()
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
        // Whether the maze art has a dot on cell (x, y).
        const dotAt = (x: number, y: number) => cellColor(x, y) === DOT_COLOR
        const drawAt = (progress: number) => {
            state.players[0].character.moveProgress = progress
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

        const enemies = () => [
            makeEnemy(4, 1, AiType.random, undefined, ENEMY_IDS[0]),
            makeEnemy(9, 1, AiType.chase, undefined, ENEMY_IDS[1]),
        ]

        it("hides enemies outside the radius, and darkens the maze over its tiles", () => {
            const { art, calls, renderer, texts } = setup()
            const state = makeState(corridor(), { x: 2, y: 1 }, enemies())
            renderer.draw(state, 0, {}, { fog: { radius: 3 } })
            // enemy1 (random) is 2 cells away, enemy2 (chase) 7.
            expect(texts()).toEqual(["dragon", "tengu"])
            // The whole maze's tiles go down first; the darkness (fully dark
            // past the radius) goes over them.
            const tiles = calls.findIndex(
                (c) => c.name === "drawImage" && c.args[0] === art()?.canvas
            )
            const dark = calls.findIndex(
                (c) => c.name === "createRadialGradient"
            )
            expect(tiles).toBeGreaterThanOrEqual(0)
            expect(dark).toBeGreaterThan(tiles)
        })

        it("tints the darkness by the stage's style", () => {
            const stops = (stage?: number) => {
                const { calls, renderer } = setup()
                const state = makeState(corridor(), { x: 2, y: 1 })
                renderer.draw(
                    state,
                    0,
                    {},
                    { fog: { radius: 3 } },
                    stage ? { stage } : {}
                )
                return calls
                    .filter((c) => c.name === "addColorStop")
                    .map((c) => c.args[1])
            }
            expect(stops(8)).toEqual(["rgba(8, 14, 28, 0)", "rgb(8, 14, 28)"])
            expect(stops(4)).toEqual(["rgba(17, 17, 17, 0)", "rgb(17, 17, 17)"])
            expect(stops()).toEqual(["rgba(17, 17, 17, 0)", "rgb(17, 17, 17)"])
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
            expect(fogged()).toEqual({ texts: ["dragon"], radii: [2.5, 4] })
            expect(fogged(BREATHS.owl)).toEqual({
                texts: ["owl", "oni"],
                radii: [4.5, 6],
            })
        })

        // Regression: only things whose centre was inside the radius were
        // drawn, so walls and enemies popped in at the soft edge.
        it("draws what reaches into the light, so it fades in", () => {
            const { renderer, texts } = setup()
            const state = makeState(corridor(), { x: 2, y: 1 }, [
                makeEnemy(5, 1, AiType.random, undefined, ENEMY_IDS[0]),
            ])
            renderer.draw(state, 0, {}, { fog: { radius: 2.5 } })
            // The enemy's centre is 3 cells away: past 2.5, but its near
            // edge isn't.
            expect(texts()).toEqual(["dragon", "tengu"])
        })

        it("draws everything without fog", () => {
            const { calls, cellColor, renderer, texts } = setup()
            const state = makeState(corridor(), { x: 2, y: 1 }, enemies())
            renderer.draw(state, 0, {}, {})
            expect(texts()).toEqual(["dragon", "tengu", "oni"])
            const dots = Array.from({ length: 13 }, (_, x) => cellColor(x, 1))
            expect(dots.filter((c) => c === DOT_COLOR)).toHaveLength(10)
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
            const { calls, renderer, texts } = setup()
            const state = makeState(corridor(true), { x: 1, y: 1 }, [
                makeEnemy(11, 1, AiType.random, undefined, ENEMY_IDS[0]),
                makeEnemy(8, 1, AiType.chase, undefined, ENEMY_IDS[1]),
            ])
            renderer.draw(state, 0, {}, { fog: { radius: 3 } })
            expect(texts()).toEqual(["dragon", "tengu"])
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
            expect(texts()).toEqual(["Score 10", "dragon"])
        })

        it("keeps the fog when redrawing on resize", () => {
            const { renderer, texts, view } = setup()
            const state = makeState(corridor(), { x: 2, y: 1 }, enemies())
            renderer.draw(state, 0, {}, { fog: { radius: 1 } })
            view.innerHeight = 200
            renderer.resize()
            expect(texts()).toEqual(["dragon", "dragon"])
        })
    })

    describe("pixel tiles", () => {
        // The shared ice's colours (stage 1 has no ice of its own).
        const ICE = ["#a9e1f7", "#ecfbff", "#5fb3d9"]

        it("draws ice cells as ice tiles, with their dots on top", () => {
            const { artColor, cellColor, renderer } = setup()
            const { map, ice } = textMap(["######", "# :~ #", "######"])
            renderer.draw(makeState(map, { x: 1, y: 1 }, [], { ice }), 0)
            expect(cellColor(2, 1)).toBe(DOT_COLOR)
            expect(ICE).toContain(artColor(2 * ART + 1, ART + 1))
            expect(ICE).toContain(cellColor(3, 1))
            expect(ICE).not.toContain(cellColor(4, 1))
        })

        it("draws the Penguin's breath ice as ice, for as long as it lasts", () => {
            const { cellColor, renderer } = setup()
            const state = makeState(
                [
                    [1, 1, 1, 1, 1],
                    [1, 0, 0, 0, 1],
                    [1, 1, 1, 1, 1],
                ],
                { x: 1, y: 1 }
            )
            renderer.draw(state, 0)
            expect(ICE).not.toContain(cellColor(2, 1))
            addTileEffect(state, vec2(2, 1), BREATH_ICE, 5)
            renderer.draw(state, 0)
            expect(ICE).toContain(cellColor(2, 1))
        })

        it("paints the tiles once, then only the cells that change", () => {
            const { art, renderer } = setup()
            const state = makeState(
                [
                    [1, 1, 1, 1, 1, 1, 1],
                    [1, 2, 2, 2, 2, 2, 1],
                    [1, 1, 1, 1, 1, 1, 1],
                ],
                { x: 1, y: 1 }
            )
            const puts = () =>
                art()!.calls.filter((c) => c.name === "putImageData")
            renderer.draw(state, 0)
            expect(puts()).toHaveLength(1)
            renderer.draw(state, 0.5)
            renderer.draw(state, 0)
            expect(puts()).toHaveLength(1)
            // A dot eaten at (4, 1): that cell and its neighbours.
            state.cells[1][4] = Cell.none
            renderer.draw(state, 0)
            expect(puts()).toHaveLength(2)
            expect(puts()[1].args.slice(1)).toEqual([
                0,
                0,
                3 * ART,
                0,
                3 * ART,
                3 * ART,
            ])
        })

        it("draws the map art crisp, scaled to the map", () => {
            const { art, calls, canvas, renderer } = setup()
            renderer.draw(createGameState(OLD_LEVEL), 0)
            const cell = parseFloat(canvas.style.width) / 9
            const drawn = calls.find(
                (c) => c.name === "drawImage" && c.args[0] === art()?.canvas
            )!
            expect(drawn.args.slice(1)).toEqual([0, 0, 9 * cell, 9 * cell])
            expect(art()!.canvas.width).toBe(9 * ART)
        })

        it("draws the stage's own tiles, and starts afresh on a new stage", () => {
            const { cellColor, renderer } = setup()
            const state = makeState(
                [
                    [1, 1, 1],
                    [1, 0, 1],
                    [1, 1, 1],
                ],
                { x: 1, y: 1 }
            )
            renderer.draw(state, 0, {}, {}, { stage: 8 })
            const floor = (stage: number) => STAGE_STYLES[stage].palette.F
            expect([floor(8), STAGE_STYLES[8].palette.f]).toContain(
                cellColor(1, 1)
            )
            renderer.draw(state, 0, {}, {}, { stage: 9 })
            expect(cellColor(1, 1)).not.toBe(floor(8))
        })

        it("draws nothing of the maze without a 2D context for its art", () => {
            const canvas = document.createElement("canvas")
            const { ctx, calls } = stubContext()
            vi.spyOn(canvas, "getContext").mockReturnValue(ctx as never)
            // happy-dom's own canvases have no 2D context.
            const renderer = createRenderer(canvas, {
                view: {
                    innerWidth: 1000,
                    innerHeight: 400,
                    devicePixelRatio: 2,
                },
            })
            expect(() =>
                renderer.draw(createGameState(OLD_LEVEL), 0)
            ).not.toThrow()
            // Only the (blank) sprite rasters are drawn.
            expect(
                calls.some(
                    (c) => c.name === "drawImage" && drawnName(c) === undefined
                )
            ).toBe(false)
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
            expect(texts()).toEqual(["penguin"])
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

        it("draws tile effects by their look: the colour, then the pixel tile", () => {
            const { renderer, calls, canvas, offscreen, texts } = setup()
            const state = room()
            addTileEffect(
                state,
                vec2(2, 1),
                { name: "test.fire", look: { color: "red", tile: "fire" } },
                1
            )
            renderer.draw(state, 0)
            const cell = parseFloat(canvas.style.width) / 5
            const wash = calls.findIndex((c) => c.fillStyle === "red")
            const tile = calls.findIndex(
                (c) => c.name === "drawImage" && isEffectTile(c.args[0])
            )
            expect(wash).toBeGreaterThanOrEqual(0)
            expect(tile).toBeGreaterThan(wash)
            expect(calls[tile].args.slice(1)).toEqual([
                2 * cell,
                cell,
                cell,
                cell,
            ])
            // The fire tile's own canvas, its pixels put on once.
            const fire = offscreen.find(
                (o) => o.canvas === calls[tile].args[0]
            )!
            expect(
                fire.calls.filter((c) => c.name === "putImageData")
            ).toHaveLength(1)
            expect(texts()).toEqual(["dragon"])
        })

        // KDA-299: the sprites' outline would vanish on a dark floor.
        it("outlines the sprites in the stage's colour, light on a dark floor", () => {
            const outlines = (stage: number) => {
                const enemy = makeEnemy(3, 1)
                const state = room()
                state.enemies = [enemy]
                addStatus(enemy, FROZEN, 1)
                const { renderer, calls } = setup()
                renderer.draw(state, 0, {}, {}, { stage })
                return calls
                    .filter((c) => drawnName(c) !== undefined)
                    .map((c) => ({
                        name: drawnName(c),
                        outline: (c.args[0] as HTMLCanvasElement).dataset
                            .outline,
                    }))
            }
            for (const stage of [8, 9, 10]) {
                const light = STAGE_STYLES[stage].outline
                expect(light).not.toBe("#000000")
                // The frozen enemy (held, so under the player) with its
                // badge, then the player.
                expect(outlines(stage)).toEqual([
                    { name: "tengu", outline: light },
                    { name: "frozen", outline: light },
                    { name: "dragon", outline: light },
                ])
            }
            expect(outlines(1).map((d) => d.outline)).toEqual([
                "#000000",
                "#000000",
                "#000000",
            ])
        })

        it("draws the frozen ice block over a frozen enemy's sprite", () => {
            const enemy = makeEnemy(3, 1)
            const state = room()
            state.enemies = [enemy]
            addStatus(enemy, FROZEN, 1)
            const { renderer, calls, canvas } = setup()
            renderer.draw(state, 0)
            const cell = parseFloat(canvas.style.width) / 5
            const sprite = calls.findIndex((c) => drawnName(c) === "tengu")
            const block = calls.findIndex(
                (c, i) =>
                    i > sprite &&
                    c.name === "drawImage" &&
                    isEffectTile(c.args[0])
            )
            expect(sprite).toBeGreaterThanOrEqual(0)
            expect(block).toBeGreaterThan(sprite)
            // A cell square, on the enemy's cell.
            expect(calls[block].args.slice(1)).toEqual([
                3 * cell,
                cell,
                cell,
                cell,
            ])
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
                {
                    name: "test.frozen",
                    look: { color: "blue", badge: "frozen" },
                },
                1
            )
            renderer.draw(state, 0)
            expect(
                calls.some((c) => c.name === "fill" && c.fillStyle === "blue")
            ).toBe(true)
            // The badge is a pixel sprite of its own (KDA-300).
            expect(texts()).toEqual(["dragon", "tengu", "frozen"])
        })

        // Regression (PR #74 review): the sprite and badge were drawn with
        // the look's translucent fill still set, and canvas drew the emoji
        // they were then with the fill's alpha, so they came out
        // see-through. Pixel sprites must still come out opaque.
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
                { name: "test.burning", look: { color, badge: "stunned" } },
                1
            )
            const { renderer, calls } = setup()
            renderer.draw(state, 0)
            for (const name of ["tengu", "stunned"]) {
                const drawn = calls.find((c) => drawnName(c) === name)!
                expect(drawn.name, name).toBe("drawImage")
                expect(drawn.globalAlpha, name).toBe(1)
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
                    look: { color: "blue", badge: "frozen" },
                },
                1
            )
            const { renderer, calls, texts } = setup()
            renderer.draw(state, 0)
            // The frozen enemy and its badge, both players with their
            // markers, then the moving enemy.
            expect(texts().filter((t) => t !== "1" && t !== "2")).toEqual([
                "tengu",
                "frozen",
                "dragon",
                "dragon",
                "oni",
            ])
            const disc = calls.findIndex(
                (c) => c.name === "fill" && c.fillStyle === "blue"
            )
            const player = calls.findIndex((c) => drawnName(c) === "dragon")
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
                return calls.find((c) => drawnName(c) === "tengu")!.args[1]
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
                return spriteBox(calls.find((c) => drawnName(c) === "dragon")!)
                    .x
            }
            // At 1.5x it gets 1.5 times as far through the frame (to the
            // half pixel the sprite is put on at a devicePixelRatio of 2).
            const start = spriteX(1.5, 0)
            expect(spriteX(1.5, 0.9) - start).toBeCloseTo(
                1.5 * (spriteX(1, 0.9) - start),
                0
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
            expect(gone.texts()).toEqual(["dragon"])
            enemy.respawnIn = RESPAWN_BLINK
            const blink = setup()
            blink.renderer.draw(state, 0)
            expect(blink.texts()).toEqual(["dragon", "tengu"])
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
            expect(texts()).toEqual(["kitsune", "dragon"])
            const cell = cellOf(canvas)
            const boss = spriteBox(
                calls.find((c) => drawnName(c) === "kitsune")!
            )
            expect(boss.x).toBeCloseTo(4 * cell, 0)
            expect(boss.y).toBeCloseTo(2 * cell, 0)
            expect(boss.size).toBeCloseTo(cell * SPRITE_SCALE * BOSS_SCALE, 0)
        })

        it("glides it between cells like any character", () => {
            const state = bossState()
            const boss = state.boss!
            boss.lastPos = vec2(4, 1)
            boss.moveProgress = 0.5
            const { calls, canvas, renderer } = setup()
            renderer.draw(state, 0)
            const sprite = calls.find((c) => drawnName(c) === "kitsune")!
            expect(spriteBox(sprite).x).toBeCloseTo(4.5 * cellOf(canvas), 0)
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
            const sprite = calls.findIndex((c) => drawnName(c) === "kitsune")
            expect(glow).toBeGreaterThanOrEqual(0)
            expect(glow).toBeLessThan(sprite)
        })

        // Regression (PR #74 review): the sprite was drawn with the glow's
        // translucent fill still set, and canvas drew the emoji it was then
        // with the fill's alpha, so the boss faded out as it wound up.
        it("draws its sprite opaque over the glow", () => {
            const { calls, renderer } = setup()
            renderer.draw(windingUp(), 0, {}, {}, IN_GAME)
            const sprite = calls.find((c) => drawnName(c) === "kitsune")!
            expect(sprite.name).toBe("drawImage")
            expect(sprite.globalAlpha).toBe(1)
        })

        // KDA-298: the Kitsune's tails show its health, and the final boss
        // blazes as it winds up.
        const looks = (calls: ReturnType<typeof setup>["calls"]) =>
            calls.flatMap((c) =>
                c.name === "drawImage"
                    ? [(c.args[0] as HTMLCanvasElement).dataset.look]
                    : []
            )

        it("draws the Kitsune with a tail per ninth of its health left", () => {
            const state = bossState()
            const boss = state.boss!
            expect(boss.maxHealth).toBe(12)
            const tails = (health: number) => {
                boss.health = health
                const { calls, renderer } = setup()
                renderer.draw(state, 0)
                return looks(calls).filter((l) => l?.startsWith("kitsune"))
            }
            // A ninth of 12 is 1.33 health.
            expect(tails(12)).toEqual(["kitsune:0:tails9"])
            expect(tails(4.1)).toEqual(["kitsune:0:tails4"])
            expect(tails(4)).toEqual(["kitsune:0:tails3"])
            expect(tails(0.1)).toEqual(["kitsune:0:tails1"])
        })

        it("draws the final boss on stage 10 with its wind-up grid while it winds up", () => {
            const state = windingUp()
            state.boss!.kind = BossKind.final
            const { calls, renderer, texts } = setup()
            renderer.draw(state, 0, {}, {}, IN_GAME)
            expect(texts()).toContain("finalBoss")
            expect(looks(calls)).toContain("finalBoss:0:windUp")
            // Not on end screens, where no wind-up shows.
            const end = setup()
            end.renderer.draw(state, 0, {}, {}, {})
            expect(looks(end.calls)).toContain("finalBoss:0")
            // Nor once it has breathed.
            state.boss!.breath.windingUp = 0
            const calm = setup()
            calm.renderer.draw(state, 0, {}, {}, IN_GAME)
            expect(looks(calm.calls)).toContain("finalBoss:0")
            expect(looks(calm.calls)).not.toContain("finalBoss:0:windUp")
        })

        it("shows no wind-up on end screens", () => {
            const end = setup()
            end.renderer.draw(windingUp(), 0, {}, {}, {})
            expect(tinted(end)).toEqual([])
            expect(glows(end.calls)).toBe(-1)
            expect(end.texts()).toContain("kitsune")
        })

        it("doesn't draw it once defeated", () => {
            const state = bossState()
            state.boss!.defeated = true
            const { calls, renderer, texts } = setup()
            renderer.draw(state, 0)
            expect(texts()).toEqual(["dragon"])
            expect(healthBar(calls)).toHaveLength(0)
        })

        it("hides it in fog when none of it reaches into the light", () => {
            const state = bossState()
            state.boss!.pos = vec2(6, 1)
            state.boss!.lastPos = vec2(6, 1)
            const dark = setup()
            dark.renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            expect(dark.texts()).toEqual(["dragon"])
            // Its nearest cell, (3, 1), is 2 cells from the player.
            state.boss!.pos = vec2(3, 1)
            state.boss!.lastPos = vec2(3, 1)
            const lit = setup()
            lit.renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            expect(lit.texts()).toEqual(["kitsune", "dragon"])
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
            const sprite = calls.findIndex((c) => drawnName(c) === "snake")
            expect(glow).toBeGreaterThanOrEqual(0)
            expect(glow).toBeLessThan(sprite)
            expect(calls[sprite].globalAlpha).toBe(1)
        })

        it("shows no wind-up on end screens", () => {
            const end = setup()
            end.renderer.draw(breatherState(), 0, {}, {}, {})
            expect(tinted(end)).toEqual([])
            expect(glows(end.calls)).toBe(-1)
            expect(end.texts()).toContain("snake")
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
        expect(texts()).toEqual(["owl", "1", "boar", "2"])
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
        expect(texts()).toEqual(["penguin", "1", "penguin", "2"])
    })

    it("draws no marker with one player", () => {
        const { calls, renderer, texts } = setup()
        const state = createGameState(OLD_LEVEL)
        state.enemies = []
        renderer.draw(state, 0)
        expect(texts()).toEqual(["dragon"])
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
        const { cellColor, renderer } = setup()
        const state = pair()
        movePlayer(state, vec2(-1, 0), state.players[1])
        state.players[1].character.moveProgress = 0
        renderer.draw(state, 0)
        expect(state.cells[1][4]).toBe(Cell.none)
        expect(cellColor(4, 1)).toBe(DOT_COLOR)
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
            expect(texts()).toEqual([
                "dragon",
                "1",
                "dragon",
                "2",
                "tengu",
                "fox",
            ])
        })

        // The canvas the darkness is drawn on: the one made with lights
        // cleared out of it (the others are the maze art and tiles).
        const darkness = (offscreen: Offscreen[]) =>
            offscreen.find((o) =>
                o.calls.some((c) => c.name === "createRadialGradient")
            )

        it("draws the darkness on a layer with a light per player", () => {
            const { art, calls, canvas, offscreen, renderer } = setup()
            const state = makeState(corridor, [
                { x: 1, y: 1 },
                { x: 11, y: 1 },
            ])
            renderer.draw(state, 0)
            calls.length = 0
            renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            const cell = parseFloat(canvas.style.width) / 13
            expect(calls.some((c) => c.name === "createRadialGradient")).toBe(
                false
            )
            const layer = darkness(offscreen)!
            const lights = layer.calls.filter(
                (c) => c.name === "createRadialGradient"
            )
            expect(lights.map((c) => c.args[0])).toEqual([
                1.5 * cell,
                11.5 * cell,
            ])
            // The layer goes over the maze, filled with the stage's fog.
            const images = calls.filter(
                (c) =>
                    c.name === "drawImage" &&
                    c.args[0] !== art()?.canvas &&
                    drawnName(c) === undefined
            )
            expect(images).toHaveLength(1)
            expect(images[0].args[0]).toBe(layer.canvas)
            expect(images[0].args.slice(1)).toEqual([0, 0, 13 * cell, 3 * cell])
            expect(
                layer.calls.find((c) => c.name === "fillRect")?.fillStyle
            ).toBe("rgb(17, 17, 17)")
        })

        it("gives each player its own light: the Owl's 1.5 times as wide", () => {
            const { canvas, offscreen, renderer } = setup()
            const state = makeState(
                corridor,
                [
                    { x: 1, y: 1 },
                    { x: 11, y: 1 },
                ],
                [],
                { breath: [BREATHS.dragon, BREATHS.owl] }
            )
            renderer.draw(state, 0)
            renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            const cell = parseFloat(canvas.style.width) / 13
            const outer = darkness(offscreen)!
                .calls.filter((c) => c.name === "createRadialGradient")
                .map((c) => (c.args[5] as number) / cell)
            expect(outer).toEqual([2, 3])
        })

        // Resizing a canvas reallocates it: the layer is sized, and its
        // context taken, once, and again only when the size changes.
        it("reuses the layer from frame to frame", () => {
            const { offscreen, renderer, view } = setup()
            const state = makeState(corridor, [
                { x: 1, y: 1 },
                { x: 11, y: 1 },
            ])
            renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            const layer = darkness(offscreen)!
            const layerCanvas = layer.canvas
            const { getContext } = layer
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
            for (let i = 0; i < 2; i++) {
                renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            }
            expect(getContext).toHaveBeenCalledTimes(1)
            expect(widths).toHaveLength(0)
            // Each frame starts from a clear layer.
            expect(
                layer.calls.filter((c) => c.name === "clearRect")
            ).toHaveLength(3)
            // A smaller window shrinks the map, and the layer with it.
            const before = layerCanvas.width
            view.innerWidth = 500
            renderer.resize()
            renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            expect(widths.length).toBeGreaterThan(0)
            expect(widths.at(-1)).toBeLessThan(before)
            expect(getContext).toHaveBeenCalledTimes(1)
            // The one darkness layer, and the maze art, made once each.
            expect(
                offscreen.filter((o) => o === darkness(offscreen))
            ).toHaveLength(1)
        })

        it("draws one player's darkness straight onto the map", () => {
            const { art, calls, renderer } = setup()
            const state = makeState(corridor, { x: 1, y: 1 })
            renderer.draw(state, 0, {}, { fog: { radius: 2 } })
            expect(
                calls.some(
                    (c) =>
                        c.name === "drawImage" &&
                        c.args[0] !== art()?.canvas &&
                        drawnName(c) === undefined
                )
            ).toBe(false)
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
        expect(texts()).toEqual(["boar", "2"])
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
        const { calls, offscreen, renderer } = setup()
        const state = pair()
        takeOut(state.players[0], PLAYER_RESPAWN_DELAY)
        takeOut(state.players[1], PLAYER_RESPAWN_DELAY)
        renderer.draw(state, 0, {}, { fog: { radius: 2 } })
        expect(calls.some((c) => c.name === "createRadialGradient")).toBe(false)
        const lights = offscreen.flatMap((o) =>
            o.calls.filter((c) => c.name === "createRadialGradient")
        )
        expect(lights).toHaveLength(2)
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
        expect(texts()).toEqual(["owl", "1", "boar", "2", STUN_BADGE])
    })

    it("marks a player immune after a stun with the immune badge", () => {
        const { renderer, texts } = setup()
        const state = pair()
        state.players[1].stunImmuneFor = 1
        renderer.draw(state, 0)
        expect(texts()).toEqual(["owl", "1", "boar", "2", IMMUNE_BADGE])
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
        const sprite = calls.findIndex((c) => drawnName(c) === "dragon")
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
        const hud = calls.findIndex((c) => drawnName(c) === "Score 5")
        const sprite = calls.findIndex((c) => drawnName(c) === "dragon")
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
})

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

    it("shows a charge let go during the cooldown, steady, until it fires", () => {
        const b = breather()
        b.charge = 4 * CHARGE_SECONDS + 0.5 / CHARGE_FLICKER_HZ
        b.fireAt = 5
        expect(chargeAura(b, false)).toEqual({
            color: RED,
            alpha: CHARGE_AURA_FULL_ALPHA,
            scale: CHARGE_AURA_BASE + 4 * CHARGE_AURA_GROWTH,
        })
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
        const sprite = calls.findIndex((c) => drawnName(c) === "dragon")
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

describe("createRenderer with the facing arrows", () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

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

    describe("the facing arrow", () => {
        const ARROW = { arrows: true } as const
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

        it("outlines it light inside and dark outside, under the fill", () => {
            const { calls, canvas, renderer } = setup()
            renderer.draw(charged(), 0, {}, {}, ARROW)
            const fill = calls.findIndex(
                (c) => c.name === "fill" && c.fillStyle === PLAYER_COLORS[0]
            )
            const start = calls
                .slice(0, fill)
                .map((c) => c.name)
                .lastIndexOf("beginPath")
            // The strokes on the arrow's own path, before its fill.
            const strokes = calls
                .slice(start, fill)
                .filter((c) => c.name === "stroke")
                .map((c) => ({ color: c.strokeStyle, width: c.lineWidth }))
            const cell = cellOf(canvas)
            const light = Math.max(1, cell * 0.06)
            const dark = Math.max(1, cell * 0.03)
            expect(strokes).toEqual([
                { color: "#000000", width: 2 * (light + dark) },
                { color: "#ffffff", width: 2 * light },
            ])
        })

        it("draws none while the breath isn't charged", () => {
            const { calls, canvas, renderer } = setup()
            renderer.draw(game(2), 0, {}, {}, ARROW)
            expect(arrows(calls, canvas)).toEqual([])
        })

        it("draws none unless asked (end screens)", () => {
            const { calls, canvas, renderer } = setup()
            renderer.draw(charged(2), 0, {}, {}, {})
            expect(arrows(calls, canvas)).toEqual([])
        })

        it("draws no aim tint", () => {
            const { calls, canvas, renderer } = setup()
            renderer.draw(charged(2), 0, {}, {}, ARROW)
            for (const i of [0, 1]) expect(tinted(calls, canvas, i)).toEqual([])
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
        const texts = () => calls.flatMap((c) => drawnName(c) ?? [])
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

    // A sprite's size at `cell` px cells (at a devicePixelRatio of 1, to
    // the pixel).
    const spriteSize = (cell: number) => Math.round(cell * SPRITE_SCALE)

    it("zooms in to the minimum cell size and shows the player's corner", () => {
        const { canvas, calls, frame, scroll, texts } = bigSetup()
        // Player 1 starts bottom left.
        frame(createGameState(BIG_LEVEL))
        expect(canvas.style.width).toBe(`${VIEWPORT.width}px`)
        expect(canvas.style.height).toBe(`${VIEWPORT.height + CELL}px`)
        // Held at the maze's left and bottom edges.
        expect(scroll()).toEqual([0, MAX_Y])
        const sprite = spriteBox(calls.find((c) => drawnName(c) === "dragon")!)
        expect(sprite).toEqual({
            x: 1.5 * CELL,
            y: 19.5 * CELL,
            size: spriteSize(CELL),
        })
        // The enemy top right is out of view; the one in the middle isn't.
        expect(texts()).toEqual(["dragon", "oni"])
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
        const drawn = calls.filter((c) => drawnName(c) === "oni")
        expect(drawn.map((c) => spriteBox(c).x)).toEqual([0, 29 * CELL])
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
        const sprite = calls.find((c) => drawnName(c) === "dragon")!
        expect(spriteBox(sprite).size).toBe(spriteSize(19))
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
            const sprite = calls.find((c) => drawnName(c) === "dragon")!
            expect(spriteBox(sprite).x).toBe(12.5 * CELL)
        })

        it("zooms out to keep both in view, down to the whole maze", () => {
            const { calls, frame, scroll } = bigSetup()
            // On their spawns, bottom left and bottom right.
            frame(coop())
            const cell = VIEWPORT.width / 29
            const sprites = calls
                .filter((c) => drawnName(c) === "dragon")
                .map(spriteBox)
            expect(sprites).toHaveLength(2)
            expect(sprites[0]!.x).toBeCloseTo(1.5 * cell, 0)
            expect(sprites[1]!.x).toBeCloseTo(27.5 * cell, 0)
            expect(sprites[0]!.size).toBe(spriteSize(cell))
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
            const sprite = calls.find((c) => drawnName(c) === "dragon")!
            expect(spriteBox(sprite).size).toBe(spriteSize(CELL))
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
            const offscreen = stubCanvases()
            const state = coop()
            place(state.players[1], { x: 3, y: 19 })
            frame(state, 0)
            frame(state, 0, { fog: { radius: 2 } })
            const layer = offscreen.find((o) =>
                o.calls.some((c) => c.name === "createRadialGradient")
            )!
            const layerCanvas = layer.canvas
            // The layer covers the screen, not the whole maze.
            expect(layerCanvas.width).toBe(VIEWPORT.width)
            expect(layerCanvas.height).toBe(VIEWPORT.height)
            const image = calls.find(
                (c) => c.name === "drawImage" && c.args[0] === layerCanvas
            )
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

// KDA-307: a Rush's rammed enemy is drawn flying until it slams.
describe("createRenderer drawing a Rush", () => {
    afterEach(() => vi.restoreAllMocks())

    const hall = textMap([
        "##############",
        "#            #",
        "##############",
        "#.############",
    ]).map
    const TICK = 1 / TICK_RATE

    // The Boar on x 3, right behind a Tengu on x 4, rams it 2 cells on (a
    // tap): it flies to x 6, defeated there in the game at once. `ticks`
    // of the flight's time later.
    function rammed(ticks: number) {
        const tengu = makeEnemy(4, 1, AiType.random)
        tengu.speed = 0
        const state = makeState(hall, { x: 3, y: 1 }, [tengu], {
            breath: BREATHS.boar,
        })
        state.players[0].breather.energy = 100
        state.players[0].character.moveProgress = 1
        breathe(state, state.players[0], 1)
        const view = createRushView()
        view.take(state.events, state)
        for (let k = 0; k <= ticks; k++) view.update(TICK)
        return { state, effects: { rush: view.flights } }
    }

    // Where the Tengu was drawn, in cells from the Boar (on x 3), and the
    // turn it was drawn at, if it was.
    function tenguDrawn(ticks: number) {
        const { calls, canvas, renderer } = setup()
        const { state, effects } = rammed(ticks)
        renderer.draw(state, 0, {}, {}, effects)
        const cell = parseFloat(canvas.style.width) / 14
        const boar = spriteBox(calls.find((c) => drawnName(c) === "boar")!)
        const i = calls.findIndex((c) => drawnName(c) === "tengu")
        if (i < 0) return undefined
        // The last move and turn before it was drawn.
        const before = calls.slice(0, i).reverse()
        const moved = before.find((c) => c.name === "translate")!
            .args as number[]
        const turned = before.find((c) => c.name === "rotate")
        return {
            x: (moved[0] - boar.x) / cell,
            spin: turned?.args[0] as number,
        }
    }

    it("draws the defeated enemy where it was rammed, then along its flight", () => {
        const start = tenguDrawn(0)!
        expect(start.x).toBeCloseTo(1, 1)
        expect(start.spin).toBe(0)
        const mid = tenguDrawn(5)!
        expect(mid.x).toBeGreaterThan(1.5)
        expect(mid.x).toBeLessThan(3)
        expect(mid.spin).toBeGreaterThan(0)
    })

    it("draws nothing once it has slammed", () => {
        expect(tenguDrawn(Math.ceil(FLIGHT_SECONDS * TICK_RATE))).toBe(
            undefined
        )
    })

    it("draws it gone, as before, without the Rush's effects", () => {
        const { calls, renderer } = setup()
        renderer.draw(rammed(0).state, 0)
        expect(calls.some((c) => drawnName(c) === "tengu")).toBe(false)
    })
})
