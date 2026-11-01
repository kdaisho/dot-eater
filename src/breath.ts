import {
    BLINK_RATE,
    Cell,
    DEFEAT_POINTS,
    DOT_ENERGY,
    RESPAWN_BLINK,
} from "./constants"
import { bossDamage, damageBoss, inFootprint, tickBoss } from "./boss"
import {
    endKnock,
    freshFromPunches,
    skipKnockTurn,
    type Character,
} from "./character"
import { emit } from "./events"
import type { ParticleLook } from "./particles"
import type { GameState, Player } from "./game"
import { loopPos, type Cells } from "./level"
import type { AnimalId } from "./roster"
import {
    halfDefeated,
    isSplitterHalf,
    isWholeSplitter,
    splitSplitter,
} from "./splitter"
import { opponentsStruck, stun, stunned } from "./versus"
import { allDirections, directions, samePos, vec2, type Vec2 } from "./vec2"

// The breath system. Pure, no DOM: time comes in as `dt`, the breath press
// and hold as flags on MoveInput (see step in game.ts).
//
// Every playable animal has one BreathDef (src/breaths/, one file each). A
// breath costs energy from the player's meter, which dots refill, and has a
// cooldown on top. It is charged (KDA-289): holding the breath charges a
// gauge a level at a time, and letting go fires it at that level, for that
// level's energy (see chargeTick). The breath's shape and what its hook does
// grow with the level, each breath its own way. When the player breathes,
// the breath's shape is resolved against the maze into cells (BreathHit),
// and the breath's `fire` hook decides what happens to them, using only the
// generic effects below:
//
// - defeat an enemy: it scores DEFEAT_POINTS and comes back alone at its
//   spawn after GameState.respawnDelay, blinking for the last RESPAWN_BLINK
//   seconds (a whole Splitter splits in two instead; see splitter.ts);
// - put a timed status on an enemy (EnemyStatus: e.g. frozen);
// - put a timed effect on a cell (TileEffect: blocks enemies, ice, an opened
//   wall);
// - push an enemy a few cells.
//
// Statuses and tile effects are data, including how they look (Look), so
// game.ts, ai.ts and render.ts know only the generic flags and never a
// particular breath.
//
// A boss (see boss.ts) is out of the hooks' reach: it isn't in
// BreathHit.enemies. The engine damages it instead, by the energy the breath
// spends, whenever the breath touches its footprint (see breathe).

// How a status or tile effect is drawn. Both fields are optional; leave the
// whole look out to draw nothing.
export type Look = {
    // A CSS colour: for a tile, a fill over the whole cell (under any dot);
    // for an enemy, a disc behind its sprite. Use a translucent colour (e.g.
    // "rgba(255, 90, 0, 0.45)") to keep what's underneath readable.
    color?: string
    // An emoji: for a tile, drawn over the cell; for an enemy, a small badge
    // at its top right.
    emoji?: string
}

// A timed effect on one cell. Every flag is optional and off by default.
export type TileEffect = {
    // Identifies it (not shown): unique per breath, e.g. "dragon.burning".
    name: string
    // Enemies treat the cell as a wall: they don't path through it or step
    // or slide into it, and one already on it heads for the nearest cell
    // outside (see enemyMove in ai.ts). Phantoms, which ignore walls, still
    // keep out. The player isn't affected, and a player inside still draws
    // enemies to the patch's edge nearest it.
    blocksEnemies?: boolean
    // The floor is ice while the effect lasts (slides work as on level ice).
    // It is never placed under a character: a cell someone stands on when
    // the effect is added is skipped, so nobody starts sliding on the spot.
    ice?: boolean
    // The cell's wall is gone while the effect lasts, and grows back when it
    // ends, pushing anyone inside out to the nearest open cell. Ignored on a
    // cell that isn't a wall when it is added. Which walls may open (e.g.
    // not the outer ones) is up to the breath.
    opensWall?: boolean
    look?: Look
}

// A timed status on an enemy. Every flag is optional and off by default.
export type EnemyStatus = {
    // Identifies it (not shown): unique per breath, e.g. "dragon.burning".
    name: string
    // The enemy doesn't move (not even sliding): it stays where it is drawn.
    holds?: boolean
    // The enemy doesn't catch the player.
    harmless?: boolean
    // The enemy blinks for the status's last RESPAWN_BLINK seconds, as a
    // respawning one does, warning that it is about to end (see
    // enemyVisible). Drawing only: nothing else changes.
    blinksBeforeEnd?: boolean
    look?: Look
}

export type ActiveTile = {
    pos: Vec2
    effect: TileEffect
    // Seconds left.
    left: number
}

export type ActiveStatus = {
    status: EnemyStatus
    // Seconds left.
    left: number
}

