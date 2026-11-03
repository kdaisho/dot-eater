import { describe, expect, it } from "vite-plus/test"
import { bossDamage } from "../boss"
import { addStatus, breathe, inPlay, type EnemyStatus } from "../breath"
import {
    AiType,
    BOSS_HEALTH,
    Cell,
    ENEMY_DAMAGE,
    MAX_HEALTH,
    TICK_RATE,
} from "../constants"
import {
    createGameState,
    DASH_SECONDS,
    IDLE,
    step,
    type GameState,
    type MoveInput,
} from "../game"
import { glidePos } from "../glide"
import { parseFlat } from "../test/helpers"
import type { Character } from "../character"
import {
    cellsFrom,
    fixedRandom,
    makeBoss,
    makeEnemy,
    makeState,
    textMap,
    withoutBreath,
    type MapLiteral,
} from "../test/helpers"
import { vec2, type Vec2 } from "../vec2"
import {
    boar,
    BROKEN_WALL,
    CHAIN_BOSS_SHARE,
    knockDistance,
    RAM_BOSS_SCALE,
    RAM_STAGGER,
    rushRange,
    tunnel,
} from "./boar"

// The Boar's Rush (KDA-304) end to end through step(): the dash, the wall
// break it took over from the wall-break breath (KDA-220, KDA-289), the
// knock flight and its chain.

const TICK = 1 / TICK_RATE
const none = vec2(0, 0)
const east = vec2(1, 0)
const north = vec2(0, -1)
const south = vec2(0, 1)
// Ticks a broken wall stays open.
const OPEN_TICKS = TICK_RATE * 10

type Press = { held?: Vec2; pressed?: Vec2; breath?: boolean }

function tick(state: GameState, { held, pressed, breath }: Press = {}) {
    const move: MoveInput = {
        held: held ? [held] : [],
        pressed: pressed ?? none,
        breath: breath ?? false,
    }
    return step(state, TICK, move, fixedRandom(0))
}

function run(state: GameState, n: number, press: Press = {}) {
    for (let i = 0; i < n; i++) tick(state, press)
}

// Two rooms split by an inner wall at (3, 1). The dot in the wall pocket
// (bottom row) keeps the game from being won.
const rooms = textMap(["#######", "#  #  #", "#######", "#.#####"]).map

// A boar at `player` (facing right, ready to move) with a full meter.
function boarState(
    map: MapLiteral,
    player: { x: number; y: number },
    enemies: Character[] = [],
    health = 1
): GameState {
    const state = makeState(map, player, enemies, { breath: boar, health })
    state.players[0].breather.energy = boar.maxEnergy
    state.players[0].character.moveProgress = 1
    return state
}

const hold: EnemyStatus = { name: "test.hold", holds: true }

