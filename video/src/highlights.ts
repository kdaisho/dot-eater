import { inPlay } from "../../src/breath"
import { FROZEN } from "../../src/breaths/penguin"
import { Cell } from "../../src/constants"
import type { GameEvent } from "../../src/events"
import { gameOf, type Screen } from "../../src/flow"
import { drawnPos, type GameState } from "../../src/game"
import { wrapDelta } from "../../src/glide"
import { stages as levels } from "../../src/levels"
import { createReplayer, type Recording } from "../../src/replay"
import type { AnimalId } from "../../src/roster"
import { samePos, vec2, type Vec2 } from "../../src/vec2"
import { closeCalls, runOf } from "./replayers"
import { HERO_KIND, type SceneName } from "./scenes"

// A run's key moments, for the edit: what happened on which tick and where
// on the board, so a cut can land on it and the camera punch in on it.
// Pure: worked out by replaying the recording.
//
// Most come straight from the game's events (events.ts). The abilities that
// have no event of their own are read off the difference between the game
// before and after the tick: an enemy that turned to ice, one the wind
// threw back, a wall that broke, an enemy that turned back at a cloud.

export type MomentKind =
    // A player breathed (any animal).
    | "breathed"
    | "enemyDefeated"
    // An enemy turned to an ice block (the Penguin's freeze).
    | "enemyFrozen"
    // The Owl's wind threw an enemy back.
    | "enemyBlown"
    // The Boar broke a wall.
    | "wallBroken"
    // An enemy turned back at a cell enemies can't enter (the Skunk's
    // cloud, or the Dragon's fire).
    | "enemyRepelled"
    | "bossHit"
    | "bossDefeated"
    // A threat came close to player 1 without catching it (see nearMisses
    // in replayers.ts).
    | "nearMiss"

export type Moment = {
    // The tick it happened on: the game after `tick` ticks shows it.
    tick: number
    kind: MomentKind
    // The player who did it (whose breath), if anyone did.
    player?: number
    // The animal that breathed (breathed only).
    animal?: AnimalId
    // The enemy it happened to (its index in GameState.enemies).
    enemy?: number
    // The cell it happened on: where the player breathed, where the enemy
    // was defeated, frozen, landed or turned, the wall that broke, the
    // boss's top-left cell, player 1's cell for a near miss.
    at: Vec2
    // The point to put the camera on, in camera units (cell (x, y)'s centre
    // is (x + 0.5, y + 0.5); see camera.ts): the moment's middle, e.g.
    // halfway along a breath, the boss's centre.
    focus: Vec2
    // nearMiss only: how close the threat came, in cells.
    distance?: number
}

const centre = (p: Vec2) => vec2(p.x + 0.5, p.y + 0.5)

// Halfway between the centres of cells `a` and `b`, the short way round a
// board of `cols` x `rows` (through a tunnel if that is shorter).
function midpoint(a: Vec2, b: Vec2, cols: number, rows: number): Vec2 {
    return vec2(
        a.x + 0.5 + wrapDelta(b.x - a.x, cols) / 2,
        a.y + 0.5 + wrapDelta(b.y - a.y, rows) / 2
    )
}

const frozen = (game: GameState, i: number) =>
    game.enemies[i].statuses.some((s) => s.status.name === FROZEN.name)

