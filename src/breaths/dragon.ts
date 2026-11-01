import type { BreathDef, BreathHit, TileEffect } from "../breath"
import { loopPos } from "../level"
import { AnimalId } from "../roster"
import { allDirections, directions, samePos, vec2, type Vec2 } from "../vec2"

// Seconds the cells the fire passed keep burning.
const BURN_SECONDS = 2

// Burning cells keep enemies out; the player walks through them unharmed.
export const BURNING: TileEffect = {
    name: "dragon.burning",
    blocksEnemies: true,
    look: { color: "rgba(255, 110, 20, 0.45)", emoji: "🔥" },
}

// How far the fire spreads at charge `level`, in steps from the player: 3
// for a tap, one more a level, 7 at the top (KDA-289; placeholders to tune
// at preview).
export function fireRange(level: number): number {
    return level + 2
}

// Dragon 🐉, fire breath (KDA-216): fire that spreads down the corridors
// ahead (a spread shape), turning corners and splitting at junctions, and
// defeats every enemy it reaches; the cells it passed burn for 2 s and
// block enemies. Charging it (KDA-289) makes it spread further (fireRange),
// for 20 energy a level. Stat: balanced, the default character.
//
// It was a straight line that stopped at the first enemy; user feedback
// (2026-11-01) found a charged line worth little, since it only went
// straight ahead. It now spreads like the Skunk's cloud, but only forward.
//
// Fire can't go through an enemy (unlike the Owl's wind): each branch stops
// at the enemy it defeats, burning that enemy's cell, and cells it could
// only reach past one stay untouched. An enemy on the player's own cell
// (its sprite still gliding in) is the first hit, and then nothing burns,
// since the fire never left the player's cell. Facing a wall with no enemy
// on the player's cell there is nothing to burn, so the breath refuses and
// costs nothing.
export const dragon: BreathDef = {
    animal: AnimalId.dragon,
    shape: (level) => ({ kind: "spread", reach: fireRange(level) }),
    cost: 20,
    cooldown: 1,
    duration: BURN_SECONDS,
    maxEnergy: 100,
    speedScale: 1,
    // Embers flying along from each burning cell.
    particles: {
        colors: ["#f97316", "#fbbf24", "#dc2626"],
        count: 4,
        life: 0.5,
        speed: 2.5,
        spread: 1,
        size: 0.12,
        jitter: 0.2,
        drag: 2,
    },
    fire(hit) {
        const onPlayer = hit.enemies.find((e) => samePos(e.pos, hit.origin))
        if (onPlayer) {
            hit.defeat(onPlayer)
            return
        }
        if (hit.cells.length === 0) return false
        for (const cell of burnt(hit)) {
            for (const enemy of hit.enemies) {
                if (samePos(enemy.pos, cell)) hit.defeat(enemy)
            }
            hit.addTile(cell, BURNING, BURN_SECONDS)
        }
    },
}

// The cells the fire reaches, nearest first: the shape's cells it can walk
// to from the first without going through an enemy's cell (it burns that
// cell and goes no further that way).
function burnt(hit: BreathHit): Vec2[] {
    const { cells } = hit.state
    const inShape = new Set(hit.cells.map(key))
    const blocked = new Set(hit.enemies.map((e) => key(e.pos)))
    const first = hit.cells[0]
    const result = [first]
    const seen = new Set([key(first)])
    for (let head = 0; head < result.length; head++) {
        const p = result[head]
        if (blocked.has(key(p))) continue
        for (const dir of allDirections) {
            const step = directions[dir]
            const q = loopPos(cells, vec2(p.x + step.x, p.y + step.y))
            if (!inShape.has(key(q)) || seen.has(key(q))) continue
            seen.add(key(q))
            result.push(q)
        }
    }
    return result
}

const key = (p: Vec2) => `${p.x},${p.y}`
