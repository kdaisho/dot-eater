import { describe, expect, it } from "vite-plus/test"
import { pauseIfPlaying, startLevel, type Screen } from "./flow"
import { stages as levels } from "./levels"
import { hudOf, rulesOf, screenEffects, stageOf } from "./scene"
import { vec2 } from "./vec2"

const playing = startLevel(levels, 0, ["dragon"], "solo")
const sources = {
    particles: [],
    shake: () => vec2(0.1, -0.1),
    reducedMotion: false,
}

describe("screenEffects", () => {
    it("shakes and shows the arrows while playing", () => {
        expect(screenEffects(playing, sources)).toEqual({
            stage: 1,
            particles: [],
            reducedMotion: false,
            shake: vec2(0.1, -0.1),
            arrows: true,
            bossBreath: true,
        })
    })

    it("keeps the arrows but doesn't shake while paused", () => {
        expect(screenEffects(pauseIfPlaying(playing), sources)).toEqual({
            stage: 1,
            particles: [],
            reducedMotion: false,
            arrows: true,
            bossBreath: true,
        })
    })

    it("shakes and shows the arrows in the outro", () => {
        const ending = { ...playing, kind: "ending" } as Screen
        const effects = screenEffects(ending, sources)
        expect(effects.shake).toEqual(vec2(0.1, -0.1))
        expect(effects.arrows).toBe(true)
    })

    it("shows only the stage's tiles on other screens with a game", () => {
        const end = { ...playing, kind: "gameOver", choice: "retry" } as Screen
        expect(screenEffects(end, sources)).toEqual({ stage: 1 })
    })

    it("names the stage by its number, 1 to 10", () => {
        const last = startLevel(levels, 9, ["dragon"], "solo")
        expect(stageOf(last)).toBe(10)
        expect(screenEffects(last, sources).stage).toBe(10)
        expect(stageOf({ kind: "title" } as Screen)).toBeUndefined()
        expect(screenEffects({ kind: "title" } as Screen, sources)).toEqual({})
    })
})

describe("hudOf and rulesOf", () => {
    it("gives a solo game its score, health and meter", () => {
        if (playing.kind !== "playing") throw new Error("Not playing")
        const hud = hudOf(playing.game, playing)
        expect(hud.score).toBe(0)
        expect(hud.health).toBeDefined()
        expect(hud.difficulty).toBeDefined()
        expect(hud.energy).toBeDefined()
    })

    it("gives the level's rules", () => {
        expect(rulesOf(playing, levels)).toBe(levels[0].medium.rules)
        expect(rulesOf({ kind: "title", mode: "solo" }, levels)).toBe(undefined)
    })
})
