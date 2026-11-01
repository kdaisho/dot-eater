// The director: plays the promo's directed scenes (see SCENE_NAMES in
// src/scenes.ts), each a short run set up to show off one thing, e.g. the
// Dragon's fire reaching an enemy down a long corridor. A scene is a stage,
// the animals, a seed and a "brain" per player: a bot with a goal, built
// from the blocks below (eat dots safely, walk to where a breath would hit,
// breathe when it would do what the scene wants). The recording stops a
// little after the scene's key moment.
//
// Everything is seeded, so a scene records the same run every time. The
// seeds were picked by searching (record-scenes --search), scoring each run
// on how well it shows its moment (see SceneDef.score).
import { canBreathe, hasStatus, inPlay } from "../../src/breath.ts"
import {
    bossFits,
    bossReach,
    footprint,
    mapFloor,
    squareDistance,
} from "../../src/boss.ts"
import { Cell, TICK_MS } from "../../src/constants.ts"
import {
    startLevel,
    update,
    type FlowDeps,
    type Picks,
    type Screen,
    type TickInput,
} from "../../src/flow.ts"
import { drawnPos, type GameState } from "../../src/game.ts"
import { wrapDelta } from "../../src/glide.ts"
import type { DirectionAction } from "../../src/input.ts"
import { loopPos } from "../../src/level.ts"
import { stages as levels } from "../../src/levels/index.ts"
import { openNeighbours } from "../../src/path.ts"
import { emptyProgress } from "../../src/progress.ts"
import {
    cloneScreen,
    createRecorder,
    createRng,
    shouldRecord,
    type Recording,
} from "../../src/replay.ts"
import { samePos, vec2, type Vec2 } from "../../src/vec2.ts"
import { momentsOf, type Moment } from "../src/highlights.ts"
import { threatDistance } from "../src/replayers.ts"
import type { SceneName } from "../src/scenes.ts"
import { directionTo, firstStepTo } from "./bot.ts"

type Playing = Extract<Screen, { kind: "playing" }>

const DIRECTIONS: Record<DirectionAction, Vec2> = {
    up: vec2(0, -1),
    down: vec2(0, 1),
    left: vec2(-1, 0),
    right: vec2(1, 0),
}
const ACTIONS = Object.keys(DIRECTIONS) as DirectionAction[]

const key = (p: Vec2) => `${p.x},${p.y}`

// One player's choice for one tick: the direction to hold (null for none)
// and whether to press breath.
export type Decision = { dir: DirectionAction | null; breath: boolean }

const IDLE: Decision = { dir: null, breath: false }

// What a brain sees on a tick.
export type View = {
    screen: Playing
    game: GameState
    // Which player it plays.
    player: number
    // Ticks recorded so far.
    tick: number
    // What the game would do this tick if this player held `dir` and
    // breathed (the others idle): the moments of that tick (see
    // highlights.ts), the game before and after it. A dry run on a copy:
    // the real game and its randomness are left as they were.
    tryBreath(dir: DirectionAction | null): Lookahead
}

export type Lookahead = {
    moments: Moment[]
    before: GameState
    after: GameState
}

// A bot playing one player, called once per tick of play. Made fresh for
// each run (see SceneDef.brains), so it can keep state of its own.
export type Brain = (view: View) => Decision

export type SceneDef = {
    level: number
    animals: Picks
    mode: "solo" | "coop"
    seed: number
    // One brain per player.
    brains: () => Brain[]
    // Whether a tick's moments include the scene's key moment. The
    // recording carries on for `tail` ticks after the first such tick.
    isKey: (moments: readonly Moment[], screen: Screen) => boolean
    tail: number
    // Give up (the run doesn't count) when the key moment hasn't happened
    // by then.
    maxTicks: number
    // How well a run shows the scene, higher is better (for the seed
    // search): only runs with their key moment and no player caught count.
    score: (run: SceneRun) => number
}

export type SceneRun = {
    recording: Recording
    // Every tick's moments, in order (near misses aside).
    moments: Moment[]
    // The first tick with the key moment, or null if it never came.
    keyTick: number | null
    // Whether a player was caught.
    caught: boolean
    // player 1's closest threat on each tick (see threatDistance), [0] the
    // start.
    threats: number[]
}

