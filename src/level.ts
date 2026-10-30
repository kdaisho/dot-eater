import {
    AiType,
    Cell,
    MAX_ENEMIES,
    MAX_HEALTH,
    RESPAWN_CLEAR_DISTANCE,
    TICK_RATE,
} from "./constants"
import {
    DEFAULT_DIFFICULTY,
    DIFFICULTIES,
    ENEMY_COUNT,
    MAP_SIZE,
    type Difficulty,
    type MapSize,
} from "./difficulty"
import { wrapDelta } from "./glide"
import {
    FREE,
    hasIce,
    nextStates,
    patrolMove,
    slideDistances,
    slideReach,
    type IceMap,
    type MoveState,
    type SlideDistance,
} from "./ice"
import { allDirections, directions, samePos, vec2, type Vec2 } from "./vec2"

export type Cells = Cell[][]

// ---- Level data: the authored, JSON-serializable form ----

// AI names as written in level data. Strings, not AiType numbers, so level
// files (and, later, shared level URLs) stay readable.
export type AiName =
    | "random"
    | "chase"
    | "ambusher"
    | "patroller"
    | "phantom"
    | "splitter"

// A cell as written in level data: [x, y], counted from the top-left corner
// of the map (0, 0).
export type CellRef = readonly [x: number, y: number]

export type EnemyData = {
    ai: AiName
    // Cells per second. Omitted means the game's default speed. For a
    // splitter, the whole one's speed (its halves always move at
    // SPLITTER_HALF_SPEED).
    speed?: number
    // Patrollers only, and required for them: the waypoints walked in order,
    // looping back to the first after the last. At least two, each an open
    // cell the enemy can reach, and none the same as the one before it
    // (including the last and the first). The patroller walks from its spawn
    // to the first waypoint, and starts again from the first one after a
    // respawn. Between waypoints it takes the shortest path.
    route?: readonly CellRef[]
}

// Fog: the player only sees the maze, dots and enemies within `radius` cells
// of themselves; the rest of the map is dark. Purely visual (the renderer
// draws it); the game logic doesn't know about it.
export type FogRule = {
    // In cells, from the centre of the player's sprite. A positive number.
    radius: number
}

// The level's boss (see boss.ts), whose spawn is the "B" in the map.
export type BossData = {
    // Cells per second. Omitted means BOSS_SPEED.
    speed?: number
    // Its breath attack's tuning (see bossBreath.ts). Omitted, or any part
    // of it, means the defaults.
    breath?: BossBreathData
}

// The boss's breath (KDA-268), each part optional (see bossBreathProblems
// for what is allowed).
export type BossBreathData = {
    // Seconds between breaths, and before the first (BOSS_BREATH_EVERY).
    every?: number
    // Seconds it winds up before it breathes (BOSS_BREATH_WIND_UP).
    windUp?: number
    // Its reach in cells from the footprint's edge (BOSS_BREATH_RANGE).
    range?: number
    // Health it costs a player it hits (BOSS_BREATH_DAMAGE).
    damage?: number
}

// Per-level special rules. Each is optional; a level without rules plays
// normally.
export type LevelRules = {
    fog?: FogRule
    // Eaten dots grow back (see regrow.ts).
    regrowDots?: RegrowRule
    // Splitters drop dots as they go (KDA-270, see dropDot in splitter.ts).
    // Only on a level with a boss, where dots don't decide the clear.
    splitterDrops?: boolean
}

// rules.regrowDots (KDA-269): an eaten dot grows back on its own cell after
// `seconds` (positive, in whole tenths like parTime), once the cell is
// clear of characters.
export type RegrowRule = {
    seconds: number
}

// One of a level's two maps (see LevelData), with what goes with it.
export type LevelVariant = {
    // One string per row, all the same length. See the map characters below.
    map: readonly string[]
    // Seconds. Clearing the stage in at most this long earns the "under par"
    // star (see stars.ts). Required, and must be positive.
    parTime: number
    // One entry per `E` in the map, matched in reading order (left to right,
    // then top to bottom), in the order they come in: a difficulty brings
    // out the first ENEMY_COUNT of them (see parseLevel), or all of them if
    // the map lists fewer, and leaves the other spawns empty.
    enemies: readonly EnemyData[]
}

export type LevelData = {
    name: string
    // Cells per second. Omitted means the game's default speed.
    playerSpeed?: number
    // Settings for the boss, if the maps have a "B". Optional even then (the
    // defaults apply); not allowed without one.
    boss?: BossData
    rules?: LevelRules
    // The two maps, each played at the difficulties MAP_SIZE gives it: the
    // medium one (around 21x17) at Easy and Medium, the large one (around
    // 29x21) at Hard and Super Hard. Everything above is shared by both.
    medium: LevelVariant
    large: LevelVariant
}

// Both maps of a level the same: one map for every difficulty, spread into
// the level data (`...sameForBoth({ map, parTime, enemies })`). Being the
// same object, it is checked once, and its problems aren't marked with a
// map size.
export function sameForBoth(variant: LevelVariant): Pick<LevelData, MapSize> {
    return { medium: variant, large: variant }
}

