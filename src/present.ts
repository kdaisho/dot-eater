import type { Random } from "./ai"
import { footprint, inFootprint } from "./boss"
import { addStatus, inPlay, type EnemyStatus } from "./breath"
import type { Character } from "./character"
import {
    AiType,
    Cell,
    DOT_POINTS,
    ENEMY_DAMAGE,
    MAX_ENEMIES,
    MAX_HEALTH,
} from "./constants"
import { enemySpeed } from "./difficulty"
import { emit } from "./events"
import type { GameState, Player } from "./game"
import { distanceMap, openNeighbours } from "./path"
import { createSplitter, GONE } from "./splitter"
import { samePos, vec2, type Vec2 } from "./vec2"

// Present boxes (KDA-324): a strong enemy defeated by a breath may drop a
// box on its cell, and the boss drops one as its health falls. A player
// stepping onto a box opens it, for something good (Heal, Huge dot, Speed
// boost, Earthquake) or, now and then, bad (a Germ: a Splitter jumps out).
// Pure, no DOM: randomness comes in as `random`, time as `dt`. game.ts
// calls tickPresents with the other timers, then dropPresents and
// openPresents once everyone has moved; render.ts draws the boxes and
// what they let out (see presentView.ts).
//
// Every number here is a placeholder to tune at preview.

// What a box can hold.
export const PresentContent = {
    heal: "heal",
    hugeDot: "hugeDot",
    speed: "speed",
    quake: "quake",
    germ: "germ",
} as const
export type PresentContent =
    (typeof PresentContent)[keyof typeof PresentContent]

// How likely each content is, by weight (out of their sum, 10). Rolled in
// this order (see rollContent), so a random number near 0 gives a Heal and
// one near 1 a Germ.
export const PRESENT_WEIGHTS: Readonly<Record<PresentContent, number>> = {
    heal: 1,
    hugeDot: 2,
    speed: 2.5,
    quake: 3,
    germ: 1.5,
}

// The chance a strong enemy (see DROPPERS) defeated by a breath drops a
// box.
export const PRESENT_DROP_CHANCE = 0.15
// The strong enemies: they may drop a box when defeated. A Splitter only
// when whole (as it splits), not its halves; a Germ never.
export const DROPPERS: ReadonlySet<AiType> = new Set([
    AiType.breather,
    AiType.interceptor,
    AiType.splitter,
    AiType.phantom,
])
// The boss drops a box each time its health first falls to one of these
// fractions of its full health.
export const BOSS_DROP_AT: readonly number[] = [0.75, 0.5, 0.25]
// Seconds a box lasts unopened (it blinks before it goes, see
// presentView.ts).
export const PRESENT_SECONDS = 10

// Heal: health back, one enemy touch's worth (a heart), up to MAX_HEALTH.
export const HEAL_HEALTH = ENEMY_DAMAGE
// Huge dot: this many dots' score (it isn't a dot on the map, so it doesn't
// count towards clearing the stage), and the breath meter filled.
export const HUGE_DOT_DOTS = 10
// Speed boost: the opener moves this many times as fast for
// SPEED_BOOST_SECONDS (another one meanwhile starts the time again).
export const SPEED_BOOST = 1.4
export const SPEED_BOOST_SECONDS = 5
// Earthquake: every enemy in play is frozen in a panic for QUAKE_SECONDS:
// it doesn't move and its touch is harmless, as in the Penguin's freeze.
// The boss isn't: it only gets the board's shake.
export const QUAKE_SECONDS = 4
// Germ: the Splitter is in the air (holding still, harmless) this long
// after it jumps out, until it lands on its cell (see revealFrame).
export const GERM_LAND_SECONDS = 0.64
// Seconds a box's opening is drawn (the box opening, the icon popping up
// over the opener, its label floating up), from the moment it opens.
export const REVEAL_SECONDS = 1.5

// An Earthquake's freeze on an enemy.
export const QUAKE: EnemyStatus = {
    name: "present.quake",
    holds: true,
    harmless: true,
    panics: true,
}

// A Germ in the air, from the box to its cell.
export const GERM_LANDING: EnemyStatus = {
    name: "present.germLanding",
    holds: true,
    harmless: true,
}