// ---- Seeing the board ----

// Enemies in play that can catch.
function threats(game: GameState) {
    return game.enemies.filter((e) => inPlay(e) && !hasStatus(e, "harmless"))
}

// Cells to keep off: every threat's cell and those `margin` steps from it
// (0 or 1), and the live boss's footprint with a ring round it.
function dangerOf(game: GameState, margin = 1): Set<string> {
    const danger = new Set<string>()
    for (const enemy of threats(game)) {
        danger.add(key(enemy.pos))
        if (margin > 0) {
            for (const n of openNeighbours(game.cells, enemy.pos)) {
                danger.add(key(n))
            }
        }
    }
    // The boss: every cell under it now or after a step or two (it only
    // goes where it fits, so not into 1-wide corridors).
    const { boss } = game
    if (boss && !boss.defeated) {
        for (const { pos, dist } of bossReach(boss.pos, mapFloor(game.cells))) {
            if (dist > 2) break
            for (const c of footprint(pos)) danger.add(key(c))
        }
    }
    return danger
}

// How close the nearest threat is to player `i`, in cells between where
// they are drawn (as threatDistance in replayers.ts, for any player).
function threatTo(game: GameState, i: number): number {
    const me = game.players[i]
    if (me.out) return Infinity
    const cols = game.cells[0].length
    const rows = game.cells.length
    const p = drawnPos(me.character, cols, rows)
    let best = Infinity
    for (const enemy of threats(game)) {
        const e = drawnPos(enemy, cols, rows)
        best = Math.min(
            best,
            Math.hypot(wrapDelta(e.x - p.x, cols), wrapDelta(e.y - p.y, rows))
        )
    }
    const { boss } = game
    if (boss && !boss.defeated) {
        const b = drawnPos(boss, cols, rows)
        const r = vec2(wrapDelta(p.x - b.x, cols), wrapDelta(p.y - b.y, rows))
        best = Math.min(best, squareDistance(r, r))
    }
    return best
}

// The neighbour of `from` farthest (as the crow flies) from every threat.
function fleeStep(game: GameState, from: Vec2): Vec2 | null {
    const cols = game.cells[0].length
    const rows = game.cells.length
    const away = (p: Vec2) => {
        const points = threats(game).map((e) => e.pos)
        if (game.boss && !game.boss.defeated) {
            points.push(...footprint(game.boss.pos))
        }
        return Math.min(
            ...points.map((q) =>
                Math.hypot(
                    wrapDelta(q.x - p.x, cols),
                    wrapDelta(q.y - p.y, rows)
                )
            )
        )
    }
    let best: Vec2 | null = null
    for (const n of openNeighbours(game.cells, from)) {
        if (!best || away(n) > away(best)) best = n
    }
    return best
}

// The way towards the nearest dot that keeps `margin` cells off threats,
// or away from them when there is none.
function eat(game: GameState, me: Vec2, margin = 1): DirectionAction | null {
    // Dots near another player are theirs, so two players split up.
    const others = game.players
        .map((p) => p.character.pos)
        .filter((p) => !samePos(p, me))
    const isDot = (p: Vec2) =>
        game.cells[p.y][p.x] === Cell.dot &&
        others.every((o) => Math.abs(o.x - p.x) + Math.abs(o.y - p.y) > 3)
    const step =
        firstStepTo(game, me, dangerOf(game, margin), isDot) ??
        (margin > 0 ? firstStepTo(game, me, dangerOf(game, 0), isDot) : null) ??
        fleeStep(game, me)
    return step ? directionTo(me, step) : null
}

// The first direction from `from` along which one of `targets` is within
// `range` cells in a straight line, before any wall; null if none.
function lineTo(
    game: GameState,
    from: Vec2,
    targets: ReadonlySet<string>,
    range: number,
    minRange = 1
): DirectionAction | null {
    let best: { dir: DirectionAction; at: number } | null = null
    for (const dir of ACTIONS) {
        const d = DIRECTIONS[dir]
        let p = from
        for (let k = 1; k <= range; k++) {
            p = loopPos(game.cells, vec2(p.x + d.x, p.y + d.y))
            if (game.cells[p.y][p.x] === Cell.wall) break
            if (targets.has(key(p))) {
                if (k >= minRange && (!best || k < best.at)) {
                    best = { dir, at: k }
                }
                break
            }
        }
    }
    return best?.dir ?? null
}

