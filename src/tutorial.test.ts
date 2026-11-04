import { describe, expect, it } from "vite-plus/test"
import { DEFAULT_BINDINGS, rebind } from "./bindings"
import {
    ACT_CYCLE,
    ACT_OFFSET,
    actPhase,
    actScene,
    BREATH_CYCLE,
    breathScene,
    KEY_CAPS,
    keyLegend,
    keyOwners,
    loopTime,
    navHint,
    offLayoutKeys,
    padLegend,
    soloBreathKey,
    soloKeys,
    touchScene,
    tutorialPages,
} from "./tutorial"

// The tutorial's pure parts (KDA-319): its pages, the words built from the
// bindings and the scenes' loops.

describe("tutorialPages", () => {
    it("has five pages, and the Touch page last on touch devices", () => {
        expect(tutorialPages(false)).toEqual([
            "goal",
            "keyboard",
            "controller",
            "breath",
            "health",
        ])
        expect(tutorialPages(true)).toEqual([
            "goal",
            "keyboard",
            "controller",
            "breath",
            "health",
            "touch",
        ])
    })
})

describe("the keys", () => {
    it("names both players' default keys", () => {
        expect(keyLegend(DEFAULT_BINDINGS, 0)).toEqual({
            move: ["↑", "↓", "←", "→"],
            breath: "Right Shift",
            pause: "P",
            confirm: "Space",
        })
        expect(keyLegend(DEFAULT_BINDINGS, 1)).toEqual({
            move: ["W", "S", "A", "D"],
            breath: "Left Shift",
            pause: "Q",
            confirm: "E",
        })
    })

    it("follows a rebound key", () => {
        const bindings = rebind(DEFAULT_BINDINGS, 0, "breath", "KeyX")
        expect(keyLegend(bindings, 0).breath).toBe("X")
        expect(keyOwners(bindings).get("KeyX")).toEqual({
            player: 0,
            action: "breath",
        })
    })

    it("says a 1-player game breathes with Left Shift by default", () => {
        expect(soloBreathKey(DEFAULT_BINDINGS)).toBe("Left Shift")
        expect(soloKeys(DEFAULT_BINDINGS).breath).toBe("ShiftLeft")
    })

    it("says nothing of Left Shift once 1P's breath is rebound", () => {
        const bindings = rebind(DEFAULT_BINDINGS, 0, "breath", "KeyX")
        expect(soloBreathKey(bindings)).toBeUndefined()
        expect(soloKeys(bindings).breath).toBe("KeyX")
    })

    it("lists the keys bound off the drawn keyboard", () => {
        expect(offLayoutKeys(DEFAULT_BINDINGS)).toEqual([])
        const bindings = rebind(DEFAULT_BINDINGS, 1, "pause", "Home")
        expect(offLayoutKeys(bindings)).toEqual([
            { code: "Home", name: "Home", player: 1 },
        ])
    })

    it("draws every default key, and Escape as its own", () => {
        const drawn = new Set(KEY_CAPS.map((c) => c.code))
        for (const { keys } of DEFAULT_BINDINGS.players) {
            for (const code of Object.values(keys)) {
                expect(drawn.has(code)).toBe(true)
            }
        }
        expect(keyOwners(DEFAULT_BINDINGS).get("Escape")).toEqual({
            esc: true,
        })
    })

    it("builds the hint from 1P's keys and pad", () => {
        expect(navHint(DEFAULT_BINDINGS, false)).toBe(
            "← → to turn pages, Space or A for next, Esc or B to go back"
        )
        const bindings = rebind(DEFAULT_BINDINGS, 0, "confirm", "Enter")
        expect(navHint(bindings, true)).toBe(
            "← → to turn pages, Enter or A for done, Esc or B to go back"
        )
    })
})

describe("padLegend", () => {
    it("names the default buttons, breath and confirm on A", () => {
        expect(padLegend(DEFAULT_BINDINGS, 0)).toEqual([
            { buttons: ["D-pad", "L stick"], label: "Move" },
            { buttons: ["A"], label: "Breathe, and confirm in menus" },
            { buttons: ["B"], label: "Go back", back: true },
            { buttons: ["Start"], label: "Pause" },
        ])
    })

    it("splits breath and confirm when they are apart", () => {
        const bindings = rebind(DEFAULT_BINDINGS, 1, "breath", 2)
        expect(padLegend(bindings, 1).slice(1, 3)).toEqual([
            { buttons: ["X"], label: "Breathe" },
            { buttons: ["A"], label: "Confirm in menus" },
        ])
    })
})

describe("the scenes", () => {
    it("loops the time, with an offset", () => {
        expect(loopTime(0.5, ACT_CYCLE)).toBeCloseTo(0.5)
        expect(loopTime(ACT_CYCLE + 0.5, ACT_CYCLE)).toBeCloseTo(0.5)
        expect(loopTime(0, ACT_CYCLE, ACT_OFFSET)).toBeCloseTo(1.2)
        expect(loopTime(-0.5, ACT_CYCLE)).toBeCloseTo(1.9)
    })

    it("walks, then breathes fire at the ghost, then rests", () => {
        expect(actPhase(0.5)).toBe("move")
        expect(actScene(0)).toMatchObject({ x: 1, walking: true, ghost: 6 })
        const breathing = actScene(1.3)
        expect(breathing.phase).toBe("breath")
        expect(breathing.fire).toEqual([4, 5, 6])
        expect(breathing.ghost).toBeUndefined()
        expect(actScene(2.2)).toMatchObject({ x: 3, phase: "idle", fire: [] })
    })

    it("fills the meter, charges it, spends it and greys it", () => {
        const walk = breathScene(0)
        expect(walk.phase).toBe("walk")
        expect(walk.meter?.energy).toBe(85)
        expect(breathScene(1.7).meter?.energy).toBe(100)
        const hold = breathScene(2.9)
        expect(hold.phase).toBe("hold")
        expect(hold.meter?.charge).toBe(5)
        const fire = breathScene(3.5)
        expect(fire.phase).toBe("fire")
        expect(fire.meter).toMatchObject({ energy: 0, ready: false })
        expect(fire.fire).toHaveLength(6)
        expect(breathScene(BREATH_CYCLE - 0.1).phase).toBe("after")
    })

    it("flicks, runs on, stops at a flick back and breathes on a tap", () => {
        expect(touchScene(0.1).phase).toBe("flick")
        expect(touchScene(0.1).finger).toBeDefined()
        expect(touchScene(1.2)).toMatchObject({ phase: "run", walking: true })
        expect(touchScene(2.5)).toMatchObject({ phase: "stop", x: 6 })
        const tap = touchScene(4)
        expect(tap.phase).toBe("tap")
        expect(tap.fire).toEqual([7, 8])
    })
})
