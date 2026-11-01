import { readFileSync } from "node:fs"
import { describe, expect, it } from "vite-plus/test"
import { stages as levels } from "../../src/levels"
import {
    seededRandom,
    createRng,
    verify,
    type Recording,
} from "../../src/replay"
import { heroMoment, highlightsOf } from "../src/highlights"
import { HERO_KIND, SCENE_NAMES } from "../src/scenes"
import { playScene, SCENES } from "./director"

// A scene's committed recording, as text (recordings/index.ts needs the
// bundler).
const saved = (name: string) =>
    readFileSync(
        new URL(`../src/recordings/scenes/${name}.json`, import.meta.url),
        "utf8"
    )

describe("the directed scenes", () => {
    describe.each(SCENE_NAMES)("%s", (name) => {
        const recording = JSON.parse(saved(name)) as Recording

        it("replays as recorded", () => {
            expect(verify(recording, levels)).toBe(true)
        })

        it("is what the director records now (re-run record-scenes if not)", () => {
            const { recording: now } = playScene(SCENES[name])
            expect(`${JSON.stringify(now)}\n`).toBe(saved(name))
        })

        it(`has its hero moment: ${HERO_KIND[name]}`, () => {
            const hero = heroMoment(name, recording)
            expect(hero?.kind).toBe(HERO_KIND[name])
        })
    })

    it("frames the dragon's fire reaching an enemy 5 cells away", () => {
        const recording = JSON.parse(saved("dragon")) as Recording
        const hero = heroMoment("dragon", recording)!
        const breath = highlightsOf(recording).find(
            (m) => m.kind === "breathed" && m.tick === hero.tick
        )!
        expect(
            Math.abs(hero.at.x - breath.at.x) +
                Math.abs(hero.at.y - breath.at.y)
        ).toBe(5)
    })

    it("freezes two enemies at once with the penguin", () => {
        const recording = JSON.parse(saved("penguin")) as Recording
        const hero = heroMoment("penguin", recording)!
        const frozen = highlightsOf(recording).filter(
            (m) => m.kind === "enemyFrozen" && m.tick === hero.tick
        )
        expect(frozen).toHaveLength(2)
    })

    it("ends with the boss down", () => {
        const recording = JSON.parse(saved("boss")) as Recording
        expect(heroMoment("boss", recording)).toBeDefined()
        expect(
            highlightsOf(recording).filter((m) => m.kind === "bossHit").length
        ).toBeGreaterThan(0)
    })
})

describe("createRng", () => {
    it("draws what seededRandom does, so the director's runs replay", () => {
        const a = createRng(42)
        const b = seededRandom(42)
        for (let i = 0; i < 5; i++) expect(a.next()).toBe(b())
    })
})