// How far apart two cells are, as the crow flies, the short way round.
function apart(game: GameState, a: Vec2, b: Vec2): number {
    const cols = game.cells[0].length
    const rows = game.cells.length
    return Math.hypot(wrapDelta(a.x - b.x, cols), wrapDelta(a.y - b.y, rows))
}

const facingOf = (game: GameState, player: number): DirectionAction => {
    const f = game.players[player].breather.facing
    return directionTo(vec2(0, 0), f)
}

// ---- Brains ----

export type HunterOptions = {
    // Eat until the meter has this much, then hunt until it can't breathe.
    chargeTo: number
    // What to aim at: cells.
    targets: (game: GameState) => Vec2[]
    // How far away a target may be to line up on it, and how near (1
    // unless given).
    range: number
    minRange?: number
    // Whether a breath this tick does what the scene wants.
    wants: (look: Lookahead, view: View) => boolean
    // Which cells to line up from (any unless given).
    spot?: (game: GameState, p: Vec2) => boolean
    // Where to wait for a target to come into line when none is: a cell
    // and the way to face from it. Nowhere unless given.
    lure?: (game: GameState, p: Vec2) => DirectionAction | null
    // Breathe anyway (if it does anything) when a threat is this close.
    panic?: number
    // How many cells to keep off threats while eating.
    margin?: number
}

// Charges up on dots, then walks to a cell in line with a target, turns to
// it, and breathes as soon as the breath would do what `wants` asks.
export function hunter(options: HunterOptions): Brain {
    const { chargeTo, range, wants, panic = 1.2, margin = 1 } = options
    const minRange = options.minRange ?? 1
    const spot = options.spot ?? (() => true)
    const { lure } = options
    // The way to the nearest lure, or to face its way once there (by
    // stepping back out, to come in again facing it).
    const lureStep = (
        game: GameState,
        player: number,
        danger: Set<string>
    ): DirectionAction | null => {
        if (!lure) return null
        const me = game.players[player].character.pos
        const here = lure(game, me)
        if (here) {
            if (here === facingOf(game, player)) return null
            const back = DIRECTIONS[here]
            const out = loopPos(game.cells, vec2(me.x - back.x, me.y - back.y))
            return game.cells[out.y][out.x] === Cell.wall
                ? here
                : directionTo(me, out)
        }
        const step = firstStepTo(
            game,
            me,
            danger,
            (p) => lure(game, p) !== null
        )
        return step ? directionTo(me, step) : null
    }
    let hunting = false
    return (view) => {
        const { game, player } = view
        const me = game.players[player].character.pos
        const breather = game.players[player].breather
        if (breather.energy >= chargeTo) hunting = true
        if (!canBreathe(breather) && breather.energy < breather.breath.cost) {
            hunting = false
        }
        let dir: DirectionAction | null
        if (hunting) {
            const targets = new Set(options.targets(game).map(key))
            const line = spot(game, me)
                ? lineTo(game, me, targets, range, minRange)
                : null
            if (line) {
                // Lined up: face the target (a step towards it turns the
                // player), then wait for the breath to be worth it.
                dir = line === facingOf(game, player) ? null : line
            } else {
                const danger = dangerOf(game, margin)
                const step = firstStepTo(
                    game,
                    me,
                    danger,
                    (p) =>
                        spot(game, p) &&
                        lineTo(game, p, targets, range, minRange) !== null
                )
                dir = step
                    ? directionTo(me, step)
                    : (lureStep(game, player, danger) ?? eat(game, me, margin))
            }
        } else {
            dir = eat(game, me, margin)
        }
        if (!canBreathe(breather)) return { dir, breath: false }
        const look = view.tryBreath(dir)
        const scared = threatTo(game, player) <= panic
        const did = look.moments.some(
            (m) =>
                m.kind !== "breathed" &&
                m.kind !== "nearMiss" &&
                m.player === player
        )
        const breath = wants(look, view) || (scared && did)
        return { dir, breath }
    }
}