// The moments of one game step: `before` is the game before the tick,
// `after` the game after it, and `events` what the step reported (empty
// for a tick that didn't step the game). `tick` is the tick's number
// (after `tick` ticks). In the order: the events' moments as they were
// reported, then frozen, blown back, broken walls and turned enemies.
export function momentsOf(
    before: GameState,
    after: GameState,
    events: readonly GameEvent[],
    tick: number
): Moment[] {
    const cols = after.cells[0].length
    const rows = after.cells.length
    const moments: Moment[] = []
    const breaths = events.flatMap((e) => (e.type === "breathed" ? [e] : []))
    const breathOf = (animal: AnimalId) =>
        breaths.find((e) => e.animal === animal)
    const by = (animal: AnimalId) => {
        const breath = breathOf(animal)
        return breath ? { player: breath.player } : {}
    }
    // Halfway between where `player` breathed this tick and `at`, so the
    // breath and what it did are both in shot; `at`'s centre if it didn't.
    const shot = (player: number | undefined, at: Vec2) => {
        const breath = breaths.find((b) => b.player === player)
        return breath ? midpoint(breath.at, at, cols, rows) : centre(at)
    }

    for (const e of events) {
        switch (e.type) {
            case "breathed":
                moments.push({
                    tick,
                    kind: "breathed",
                    player: e.player,
                    animal: e.animal,
                    at: e.at,
                    focus: midpoint(e.at, e.cells.at(-1) ?? e.at, cols, rows),
                })
                break
            case "enemyDefeated":
                moments.push({
                    tick,
                    kind: "enemyDefeated",
                    player: e.player,
                    enemy: e.enemy,
                    at: e.at,
                    focus: shot(e.player, e.at),
                })
                break
            case "bossHit":
            case "bossDefeated":
                moments.push({
                    tick,
                    kind: e.type,
                    player: e.player,
                    at: e.at,
                    // The middle of its 2x2 footprint.
                    focus: vec2(e.at.x + 1, e.at.y + 1),
                })
                break
            default:
                break
        }
    }

    after.enemies.forEach((enemy, i) => {
        const was = before.enemies[i]
        if (!was || !inPlay(was) || !inPlay(enemy)) return
        const at = vec2(enemy.pos.x, enemy.pos.y)
        // Frozen: the Penguin's freeze is on it now and wasn't before.
        if (frozen(after, i) && !frozen(before, i)) {
            moments.push({
                tick,
                kind: "enemyFrozen",
                ...by("penguin"),
                enemy: i,
                at,
                focus: shot(breathOf("penguin")?.player, at),
            })
        }
        // Blown back: it stood on a cell the Owl's wind struck (the
        // breath comes before enemies move, so where it stood before the
        // tick) and has moved.
        const wind = breathOf("owl")
        if (
            wind &&
            [wind.at, ...wind.cells].some((c) => samePos(c, was.pos)) &&
            !samePos(was.pos, enemy.pos)
        ) {
            moments.push({
                tick,
                kind: "enemyBlown",
                player: wind.player,
                enemy: i,
                at,
                focus: midpoint(wind.at, at, cols, rows),
            })
        }
        // Turned back: it moved this tick, straight back the way it came,
        // away from a cell enemies can't enter that it was heading for.
        const came = vec2(
            wrapDelta(was.pos.x - was.lastPos.x, cols),
            wrapDelta(was.pos.y - was.lastPos.y, rows)
        )
        const went = vec2(
            wrapDelta(enemy.pos.x - was.pos.x, cols),
            wrapDelta(enemy.pos.y - was.pos.y, rows)
        )
        const ahead = vec2(
            (was.pos.x + came.x + cols) % cols,
            (was.pos.y + came.y + rows) % rows
        )
        if (
            (came.x !== 0 || came.y !== 0) &&
            samePos(enemy.lastPos, was.pos) &&
            went.x === -came.x &&
            went.y === -came.y &&
            after.tiles.some(
                (t) => t.effect.blocksEnemies && samePos(t.pos, ahead)
            )
        ) {
            moments.push({
                tick,
                kind: "enemyRepelled",
                enemy: i,
                at: vec2(was.pos.x, was.pos.y),
                focus: centre(was.pos),
            })
        }
    })

    // Broken walls: a wall before, open floor after.
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            if (
                before.cells[y][x] === Cell.wall &&
                after.cells[y][x] !== Cell.wall
            ) {
                moments.push({
                    tick,
                    kind: "wallBroken",
                    ...by("boar"),
                    at: vec2(x, y),
                    focus: centre(vec2(x, y)),
                })
            }
        }
    }
    return moments
}

const cache = new WeakMap<Recording, Moment[]>()

// Every key moment of `recording`, in tick order (near misses among them,
// by the tick of the closest approach).
export function highlightsOf(recording: Recording): Moment[] {
    const known = cache.get(recording)
    if (known) return known
    const replayer = createReplayer(recording, levels)
    const moments: Moment[] = []
    const games: GameState[] = []
    let prev: Screen = replayer.at(0)
    games.push(gameOf(prev)!)
    for (let k = 1; k <= replayer.length; k++) {
        const screen = replayer.at(k)
        const game = gameOf(screen)
        if (!game) throw new Error(`No game after ${k} ticks`)
        games.push(game)
        // As in runOf: only a tick taken in play has events of its own.
        const events = prev.kind === "playing" ? game.events : []
        moments.push(...momentsOf(games[k - 1], game, events, k))
        prev = screen
    }
    for (const miss of closeCalls(runOf(recording).ticks)) {
        const game = games[miss.tick]
        const me = game.players[0].character
        const drawn = drawnPos(me, game.cells[0].length, game.cells.length)
        moments.push({
            tick: miss.tick,
            kind: "nearMiss",
            player: 0,
            at: vec2(me.pos.x, me.pos.y),
            focus: centre(drawn),
            distance: miss.distance,
        })
    }
    // A stable sort, so a tick's moments keep their order.
    moments.sort((a, b) => a.tick - b.tick)
    cache.set(recording, moments)
    return moments
}

// The moment of `kind` the edit should land on a beat: the first one, or
// for near misses the closest. Undefined if there is none.
export function heroOf(
    moments: readonly Moment[],
    kind: MomentKind
): Moment | undefined {
    const ofKind = moments.filter((m) => m.kind === kind)
    if (kind === "nearMiss") {
        return [...ofKind].sort(
            (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)
        )[0]
    }
    return ofKind[0]
}

// A scene's hero moment (see HERO_KIND in scenes.ts).
export function heroMoment(
    scene: SceneName,
    recording: Recording
): Moment | undefined {
    return heroOf(highlightsOf(recording), HERO_KIND[scene])
}
