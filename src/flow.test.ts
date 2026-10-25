import { describe, expect, it, vi } from "vite-plus/test"
import { Cell } from "./constants"
import {
    END_CHOICES,
    gameOf,
    initialScreen,
    startLevel,
    update,
    type FlowDeps,
    type Screen,
    type TickInput,
} from "./flow"
import { step, type MoveInput } from "./game"
import type { Action } from "./input"
import { parseLevel } from "./level"
import { fixedRandom } from "./test/helpers"
import { vec2 } from "./vec2"

const none = vec2(0, 0)
const east = vec2(1, 0)

// Two tiny levels. "corridor" has no enemies and is won by walking east to
// eat its two dots; "second" is there so stage select has a list to move in.
const corridor = parseLevel({
    name: "corridor",
    map: ["#####", "#P..#", "#####"],
    enemies: [],
})
const second = parseLevel({
    name: "second",
    map: ["#####", "#P.E#", "#####"],
    enemies: [{ ai: "random" }],
})
const levels = [corridor, second]

// Input for one tick: these actions pressed, `held` held for movement.
function tickInput(pressed: Action[] = [], held = none): TickInput {
    const set = new Set(pressed)
    return {
        wasPressed: (action) => set.has(action),
        move: (): MoveInput => ({
            held: held === none ? [] : [held],
            pressed: none,
        }),
    }
}

function deps(overrides: Partial<FlowDeps> = {}): FlowDeps {
    return { levels, dt: 1 / 60, random: fixedRandom(0), ...overrides }
}

// A stepper that ends the game with `outcome` on its first call.
function endingStep(outcome: "dead" | "won") {
    return vi.fn<typeof step>(() => outcome)
}

function playing(level = 0): Extract<Screen, { kind: "playing" }> {
    const screen = startLevel(levels, level)
    if (screen.kind !== "playing") throw new Error("not playing")
    return screen
}

function end(
    kind: "stageClear" | "gameOver",
    choice: (typeof END_CHOICES)[number] = "retry",
    level = 0
): Screen {
    const { game } = playing(level)
    return { kind, level, game, choice }
}

describe("initialScreen", () => {
    it("opens on the title screen", () => {
        expect(initialScreen()).toEqual({ kind: "title" })
    })
})

describe("title", () => {
    it("goes to stage select on confirm, with the first stage selected", () => {
        expect(update(initialScreen(), tickInput(["confirm"]), deps())).toEqual(
            { kind: "stageSelect", selected: 0 }
        )
    })

    it("stays put on any other input", () => {
        const title = initialScreen()
        for (const action of ["up", "down", "left", "pause", "breath"]) {
            expect(update(title, tickInput([action as Action]), deps())).toBe(
                title
            )
        }
    })
})

describe("stageSelect", () => {
    const select = (selected: number): Screen => ({
        kind: "stageSelect",
        selected,
    })

    it("moves the selection with up and down, stopping at either end", () => {
        expect(update(select(0), tickInput(["down"]), deps())).toEqual(
            select(1)
        )
        expect(update(select(1), tickInput(["up"]), deps())).toEqual(select(0))
        const top = select(0)
        expect(update(top, tickInput(["up"]), deps())).toBe(top)
        const bottom = select(1)
        expect(update(bottom, tickInput(["down"]), deps())).toBe(bottom)
    })

    it("starts the selected stage on confirm", () => {
        const next = update(select(1), tickInput(["confirm"]), deps())
        expect(next.kind).toBe("playing")
        if (next.kind !== "playing") return
        expect(next.level).toBe(1)
        expect(next.game.cells).toEqual(second.cells.map((row) => [...row]))
    })

    it("goes back to the title on pause", () => {
        expect(update(select(0), tickInput(["pause"]), deps())).toEqual({
            kind: "title",
        })
    })

    it("stays put with no input", () => {
        const screen = select(0)
        expect(update(screen, tickInput(), deps())).toBe(screen)
    })
})

