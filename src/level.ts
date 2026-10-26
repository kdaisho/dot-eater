import { AiType, Cell, ENEMY_IDS, TICK_RATE } from "./constants"
import { distanceMap } from "./path"
import { vec2, type Vec2 } from "./vec2"

export type Cells = Cell[][]

// ---- Level data: the authored, JSON-serializable form ----

// AI names as written in level data. Strings, not AiType numbers, so level
// files (and, later, shared level URLs) stay readable.
export type AiName = "random" | "chase" | "ambusher" | "patroller" | "phantom"

// A cell as written in level data: [x, y], counted from the top-left corner
// of the map (0, 0).
export type CellRef = readonly [x: number, y: number]

export type EnemyData = {
    ai: AiName
    // Cells per second. Omitted means the game's default speed.
    speed?: number
    // Patrollers only, and required for them: the waypoints walked in order,
    // looping back to the first after the last. At least two, each an open
    // cell the enemy can reach, and none the same as the one before it
    // (including the last and the first). The patroller walks from its spawn
    // to the first waypoint, and starts again from the first one after a
    // respawn. Between waypoints it takes the shortest path.
    route?: readonly CellRef[]
}

// Placeholder for per-level special rules; none exist yet.
export type LevelRules = Record<string, never>

export type LevelData = {
    name: string
    // One string per row, all the same length. See the map characters below.
    map: readonly string[]
    // Seconds. Clearing the stage in at most this long earns the "under par"
    // star (see stars.ts). Required, and must be positive.
    parTime: number
    // Cells per second. Omitted means the game's default speed.
    playerSpeed?: number
    // One entry per `E` in the map, matched in reading order (left to right,
    // then top to bottom).
    enemies: readonly EnemyData[]
    rules?: LevelRules
}

// Map characters:
//   #        wall
//   .        dot
//   (space)  empty
//   P        player 1 spawn (an empty cell)
//   E        enemy spawn (the enemy starts on a dot)
// An open cell on the edge of the map is a wrap-around tunnel to the cell on
// the opposite edge, which must also be open.
const WALL = "#"
const DOT = "."
const EMPTY = " "
const ENEMY = "E"
// One spawn character per player, in player order. A second player would add
// its own character (e.g. "Q") here.
export const PLAYER_CHARS: readonly string[] = ["P"]
const MAP_CHARS: ReadonlySet<string> = new Set([
    WALL,
    DOT,
    EMPTY,
    ENEMY,
    ...PLAYER_CHARS,
])

const AI_TYPES: Record<AiName, AiType> = {
    random: AiType.random,
    chase: AiType.chase,
    ambusher: AiType.ambusher,
    patroller: AiType.patroller,
    phantom: AiType.phantom,
}

// ---- Parsed level: what the game builds its state from ----

export type EnemySpawn = {
    pos: Readonly<Vec2>
    ai: AiType
    speed?: number
    // Patrollers only; see EnemyData.route.
    route?: readonly Readonly<Vec2>[]
}

export type Level = {
    name: string
    // Seconds; see LevelData.parTime.
    parTime: number
    width: number
    height: number
    // Shared by every game started from this level; copy before mutating.
    cells: readonly (readonly Cell[])[]
    // Indexed by player, in PLAYER_CHARS order.
    playerSpawns: readonly Readonly<Vec2>[]
    playerSpeed?: number
    enemies: readonly EnemySpawn[]
    rules: LevelRules
}

export class LevelError extends Error {
    readonly problems: readonly string[]

    constructor(levelName: string, problems: readonly string[]) {
        super(`Invalid level "${levelName}":\n- ${problems.join("\n- ")}`)
        this.name = "LevelError"
        this.problems = problems
    }
}