// Where a breath reaches, from the player's cell along its facing. Every
// shape is wrap-aware (it goes through tunnels), and walls stop it.
export type BreathShape =
    // Straight ahead, up to `range` cells, stopping at the first wall.
    | { kind: "line"; range: number }
    // A cone widening ahead: 1 cell wide at distance 1, 3 at distance 2, 5
    // at distance 3 and so on, up to `range`. Each cell is reached from a
    // cell of the row before it (straight or diagonally), so walls cast
    // shadows.
    | { kind: "cone"; range: number }
    // The player's cell and the cells around it within `radius` (a square),
    // spreading only through open cells, so it doesn't leak past walls.
    | { kind: "area"; radius: number }
    // The player's cell and every open cell within `reach` steps of it,
    // walking through open cells only (no diagonals), like a gas filling
    // the corridors: nearest first, by walking distance.
    | { kind: "flood"; reach: number }
    // Ahead and on along the corridors, like fire spreading: the cell in
    // front, then every open cell within `reach` steps of the player
    // walking on from it (no diagonals, never back through the player's
    // cell), so it turns corners and splits at junctions; nearest first.
    // Facing a wall it covers nothing.
    | { kind: "spread"; reach: number }
    // Just the player's own cell.
    | { kind: "self" }

// What a breath reaches, as passed to its `fire` hook, plus the effects it
// can apply. Changes go through these functions; `state` is there to read.
export type BreathHit = {
    state: GameState
    // The player's cell and facing (a unit step) when it breathed.
    origin: Vec2
    facing: Vec2
    // The cells the shape covers, nearest first. Never walls. A line, a
    // cone or a spread ends at a boss's body, its cells there included
    // (see breathe).
    cells: readonly Vec2[]
    // The wall a line (or a cone's or a spread's first cell) stopped at, if
    // any.
    wall: Vec2 | null
    // The walls the breath acts on (BreathDef.wallsHit), nearest first;
    // empty for a breath that does nothing to walls.
    walls: readonly Vec2[]
    // The charge level it fires at, 1 (a tap) to MAX_CHARGE.
    level: number
    // Enemies in play standing on `cells` (by their cell, pos), in the order
    // of `cells`, so the first is the one nearest the player. For a line or
    // a cone, enemies on `origin` come first: one can stand on the player's
    // cell while its sprite is still gliding in.
    enemies: readonly Character[]
    defeat(enemy: Character): void
    addStatus(enemy: Character, status: EnemyStatus, seconds: number): void
    // Ice tiles added here show in state.ice once the hook returns.
    addTile(pos: Vec2, effect: TileEffect, seconds: number): void
    // Push `enemy` up to `distance` cells along `step` (see pushEnemy).
    // Returns how many cells it moved.
    push(enemy: Character, step: Vec2, distance: number): number
}

// One character's breath and stats: everything a file in src/breaths/
// defines.
//
// What grows with the charge level is up to each breath: its shape is a
// function of the level, and its hook reads BreathHit.level for the rest
// (how long a freeze lasts, how far a push goes).
export type BreathDef = {
    animal: AnimalId
    // Where the breath reaches at charge `level` (1 to MAX_CHARGE).
    shape: (level: number) => BreathShape
    // Energy per charge level: a level-N breath costs N times this, so a
    // tap (level 1) costs just this. The player can't breathe with less.
    cost: number
    // Seconds after a breath before the next one.
    cooldown: number
    // Seconds its main effect lasts at level 1 (0 for an instant one). The
    // hook applies it; this is here so the select screen and tests can read
    // it.
    duration: number
    // Stats: the energy meter's size, and the player's speed as a factor of
    // the level's (1 for normal).
    maxEnergy: number
    speedScale: number
    // Whether the player walks on ice (level or breath ice) as on normal
    // floor, moving and stopping by its input, instead of sliding (see
    // slideTick in game.ts). Leave it out to slide like everyone else.
    walksOnIce?: boolean
    // How the breath looks in particles (see particles.ts): a burst on each
    // cell it strikes, flying along the facing. Leave it out for none.
    particles?: ParticleLook
    // The walls the breath acts on at charge `level` (BreathHit.walls), e.g.
    // to break them, starting from `wall`, the wall its shape stopped at
    // (BreathHit.wall), facing `facing`: none, `wall` alone, or a run of
    // walls on from it. The aim preview (see aimCells) marks only these
    // walls, and nothing else, for such a breath. Leave it out for a breath
    // that does nothing to walls.
    wallsHit?: (cells: Cells, wall: Vec2, facing: Vec2, level: number) => Vec2[]
    // What the breath does once its cost is paid. Return false (before
    // changing anything) to refuse, e.g. when there is nothing to hit; then
    // no energy is spent and there is no cooldown.
    fire(hit: BreathHit): boolean | void
}

// A player's breath state: one per player (Player.breather in game.ts).
export type Breather = {
    breath: BreathDef
    // The unit step the player faces: its latest move, or the way it last
    // tried to move into a wall (see movePlayerTick in game.ts). Starts
    // facing right; kept while standing still.
    facing: Vec2
    // From 0 to breath.maxEnergy. Starts empty each stage, kept when the
    // player is hurt or knocked out.
    energy: number
    // Seconds until it can breathe again (0 when ready).
    cooldown: number
    // While the breath is held to charge it (see chargeTick), the seconds
    // it has been held since the tick of the press; null when it isn't
    // charging.
    charge: number | null
}

