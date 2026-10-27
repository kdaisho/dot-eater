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
// is drawn at pos. `rate` is a factor on its speed for this glide, as the
// game applies it (the player's GameState.playerRate, e.g. a faster slide),
// so frames between ticks keep up with the ticks.
export function glideT(character: Character, alpha: number, rate = 1): number {
    const { moveProgress, speed } = character
    if (moveProgress >= 1) return 1
    return Math.min(1, moveProgress + (alpha * speed * rate * TICK_MS) / 1000)
}

// How far through its glide the player must be for the dot it just ate to
// disappear: halfway, when the front edge of the sprite (SPRITE_SCALE 0.8 of
// a cell wide, centred) reaches the dot in the middle of the cell. Until then
// the dot is still drawn, so it is visibly eaten rather than vanishing a cell
// ahead of the player.
export const EAT_AT = 0.5

// Whether to still draw the dot eaten on the player's latest move
// (GameState.eatenAt, the player's pos): true while the player's glide
// towards it hasn't reached EAT_AT. `rate` as for glideT.
export function eatenDotVisible(
    player: Character,
    alpha: number,
    rate = 1
): boolean {
    return glideT(player, alpha, rate) < EAT_AT
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

// The offset `d` (cells, along an axis `size` cells long) taken the short
// way round: the copy of it, one map-width either way, nearest to 0. For a
// one-cell move across a tunnel (d = ±(size - 1)) that is the ∓1 step off the
// edge. Positions and offsets need not be whole cells.
export function wrapDelta(d: number, size: number): number {
    return d - size * Math.round(d / size)
}

// The position to draw a character at, in cell units. It may lie up to one
// cell outside the map while the character goes through a tunnel; draw it at
// every position wrapCopies returns, clipped to the map, so it slides off one
// edge and in from the opposite one. `rate` as for glideT.
export function glidePos(
    character: Character,
    alpha: number,
    cols: number,
    rows: number,
    rate = 1
): Vec2 {
    const { pos, lastPos } = character
    const back = 1 - glideT(character, alpha, rate)
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
