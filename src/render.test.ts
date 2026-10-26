// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { addStatus, addTileEffect } from "./breath"
import {
    AiType,
    Cell,
    CharacterId,
    RESPAWN_BLINK,
    RESPAWN_DELAY,
} from "./constants"
import { createCharacter } from "./character"
import { createGameState, movePlayer } from "./game"
import { createRenderer } from "./render"
import { makeEnemy, makeState, OLD_LEVEL, textMap } from "./test/helpers"
import { vec2 } from "./vec2"

// canvas-confetti crashes under happy-dom; keep it out in case anything
// imported here pulls it in.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// happy-dom has no 2D canvas, so record the calls on a stub context: every
// method call is logged, with the fillStyle set at the time, and property
// writes are accepted.
function stubContext() {
    const calls: { name: string; args: unknown[]; fillStyle?: unknown }[] = []
    let fillStyle: unknown
    const ctx = new Proxy(
        {},
        {
            get(_target, name) {
                return (...args: unknown[]) => {
                    calls.push({ name: String(name), args, fillStyle })
                    if (name === "createRadialGradient") {
                        return { addColorStop() {} }
                    }
                }
            },
            set(_target, name, value) {
                if (name === "fillStyle") fillStyle = value
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
            state.player.ai = ai
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
        state.player = player
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
            state.player.moveProgress = progress
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
            state.player.lastPos = vec2(4, 1)
            state.player.moveProgress = 0
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
})