// Tolerance for timers counting down by dt, as in game.ts.
const EPSILON = 1e-9

export const START_FACING: Vec2 = vec2(1, 0)

// The highest charge level (KDA-289; a placeholder to tune at preview).
export const MAX_CHARGE = 5
// Seconds of holding the breath for each level past the first (KDA-289;
// a placeholder to tune at preview).
export const CHARGE_SECONDS = 0.25

export function createBreather(breath: BreathDef): Breather {
    return {
        breath,
        facing: vec2(START_FACING.x, START_FACING.y),
        energy: 0,
        cooldown: 0,
        charge: null,
    }
}

// A dot was eaten: add DOT_ENERGY, up to the meter's size.
export function gainEnergy(breather: Breather) {
    breather.energy = Math.min(
        breather.breath.maxEnergy,
        breather.energy + DOT_ENERGY
    )
}

// Whether the player has the energy (for a level-1 breath) and is past the
// cooldown.
export function canBreathe(breather: Breather): boolean {
    return affordable(breather) >= 1 && breather.cooldown <= EPSILON
}

// The highest charge level the meter pays for now, up to MAX_CHARGE: 0
// when it can't pay for level 1.
export function affordable(breather: Breather): number {
    const { energy, breath } = breather
    if (breath.cost <= 0) return MAX_CHARGE
    return Math.min(MAX_CHARGE, Math.floor(energy / breath.cost + EPSILON))
}

// The level the charge has reached: 1 at the press and one more every
// CHARGE_SECONDS held, up to MAX_CHARGE or what the meter pays for,
// whichever is lower. 0 while not charging.
export function chargeLevel(breather: Breather): number {
    if (breather.charge === null) return 0
    const held = 1 + Math.floor(breather.charge / CHARGE_SECONDS + EPSILON)
    return Math.max(1, Math.min(held, affordable(breather)))
}

// The level a breath would fire at now: the charge's while charging, else
// a tap's (1).
function aimLevel(breather: Breather): number {
    return breather.charge === null ? 1 : chargeLevel(breather)
}

// One player's breath input for a tick (part of MoveInput in game.ts).
export type BreathInput = {
    // Whether the breath was newly pressed this tick, even if it was
    // already let go again.
    breath?: boolean
    // Whether it is held now.
    breathHeld?: boolean
}

// One tick of `who`'s breath input (KDA-289, with the user: hold to
// charge, let go to fire). A press starts a charge if the player can
// breathe (see canBreathe); otherwise it is dropped, not kept. Held on, the
// charge grows a level every CHARGE_SECONDS (see chargeLevel) while the
// player keeps moving. Letting go fires it at the level reached (see
// breathe), so a tap fires level 1: on the tick of its press when it was
// let go within that tick, else on the next. A hold that began while the
// player couldn't breathe charges nothing, even once it can: only a fresh
// press starts a charge. A fresh press during a charge means it was let go
// and pressed again within the tick: the charge fires at its level, then
// the press is taken as any other (the cooldown usually drops it). `dt` is
// the tick's length. Returns true if a breath happened.
export function chargeTick(
    state: GameState,
    who: Player,
    input: BreathInput,
    dt: number
): boolean {
    const { breather } = who
    let fired = false
    if (breather.charge !== null) {
        if (input.breathHeld && !input.breath) {
            breather.charge += dt
            return false
        }
        const level = chargeLevel(breather)
        breather.charge = null
        fired = breathe(state, who, level)
    }
    if (!input.breath || !canBreathe(breather)) return fired
    breather.charge = 0
    if (input.breathHeld) return fired
    breather.charge = null
    return breathe(state, who, 1) || fired
}

// Drop the breath's charge, if any, without firing it.
export function cancelCharge(breather: Breather) {
    breather.charge = null
}

// Drop every player's charge without firing: a pause does (see flow.ts).
export function cancelCharges(state: GameState) {
    for (const { breather } of state.players) cancelCharge(breather)
}

