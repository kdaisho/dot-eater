// The Cards page (KDA-320): a trading card for every character, open from
// the start. The cards are the end roll's cast (CAST in endRoll.ts), in its
// order, numbered No.01 to No.15 as there, each with a lower half of
// details: a hero's breath as an attack with its energy cost, an enemy's
// or a boss's hit, how it moves and how to beat it. The numbers come from
// the game's own constants and level data, so a change there shows here.
// Drawn by cardsView.ts. No DOM access here.

import {
    AMBUSH_AHEAD,
    AiType,
    BOSS_BREATH_DAMAGE,
    BOSS_BREATH_EVERY,
    BOSS_BREATH_RANGE,
    BOSS_DAMAGE,
    BOSS_HEALTH,
    BossKind,
    BREATHER_KEEP_FAR,
    BREATHER_KEEP_NEAR,
    ENEMY_BREATH_DAMAGE,
    ENEMY_BREATH_EVERY,
    ENEMY_BREATH_RANGE,
    ENEMY_DAMAGE,
} from "./constants"
import { BREATHS } from "./breaths"
import { windPush } from "./breaths/owl"
import { freezeSeconds, ICE_SECONDS } from "./breaths/penguin"
import { CAST, type CastCard } from "./endRoll"
import type { LevelData } from "./level"
import { stage5 } from "./levels/stage5"
import { stage10 } from "./levels/stage10"
import { AnimalId } from "./roster"

// A hero's details: its breath as an attack, what charging it does, its
// stat, and the breath's numbers (BREATHS).
export type HeroDetails = {
    kind: "hero"
    attack: string
    // Energy a level-1 breath costs.
    cost: number
    text: string
    charge: string
    stat: string
    cooldown: number
    meter: number
}

// An enemy's or a boss's details: its attack (a touch, or for the
// breather and the bosses a breath) and the health it costs, its touch's
// cost, a boss's health, how it moves, how to beat it, and the stage it
// is first seen on (number and name, as at the default difficulty).
export type FoeDetails = {
    kind: "enemy" | "boss"
    hit: "TOUCH" | "BREATH"
    damage: number
    touch: number
    health?: number
    moves: string
    weak: string
    first: { stage: number; name: string }
}

export type CardInfo = CastCard & { details: HeroDetails | FoeDetails }

function hero(
    id: AnimalId,
    d: Pick<HeroDetails, "attack" | "text" | "charge" | "stat">
): HeroDetails {
    const breath = BREATHS[id]
    return {
        kind: "hero",
        ...d,
        cost: breath.cost,
        cooldown: breath.cooldown,
        meter: breath.maxEnergy,
    }
}

const HEROES: Readonly<Record<AnimalId, HeroDetails>> = {
    dragon: hero(AnimalId.dragon, {
        attack: "FIRE BREATH",
        text: `Fire spreads out and defeats every enemy it reaches. Burning cells block enemies for ${BREATHS.dragon.duration} s.`,
        charge: "Charge it to spread further.",
        stat: "Balanced.",
    }),
    penguin: hero(AnimalId.penguin, {
        attack: "ICE BREATH",
        text: `A cone that freezes enemies for ${freezeSeconds(1)} s and turns the floor to ice for ${ICE_SECONDS} s.`,
        charge: "Charge for a longer cone and a longer freeze.",
        stat: "Walks on ice without sliding.",
    }),
    owl: hero(AnimalId.owl, {
        attack: "WIND BREATH",
        // The push of a level-2 breath, the one before charging.
        text: `Blows every enemy in a line back ${windPush(2)} cells, even through tunnels.`,
        charge: "Charge for a longer line and a bigger push.",
        stat: "Cheap breath, short cooldown. Sees further in fog.",
    }),
    skunk: hero(AnimalId.skunk, {
        attack: "SMELLY BREATH",
        text: `A stink cloud around you for ${BREATHS.skunk.duration} s. Enemies won't go in, and turn back inside it.`,
        charge: "Charge for a bigger cloud.",
        stat: "Bigger energy meter.",
    }),
    boar: hero(AnimalId.boar, {
        attack: "RUSH",
        text: `Dash ahead and ram. Enemies fly off and are defeated. Walls break for ${BREATHS.boar.duration} s.`,
        charge: "Charge to dash further.",
        // Twice: RAM_BOSS_SCALE (cards.test.ts checks it).
        stat: "Slower, but rams the boss twice as hard.",
    }),
}

const touch = (
    moves: string,
    weak: string,
    first: FoeDetails["first"]
): FoeDetails => ({
    kind: "enemy",
    hit: "TOUCH",
    damage: ENEMY_DAMAGE,
    touch: ENEMY_DAMAGE,
    moves,
    weak,
    first,
})

const CLASSIC = { stage: 1, name: "CLASSIC" }

