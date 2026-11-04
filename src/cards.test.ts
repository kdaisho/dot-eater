import { describe, expect, it } from "vite-plus/test"
import { BREATHS } from "./breaths"
import { RAM_BOSS_SCALE } from "./breaths/boar"
import { windPush } from "./breaths/owl"
import { freezeSeconds, ICE_SECONDS } from "./breaths/penguin"
import {
    CARD_H,
    CARDS,
    cardGroups,
    cardStep,
    cardText,
    lineCount,
    swipeStep,
    SWIPE_MIN,
    textHeight,
    TEXT_TOP,
    type FoeDetails,
} from "./cards"
import {
    AiType,
    BOSS_BREATH_DAMAGE,
    BOSS_BREATH_EVERY,
    BOSS_BREATH_RANGE,
    BOSS_DAMAGE,
    BOSS_HEALTH,
    ENEMY_BREATH_DAMAGE,
    ENEMY_DAMAGE,
} from "./constants"
import { CAST } from "./endRoll"
import { stages } from "./levels"
import { stage10 } from "./levels/stage10"
import { ANIMAL_IDS } from "./roster"

// The Cards page's cards (KDA-320): the end roll's cast, each with its
// details, the numbers matching the game's.

const heroes = CARDS.filter((c) => c.details.kind === "hero")
const foes = CARDS.flatMap((c) =>
    c.details.kind === "hero" ? [] : [{ card: c, d: c.details }]
)
const byName = (name: string) => CARDS.find((c) => c.name === name)!
const foe = (name: string) => byName(name).details as FoeDetails