// Breathe as `who` (player 1 unless given) at charge `level` (1 unless
// given, and no higher than the meter pays for), if allowed: resolve the
// level's shape from its cell along its facing, run the breath's hook, and
// pay (the level's energy, and the cooldown) unless the hook refused. What
// it defeats scores for `who`.
// Breaths don't affect players, except in versus: there the other player,
// standing on any cell the breath strikes (as for enemies: the origin too
// for a line, a cone or a spread), is stunned (see versus.ts), whatever
// the breath, and the breath counts as fired even if the hook refused.
// Only the strike stuns: tile effects it leaves don't. Returns true if the
// breath happened.
//
// A boss in the way (see boss.ts) stops a line, a cone or a spread like a
// wall would, except that its cells are covered: the big body takes the
// breath. If any of the cells the breath strikes (as for enemies: the
// origin too for a line, a cone or a spread) is under the boss, it takes
// bossDamage of the energy the breath spends, once however many of its
// cells are struck (so a charged breath hurts it as much as the taps its
// energy pays for, KDA-289), and the breath counts as fired even if the
// hook refused (e.g. the Boar with no wall to break): it hit something.
export function breathe(
    state: GameState,
    who: Player = state.players[0],
    level = 1
): boolean {
    const breather = who.breather
    if (!canBreathe(breather)) return false
    const { breath, facing } = breather
    const at = Math.max(1, Math.min(Math.floor(level), affordable(breather)))
    const { origin, shape, reach, walls, body } = aimOf(state, who, at)
    // Line, cone and spread shapes start a cell ahead, but an enemy can stand on the
    // player's own cell while its sprite still glides in (collisions are on
    // drawn positions), so they hit enemies there too, first.
    const struck = aimsAhead(shape) ? [origin, ...reach.cells] : reach.cells
    const enemies = struck.flatMap((cell) =>
        state.enemies.filter((e) => inPlay(e) && samePos(e.pos, cell))
    )
    // Ice tiles are placed as the hook adds them, and the ice grid is
    // rebuilt once after it, not once per cell.
    let iceAdded = false
    const hit: BreathHit = {
        state,
        origin,
        facing: vec2(facing.x, facing.y),
        cells: reach.cells,
        wall: reach.wall,
        walls,
        level: at,
        enemies,
        defeat: (enemy) => defeatEnemy(state, enemy, who),
        addStatus,
        addTile: (pos, effect, seconds) => {
            if (placeTile(state, pos, effect, seconds) && effect.ice) {
                iceAdded = true
            }
        },
        push: (enemy, step, distance) =>
            pushEnemy(
                state.cells,
                enemy,
                step,
                distance,
                playerCharacters(state)
            ),
    }
    const bossHit = body !== undefined && struck.some(body)
    // In versus, the other player on a struck cell (see opponentsStruck).
    const stuns = opponentsStruck(state, who, struck)
    const eventsBefore = state.events.length
    const fired = breath.fire(hit) !== false
    if (iceAdded) rebuildIce(state)
    if (!fired && !bossHit && stuns.length === 0) {
        // A refused breath reports nothing (see events.ts), even if its
        // hook reported something before refusing.
        state.events.length = eventsBefore
        return false
    }
    const player = state.players.indexOf(who)
    // Reported before what it did, including the defeats the hook already
    // reported (a refusing hook changes nothing, so reports nothing).
    state.events.splice(eventsBefore, 0, {
        type: "breathed",
        player,
        animal: breath.animal,
        at: origin,
        facing: vec2(facing.x, facing.y),
        cells: coveredCells(state, origin, reach, walls),
    })
    const spent = breath.cost * at
    if (bossHit) damageBoss(state, bossDamage(spent), who)
    for (const other of stuns) {
        stun(other)
        const { pos } = other.character
        emit(state, {
            type: "playerStunned",
            player: state.players.indexOf(other),
            by: player,
            at: vec2(pos.x, pos.y),
        })
    }
    breather.energy -= spent
    breather.cooldown = breath.cooldown
    return true
}

// Where `who`'s breath reaches if it breathes now at charge `level`: the
// level's shape resolved from the player's cell (not its gliding sprite)
// along its facing, stopped by walls and by the live boss's body, and the
// walls it acts on (BreathDef.wallsHit). Shared by breathe and the aim
// preview, so the preview always shows what a breath would do.
function aimOf(
    state: GameState,
    who: Player,
    level: number
): {
    origin: Vec2
    shape: BreathShape
    reach: ShapeReach
    walls: Vec2[]
    // The boss's body, if one is in play (see resolveShape).
    body: ((p: Vec2) => boolean) | undefined
} {
    const { breath, facing } = who.breather
    const origin = vec2(who.character.pos.x, who.character.pos.y)
    const boss = state.boss && !state.boss.defeated ? state.boss : null
    const body = boss ? (p: Vec2) => inFootprint(boss.pos, p) : undefined
    const shape = breath.shape(level)
    const reach = resolveShape(state.cells, origin, facing, shape, body)
    const { wall } = reach
    const walls =
        wall && breath.wallsHit
            ? breath.wallsHit(state.cells, wall, facing, level)
            : []
    return { origin, shape, reach, walls, body }
}

// The cells player `index`'s breath (player 1's unless given) would hit if
// it breathed now, nearest first, whether or not it can: the cells its shape
// reaches (see aimOf) at the level it would fire at, the charge's while
// charging, else a tap's, 1 (KDA-289). Not the player's own cell for a line
// or a cone, though enemies there are hit too: the preview shows where the
// breath goes, and the sprite covers that cell. A breath that acts on walls
// (BreathDef.wallsHit: the Boar) shows only the walls it would act on, or
// nothing, since those walls are all it does (with the user, KDA-252).
export function aimCells(state: GameState, index = 0): Vec2[] {
    const who = state.players[index]
    const { reach, walls } = aimOf(state, who, aimLevel(who.breather))
    const cells = who.breather.breath.wallsHit ? walls : reach.cells
    return cells.map((c) => vec2(c.x, c.y))
}

// One player's aim preview: its index and the cells its breath would hit.
export type AimPreview = {
    player: number
    cells: readonly Vec2[]
}