const ENEMIES: Readonly<Record<AiType, FoeDetails>> = {
    [AiType.random]: touch(
        "Wanders. At each turn it picks a way at random, and turns back only at a dead end.",
        "It isn't after you. Just don't meet it at a corner.",
        CLASSIC
    ),
    [AiType.chase]: touch(
        "Chases you by the shortest way, and never stops.",
        "It follows right behind you. Lead it down a long corridor, turn and breathe.",
        CLASSIC
    ),
    [AiType.ambusher]: touch(
        `Aims ${AMBUSH_AHEAD} cells ahead of where you're going, to cut you off.`,
        "Turn back. It runs to where you were heading, not to where you are.",
        { stage: 2, name: "WRAP MAZE" }
    ),
    [AiType.patroller]: touch(
        "Walks the same route round and round. It doesn't chase you.",
        "Learn its loop, then slip past behind it.",
        { stage: 3, name: "ICE RINK" }
    ),
    [AiType.phantom]: touch(
        "Floats straight through walls, but slower than the others.",
        "Walls won't stop it. Keep moving and stay ahead.",
        { stage: 4, name: "FOG" }
    ),
    [AiType.splitter]: touch(
        "Chases you. Defeat it and it splits into two faster halves.",
        "Save energy for the halves. They don't split again.",
        { stage: 5, name: "BOSS LAIR" }
    ),
    [AiType.breather]: {
        kind: "enemy",
        hit: "BREATH",
        damage: ENEMY_BREATH_DAMAGE,
        touch: ENEMY_DAMAGE,
        moves: `Keeps ${BREATHER_KEEP_NEAR} to ${BREATHER_KEEP_FAR} cells away. When you're in line, it stops and glows, then breathes ${ENEMY_BREATH_RANGE} cells down the line. Walls stop it.`,
        weak: `When it glows, step out of the line. It needs ${ENEMY_BREATH_EVERY} s to breathe again, so close in then.`,
        first: CLASSIC,
    },
    [AiType.interceptor]: touch(
        "Guesses where you're going and cuts you off, from a side the others leave open. Hard to see from far away.",
        "Change your route often. Up close it just chases.",
        CLASSIC
    ),
}

// A boss's numbers, from its stage's level data or the defaults.
export function bossNumbers(level: LevelData) {
    const breath = level.boss?.breath ?? {}
    return {
        health: level.boss?.health ?? BOSS_HEALTH,
        every: breath.every ?? BOSS_BREATH_EVERY,
        range: breath.range ?? BOSS_BREATH_RANGE,
        damage: breath.damage ?? BOSS_BREATH_DAMAGE,
    }
}

const KITSUNE = bossNumbers(stage5)
const FINAL = bossNumbers(stage10)

const BOSSES: Readonly<Record<BossKind, FoeDetails>> = {
    kitsune: {
        kind: "boss",
        hit: "BREATH",
        damage: KITSUNE.damage,
        touch: BOSS_DAMAGE,
        health: KITSUNE.health,
        moves: `A big 2x2 boss that chases you. Every ${KITSUNE.every} s it breathes ${KITSUNE.range} cells down your line. It loses a tail for each ninth of its health.`,
        weak: "It can't fit in 1-wide corridors, so breathe at it from one. Freezing and pushing don't work on it.",
        first: { stage: 5, name: "BOSS LAIR" },
    },
    final: {
        kind: "boss",
        hit: "BREATH",
        damage: FINAL.damage,
        touch: BOSS_DAMAGE,
        health: FINAL.health,
        moves: `The last boss. Big, it chases you, and every ${FINAL.every} s it breathes ${FINAL.range} cells down your line. Its eyes blaze as it winds up.`,
        weak: "When its eyes blaze, step out of the line. Fight it from 1-wide corridors.",
        first: { stage: 10, name: "FINAL BOSS" },
    },
}

function detailsOf(card: CastCard): HeroDetails | FoeDetails {
    switch (card.who.kind) {
        case "animal":
            return HEROES[card.who.id]
        case "enemy":
            return ENEMIES[card.who.ai]
        case "boss":
            return BOSSES[card.who.boss]
    }
}

// Every card, in CAST order.
export const CARDS: readonly CardInfo[] = CAST.map((card) => ({
    ...card,
    details: detailsOf(card),
}))

// The card `delta` on from `index`, wrapping round at either end.
export function cardStep(index: number, delta: number): number {
    const n = CARDS.length
    return (((index + delta) % n) + n) % n
}

// How far (screen pixels) a swipe on the page must go across, and by more
// than it goes up or down, to turn a card.
export const SWIPE_MIN = 40

// The card a swipe moving (dx, dy) turns to: +1 the next (a swipe to the
// left, bringing the card on the right in), -1 the one before, 0 none.
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) <= Math.abs(dy)) return 0
    return dx < 0 ? 1 : -1
}