describe("the cards", () => {
    it("are the end roll's 15, in its order", () => {
        expect(CARDS).toHaveLength(15)
        expect(CARDS.map((c) => c.name)).toEqual(CAST.map((c) => c.name))
        CARDS.forEach((card, i) => expect(card).toMatchObject(CAST[i]!))
        expect(CARDS.map((c) => c.details.kind)).toEqual([
            ...Array(5).fill("hero"),
            ...Array(8).fill("enemy"),
            "boss",
            "boss",
        ])
    })

    it("each have every part of their details", () => {
        for (const card of CARDS) {
            const t = cardText(card)
            for (const s of [t.attack, t.value, t.body, t.note.text]) {
                expect(s.length).toBeGreaterThan(0)
            }
            expect(t.foot.length).toBeGreaterThan(0)
            expect(t.charge !== undefined).toBe(card.details.kind === "hero")
        }
    })

    it("give each hero its breath's energy cost, cooldown and meter", () => {
        expect(heroes.map((c) => c.who)).toEqual(
            ANIMAL_IDS.map((id) => ({ kind: "animal", id }))
        )
        for (const card of heroes) {
            if (card.who.kind !== "animal" || card.details.kind !== "hero") {
                throw new Error(card.name)
            }
            const breath = BREATHS[card.who.id]
            expect(card.details.cost).toBe(breath.cost)
            expect(card.details.cooldown).toBe(breath.cooldown)
            expect(card.details.meter).toBe(breath.maxEnergy)
            const t = cardText(card)
            expect(t.value).toBe(`${breath.cost} EN`)
            expect(t.foot[0]).toBe(
                `COOLDOWN ${breath.cooldown} s · METER ${breath.maxEnergy}`
            )
        }
    })

    it("give the breaths' times and pushes as the breaths have them", () => {
        const text = (name: string) => cardText(byName(name)).body
        expect(text("DRAGON")).toContain(`for ${BREATHS.dragon.duration} s`)
        expect(text("PENGUIN")).toContain(
            `freezes enemies for ${freezeSeconds(1)} s`
        )
        expect(text("PENGUIN")).toContain(`ice for ${ICE_SECONDS} s`)
        expect(text("OWL")).toContain(`back ${windPush(2)} cells`)
        expect(text("SKUNK")).toContain(`for ${BREATHS.skunk.duration} s`)
        expect(text("BOAR")).toContain(`for ${BREATHS.boar.duration} s`)
        expect(RAM_BOSS_SCALE).toBe(2)
        expect(cardText(byName("BOAR")).note.text).toContain("twice")
        expect(BREATHS.boar.speedScale).toBeLessThan(1)
    })

    it("give each enemy the health its touch, or the breather's breath, costs", () => {
        for (const { card, d } of foes.filter((f) => f.d.kind === "enemy")) {
            expect(d.touch).toBe(ENEMY_DAMAGE)
            const breather =
                card.who.kind === "enemy" && card.who.ai === AiType.breather
            expect(d.hit).toBe(breather ? "BREATH" : "TOUCH")
            expect(d.damage).toBe(breather ? ENEMY_BREATH_DAMAGE : ENEMY_DAMAGE)
        }
        expect(cardText(byName("SNAKE")).foot[0]).toBe(`TOUCH -${ENEMY_DAMAGE}`)
        expect(cardText(byName("TENGU")).value).toBe(`-${ENEMY_DAMAGE}`)
    })

    it("give each boss its stage's breath, touch and health", () => {
        const kitsune = foe("KITSUNE")
        expect(kitsune).toMatchObject({
            damage: BOSS_BREATH_DAMAGE,
            touch: BOSS_DAMAGE,
            health: BOSS_HEALTH,
        })
        expect(kitsune.moves).toContain(
            `Every ${BOSS_BREATH_EVERY} s it breathes ${BOSS_BREATH_RANGE} cells`
        )
        const final = foe("PHANTOM LORD")
        const { breath, health } = stage10.boss!
        expect(final).toMatchObject({
            damage: breath!.damage,
            touch: BOSS_DAMAGE,
            health,
        })
        expect(final.moves).toContain(
            `every ${breath!.every} s it breathes ${breath!.range} cells`
        )
        expect(cardText(byName("PHANTOM LORD")).foot[0]).toBe(
            `TOUCH -${BOSS_DAMAGE} · HEALTH ${health}`
        )
        // The level's numbers really are the boss's.
        const level = stages[9]!.medium
        expect(level.boss?.health).toBe(final.health)
        expect(level.boss?.breath?.damage).toBe(final.damage)
    })

    it("name the stage each enemy and boss is first seen on, at the default difficulty", () => {
        for (const { card, d } of foes) {
            const { stage, name } = d.first
            const level = stages[stage - 1]!.medium
            expect(level.name.toUpperCase()).toBe(name)
            const { who } = card
            const seen = (n: number) => {
                const l = stages[n]!.medium
                if (who.kind === "enemy") {
                    return l.enemies.some((e) => e.ai === who.ai)
                }
                return who.kind === "boss" && l.boss?.kind === who.boss
            }
            const first = stages.findIndex((_, n) => seen(n))
            expect(first + 1, card.name).toBe(stage)
            expect(cardText(card).foot.at(-1)).toBe(
                `FIRST SEEN: STAGE ${stage} · ${name}`
            )
        }
    })

    it("are all as tall as the one with the most text", () => {
        const heights = CARDS.map((c) => textHeight(cardText(c)))
        expect(CARD_H).toBeGreaterThanOrEqual(TEXT_TOP + Math.max(...heights))
        expect(Number.isInteger(CARD_H)).toBe(true)
    })
})

describe("lineCount", () => {
    it("breaks between words, a square glyph a character", () => {
        // 104 card pixels at size 4 is 26 columns.
        expect(lineCount("a".repeat(26), 4)).toBe(1)
        expect(lineCount(`${"a".repeat(20)} bbbbb`, 4)).toBe(1)
        expect(lineCount(`${"a".repeat(20)} bbbbbb`, 4)).toBe(2)
        expect(lineCount("a b c", 4)).toBe(1)
    })
})

describe("browsing", () => {
    it("steps round the cards, wrapping at either end", () => {
        expect(cardStep(0, 1)).toBe(1)
        expect(cardStep(0, -1)).toBe(CARDS.length - 1)
        expect(cardStep(CARDS.length - 1, 1)).toBe(0)
        expect(cardStep(3, -CARDS.length)).toBe(3)
    })

    it("groups the page dots into heroes, enemies and bosses", () => {
        expect(cardGroups()).toEqual([
            [0, 5],
            [5, 13],
            [13, 15],
        ])
    })

    it("turns a card on a swipe across, not a short or an up-and-down one", () => {
        expect(swipeStep(-SWIPE_MIN, 0)).toBe(1)
        expect(swipeStep(SWIPE_MIN + 20, 10)).toBe(-1)
        expect(swipeStep(SWIPE_MIN - 1, 0)).toBe(0)
        expect(swipeStep(60, 80)).toBe(0)
        expect(swipeStep(0, -200)).toBe(0)
    })
})
