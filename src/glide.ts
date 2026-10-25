import { TICK_MS } from "./constants"
import type { Character } from "./character"
import { vec2, type Vec2 } from "./vec2"

// Where to draw a character between cells. Pure maths, no DOM, so the
// renderer's animation can be unit-tested.

// How far through its latest move (lastPos -> pos) a character should be
// drawn, from 0 (at lastPos) to 1 (at pos).
//
// moveProgress is the progress towards the *next* move, and it drops to ~0 the
// tick a move happens, so it also tells how far the character has got since
// arriving at pos. Drawing it that far behind pos makes it glide one cell per
// move and lag at most one cell behind the logic. `alpha` in [0, 1) adds the
// part of the next tick that has already passed, for smooth frames between
// ticks. A resting character (progress 1: idle, blocked or waiting to move)
// is drawn at pos.
export function glideT(character: Character, alpha: number): number {
    const { moveProgress, speed } = character
    if (moveProgress >= 1) return 1
    return Math.min(1, moveProgress + (alpha * speed * TICK_MS) / 1000)
}

// The unit step of a character's latest move. A move across a wrap-around
// tunnel (lastPos on the opposite edge) is the one-cell step off that edge,
// not a slide back across the whole map.
export function moveStep(lastPos: Vec2, pos: Vec2, cols: number, rows: number) {
    return vec2(
        wrapDelta(pos.x - lastPos.x, cols),
        wrapDelta(pos.y - lastPos.y, rows)
    )
}

function wrapDelta(d: number, size: number): number {
    if (d > 1) return d - size
    if (d < -1) return d + size
    return d
}

// The position to draw a character at, in cell units. It may lie up to one
// cell outside the map while the character goes through a tunnel; draw it at
// every position wrapCopies returns, clipped to the map, so it slides off one
// edge and in from the opposite one.
export function glidePos(
    character: Character,
    alpha: number,
    cols: number,
    rows: number
): Vec2 {
    const { pos, lastPos } = character
    const back = 1 - glideT(character, alpha)
    const d = moveStep(lastPos, pos, cols, rows)
    return vec2(pos.x - d.x * back, pos.y - d.y * back)
}

// `p` plus, when it pokes over an edge of a cols x rows map, its copy shifted
// to the opposite edge. Both halves together show one whole character.
export function wrapCopies(p: Vec2, cols: number, rows: number): Vec2[] {
    const copies = [p]
    const dx = p.x < 0 ? cols : p.x > cols - 1 ? -cols : 0
    const dy = p.y < 0 ? rows : p.y > rows - 1 ? -rows : 0
    if (dx !== 0 || dy !== 0) copies.push(vec2(p.x + dx, p.y + dy))
    return copies
}
