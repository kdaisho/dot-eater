// The end roll: the credits after a story run's ending (flow.ts's endRoll
// screen). The cast comes on card by card (heroes, enemies, the Phantom
// Lord), each sliding in from the right, resting for its name, ability and
// one line, then sliding out to the left. Then all the cards lie in a
// grid while the staff credits run, and it closes on THE END, which
// changes with the difficulty the run was cleared on. It is timed to the
// end roll music (recorded.ts) and drawn by endRollRender.ts. No DOM
// access here.

import { AiType } from "./constants"
import type { Difficulty } from "./difficulty"
import { AnimalId } from "./roster"

// One cast card: who, the sprite its portrait shows, and its three lines.
// A hero's line is about them; an enemy's is a quote from it.
export type CastCard = {
    // An animal or an enemy's AI; the Phantom Lord is the boss.
    who:
        | { kind: "animal"; id: AnimalId }
        | { kind: "enemy"; ai: AiType }
        | { kind: "boss" }
    sprite: string
    name: string
    ability: string
    line: string
    // The colour of the portrait's empty tiles.
    tile: string
}

const ENEMY_TILE = "#4428bc"

export const CAST: readonly CastCard[] = [
    {
        who: { kind: "animal", id: AnimalId.dragon },
        sprite: "dragon",
        name: "DRAGON",
        ability: "FIRE BREATH",
        line: "Hot-headed and brave.",
        tile: "#fce0a8",
    },
    {
        who: { kind: "animal", id: AnimalId.penguin },
        sprite: "penguin",
        name: "PENGUIN",
        ability: "ICE BREATH",
        line: "Cool on any floor.",
        tile: "#3cbcfc",
    },
    {
        who: { kind: "animal", id: AnimalId.owl },
        sprite: "owl",
        name: "OWL",
        ability: "WIND BREATH",
        line: "Quick to breathe again.",
        tile: "#b8f818",
    },
    {
        who: { kind: "animal", id: AnimalId.skunk },
        sprite: "skunk",
        name: "SKUNK",
        ability: "SMELLY BREATH",
        line: "Floods the halls. Phew!",
        tile: "#f878f8",
    },
    {
        who: { kind: "animal", id: AnimalId.boar },
        sprite: "boar",
        name: "BOAR",
        ability: "WALL BREAK",
        line: "Bores right through walls.",
        tile: "#a4e4fc",
    },
    {
        who: { kind: "enemy", ai: AiType.random },
        sprite: "tengu",
        name: "TENGU",
        ability: "THE WANDERER",
        line: '"I took a wrong turn. Again."',
        tile: ENEMY_TILE,
    },
    {
        who: { kind: "enemy", ai: AiType.chase },
        sprite: "oni",
        name: "ONI",
        ability: "THE CHASER",
        line: '"I never stop chasing you!"',
        tile: ENEMY_TILE,
    },
    {
        who: { kind: "enemy", ai: AiType.ambusher },
        sprite: "fox",
        name: "FOX",
        ability: "THE AMBUSHER",
        line: '"Peekaboo! Got you!"',
        tile: ENEMY_TILE,
    },
    {
        who: { kind: "enemy", ai: AiType.patroller },
        sprite: "robot",
        name: "ROBOT",
        ability: "THE PATROLLER",
        line: '"Beep. Same route. Always."',
        tile: ENEMY_TILE,
    },
    {
        who: { kind: "enemy", ai: AiType.phantom },
        sprite: "ghost",
        name: "GHOST",
        ability: "THE PHANTOM",
        line: '"Walls? What walls?"',
        tile: ENEMY_TILE,
    },
    {
        who: { kind: "enemy", ai: AiType.splitter },
        sprite: "germ",
        name: "GERM",
        ability: "THE SPLITTER",
        line: '"Hit me and meet my twin!"',
        tile: ENEMY_TILE,
    },
    {
        who: { kind: "enemy", ai: AiType.breather },
        sprite: "snake",
        name: "SNAKE",
        ability: "THE BREATHER",
        line: '"Sss... Sssss! SSSSSSS!!"',
        tile: ENEMY_TILE,
    },
    {
        who: { kind: "enemy", ai: AiType.interceptor },
        sprite: "wolf",
        name: "WOLF",
        ability: "THE INTERCEPTOR",
        line: '"I know where you\'re going."',
        tile: ENEMY_TILE,
    },
    {
        who: { kind: "boss" },
        sprite: "boss",
        name: "PHANTOM LORD",
        ability: "FINAL BOSS",
        line: '"Shall we dance instead?"',
        tile: "#1c0c3c",
    },
]

// One staff credit: the role, then a name a line; `icon` is a sprite drawn
// after the last name.
export type StaffCredit = {
    role: string
    names: readonly string[]
    icon?: string
}