// A box on a cell, with `left` seconds to go before it vanishes.
export type Present = { pos: Vec2; left: number }

// A box being opened, for drawing (REVEAL_SECONDS): where it was, who
// opened it (a player's index), what was in it, the Germ's main slot for a
// Germ (null otherwise) and seconds since it opened.
export type Reveal = {
    pos: Vec2
    player: number
    content: PresentContent
    germ: number | null
    age: number
}

export type Presents = {
    // The boxes on the map, at most one a cell, oldest first.
    boxes: Present[]
    // The boxes opened in the last REVEAL_SECONDS, oldest first.
    reveals: Reveal[]
    // How many of BOSS_DROP_AT the boss has dropped its box for.
    bossDrops: number
}

// A player's Speed boost: `left` seconds to go, and its speed before it,
// to go back to.
export type SpeedBoost = { left: number; speed: number }

export function createPresents(): Presents {
    return { boxes: [], reveals: [], bossDrops: 0 }
}

// Tolerance for timers counting down by dt, as in game.ts.
const EPSILON = 1e-9

// Count the boxes, the reveals and the players' Speed boosts on by `dt`
// seconds, at the start of a tick: a box out of time vanishes (a
// presentExpired event), and a boost out of time gives its player its
// speed back.
export function tickPresents(state: GameState, dt: number) {
    const { presents } = state
    presents.boxes = presents.boxes.filter((box) => {
        box.left -= dt
        if (box.left > EPSILON) return true
        emit(state, { type: "presentExpired", at: vec2(box.pos.x, box.pos.y) })
        return false
    })
    ageReveals(state, dt)
    for (const player of state.players) {
        const boost = player.speedBoost
        if (!boost) continue
        boost.left -= dt
        if (boost.left > EPSILON) continue
        player.character.speed = boost.speed
        player.speedBoost = null
    }
}

// Move the reveals on by `dt` seconds, dropping the ones that are over.
// The outro (see settle in game.ts) calls it too, so a box opened on the
// last tick finishes opening.
export function ageReveals(state: GameState, dt: number) {
    const { presents } = state
    for (const r of presents.reveals) r.age += dt
    presents.reveals = presents.reveals.filter(
        (r) => r.age < REVEAL_SECONDS - EPSILON
    )
}

// Drop this tick's boxes, once everyone has moved: one for each strong
// enemy a breath defeated this tick (its enemyDefeated event, on the cell
// it stood on) with PRESENT_DROP_CHANCE, by `random`; and the boss's for
// each of BOSS_DROP_AT its health has fallen to since its last (see
// bossDropCell). A cell holds one box at most: a drop on a cell that has
// one is lost.
export function dropPresents(state: GameState, random: Random) {
    for (const event of state.events) {
        if (event.type !== "enemyDefeated") continue
        const enemy = state.enemies[event.enemy]
        if (!enemy || !drops(enemy, event.split)) continue
        // The top of the range, so a random source fixed at 0 never drops.
        if (random() < 1 - PRESENT_DROP_CHANCE) continue
        placeBox(state, event.at)
    }
    const { boss, presents } = state
    if (!boss || boss.defeated) return
    const crossed = BOSS_DROP_AT.filter(
        (f) => boss.health <= f * boss.maxHealth + EPSILON
    ).length
    for (; presents.bossDrops < crossed; presents.bossDrops++) {
        const cell = bossDropCell(state)
        if (cell) placeBox(state, cell)
    }
}

// Whether `enemy`, just defeated (`split` when it was a whole Splitter,
// which splits), drops a box: a strong enemy's (DROPPERS), a Splitter only
// as it splits, never a Germ.
function drops(enemy: Character, split: boolean): boolean {
    if (enemy.germ || !DROPPERS.has(enemy.ai)) return false
    return enemy.ai !== AiType.splitter || split
}

