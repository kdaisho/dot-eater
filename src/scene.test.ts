import { describe, expect, it } from "vite-plus/test"
import { pauseIfPlaying, startLevel, type Screen } from "./flow"
import { levels } from "./levels"
import { hudOf, rulesOf, screenEffects } from "./scene"
import { vec2 } from "./vec2"

const playing = startLevel(levels, 0, ["dragon"], "solo")
const sources = {
    particles: [],
    shake: () => vec2(0.1, -0.1),
    guide: "arrow" as const,
}

describe("screenEffects", () => {
    it("shakes and previews aim while playing", () => {
        expect(screenEffects(playing, sources)).toEqual({
            particles: [],
            shake: vec2(0.1, -0.1),
            guide: "arrow",
            aim: true,
        })
    })

    it("keeps the guide but neither shake nor aim while paused", () => {
        expect(screenEffects(pauseIfPlaying(playing), sources)).toEqual({
            particles: [],
            guide: "arrow",
        })
    })

    it("shakes but doesn't preview aim in the outro", () => {
        const ending = { ...playing, kind: "ending" } as Screen
        const effects = screenEffects(ending, sources)
        expect(effects.shake).toEqual(vec2(0.1, -0.1))
        expect(effects.aim).toBeUndefined()
    })

    it("shows nothing on other screens", () => {
        const end = { ...playing, kind: "gameOver", choice: "retry" } as Screen
        expect(screenEffects(end, sources)).toEqual({})
    })
})

describe("hudOf and rulesOf", () => {
    it("gives a solo game its score, lives and meter", () => {
        if (playing.kind !== "playing") throw new Error("Not playing")
        const hud = hudOf(playing.game, playing)
        expect(hud.score).toBe(0)
        expect(hud.lives).toBe(playing.game.lives)
        expect(hud.energy).toBeDefined()
    })

    it("gives the level's rules", () => {
        expect(rulesOf(playing, levels)).toBe(levels[0].rules)
        expect(rulesOf({ kind: "title", mode: "solo" }, levels)).toBe(undefined)
    })
})
