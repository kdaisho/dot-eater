import type { BreathDef, TileEffect } from "../breath"
import { inFootprint } from "../boss"
import { Cell } from "../constants"
import type { Cells } from "../level"
import { AnimalId } from "../roster"
import { samePos, vec2, type Vec2 } from "../vec2"

// Seconds a broken wall stays open before it grows back.
const OPEN_SECONDS = 10

// A broken wall: open floor (no dot) drawn as the stage's rubble tile (see
// tiles.ts) until it grows back, pushing anyone inside out (opensWall in
// breath.ts).
export const BROKEN_WALL: TileEffect = {
    name: "boar.broken",
    opensWall: true,
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

// The walls the Boar's Rush at charge `level` breaks, from `wall`, the
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

// How far the Rush dashes at charge `level` (KDA-304, with the user: the
// shortest reach of every breath; placeholders to tune at preview): 1 cell
// for a tap, 2 at levels 2 and 3, 3 at levels 4 and 5. The Dragon's is 2
// to 6.
export function rushRange(level: number): number {
    return Math.ceil((level + 1) / 2)
}

// How far an enemy the Rush rams is knocked flying at charge `level`
// (KDA-304; placeholders to tune at preview): 2 cells for a tap, one more
// a level, 6 at the top. It is defeated wherever it slams, so this only
// sets how far the chain in front of it is shoved.
export function knockDistance(level: number): number {
    return level + 1
}

// The share of a direct ram's damage the boss takes when the chain of a
// knocked-flying enemy runs into it instead (KDA-304, with the user: a
// little; a placeholder to tune at preview).
export const CHAIN_BOSS_SHARE = 0.25

// Seconds the boss is staggered (makes no move) after being rammed, so the
// Boar, right against it, has a moment to back off (KDA-304; a
// placeholder to tune at preview).
export const RAM_STAGGER = 0.6

// Boar, Rush (KDA-304, with the user, replacing the wall-break breath of
// KDA-220, after feedback that the Boar was too weak to defeat the bosses:
// it had to stand touching them to hurt them at all). The Boar dashes
// forward along its facing, up to rushRange cells, eating the dots it
// passes, and stops at the first thing it hits:
//
// - an enemy: the Boar stops on the cell before it and the enemy (with any
//   others on its cell) is knocked flying knockDistance cells on and
//   defeated where it slams, shoving what is in its way along (see
//   knock.ts). One on the Boar's own cell is rammed where it stands;
// - the boss's body: the Boar stops against it, the boss takes the
//   breath's damage as any breath's (the engine's, by the energy spent) and
//   is staggered for RAM_STAGGER;
// - an inner wall: it breaks, as the old breath's did (see tunnel: a wall a
//   level in a row, the outer wall holds, each grows back after 10 s), and
//   the Boar carries on into the opening as far as its reach goes;
// - an outer wall: it thuds against it.
//
// Refused (nothing spent) when it can go nowhere and hit nothing: facing an
// outer wall right in front, say. 20 energy a level, as before. Stat:
// slower movement (3.5 cells/s at the default 4).
export const boar: BreathDef = {
    animal: AnimalId.boar,
    shape: (level) => ({
        kind: "line",
        range: rushRange(level),
        stopsAtEnemies: true,
    }),
    cost: 20,
    cooldown: 1,
    duration: OPEN_SECONDS,
    maxEnergy: 100,
    speedScale: 0.875,
    // Dust and chunks kicked up along the dash (or from the walls it broke,
    // when it broke in from right against them), falling back.
    particles: {
        colors: ["#8b5a2b", "#a16207", "#a8a29e"],
        count: 6,
        life: 0.5,
        speed: 2.5,
        spread: Math.PI * 0.8,
        size: 0.13,
        jitter: 0.35,
        gravity: 6,
        shape: "square",
    },
    wallsHit: tunnel,
    fire(hit) {
        const { state, facing, level, cells } = hit
        const boss = state.boss && !state.boss.defeated ? state.boss : null
        const first = hit.enemies[0]
        // The line ends at what it rams (see stopsAtEnemies): an enemy, or
        // the boss's body.
        const end = cells[cells.length - 1]
        const target = first
            ? first.pos
            : end && boss && inFootprint(boss.pos, end)
              ? end
              : null
        if (target) {
            const at = cells.findIndex((c) => samePos(c, target))
            const free = at < 0 ? [] : cells.slice(0, at)
            hit.dash(free, target)
            if (first) {
                const rammed = hit.enemies.filter((e) =>
                    samePos(e.pos, first.pos)
                )
                hit.knock(
                    rammed,
                    facing,
                    knockDistance(level),
                    CHAIN_BOSS_SHARE
                )
            } else {
                hit.staggerBoss(RAM_STAGGER)
            }
            return
        }
        if (hit.walls.length > 0) {
            for (const wall of hit.walls) {
                hit.addTile(wall, BROKEN_WALL, OPEN_SECONDS)
            }
            const into = hit.walls.slice(0, rushRange(level) - cells.length)
            hit.dash([...cells, ...into], hit.walls[0])
            return
        }
        if (cells.length === 0) return false
        hit.dash(cells, hit.wall)
    },
}
