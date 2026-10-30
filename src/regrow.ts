import { inPlay } from "./breath"
import { inFootprint } from "./boss"
import { Cell } from "./constants"
import { emit } from "./events"
import type { GameState } from "./game"
import type { Cells, RegrowRule } from "./level"
import { samePos, vec2, type Vec2 } from "./vec2"

// Regrowing dots (KDA-269, the level rule rules.regrowDots): an eaten dot
// grows back on its own cell after the rule's seconds, so a boss fight
// never runs out of the dots that fill the breath meters. Pure, no DOM:
// time comes in as `dt`.
//
// - Only the map's dots regrow: the cells that held a dot when the game
//   started (player 2's spawn, cleared for a 2-player game, isn't one). A
//   dot put on any other cell later doesn't.
// - It counts from the tick the dot is eaten. Once due, it waits until its
//   cell is clear of characters (see occupied) and grows back on the first
//   tick it is, so a dot never appears under a player (who would never eat
//   it: eating is moving onto a cell), an enemy or the boss.
// - A grown dot is an ordinary dot: eating it scores, fills energy, counts
//   toward Player.dots and starts its regrowth again.

export type Regrow = {
    // Seconds an eaten dot takes to grow back.
    seconds: number
    // [y][x]: whether the cell held one of the map's dots at the start.
    home: readonly (readonly boolean[])[]
    // The eaten dots waiting to grow back, in the order they were eaten:
    // where, and the seconds left (0 once due, while its cell isn't clear).
    pending: { at: Vec2; left: number }[]
}

// The regrowth for a game whose dots start as `cells`, by the level's
// `rule`, or null for a level without the rule.
export function createRegrow(
    rule: RegrowRule | undefined,
    cells: Cells
): Regrow | null {
    if (!rule) return null
    return {
        seconds: rule.seconds,
        home: cells.map((row) => row.map((c) => c === Cell.dot)),
        pending: [],
    }
}

// A dot was eaten on `cell`: if it is one of the map's dots, it starts
// growing back. Called by eatDot in game.ts.
export function dotGone(state: GameState, cell: Vec2) {
    const { regrow } = state
    if (!regrow?.home[cell.y]?.[cell.x]) return
    if (regrow.pending.some((p) => samePos(p.at, cell))) return
    regrow.pending.push({ at: vec2(cell.x, cell.y), left: regrow.seconds })
}

// Tolerance for a countdown reaching 0, so floating-point sums of dt still
// land on the intended tick.
const EPSILON = 1e-9

// Count every waiting dot down by `dt` seconds, and grow back those due
// whose cell is clear, each reporting a dotRegrown event.
export function tickRegrow(state: GameState, dt: number) {
    const { regrow } = state
    if (!regrow || regrow.pending.length === 0) return
    regrow.pending = regrow.pending.filter((p) => {
        p.left = Math.max(0, p.left - dt)
        if (p.left > EPSILON || occupied(state, p.at)) return true
        p.left = 0
        state.cells[p.at.y][p.at.x] = Cell.dot
        emit(state, { type: "dotRegrown", at: vec2(p.at.x, p.at.y) })
        return false
    })
}

// Whether a character is on `cell`, or drawn over it: a player in play, an
// enemy in play or a boss not defeated, on it (its footprint, for the boss)
// or gliding out of it.
export function occupied(state: GameState, cell: Vec2): boolean {
    const on = (c: { pos: Vec2; lastPos: Vec2; moveProgress: number }) =>
        samePos(c.pos, cell) || (c.moveProgress < 1 && samePos(c.lastPos, cell))
    if (state.players.some((p) => !p.out && on(p.character))) return true
    if (state.enemies.some((e) => inPlay(e) && on(e))) return true
    const { boss } = state
    return (
        boss !== null &&
        !boss.defeated &&
        (inFootprint(boss.pos, cell) ||
            (boss.moveProgress < 1 && inFootprint(boss.lastPos, cell)))
    )
}
