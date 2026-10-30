import { describe, expect, it } from "vite-plus/test"
import {
    END_CONFIRM_DELAY,
    endChoices,
    selectItem,
    startLevel,
    update,
    type FlowDeps,
    type Mode,
    type Screen,
    type TickInput,
} from "./flow"
import type { Outcome } from "./game"
import type { Action } from "./input"
import { emptyProgress, markCleared, STAGE_COUNT } from "./progress"
import { fixedRandom, parseFlat, sameAtEvery } from "./test/helpers"
import { vec2 } from "./vec2"

// Stage mode (KDA-272): stage select, reached from the title's choice of
// story or stage mode (or straight from the title in versus), plays any
// stage story mode has unlocked; its end screens offer Retry and Stage
// select, with no next stage, and stage select comes back on the stage
// just played.

// Three stages built, out of STAGE_COUNT slots.
const levels = ["A", "B", "C"].map((name) =>
    sameAtEvery(
        parseFlat({
            name,
            parTime: 60,
            map: ["######", "#PQ..#", "######"],
            enemies: [],
        })
    )
)

function input(pressed: readonly Action[] = []): TickInput {
    return {
        wasPressed: (action, player = 0) =>
            player === 0 && pressed.includes(action),
        move: () => ({ held: [], pressed: vec2(0, 0) }),
    }
}

// Stage 1 cleared: stages 1 and 2 open, 3 locked, the rest coming soon.
function deps(
    overrides: Partial<FlowDeps> = {},
    outcome: Outcome | null = null
): FlowDeps {
    return {
        levels,
        progress: markCleared(emptyProgress(), 0),
        dt: 1 / 60,
        random: fixedRandom(0),
        step: () => outcome,
        ...overrides,
    }
}

const select = (selected: number, mode: Mode = "solo"): Screen => ({
    kind: "stageSelect",
    mode,
    selected,
})

const TICKS_TO_CONFIRM = Math.ceil(END_CONFIRM_DELAY * 60)

// Play stage `level` in stage mode to its end screen.
function played(level: number, outcome: Outcome, mode: Mode = "solo") {
    const animals = mode === "solo" ? "dragon" : (["dragon", "owl"] as const)
    let screen = startLevel(levels, level, animals, mode)
    screen = update(screen, input(), deps({}, outcome))
    for (let i = 0; i < 600 && screen.kind === "ending"; i++) {
        screen = update(screen, input(), deps())
    }
    for (let i = 0; i < TICKS_TO_CONFIRM; i++) {
        screen = update(screen, input(), deps())
    }
    return screen
}

describe("stage select in stage mode", () => {
    it.each(["solo", "coop", "versus"] as const)(
        "starts an unlocked stage in %s",
        (mode) => {
            const next = update(select(1, mode), input(["confirm"]), deps())
            expect(next).toMatchObject({
                kind: "difficultySelect",
                mode,
                next: { kind: "characterSelect", level: 1 },
            })
            expect(next).not.toHaveProperty("next.run")
        }
    )

    it.each(["solo", "coop", "versus"] as const)(
        "can't confirm a locked slot in %s, by key or tap",
        (mode) => {
            const locked = select(2, mode)
            expect(update(locked, input(["confirm"]), deps())).toBe(locked)
            const tapped = selectItem(select(0, mode), 2)
            expect(tapped).toEqual(locked)
            expect(update(tapped, input(["confirm"]), deps())).toBe(tapped)
        }
    )

    it("can't confirm a Coming soon slot, even once every stage is cleared", () => {
        let progress = emptyProgress()
        for (let i = 0; i < STAGE_COUNT; i++) {
            progress = markCleared(progress, i)
        }
        const soon = select(levels.length)
        expect(update(soon, input(["confirm"]), deps({ progress }))).toBe(soon)
        const last = select(STAGE_COUNT - 1)
        expect(update(last, input(["confirm"]), deps({ progress }))).toBe(last)
    })

    it("follows story progress: a stage story mode opens can be played", () => {
        const progress = markCleared(markCleared(emptyProgress(), 0), 1)
        const next = update(select(2), input(["confirm"]), deps({ progress }))
        expect(next.kind).toBe("difficultySelect")
    })

    it("moves over every slot, locked and coming soon ones included", () => {
        let screen = select(0)
        for (let i = 0; i < STAGE_COUNT + 1; i++) {
            screen = update(screen, input(["down"]), deps())
        }
        expect(screen).toEqual(select(STAGE_COUNT - 1))
    })
})

describe("stage mode's end screens", () => {
    it("offer Retry and Stage select, with no next stage", () => {
        const won = played(0, "won")
        expect(won).toMatchObject({ kind: "stageClear", level: 0 })
        expect(endChoices(won)).toEqual(["retry", "stageSelect"])
        const lost = played(0, "dead")
        expect(lost.kind).toBe("gameOver")
        expect(endChoices(lost)).toEqual(["retry", "stageSelect"])
    })

    it("go back to stage select on the stage just played after a win", () => {
        const won = played(1, "won")
        const onSelect = update(won, input(["down"]), deps())
        expect(onSelect).toMatchObject({ choice: "stageSelect" })
        expect(update(onSelect, input(["confirm"]), deps())).toEqual(select(1))
    })

    it("go back to stage select on the stage just played in co-op", () => {
        const won = played(1, "won", "coop")
        const onSelect = update(won, input(["down"]), deps())
        expect(update(onSelect, input(["confirm"]), deps())).toEqual(
            select(1, "coop")
        )
    })

    it("retry the same stage in stage mode", () => {
        const retry = update(played(1, "won"), input(["confirm"]), deps())
        expect(retry).toMatchObject({ kind: "playing", level: 1 })
        expect(retry).not.toHaveProperty("run")
    })
})