// Parse and validate level data. Throws a LevelError listing the problems
// found. Checks run in stages (metadata and map shape, then spawns and
// tunnels, then reachability); a stage only runs if the earlier ones passed.
export function parseLevel(data: LevelData): Level {
    const { name, map } = data
    const problems: string[] = []
    const fail = () => new LevelError(name, problems)

    // Stage 1: metadata and map shape.
    if (name.trim() === "") {
        problems.push("name must not be empty")
    }
    if (!(Number.isFinite(data.parTime) && data.parTime > 0)) {
        problems.push(
            `parTime must be a positive number of seconds, got ${data.parTime}`
        )
    }
    checkSpeed(problems, "playerSpeed", data.playerSpeed)
    data.enemies.forEach((enemy, i) => {
        if (!Object.hasOwn(AI_TYPES, enemy.ai)) {
            problems.push(
                `enemies[${i}].ai must be one of ${Object.keys(AI_TYPES).join(", ")}, got ${JSON.stringify(enemy.ai)}`
            )
        }
        checkSpeed(problems, `enemies[${i}].speed`, enemy.speed)
        problems.push(...routeShapeProblems(enemy, i))
    })
    // Split rows by code point, not UTF-16 unit, so a character outside the
    // BMP (e.g. an emoji) counts as one cell.
    const rows = map.map((row) => Array.from(row))
    const width = rows[0]?.length ?? 0
    if (rows.every((row) => row.length === 0)) {
        problems.push("map must have at least one non-empty row")
    } else if (width === 0) {
        // Row widths are checked against row 0, which is meaningless here.
        problems.push("map row 0 is empty")
    }
    rows.forEach((row, y) => {
        if (width > 0 && row.length !== width) {
            problems.push(
                `map row ${y} is ${row.length} wide, expected ${width} (the width of row 0)`
            )
        }
        row.forEach((ch, x) => {
            if (!MAP_CHARS.has(ch)) {
                problems.push(
                    `unknown map character ${JSON.stringify(ch)} at (${x}, ${y})`
                )
            }
        })
    })
    if (problems.length > 0) throw fail()

    // Stage 2: build cells and collect spawns.
    const cells: Cells = []
    const enemyPositions: Vec2[] = []
    const playerPositions: Vec2[][] = PLAYER_CHARS.map(() => [])
    rows.forEach((row, y) => {
        cells.push(
            row.map((ch, x) => {
                const player = PLAYER_CHARS.indexOf(ch)
                if (player !== -1) {
                    playerPositions[player].push(vec2(x, y))
                    return Cell.none
                }
                switch (ch) {
                    case WALL:
                        return Cell.wall
                    case DOT:
                        return Cell.dot
                    case ENEMY:
                        enemyPositions.push(vec2(x, y))
                        return Cell.dot
                    default:
                        return Cell.none
                }
            })
        )
    })
    PLAYER_CHARS.forEach((ch, i) => {
        const count = playerPositions[i].length
        if (count !== 1) {
            problems.push(
                `map must have exactly one "${ch}" (player ${i + 1} spawn), found ${count}`
            )
        }
    })
    if (enemyPositions.length !== data.enemies.length) {
        problems.push(
            `map has ${enemyPositions.length} "${ENEMY}" spawns but enemies lists ${data.enemies.length}`
        )
    }
    if (data.enemies.length > ENEMY_IDS.length) {
        problems.push(
            `at most ${ENEMY_IDS.length} enemies are supported, got ${data.enemies.length}`
        )
    }
    // A level without dots would be won on the first tick.
    if (!hasDots(cells)) {
        problems.push(
            `map must have at least one dot ("${DOT}" or an "${ENEMY}" spawn)`
        )
    }
    problems.push(...tunnelProblems(cells))
    data.enemies.forEach((enemy, i) => {
        enemy.route?.forEach(([x, y], j) => {
            const field = `enemies[${i}].route[${j}]`
            if (x >= width || y >= rows.length) {
                problems.push(`${field} (${x}, ${y}) is off the map`)
            } else if (cells[y][x] === Cell.wall) {
                problems.push(`${field} (${x}, ${y}) is a wall`)
            }
        })
    })
    if (problems.length > 0) throw fail()

    // Stage 3: every dot must be reachable from player 1's spawn.
    const playerSpawns = playerPositions.map(([pos]) => pos)
    const dist = distanceMap(cells, playerSpawns[0])
    cells.forEach((row, y) =>
        row.forEach((cell, x) => {
            if (cell === Cell.dot && dist[y][x] === Infinity) {
                problems.push(
                    `dot at (${x}, ${y}) can't be reached from the player spawn`
                )
            }
        })
    )
    // Each patroller must be able to walk its whole route from its spawn.
    // Moves are symmetric, so that also connects the waypoints to each other.
    data.enemies.forEach((enemy, i) => {
        if (!enemy.route) return
        const fromSpawn = distanceMap(cells, enemyPositions[i])
        enemy.route.forEach(([x, y], j) => {
            if (fromSpawn[y][x] === Infinity) {
                problems.push(
                    `enemies[${i}].route[${j}] (${x}, ${y}) can't be reached from the enemy's spawn`
                )
            }
        })
    })
    if (problems.length > 0) throw fail()

    return {
        name,
        parTime: data.parTime,
        width,
        height: map.length,
        cells,
        playerSpawns,
        ...(data.playerSpeed === undefined
            ? {}
            : { playerSpeed: data.playerSpeed }),
        enemies: enemyPositions.map((pos, i) => {
            const { ai, speed, route } = data.enemies[i]
            return {
                pos,
                ai: AI_TYPES[ai],
                ...(speed === undefined ? {} : { speed }),
                ...(route === undefined
                    ? {}
                    : { route: route.map(([x, y]) => vec2(x, y)) }),
            }
        }),
        rules: data.rules ?? {},
    }
}

