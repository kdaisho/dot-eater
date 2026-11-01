import { readFileSync } from "node:fs"
import { describe, expect, it } from "vite-plus/test"
import type { Recording } from "../../src/replay"
import { compileCuts, cutLength, isGameShot } from "./cutList"
import { excerptFrames, fallbackFor, PROMO3_EXCERPT } from "./excerpts"
import { heroMoment } from "./highlights"
import {
    BOSS_DOWN_BEAT,
    CHARACTER_ORDER,
    promo3CutList,
    SECTIONS,
    type Scenes,
} from "./promo3Cuts"
import { SCENE_NAMES } from "./scenes"
import { SONGS } from "./songs"
import { gameTimeAt } from "./time"

const FPS = 30

const scenes = Object.fromEntries(
    SCENE_NAMES.map((name) => [
        name,
        JSON.parse(
            readFileSync(
                new URL(`recordings/scenes/${name}.json`, import.meta.url),
                "utf8"
            )
        ) as Recording,
    ])
) as Scenes

// The song's measured grid, as a clone without the song cuts to.
const frames = excerptFrames(fallbackFor(SONGS.promo3), PROMO3_EXCERPT, FPS)
const list = promo3CutList(scenes)
const shots = compileCuts(list, frames.beats)

describe("promo3CutList", () => {
    it("starts at the song's start and fills the excerpt exactly", () => {
        expect(frames.start).toBeLessThan(0.1)
        expect(cutLength(shots)).toBe(frames.duration)
        // Half-time bars 0–20 at 86.99 bpm: about 55.2 s.
        expect(frames.duration / FPS).toBeCloseTo(55.2, 1)
        const beats = list.shots.reduce((sum, s) => sum + s.durationBeats, 0)
        expect(beats).toBe(SECTIONS.end)
    })

    it("gives every character two bars on its charged ability, in order", () => {
        const shown = list.shots.filter(
            (s) => isGameShot(s) && s.durationBeats === 8
        )
        const order = CHARACTER_ORDER.map((animal) => {
            const hero = heroMoment(animal, scenes[animal])
            return shown.findIndex(
                (s) =>
                    isGameShot(s) &&
                    s.recording === scenes[animal] &&
                    s.heroTick === hero?.tick
            )
        })
        expect(order.every((i) => i >= 0)).toBe(true)
        expect([...order].sort((a, b) => a - b)).toEqual(order)
    })

    it("explains no ability in words and keeps the name for the end", () => {
        for (const s of list.shots) {
            if (isGameShot(s)) expect(s.caption, s.name).toBeUndefined()
            if (s.kind === "card") throw new Error(`A card: ${s.name}`)
        }
        const titles = list.shots.filter((s) => s.kind === "title")
        expect(titles).toHaveLength(1)
        expect(list.shots.at(-1)).toBe(titles[0])
    })

    it("keeps the camera calm: no beat punches, light shake", () => {
        for (const s of list.shots) {
            if (!isGameShot(s)) continue
            expect(s.camera?.punch, s.name).toBe(0)
            expect(s.shake ?? 1, s.name).toBeLessThanOrEqual(0.8)
        }
    })

    it("lands every hero tick exactly on its beat", () => {
        for (const c of shots) {
            if (!c.game || !isGameShot(c.shot)) continue
            const t = gameTimeAt(c.game.hero, c.game.time)
            expect(t, c.shot.name).toBeCloseTo(c.shot.heroTick, 6)
        }
    })

    it("lands the boss going down on the lift (bar 16)", () => {
        const down = heroMoment("boss", scenes.boss)!
        const shot = shots.find(
            (c) =>
                isGameShot(c.shot) &&
                c.shot.recording === scenes.boss &&
                c.shot.heroTick === down.tick
        )!
        expect(
            shot.startBeat + (shot.shot as { heroBeat: number }).heroBeat
        ).toBe(BOSS_DOWN_BEAT)
        expect(BOSS_DOWN_BEAT).toBe(64)
    })
})