describe("playing", () => {
    it("steps the game with the tick's movement and stays playing", () => {
        const screen = playing()
        const stepper = vi.fn<typeof step>(() => null)
        const input = tickInput([], east)
        const next = update(screen, input, deps({ step: stepper, dt: 0.5 }))
        expect(next).toBe(screen)
        expect(stepper).toHaveBeenCalledTimes(1)
        expect(stepper).toHaveBeenCalledWith(
            screen.game,
            0.5,
            { held: [east], pressed: none },
            expect.any(Function)
        )
    })

    it("steps the real game by default", () => {
        const screen = playing()
        // A whole cell's worth of time with east held moves the player.
        update(screen, tickInput([], east), deps({ dt: 1 }))
        expect(screen.game.player.pos).toEqual(vec2(2, 1))
    })

    it("pauses on pause without stepping", () => {
        const screen = playing()
        const stepper = vi.fn<typeof step>(() => null)
        const next = update(
            screen,
            tickInput(["pause"]),
            deps({ step: stepper })
        )
        expect(next).toEqual({ ...screen, kind: "paused" })
        expect(stepper).not.toHaveBeenCalled()
    })

    it("ignores confirm", () => {
        const screen = playing()
        const next = update(
            screen,
            tickInput(["confirm"]),
            deps({ step: () => null })
        )
        expect(next).toBe(screen)
    })

    it("goes to game over when the game is lost, with retry selected", () => {
        const screen = playing(1)
        const next = update(
            screen,
            tickInput(),
            deps({ step: endingStep("dead") })
        )
        expect(next).toEqual({
            kind: "gameOver",
            level: 1,
            game: screen.game,
            choice: "retry",
        })
    })

    it("goes to stage clear when the game is won, with retry selected", () => {
        const screen = playing()
        const next = update(
            screen,
            tickInput(),
            deps({ step: endingStep("won") })
        )
        expect(next).toEqual({
            kind: "stageClear",
            level: 0,
            game: screen.game,
            choice: "retry",
        })
    })

    it("reaches stage clear through the real game", () => {
        let screen: Screen = playing()
        for (let i = 0; i < 4 && screen.kind === "playing"; i++) {
            screen = update(screen, tickInput([], east), deps({ dt: 1 }))
        }
        expect(screen.kind).toBe("stageClear")
    })
})

describe("paused", () => {
    const paused = (): Screen => ({ ...playing(), kind: "paused" })

    it("resumes on pause or confirm, keeping the same game", () => {
        for (const action of ["pause", "confirm"] as const) {
            const screen = paused()
            const next = update(screen, tickInput([action]), deps())
            expect(next).toEqual({ ...screen, kind: "playing" })
            expect(gameOf(next)).toBe(gameOf(screen))
        }
    })

    it("never steps the game, whatever is pressed or held", () => {
        const screen = paused()
        const stepper = vi.fn<typeof step>(() => null)
        const input = tickInput(["up", "left", "breath"], east)
        for (let i = 0; i < 10; i++) {
            expect(update(screen, input, deps({ step: stepper }))).toBe(screen)
        }
        expect(stepper).not.toHaveBeenCalled()
    })
})

describe.each(["stageClear", "gameOver"] as const)("%s", (kind) => {
    it("retries the same stage on confirm with retry selected", () => {
        const screen = end(kind, "retry", 1)
        const next = update(screen, tickInput(["confirm"]), deps())
        expect(next.kind).toBe("playing")
        if (next.kind !== "playing") return
        expect(next.level).toBe(1)
        // A fresh game, not the finished one.
        expect(next.game).not.toBe(gameOf(screen))
        expect(next.game.cells).toEqual(second.cells.map((row) => [...row]))
    })

    it("goes to stage select on confirm with stage select selected", () => {
        const screen = end(kind, "stageSelect", 1)
        expect(update(screen, tickInput(["confirm"]), deps())).toEqual({
            kind: "stageSelect",
            selected: 1,
        })
    })

    it("moves the choice with up and down, stopping at either end", () => {
        const retry = end(kind, "retry")
        const select = update(retry, tickInput(["down"]), deps())
        expect(select).toEqual({ ...retry, choice: "stageSelect" })
        expect(update(select, tickInput(["down"]), deps())).toBe(select)
        expect(update(select, tickInput(["up"]), deps())).toEqual(retry)
        expect(update(retry, tickInput(["up"]), deps())).toBe(retry)
    })

    it("ignores pause", () => {
        const screen = end(kind)
        expect(update(screen, tickInput(["pause"]), deps())).toBe(screen)
    })
})

