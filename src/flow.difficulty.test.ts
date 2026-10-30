import { describe, expect, it } from "vite-plus/test"
import { DIFFICULTIES, type Difficulty } from "./difficulty"
import {
    END_CONFIRM_DELAY,
    MODE_CHOICES,
    playerCount,
    selectItem,
    update,
    type FlowDeps,
    type Mode,
    type Screen,
    type TickInput,
} from "./flow"
import type { Outcome } from "./game"
import type { Action } from "./input"
import { emptyProgress, markCleared } from "./progress"
import { AnimalId, DEFAULT_ANIMAL } from "./roster"
import {
    difficultySelect,
    fixedRandom,
    parseFlat,
    sameAtEvery,
} from "./test/helpers"
import { vec2 } from "./vec2"

// Difficulty select (KDA-265): stage select -> difficulty select ->
// character select, in every mode, and the difficulty picked carried
// through to the game and its end screens.

const levels = ["first", "second"].map((name) =>
    sameAtEvery(
        parseFlat({
            name,
            parTime: 60,
            map: ["######", "#PQ..#", "######"],
            enemies: [],
        })
    )
)

const TICKS_TO_CONFIRM = Math.ceil(END_CONFIRM_DELAY * 60)

// One tick's presses, by player (player 1 first).
function input(pressed: readonly (readonly Action[])[] = []): TickInput {
    return {
        wasPressed: (action, player = 0) =>
            pressed[player]?.includes(action) ?? false,
        move: () => ({ held: [], pressed: vec2(0, 0) }),
    }
}
const p1 = (...actions: Action[]) => input([actions])

// Both stages open; every game step ends the game with `outcome`.
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

const stageSelect = (mode: Mode, selected = 1): Screen => ({
    kind: "stageSelect",
    mode,
    selected,
})

describe("stage select to difficulty select", () => {
    it.each(MODE_CHOICES)(
        "opens it on the stage in %s, on Medium with no last pick",
        (mode) => {
            const next = update(stageSelect(mode), p1("confirm"), deps())
            expect(next).toEqual(difficultySelect(1, "medium", mode))
        }
    )

    it.each(MODE_CHOICES)("opens it on the last pick in %s", (mode) => {
        const next = update(
            stageSelect(mode),
            p1("confirm"),
            deps({ lastDifficulty: "superHard" })
        )
        expect(next).toEqual(difficultySelect(1, "superHard", mode))
    })

    it("doesn't open it for a locked stage", () => {
        const locked = stageSelect("solo", 1)
        const fresh = deps({ progress: emptyProgress() })
        expect(update(locked, p1("confirm"), fresh)).toBe(locked)
    })
})

describe("difficulty select", () => {
    const at = (difficulty: Difficulty) => difficultySelect(0, difficulty)

    it.each([
        ["down", "right"],
        ["up", "left"],
    ] as const)(
        "moves with %s or %s, one step a tick, stopping at either end",
        (a, b) => {
            const forward = a === "down"
            const order = forward ? DIFFICULTIES : [...DIFFICULTIES].reverse()
            for (const action of [a, b]) {
                let screen: Screen = at(order[0])
                const seen = [order[0]]
                for (let i = 0; i < DIFFICULTIES.length + 1; i++) {
                    const next = update(screen, p1(action), deps())
                    if (next.kind !== "difficultySelect") {
                        throw new Error(next.kind)
                    }
                    if (next !== screen) seen.push(next.difficulty)
                    screen = next
                }
                expect(seen).toEqual(order)
            }
        }
    )

    it("doesn't move when both ways are pressed at once", () => {
        const screen = at("medium")
        expect(update(screen, p1("up", "right"), deps())).toBe(screen)
    })

    it("stays put with no input, or on breath", () => {
        const screen = at("hard")
        expect(update(screen, p1(), deps())).toBe(screen)
        expect(update(screen, p1("breath"), deps())).toBe(screen)
    })

    it.each(MODE_CHOICES)(
        "goes on to character select at the difficulty picked in %s, every cursor on the last character",
        (mode) => {
            const screen = difficultySelect(1, "hard", mode)
            const count = playerCount(mode)
            const next = update(
                screen,
                p1("confirm"),
                deps({ lastAnimal: AnimalId.owl })
            )
            expect(next).toEqual({
                kind: "characterSelect",
                mode,
                level: 1,
                difficulty: "hard",
                picks: Array(count).fill(AnimalId.owl),
                ready: Array(count).fill(false),
            })
        }
    )

    it.each(MODE_CHOICES)(
        "goes back to stage select on the same stage in %s",
        (mode) => {
            const screen = difficultySelect(1, "easy", mode)
            expect(update(screen, p1("pause"), deps())).toEqual(
                stageSelect(mode, 1)
            )
        }
    )

    it("confirms rather than goes back when both are pressed", () => {
        const next = update(at("easy"), p1("confirm", "pause"), deps())
        expect(next.kind).toBe("characterSelect")
    })

    it("follows player 1 only in 2-player modes", () => {
        const screen = difficultySelect(0, "medium", "coop")
        for (const action of ["up", "down", "confirm", "pause"] as const) {
            expect(update(screen, input([[], [action]]), deps())).toBe(screen)
        }
        expect(update(screen, input([["down"]]), deps())).toMatchObject({
            difficulty: "hard",
        })
    })
})

