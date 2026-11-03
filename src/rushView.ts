import type { GameEvent, ShovedCar } from "./events"
import type { GameState } from "./game"
import { moveStep, wrapDelta } from "./glide"
import { samePos, vec2, type Vec2 } from "./vec2"

// How the Boar's Rush looks as it lands (KDA-307). Visual only, pure, no
// DOM: time comes in as `dt`, like the particles (particles.ts), and
// nothing in the game reads it.
//
// The game has done with a Rush on the tick it is let go (knock.ts): the
// Boar is on its new cell, gliding there in DASH_SECONDS (dashPlayer in
// game.ts), and what it rammed has flown, slammed and been defeated, the
// chain in front shoved on at rest. Drawn as it is, the enemy would vanish
// before the Boar got to it. So each Rush becomes a flight here, timed off
// the Boar's glide:
//
// - until the impact, when the Boar's glide reaches what it rams, the
//   rammed enemy is still drawn where it stood;
// - at the impact its ram (the thud, the burst, the shake) plays, and it
//   flies along the rush line, tumbling, over FLIGHT_SECONDS, pushing the
//   chain in front of it, each car sliding on from where it was picked up;
// - at the slam it is gone, with its defeat's poof and chirps.
//
// The events of those moments are held back until then (see take), so the
// sounds and particles keep to the drawing. The chain is drawn sliding,
// but its collisions are where the game has it, at rest on its new cell
// (see the top of knock.ts): only for FLIGHT_SECONDS, and a shoved enemy
// waits a whole move before it moves on anyway.

// How long the rammed enemy flies, however far (KDA-307, with the user; a
// placeholder to tune at preview).
export const FLIGHT_SECONDS = 0.18

// Whole turns the flier tumbles through on its way.
export const FLIGHT_TURNS = 1

// Slack for the timeline's sums of ticks.
const SLACK = 1e-6

// One Rush as it is drawn. Times are seconds from the tick it was let go.
export type RushFlight = {
    // The Boar's player index, and the unit step it rushed along.
    player: number
    facing: Vec2
    // The fliers' cell when rammed, where they slam, and the cells between
    // (0 when they slam where they stood, against a wall).
    from: Vec2
    to: Vec2
    distance: number
    // The chain in front of them (see ShovedCar).
    shoved: readonly ShovedCar[]
    // The enemies rammed (by index), and whether each was a whole Splitter
    // (which splits rather than goes: its halves wait for the slam).
    enemies: { index: number; split: boolean }[]
    impact: number
    slam: number
    elapsed: number
    // Just taken: the update on the tick it was taken doesn't count, as the
    // Boar's glide only starts on the next tick.
    fresh: boolean
    // The events held back for the impact and for the slam.
    atImpact: GameEvent[]
    atSlam: GameEvent[]
}

export type RushView = {
    // The Rushes still being drawn.
    readonly flights: readonly RushFlight[]
    // A tick's game events (`state` is the game after the tick): the ones
    // to play now, in order. A Rush's ram and what it set off are kept for
    // later, for update to give back when they are due. Nothing is held on
    // a tick that fells the boss: its freeze-frame takes over.
    take(events: readonly GameEvent[], state: GameState): GameEvent[]
    // Move on by `dt` seconds: the held events now due, in order.
    update(dt: number): GameEvent[]
    clear(): void
}

export function createRushView(): RushView {
    let flights: RushFlight[] = []
    // The events of `flight` due by its time now, taken off it.
    const due = (flight: RushFlight): GameEvent[] => {
        const out: GameEvent[] = []
        if (flight.elapsed + SLACK >= flight.impact) {
            out.push(...flight.atImpact.splice(0))
        }
        if (flight.elapsed + SLACK >= flight.slam) {
            out.push(...flight.atSlam.splice(0))
        }
        return out
    }
    const over = (f: RushFlight) => f.elapsed + SLACK >= f.slam
    return {
        get flights() {
            return flights
        },
        take(events, state) {
            if (events.some((e) => e.type === "bossDefeated"))
                return [...events]
            const now: GameEvent[] = []
            // This tick's Rush by each player.
            const rushes = new Map<number, RushFlight>()
            for (const event of events) {
                const rush =
                    "player" in event ? rushes.get(event.player) : undefined
                switch (event.type) {
                    case "rammed": {
                        const flight = startFlight(event, state)
                        flight.atImpact.push(event)
                        rushes.set(event.player, flight)
                        flights.push(flight)
                        continue
                    }
                    case "knockedFlying":
                        if (!rush) break
                        rush.from = event.from
                        rush.to = event.to
                        rush.distance = event.distance
                        rush.shoved = event.shoved
                        rush.slam = rush.impact + FLIGHT_SECONDS
                        rush.atImpact.push(event)
                        continue
                    case "enemyDefeated":
                        if (!rush || !samePos(event.at, rush.to)) break
                        rush.enemies.push({
                            index: event.enemy,
                            split: event.split,
                        })
                        rush.atSlam.push(event)
                        continue
                    case "bossHit":
                        // Rammed, or hit by the chain: either way at the slam
                        // (the impact, for a ram).
                        if (!rush) break
                        rush.atSlam.push(event)
                        continue
                }
                now.push(event)
            }
            for (const flight of rushes.values()) now.push(...due(flight))
            flights = flights.filter((f) => !over(f))
            return now
        },
        update(dt) {
            const out: GameEvent[] = []
            for (const flight of flights) {
                if (flight.fresh) {
                    flight.fresh = false
                    continue
                }
                flight.elapsed += dt
                out.push(...due(flight))
            }
            flights = flights.filter((f) => !over(f))
            return out
        },
        clear() {
            flights = []
        },
    }
}

