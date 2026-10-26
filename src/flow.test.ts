import { describe, expect, it, vi } from "vite-plus/test"
import { Cell, DOT_POINTS, START_LIVES } from "./constants"
import {
    END_CHOICES,
    gameOf,
    initialScreen,
    pauseIfPlaying,
    startLevel,
    update,
    type FlowDeps,
    type Screen,
    type TickInput,
} from "./flow"
import { step, type MoveInput } from "./game"
import type { Action } from "./input"
import { parseLevel } from "./level"
import { emptyProgress, markCleared, STAGE_COUNT } from "./progress"
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

// The player walks east straight into the enemy, losing a life every tick
// (with dt 1), while dots remain.
const trap = parseLevel({
    name: "trap",
    map: ["#######", "#PE...#", "#######"],
    enemies: [{ ai: "random", speed: 60 }],
})

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

// Stage 1 cleared, so both fixture levels are open; slots 2+ have no level.
const bothOpen = markCleared(emptyProgress(), 0)

function deps(overrides: Partial<FlowDeps> = {}): FlowDeps {
    return {
        levels,
        progress: bothOpen,
        dt: 1 / 60,
        random: fixedRandom(0),
        ...overrides,
    }
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

// The outro after a game ended with `outcome`, the player `progress` of the
// way through its last glide.
function ending(
    outcome: "dead" | "won",
    progress = 0
): Extract<Screen, { kind: "ending" }> {
    const { level, game } = playing()
    game.player.moveProgress = progress
    return { kind: "ending", level, game, outcome }
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
        const bottom = select(STAGE_COUNT - 1)
        expect(update(bottom, tickInput(["down"]), deps())).toBe(bottom)
    })

    it("always has STAGE_COUNT slots, whatever the number of levels", () => {
        let screen = select(0)
        for (let i = 0; i < STAGE_COUNT + 2; i++) {
            screen = update(screen, tickInput(["down"]), deps())
        }
        expect(screen).toEqual(select(STAGE_COUNT - 1))
        const one = deps({ levels: [corridor], progress: emptyProgress() })
        expect(update(select(0), tickInput(["down"]), one)).toEqual(select(1))
    })

    it("lands on locked stages and placeholders without skipping them", () => {
        // Nothing cleared: only stage 1 is open, yet the cursor reaches 2 and 3.
        const fresh = deps({ progress: emptyProgress() })
        expect(update(select(0), tickInput(["down"]), fresh)).toEqual(select(1))
        expect(update(select(1), tickInput(["down"]), fresh)).toEqual(select(2))
    })

    it("does nothing on confirm on a locked stage", () => {
        const fresh = deps({ progress: emptyProgress() })
        const locked = select(1)
        expect(update(locked, tickInput(["confirm"]), fresh)).toBe(locked)
    })

    it("does nothing on confirm on a slot with no level, even if unlocked", () => {
        // Clear every stage, so slot 2 is unlocked but has no level.
        let all = emptyProgress()
        for (let i = 0; i < STAGE_COUNT; i++) all = markCleared(all, i)
        for (let i = levels.length; i < STAGE_COUNT; i++) {
            const placeholder = select(i)
            expect(
                update(
                    placeholder,
                    tickInput(["confirm"]),
                    deps({ progress: all })
                )
            ).toBe(placeholder)
        }
    })

    it("starts stage 1 with nothing cleared", () => {
        const fresh = deps({ progress: emptyProgress() })
        const next = update(select(0), tickInput(["confirm"]), fresh)
        expect(next.kind).toBe("playing")
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

    it.each([
        ["dead", "gameOver"],
        ["won", "stageClear"],
    ] as const)(
        "ends the game (%s) with the outro, then %s with retry selected",
        (outcome, kind) => {
            const screen = playing(1)
            const d = deps({ step: endingStep(outcome) })
            const outro = update(screen, tickInput(), d)
            expect(outro).toEqual({
                kind: "ending",
                level: 1,
                game: screen.game,
                outcome,
            })
            // The player is already on its cell here, so the outro is over
            // after one tick.
            expect(update(outro, tickInput(), d)).toEqual({
                kind,
                level: 1,
                game: screen.game,
                choice: "retry",
            })
        }
    )

    it("reaches stage clear through the real game", () => {
        let screen: Screen = playing()
        const kinds: string[] = []
        for (let i = 0; i < 6 && screen.kind !== "stageClear"; i++) {
            screen = update(screen, tickInput([], east), deps({ dt: 1 }))
            kinds.push(screen.kind)
        }
        expect(kinds).toEqual(["playing", "ending", "stageClear"])
    })

    it("keeps playing the same game after losing a life, until the last", () => {
        const d = deps({ levels: [trap], dt: 1 })
        const start = startLevel([trap], 0)
        let screen: Screen = start
        for (let lives = START_LIVES - 1; lives > 0; lives--) {
            screen = update(screen, tickInput([], east), d)
            expect(screen).toBe(start)
            expect(gameOf(screen)?.lives).toBe(lives)
        }
        screen = update(screen, tickInput([], east), d)
        expect(screen.kind).toBe("ending")
        screen = update(screen, tickInput([], east), d)
        expect(screen.kind).toBe("gameOver")
        expect(gameOf(screen)).toBe(gameOf(start))
        expect(gameOf(screen)?.lives).toBe(0)
    })
})