// The Skunk: charges up, waits at a junction (so the cloud spreads every
// way), breathes its cloud when a threat comes within `trigger` cells, then
// stands in it.
export function camper(trigger: number): Brain {
    let breathed = false
    return (view) => {
        const { game, player } = view
        const me = game.players[player].character.pos
        if (breathed) return IDLE
        const breather = game.players[player].breather
        if (!canBreathe(breather)) return { dir: eat(game, me), breath: false }
        const junction = (p: Vec2) => openNeighbours(game.cells, p).length >= 3
        if (!junction(me)) {
            const step = firstStepTo(game, me, dangerOf(game), junction)
            return {
                dir: step ? directionTo(me, step) : eat(game, me),
                breath: false,
            }
        }
        if (threatTo(game, player) <= trigger) {
            breathed = true
            return { dir: null, breath: true }
        }
        return IDLE
    }
}

// A wall the Boar could break from `cell` facing `dir`: an inner wall with
// open floor behind it.
type BreakSpot = { cell: Vec2; dir: DirectionAction; through: Vec2 }

function breakSpots(game: GameState, minShortcut: number): BreakSpot[] {
    const { cells } = game
    const rows = cells.length
    const cols = cells[0].length
    const open = (p: Vec2) => cells[p.y][p.x] !== Cell.wall
    const spots: BreakSpot[] = []
    for (let y = 1; y < rows - 1; y++) {
        for (let x = 1; x < cols - 1; x++) {
            const cell = vec2(x, y)
            if (!open(cell)) continue
            for (const dir of ACTIONS) {
                const d = DIRECTIONS[dir]
                const wall = vec2(x + d.x, y + d.y)
                const through = vec2(x + 2 * d.x, y + 2 * d.y)
                if (
                    wall.x <= 0 ||
                    wall.y <= 0 ||
                    wall.x >= cols - 1 ||
                    wall.y >= rows - 1 ||
                    open(wall) ||
                    !cells[through.y]?.[through.x] ||
                    !open(through)
                ) {
                    continue
                }
                // Only walls worth breaking: the way round is long.
                const round = firstStepDistance(game, cell, through)
                if (round >= minShortcut) spots.push({ cell, dir, through })
            }
        }
    }
    return spots
}

// Steps from `a` to `b` through open cells.
function firstStepDistance(game: GameState, a: Vec2, b: Vec2): number {
    const seen = new Map([[key(a), 0]])
    const queue = [a]
    for (let head = 0; head < queue.length; head++) {
        const p = queue[head]
        const d = seen.get(key(p))!
        if (samePos(p, b)) return d
        for (const n of openNeighbours(game.cells, p)) {
            if (seen.has(key(n))) continue
            seen.set(key(n), d + 1)
            queue.push(n)
        }
    }
    return Infinity
}

// The Boar: charges up, walks to the nearest wall worth breaking, waits
// there (facing it) for a threat to come within `trigger` cells or for
// `patience` ticks, breaks it and goes through.
export function breaker(trigger: number, patience: number): Brain {
    let spot: BreakSpot | null = null
    let waited = 0
    let broken = false
    return (view) => {
        const { game, player } = view
        const me = game.players[player].character.pos
        const breather = game.players[player].breather
        if (broken) {
            if (spot && !samePos(me, spot.through)) {
                const step = firstStepTo(game, me, new Set(), (p) =>
                    samePos(p, spot!.through)
                )
                if (step) return { dir: directionTo(me, step), breath: false }
            }
            spot = null
            return { dir: eat(game, me), breath: false }
        }
        if (!canBreathe(breather)) return { dir: eat(game, me), breath: false }
        if (!spot) {
            const spots = breakSpots(game, 8)
            spot =
                spots
                    .map((s) => ({ s, d: firstStepDistance(game, me, s.cell) }))
                    .sort((a, b) => a.d - b.d)[0]?.s ?? null
            if (!spot) return { dir: eat(game, me), breath: false }
        }
        const target = spot
        if (!samePos(me, target.cell)) {
            const step =
                firstStepTo(game, me, dangerOf(game), (p) =>
                    samePos(p, target.cell)
                ) ??
                firstStepTo(game, me, new Set(), (p) => samePos(p, target.cell))
            return { dir: step ? directionTo(me, step) : null, breath: false }
        }
        if (facingOf(game, player) !== target.dir) {
            return { dir: target.dir, breath: false }
        }
        waited++
        const ready = threatTo(game, player) <= trigger || waited >= patience
        if (!ready) return { dir: target.dir, breath: false }
        const look = view.tryBreath(target.dir)
        const breaks = look.moments.some((m) => m.kind === "wallBroken")
        if (breaks) broken = true
        return { dir: target.dir, breath: breaks }
    }
}