// A Rush's flight from its ram, timed off the Boar's glide: the impact is
// when its glide reaches the cell before what it rammed (`at`), or the end
// of its glide if it never does (it broke in through walls, or carried on
// past them). Until a knockedFlying says otherwise, nothing flies.
function startFlight(
    event: Extract<GameEvent, { type: "rammed" }>,
    state: GameState
): RushFlight {
    const impact = impactTime(state, event.player, event.at, event.facing)
    return {
        player: event.player,
        facing: event.facing,
        from: event.at,
        to: event.at,
        distance: 0,
        shoved: [],
        enemies: [],
        impact,
        slam: impact,
        elapsed: 0,
        fresh: true,
        atImpact: [],
        atSlam: [],
    }
}

// Seconds until player `index`'s glide brings it up against `at`, its next
// cell along `facing`: the glide's time left, less the time for whatever
// part of it lies past that cell.
export function impactTime(
    state: GameState,
    index: number,
    at: Vec2,
    facing: Vec2
): number {
    const player = state.players[index]
    if (!player) return 0
    const c = player.character
    const progress = Math.min(c.moveProgress, 1)
    const speed = c.speed * player.rate
    if (progress >= 1 || speed <= 0) return 0
    const cols = state.cells[0].length
    const rows = state.cells.length
    const step = moveStep(c.lastPos, c.pos, cols, rows)
    const length = Math.abs(step.x) + Math.abs(step.y)
    if (length === 0) return 0
    // How far past the cell before `at` the glide ends (0 when it ends
    // there), as a share of the glide.
    const before = vec2(at.x - facing.x, at.y - facing.y)
    const past = Math.max(
        0,
        -(
            wrapDelta(before.x - c.pos.x, cols) * facing.x +
            wrapDelta(before.y - c.pos.y, rows) * facing.y
        )
    )
    const reach = Math.max(progress, 1 - past / length)
    return (reach - progress) / speed
}

// The cells a flight's fliers have gone at `t` seconds: none until the
// impact, then quick off the mark and easing into the slam, all of them
// from then on.
export function flown(flight: RushFlight, t: number): number {
    if (t <= flight.impact) return 0
    if (t >= flight.slam) return flight.distance
    const u = (t - flight.impact) / (flight.slam - flight.impact)
    return flight.distance * (1 - (1 - u) * (1 - u))
}

// A flier as drawn: the enemy, where (in cell units, on the map or up to
// a cell over its edge through a tunnel; see wrapCopies), and its tumble
// in radians.
export type DrawnFlier = {
    index: number
    split: boolean
    pos: Vec2
    spin: number
}

// What a frame draws of the Rushes in flight, at `alpha` of the way to the
// next tick: the fliers, the enemies not to draw as usual (a split
// Splitter's halves wait for the slam), and how far back along the rush
// line to draw each shoved enemy and player (by index) from its cell.
export type RushFrame = {
    fliers: DrawnFlier[]
    hidden: ReadonlySet<number>
    enemyShift: ReadonlyMap<number, Vec2>
    playerShift: ReadonlyMap<number, Vec2>
}

export function rushFrame(
    flights: readonly RushFlight[],
    state: GameState,
    alpha: number,
    tickSeconds: number
): RushFrame {
    const cols = state.cells[0].length
    const rows = state.cells.length
    const fliers: DrawnFlier[] = []
    const hidden = new Set<number>()
    const enemyShift = new Map<number, Vec2>()
    const playerShift = new Map<number, Vec2>()
    for (const flight of flights) {
        const t = flight.elapsed + (flight.fresh ? 0 : alpha * tickSeconds)
        if (t >= flight.slam) continue
        const gone = flown(flight, t)
        const { facing, from } = flight
        const pos = vec2(
            wrap(from.x + facing.x * gone, cols),
            wrap(from.y + facing.y * gone, rows)
        )
        const u =
            flight.slam > flight.impact
                ? Math.max(
                      0,
                      (t - flight.impact) / (flight.slam - flight.impact)
                  )
                : 0
        // Head over heels the way it flies: clockwise to the right and down.
        const turn = facing.x + facing.y >= 0 ? 1 : -1
        const spin = turn * FLIGHT_TURNS * 2 * Math.PI * u
        for (const { index, split } of flight.enemies) {
            fliers.push({ index, split, pos, spin })
            if (split) {
                hidden.add(index)
                hidden.add(index + 1)
            }
        }
        for (const car of flight.shoved) {
            // Still to come of its slide, drawn back from its cell. Each car
            // moves with the fliers once they reach it.
            const back = Math.min(car.distance, flight.distance - gone)
            if (back <= 0) continue
            // (+ 0: no -0 on the other axis.)
            const shift = vec2(-facing.x * back + 0, -facing.y * back + 0)
            const resting = (c: { pos: Vec2; lastPos: Vec2 }) =>
                samePos(c.pos, car.to) && samePos(c.lastPos, car.to)
            for (const i of car.enemies) {
                const enemy = state.enemies[i]
                if (enemy && resting(enemy)) enemyShift.set(i, shift)
            }
            // A player that has moved on since is drawn where it is.
            for (const i of car.players) {
                const player = state.players[i]
                if (player && resting(player.character)) {
                    playerShift.set(i, shift)
                }
            }
        }
    }
    return { fliers, hidden, enemyShift, playerShift }
}

// `pos` moved by `shift` (see RushFrame), brought back onto a cols x rows
// map after a slide through a tunnel.
export function shifted(pos: Vec2, shift: Vec2, cols: number, rows: number) {
    return vec2(wrap(pos.x + shift.x, cols), wrap(pos.y + shift.y, rows))
}

// `x` on an axis `size` cells long, brought onto it (or within a cell
// past its far edge, for wrapCopies) after a flight through a tunnel.
function wrap(x: number, size: number): number {
    return ((x % size) + size) % size
}
