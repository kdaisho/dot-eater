import { inPlay } from "./breath"
import { emit } from "./events"
import type { GameState } from "./game"
import { glidePos } from "./glide"
import { vec2, type Vec2 } from "./vec2"

// The boss's defeat (KDA-301) and, after the final boss's, everyone's hop
// for joy (KDA-303): a short timeline that plays in the `ending` outro
// (see flow.ts) between the killing blow and the stage clear. Pure, no
// DOM: time comes in as `dt`, and anything that looks random comes from
// a fixed hash, so a replay draws and sounds the same every time.
//
// The killing blow ends the game on its tick, as before (see checkEnd in
// game.ts): nothing steps from then on, so the enemies stop, nobody can
// move and nobody can be hurt. What changes is the outro. It now waits
// for the effect, and the game's gameWon (the clear jingle) waits for the
// effect too, the way KDA-302 held it back for the last dot: settle (see
// game.ts) moves the timeline on and reports gameWon when the jingle is
// due, and the end screen follows once the whole timeline is over.
//
// Two effects, picked by the user from an animated design page:
//
// - "burst" (Freeze-frame and burst, the Kitsune on stage 5): a 0.4 s
//   hit-stop with the game frozen (glides too, see defeatTimeScale) and
//   the boss flashing white, a 0.3 s shake, then the boss shatters into
//   its own pixels, which scatter and fall for 1.3 s. Jingle at 2.0 s.
// - "chain" (Explosion chain, the final boss on stage 10): CHAIN_BLASTS
//   small blasts across the 2x2 footprint, faster and faster, over 1.45
//   s; one big blast and a white-out, 0.55 s; then smoke, 0.5 s, over a
//   scorch mark. Jingle at 2.5 s.
//
// The final boss (Boss.kind "final", stage 10) gets the chain and then the
// celebration: every character still on the map (the players in play and
// every enemy in play, frozen or stunned ones included) hops in place for
// CELEBRATION_SECONDS, each a little after the one before so it reads as
// a crowd, with a small heart popping over each enemy, freed from the
// boss. The jingle starts with the hops; the ending follows them. Any
// other boss gets the burst and no hops.
//
// The renderer draws all of it from the BossDefeat and the functions
// here (render.ts): what to draw is decided here, how it looks there.

// The two defeat effects (see the top of this file).
export type DefeatEffect = "burst" | "chain"

// The parts of an effect, in order. "celebrate" follows the effect on a
// finale; "over" is everything after the timeline.
export type DefeatPhase =
    | "hitStop"
    | "shake"
    | "shatter"
    | "chain"
    | "blast"
    | "smoke"
    | "celebrate"
    | "over"

// Each effect's phases and how long each lasts, in seconds, as the user
// picked them on the design page.
export const DEFEAT_PHASES: Readonly<
    Record<DefeatEffect, readonly (readonly [DefeatPhase, number])[]>
> = {
    burst: [
        ["hitStop", 0.4],
        ["shake", 0.3],
        ["shatter", 1.3],
    ],
    chain: [
        ["chain", 1.45],
        ["blast", 0.55],
        ["smoke", 0.5],
    ],
}

// How long everyone hops for joy after the final boss's effect (KDA-303).
export const CELEBRATION_SECONDS = 2.4
// One hop's length, how high it goes (in cells: 9 px of a 28 px cell on
// the design page) and how long each character waits after the one before
// it to start hopping.
export const HOP_SECONDS = 0.42
export const HOP_HEIGHT = 0.32
export const HOP_STAGGER = 0.11
// The most hops a character makes; one whose turn comes late makes fewer,
// so every hop lands before the celebration ends.
export const MOST_HOPS = 4
// An enemy's heart pops up this long after its hop starts.
export const HEART_DELAY = 0.12

// The small blasts of the chain and when the first comes. They come
// faster and faster: blast k of n at CHAIN_FIRST + CHAIN_SPAN * sqrt(k/n).
export const CHAIN_BLASTS = 14
const CHAIN_FIRST = 0.08
const CHAIN_SPAN = 1.3

// How much the view zooms in on the boss during the effect (6%), and how
// long it takes to ease in and back out.
export const DEFEAT_ZOOM = 0.06
const ZOOM_IN_SECONDS = 0.3
const ZOOM_OUT_SECONDS = 0.4

// One character that hops in the celebration: a player or an enemy, by its
// index in GameState.players or GameState.enemies.
export type Hopper = { kind: "player" | "enemy"; index: number }

export type BossDefeat = {
    effect: DefeatEffect
    // Whether everyone hops for joy after the effect (the finale).
    celebrate: boolean
    // Where the boss was drawn when it fell: the top-left cell of its
    // footprint, in cell units (so between cells when it fell mid-glide).
    // The effect plays here; the boss itself is no longer drawn.
    at: Vec2
    // Seconds since the killing blow.
    elapsed: number
    // Who hops, in the order they start (players first, then enemies, each
    // by index). Taken when the boss falls; nothing moves after that.
    hoppers: readonly Hopper[]
}

