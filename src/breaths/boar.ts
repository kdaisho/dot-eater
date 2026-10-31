import type { BreathDef, TileEffect } from "../breath"
import { Cell } from "../constants"
import type { Cells } from "../level"
import { AnimalId } from "../roster"
import { vec2, type Vec2 } from "../vec2"

// Seconds a broken wall stays open before it grows back.
const OPEN_SECONDS = 10

// A broken wall: open floor (no dot) drawn as brown rubble until it grows
// back, pushing anyone inside out (opensWall in breath.ts).
export const BROKEN_WALL: TileEffect = {
    name: "boar.broken",
    opensWall: true,
    look: { color: "rgba(139, 90, 43, 0.6)" },
}

// Whether `pos` is on the map's border row or column. Those walls are the
// outer wall and never break: opening one would make a new wrap tunnel,
// possibly into a wall on the opposite edge.
export function isOuterWall(cells: Cells, pos: Vec2): boolean {
    return (
        pos.x === 0 ||
        pos.y === 0 ||
        pos.x === cells[0].length - 1 ||
        pos.y === cells.length - 1
    )
}

// The walls the Boar's breath at charge `level` breaks, from `wall`, the
// wall in front, on along `facing` (KDA-289, with the user): up to `level`
// walls in a row, a tunnel. It stops at an outer wall, which never breaks,
// and at open floor (an opened wall included), so open floor between walls
// ends the tunnel too. None when `wall` itself is an outer wall.
export function tunnel(
    cells: Cells,
    wall: Vec2,
    facing: Vec2,
    level: number
): Vec2[] {
    const walls: Vec2[] = []
    let p = wall
    // An inner wall is never on the border, so the next cell is on the map.
    while (
        walls.length < level &&
        cells[p.y][p.x] === Cell.wall &&
        !isOuterWall(cells, p)
    ) {
        walls.push(p)
        p = vec2(p.x + facing.x, p.y + facing.y)
    }
    return walls
}

// Boar 🐗, wall-break breath (KDA-220): breaks the wall in front; it grows
// back after 10 s, pushing out anything inside; outer walls hold. Charging
// it (KDA-289) bores on through the walls behind, one more a level, up to 5
// (see tunnel), for 20 energy a level; every broken wall grows back on its
// own 10 s. Refused (nothing spent) when there is no wall in front or it is
// an outer wall. Stat: slower movement (3.5 cells/s at the default 4).
export const boar: BreathDef = {
    animal: AnimalId.boar,
    shape: () => ({ kind: "line", range: 1 }),
    cost: 20,
    cooldown: 1,
    duration: OPEN_SECONDS,
    maxEnergy: 100,
    speedScale: 0.875,
    // Chunks of rubble thrown up from the broken wall, falling back.
    particles: {
        colors: ["#8b5a2b", "#57534e", "#a8a29e"],
        count: 10,
        life: 0.6,
        speed: 3,
        spread: Math.PI * 2,
        size: 0.14,
        jitter: 0.3,
        gravity: 8,
        shape: "square",
    },
    wallsHit: tunnel,
    fire(hit) {
        if (hit.walls.length === 0) return false
        for (const wall of hit.walls) {
            hit.addTile(wall, BROKEN_WALL, OPEN_SECONDS)
        }
    },
}