describe("the Boar's Rush at a wall", () => {
    it("breaks the inner wall in front, for 20 energy and a 1 s cooldown", () => {
        const state = boarState(rooms, { x: 2, y: 1 })
        tick(state, { breath: true })
        expect(state.cells[1][3]).toBe(Cell.none)
        expect(state.players[0].breather.energy).toBe(80)
        expect(state.players[0].breather.cooldown).toBeCloseTo(1)
        expect(state.tiles).toEqual([
            { pos: vec2(3, 1), effect: BROKEN_WALL, left: 10 },
        ])
    })

    it("carries the Boar into the opening, and lets it walk on through", () => {
        const state = boarState(rooms, { x: 2, y: 1 })
        tick(state, { breath: true })
        expect(state.players[0].character.pos).toEqual(vec2(3, 1))
        tick(state, { held: east })
        run(state, TICK_RATE, { held: east })
        expect(state.players[0].character.pos).toEqual(vec2(5, 1))
    })

    it("lets enemies through the opening", () => {
        const enemy = makeEnemy(5, 1, AiType.chase)
        const state = boarState(rooms, { x: 2, y: 1 }, [enemy], MAX_HEALTH)
        tick(state, { breath: true })
        let through = false
        for (let i = 0; i < TICK_RATE * 2 && !through; i++) {
            tick(state)
            through = enemy.pos.x === 3
        }
        expect(through).toBe(true)
    })

    it("grows the wall back after 10 s", () => {
        const state = boarState(rooms, { x: 2, y: 1 })
        tick(state, { breath: true })
        run(state, OPEN_TICKS - 1)
        expect(state.cells[1][3]).toBe(Cell.none)
        tick(state)
        expect(state.cells[1][3]).toBe(Cell.wall)
        expect(state.tiles).toEqual([])
    })

    it("pushes a player standing in it out when it grows back", () => {
        const state = boarState(rooms, { x: 2, y: 1 })
        tick(state, { breath: true })
        tick(state, { held: east })
        expect(state.players[0].character.pos).toEqual(vec2(3, 1))
        run(state, OPEN_TICKS)
        expect(state.cells[1][3]).toBe(Cell.wall)
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
    })

    it("pushes an enemy standing in it out when it grows back", () => {
        const enemy = makeEnemy(5, 1, AiType.random)
        const state = boarState(rooms, { x: 2, y: 1 }, [enemy])
        tick(state, { breath: true })
        // An enemy held in the opening, having come in from the east.
        enemy.pos = vec2(3, 1)
        enemy.lastPos = vec2(4, 1)
        addStatus(enemy, hold, 20)
        run(state, OPEN_TICKS)
        expect(state.cells[1][3]).toBe(Cell.wall)
        expect(enemy.pos).toEqual(vec2(4, 1))
    })

    it("breaks a wall the player faces after pushing against it", () => {
        const { map } = textMap([
            "#######",
            "#     #",
            "#  #  #",
            "#     #",
            "#######",
            "#.#####",
        ])
        const state = boarState(map, { x: 3, y: 1 })
        // South of the player is a wall: it doesn't move but turns to it.
        tick(state, { pressed: south, held: south })
        expect(state.players[0].character.pos).toEqual(vec2(3, 1))
        expect(state.players[0].breather.facing).toEqual(south)
        tick(state, { held: south, breath: true })
        expect(state.cells[2][3]).toBe(Cell.none)
        expect(state.players[0].breather.energy).toBe(80)
    })

    it("refuses an outer wall, spending nothing", () => {
        const state = boarState(rooms, { x: 2, y: 1 })
        tick(state, { pressed: north })
        expect(state.players[0].breather.facing).toEqual(north)
        tick(state, { breath: true })
        expect(state.cells[0][2]).toBe(Cell.wall)
        expect(state.tiles).toEqual([])
        expect(state.players[0].breather.energy).toBe(100)
        expect(state.players[0].breather.cooldown).toBe(0)
    })

    it("refuses an outer wall beside a wrap tunnel", () => {
        // Row 1 is a tunnel; the player stands on its edge cell, facing the
        // border wall above it.
        const { map } = textMap(["#######", "       ", "#######", "#.#####"])
        const state = boarState(map, { x: 0, y: 1 })
        tick(state, { pressed: north })
        expect(state.players[0].breather.facing).toEqual(north)
        tick(state, { breath: true })
        expect(state.cells[0][0]).toBe(Cell.wall)
        expect(state.players[0].breather.energy).toBe(100)
        // The far edge's border wall holds too.
        tick(state, { pressed: south })
        tick(state, { breath: true })
        expect(state.cells[2][0]).toBe(Cell.wall)
        expect(state.players[0].breather.energy).toBe(100)
    })

    it("only dashes at empty floor in front, breaking nothing", () => {
        const state = boarState(rooms, { x: 1, y: 1 })
        tick(state, { breath: true })
        expect(state.tiles).toEqual([])
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        expect(state.players[0].breather.energy).toBe(80)
    })

    it("needs 20 energy", () => {
        const state = boarState(rooms, { x: 2, y: 1 })
        state.players[0].breather.energy = 19
        tick(state, { breath: true })
        expect(state.cells[1][3]).toBe(Cell.wall)
        expect(state.players[0].breather.energy).toBe(19)
        state.players[0].breather.energy = 20
        tick(state, { breath: true })
        expect(state.cells[1][3]).toBe(Cell.none)
        expect(state.players[0].breather.energy).toBe(0)
    })

    it("leaves the opened cell without a dot", () => {
        const state = boarState(rooms, { x: 2, y: 1 })
        tick(state, { breath: true })
        expect(state.cells[1][3]).not.toBe(Cell.dot)
    })

    it("moves at 3.5 cells/s", () => {
        const level = parseFlat({
            name: "Track",
            parTime: 60,
            map: [
                "####################",
                "#P                .#",
                "####################",
            ],
            enemies: [],
        })
        const game = createGameState(level, "boar")
        expect(game.players[0].character.speed).toBe(3.5)
        run(game, TICK_RATE * 3, { held: east })
        expect(game.players[0].character.pos).toEqual(vec2(1 + 11, 1))
    })
})