// Put a fresh box on `at`, unless there is one there, reporting a
// presentDropped event. Returns whether it did.
export function placeBox(state: GameState, at: Vec2): boolean {
    const { boxes } = state.presents
    if (state.cells[at.y][at.x] === Cell.wall) return false
    if (boxes.some((b) => samePos(b.pos, at))) return false
    boxes.push({ pos: vec2(at.x, at.y), left: PRESENT_SECONDS })
    emit(state, { type: "presentDropped", at: vec2(at.x, at.y) })
    return true
}

// Where the boss drops its box: the open cell nearest its footprint by
// path (direction order on ties) that is outside it and holds no box nor a
// player in play. Null if there is none.
export function bossDropCell(state: GameState): Vec2 | null {
    const { boss, cells } = state
    if (!boss) return null
    const body = footprint(boss.pos)
    const seen = new Set(body.map(key))
    const queue = [...body]
    for (let head = 0; head < queue.length; head++) {
        for (const next of openNeighbours(cells, queue[head])) {
            if (seen.has(key(next))) continue
            seen.add(key(next))
            queue.push(next)
            if (inFootprint(boss.pos, next)) continue
            if (hasBox(state, next) || playerOn(state, next)) continue
            return next
        }
    }
    return null
}

// Open the box under each player in play, player 1 first: whoever's cell
// (pos) it is on, so the box opens as the move onto it starts, as a dot is
// eaten. A box dropped on a player's own cell opens at once.
export function openPresents(state: GameState, random: Random) {
    state.players.forEach((player) => {
        if (player.out) return
        const { boxes } = state.presents
        const at = player.character.pos
        const i = boxes.findIndex((b) => samePos(b.pos, at))
        if (i < 0) return
        const [box] = boxes.splice(i, 1)
        openBox(state, player, box.pos, random)
    })
}

// `player` opens the box on `at`: what is inside is rolled by `random`
// (see rollContent) and takes effect, reported as a presentOpened event,
// and its reveal starts. A Germ with no room for it (MAX_ENEMIES in play
// already) or no cell to land on (see germCell) is rolled again, without
// the Germ.
export function openBox(
    state: GameState,
    player: Player,
    at: Vec2,
    random: Random
) {
    let content = rollContent(random)
    let germAt: Vec2 | null = null
    if (content === PresentContent.germ) {
        germAt = enemyCount(state) < MAX_ENEMIES ? germCell(state, at) : null
        if (!germAt) content = rollContent(random, false)
    }
    let germ: number | null = null
    switch (content) {
        case PresentContent.heal:
            player.health = Math.min(MAX_HEALTH, player.health + HEAL_HEALTH)
            break
        case PresentContent.hugeDot:
            player.score += HUGE_DOT_DOTS * DOT_POINTS
            player.breather.energy = player.breather.breath.maxEnergy
            break
        case PresentContent.speed:
            boostSpeed(player)
            break
        case PresentContent.quake:
            for (const enemy of state.enemies) {
                if (inPlay(enemy)) addStatus(enemy, QUAKE, QUAKE_SECONDS)
            }
            break
        case PresentContent.germ:
            germ = spawnGerm(state, germAt!)
            break
    }
    const index = state.players.indexOf(player)
    const pos = vec2(at.x, at.y)
    emit(state, {
        type: "presentOpened",
        player: index,
        at: pos,
        content,
        ...(germ === null ? {} : { germ }),
    })
    state.presents.reveals.push({ pos, player: index, content, germ, age: 0 })
}

// What a box holds, by PRESENT_WEIGHTS: one number from `random`, through
// the contents in their order. Without `germ`, never the Germ.
export function rollContent(random: Random, germ = true): PresentContent {
    const contents = (Object.keys(PRESENT_WEIGHTS) as PresentContent[]).filter(
        (c) => germ || c !== PresentContent.germ
    )
    const total = contents.reduce((sum, c) => sum + PRESENT_WEIGHTS[c], 0)
    let roll = random() * total
    for (const c of contents) {
        roll -= PRESENT_WEIGHTS[c]
        if (roll < 0) return c
    }
    return contents[contents.length - 1]
}