// Plays chicken: runs at the nearest threat until it is within `nerve`
// cells, then turns away and eats, keeping a cell off threats, until it
// has run `rest` ticks.
export function daredevil(nerve: number, rest: number): Brain {
    let calm = 0
    return (view) => {
        const { game, player } = view
        const me = game.players[player].character.pos
        if (threatTo(game, player) < nerve) calm = rest
        if (calm > 0) {
            calm--
            return { dir: eat(game, me, 1), breath: false }
        }
        const isThreat = (p: Vec2) =>
            threats(game).some((e) => samePos(e.pos, p))
        const step = firstStepTo(game, me, new Set(), isThreat)
        return {
            dir: step ? directionTo(me, step) : eat(game, me),
            breath: false,
        }
    }
}

// ---- Playing a scene ----

// One tick's input from every player's decision. `held` is what each held
// on the tick before (a direction is pressed when it changes).
function inputOf(
    decisions: readonly Decision[],
    held: readonly (DirectionAction | null)[]
): TickInput {
    return {
        wasPressed: (action, player = 0) => {
            const d = decisions[player]
            if (!d) return false
            if (action === "breath") return d.breath
            return d.dir === action && d.dir !== held[player]
        },
        move: (player = 0) => {
            const d = decisions[player] ?? IDLE
            const pressed = d.dir !== null && d.dir !== held[player]
            return {
                held: d.dir ? [DIRECTIONS[d.dir]] : [],
                pressed: d.dir && pressed ? DIRECTIONS[d.dir] : vec2(0, 0),
                breath: d.breath,
            }
        },
    }
}

// Play `def` from `seed` (its own unless given) and record it.
export function playScene(def: SceneDef, seed = def.seed): SceneRun {
    const start = startLevel(levels, def.level, def.animals, def.mode)
    if (start.kind !== "playing") throw new Error("Not playing")
    const rng = createRng(seed)
    const deps: FlowDeps = {
        levels,
        progress: emptyProgress(),
        dt: TICK_MS / 1000,
        random: rng.next,
    }
    const recorder = createRecorder(start, seed)
    const brains = def.brains()
    let screen: Screen = start
    let held: (DirectionAction | null)[] = brains.map(() => null)
    let tick = 0
    let keyTick: number | null = null
    let caught = false
    const moments: Moment[] = []
    const threats = [threatDistance(start)]
    while (
        (screen.kind === "playing" || screen.kind === "ending") &&
        (keyTick === null ? tick < def.maxTicks : tick < keyTick + def.tail)
    ) {
        const current = screen
        let decisions: Decision[] = []
        if (current.kind === "playing") {
            decisions = brains.map((brain, player) =>
                brain({
                    screen: current,
                    game: current.game,
                    player,
                    tick,
                    tryBreath: (dir) => {
                        const copy = cloneScreen(current) as Playing
                        const before = cloneScreen(current) as Playing
                        const state = rng.state
                        const tries = brains.map((_, i) =>
                            i === player ? { dir, breath: true } : IDLE
                        )
                        const after = update(copy, inputOf(tries, held), deps)
                        rng.state = state
                        const game = "game" in after ? after.game : copy.game
                        return {
                            moments: momentsOf(
                                before.game,
                                game,
                                game.events,
                                tick + 1
                            ),
                            before: before.game,
                            after: game,
                        }
                    },
                })
            )
        }
        const input = inputOf(decisions, held)
        const before =
            current.kind === "playing"
                ? (cloneScreen(current) as Playing).game
                : null
        const next = update(current, input, deps)
        if (shouldRecord(current, next)) recorder.add(input)
        held = decisions.map((d) => d.dir)
        tick++
        if (before && "game" in next) {
            const now = momentsOf(before, next.game, next.game.events, tick)
            moments.push(...now)
            for (const e of next.game.events) {
                if (e.type !== "playerCaught") continue
                caught = true
            }
            if (keyTick === null && def.isKey(now, next)) keyTick = tick
        }
        threats.push(threatDistance(next))
        screen = next
    }
    return {
        recording: recorder.finish(screen),
        moments,
        keyTick,
        caught,
        threats,
    }
}

