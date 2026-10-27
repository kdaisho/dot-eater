import {
    AiType,
    RESPAWN_DELAY,
    SPLITTER_HALF_SPEED,
    type CharacterId,
} from "./constants"
import { createCharacter, type Character } from "./character"
import type { GameState } from "./game"
import { distanceMap, openNeighbours } from "./path"
import { samePos, vec2, type Vec2 } from "./vec2"

// The Splitter (AiType.splitter): an enemy that a defeating breath splits in
// two instead of defeating. Pure, no DOM.
//
// A Splitter owns two enemy slots, next to each other in GameState.enemies,
// so a split never needs more enemies than there are ENEMY_IDS (parseLevel
// counts a Splitter as two). The first slot ("main") is the Splitter itself;
// the second ("spare") is out of play, with no timer (GONE), until a split.
//
// - Whole: the main slot is in play at the Splitter's own speed and chases;
//   the spare is GONE.
// - Split: a breath's defeat (defeatEnemy in breath.ts) on the whole
//   Splitter scores DEFEAT_POINTS and turns both slots into halves, in play
//   at SPLITTER_HALF_SPEED, spreading out from the Splitter's cell (see
//   spread). Halves chase too, are drawn smaller, and don't split again.
// - A half defeated: DEFEAT_POINTS, and it is GONE (at its spawn), with no
//   respawn of its own. Once both halves are gone, the main slot is whole
//   again and waits out RESPAWN_DELAY at the spawn like any defeated enemy,
//   blinking before it is back.
// - A lost life: whatever it was, it is back whole at its spawn and the
//   spare is GONE (see resetSplitter).
//
// Everything else (statuses, pushes, tile effects, collisions) treats each
// slot in play like any other enemy.

export type SplitterPart = {
    slot: "main" | "spare"
    // Whether this slot is a half now. The spare is a half whenever it is in
    // play.
    half: boolean
    // The whole Splitter's speed (the level's, or the default), for when it
    // is whole again.
    wholeSpeed: number
}

// Character.respawnIn for a slot that is out of play with no timer: it
// never counts down to 0 (see tickEffects in breath.ts).
export const GONE = Infinity

// A whole Splitter at `pos` and its spare slot, with the enemy ids for the
// two slots.
export function createSplitter(
    ids: readonly [CharacterId, CharacterId],
    pos: Vec2,
    speed?: number
): [Character, Character] {
    const main = createCharacter(
        ids[0],
        vec2(pos.x, pos.y),
        AiType.splitter,
        speed
    )
    const spare = createCharacter(
        ids[1],
        vec2(pos.x, pos.y),
        AiType.splitter,
        SPLITTER_HALF_SPEED
    )
    main.part = { slot: "main", half: false, wholeSpeed: main.speed }
    spare.part = { slot: "spare", half: true, wholeSpeed: main.speed }
    spare.respawnIn = GONE
    return [main, spare]
}

export function isWholeSplitter(enemy: Character): boolean {
    return enemy.part?.half === false
}

export function isSplitterHalf(enemy: Character): boolean {
    return enemy.part?.half === true
}

// The main and spare slots of the Splitter whose slot is at `i` in
// state.enemies.
function slots(state: GameState, i: number): [Character, Character] {
    const enemy = state.enemies[i]
    return enemy.part?.slot === "spare"
        ? [state.enemies[i - 1], enemy]
        : [enemy, state.enemies[i + 1]]
}

// Split the whole Splitter at `i` (its main slot) into two halves. Called by
// defeatEnemy, which scores it. The halves start where the Splitter was,
// with no statuses, and spread out (see spread).
export function splitSplitter(state: GameState, i: number) {
    const [main, spare] = slots(state, i)
    spare.pos = vec2(main.pos.x, main.pos.y)
    spare.lastPos = vec2(main.lastPos.x, main.lastPos.y)
    spare.moveProgress = main.moveProgress
    for (const half of [main, spare]) {
        half.part!.half = true
        half.speed = SPLITTER_HALF_SPEED
        half.statuses = []
        half.respawnIn = 0
    }
    spread(state, [main, spare])
}

