import { describe, expect, it } from "vite-plus/test"
import { damageBoss } from "./boss"
import { hopHeight } from "./bossDefeat"
import { TICK_RATE } from "./constants"
import {
    startLevel,
    update,
    type FlowDeps,
    type Screen,
    type TickInput,
} from "./flow"
import type { Action } from "./input"
import { stages } from "./levels"
import { emptyProgress } from "./progress"
import { fixedRandom } from "./test/helpers"
import { vec2 } from "./vec2"

// The boss stages' outros through the screen machine (KDA-301, KDA-303):
// the end screen waits for the defeat, and on stage 10 for everyone's hops
// after it; then the story's ending follows as before.

const none = vec2(0, 0)

function tickInput(pressed: Action[] = []): TickInput {
    const set = new Set(pressed)
    return {
        wasPressed: (action) => set.has(action),
        move: () => ({ held: [], pressed: none }),
    }
}

const deps: FlowDeps = {
    levels: stages,
    progress: emptyProgress(),
    dt: 1 / TICK_RATE,
    random: fixedRandom(0),
}

// Story mode on stage `level` (0-based), its boss felled before the first
// tick: the screens of every tick from then on, until one that isn't the
// outro, pressing confirm and pause in the outro (which ignores them).
// Each screen's kind and whether anyone was off the floor, hopping, on it
// (the game is the same object throughout, so it is checked as it goes).
function playOut(level: number) {
    let screen: Screen = startLevel(
        stages,
        level,
        "dragon",
        "solo",
        [],
        "medium",
        {
            total: 0,
            from: "continue",
        }
    )
    if (screen.kind !== "playing") throw new Error("not playing")
    damageBoss(screen.game, screen.game.boss!.health)
    const screens: { kind: Screen["kind"]; hopping: boolean }[] = []
    for (let i = 0; i < 10 * TICK_RATE; i++) {
        const pressed: Action[] = i === 0 ? [] : ["confirm", "pause"]
        screen = update(screen, tickInput(pressed), deps)
        const defeat = screen.kind === "ending" ? screen.game.defeat : null
        screens.push({
            kind: screen.kind,
            hopping:
                defeat !== null &&
                defeat.hoppers.some((_, k) => hopHeight(defeat, k) > 0),
        })
        if (i > 0 && screen.kind !== "ending") return screens
    }
    throw new Error("The outro never ended")
}

describe("the end screen after a boss", () => {
    it("comes 2.0 s after the Kitsune falls, with no hops (stage 5)", () => {
        const screens = playOut(4)
        expect(screens[0].kind).toBe("ending")
        // The felling tick, then 2 s of outro.
        expect(screens).toHaveLength(1 + 2 * TICK_RATE)
        expect(screens.at(-1)!.kind).toBe("storyClear")
        expect(screens.some((s) => s.hopping)).toBe(false)
    })

    it("follows everyone's hops after the final boss falls, then the ending (stage 10)", () => {
        const screens = playOut(9)
        expect(screens).toHaveLength(1 + Math.round(4.9 * TICK_RATE))
        // Nobody hops before the jingle at 2.5 s; then everyone does, in
        // the outro.
        const jingle = 1 + 2.5 * TICK_RATE
        expect(screens.slice(0, jingle).some((s) => s.hopping)).toBe(false)
        expect(screens.slice(jingle).some((s) => s.hopping)).toBe(true)
        expect(screens.slice(0, -1).every((s) => s.kind === "ending")).toBe(
            true
        )
        expect(screens.at(-1)!.kind).toBe("storyEnd")
    })
})