// The score of a run (see SceneDef.score), -Infinity when it doesn't count.
export function scoreOf(def: SceneDef, run: SceneRun): number {
    if (run.keyTick === null || run.caught) return -Infinity
    return def.score(run)
}

// ---- The scenes ----

const enemyCells = (game: GameState) =>
    game.enemies
        .filter((e) => inPlay(e) && !hasStatus(e, "holds"))
        .map((e) => e.pos)

const bossCells = (game: GameState) =>
    game.boss && !game.boss.defeated ? footprint(game.boss.pos) : []

// Whether no boss could ever stand on `p`: no 2x2 block of floor holds it
// (the corridors and doors round the boss's arena).
const outOfBossReach = (game: GameState, p: Vec2) => {
    const floor = mapFloor(game.cells)
    return ![0, -1].some((dx) =>
        [0, -1].some((dy) => bossFits(floor, vec2(p.x + dx, p.y + dy)))
    )
}

// The doors into the boss's arena: cells out of its reach next to one it
// can stand on, facing in.
const bossDoor = (game: GameState, p: Vec2): DirectionAction | null => {
    if (!outOfBossReach(game, p)) return null
    for (const dir of ACTIONS) {
        const d = DIRECTIONS[dir]
        const q = loopPos(game.cells, vec2(p.x + d.x, p.y + d.y))
        if (game.cells[q.y][q.x] !== Cell.wall && !outOfBossReach(game, q)) {
            return dir
        }
    }
    return null
}

const count = (moments: readonly Moment[], kind: Moment["kind"]) =>
    moments.filter((m) => m.kind === kind).length

const at = (run: SceneRun, tick: number) =>
    run.moments.filter((m) => m.tick === tick)

// Fires at the boss from where it can't reach (see outOfBossReach) as soon
// as a breath would hit it.
const bossHunter = () =>
    hunter({
        chargeTo: 100,
        targets: bossCells,
        range: 5,
        spot: outOfBossReach,
        lure: bossDoor,
        wants: (look) =>
            look.moments.some(
                (m) => m.kind === "bossHit" || m.kind === "bossDefeated"
            ),
    })