// KDA-289, with the user: a charged Boar bores a tunnel, a wall a level.
describe("the Boar's tunnel", () => {
    // Row 1: floor at x 1 and 2, inner walls at x 3 to 5, floor at x 6, an
    // inner wall at x 7, floor at x 8, then the outer wall.
    const gaps = textMap([
        "##########",
        "#  ### # #",
        "##########",
        "#.########",
    ]).map
    // Row 1: floor at x 1 and 2, then inner walls at x 3 to 5 right up to
    // the outer wall at x 6.
    const solid = textMap(["#######", "#  ####", "#######", "#.#####"]).map

    const opened = (state: GameState) =>
        state.tiles.filter((t) => t.effect === BROKEN_WALL).map((t) => t.pos.x)

    it("bores up to a wall a level, stopping at open floor", () => {
        const cells = cellsFrom(gaps)
        const lengths = [1, 2, 3, 4, 5].map(
            (level) => tunnel(cells, vec2(3, 1), east, level).length
        )
        // Floor at x 6 ends it, though x 7 is a wall again.
        expect(lengths).toEqual([1, 2, 3, 3, 3])
    })

    it("stops at the outer wall, which never breaks", () => {
        const cells = cellsFrom(solid)
        expect(tunnel(cells, vec2(3, 1), east, 5)).toEqual([
            vec2(3, 1),
            vec2(4, 1),
            vec2(5, 1),
        ])
        expect(tunnel(cells, vec2(6, 1), east, 5)).toEqual([])
        expect(tunnel(cells, vec2(2, 0), north, 5)).toEqual([])
    })

    it.each([1, 2, 3, 4, 5])(
        "opens the tunnel at level %i, for 20 a level, each wall for 10 s",
        (level) => {
            const state = boarState(gaps, { x: 2, y: 1 })
            expect(breathe(state, state.players[0], level)).toBe(true)
            const xs = [3, 4, 5].slice(0, level)
            expect(opened(state)).toEqual(xs)
            for (const x of xs) expect(state.cells[1][x]).toBe(Cell.none)
            expect(state.cells[1][7]).toBe(Cell.wall)
            expect(state.tiles.every((t) => t.left === 10)).toBe(true)
            // The charge's energy, even where the tunnel ran out of walls.
            expect(state.players[0].breather.energy).toBe(100 - 20 * level)
            // The event covers the opened walls.
            const event = state.events.find((e) => e.type === "breathed")
            expect(event?.type === "breathed" && event.cells).toEqual(
                xs.map((x) => vec2(x, 1))
            )
        }
    )

    it("lets the player walk through the whole tunnel", () => {
        const state = boarState(solid, { x: 2, y: 1 })
        breathe(state, state.players[0], 3)
        run(state, TICK_RATE, { held: east })
        expect(state.players[0].character.pos).toEqual(vec2(5, 1))
    })

    it("breaks the walls its dash reaches, and dashes into them as far as it goes", () => {
        // From x 1, level 4 reaches 3 cells: the floor at x 2, then the
        // tunnel (4 walls a level 4, but floor at x 6 ends it at x 5).
        const state = boarState(gaps, { x: 1, y: 1 })
        expect(breathe(state, state.players[0], 4)).toBe(true)
        expect(opened(state)).toEqual([3, 4, 5])
        expect(state.players[0].character.pos).toEqual(vec2(4, 1))
        // A tap reaches only the floor in front: no wall within reach.
        const tap = boarState(gaps, { x: 1, y: 1 })
        expect(breathe(tap, tap.players[0], 1)).toBe(true)
        expect(tap.tiles).toEqual([])
        expect(tap.players[0].character.pos).toEqual(vec2(2, 1))
    })

    it("is refused at an outer wall, spending nothing, however charged", () => {
        const state = boarState(solid, { x: 2, y: 1 })
        state.players[0].breather.facing = north
        expect(breathe(state, state.players[0], 5)).toBe(false)
        expect(state.cells[0][2]).toBe(Cell.wall)
        expect(state.players[0].breather.energy).toBe(100)
    })

    it("grows every wall back together after 10 s", () => {
        const state = boarState(solid, { x: 2, y: 1 })
        breathe(state, state.players[0], 3)
        run(state, OPEN_TICKS - 1)
        expect([3, 4, 5].map((x) => state.cells[1][x])).toEqual([
            Cell.none,
            Cell.none,
            Cell.none,
        ])
        tick(state)
        expect([3, 4, 5].map((x) => state.cells[1][x])).toEqual([
            Cell.wall,
            Cell.wall,
            Cell.wall,
        ])
        expect(state.tiles).toEqual([])
    })

    // Regression: walls grew back one at a time, each pushing whoever was
    // in it back where it came from, even into a wall still to grow back,
    // so a player near the tunnel's mouth was carried along it to the far
    // end.
    it("pushes a player inside out to the nearest open cell", () => {
        const state = boarState(gaps, { x: 2, y: 1 })
        breathe(state, state.players[0], 3)
        // In the tunnel's first cell, having come from the second.
        const { character } = state.players[0]
        character.pos = vec2(3, 1)
        character.lastPos = vec2(4, 1)
        run(state, OPEN_TICKS)
        expect(state.cells[1][3]).toBe(Cell.wall)
        expect(character.pos).toEqual(vec2(2, 1))
    })
})

