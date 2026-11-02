import { hasStatus, inPlay } from "../../src/breath"
import { squareDistance } from "../../src/boss"
import type { GameEvent } from "../../src/events"
import { gameOf, type Screen, type ScreenKind } from "../../src/flow"
import { drawnPos } from "../../src/game"
import { wrapDelta } from "../../src/glide"
import { stages as levels } from "../../src/levels"
import { createReplayer, type Recording, type Replayer } from "../../src/replay"
import { vec2 } from "../../src/vec2"
import type { PlayerTrack } from "./camera"

// One replayer and one run log per recording, kept for as long as the
// recording object lives, so every clip and frame of a render tab shares
// them instead of replaying from the start.

const replayers = new WeakMap<Recording, Replayer>()
const runs = new WeakMap<Recording, RunLog>()

export function replayerFor(recording: Recording): Replayer {
    let replayer = replayers.get(recording)
    if (!replayer) {
        replayer = createReplayer(recording, levels)
        replayers.set(recording, replayer)
    }
    return replayer
}

// What happened on each tick of a run, for the cameras, the effects and
// the close calls: everything the video needs from the whole run, gathered
// in one replay from start to end.
export type RunLog = {
    // Where the players are on every tick (see PlayerTrack).
    track: PlayerTrack
    // ticks[k]: after k ticks (ticks[0] is the start).
    ticks: readonly TickLog[]
}

export type TickLog = {
    kind: ScreenKind
    // The players' health, added up: a close call costs none.
    health: number
    // How close the nearest threat came to player 1 (see threatDistance).
    threat: number
    // What the game step of tick k reported (see events.ts): empty when
    // tick k didn't step the game (the outro, or ticks[0]).
    events: readonly GameEvent[]
    // Whether tick k moved the effects on, as main's tick() does: a step
    // that didn't pause, or the outro's settle.
    moved: boolean
}

// The run log of `recording`, built on first use with a replayer of its
// own (so it doesn't move the shared one back and forth).
export function runOf(recording: Recording): RunLog {
    let run = runs.get(recording)
    if (!run) {
        run = buildRun(recording)
        runs.set(recording, run)
    }
    return run
}

function buildRun(recording: Recording): RunLog {
    const replayer = createReplayer(recording, levels)
    const players: PlayerTrack["ticks"][number][] = []
    const moving: boolean[] = []
    const ticks: TickLog[] = []
    let board = { cols: 0, rows: 0 }
    let prev: Screen | undefined
    for (let k = 0; k <= replayer.length; k++) {
        const screen = replayer.at(k)
        const game = gameOf(screen)
        if (!game) throw new Error(`No game after ${k} ticks`)
        board = { cols: game.cells[0]?.length ?? 0, rows: game.cells.length }
        players.push(
            game.players.map(({ character, rate }) => ({
                pos: character.pos,
                lastPos: character.lastPos,
                moveProgress: character.moveProgress,
                speed: character.speed,
                rate,
            }))
        )
        moving.push(screen.kind === "playing" || screen.kind === "ending")
        // The outro doesn't clear the last step's events (see events.ts),
        // so only a tick taken in play has events of its own.
        const stepped = prev?.kind === "playing"
        ticks.push({
            kind: screen.kind,
            health: game.players.reduce((sum, p) => sum + p.health, 0),
            threat: threatDistance(screen),
            events: stepped ? game.events : [],
            moved:
                prev?.kind === "ending" ||
                (stepped && screen.kind !== "paused"),
        })
        prev = screen
    }
    return { track: { board, ticks: players, moving }, ticks }
}

// Where the players are on every tick of `recording`, for cameras that
// follow them.
export function trackOf(recording: Recording): PlayerTrack {
    return runOf(recording).track
}

// How close the nearest thing that can catch player 1 is, in cells
// (between where they are drawn at the tick), on a screen: the enemies in
// play that can catch (not defeated and waiting to respawn, and not made
// harmless, e.g. frozen; see caughtBy in game.ts), measured centre to
// centre, and the boss, unless defeated, measured to the square its
// footprint's cell centres span (as the game catches). Infinity outside
// `playing` (nothing catches in the outro or on end screens) and while
// player 1 is out.
export function threatDistance(screen: Screen): number {
    if (screen.kind !== "playing") return Infinity
    const { game } = screen
    const me = game.players[0]
    if (!me || me.out) return Infinity
    const cols = game.cells[0]?.length ?? 0
    const rows = game.cells.length
    const p = drawnPos(me.character, cols, rows)
    let best = Infinity
    for (const enemy of game.enemies) {
        if (!inPlay(enemy) || hasStatus(enemy, "harmless")) continue
        const e = drawnPos(enemy, cols, rows)
        const d = Math.hypot(
            wrapDelta(e.x - p.x, cols),
            wrapDelta(e.y - p.y, rows)
        )
        best = Math.min(best, d)
    }
    const { boss } = game
    if (boss && !boss.defeated) {
        const b = drawnPos(boss, cols, rows)
        // Player 1 relative to the boss's top-left cell.
        const r = vec2(wrapDelta(p.x - b.x, cols), wrapDelta(p.y - b.y, rows))
        best = Math.min(best, squareDistance(r, r))
    }
    return best
}

export type NearMiss = {
    // The tick a threat came closest.
    tick: number
    // How close, in cells (see threatDistance).
    distance: number
}

// The run's close calls, closest first: moments a threat (see
// threatDistance) came within `within` cells of player 1 in play and no
// life was lost in the `grace` ticks after. Good spots for slow motion.
// Only the closest tick of each pass counts, and passes less than `gap`
// ticks apart count once.
export function nearMisses(
    recording: Recording,
    options: { within?: number; grace?: number; gap?: number } = {}
): NearMiss[] {
    return closeCalls(runOf(recording).ticks, options)
}

// nearMisses over a run log's ticks.
export function closeCalls(
    ticks: readonly Pick<TickLog, "threat" | "health">[],
    { within = 1.5, grace = 30, gap = 60 } = {}
): NearMiss[] {
    const closest = ticks.map((t) => t.threat)
    const health = ticks.map((t) => t.health)
    const misses: NearMiss[] = []
    for (let k = 1; k < closest.length - 1; k++) {
        const d = closest[k]
        if (d > within || d > closest[k - 1] || d > closest[k + 1]) continue
        const after = health[Math.min(k + grace, health.length - 1)]
        if (after < health[k]) continue
        const last = misses.at(-1)
        if (last && k - last.tick < gap) {
            if (d < last.distance)
                misses[misses.length - 1] = { tick: k, distance: d }
            continue
        }
        misses.push({ tick: k, distance: d })
    }
    return misses.sort((a, b) => a.distance - b.distance)
}

// The maze size of `recording`'s stage.
export function boardOf(recording: Recording) {
    const level = levels[recording.level]?.[recording.difficulty]
    if (!level) throw new Error(`No level ${recording.level}`)
    return { cols: level.width, rows: level.height }
}