// The aim previews to draw now (see render.ts): one per player that could
// breathe this moment (in play, not stunned, and charged: the energy HUD's
// ready rule, canBreathe), player 1 first, leaving out any whose breath
// would hit nothing.
export function aimPreviews(state: GameState): AimPreview[] {
    return state.players.flatMap((p, player) => {
        if (p.out || stunned(p) || !canBreathe(p.breather)) return []
        const cells = aimCells(state, player)
        return cells.length > 0 ? [{ player, cells }] : []
    })
}

// The cells a breath covered, for its event (see "breathed" in events.ts):
// what its shape reached, or with nothing in reach the walls it acted on
// that the hook has just opened (the Boar's tunnel), else the player's own
// cell.
function coveredCells(
    state: GameState,
    origin: Vec2,
    reach: ShapeReach,
    walls: readonly Vec2[]
): Vec2[] {
    if (reach.cells.length > 0) return reach.cells.map((c) => vec2(c.x, c.y))
    const opened = walls.filter((w) => state.cells[w.y][w.x] !== Cell.wall)
    if (opened.length > 0) return opened.map((w) => vec2(w.x, w.y))
    return [vec2(origin.x, origin.y)]
}

// ---- Shapes ----

export type ShapeReach = {
    cells: Vec2[]
    wall: Vec2 | null
}

const key = (p: Vec2) => `${p.x},${p.y}`

function add(cells: Cells, p: Vec2, d: Vec2): Vec2 {
    return loopPos(cells, vec2(p.x + d.x, p.y + d.y))
}

// Whether `shape` starts a cell ahead (a line, a cone or a spread), so an
// enemy on the player's own cell is struck too, first (see breathe).
function aimsAhead(shape: BreathShape): boolean {
    return (
        shape.kind === "line" ||
        shape.kind === "cone" ||
        shape.kind === "spread"
    )
}

// The cells `shape` covers from `origin` facing `facing` (see BreathShape).
// Each cell appears once, nearest first, even where a tunnel brings the
// shape back round to cells it already covered.
//
// `body`, if given, marks the cells a big body (the boss) fills: a line or
// a cone covers them but goes no further through them, so they cast
// shadows like walls without being walls. A cone's shadow is the cells
// behind the body: once a row meets it, those offsets across the facing
// stay dark for the rest of the cone, except for more of the body itself.
// A spread's body cells take the fire but it goes no further through them.
// Area, flood and self shapes ignore it.
export function resolveShape(
    cells: Cells,
    origin: Vec2,
    facing: Vec2,
    shape: BreathShape,
    body: (p: Vec2) => boolean = () => false
): ShapeReach {
    const isWall = (p: Vec2) => cells[p.y][p.x] === Cell.wall
    switch (shape.kind) {
        case "self":
            return { cells: [vec2(origin.x, origin.y)], wall: null }
        case "line": {
            const result: Vec2[] = []
            const seen = new Set([key(origin)])
            let p = origin
            for (let k = 1; k <= shape.range; k++) {
                p = add(cells, p, facing)
                if (isWall(p)) return { cells: result, wall: p }
                if (seen.has(key(p))) break
                seen.add(key(p))
                result.push(p)
                if (body(p)) break
            }
            return { cells: result, wall: null }
        }
        case "cone": {
            // Rows across the facing, one per distance, by offset to the
            // side (-k + 1 to k - 1).
            const side = vec2(-facing.y, facing.x)
            const result: Vec2[] = []
            const seen = new Set([key(origin)])
            let wall: Vec2 | null = null
            let centre = origin
            let lit = new Set<number>([0])
            // Offsets across the facing the body has been met at.
            const shadow = new Set<number>()
            for (let k = 1; k <= shape.range && lit.size > 0; k++) {
                centre = add(cells, centre, facing)
                const next = new Set<number>()
                // Walk out from the centre each way, so offsets stay
                // wrap-aware.
                const row = new Map<number, Vec2>([[0, centre]])
                for (const dir of [-1, 1]) {
                    let p = centre
                    const step = vec2(side.x * dir, side.y * dir)
                    for (let o = 1; o < k; o++) {
                        p = add(cells, p, step)
                        row.set(o * dir, p)
                    }
                }
                for (let o = -(k - 1); o <= k - 1; o++) {
                    const p = row.get(o)!
                    const fed = lit.has(o - 1) || lit.has(o) || lit.has(o + 1)
                    if (!fed) continue
                    if (isWall(p)) {
                        if (k === 1) wall = p
                        continue
                    }
                    if (body(p)) shadow.add(o)
                    else if (shadow.has(o)) continue
                    else next.add(o)
                    if (seen.has(key(p))) continue
                    seen.add(key(p))
                    result.push(p)
                }
                lit = next
            }
            return { cells: result, wall }
        }
        case "area": {
            // Breadth-first through open cells, keeping each cell's offset
            // from the origin so the square is measured before wrapping.
            const result: Vec2[] = [vec2(origin.x, origin.y)]
            const seen = new Set([key(origin)])
            const queue = [{ p: origin, dx: 0, dy: 0 }]
            for (let head = 0; head < queue.length; head++) {
                const { p, dx, dy } = queue[head]
                for (const d of allDirections.map((dir) => directions[dir])) {
                    const nx = dx + d.x
                    const ny = dy + d.y
                    if (Math.max(Math.abs(nx), Math.abs(ny)) > shape.radius) {
                        continue
                    }
                    const q = add(cells, p, d)
                    if (isWall(q) || seen.has(key(q))) continue
                    seen.add(key(q))
                    result.push(q)
                    queue.push({ p: q, dx: nx, dy: ny })
                }
            }
            return { cells: result, wall: null }
        }
        case "flood": {
            // Breadth-first through open cells, a ring per step.
            const result: Vec2[] = [vec2(origin.x, origin.y)]
            const seen = new Set([key(origin)])
            let ring = [origin]
            for (let k = 1; k <= shape.reach && ring.length > 0; k++) {
                const next: Vec2[] = []
                for (const p of ring) {
                    for (const dir of allDirections) {
                        const q = add(cells, p, directions[dir])
                        if (isWall(q) || seen.has(key(q))) continue
                        seen.add(key(q))
                        next.push(q)
                    }
                }
                result.push(...next)
                ring = next
            }
            return { cells: result, wall: null }
        }
        case "spread": {
            // Breadth-first from the cell ahead, a ring per step; the
            // player's cell is never walked back through.
            const first = add(cells, origin, facing)
            if (isWall(first)) return { cells: [], wall: first }
            const result: Vec2[] = [first]
            const seen = new Set([key(origin), key(first)])
            let ring = body(first) ? [] : [first]
            for (let k = 2; k <= shape.reach && ring.length > 0; k++) {
                const next: Vec2[] = []
                for (const p of ring) {
                    for (const dir of allDirections) {
                        const q = add(cells, p, directions[dir])
                        if (isWall(q) || seen.has(key(q))) continue
                        seen.add(key(q))
                        result.push(q)
                        // A big body takes the fire but stops it.
                        if (!body(q)) next.push(q)
                    }
                }
                ring = next
            }
            return { cells: result, wall: null }
        }
        default: {
            const unhandled: never = shape
            throw new Error(`Unknown shape: ${JSON.stringify(unhandled)}`)
        }
    }
}