describe("ending", () => {
    // Regression: the stage-clear screen came up on the tick the last dot was
    // eaten, with the player drawn still a cell short of it, and it never
    // arrived.
    it("waits for the player's last glide before stage clear", () => {
        const d = deps()
        let screen: Screen = playing()
        while (screen.kind === "playing") {
            screen = update(screen, tickInput([], east), d)
        }
        expect(screen.kind).toBe("ending")
        const game = gameOf(screen)!
        // The last dot is eaten and the player has just moved onto it.
        expect(game.player.pos).toEqual(vec2(3, 1))
        expect(game.player.moveProgress).toBeLessThan(0.1)
        expect(game.score).toBe(2 * DOT_POINTS)

        // A glide lasts 1/speed seconds: 15 ticks at 4 cells/s.
        const ticks = Math.ceil(
            (1 - game.player.moveProgress) / (game.player.speed * d.dt) - 1e-9
        )
        expect(ticks).toBeGreaterThan(10)
        for (let i = 1; i < ticks; i++) {
            // Input, including confirm and pause, is ignored.
            screen = update(screen, tickInput(["confirm", "pause"], east), d)
            expect(screen.kind).toBe("ending")
            expect(game.player.moveProgress).toBeLessThan(1)
        }
        screen = update(screen, tickInput(["confirm"], east), d)
        expect(screen).toEqual({
            kind: "stageClear",
            level: 0,
            game,
            choice: "retry",
        })
        expect(game.player.moveProgress).toBe(1)
        expect(game.player.pos).toEqual(vec2(3, 1))
        expect(game.score).toBe(2 * DOT_POINTS)
    })

    it.each(["dead", "won"] as const)(
        "never steps the game or reads movement (%s)",
        (outcome) => {
            const stepper = vi.fn<typeof step>(() => null)
            const move = vi.fn((): MoveInput => ({
                held: [east],
                pressed: east,
            }))
            const input = { wasPressed: () => true, move }
            let screen: Screen = ending(outcome)
            for (let i = 0; i < 5; i++) {
                screen = update(screen, input, deps({ step: stepper }))
                expect(screen.kind).toBe("ending")
            }
            expect(stepper).not.toHaveBeenCalled()
            expect(move).not.toHaveBeenCalled()
        }
    )
})

describe("pauseIfPlaying", () => {
    it("pauses a game in progress, keeping the same game", () => {
        const screen = playing()
        const next = pauseIfPlaying(screen)
        expect(next).toEqual({ ...screen, kind: "paused" })
        expect(gameOf(next)).toBe(gameOf(screen))
    })

    it("leaves every other screen as it is", () => {
        const game = playing()
        const others: Screen[] = [
            initialScreen(),
            { kind: "stageSelect", selected: 0 },
            { ...game, kind: "paused" },
            ending("won"),
            ending("dead"),
            { ...game, kind: "stageClear", choice: "retry" },
            { ...game, kind: "gameOver", choice: "retry" },
        ]
        for (const screen of others) {
            expect(pauseIfPlaying(screen)).toBe(screen)
        }
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

    it("retries with the score reset and full lives", () => {
        const screen = end(kind, "retry")
        const finished = gameOf(screen)!
        finished.score = 5 * DOT_POINTS
        finished.lives = kind === "gameOver" ? 0 : 1
        const next = update(screen, tickInput(["confirm"]), deps())
        expect(gameOf(next)?.score).toBe(0)
        expect(gameOf(next)?.lives).toBe(START_LIVES)
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

    it("changes nothing in the finished game but the glides settling", () => {
        // In the trap level every tick costs a life, so the game ends after
        // START_LIVES ticks, with dots left and the enemy free to wander off.
        const d = deps({ levels: [trap], dt: 1 / 60 })
        let screen: Screen = startLevel([trap], 0)
        for (let i = 0; i < START_LIVES; i++) {
            screen = update(screen, tickInput([], east), deps({ ...d, dt: 1 }))
        }
        expect(screen.kind).toBe("ending")
        const game = gameOf(screen)!
        const before = structuredClone(game)
        // Mid-glide, so the outro has something to settle.
        game.player.moveProgress = before.player.moveProgress = 0
        for (let i = 0; i < 20; i++) {
            screen = update(screen, tickInput(["down"], east), d)
            screen = update(screen, tickInput(["up"], east), d)
        }
        expect(screen.kind).toBe("gameOver")
        // Only moveProgress may change during the outro: up to 1 (40 ticks
        // is plenty for every glide here), and never down.
        const characters = (g: typeof game) => [g.player, ...g.enemies]
        characters(game).forEach((c, i) => {
            const was = characters(before)[i].moveProgress
            expect(c.moveProgress).toBe(Math.max(was, 1))
        })
        const withoutProgress = (g: typeof game) => ({
            ...g,
            player: { ...g.player, moveProgress: 0 },
            enemies: g.enemies.map((e) => ({ ...e, moveProgress: 0 })),
        })
        expect(withoutProgress(game)).toEqual(withoutProgress(before))
        expect(game.cells[1][3]).toBe(Cell.dot)

        // On the end screen, nothing changes at all.
        const ended = structuredClone(game)
        for (let i = 0; i < 20; i++) {
            screen = update(screen, tickInput(["down"], east), d)
            screen = update(screen, tickInput(["up"], east), d)
        }
        expect(game).toEqual(ended)
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
