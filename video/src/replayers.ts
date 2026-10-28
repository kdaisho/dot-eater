import { gameOf } from "../../src/flow"
import { glidePos, wrapDelta } from "../../src/glide"
import { levels } from "../../src/levels"
import { createReplayer, type Recording, type Replayer } from "../../src/replay"
import type { PlayerTrack } from "./camera"

// One replayer and one player track per recording, kept for as long as the
// recording object lives, so every clip and frame of a render tab shares
// them instead of replaying from the start.

const replayers = new WeakMap<Recording, Replayer>()
const tracks = new WeakMap<Recording, PlayerTrack>()

export function replayerFor(recording: Recording): Replayer {
    let replayer = replayers.get(recording)
    if (!replayer) {
        replayer = createReplayer(recording, levels)
        replayers.set(recording, replayer)
    }
    return replayer
}

// Where the players are on every tick of `recording`, for cameras that
// follow them. Built by replaying it once from start to end with a replayer
// of its own (so it doesn't move the shared one back and forth).
export function trackOf(recording: Recording): PlayerTrack {
    let track = tracks.get(recording)
    if (!track) {
        const replayer = createReplayer(recording, levels)
        const ticks: PlayerTrack["ticks"][number][] = []
        let board = { cols: 0, rows: 0 }
        for (let k = 0; k <= replayer.length; k++) {
            const game = gameOf(replayer.at(k))
            if (!game) throw new Error(`No game after ${k} ticks`)
            board = {
                cols: game.cells[0]?.length ?? 0,
                rows: game.cells.length,
            }
            ticks.push(
                game.players.map(({ character, rate }) => ({
                    pos: character.pos,
                    lastPos: character.lastPos,
                    moveProgress: character.moveProgress,
                    speed: character.speed,
                    rate,
                }))
            )
        }
        track = { board, ticks }
        tracks.set(recording, track)
    }
    return track
}

export type NearMiss = {
    // The tick an enemy came closest.
    tick: number
    // How close, in cells, between sprite centres.
    distance: number
}

// The run's close calls, closest first: moments an enemy in play came within
// `within` cells of player 1 and no life was lost in the `grace` ticks
// after. Good spots for slow motion. Only the closest tick of each pass
// counts, and passes less than `gap` ticks apart count once.
export function nearMisses(
    recording: Recording,
    { within = 1.5, grace = 30, gap = 60 } = {}
): NearMiss[] {
    const replayer = createReplayer(recording, levels)
    const closest: number[] = []
    const lives: number[] = []
    for (let k = 0; k <= replayer.length; k++) {
        const game = gameOf(replayer.at(k))
        if (!game) throw new Error(`No game after ${k} ticks`)
        const cols = game.cells[0]?.length ?? 0
        const rows = game.cells.length
        const me = game.players[0]
        const p = glidePos(me.character, 0, cols, rows, me.rate)
        let best = Infinity
        for (const enemy of game.enemies) {
            if (enemy.respawnIn > 0) continue
            const e = glidePos(enemy, 0, cols, rows)
            const d = Math.hypot(
                wrapDelta(e.x - p.x, cols),
                wrapDelta(e.y - p.y, rows)
            )
            best = Math.min(best, d)
        }
        closest.push(best)
        lives.push(game.lives)
    }
    const misses: NearMiss[] = []
    for (let k = 1; k < closest.length - 1; k++) {
        const d = closest[k]
        if (d > within || d > closest[k - 1] || d > closest[k + 1]) continue
        const after = lives[Math.min(k + grace, lives.length - 1)]
        if (after < lives[k]) continue
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
    const level = levels[recording.level]
    if (!level) throw new Error(`No level ${recording.level}`)
    return { cols: level.width, rows: level.height }
}