// ---- Enemy statuses, defeat and respawn ----

// Whether an enemy is in play (not defeated and waiting to respawn).
export function inPlay(enemy: Character): boolean {
    return enemy.respawnIn <= 0
}

// Whether any of the enemy's statuses has `flag` set.
export function hasStatus(
    enemy: Character,
    flag: "holds" | "harmless"
): boolean {
    return enemy.statuses.some((s) => s.status[flag] === true)
}

// Put `status` on `enemy` for `seconds`. The same status (by name) again
// refreshes it to whichever lasts longer; different statuses add up.
export function addStatus(
    enemy: Character,
    status: EnemyStatus,
    seconds: number
) {
    if (!inPlay(enemy)) return
    const existing = enemy.statuses.find((s) => s.status.name === status.name)
    if (existing) existing.left = Math.max(existing.left, seconds)
    else enemy.statuses.push({ status, left: seconds })
}

// Take `enemy` out of play: DEFEAT_POINTS for `by` (the player whose breath
// did it, player 1 unless given), then back at its spawn after
// state.respawnDelay (see tickEffects). It waits at its spawn meanwhile, so the
// blink before it is back is drawn there. Statuses are dropped, a
// patroller will start its route again, and the punches it took and its
// guard roll are forgotten (see freshFromPunches). Defeating an enemy already out of
// play does nothing.
//
// A Splitter (see splitter.ts) scores the same, but a whole one splits into
// two halves instead of leaving play, and a defeated half doesn't come back
// by itself: the Splitter does, whole, once both halves are gone.
export function defeatEnemy(
    state: GameState,
    enemy: Character,
    by: Player = state.players[0]
) {
    if (!inPlay(enemy)) return
    const i = state.enemies.indexOf(enemy)
    if (i < 0) return
    by.score += DEFEAT_POINTS
    const split = isWholeSplitter(enemy)
    emit(state, {
        type: "enemyDefeated",
        player: state.players.indexOf(by),
        enemy: i,
        at: vec2(enemy.pos.x, enemy.pos.y),
        split,
    })
    if (split) {
        splitSplitter(state, i)
        return
    }
    const spawn = state.spawns.enemies[i]
    enemy.respawnIn = state.respawnDelay
    enemy.statuses = []
    enemy.pos = vec2(spawn.x, spawn.y)
    enemy.lastPos = vec2(spawn.x, spawn.y)
    enemy.moveProgress = 0
    enemy.routeIndex = 0
    // It comes back fresh from the punch: no decay, and a new guard roll.
    freshFromPunches(enemy)
    if (isSplitterHalf(enemy)) halfDefeated(state, i)
}