// Speed `player` up by SPEED_BOOST for SPEED_BOOST_SECONDS, or, already
// boosted, start its time again.
function boostSpeed(player: Player) {
    const { character } = player
    if (player.speedBoost) {
        player.speedBoost.left = SPEED_BOOST_SECONDS
        return
    }
    player.speedBoost = { left: SPEED_BOOST_SECONDS, speed: character.speed }
    character.speed *= SPEED_BOOST
}

// The enemies in play or coming back, as MAX_ENEMIES counts them: a
// Splitter (two slots) as one, and a Germ gone for good not at all.
export function enemyCount(state: GameState): number {
    return state.enemies.filter(
        (e, i) => e.part?.slot !== "spare" && !germGone(state, i)
    ).length
}

// Whether the slot at `i` is a Germ's main slot whose halves are both gone
// for good.
function germGone(state: GameState, i: number): boolean {
    const main = state.enemies[i]
    const spare = state.enemies[i + 1]
    return (
        main.germ === true &&
        main.part?.slot === "main" &&
        main.respawnIn === GONE &&
        spare?.respawnIn === GONE
    )
}

// Where a Germ from the box on `at` lands: an open cell next to it that
// isn't a player in play's cell nor the one it is gliding out of (so it
// can't catch anyone as it lands), nor under the live boss, the farthest
// by path from the nearest player in play (direction order on ties). Null
// if there is none.
export function germCell(state: GameState, at: Vec2): Vec2 | null {
    const { cells, boss } = state
    const players = state.players.filter((p) => !p.out)
    const maps = players.map((p) => distanceMap(cells, p.character.pos))
    const fromPlayers = (v: Vec2) => Math.min(...maps.map((m) => m[v.y][v.x]))
    const free = openNeighbours(cells, at).filter(
        (v) =>
            !players.some(
                ({ character: c }) => samePos(v, c.pos) || samePos(v, c.lastPos)
            ) && !(boss && !boss.defeated && inFootprint(boss.pos, v))
    )
    let best: Vec2 | null = null
    for (const v of free) {
        if (!best || fromPlayers(v) > fromPlayers(best)) best = v
    }
    return best
}

// Let a Germ out onto `at`: a whole Splitter (see splitter.ts) at the
// difficulty's speed, both its slots marked germ, in the air for
// GERM_LAND_SECONDS. It takes the slots of a Germ gone for good if
// there is one, so Germs never pile up slots, else two new ones at the end
// of GameState.enemies. Its spawn is `at`. Returns its main slot.
function spawnGerm(state: GameState, at: Vec2): number {
    const { enemies } = state
    const reuse = enemies.findIndex((_, i) => germGone(state, i))
    const i = reuse >= 0 ? reuse : enemies.length
    const ids: [number, number] =
        reuse >= 0
            ? [enemies[i].id, enemies[i + 1].id]
            : (() => {
                  const top = Math.max(0, ...enemies.map((e) => e.id))
                  return [top + 1, top + 2]
              })()
    const slots = createSplitter(ids, vec2(at.x, at.y))
    const { difficulty } = state
    for (const slot of slots) {
        slot.germ = true
        if (!difficulty) continue
        slot.speed = enemySpeed(slot.speed, difficulty)
        slot.part!.wholeSpeed = enemySpeed(slot.part!.wholeSpeed, difficulty)
        slot.part!.halfSpeed = enemySpeed(slot.part!.halfSpeed, difficulty)
    }
    addStatus(slots[0], GERM_LANDING, GERM_LAND_SECONDS)
    enemies.splice(i, 2, ...slots)
    const spawns = [...state.spawns.enemies]
    spawns.splice(i, 2, vec2(at.x, at.y), vec2(at.x, at.y))
    state.spawns = { ...state.spawns, enemies: spawns }
    return i
}

// Take every box off the map, when the stage ends (won or lost). Reveals
// already under way finish.
export function clearPresents(state: GameState) {
    state.presents.boxes = []
}

function hasBox(state: GameState, cell: Vec2): boolean {
    return state.presents.boxes.some((b) => samePos(b.pos, cell))
}

function playerOn(state: GameState, cell: Vec2): boolean {
    return state.players.some((p) => !p.out && samePos(p.character.pos, cell))
}

function key(v: Vec2): string {
    return `${v.x},${v.y}`
}