// Send the two halves, both on the Splitter's cell, to two different open
// neighbouring cells, so they don't start as one stacked sprite: the two
// farthest from the player (the nearer one, with two) by path (direction
// order on ties), never a player's cell or the one it is gliding out of
// (lastPos). So the player who
// just breathed gets a moment's room where the maze allows it (in a corridor
// one half still comes its way). Each half glides out from the Splitter's
// cell as if it had just moved there, so the no-reverse rule keeps them
// going apart.
//
// A split never catches the player, on the split tick or right after. The
// player's drawn path this tick runs along its latest move, lastPos to pos
// (plus under a tick's glide before lastPos), so any other cell's centre is
// about 0.8 or more from it, beyond CATCH_DISTANCE: halves resting on their
// cells, or gliding out from a Splitter's cell that is neither, keep clear.
// If the Splitter stood on either of the player's cells (its sprite still
// gliding in), gliding out from there would start on top of the player and
// catch at once, so the halves start at rest on their new cells instead. A
// half left without a cell of its own (a dead end) goes onto the other
// half's, at rest, rather than staying as the Splitter was, which could
// glide on into the player. With no free neighbour at all (the Splitter in
// a dead end the player walked in after it), the halves go to the nearest
// free cells further out (see freeCells), at rest. Halves at rest start
// with no progress, so they wait a whole move before coming after the
// player.
function spread(state: GameState, halves: readonly Character[]) {
    const { cells } = state
    const at = vec2(halves[0].pos.x, halves[0].pos.y)
    const maps = state.players.map((p) => distanceMap(cells, p.character.pos))
    // With two players, a cell is as far as the nearer of them.
    const fromPlayer = (v: Vec2) => Math.min(...maps.map((m) => m[v.y][v.x]))
    const { free, next } = freeCells(state, at)
    const targets = free.sort((a, b) => fromPlayer(b) - fromPlayer(a) || 0)
    if (targets.length === 0) return
    const glide = next && !playerCell(state, at)
    halves.forEach((half, k) => {
        const to = targets[k] ?? targets[0]
        const from = glide && targets[k] ? at : to
        half.lastPos = vec2(from.x, from.y)
        half.pos = vec2(to.x, to.y)
        half.moveProgress = 0
    })
}

// Whether `cell` is any player's cell or the one it is gliding out of.
function playerCell(state: GameState, cell: Vec2): boolean {
    return state.players.some(
        ({ character: c }) => samePos(cell, c.pos) || samePos(cell, c.lastPos)
    )
}

// The open cells nearest `at` by path that aren't the player's (see
// playerCell), in direction order: its free neighbours, or if it has none,
// the free cells at the first distance that has any. `next` is whether they
// are neighbours. Empty only if every cell `at` can reach is the player's.
function freeCells(
    state: GameState,
    at: Vec2
): { free: Vec2[]; next: boolean } {
    const { cells } = state
    const seen = [at]
    let ring = [at]
    for (let next = true; ring.length > 0; next = false) {
        ring = ring
            .flatMap((pos) => openNeighbours(cells, pos))
            .filter((v) => {
                if (seen.some((s) => samePos(s, v))) return false
                seen.push(v)
                return true
            })
        const free = ring.filter((v) => !playerCell(state, v))
        if (free.length > 0) return { free, next }
    }
    return { free: [], next: false }
}

// The half at `i` was defeated (defeatEnemy has scored it and sent it to
// its spawn): it is GONE. Once both halves are, the Splitter is whole again
// in its main slot and back after RESPAWN_DELAY.
export function halfDefeated(state: GameState, i: number) {
    state.enemies[i].respawnIn = GONE
    const [main, spare] = slots(state, i)
    if (main.respawnIn > 0 && spare.respawnIn > 0) {
        makeWhole(main)
        main.respawnIn = RESPAWN_DELAY
    }
}

// After a lost life, which puts every enemy back in play at its spawn (see
// respawn in game.ts): a Splitter's main slot is whole again and its spare
// out of play. Does nothing to other enemies.
export function resetSplitter(enemy: Character) {
    if (!enemy.part) return
    if (enemy.part.slot === "main") makeWhole(enemy)
    else enemy.respawnIn = GONE
}

function makeWhole(main: Character) {
    main.part!.half = false
    main.speed = main.part!.wholeSpeed
}