// Whether to draw an enemy. While defeated, only in the last RESPAWN_BLINK
// seconds, blinking. In play, always, except that it blinks in the last
// RESPAWN_BLINK seconds of a status that blinksBeforeEnd (e.g. a freeze).
export function enemyVisible(enemy: Character): boolean {
    if (!inPlay(enemy)) {
        return (
            enemy.respawnIn <= RESPAWN_BLINK + EPSILON &&
            blinkOn(enemy.respawnIn)
        )
    }
    return enemy.statuses.every(
        (s) =>
            !s.status.blinksBeforeEnd ||
            s.left > RESPAWN_BLINK + EPSILON ||
            blinkOn(s.left)
    )
}

// Within the last RESPAWN_BLINK seconds of a wait with `left` seconds to go,
// whether the blink is on: on and off BLINK_RATE times a second, starting
// on.
function blinkOn(left: number): boolean {
    const phase = Math.floor((RESPAWN_BLINK - left) * BLINK_RATE * 2 + EPSILON)
    return phase % 2 === 0
}

// Push `enemy` up to `distance` cells along the unit `step`, through
// tunnels, stopping before a wall (but not before a cell that blocks
// enemies: one pushed into it leaves by the shortest way). It then glides
// in over its last cell (as if it had just moved there) and so carries on
// sliding if it lands on ice. Unless that glide would start where one of
// `players` is drawn this tick (its cell, or the one it glides in from, e.g.
// a 1-cell push off the player's cell): then it is drawn on its new cell
// from the start, so the push can't catch a player on its own tick, and
// still has a whole move to go before it moves on (it doesn't slide).
// Returns how many cells it moved.
export function pushEnemy(
    cells: Cells,
    enemy: Character,
    step: Vec2,
    distance: number,
    players: readonly Character[]
): number {
    if (!inPlay(enemy)) return 0
    let from = enemy.pos
    let to = enemy.pos
    let moved = 0
    for (; moved < distance; moved++) {
        const next = add(cells, to, step)
        if (cells[next.y][next.x] === Cell.wall) break
        from = to
        to = next
    }
    if (moved === 0) return 0
    const onPlayer = players.some(
        (p) => samePos(from, p.pos) || samePos(from, p.lastPos)
    )
    const start = onPlayer ? to : from
    enemy.lastPos = vec2(start.x, start.y)
    enemy.pos = vec2(to.x, to.y)
    enemy.moveProgress = 0
    endKnock(enemy)
    return moved
}

// ---- Tile effects ----

// Put `effect` on the cell at `pos` for `seconds` (see TileEffect for the
// cells it skips). The same effect (by name) again on a cell refreshes it
// to whichever lasts longer.
export function addTileEffect(
    state: GameState,
    pos: Vec2,
    effect: TileEffect,
    seconds: number
) {
    if (placeTile(state, pos, effect, seconds) && effect.ice) {
        rebuildIce(state)
    }
}

// addTileEffect without rebuilding the ice grid (the caller does, once).
// Returns true if a new tile effect was placed.
function placeTile(
    state: GameState,
    pos: Vec2,
    effect: TileEffect,
    seconds: number
): boolean {
    const cell = vec2(pos.x, pos.y)
    const existing = state.tiles.find(
        (t) => t.effect.name === effect.name && samePos(t.pos, cell)
    )
    if (existing) {
        existing.left = Math.max(existing.left, seconds)
        return false
    }
    if (effect.ice && occupied(state, cell)) return false
    if (effect.opensWall) {
        if (state.cells[cell.y][cell.x] !== Cell.wall) return false
        state.cells[cell.y][cell.x] = Cell.none
    }
    state.tiles.push({ pos: cell, effect, left: seconds })
    return true
}

// The players in play (not taken out; see takeOut in game.ts), player 1
// first. Out players are off the board: nothing a breath does looks at them.
export function playersInPlay(state: GameState): Player[] {
    return state.players.filter((p) => !p.out)
}

// The character of every player in play, player 1 first.
export function playerCharacters(state: GameState): Character[] {
    return playersInPlay(state).map((p) => p.character)
}

// Whether a player, an enemy in play or the boss (on any of its cells)
// stands on `cell`.
function occupied(state: GameState, cell: Vec2): boolean {
    const { boss } = state
    if (boss && !boss.defeated && inFootprint(boss.pos, cell)) return true
    return [...playerCharacters(state), ...state.enemies.filter(inPlay)].some(
        (c) => samePos(c.pos, cell)
    )
}

// Recompute GameState.ice from the level's ice and the ice tile effects.
// It is always a new grid object, so per-grid caches (hasIce in ice.ts) stay
// right.
function rebuildIce(state: GameState) {
    const ice = state.floorIce.map((row) => [...row])
    for (const t of state.tiles) {
        if (t.effect.ice) ice[t.pos.y][t.pos.x] = true
    }
    state.ice = ice
}

// Per cell [y][x]: true where a tile effect blocks enemies, or null when
// none does (the common case, so callers can skip the work).
export type BlockMap = readonly (readonly boolean[])[]

export function enemyBlocks(state: GameState): BlockMap | null {
    const blocking = state.tiles.filter((t) => t.effect.blocksEnemies)
    if (blocking.length === 0) return null
    const map = state.cells.map((row) => row.map(() => false))
    for (const t of blocking) map[t.pos.y][t.pos.x] = true
    return map
}