export const STAFF: readonly StaffCredit[] = [
    {
        role: "GAME BY",
        names: ["DAISHO KOMIYAMA", "& CLAUDE CODE"],
        icon: "claude",
    },
    { role: "MUSIC", names: ["DJARTMUSIC"] },
    { role: "PRESENTED BY", names: ["DAISHODESIGN"] },
    { role: "THANK YOU", names: ["FOR PLAYING!"] },
]

// The timeline, in seconds of the end roll (the music runs 86 s).
export const END_ROLL = {
    // The first card comes in.
    start: 1.2,
    // Each card's turn: slide in, rest, slide out.
    perCard: 4,
    slideIn: 0.35,
    slideOut: 0.3,
    // THE END fades in here.
    ending: 78,
    // The fade from the finale to THE END.
    fade: 0.8,
    // How long THE END shows before a press goes back to the title, so a
    // press meant to skip doesn't also leave.
    endingReady: 2,
} as const

// The finale (the card grid and the staff) starts when the last card is out.
export const FINALE_AT = END_ROLL.start + CAST.length * END_ROLL.perCard

// Where the end roll is at `t` seconds.
export type EndRollPhase =
    // Before the first card.
    | { kind: "opening"; t: number }
    // Card `index` is on, `u` seconds into its turn.
    | { kind: "card"; index: number; u: number }
    // The grid and the staff, `v` seconds in.
    | { kind: "finale"; v: number }
    // The fade into THE END: `p` from 0 to 1.
    | { kind: "fade"; p: number }
    // THE END, `u` seconds in.
    | { kind: "ending"; u: number }

export function endRollPhase(t: number): EndRollPhase {
    const { start, perCard, ending, fade } = END_ROLL
    if (t < start) return { kind: "opening", t }
    if (t < FINALE_AT) {
        const index = Math.floor((t - start) / perCard)
        return { kind: "card", index, u: t - start - index * perCard }
    }
    if (t < ending) return { kind: "finale", v: t - FINALE_AT }
    if (t < ending + fade) return { kind: "fade", p: (t - ending) / fade }
    return { kind: "ending", u: t - ending - fade }
}

// Where a card is in its turn: sliding in, resting, or sliding out.
export function cardStage(u: number): "in" | "rest" | "out" {
    if (u < END_ROLL.slideIn) return "in"
    if (u > END_ROLL.perCard - END_ROLL.slideOut) return "out"
    return "rest"
}

// The staff credit showing `v` seconds into the finale (index into STAFF),
// and how long it has shown; undefined before the first and in the gaps.
export const STAFF_FROM = 3.8
export function staffAt(
    v: number
): { index: number; shown: number } | undefined {
    const per = (END_ROLL.ending - FINALE_AT - STAFF_FROM) / STAFF.length
    const index = Math.floor((v - STAFF_FROM) / per)
    if (index < 0 || index >= STAFF.length) return undefined
    const shown = v - STAFF_FROM - index * per
    return shown < per - 0.4 ? { index, shown } : undefined
}

// What a press does at `t` seconds: during the roll it skips to THE END;
// once THE END has shown END_ROLL.endingReady seconds it goes to the title;
// in between (the fade, THE END's first moments) it does nothing.
export function endRollPress(t: number): "skip" | "leave" | "none" {
    if (t < END_ROLL.ending) return "skip"
    if (t >= END_ROLL.ending + END_ROLL.fade + END_ROLL.endingReady)
        return "leave"
    return "none"
}

// Where a skip lands: the start of THE END, after the fade.
export const SKIP_TO = END_ROLL.ending + END_ROLL.fade

// THE END's look per difficulty: a plain one on Easy and Medium, a
// dance party on Hard, the true ending (crowned heroes) on Super Hard.
export function endingKind(difficulty: Difficulty): "plain" | "party" | "true" {
    if (difficulty === "superHard") return "true"
    if (difficulty === "hard") return "party"
    return "plain"
}

// Scale2x (EPX): doubles a sprite (rows of palette letters, "." clear) and
// rounds its diagonals, the classic pixel-art upscale. The portraits use
// it so 8x8 sprites read at card size.
export function scale2x(rows: readonly string[]): string[] {
    const h = rows.length
    const w = rows[0]?.length ?? 0
    const at = (x: number, y: number) =>
        x < 0 || y < 0 || x >= w || y >= h ? "." : rows[y][x]
    const out: string[][] = Array.from({ length: h * 2 }, () => [])
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const p = at(x, y)
            const a = at(x, y - 1)
            const b = at(x + 1, y)
            const c = at(x - 1, y)
            const d = at(x, y + 1)
            out[2 * y][2 * x] = c === a && c !== d && a !== b ? a : p
            out[2 * y][2 * x + 1] = a === b && a !== c && b !== d ? b : p
            out[2 * y + 1][2 * x] = d === c && d !== b && c !== a ? c : p
            out[2 * y + 1][2 * x + 1] = b === d && b !== a && d !== c ? d : p
        }
    }
    return out.map((r) => r.join(""))
}