function checkSpeed(
    problems: string[],
    field: string,
    speed: number | undefined
) {
    if (speed === undefined) return
    if (!(Number.isFinite(speed) && speed > 0)) {
        problems.push(`${field} must be a positive number, got ${speed}`)
    } else if (speed > TICK_RATE) {
        // A character moves at most one cell per tick.
        problems.push(
            `${field} must be at most ${TICK_RATE} (one cell per tick), got ${speed}`
        )
    }
}

// Route checks that need no map: patrollers have a route and nobody else
// does, with at least two whole-number [x, y] waypoints, none the same as the
// one before it. Whether the waypoints are on the map, open and reachable is
// checked once the map is known.
function routeShapeProblems(enemy: EnemyData, i: number): string[] {
    const field = `enemies[${i}].route`
    const { route } = enemy
    if (enemy.ai !== "patroller") {
        return route === undefined
            ? []
            : [`${field} is only allowed for patrollers, got ai "${enemy.ai}"`]
    }
    if (route === undefined) return [`${field} is required for patrollers`]
    if (!Array.isArray(route) || route.length < 2) {
        return [`${field} must list at least 2 waypoints`]
    }
    const problems: string[] = []
    route.forEach((p, j) => {
        const ok =
            Array.isArray(p) &&
            p.length === 2 &&
            p.every((n) => Number.isInteger(n) && n >= 0)
        if (!ok) {
            problems.push(
                `${field}[${j}] must be [x, y] with whole numbers from 0, got ${JSON.stringify(p)}`
            )
        }
    })
    if (problems.length > 0) return problems
    route.forEach(([x, y], j) => {
        const [px, py] = route[(j + route.length - 1) % route.length]
        if (x === px && y === py) {
            problems.push(
                `${field}[${j}] (${x}, ${y}) is the same as the waypoint before it`
            )
        }
    })
    return problems
}

// An open edge cell is a tunnel to the opposite edge (see loopPos). A tunnel
// into a wall would be a dead end that looks like an exit, so reject it.
function tunnelProblems(cells: Cells): string[] {
    const problems: string[] = []
    const height = cells.length
    const width = cells[0].length
    const check = (from: Vec2, to: Vec2) => {
        if (
            cells[from.y][from.x] !== Cell.wall &&
            cells[to.y][to.x] === Cell.wall
        ) {
            problems.push(
                `open edge cell (${from.x}, ${from.y}) wraps around into a wall at (${to.x}, ${to.y})`
            )
        }
    }
    for (let y = 0; y < height; y++) {
        check(vec2(0, y), vec2(width - 1, y))
        check(vec2(width - 1, y), vec2(0, y))
    }
    for (let x = 0; x < width; x++) {
        check(vec2(x, 0), vec2(x, height - 1))
        check(vec2(x, height - 1), vec2(x, 0))
    }
    return problems
}

// ---- Runtime helpers ----

// Wrap a position that stepped off one edge of the map onto the opposite edge.
export function loopPos(cells: readonly (readonly Cell[])[], v: Vec2): Vec2 {
    let { x, y } = v
    if (x < 0) {
        x = cells[0].length - 1
    }
    if (x >= cells[0].length) {
        x = 0
    }
    if (y < 0) {
        y = cells.length - 1
    }
    if (y >= cells.length) {
        y = 0
    }
    return vec2(x, y)
}

export function hasDots(cells: Cells): boolean {
    for (let i = 0; i < cells.length; i++) {
        for (let j = 0; j < cells[i].length; j++) {
            if (cells[i][j] === Cell.dot) {
                return true
            }
        }
    }
    return false
}