describe("character select back to difficulty select", () => {
    it.each(MODE_CHOICES)(
        "goes back on the difficulty picked in %s, and forward again",
        (mode) => {
            let screen = update(
                difficultySelect(1, "medium", mode),
                p1("down"),
                deps()
            )
            screen = update(screen, p1("confirm"), deps())
            expect(screen).toMatchObject({
                kind: "characterSelect",
                difficulty: "hard",
            })
            screen = update(screen, p1("pause"), deps())
            expect(screen).toEqual(difficultySelect(1, "hard", mode))
            screen = update(screen, p1("pause"), deps())
            expect(screen).toEqual(stageSelect(mode, 1))
        }
    )
})

describe("selectItem on difficulty select", () => {
    it("puts the cursor on the item tapped, then confirm picks it", () => {
        const screen = selectItem(difficultySelect(0, "medium"), 3)
        expect(screen).toEqual(difficultySelect(0, "superHard"))
        expect(update(screen, p1("confirm"), deps())).toMatchObject({
            kind: "characterSelect",
            difficulty: "superHard",
        })
    })

    it("comes back unchanged on the current item or off the menu", () => {
        const screen = difficultySelect(0, "easy")
        for (const index of [0, -1, DIFFICULTIES.length, 1.5]) {
            expect(selectItem(screen, index)).toBe(screen)
        }
    })
})

describe("the difficulty picked", () => {
    // From stage select through difficulty select (opening on Easy, moving
    // down to `difficulty`) and character select (every player confirming)
    // to play.
    function play(mode: Mode, difficulty: Difficulty, outcome: Outcome) {
        const d = deps({ lastDifficulty: "easy" }, outcome)
        let screen = update(stageSelect(mode, 0), p1("confirm"), d)
        for (let i = 0; i < DIFFICULTIES.indexOf(difficulty); i++) {
            screen = update(screen, p1("down"), d)
        }
        screen = update(screen, p1("confirm"), d)
        const everyone = Array.from({ length: playerCount(mode) }, () => [
            "confirm" as const,
        ])
        screen = update(screen, input(everyone), d)
        return { screen, d }
    }

    // Through the outro to the end screen, and past its confirm delay.
    function finish(screen: Screen, d: FlowDeps): Screen {
        let s = update(screen, p1(), d)
        while (s.kind === "ending") s = update(s, p1(), d)
        for (let i = 0; i < TICKS_TO_CONFIRM; i++) s = update(s, p1(), d)
        return s
    }

    it.each([
        ["solo", "won", "stageClear"],
        ["solo", "dead", "gameOver"],
        ["coop", "won", "stageClear"],
        ["coop", "dead", "gameOver"],
        ["versus", "won", "roundResult"],
    ] as const)(
        "plays %s at it, shows it on the end screen (%s: %s), and Retry or Next round keeps it",
        (mode, outcome, kind) => {
            const { screen, d } = play(mode, "superHard", outcome)
            expect(screen).toMatchObject({
                kind: "playing",
                mode,
                difficulty: "superHard",
                animals: Array(playerCount(mode)).fill(DEFAULT_ANIMAL),
            })
            const end = finish(screen, d)
            expect(end).toMatchObject({ kind, difficulty: "superHard" })
            expect(update(end, p1("confirm"), d)).toMatchObject({
                kind: "playing",
                difficulty: "superHard",
            })
        }
    )
})
