import { describe, expect, it } from "vite-plus/test"
import {
    canContinue,
    initialScreen,
    openingScreen,
    update,
    type FlowDeps,
    type Screen,
    type TickInput,
} from "./flow"
import type { Action } from "./input"
import { stages } from "./levels"
import { LOGO_SECONDS, OPENING_DRUM } from "./opening"
import { emptyProgress, markCleared, type Progress } from "./progress"
import { fixedRandom } from "./test/helpers"
import { vec2 } from "./vec2"

// The opening (opening.ts): the studio logo waiting for a press, then held,
// then the title rising to the music with Start and Continue from the drum.

function input(...pressed: Action[]): TickInput {
    return {
        wasPressed: (action, player = 0) =>
            player === 0 && pressed.includes(action),
        move: () => ({ held: [], pressed: vec2(0, 0) }),
    }
}
const none = input()

// Stage 1 cleared, so a story run continues on stage 2.
const midStory: Progress = markCleared(emptyProgress(), 0)

function deps(over: Partial<FlowDeps> = {}): FlowDeps {
    return {
        levels: stages,
        progress: emptyProgress(),
        dt: 0.1,
        random: fixedRandom(0),
        ...over,
    }
}

type Opening = Extract<Screen, { kind: "opening" }>
const opening = (screen: Screen) => {
    expect(screen.kind).toBe("opening")
    return screen as Opening
}

// The title stage `seconds` into the music, the cursor on `choice`.
function titleAt(seconds: number, choice: Opening["choice"] = "start"): Screen {
    return { kind: "opening", stage: "title", clock: { seconds }, choice }
}

describe("the opening's studio logo", () => {
    it("waits for a press, any action", () => {
        let screen = openingScreen()
        for (let i = 0; i < 100; i++) screen = update(screen, none, deps())
        expect(opening(screen).stage).toBe("gate")
        expect(opening(update(screen, input("punch"), deps())).stage).toBe(
            "logo"
        )
    })

    it("holds, then gives way to the title on its own", () => {
        let screen: Screen = { ...openingScreen(), stage: "logo" } as Screen
        const ticks = Math.ceil(LOGO_SECONDS / 0.1) - 1
        for (let i = 0; i < ticks; i++) screen = update(screen, none, deps())
        expect(opening(screen).stage).toBe("logo")
        screen = update(screen, none, deps())
        expect(opening(screen).stage).toBe("title")
        expect(opening(screen).clock.seconds).toBe(0)
    })

    it("is cut short by a press", () => {
        const screen = { ...openingScreen(), stage: "logo" } as Screen
        expect(opening(update(screen, input("confirm"), deps())).stage).toBe(
            "title"
        )
    })
})

describe("the opening's title", () => {
    it("follows the music's clock, or its own without one", () => {
        const screen = titleAt(0)
        update(screen, none, deps({ openingClock: 3.25 }))
        expect(opening(screen).clock.seconds).toBe(3.25)
        update(screen, none, deps())
        expect(opening(screen).clock.seconds).toBeCloseTo(3.35, 9)
    })

    it("skips to the menu on a press before the drum, then keeps its own time", () => {
        const skipped = opening(update(titleAt(2), input("down"), deps()))
        expect(skipped.clock.seconds).toBe(OPENING_DRUM)
        expect(skipped.skipped).toBe(true)
        update(skipped, none, deps({ openingClock: 2.1 }))
        expect(skipped.clock.seconds).toBeCloseTo(OPENING_DRUM + 0.1, 9)
    })

    it("ignores confirm before the drum other than to skip", () => {
        const next = update(titleAt(1), input("confirm"), deps())
        expect(next.kind).toBe("opening")
    })

    it("goes to the title on Start", () => {
        const next = update(titleAt(OPENING_DRUM), input("confirm"), deps())
        expect(next).toEqual(initialScreen())
    })

    it("keeps the cursor on Start with no story to continue", () => {
        const screen = titleAt(OPENING_DRUM)
        expect(canContinue(deps())).toBe(false)
        expect(update(screen, input("down"), deps())).toBe(screen)
    })

    it("continues a story run: its difficulty select, for 1 player", () => {
        const d = deps({ progress: midStory, lastDifficulty: "hard" })
        expect(canContinue(d)).toBe(true)
        const onContinue = opening(
            update(titleAt(OPENING_DRUM), input("down"), d)
        )
        expect(onContinue.choice).toBe("continue")
        const next = update(onContinue, input("confirm"), d)
        expect(next).toMatchObject({
            kind: "difficultySelect",
            mode: "solo",
            difficulty: "hard",
            next: {
                kind: "characterSelect",
                level: 1,
                run: { from: "continue" },
            },
            back: { kind: "storyMenu", mode: "solo", choice: "continue" },
        })
    })

    it("can't continue a run whose next stage isn't built", () => {
        const d = deps({ progress: midStory, levels: stages.slice(0, 1) })
        expect(canContinue(d)).toBe(false)
    })
})