// Map characters:
//   #        wall
//   .        dot
//   (space)  empty
//   P        player 1 spawn (an empty cell)
//   Q        player 2 spawn (a dot, eaten by whoever gets there in a
//            1-player game; createGameState clears it when there is a
//            player 2). Optional: a level without one starts player 2 on
//            player 1's spawn.
//   E        enemy spawn (the enemy starts on a dot)
//   B        boss spawn: the top-left cell of its 2x2 footprint (a dot); the
//            other three must be "." or space
//   ~        ice (empty)
//   :        ice with a dot
// An open cell on the edge of the map is a wrap-around tunnel to the cell on
// the opposite edge, which must also be open. Ice is a kind of floor:
// anything that moves onto it keeps sliding (see ice.ts). Spawns are always
// on normal floor. A level with a boss has no tunnels and no ice: the boss
// neither wraps nor slides. On a boss level, the stage is cleared once
// the boss is defeated, whatever dots are left (see cleared in game.ts).
const WALL = "#"
const DOT = "."
const EMPTY = " "
const ENEMY = "E"
const BOSS = "B"
const ICE = "~"
const ICE_DOT = ":"
// One spawn character per player, in player order. Only player 1's is
// required (see Level.playerSpawns).
export const PLAYER_CHARS: readonly string[] = ["P", "Q"]
const MAP_CHARS: ReadonlySet<string> = new Set([
    WALL,
    DOT,
    EMPTY,
    ENEMY,
    BOSS,
    ICE,
    ICE_DOT,
    ...PLAYER_CHARS,
])