describe("after the game ends", () => {
    // Regression (M1): nothing may change once the game has ended, even with
    // a direction held and enemies still able to move.
    it.each(["dead", "won"] as const)(
        "never steps the finished game again (%s)",
        (outcome) => {
            const stepper = vi.fn<typeof step>(() => outcome)
            let screen: Screen = playing()
            screen = update(
                screen,
                tickInput([], east),
                deps({ step: stepper })
            )
            expect(stepper).toHaveBeenCalledTimes(1)
            for (let i = 0; i < 20; i++) {
                screen = update(
                    screen,
                    tickInput(["up", "down", "breath"], east),
                    deps({ step: stepper })
                )
            }
            expect(stepper).toHaveBeenCalledTimes(1)
        }
    )

    it("leaves the finished game's state untouched", () => {
        // The trap level ends on the first tick, with dots left and the
        // enemy free to wander off.
        const trap = parseLevel({
            name: "trap",
            map: ["#######", "#PE...#", "#######"],
            enemies: [{ ai: "random", speed: 60 }],
        })
        const d = deps({ levels: [trap], dt: 1 })
        let screen: Screen = startLevel([trap], 0)
        screen = update(screen, tickInput([], east), d)
        expect(screen.kind).toBe("gameOver")
        const game = gameOf(screen)!
        const snapshot = structuredClone(game)
        for (let i = 0; i < 20; i++) {
            screen = update(screen, tickInput(["down"], east), d)
            screen = update(screen, tickInput(["up"], east), d)
        }
        expect(game).toEqual(snapshot)
        expect(game.cells[1][3]).toBe(Cell.dot)
    })
})

describe("no input carry-over", () => {
    // A tick that changes screens handles nothing else, so a press made on a
    // menu (or while paused) is never also read by the game.
    it("doesn't step the game on the tick that starts or resumes it", () => {
        const stepper = vi.fn<typeof step>(() => null)
        const d = deps({ step: stepper })
        const everything = tickInput(
            ["confirm", "up", "down", "left", "right", "pause"],
            east
        )
        const fromSelect = update(
            { kind: "stageSelect", selected: 0 },
            everything,
            d
        )
        expect(fromSelect.kind).toBe("playing")
        const fromPause = update(
            { ...playing(), kind: "paused" },
            everything,
            d
        )
        expect(fromPause.kind).toBe("playing")
        const fromEnd = update(end("gameOver"), everything, d)
        expect(fromEnd.kind).toBe("playing")
        expect(stepper).not.toHaveBeenCalled()
    })

    it("doesn't read movement outside of play", () => {
        const move = vi.fn((): MoveInput => ({ held: [east], pressed: east }))
        const input = { wasPressed: () => false, move }
        const screens: Screen[] = [
            initialScreen(),
            { kind: "stageSelect", selected: 0 },
            { ...playing(), kind: "paused" },
            end("stageClear"),
            end("gameOver"),
        ]
        for (const screen of screens) update(screen, input, deps())
        expect(move).not.toHaveBeenCalled()
    })

    it("doesn't confirm twice when a confirm starts a stage", () => {
        // One confirm press moves the title on by exactly one screen.
        const next = update(initialScreen(), tickInput(["confirm"]), deps())
        expect(next.kind).toBe("stageSelect")
    })
})

describe("gameOf", () => {
    it("returns the game on screens that show one", () => {
        const screen = playing()
        expect(gameOf(screen)).toBe(screen.game)
        expect(gameOf({ ...screen, kind: "paused" })).toBe(screen.game)
        expect(gameOf(end("gameOver"))).toBeDefined()
    })

    it("returns undefined on menus", () => {
        expect(gameOf(initialScreen())).toBeUndefined()
        expect(gameOf({ kind: "stageSelect", selected: 0 })).toBeUndefined()
    })
})