// ---- Timers ----

// Count every breath timer down by `dt` seconds, at the start of a tick:
// every player's cooldown, enemy statuses, defeated enemies (back at their
// spawn when theirs runs out), the boss's hit flash and tile effects (an
// opened wall grows back).
export function tickEffects(state: GameState, dt: number) {
    for (const { breather } of state.players) {
        breather.cooldown = Math.max(0, breather.cooldown - dt)
    }
    if (state.boss) tickBoss(state.boss, dt)
    for (const enemy of state.enemies) {
        if (!inPlay(enemy)) {
            enemy.respawnIn -= dt
            // Back in play where it waited (its spawn). Its move progress
            // starts from 0, so it waits a moment before moving, but it can
            // catch at once (the blink before was the warning).
            if (enemy.respawnIn <= EPSILON) enemy.respawnIn = 0
            continue
        }
        enemy.statuses = enemy.statuses.filter((s) => {
            s.left -= dt
            return s.left > EPSILON
        })
    }
    const expired: ActiveTile[] = []
    state.tiles = state.tiles.filter((t) => {
        t.left -= dt
        if (t.left > EPSILON) return true
        expired.push(t)
        return false
    })
    // Only one opened-wall effect can be on a cell at a time (another
    // needs a wall there), so its end always brings the wall back. Every
    // wall due grows back before anyone is pushed out, so nobody in a run
    // of them (the Boar's tunnel) is pushed into one about to grow back.
    const regrown = expired.filter((t) => t.effect.opensWall)
    for (const t of regrown) state.cells[t.pos.y][t.pos.x] = Cell.wall
    for (const t of regrown) pushOutOfWall(state, t.pos)
    if (expired.some((t) => t.effect.ice)) rebuildIce(state)
}

// Move anyone standing in the wall just grown back at `pos` out: back to
// the cell they came from if that is open, else to the nearest open cell
// (direction order on ties). They arrive there at rest, not gliding. Cells
// under a boss in play don't count as open: it treats an opened wall as a
// wall, so it often waits right where they came from, and landing there
// would be a catch they did nothing to earn. When players bump
// (GameState.playersBump), a player isn't put on another player in play's
// cell either, so the two never stack. An enemy a short punch knocks out
// of it (KDA-288) doesn't turn back into it, but carries on (see
// skipKnockTurn).
function pushOutOfWall(state: GameState, pos: Vec2) {
    const boss = state.boss && !state.boss.defeated ? state.boss : null
    const open = (p: Vec2) =>
        state.cells[p.y][p.x] !== Cell.wall &&
        !(boss && inFootprint(boss.pos, p))
    // Another player in play on `p`, which `c` mustn't be put on.
    const bumped = (c: Character, p: Vec2) =>
        state.playersBump &&
        state.players.some(
            (o) => o.character !== c && !o.out && samePos(o.character.pos, p)
        )
    // Players out of play too, so none is left inside the wall (enemies
    // may go after where an out player stands).
    const players = state.players.map((p) => p.character)
    for (const enemy of state.enemies) {
        if (samePos(enemy.lastPos, pos)) skipKnockTurn(enemy)
    }
    for (const c of [...players, ...state.enemies]) {
        if (!samePos(c.pos, pos)) continue
        const free = players.includes(c)
            ? (p: Vec2) => open(p) && !bumped(c, p)
            : open
        const back =
            !samePos(c.lastPos, pos) && free(c.lastPos)
                ? c.lastPos
                : nearestOpen(state.cells, pos, free)
        if (!back) continue
        c.pos = vec2(back.x, back.y)
        c.lastPos = vec2(back.x, back.y)
        endKnock(c)
    }
}

// The nearest cell to `from` that is `open` (breadth-first, through every
// cell, since `from` is a wall), or null if there is none.
function nearestOpen(
    cells: Cells,
    from: Vec2,
    open: (p: Vec2) => boolean
): Vec2 | null {
    const seen = new Set([key(from)])
    const queue = [from]
    for (let head = 0; head < queue.length; head++) {
        for (const d of allDirections.map((dir) => directions[dir])) {
            const q = add(cells, queue[head], d)
            if (seen.has(key(q))) continue
            if (open(q)) return q
            seen.add(key(q))
            queue.push(q)
        }
    }
    return null
}

// ---- HUD ----

// What the HUD's energy meter shows (see Hud in render.ts).
export type EnergyHud = {
    energy: number
    max: number
    // The breath's cost per charge level, marked on the meter.
    cost: number
    // Whether a breath would fire now (enough energy, no cooldown).
    ready: boolean
    // While the breath charges, the level it has reached (see chargeLevel),
    // which the meter shows; 0 (or left out) otherwise.
    charge?: number
}

// Player `index`'s meter (player 1's unless given).
export function energyHud(state: GameState, index = 0): EnergyHud {
    const b = state.players[index].breather
    return {
        energy: b.energy,
        max: b.breath.maxEnergy,
        cost: b.breath.cost,
        ready: canBreathe(b),
        charge: chargeLevel(b),
    }
}