const AI_TYPES: Record<AiName, AiType> = {
    random: AiType.random,
    chase: AiType.chase,
    ambusher: AiType.ambusher,
    patroller: AiType.patroller,
    phantom: AiType.phantom,
    splitter: AiType.splitter,
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
    // Seconds; see LevelVariant.parTime.
    parTime: number
    width: number
    height: number
    // Shared by every game started from this level; copy before mutating.
    cells: readonly (readonly Cell[])[]
    // Where the floor is ice, [y][x] like the cells. Shared like the cells;
    // nothing changes it during a game.
    ice: IceMap
    // Indexed by player, in PLAYER_CHARS order: one per player, always. A
    // spawn the map leaves out (only "Q" may be) is player 1's.
    playerSpawns: readonly Readonly<Vec2>[]
    playerSpeed?: number
    enemies: readonly EnemySpawn[]
    // The boss, or null for none: its spawn (the top-left cell of its
    // footprint), speed and breath tuning (see BossData).
    boss: {
        pos: Readonly<Vec2>
        speed?: number
        breath?: Readonly<BossBreathData>
    } | null
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

// A level parsed for every difficulty (see parseStage).
export type Stage = Readonly<Record<Difficulty, Level>>

// Parse and validate level data, and give the level as played at
// `difficulty`: its map (MAP_SIZE) with the first ENEMY_COUNT enemies (see
// levelFor). Both maps are checked whatever the difficulty (see parseMaps),
// so a level that parses at one difficulty parses at every one. Throws a
// LevelError listing the problems found.
export function parseLevel(
    data: LevelData,
    difficulty: Difficulty = DEFAULT_DIFFICULTY
): Level {
    return levelFor(parseMaps(data)[MAP_SIZE[difficulty]], difficulty)
}

// `level`, one of parseMaps' levels with every enemy its map lists, as
// played at `difficulty`: the first ENEMY_COUNT[difficulty] enemies, or all
// of them if it lists fewer. The other enemies' spawns are left empty: no
// enemy, and the cell keeps the dot every "E" starts with.
export function levelFor(level: Level, difficulty: Difficulty): Level {
    const count = ENEMY_COUNT[difficulty]
    if (level.enemies.length <= count) return level
    return { ...level, enemies: level.enemies.slice(0, count) }
}

// Parse a stage's level data for every difficulty, checking what parseLevel
// does and, as a stage is played by people, that no enemy or boss spawn is
// within SPAWN_GAP of a player spawn. Throws a LevelError like parseLevel.
export function parseStage(data: LevelData): Stage {
    const maps = parseMaps(data)
    const problems = mapsToCheck(data).flatMap(({ size, prefix }) =>
        spawnGapProblems(maps[size]).map((p) => prefix + p)
    )
    if (problems.length > 0) throw new LevelError(data.name, problems)
    const stage: Partial<Record<Difficulty, Level>> = {}
    for (const difficulty of DIFFICULTIES) {
        stage[difficulty] = levelFor(maps[MAP_SIZE[difficulty]], difficulty)
    }
    return stage as Stage
}

// While nobody is in play in a 2-player game, the enemies and the boss head
// back to their own spawns, and a player waiting to come back needs its
// spawn clear of them (see clearOfEnemies in game.ts). So no enemy or boss
// spawn may be near a player spawn: the gap keeps a chaser circling its
// spawn, a cell off it, out of the way.
export const SPAWN_GAP = RESPAWN_CLEAR_DISTANCE + 1

// Enemy spawns (every one the map lists, so every difficulty's) and boss
// spawns (by the nearest cell of its 2x2 footprint) within SPAWN_GAP of a
// player spawn, measured straight and wrap-aware.
function spawnGapProblems(level: Level): string[] {
    const { boss } = level
    const others = level.enemies.map(({ pos }, i) => ({
        what: `enemies[${i}]'s spawn at (${pos.x}, ${pos.y})`,
        cells: [pos],
    }))
    if (boss) {
        const { x, y } = boss.pos
        others.push({
            what: `the boss at (${x}, ${y})`,
            cells: [
                vec2(x, y),
                vec2(x + 1, y),
                vec2(x, y + 1),
                vec2(x + 1, y + 1),
            ],
        })
    }
    const problems: string[] = []
    level.playerSpawns.forEach((spawn, i) => {
        // A missing "Q" is player 1's spawn, already checked.
        if (i > 0 && samePos(spawn, level.playerSpawns[0])) return
        for (const { what, cells } of others) {
            const gap = Math.min(
                ...cells.map((pos) =>
                    Math.hypot(
                        wrapDelta(pos.x - spawn.x, level.width),
                        wrapDelta(pos.y - spawn.y, level.height)
                    )
                )
            )
            if (gap < SPAWN_GAP) {
                problems.push(
                    `${what} is too near the "${PLAYER_CHARS[i]}" at (${spawn.x}, ${spawn.y}): ${gap.toFixed(2)} cells, less than ${SPAWN_GAP}`
                )
            }
        }
    })
    return problems
}

// The maps to check: both, each with the prefix that marks its problems,
// or just the medium one, unmarked, when both are the same object (see
// sameForBoth).
function mapsToCheck(
    data: LevelData
): { size: MapSize; variant: LevelVariant; prefix: string }[] {
    if (data.medium === data.large) {
        return [{ size: "medium", variant: data.medium, prefix: "" }]
    }
    return [
        { size: "medium", variant: data.medium, prefix: "medium: " },
        { size: "large", variant: data.large, prefix: "large: " },
    ]
}

// Parse and validate both maps of the level data, each with every enemy it
// lists. Throws a LevelError listing the problems found. Checks run in
// stages (metadata and map shape, then spawns and tunnels, then
// reachability), on both maps at once; a stage only runs if the earlier
// ones passed. A problem with one map is marked with its size ("large: ...")
// unless both are the same object (see sameForBoth). Reachability is
// slide-aware (see slideReach in ice.ts): every dot must be collectable, and
// no slide may take the player somewhere it can't get back to the spawn
// from.
//
// Every check on an enemy depends only on the enemy and its own spawn,
// which is the same at every difficulty (the enemies a difficulty brings
// out are a prefix of the list, each on its own "E"), and an "E" left empty
// is the same cell as one with an enemy. So a map whose whole list passes
// passes with every prefix a difficulty can pick.
export function parseMaps(data: LevelData): Readonly<Record<MapSize, Level>> {
    const { name } = data
    const problems: string[] = []
    const fail = () => new LevelError(name, problems)
    const maps = mapsToCheck(data)
    const report = (prefix: string, found: readonly string[]) => {
        for (const p of found) problems.push(prefix + p)
    }

    // Stage 1: metadata and map shape.
    if (name.trim() === "") {
        problems.push("name must not be empty")
    }
    checkSpeed(problems, "playerSpeed", data.playerSpeed)
    problems.push(...bossDataProblems(data.boss))
    problems.push(...rulesProblems(data.rules))
    const missing = maps.filter(({ variant }) => !isPlainObject(variant))
    for (const { size, variant } of missing) {
        problems.push(
            `${size} must be an object, got ${JSON.stringify(variant)}`
        )
    }
    if (missing.length > 0) throw fail()
    const rows = maps.map(({ variant, prefix }) => {
        const shape = shapeProblems(variant)
        report(prefix, shape.problems)
        return shape.rows
    })
    if (problems.length > 0) throw fail()

    // Stage 2: build cells and collect spawns.
    const built = maps.map(({ variant, prefix }, i) => {
        const map = buildMap(rows[i])
        report(prefix, spawnStageProblems(map, variant, data.boss))
        return map
    })
    // The boss is part of what the stage is, at every difficulty.
    const bosses = new Set(built.map((map) => map.bossPositions.length > 0))
    if (bosses.size > 1) {
        problems.push(`both maps must have a boss ("${BOSS}") or neither`)
    } else {
        problems.push(...bossEnergyProblems(data.rules, bosses.has(true)))
        problems.push(...splitterDropsProblems(data.rules, bosses.has(true)))
    }
    if (problems.length > 0) throw fail()

    // Stage 3: every dot must be reachable from every player's spawn,
    // sliding included, and no slide may strand a player.
    maps.forEach(({ variant, prefix }, i) =>
        report(prefix, reachProblems(built[i], variant))
    )
    if (problems.length > 0) throw fail()

    const [medium, large = medium] = maps.map(({ variant }, i) =>
        toLevel(data, variant, built[i])
    )
    return { medium, large }
}

// One map's metadata and shape: its par time, its enemies (that need no
// map) and its rows, split by code point (not UTF-16 unit, so a character
// outside the BMP, e.g. an emoji, counts as one cell).
function shapeProblems(variant: LevelVariant): {
    problems: string[]
    rows: string[][]
} {
    const { map } = variant
    const problems: string[] = []
    if (!isParTime(variant.parTime)) {
        problems.push(
            `parTime must be a positive number of seconds in whole tenths, got ${String(variant.parTime)}`
        )
    }
    variant.enemies.forEach((enemy, i) => {
        if (!Object.hasOwn(AI_TYPES, enemy.ai)) {
            problems.push(
                `enemies[${i}].ai must be one of ${Object.keys(AI_TYPES).join(", ")}, got ${JSON.stringify(enemy.ai)}`
            )
        }
        checkSpeed(problems, `enemies[${i}].speed`, enemy.speed)
        problems.push(...routeShapeProblems(enemy, i))
    })
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
    return { problems, rows }
}

// A map's cells, ice and spawns, from its rows (by character).
type BuiltMap = {
    rows: readonly (readonly string[])[]
    cells: Cells
    ice: boolean[][]
    // Every "E", "B" and player spawn character's cells, in reading order;
    // playerPositions is indexed like PLAYER_CHARS.
    enemyPositions: Vec2[]
    bossPositions: Vec2[]
    playerPositions: Vec2[][]
}

function buildMap(rows: readonly (readonly string[])[]): BuiltMap {
    const cells: Cells = []
    const enemyPositions: Vec2[] = []
    const bossPositions: Vec2[] = []
    const playerPositions: Vec2[][] = PLAYER_CHARS.map(() => [])
    rows.forEach((row, y) => {
        cells.push(
            row.map((ch, x) => {
                const player = PLAYER_CHARS.indexOf(ch)
                if (player !== -1) {
                    playerPositions[player].push(vec2(x, y))
                    // Player 1's spawn is empty. Later players' spawns hold
                    // a dot, so a 1-player game has as many as with no
                    // player 2 at all; createGameState clears the spawn of
                    // each player there is.
                    return player === 0 ? Cell.none : Cell.dot
                }
                switch (ch) {
                    case WALL:
                        return Cell.wall
                    case DOT:
                    case ICE_DOT:
                        return Cell.dot
                    case ENEMY:
                        enemyPositions.push(vec2(x, y))
                        return Cell.dot
                    case BOSS:
                        bossPositions.push(vec2(x, y))
                        return Cell.dot
                    default:
                        return Cell.none
                }
            })
        )
    })
    const ice: boolean[][] = rows.map((row) =>
        row.map((ch) => ch === ICE || ch === ICE_DOT)
    )
    return { rows, cells, ice, enemyPositions, bossPositions, playerPositions }
}

// Spawn counts, dots, tunnels, the boss and route waypoints on the map.
function spawnStageProblems(
    map: BuiltMap,
    variant: LevelVariant,
    boss: BossData | undefined
): string[] {
    const { rows, cells, enemyPositions, bossPositions, playerPositions } = map
    const { enemies } = variant
    const width = rows[0].length
    const problems: string[] = []
    PLAYER_CHARS.forEach((ch, i) => {
        const count = playerPositions[i].length
        if (i > 0 && count > 1) {
            problems.push(
                `map may have at most one "${ch}" (player ${i + 1} spawn), found ${count}`
            )
        } else if (i === 0 && count !== 1) {
            problems.push(
                `map must have exactly one "${ch}" (player ${i + 1} spawn), found ${count}`
            )
        }
    })
    if (enemyPositions.length !== enemies.length) {
        problems.push(
            `map has ${enemyPositions.length} "${ENEMY}" spawns but enemies lists ${enemies.length}`
        )
    }
    // A Splitter counts as one: its spare slot (see splitter.ts) is within
    // MAX_ENEMY_SLOTS however many there are.
    if (enemies.length > MAX_ENEMIES) {
        problems.push(
            `at most ${MAX_ENEMIES} enemies are supported, got ${enemies.length}`
        )
    }
    // A level without dots would be won on the first tick.
    if (!hasDots(cells)) {
        problems.push(
            `map must have at least one dot ("${DOT}", "${ICE_DOT}" or an "${ENEMY}" spawn)`
        )
    }
    problems.push(...tunnelProblems(cells))
    problems.push(...sealedProblems(map))
    problems.push(...bossProblems(rows, bossPositions, boss))
    enemies.forEach((enemy, i) => {
        enemy.route?.forEach(([x, y], j) => {
            const field = `enemies[${i}].route[${j}]`
            if (x >= width || y >= rows.length) {
                problems.push(`${field} (${x}, ${y}) is off the map`)
            } else if (cells[y][x] === Cell.wall) {
                problems.push(`${field} (${x}, ${y}) is a wall`)
            }
        })
    })
    return problems
}

// Each player spawn's dots and slides (see spawnProblems), and each
// patroller's route from its spawn, sliding included (see routeProblems).
function reachProblems(map: BuiltMap, variant: LevelVariant): string[] {
    const { cells, ice, enemyPositions } = map
    const problems: string[] = []
    const playerSpawns = playerSpawnsOf(map)
    playerSpawns.forEach((spawn, i) => {
        if (i > 0 && samePos(spawn, playerSpawns[0])) return
        problems.push(...spawnProblems(cells, ice, spawn, i))
    })
    // A slide that strands a player from its spawn is reported above; the
    // trapped areas are checked once the spawns are sound, so it isn't
    // reported twice.
    if (problems.length === 0) problems.push(...trapProblems(map))
    variant.enemies.forEach((enemy, i) => {
        if (!enemy.route) return
        problems.push(
            ...routeProblems(cells, ice, enemyPositions[i], enemy.route, i)
        )
    })
    return problems
}

// One spawn per player: a spawn the map leaves out is player 1's.
function playerSpawnsOf(map: BuiltMap): Vec2[] {
    const [first] = map.playerPositions[0]
    return map.playerPositions.map(([pos]) => pos ?? first)
}

// The (already validated) map as a Level, with every enemy it lists.
function toLevel(data: LevelData, variant: LevelVariant, map: BuiltMap): Level {
    const { cells, ice, enemyPositions, bossPositions } = map
    return {
        name: data.name,
        parTime: variant.parTime,
        width: map.rows[0].length,
        height: map.rows.length,
        cells,
        ice,
        playerSpawns: playerSpawnsOf(map),
        ...(data.playerSpeed === undefined
            ? {}
            : { playerSpeed: data.playerSpeed }),
        enemies: enemyPositions.map((pos, i) => {
            const { ai, speed, route } = variant.enemies[i]
            return {
                pos,
                ai: AI_TYPES[ai],
                ...(speed === undefined ? {} : { speed }),
                ...(route === undefined
                    ? {}
                    : { route: route.map(([x, y]) => vec2(x, y)) }),
            }
        }),
        boss:
            bossPositions.length === 0
                ? null
                : {
                      pos: bossPositions[0],
                      ...(data.boss?.speed === undefined
                          ? {}
                          : { speed: data.boss.speed }),
                      ...(data.boss?.breath === undefined
                          ? {}
                          : { breath: { ...data.boss.breath } }),
                  },
        rules: copyRules(data.rules),
    }
}

const BOSS_KEYS: ReadonlySet<string> = new Set(["speed", "breath"])

// Boss settings that need no map: an object with only known, valid
// settings. Whether the map has a boss for them is checked once it is
// known.
function bossDataProblems(boss: BossData | undefined): string[] {
    if (boss === undefined) return []
    if (!isPlainObject(boss)) {
        return [`boss must be an object, got ${JSON.stringify(boss)}`]
    }
    const problems: string[] = []
    for (const key of Object.keys(boss)) {
        if (!BOSS_KEYS.has(key)) {
            problems.push(`unknown boss setting ${JSON.stringify(key)}`)
        }
    }
    checkSpeed(problems, "boss.speed", boss.speed)
    problems.push(...bossBreathProblems(boss.breath))
    return problems
}

// What each boss breath setting may be (see BossBreathData): seconds for
// `every` and `windUp` (a wind-up too short to see and dodge is unfair),
// whole cells for `range` and whole health for `damage` (at most a full
// gauge).
const BOSS_BREATH_LIMITS: Readonly<
    Record<
        keyof BossBreathData,
        { min: number; max: number; whole: boolean; unit: string }
    >
> = {
    every: { min: 1, max: 60, whole: false, unit: "seconds" },
    windUp: { min: 0.25, max: 5, whole: false, unit: "seconds" },
    range: { min: 1, max: 30, whole: true, unit: "cells" },
    damage: { min: 1, max: MAX_HEALTH, whole: true, unit: "health" },
}

// The boss's breath settings (`boss.breath`), on their own: an object with
// only known settings, each a number within BOSS_BREATH_LIMITS.
function bossBreathProblems(breath: unknown): string[] {
    if (breath === undefined) return []
    if (!isPlainObject(breath)) {
        return [`boss.breath must be an object, got ${JSON.stringify(breath)}`]
    }
    const problems: string[] = []
    for (const [key, value] of Object.entries(breath)) {
        if (!Object.hasOwn(BOSS_BREATH_LIMITS, key)) {
            problems.push(`unknown boss.breath setting ${JSON.stringify(key)}`)
            continue
        }
        if (value === undefined) continue
        const { min, max, whole, unit } =
            BOSS_BREATH_LIMITS[key as keyof BossBreathData]
        const ok =
            typeof value === "number" &&
            Number.isFinite(value) &&
            value >= min &&
            value <= max &&
            (!whole || Number.isInteger(value))
        if (!ok) {
            problems.push(
                `boss.breath.${key} must be ${whole ? "a whole number" : "a number"} of ${unit} from ${min} to ${max}, got ${JSON.stringify(value)}`
            )
        }
    }
    return problems
}

// The boss's spawn (`spawns`, every "B" in reading order) against the map
// (`rows`, by character): at most one, with its whole 2x2 footprint on the
// map and open floor, and boss settings only with a boss. A boss level has
// no wrap tunnels and no ice, which the boss can't use.
function bossProblems(
    rows: readonly (readonly string[])[],
    spawns: readonly Vec2[],
    boss: BossData | undefined
): string[] {
    if (spawns.length === 0) {
        return boss === undefined
            ? []
            : [`boss settings are given but the map has no "${BOSS}"`]
    }
    if (spawns.length > 1) {
        return [`map must have at most one "${BOSS}", found ${spawns.length}`]
    }
    const problems: string[] = []
    const [{ x, y }] = spawns
    const height = rows.length
    const width = rows[0].length
    if (x + 1 >= width || y + 1 >= height) {
        problems.push(
            `the boss at (${x}, ${y}) doesn't fit: its 2x2 footprint goes off the map`
        )
    } else {
        for (const [cx, cy] of [
            [x + 1, y],
            [x, y + 1],
            [x + 1, y + 1],
        ]) {
            const ch = rows[cy][cx]
            if (ch !== DOT && ch !== EMPTY) {
                problems.push(
                    `the boss at (${x}, ${y}) needs open floor ("${DOT}" or space) at (${cx}, ${cy}), got ${JSON.stringify(ch)}`
                )
            }
        }
    }
    const tunnels = rows.flatMap((row, ry) =>
        row.flatMap((ch, rx) =>
            ch !== WALL &&
            (rx === 0 || ry === 0 || rx === width - 1 || ry === height - 1)
                ? [`(${rx}, ${ry})`]
                : []
        )
    )
    if (tunnels.length > 0) {
        problems.push(
            `a level with a boss can't have wrap tunnels, but the edge is open at ${tunnels.join(", ")}`
        )
    }
    if (rows.some((row) => row.some((ch) => ch === ICE || ch === ICE_DOT))) {
        problems.push(`a level with a boss can't have ice`)
    }
    return problems
}

const RULE_KEYS: ReadonlySet<string> = new Set([
    "fog",
    "regrowDots",
    "splitterDrops",
])
const FOG_KEYS: ReadonlySet<string> = new Set(["radius"])
// The smallest fog radius: the renderer's soft edge is 1.5 cells, and a
// smaller radius would darken the player's own cell.
export const MIN_FOG_RADIUS = 1.5

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

// Rules are optional; when given, only known rules with valid settings are
// allowed, so a typo (e.g. "fogg") isn't silently ignored.
function rulesProblems(rules: LevelRules | undefined): string[] {
    if (rules === undefined) return []
    if (!isPlainObject(rules)) {
        return [`rules must be an object, got ${JSON.stringify(rules)}`]
    }
    const problems: string[] = []
    for (const key of Object.keys(rules)) {
        if (!RULE_KEYS.has(key)) {
            problems.push(
                `unknown rule ${JSON.stringify(key)} (known rules: ${[...RULE_KEYS].join(", ")})`
            )
        }
    }
    problems.push(...regrowDotsProblems(rules.regrowDots))
    const fog: unknown = rules.fog
    if (fog === undefined) return problems
    if (!isPlainObject(fog)) {
        problems.push(`rules.fog must be an object, got ${JSON.stringify(fog)}`)
        return problems
    }
    for (const key of Object.keys(fog)) {
        if (!FOG_KEYS.has(key)) {
            problems.push(`unknown rules.fog setting ${JSON.stringify(key)}`)
        }
    }
    const { radius } = fog
    if (
        !(
            typeof radius === "number" &&
            Number.isFinite(radius) &&
            radius >= MIN_FOG_RADIUS
        )
    ) {
        // String, not JSON, for numbers: JSON shows NaN and Infinity as null.
        const got =
            typeof radius === "number" ? String(radius) : JSON.stringify(radius)
        problems.push(
            `rules.fog.radius must be a number of at least ${MIN_FOG_RADIUS}, got ${got}`
        )
    }
    return problems
}

// rules.regrowDots, if given: an object with only `seconds`, positive and
// in whole tenths (the same rule as parTime).
function regrowDotsProblems(rule: unknown): string[] {
    if (rule === undefined) return []
    if (!isPlainObject(rule)) {
        return [
            `rules.regrowDots must be an object, got ${JSON.stringify(rule)}`,
        ]
    }
    const problems = Object.keys(rule)
        .filter((key) => key !== "seconds")
        .map((key) => `unknown rules.regrowDots setting ${JSON.stringify(key)}`)
    if (!isParTime(rule.seconds)) {
        problems.push(
            `rules.regrowDots.seconds must be a positive number of seconds in whole tenths, got ${String(rule.seconds)}`
        )
    }
    return problems
}

// rules.splitterDrops, if given: true or false, and true only on a level
// with a boss (`hasBoss`). Elsewhere the dots decide the clear, and a
// Splitter dropping them would keep adding dots to clear.
function splitterDropsProblems(
    rules: LevelRules | undefined,
    hasBoss: boolean
): string[] {
    const drops: unknown = rules?.splitterDrops
    if (drops === undefined) return []
    if (typeof drops !== "boolean") {
        return [
            `rules.splitterDrops must be true or false, got ${JSON.stringify(drops)}`,
        ]
    }
    return drops && !hasBoss
        ? [
              `rules.splitterDrops needs a boss ("${BOSS}"): elsewhere dots decide the clear`,
          ]
        : []
}

// A boss level (`hasBoss`) must have rules.regrowDots. A boss takes many
// breaths to defeat and the breaths' energy comes only from dots, so
// without dots coming back the stage could run out of them with the boss
// still standing, and could never be won.
function bossEnergyProblems(
    rules: LevelRules | undefined,
    hasBoss: boolean
): string[] {
    return hasBoss && rules?.regrowDots === undefined
        ? [
              "a boss level needs rules.regrowDots, so the dots (its ammunition) come back",
          ]
        : []
}

// A copy of the (already validated) rules, so the parsed level shares no
// objects with the level data.
function copyRules(rules: LevelRules | undefined): LevelRules {
    const copy: LevelRules = rules?.fog
        ? { fog: { radius: rules.fog.radius } }
        : {}
    if (rules?.regrowDots) {
        copy.regrowDots = { seconds: rules.regrowDots.seconds }
    }
    if (rules?.splitterDrops !== undefined) {
        copy.splitterDrops = rules.splitterDrops
    }
    return copy
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

// Every dot must be reachable from player `index`'s `spawn`, sliding
// included, and no slide may strand the player there with no way back to
// it (see slideReach). Player 1's problems read as they always have. The
// check is for a player that slides, whatever animal it turns out to be: one
// that walks on ice (the Penguin) moves as on floor, so it reaches at least
// as much and can always walk back.
function spawnProblems(
    cells: Cells,
    ice: IceMap,
    spawn: Vec2,
    index: number
): string[] {
    const problems: string[] = []
    const from =
        index === 0 ? "the player spawn" : `player ${index + 1}'s spawn`
    const reach = slideReach(cells, ice, spawn)
    cells.forEach((row, y) =>
        row.forEach((cell, x) => {
            if (cell === Cell.dot && !reach.visited[y][x]) {
                problems.push(
                    `dot at (${x}, ${y}) can't be reached from ${from}`
                )
            }
        })
    )
    // One problem per cell, however many ways the player can get stuck
    // there, in reading order.
    const stranded = new Set(reach.stuck.map((s) => `${s.pos.x},${s.pos.y}`))
    cells.forEach((row, y) =>
        row.forEach((_, x) => {
            if (!stranded.has(`${x},${y}`)) return
            problems.push(
                `sliding can strand the player at (${x}, ${y}), with no way back to ${index === 0 ? "the spawn" : from}`
            )
        })
    )
    return problems
}

// Whether a patroller starting free at `spawn` walks its whole route:
// waypoint 0, then each next one in turn, and back round to waypoint 0
// again. A waypoint is reached by stopping on it or by sliding over it, as
// in the game (see reachWaypoint in game.ts).
//
// First, every waypoint must be somewhere the patroller can get to at all
// from its spawn. Without ice moves are symmetric, so that also connects
// the waypoints to each other and nothing more is checked. With ice, where
// the patroller ends up on reaching a waypoint (which cell, sliding or not)
// decides where it can go next, so the check then walks the patroller's own
// path (patrolMove, the same choice the AI makes), lap after lap until it
// repeats itself, and reports the first leg it can't finish: past that
// point the patroller never gets any further round its route.
function routeProblems(
    cells: Cells,
    ice: IceMap,
    spawn: Vec2,
    route: readonly CellRef[],
    i: number
): string[] {
    const field = (j: number) =>
        `enemies[${i}].route[${j}] (${route[j][0]}, ${route[j][1]})`
    const { visited } = slideReach(cells, ice, spawn)
    const problems: string[] = []
    route.forEach(([x, y], j) => {
        if (!visited[y][x]) {
            problems.push(`${field(j)} can't be reached from the enemy's spawn`)
        }
    })
    if (problems.length > 0 || !hasIce(ice)) {
        return problems
    }

    // One distance map per waypoint; the patroller has no blocked cell.
    const dists: SlideDistance[] = []
    const distTo = (j: number) =>
        (dists[j] ??= slideDistances(cells, ice, vec2(...route[j])))
    let state: MoveState = { pos: spawn, heading: FREE }
    let j = 0
    // How far round the route the patroller has got, so a failed leg can
    // name where it set off from: the spawn on the very first leg.
    let legs = 0
    const seen = new Set<string>()
    for (;;) {
        if (samePos(state.pos, vec2(...route[j]))) {
            j = (j + 1) % route.length
            legs++
        }
        // Each step brings the patroller one move closer to its waypoint,
        // so a repeat means a whole lap (or more) went by.
        const key = `${state.pos.x},${state.pos.y},${state.heading},${j}`
        if (seen.has(key)) return []
        seen.add(key)
        const next =
            distTo(j)(state) === Infinity
                ? null
                : state.heading === FREE
                  ? patrolMove(cells, ice, state.pos, distTo(j))
                  : nextStates(cells, ice, state)[0]
        if (next === null) {
            const prev = (j + route.length - 1) % route.length
            const from =
                legs === 0
                    ? "the enemy's spawn"
                    : field(prev).slice(`enemies[${i}].`.length)
            return [
                `${field(j)} can't be reached from ${from}: sliding carries the patroller away`,
            ]
        }
        state = next
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

// Open areas walled off from every spawn and dot (KDA-245), one problem per
// area, named by its first cell in reading order. Nothing ever goes there
// but a player who breaks in through a wall (the Boar), who could then be
// sealed inside, with no dots to refill its energy and break out again.
// Areas are found by plain steps, wrap tunnels included. Ice can still make
// an area that plain steps join to the rest one-way for a sliding player;
// trapProblems checks for that once the spawns are known to be sound.
function sealedProblems(map: BuiltMap): string[] {
    const { cells } = map
    const height = cells.length
    const width = cells[0].length
    const reached = cells.map((row) => row.map(() => false))
    // Mark everything open that `starts` connect to; the cells newly marked.
    const flood = (starts: readonly Vec2[]): Vec2[] => {
        const queue = starts.filter(({ x, y }) => !reached[y][x])
        for (const { x, y } of queue) reached[y][x] = true
        for (let head = 0; head < queue.length; head++) {
            for (const d of allDirections) {
                const { x, y } = queue[head]
                const step = directions[d]
                const next = loopPos(cells, vec2(x + step.x, y + step.y))
                if (cells[next.y][next.x] === Cell.wall) continue
                if (reached[next.y][next.x]) continue
                reached[next.y][next.x] = true
                queue.push(next)
            }
        }
        return queue
    }
    const sources: Vec2[] = map.playerPositions.flat()
    cells.forEach((row, y) =>
        row.forEach((cell, x) => {
            if (cell === Cell.dot) sources.push(vec2(x, y))
        })
    )
    flood(sources)
    const problems: string[] = []
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (cells[y][x] === Cell.wall || reached[y][x]) continue
            const size = flood([vec2(x, y)]).length
            problems.push(
                `open area at (${x}, ${y}) (${size} ${size === 1 ? "cell" : "cells"}) is sealed off: no spawn or dot reaches it`
            )
        }
    }
    return problems
}

// Open areas a sliding player can't get out of (KDA-245, as sealedProblems):
// cells where a player standing free can never get back to a player spawn,
// however it moves. Spawn checks only follow the player from its spawn, but
// a player that breaks in through a wall (the Boar) can stand anywhere open,
// and the wall regrows behind it. One problem per area: the trapped cells a
// slider can get to from the first one in reading order, which names it. A
// player that walks on ice (the Penguin) can always walk back, so only
// sliders are checked, and only with ice: without it moves are symmetric
// and sealedProblems has found every such area already.
function trapProblems(map: BuiltMap): string[] {
    const { cells, ice } = map
    if (!hasIce(ice)) return []
    const spawns = playerSpawnsOf(map).filter(
        (spawn, i, all) => all.findIndex((s) => samePos(s, spawn)) === i
    )
    // One search backwards from each spawn (see slideDistances).
    const dists = spawns.map((spawn) => slideDistances(cells, ice, spawn))
    const trapped = cells.map((row, y) =>
        row.map(
            (cell, x) =>
                cell !== Cell.wall &&
                dists.every(
                    (d) => d({ pos: vec2(x, y), heading: FREE }) === Infinity
                )
        )
    )
    const problems: string[] = []
    cells.forEach((row, y) =>
        row.forEach((_, x) => {
            if (!trapped[y][x]) return
            const { visited } = slideReach(cells, ice, vec2(x, y))
            let size = 0
            visited.forEach((seen, vy) =>
                seen.forEach((v, vx) => {
                    if (!v || !trapped[vy][vx]) return
                    trapped[vy][vx] = false
                    size++
                })
            )
            problems.push(
                `open area at (${x}, ${y}) (${size} ${size === 1 ? "cell" : "cells"}) traps a sliding player: no way back to a player spawn`
            )
        })
    )
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

// Par times are shown to the tenth of a second, so they must be whole tenths:
// otherwise a clear could earn the par star while showing a time above the
// shown par (or the other way round).
function isParTime(value: unknown): value is number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return false
    }
    const tenths = value * 10
    return Math.abs(tenths - Math.round(tenths)) < 1e-9
}