// The groups of cards the page dots split into, as [first, end) indexes:
// heroes, enemies, bosses.
export function cardGroups(): [number, number][] {
    const groups: [number, number][] = []
    CARDS.forEach((card, i) => {
        const last = groups[groups.length - 1]
        if (last && CARDS[last[0]]!.details.kind === card.details.kind) {
            last[1] = i + 1
        } else groups.push([i, i + 1])
    })
    return groups
}

// What a card's lower half says, top to bottom: the name and its kind, the
// ability title and quote (the end roll's), then a rule; the attack and
// its cost or damage, what it does (a hero's breath) or how it moves, a
// hero's CHARGE line; a rule, the STAT (a hero's) or WEAK (how to beat it)
// line, and the footer.
export type CardText = {
    name: string
    tag: "HERO" | "ENEMY" | "BOSS"
    ability: string
    quote: string
    attack: string
    value: string
    body: string
    charge?: string
    note: { label: "STAT" | "WEAK"; text: string }
    foot: readonly string[]
}

export function cardText(card: CardInfo): CardText {
    const d = card.details
    const top = {
        name: card.name,
        ability: card.ability,
        quote: card.line,
    }
    if (d.kind === "hero") {
        return {
            ...top,
            tag: "HERO",
            attack: d.attack,
            value: `${d.cost} EN`,
            body: d.text,
            charge: d.charge,
            note: { label: "STAT", text: d.stat },
            foot: [
                `COOLDOWN ${d.cooldown} s · METER ${d.meter}`,
                "PLAYABLE FROM THE START",
            ],
        }
    }
    const extra =
        d.kind === "boss"
            ? [`TOUCH -${d.touch} · HEALTH ${d.health}`]
            : d.hit === "BREATH"
              ? [`TOUCH -${d.touch}`]
              : []
    return {
        ...top,
        tag: d.kind === "boss" ? "BOSS" : "ENEMY",
        attack: d.hit,
        value: `-${d.damage}`,
        body: d.moves,
        note: { label: "WEAK", text: d.weak },
        foot: [
            ...extra,
            `FIRST SEEN: STAGE ${d.first.stage} · ${d.first.name}`,
        ],
    }
}

// ---------- layout ----------

// The page's card: CARD_W card pixels wide; every card as tall as
// CARD_H, the one with the most text setting it. The top is the end
// roll's card (frame, portrait, nameplate); the text starts at TEXT_TOP,
// TEXT_X in from either side.
export const CARD_W = 128
export const TEXT_TOP = 104
export const TEXT_X = 12
const TEXT_W = CARD_W - 2 * TEXT_X
const BOTTOM = 11

// Font sizes, line heights and gaps of the lower half, in card pixels
// (cardsView.ts styles the text with these).
export const TYPE = {
    name: { size: 5.5, line: 1.3 },
    tag: { size: 3.5, line: 1.3 },
    ability: { size: 4, line: 1.3, gap: 3 },
    quote: { size: 3.5, line: 1.5, gap: 3 },
    rule: { gap: 4, width: 1 },
    attack: { size: 4.5, line: 1.3 },
    text: { size: 3.5, line: 1.55, gap: 2.5 },
    foot: { size: 3, line: 1.5, gap: 4 },
} as const

// How many lines `s` takes at `size`: the font is monospaced, a square
// glyph a character, and lines break between words (no word is longer than
// a line).
export function lineCount(s: string, size: number): number {
    const cols = Math.floor(TEXT_W / size + 1e-9)
    let lines = 1
    let used = 0
    for (const word of s.split(" ")) {
        const need = used === 0 ? word.length : used + 1 + word.length
        if (need <= cols) used = need
        else {
            lines++
            used = word.length
        }
    }
    return lines
}

// The lower half's height in card pixels.
export function textHeight(t: CardText): number {
    const { name, ability, quote, rule, attack, text, foot } = TYPE
    const block = (s: string, type: { size: number; line: number }) =>
        lineCount(s, type.size) * type.size * type.line
    const ruled = 2 * rule.gap + rule.width
    let h = name.size * name.line
    h += ability.gap + block(t.ability, ability)
    h += quote.gap + block(t.quote, quote)
    h += ruled
    h += attack.size * attack.line
    h += text.gap + block(t.body, text)
    if (t.charge !== undefined) {
        h += text.gap + block(`CHARGE ${t.charge}`, text)
    }
    h += ruled
    h += block(`${t.note.label} ${t.note.text}`, text)
    h += foot.gap
    for (const line of t.foot) h += block(line, foot)
    return h
}

export const CARD_H = Math.ceil(
    TEXT_TOP + Math.max(...CARDS.map((c) => textHeight(cardText(c)))) + BOTTOM
)
