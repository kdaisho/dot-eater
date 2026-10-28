// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { addStatus, addTileEffect, defeatEnemy, type BreathDef } from "./breath"
import { BREATHS } from "./breaths"
import {
    AiType,
    Cell,
    CharacterId,
    PLAYER_RESPAWN_DELAY,
    RESPAWN_BLINK,
    RESPAWN_DELAY,
    SPRITE_SCALE,
} from "./constants"
import { createCharacter } from "./character"
import { createGameState, movePlayer, takeOut } from "./game"
import {
    BOSS_SCALE,
    BOSS_SPRITE,
    createRenderer,
    HALF_SCALE,
    outLabel,
    PLAYER_COLORS,
    IMMUNE_BADGE,
    STUN_BADGE,
    stunLabel,
} from "./render"
import type { Particle } from "./particles"
import { createSplitter } from "./splitter"
import {
    makeBoss,
    makeEnemy,
    makeState,
    OLD_LEVEL,
    textMap,
} from "./test/helpers"
import { vec2 } from "./vec2"
import { stun } from "./versus"

// canvas-confetti crashes under happy-dom; keep it out in case anything
// imported here pulls it in.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// happy-dom has no 2D canvas, so record the calls on a stub context: every
// method call is logged, with the fillStyle and font set at the time, and
// property writes are accepted.
function stubContext() {
    const calls: {
        name: string
        args: unknown[]
        fillStyle?: unknown
        font?: unknown
    }[] = []
    let fillStyle: unknown
    let font: unknown
    const ctx = new Proxy(
        {},
        {
            get(_target, name) {
                return (...args: unknown[]) => {
                    calls.push({ name: String(name), args, fillStyle, font })
                    if (name === "createRadialGradient") {
                        return { addColorStop() {} }
                    }
                }
            },
            set(_target, name, value) {
                if (name === "fillStyle") fillStyle = value
                if (name === "font") font = value
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
                    [1, 1, 1, 1, 1, 1, 1],
                    [1, 2, 2, 2, 2, 2, 1],
                    [1, 0, 1, 1, 1, 1, 1],
                ],
                { x: 1, y: 2 },
                enemies
            ),
            0
        )
        return texts()
    }

    it("draws each enemy by its AI type, not its slot", () => {
        const ids = [
            CharacterId.enemy1,
            CharacterId.enemy2,
            CharacterId.enemy3,
            CharacterId.enemy4,
        ]
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
        enemies.push(
            makeEnemy(5, 1, AiType.random, undefined, CharacterId.enemy1)
        )
        expect(drawEnemies(enemies).at(-1)).toBe("👺")
    })

    it("draws a Splitter's halves smaller than the whole one", () => {
        const [whole] = createSplitter(
            [CharacterId.enemy1, CharacterId.enemy2],
            vec2(1, 1)
        )
        const [main, spare] = createSplitter(
            [CharacterId.enemy3, CharacterId.enemy4],
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

    it("draws enemies of one AI type with the same sprite", () => {
        const enemies = [
            makeEnemy(1, 1, AiType.chase, undefined, CharacterId.enemy1),
            makeEnemy(2, 1, AiType.chase, undefined, CharacterId.enemy3),
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
        full.renderer.draw(state, 0, { score: 120, lives: 2 })
        expect(full.texts()).toEqual(["Score 120", "🐉🐉", "🐉"])
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
            makeEnemy(4, 1, AiType.random, undefined, CharacterId.enemy1),
            makeEnemy(9, 1, AiType.chase, undefined, CharacterId.enemy2),
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

        // Regression: only things whose centre was inside the radius were
        // drawn, so walls and enemies popped in at the soft edge.
        it("draws what reaches into the light, so it fades in", () => {
            const { calls, canvas, renderer, texts } = setup()
            const state = makeState(corridor(), { x: 2, y: 1 }, [
                makeEnemy(5, 1, AiType.random, undefined, CharacterId.enemy1),
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
                makeEnemy(11, 1, AiType.random, undefined, CharacterId.enemy1),
                makeEnemy(8, 1, AiType.chase, undefined, CharacterId.enemy2),
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
            renderer.draw(
                state,
                0,
                { score: 10, lives: 1 },
                { fog: { radius: 1 } }
            )
            expect(texts()).toEqual(["Score 10", "🐉", "🐉"])
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

        it("draws the player and its lives as the playing character", () => {
            const { renderer, texts } = setup()
            const state = createGameState(OLD_LEVEL, "penguin")
            state.enemies = []
            renderer.draw(state, 0, { lives: 2 })
            expect(texts()).toEqual(["🐧🐧", "🐧"])
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

    it("draws each player's score and meter, and the shared lives", () => {
        const { calls, renderer, texts } = setup()
        const meter = { energy: 50, max: 100, cost: 50, ready: true }
        renderer.draw(pair(), 0, {
            lives: 2,
            players: [
                { score: 30, energy: meter },
                { score: 10, energy: { ...meter, ready: false } },
            ],
        })
        expect(texts().slice(0, 3)).toEqual(["1P 30", "2P 10", "❤️❤️"])
        expect(calls.filter((c) => c.name === "strokeRect")).toHaveLength(2)
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
                    makeEnemy(
                        3,
                        1,
                        AiType.random,
                        undefined,
                        CharacterId.enemy1
                    ),
                    makeEnemy(
                        6,
                        1,
                        AiType.chase,
                        undefined,
                        CharacterId.enemy2
                    ),
                    makeEnemy(
                        10,
                        1,
                        AiType.ambusher,
                        undefined,
                        CharacterId.enemy3
                    ),
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
        renderer.draw(pair(), 0, {
            lives: 1,
            players: [
                { score: 30, energy: meter, out: { respawnIn: 2.5 } },
                { score: 10, energy: meter, out: { respawnIn: null } },
            ],
        })
        expect(texts().slice(0, 5)).toEqual([
            "1P 30",
            "back in 3",
            "2P 10",
            "OUT",
            "❤️",
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
        // No hearts: versus has no lives.
        expect(texts()).not.toContain("❤️")
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
})

describe("createRenderer with the facing guide", () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    // The aim preview while playing.
    const AIM = { guide: "aim", aim: true } as const

    // A dotted corridor 9 cells long: player 1 at (1, 1) and, with two
    // players, player 2 at (7, 1) facing it. Both breathe the Dragon's
    // line, 5 cells.
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
        expect(tinted(calls, canvas)).toEqual([2, 3, 4, 5, 6])
        // An edge round the line: its top and bottom along each cell, and
        // its two ends.
        expect(edges(calls)).toBe(5 * 2 + 2)
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
        expect(tinted(calls, canvas, 0)).toEqual([2, 3, 4, 5, 6])
        expect(tinted(calls, canvas, 1)).toEqual([2, 3, 4, 5, 6])
    })

    it("draws no aim for a player out of play", () => {
        const { calls, canvas, renderer } = setup()
        const state = game(2)
        charge(state)
        takeOut(state.players[0], 3)
        renderer.draw(state, 0, {}, {}, AIM)
        expect(tinted(calls, canvas, 0)).toEqual([])
        expect(tinted(calls, canvas, 1)).toEqual([2, 3, 4, 5, 6])
    })

    it("draws no aim for a stunned player", () => {
        const { calls, canvas, renderer } = setup()
        const state = game(2)
        charge(state)
        stun(state.players[1])
        renderer.draw(state, 0, {}, {}, AIM)
        expect(tinted(calls, canvas, 0)).toEqual([2, 3, 4, 5, 6])
        expect(tinted(calls, canvas, 1)).toEqual([])
    })

    it("hides the aim outside the fog's light", () => {
        const { calls, canvas, renderer } = setup()
        const state = game()
        charge(state)
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

        it("points right before the first move, charged or not", () => {
            const { calls, canvas, renderer } = setup()
            renderer.draw(game(), 0, {}, {}, ARROW)
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
            const state = game()
            state.players[0].breather.facing = facing
            renderer.draw(state, 0, {}, {}, ARROW)
            expect(arrows(calls, canvas)).toEqual([{ color: 0, tip }])
        })

        it("gives each player its own, in its colour", () => {
            const { calls, canvas, renderer } = setup()
            renderer.draw(game(2), 0, {}, {}, ARROW)
            expect(arrows(calls, canvas)).toEqual([
                { color: 0, tip: [2.2, 1.5] },
                { color: 1, tip: [6.8, 1.5] },
            ])
        })

        it("draws none for a player out of play", () => {
            const { calls, canvas, renderer } = setup()
            const state = game(2)
            takeOut(state.players[1], 3)
            renderer.draw(state, 0, {}, {}, ARROW)
            expect(arrows(calls, canvas).map((a) => a.color)).toEqual([0])
        })

        it("still draws one for a stunned player (dimmed)", () => {
            const { calls, canvas, renderer } = setup()
            const state = game(2)
            stun(state.players[1])
            renderer.draw(state, 0, {}, {}, ARROW)
            expect(arrows(calls, canvas).map((a) => a.color)).toEqual([0, 1])
        })

        it("travels with the gliding sprite", () => {
            const { calls, canvas, renderer } = setup()
            const state = game()
            const player = state.players[0].character
            player.lastPos = vec2(1, 1)
            player.pos = vec2(2, 1)
            player.moveProgress = 0.5
            renderer.draw(state, 0, {}, {}, ARROW)
            expect(arrows(calls, canvas)).toEqual([
                { color: 0, tip: [2.7, 1.5] },
            ])
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
