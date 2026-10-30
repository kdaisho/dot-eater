import { describe, expect, it } from "vite-plus/test"
import { AiType, ENEMY_IDS, MAX_ENEMIES, TICK_RATE } from "./constants"
import { step, type MoveInput } from "./game"
import { hasIce } from "./ice"
import { fixedRandom, makeEnemy, makeState, textMap } from "./test/helpers"
import { vec2 } from "./vec2"

// How long a tick of game logic takes in the biggest game a level allows:
// MAX_ENEMIES chasers and ambushers on a large (29x21) map with ice, so
// every chase is slide-aware (slideDistances), two players and no boss. At
// TICK_RATE a frame has about 16 ms; the logic should take well under 2
// ms of it.

const WIDTH = 29
const HEIGHT = 21

// Walls round the edge and on every even (x, y) inside, so there are many
// ways round; two rows and two columns of ice cross it.
function bigMap() {
    const rows = Array.from({ length: HEIGHT }, (_, y) =>
        Array.from({ length: WIDTH }, (_, x) => {
            const edge =
                x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1
            if (edge || (x % 2 === 0 && y % 2 === 0)) return "#"
            return y === 5 || y === 15 || x === 9 || x === 19 ? ":" : "."
        }).join("")
    )
    return textMap(rows)
}

// The players' held directions over time: each turns every so often, in a
// fixed pattern, so the enemies keep re-aiming.
const WAYS = [vec2(1, 0), vec2(0, 1), vec2(-1, 0), vec2(0, -1)]
function moves(tick: number): MoveInput[] {
    return [0, 1].map((p) => ({
        held: [WAYS[(Math.floor(tick / (40 + 13 * p)) + p) % WAYS.length]],
        pressed: vec2(0, 0),
    }))
}

describe("step performance", () => {
    it("takes well under 2 ms a tick with MAX_ENEMIES chasers on a big icy map", () => {
        const { map, ice } = bigMap()
        expect(hasIce(ice)).toBe(true)
        const spawns = [
            [27, 19],
            [1, 19],
            [27, 1],
            [13, 19],
            [27, 11],
            [15, 1],
            [1, 11],
            [21, 15],
        ] as const
        const enemies = spawns.map(([x, y], i) =>
            makeEnemy(
                x,
                y,
                i % 2 === 0 ? AiType.chase : AiType.ambusher,
                undefined,
                ENEMY_IDS[i]
            )
        )
        expect(enemies).toHaveLength(MAX_ENEMIES)
        const state = makeState(
            map,
            [
                { x: 1, y: 1 },
                { x: 3, y: 1 },
            ],
            enemies,
            { health: 1_000_000, ice }
        )
        const ticks = TICK_RATE * 10
        const start = performance.now()
        for (let t = 0; t < ticks; t++) {
            step(state, 1 / TICK_RATE, moves(t), fixedRandom(0))
        }
        const average = (performance.now() - start) / ticks
        // The enemies did chase the players down.
        expect(state.players.some((p) => p.health < 1_000_000)).toBe(true)
        // Measured on a laptop (KDA-263): about 0.07 ms a tick on average,
        // and about 1 ms on a tick where all eight choose a way (1.9 ms
        // before chasers shared their distances). Generous, for slow CI.
        expect(average).toBeLessThan(2)
    })
})
