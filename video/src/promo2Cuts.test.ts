import { readFileSync } from "node:fs"
import { describe, expect, it } from "vite-plus/test"
import type { Recording } from "../../src/replay"
import { compileCuts, cutLength, isGameShot } from "./cutList"
import { excerptFrames, fallbackFor, PROMO2_EXCERPT } from "./excerpts"
import { heroMoment } from "./highlights"
import {
    BOSS_DOWN_BEAT,
    CHARACTER_ORDER,
    promo2CutList,
    SECTIONS,
    type Scenes,
} from "./promo2Cuts"
import { promo2Tracks } from "./promo2Sound"
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
const frames = excerptFrames(fallbackFor(SONGS.promo2), PROMO2_EXCERPT, FPS)
const list = promo2CutList(scenes)
const shots = compileCuts(list, frames.beats)

describe("promo2CutList", () => {
    it("compiles and fills the excerpt exactly", () => {
        expect(cutLength(shots)).toBe(frames.duration)
        // Half-time bars 8–24 at 86.99 bpm: about 44.1 s.
        expect(frames.duration / FPS).toBeCloseTo(44.1, 1)
        const beats = list.shots.reduce((sum, s) => sum + s.durationBeats, 0)
        expect(beats).toBe(SECTIONS.end)
    })

    it("cuts at least every two beats", () => {
        for (const s of list.shots) {
            if (s.kind === "title") continue
            expect(s.durationBeats, s.name).toBeLessThanOrEqual(3.5)
        }
    })

    it("shows every character's card and ability, in order", () => {
        const cards = list.shots.flatMap((s) =>
            s.kind === "card" ? [s.animal] : []
        )
        expect(cards).toEqual(CHARACTER_ORDER)
        for (const animal of CHARACTER_ORDER) {
            const hero = heroMoment(animal, scenes[animal])
            const shown = shots.some(
                (c) =>
                    isGameShot(c.shot) &&
                    c.shot.recording === scenes[animal] &&
                    c.shot.heroTick === hero?.tick &&
                    c.shot.speed !== false
            )
            expect(shown, animal).toBe(true)
        }
    })

    it("lands every hero tick exactly on its beat", () => {
        for (const c of shots) {
            if (!c.game || !isGameShot(c.shot)) continue
            const t = gameTimeAt(c.game.hero, c.game.time)
            expect(t, c.shot.name).toBeCloseTo(c.shot.heroTick, 6)
            const heroBeat =
                c.shot.heroBeat ?? Math.floor(c.shot.durationBeats / 2)
            expect(c.from + c.game.hero).toBe(
                Math.round(frames.beats.beatFrame(c.startBeat + heroBeat))
            )
        }
    })

    it("lands the boss going down on the excerpt's bar 13", () => {
        const boss = scenes.boss
        const down = heroMoment("boss", boss)
        expect(down?.kind).toBe("bossDefeated")
        const shot = shots.find(
            (c) =>
                isGameShot(c.shot) &&
                c.shot.recording === boss &&
                c.shot.heroTick === down?.tick
        )
        expect(shot?.game).toBeDefined()
        expect(shot!.from + shot!.game!.hero).toBe(
            Math.round(frames.beats.beatFrame(BOSS_DOWN_BEAT))
        )
        expect(shot!.from + shot!.game!.hero).toBe(
            frames.bar(PROMO2_EXCERPT.fromBar + 13)
        )
    })

    it("lands the character section and the boss on their bars", () => {
        const start = (name: string) =>
            shots.find((c) => c.shot.name === name)?.from
        expect(start("DRAGON card")).toBe(
            frames.bar(PROMO2_EXCERPT.fromBar + 3)
        )
        expect(start("Boss lair")).toBe(frames.cue("hook"))
        expect(start("End card")).toBe(frames.cue("endCard"))
    })
})

describe("promo2Tracks", () => {
    it("plays the song alone, trimmed to its excerpt, with no game sound", () => {
        const tracks = promo2Tracks("/music/return-of-the-8-bit-era.mp3", {
            start: frames.start,
            duration: frames.duration,
            fps: FPS,
        })
        expect(tracks.map((t) => t.name)).toEqual(["Song"])
        expect(tracks.every((t) => !t.src.includes("audio/"))).toBe(true)
        expect(tracks[0].trimBefore).toBe(Math.round(frames.start * FPS))
        // Half-time bar 8 is 0:22.13 into the song.
        expect(frames.start).toBeCloseTo(22.13, 1)
        expect(tracks[0].volume(frames.duration / 2)).toBe(1)
        expect(tracks[0].volume(frames.duration)).toBe(0)
    })

    it("plays nothing without the song", () => {
        expect(
            promo2Tracks(null, { start: 0, duration: 100, fps: FPS })
        ).toEqual([])
    })
})