// KDA-304, with the user: the Rush dashes, and what it rams flies.
describe("the Boar's Rush", () => {
    // A hall from x 1 to x 12 along row 1. The dot in the pocket keeps the
    // game from being won.
    const hall = textMap([
        "##############",
        "#            #",
        "##############",
        "#.############",
    ]).map
    // Two rows, for the 2x2 boss.
    const arena = textMap([
        "##############",
        "#            #",
        "#            #",
        "##############",
        "#.############",
    ]).map

    // An enemy on (x, y) that never moves by itself.
    const still = (x: number, y: number) => {
        const enemy = makeEnemy(x, y)
        enemy.speed = 0
        return enemy
    }

    const defeats = (state: GameState) =>
        state.events.flatMap((e) => (e.type === "enemyDefeated" ? [e.at] : []))

    it("reaches 1 cell for a tap, up to 3 at full charge", () => {
        expect([1, 2, 3, 4, 5].map(rushRange)).toEqual([1, 2, 2, 3, 3])
    })

    it.each([1, 2, 3, 4, 5])(
        "dashes rushRange cells at level %i, for 20 a level",
        (level) => {
            const state = boarState(hall, { x: 1, y: 1 })
            expect(breathe(state, state.players[0], level)).toBe(true)
            const { character, breather } = state.players[0]
            expect(character.pos).toEqual(vec2(1 + rushRange(level), 1))
            expect(breather.energy).toBe(100 - 20 * level)
            expect(breather.facing).toEqual(east)
        }
    )

    // KDA-307: a fixed, short glide, so the dash is a burst on release.
    it.each([1, 3, 5])(
        "glides the whole dash in DASH_SECONDS at level %i, then moves on",
        (level) => {
            const state = boarState(hall, { x: 1, y: 1 })
            breathe(state, state.players[0], level)
            const player = state.players[0]
            const { character } = player
            const end = 1 + rushRange(level)
            // Drawn where it set off, gliding the cells at once.
            expect(character.lastPos).toEqual(vec2(1, 1))
            expect(character.moveProgress).toBe(0)
            const ticks = Math.round(DASH_SECONDS * TICK_RATE)
            expect(ticks).toBeLessThan(TICK_RATE / character.speed)
            // Drawn arriving a tick before the end, not before.
            run(state, ticks - 1, { held: east })
            expect(glidePos(character, 0, 14, 4, player.rate).x).toBeLessThan(
                end
            )
            expect(character.pos).toEqual(vec2(end, 1))
            run(state, 1, { held: east })
            expect(glidePos(character, 0, 14, 4, player.rate).x).toBeCloseTo(
                end
            )
            // And moves on from there at its own pace.
            run(state, 1, { held: east })
            expect(character.pos).toEqual(vec2(end + 1, 1))
            expect(player.rate).toBe(1)
        }
    )

    // KDA-307: collisions follow the drawn glide, so they keep up with
    // the faster dash too.
    it("is caught only where its dash is drawn, not on cells it has rushed past", () => {
        const shaft = textMap([
            "##############",
            "#            #",
            "### ##########",
            "### ##########",
            "#.############",
        ]).map
        // A chaser coming up the shaft at x 3, about to step into the hall
        // the Boar dashes along, from x 1 to x 4.
        const chaser = makeEnemy(3, 2, AiType.chase, { x: 3, y: 3 })
        chaser.speed = 4
        chaser.moveProgress = 1
        const state = boarState(shaft, { x: 1, y: 1 }, [chaser])
        breathe(state, state.players[0], 4)
        expect(state.players[0].character.pos).toEqual(vec2(4, 1))
        const hits: string[] = []
        for (let k = 0; k < 14; k++) {
            tick(state)
            for (const e of state.events) hits.push(e.type)
        }
        // It came out at x 3 after the Boar had rushed by (it would have
        // caught a Boar gliding the dash in a move's time).
        expect(chaser.pos).toEqual(vec2(3, 1))
        expect(hits).not.toContain("playerCaught")
        expect(hits).not.toContain("hurt")
    })

    it("carries a dash on along its glide in DASH_SECONDS too", () => {
        const state = boarState(hall, { x: 1, y: 1 })
        const player = state.players[0]
        // Half a step east first.
        run(state, 1, { held: east })
        const half = Math.ceil(TICK_RATE / player.character.speed / 2)
        run(state, half - 1, { held: east })
        const before = glidePos(player.character, 0, 14, 4, player.rate)
        expect(before.x).toBeGreaterThan(1)
        expect(before.x).toBeLessThan(2)
        breathe(state, player, 3)
        // Drawn from the same spot, and there in DASH_SECONDS.
        const drawn = () => glidePos(player.character, 0, 14, 4, player.rate)
        expect(drawn().x).toBeCloseTo(before.x)
        expect(player.character.pos).toEqual(vec2(4, 1))
        run(state, Math.round(DASH_SECONDS * TICK_RATE) - 1)
        expect(drawn().x).toBeLessThan(4 - 1e-6)
        run(state, 1)
        expect(drawn().x).toBeCloseTo(4)
    })

    it("eats the dots it dashes over", () => {
        const dotted = textMap([
            "##########",
            "# ...    #",
            "##########",
            "#.########",
        ]).map
        const state = boarState(dotted, { x: 1, y: 1 })
        breathe(state, state.players[0], 5)
        const p = state.players[0]
        expect(p.character.pos).toEqual(vec2(4, 1))
        expect(p.dots).toBe(3)
        expect(p.score).toBe(30)
        // 15 back for the dots, after 100 spent.
        expect(p.breather.energy).toBe(15)
        expect([2, 3, 4].map((x) => state.cells[1][x])).toEqual([
            Cell.none,
            Cell.none,
            Cell.none,
        ])
    })

    it("stops against an outer wall, which holds, with a thud", () => {
        const state = boarState(hall, { x: 11, y: 1 })
        expect(breathe(state, state.players[0], 5)).toBe(true)
        expect(state.players[0].character.pos).toEqual(vec2(12, 1))
        expect(state.cells[1][13]).toBe(Cell.wall)
        expect(state.tiles).toEqual([])
        expect(state.events).toContainEqual({
            type: "rammed",
            player: 0,
            at: vec2(13, 1),
            facing: east,
        })
    })

    it("reports no ram for a dash that hits nothing", () => {
        const state = boarState(hall, { x: 1, y: 1 })
        breathe(state, state.players[0], 1)
        expect(state.events.map((e) => e.type)).toEqual(["breathed"])
    })

    it("stops at the first enemy and knocks it flying, defeated where it lands", () => {
        const enemy = still(3, 1)
        const state = boarState(hall, { x: 1, y: 1 }, [enemy])
        expect(breathe(state, state.players[0], 2)).toBe(true)
        // The Boar stops on the cell before it.
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        // Flown knockDistance(2) = 3 cells, to x 6, and defeated there.
        expect(knockDistance(2)).toBe(3)
        expect(defeats(state)).toEqual([vec2(6, 1)])
        expect(inPlay(enemy)).toBe(false)
        expect(enemy.pos).toEqual(vec2(3, 1))
        expect(state.players[0].score).toBe(50)
        expect(state.events.map((e) => e.type)).toEqual([
            "breathed",
            "rammed",
            "knockedFlying",
            "enemyDefeated",
        ])
        expect(state.events[2]).toEqual({
            type: "knockedFlying",
            player: 0,
            from: vec2(3, 1),
            to: vec2(6, 1),
            facing: east,
            distance: 3,
            shoved: [],
        })
    })

    it("flies further at higher levels", () => {
        expect([1, 2, 3, 4, 5].map(knockDistance)).toEqual([2, 3, 4, 5, 6])
        const enemy = still(2, 1)
        const state = boarState(hall, { x: 1, y: 1 }, [enemy])
        breathe(state, state.players[0], 5)
        expect(defeats(state)).toEqual([vec2(8, 1)])
    })

    it("slams an enemy into a wall, defeating it there", () => {
        const short = textMap([
            "##########",
            "#    #   #",
            "##########",
            "#.########",
        ]).map
        const enemy = still(3, 1)
        const state = boarState(short, { x: 1, y: 1 }, [enemy])
        breathe(state, state.players[0], 5)
        expect(defeats(state)).toEqual([vec2(4, 1)])
        // An enemy right against the wall slams at once.
        const flat = still(4, 1)
        const against = boarState(short, { x: 2, y: 1 }, [flat])
        breathe(against, against.players[0], 3)
        expect(defeats(against)).toEqual([vec2(4, 1)])
        expect(against.players[0].character.pos).toEqual(vec2(3, 1))
    })

    it("rams an enemy on its own cell where it stands", () => {
        const enemy = still(2, 1)
        const state = boarState(hall, { x: 2, y: 1 }, [enemy])
        expect(breathe(state, state.players[0], 1)).toBe(true)
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        expect(defeats(state)).toEqual([vec2(4, 1)])
    })

    it("knocks every enemy on the rammed cell flying together", () => {
        const a = still(3, 1)
        const b = still(3, 1)
        const state = boarState(hall, { x: 1, y: 1 }, [a, b])
        breathe(state, state.players[0], 2)
        expect(defeats(state)).toEqual([vec2(6, 1), vec2(6, 1)])
        expect(state.players[0].score).toBe(100)
    })

    it("needs 20 energy, and refuses facing an outer wall right in front", () => {
        const state = boarState(hall, { x: 1, y: 1 })
        state.players[0].breather.facing = vec2(-1, 0)
        expect(breathe(state, state.players[0], 5)).toBe(false)
        expect(state.players[0].breather.energy).toBe(100)
        expect(state.players[0].breather.cooldown).toBe(0)
        state.players[0].breather.facing = east
        state.players[0].breather.energy = 19
        expect(breathe(state, state.players[0])).toBe(false)
    })

    describe("the chain", () => {
        it("shoves an enemy in the way along, without defeating it", () => {
            const flier = still(3, 1)
            const shoved = still(5, 1)
            const state = boarState(hall, { x: 1, y: 1 }, [flier, shoved])
            breathe(state, state.players[0], 2)
            // The flier goes 3 cells, to x 6, carrying the other in front.
            expect(defeats(state)).toEqual([vec2(6, 1)])
            expect(inPlay(shoved)).toBe(true)
            expect(shoved.pos).toEqual(vec2(7, 1))
            // At rest there, dazed for a move.
            expect(shoved.lastPos).toEqual(vec2(7, 1))
            expect(shoved.moveProgress).toBe(0)
            expect(state.players[0].score).toBe(50)
        })

        it("passes the shove on down a row, each pushing the next", () => {
            const flier = still(2, 1)
            const a = still(3, 1)
            const b = still(5, 1)
            const state = boarState(hall, { x: 1, y: 1 }, [flier, a, b])
            breathe(state, state.players[0], 3)
            // 4 cells: the flier to x 6, a in front of it, b in front of a.
            expect(defeats(state)).toEqual([vec2(6, 1)])
            expect(a.pos).toEqual(vec2(7, 1))
            expect(b.pos).toEqual(vec2(8, 1))
        })

        it("reports the chain it shoved, car by car, for drawing it sliding", () => {
            const flier = still(2, 1)
            const a = still(3, 1)
            const b = still(5, 1)
            const state = boarState(hall, { x: 1, y: 1 }, [flier, a, b])
            breathe(state, state.players[0], 3)
            const flight = state.events.find((e) => e.type === "knockedFlying")
            // a is carried all 4 cells; b only from when a reached it.
            expect(flight).toMatchObject({
                from: vec2(2, 1),
                to: vec2(6, 1),
                distance: 4,
                shoved: [
                    {
                        from: vec2(3, 1),
                        to: vec2(7, 1),
                        distance: 4,
                        enemies: [1],
                        players: [],
                    },
                    {
                        from: vec2(5, 1),
                        to: vec2(8, 1),
                        distance: 3,
                        enemies: [2],
                        players: [],
                    },
                ],
            })
        })

        it("stops at a wall, the flier slamming behind what it pushed", () => {
            const short = textMap([
                "##########",
                "#      ###",
                "##########",
                "#.########",
            ]).map
            const flier = still(2, 1)
            const shoved = still(4, 1)
            const state = boarState(short, { x: 1, y: 1 }, [flier, shoved])
            breathe(state, state.players[0], 5)
            expect(shoved.pos).toEqual(vec2(6, 1))
            expect(defeats(state)).toEqual([vec2(5, 1)])
            expect(state.cells[1][7]).toBe(Cell.wall)
        })

        it("shoves a co-op partner along, without hurting it", () => {
            const flier = still(3, 1)
            const state = makeState(hall, [vec2(1, 1), vec2(5, 1)], [flier], {
                breath: boar,
                health: MAX_HEALTH,
                mode: "coop",
            })
            state.players[0].breather.energy = 100
            breathe(state, state.players[0], 2)
            const partner = state.players[1]
            expect(partner.character.pos).toEqual(vec2(7, 1))
            expect(partner.character.lastPos).toEqual(vec2(7, 1))
            expect(partner.health).toBe(MAX_HEALTH)
            expect(partner.out).toBe(false)
            expect(state.events.map((e) => e.type)).not.toContain("hurt")
        })

        it("hits a versus opponent it shoves for real", () => {
            const flier = still(3, 1)
            const state = makeState(hall, [vec2(1, 1), vec2(5, 1)], [flier], {
                breath: boar,
                health: MAX_HEALTH,
                mode: "versus",
            })
            state.players[0].breather.energy = 100
            breathe(state, state.players[0], 2)
            const opponent = state.players[1]
            expect(opponent.health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
            expect(state.events).toContainEqual({
                type: "hurt",
                player: 1,
                at: vec2(7, 1),
                damage: ENEMY_DAMAGE,
            })
            // The hit's knockback sends it on a cell, away from the flier.
            expect(opponent.character.pos).toEqual(vec2(8, 1))
        })

        it("leaves a shoved partner unhurt by the enemy shoved right behind it", () => {
            const flier = still(2, 1)
            const shoved = makeEnemy(3, 1, AiType.chase)
            const state = makeState(
                hall,
                [vec2(1, 1), vec2(4, 1)],
                [flier, shoved],
                { breath: boar, health: MAX_HEALTH, mode: "coop" }
            )
            state.players[0].breather.energy = 100
            state.players[0].character.moveProgress = 1
            state.players[1].character.moveProgress = 1
            step(
                state,
                TICK,
                [{ held: [], pressed: none, breath: true }, IDLE],
                fixedRandom(0)
            )
            // A tap: 2 cells, the flier to x 4, carrying both along.
            expect(shoved.pos).toEqual(vec2(5, 1))
            expect(state.players[1].character.pos).toEqual(vec2(6, 1))
            expect(state.players[1].health).toBe(MAX_HEALTH)
        })

        it("stops at the boss, which takes a quarter of a ram's damage", () => {
            const flier = still(3, 1)
            const boss = withoutBreath(makeBoss(6, 1, 0))
            const state = makeState(arena, { x: 1, y: 1 }, [flier], {
                breath: boar,
                boss,
            })
            state.players[0].breather.energy = 100
            breathe(state, state.players[0], 2)
            // The flier slams against its body, at x 5.
            expect(defeats(state)).toEqual([vec2(5, 1)])
            expect(CHAIN_BOSS_SHARE).toBe(0.25)
            expect(boss.health).toBeCloseTo(
                BOSS_HEALTH - bossDamage(40) * RAM_BOSS_SCALE * CHAIN_BOSS_SHARE
            )
            // Not staggered: only a ram does that.
            expect(boss.stagger).toBe(0)
        })
    })

    describe("against the boss", () => {
        it("rams it for the breath's damage and staggers it", () => {
            const boss = withoutBreath(makeBoss(4, 1))
            const state = makeState(arena, { x: 1, y: 1 }, [], {
                breath: boar,
                boss,
                health: MAX_HEALTH,
            })
            state.players[0].breather.energy = 100
            expect(breathe(state, state.players[0], 4)).toBe(true)
            // Range 3 from x 1 ends at its body (x 4): the Boar stops
            // against it, at x 3.
            expect(state.players[0].character.pos).toEqual(vec2(3, 1))
            expect(boss.health).toBeCloseTo(
                BOSS_HEALTH - bossDamage(80) * RAM_BOSS_SCALE
            )
            expect(boss.stagger).toBe(RAM_STAGGER)
            expect(state.events).toContainEqual({
                type: "rammed",
                player: 0,
                at: vec2(4, 1),
                facing: east,
            })
        })

        it("keeps a staggered boss from moving until the stagger is over", () => {
            const boss = withoutBreath(makeBoss(7, 1))
            const state = makeState(arena, { x: 6, y: 1 }, [], {
                breath: boar,
                boss,
                health: MAX_HEALTH,
            })
            state.players[0].breather.energy = 100
            state.players[0].character.moveProgress = 1
            breathe(state, state.players[0], 1)
            expect(boss.stagger).toBe(RAM_STAGGER)
            // The Boar backs off west; the boss stays put while staggered.
            const ticks = Math.round(RAM_STAGGER * TICK_RATE)
            for (let i = 0; i < ticks - 1; i++) {
                tick(state, { held: vec2(-1, 0) })
                expect(boss.pos).toEqual(vec2(7, 1))
            }
            run(state, TICK_RATE, { held: vec2(-1, 0) })
            expect(boss.pos).not.toEqual(vec2(7, 1))
        })
    })
})