export const SCENES: Readonly<Record<SceneName, SceneDef>> = {
    // A chase on the wrap maze: three enemies, and a dragon that only keeps
    // off their cells. The key moment is a threat within half a cell.
    hook: {
        level: 1,
        animals: ["dragon"],
        mode: "solo",
        seed: 1,
        brains: () => [daredevil(1.5, 90)],
        isKey: (_moments, screen) => threatDistance(screen) <= 0.9,
        tail: 60,
        maxTicks: 600,
        score: (run) => {
            const close = Math.min(...run.threats)
            return (1 - close) * 1000 - run.keyTick!
        },
    },
    // The fire down a corridor into an enemy, from as far as it reaches.
    dragon: {
        level: 0,
        animals: ["dragon"],
        mode: "solo",
        seed: 23,
        brains: () => [
            hunter({
                chargeTo: 50,
                targets: enemyCells,
                range: 5,
                minRange: 3,
                wants: (look, view) =>
                    look.moments.some(
                        (m) =>
                            m.kind === "enemyDefeated" &&
                            apart(
                                look.after,
                                m.at,
                                look.after.players[view.player].character.pos
                            ) >= 3
                    ),
            }),
        ],
        isKey: (moments) => count(moments, "enemyDefeated") > 0,
        tail: 75,
        maxTicks: 900,
        score: (run) => {
            const moments = at(run, run.keyTick!)
            const from = moments.find((m) => m.kind === "breathed")
            const kill = moments.find((m) => m.kind === "enemyDefeated")
            const length =
                from && kill
                    ? Math.hypot(kill.at.x - from.at.x, kill.at.y - from.at.y)
                    : 0
            return length * 100 - run.keyTick!
        },
    },
    // An ice cone over two enemies on the ice rink.
    penguin: {
        level: 2,
        animals: ["penguin"],
        mode: "solo",
        seed: 53,
        brains: () => [
            hunter({
                chargeTo: 50,
                targets: enemyCells,
                range: 3,
                wants: (look) => count(look.moments, "enemyFrozen") >= 2,
                panic: 1.6,
            }),
        ],
        isKey: (moments) => count(moments, "enemyFrozen") > 0,
        tail: 150,
        maxTicks: 900,
        score: (run) =>
            count(at(run, run.keyTick!), "enemyFrozen") * 500 - run.keyTick!,
    },
    // The gust throwing an enemy back just before it catches the owl.
    owl: {
        level: 0,
        animals: ["owl"],
        mode: "solo",
        seed: 4,
        brains: () => [
            hunter({
                chargeTo: 25,
                targets: enemyCells,
                range: 5,
                wants: (look, view) =>
                    look.moments.some(
                        (m) =>
                            m.kind === "enemyBlown" &&
                            m.enemy !== undefined &&
                            apart(
                                look.before,
                                look.before.enemies[m.enemy].pos,
                                look.before.players[view.player].character.pos
                            ) <= 2
                    ),
            }),
        ],
        isKey: (moments) => count(moments, "enemyBlown") > 0,
        tail: 75,
        maxTicks: 900,
        score: (run) =>
            count(at(run, run.keyTick!), "enemyBlown") * 400 - run.keyTick!,
    },
    // The stink cloud, enemies coming at it and turning back.
    skunk: {
        level: 0,
        animals: ["skunk"],
        mode: "solo",
        seed: 3,
        brains: () => [camper(1.6)],
        isKey: (moments) => count(moments, "enemyRepelled") > 0,
        tail: 150,
        maxTicks: 900,
        score: (run) => {
            const key = run.keyTick!
            const later = run.moments.filter(
                (m) =>
                    m.kind === "enemyRepelled" &&
                    m.tick >= key &&
                    m.tick < key + 150
            )
            const enemies = new Set(later.map((m) => m.enemy)).size
            return enemies * 300 + later.length * 20 - key
        },
    },
    // A wall broken with an enemy on the boar's heels.
    boar: {
        level: 0,
        animals: ["boar"],
        mode: "solo",
        seed: 21,
        brains: () => [breaker(3.5, 240)],
        isKey: (moments) => count(moments, "wallBroken") > 0,
        tail: 120,
        maxTicks: 1200,
        score: (run) => {
            const close = run.threats[run.keyTick!]
            return (5 - Math.min(close, 5)) * 100 - run.keyTick!
        },
    },
    // Two dragons wearing the boss down from the doors, breath after breath.
    boss: {
        level: 4,
        animals: ["dragon", "dragon"],
        mode: "coop",
        seed: 1,
        brains: () => [bossHunter(), bossHunter()],
        isKey: (moments) => count(moments, "bossDefeated") > 0,
        tail: 90,
        maxTicks: 60 * 90,
        score: (run) => -run.keyTick!,
    },
}

// Seeds 1 to `n`, best first, with their scores (for picking a scene's
// seed).
export function searchSeeds(
    def: SceneDef,
    n: number
): { seed: number; score: number; keyTick: number | null }[] {
    const results = []
    for (let seed = 1; seed <= n; seed++) {
        const run = playScene(def, seed)
        results.push({ seed, score: scoreOf(def, run), keyTick: run.keyTick })
    }
    return results.sort((a, b) => b.score - a.score)
}