// A small blast of the chain: when it pops (seconds from the blow), where
// (its offset from the footprint's centre, in cells) and how big (its
// radius, in cells).
export type ChainBlast = { at: number; dx: number; dy: number; radius: number }

// A number in [0, 1) from `n`, the same every time: a small integer hash,
// for the spread of the blasts and the shards, so nothing here (or in the
// renderer) needs Math.random and replays stay the same.
export function hash01(n: number): number {
    let h = Math.imul(Math.floor(n) ^ 0x9e3779b9, 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
}

// The chain's small blasts, in the order they pop.
export const CHAIN: readonly ChainBlast[] = Array.from(
    { length: CHAIN_BLASTS },
    (_, k) => ({
        at: CHAIN_FIRST + CHAIN_SPAN * Math.sqrt(k / CHAIN_BLASTS),
        // Anywhere over the sprite, which is 1.6 cells across.
        dx: (hash01(k * 3 + 1) - 0.5) * 1.6,
        dy: (hash01(k * 5 + 2) - 0.5) * 1.6,
        radius: (9 + 6 * hash01(k * 7 + 3)) / 28,
    })
)

// When the burst's boss shatters (the end of its shake), and when the
// chain's big blast goes off (the end of its small ones).
export const SHATTER_AT = 0.7
export const BIG_BLAST_AT = 1.45

// The boss's defeat as it falls in `state`: its effect and whether everyone
// hops after it (`finale`), where it was drawn (its glide at the tick, so
// between ticks frames don't move it) and who would hop.
export function startDefeat(state: GameState, finale: boolean): BossDefeat {
    const { boss } = state
    if (!boss) throw new Error("No boss to defeat")
    const cols = state.cells[0]?.length ?? 0
    const rows = state.cells.length
    const at = glidePos(boss, 0, cols, rows)
    const hoppers: Hopper[] = [
        ...state.players.flatMap((p, index): Hopper[] =>
            p.out ? [] : [{ kind: "player", index }]
        ),
        ...state.enemies.flatMap((e, index): Hopper[] =>
            inPlay(e) ? [{ kind: "enemy", index }] : []
        ),
    ]
    return {
        effect: finale ? "chain" : "burst",
        celebrate: finale,
        at: vec2(at.x, at.y),
        elapsed: 0,
        hoppers: finale ? hoppers : [],
    }
}

// The middle of the footprint the boss fell on, in cell units (a cell's
// centre is its whole-number position).
export function defeatCentre(defeat: BossDefeat): Vec2 {
    return vec2(defeat.at.x + 0.5, defeat.at.y + 0.5)
}

// How long the effect lasts: the clear jingle starts at its end.
export function effectSeconds(effect: DefeatEffect): number {
    return DEFEAT_PHASES[effect].reduce((sum, [, s]) => sum + s, 0)
}

// When the clear jingle (gameWon) is due, in seconds from the blow.
export function jingleAt(defeat: BossDefeat): number {
    return effectSeconds(defeat.effect)
}

// How long the whole timeline lasts, celebration included: the end screen
// comes after it.
export function defeatSeconds(defeat: BossDefeat): number {
    return jingleAt(defeat) + (defeat.celebrate ? CELEBRATION_SECONDS : 0)
}

// The phase `defeat` is in at `elapsed` (its own by default), and how far
// into it, in seconds and as a share of its length (`progress`, 0 to 1).
// "over" has no length: its progress is 1.
export function defeatPhase(
    defeat: BossDefeat,
    elapsed = defeat.elapsed
): { phase: DefeatPhase; time: number; progress: number } {
    let start = 0
    const phases: (readonly [DefeatPhase, number])[] = [
        ...DEFEAT_PHASES[defeat.effect],
    ]
    if (defeat.celebrate) phases.push(["celebrate", CELEBRATION_SECONDS])
    for (const [phase, length] of phases) {
        if (elapsed < start + length - 1e-9) {
            const time = Math.max(0, elapsed - start)
            return { phase, time, progress: time / length }
        }
        start += length
    }
    return { phase: "over", time: elapsed - start, progress: 1 }
}

// How fast the characters' glides go on during the defeat, as a factor on
// real time: 0 in the hit-stop (the game frozen on the blow), 1 otherwise,
// so anyone mid-glide comes to rest on their cell and then stays put.
export function defeatTimeScale(defeat: BossDefeat): number {
    return defeatPhase(defeat).phase === "hitStop" ? 0 : 1
}

// Whether the whole timeline is over (the end screen may follow).
export function defeatOver(defeat: BossDefeat): boolean {
    return defeat.elapsed >= defeatSeconds(defeat) - 1e-9
}

// Move `state`'s defeat on by `dt` seconds, reporting what it crossed: the
// burst's shatter (bossShattered), each blast of the chain (bossBlast),
// and the clear jingle (gameWon, once, when GameState.winHeld is still
// set). Events go in the order they are due. Nothing without a defeat.
export function advanceDefeat(state: GameState, dt: number) {
    const defeat = state.defeat
    if (!defeat) return
    const from = defeat.elapsed
    const to = from + dt
    defeat.elapsed = to
    // Crossed: due after `from` and by `to`, give or take the rounding of
    // adding up ticks.
    const crossed = (at: number) => at > from + 1e-9 && at <= to + 1e-9
    const centre = defeatCentre(defeat)
    if (defeat.effect === "burst") {
        if (crossed(SHATTER_AT))
            emit(state, { type: "bossShattered", at: centre })
    } else {
        for (const blast of CHAIN) {
            if (!crossed(blast.at)) continue
            emit(state, {
                type: "bossBlast",
                at: vec2(centre.x + blast.dx, centre.y + blast.dy),
                big: false,
            })
        }
        if (crossed(BIG_BLAST_AT)) {
            emit(state, { type: "bossBlast", at: centre, big: true })
        }
    }
    if (state.winHeld && to >= jingleAt(defeat) - 1e-9) {
        state.winHeld = false
        emit(state, { type: "gameWon" })
    }
}

// How many hops hopper number `order` (its place in BossDefeat.hoppers)
// makes: MOST_HOPS, or fewer when its turn comes too late for them all
// to land within the celebration.
export function hopsOf(order: number): number {
    const left = CELEBRATION_SECONDS - order * HOP_STAGGER
    return Math.max(
        0,
        Math.min(MOST_HOPS, Math.floor(left / HOP_SECONDS + 1e-9))
    )
}

// How high hopper number `order` is off its cell, in cells (0 on the
// floor), at `elapsed`: a run of hops, each half a sine, starting
// HOP_STAGGER after the one before it. Always 0 outside the celebration.
export function hopHeight(
    defeat: BossDefeat,
    order: number,
    elapsed = defeat.elapsed
): number {
    if (!defeat.celebrate) return 0
    const t = elapsed - jingleAt(defeat) - order * HOP_STAGGER
    if (t < 0) return 0
    const hop = t / HOP_SECONDS
    if (hop >= hopsOf(order)) return 0
    return HOP_HEIGHT * Math.sin(Math.PI * (hop % 1))
}

// Hopper `order`'s place among the hoppers for a player or an enemy, or
// -1 if it doesn't hop (no celebration, or it wasn't on the map).
export function hopOrder(
    defeat: BossDefeat,
    kind: Hopper["kind"],
    index: number
): number {
    return defeat.hoppers.findIndex((h) => h.kind === kind && h.index === index)
}

// The heart over an enemy hopper `order` (KDA-303): null until it pops,
// HEART_DELAY after the enemy's hops start; then its size as a factor (it
// pops up to 1.25 and settles back to 1) and how far it has risen over the
// enemy, in cells. Players get none: the heart says the enemy is freed.
export function heartOf(
    defeat: BossDefeat,
    order: number,
    elapsed = defeat.elapsed
): { scale: number; rise: number } | null {
    const hopper = defeat.hoppers[order]
    if (!defeat.celebrate || hopper?.kind !== "enemy") return null
    const t = elapsed - jingleAt(defeat) - order * HOP_STAGGER - HEART_DELAY
    if (t < 0) return null
    const scale =
        t < 0.12
            ? (t / 0.12) * 1.25
            : t < 0.22
              ? 1.25 - ((t - 0.12) / 0.1) * 0.25
              : 1
    return { scale, rise: (Math.min(t, 0.6) * 4) / 28 }
}

// How much the view zooms in on the boss, as a factor on the cell size: up
// to 1 + DEFEAT_ZOOM, eased in over the first 0.3 s, held, and eased back
// out after the jingle on a finale (during the hops). The burst's ends on
// the stage clear, still zoomed in.
export function defeatZoom(
    defeat: BossDefeat,
    elapsed = defeat.elapsed
): number {
    const end = jingleAt(defeat)
    const zoomIn = smooth(clamp(elapsed / ZOOM_IN_SECONDS))
    const zoomOut = defeat.celebrate
        ? smooth(clamp((elapsed - end) / ZOOM_OUT_SECONDS))
        : 0
    return 1 + DEFEAT_ZOOM * (elapsed <= end ? zoomIn : 1 - zoomOut)
}

function clamp(x: number): number {
    return Math.min(1, Math.max(0, x))
}

// Smoothstep: eases in and out over [0, 1].
function smooth(x: number): number {
    return x * x * (3 - 2 * x)
}
