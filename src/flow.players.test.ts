import { describe, expect, it, vi } from "vite-plus/test"
import {
    initialScreen,
    MODE_CHOICES,
    playerCount,
    recordsProgress,
    startLevel,
    update,
    type FlowDeps,
    type Mode,
    type Picks,
    type Screen,
    type TickInput,
} from "./flow"
import { step, type MoveInput } from "./game"
import type { Action } from "./input"
import { emptyProgress, markCleared } from "./progress"
import { AnimalId, DEFAULT_ANIMAL } from "./roster"
import {
    difficultySelect,
    fixedRandom,
    parseFlat,
    sameAtEvery,
} from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"

// The screen machine with a mode picked on the title, and two players
// picking characters and playing.

const none = vec2(0, 0)
const east = vec2(1, 0)
const west = vec2(-1, 0)

const levels = [
    parseFlat({
        name: "corridor",
        parTime: 60,
        map: ["######", "#PQ..#", "######"],
        enemies: [],
    }),
    parseFlat({
        name: "second",
        parTime: 60,
        map: ["#####", "#P.E#", "#####"],
        enemies: [{ ai: "random" }],
    }),
    parseFlat({
        name: "third",
        parTime: 60,
        map: ["#####", "#P.E#", "#####"],
        enemies: [{ ai: "random" }],
    }),
].map(sameAtEvery)

// Input for one tick: the actions each player pressed (player 1 first) and
// the direction each holds.
function input(
    pressed: readonly (readonly Action[])[] = [],
    held: readonly Vec2[] = []
): TickInput {
    return {
        wasPressed: (action, player = 0) =>
            pressed[player]?.includes(action) ?? false,
        move: (player = 0): MoveInput => {
            const h = held[player] ?? none
            return { held: h === none ? [] : [h], pressed: none }
        },
    }
}

// Stages 1 and 2 open in 1-player; stage 3 locked.
function deps(overrides: Partial<FlowDeps> = {}): FlowDeps {
    return {
        levels,
        progress: markCleared(emptyProgress(), 0),
        dt: 1 / 60,
        random: fixedRandom(0),
        ...overrides,
    }
}

function characterSelect(
    picks: Picks = [DEFAULT_ANIMAL, DEFAULT_ANIMAL],
    ready: readonly boolean[] = [false, false],
    level = 0
): Extract<Screen, { kind: "characterSelect" }> {
    return {
        kind: "characterSelect",
        mode: "coop",
        level,
        difficulty: "medium",
        picks,
        ready,
    }
}

function playing(
    animals: Picks = [AnimalId.dragon, AnimalId.owl]
): Extract<Screen, { kind: "playing" }> {
    const screen = startLevel(levels, 0, animals, "coop")
    if (screen.kind !== "playing") throw new Error(screen.kind)
    return screen
}

describe("modes", () => {
    it("offers 1 player first, then co-op and versus", () => {
        expect(MODE_CHOICES).toEqual(["solo", "coop", "versus"])
    })

    it("counts the players in each mode", () => {
        expect(playerCount("solo")).toBe(1)
        expect(playerCount("coop")).toBe(2)
        expect(playerCount("versus")).toBe(2)
    })

    it("start the game by their own rules", () => {
        const game = (screen: Screen) =>
            screen.kind === "playing" ? screen.game : null
        expect(game(startLevel(levels, 0, AnimalId.owl))?.mode).toBe("solo")
        const picks: Picks = [AnimalId.dragon, AnimalId.owl]
        for (const mode of ["coop", "versus"] as const) {
            expect(game(startLevel(levels, 0, picks, mode))?.mode).toBe(mode)
        }
    })

    it("records progress only for 1-player games", () => {
        expect(recordsProgress("solo")).toBe(true)
        expect(recordsProgress("coop")).toBe(false)
        expect(recordsProgress("versus")).toBe(false)
    })
})

describe("the title's mode select", () => {
    it("opens on 1 player", () => {
        expect(initialScreen()).toEqual({ kind: "title", mode: "solo" })
    })

    it("moves over the modes, then Settings, with up and down, stopping at either end", () => {
        const solo = initialScreen()
        const coop = update(solo, input([["down"]]), deps())
        expect(coop).toEqual({ kind: "title", mode: "coop" })
        const versus = update(coop, input([["down"]]), deps())
        expect(versus).toEqual({ kind: "title", mode: "versus" })
        const settings = update(versus, input([["down"]]), deps())
        expect(settings).toEqual({
            kind: "title",
            mode: "versus",
            onSettings: true,
        })
        expect(update(settings, input([["down"]]), deps())).toBe(settings)
        expect(update(settings, input([["up"]]), deps())).toEqual(versus)
        expect(update(coop, input([["up"]]), deps())).toEqual(solo)
        expect(update(solo, input([["up"]]), deps())).toBe(solo)
    })

    it("goes on to the choice of story or stage mode in the picked mode", () => {
        const title: Screen = { kind: "title", mode: "coop" }
        expect(update(title, input([["confirm"]]), deps())).toEqual({
            kind: "playSelect",
            mode: "coop",
            choice: "story",
        })
    })

    it("goes straight on to stage select in versus", () => {
        const title: Screen = { kind: "title", mode: "versus" }
        expect(update(title, input([["confirm"]]), deps())).toEqual({
            kind: "stageSelect",
            mode: "versus",
            selected: 0,
        })
    })

    it("follows player 1 only", () => {
        const title = initialScreen()
        expect(update(title, input([[], ["down", "confirm"]]), deps())).toBe(
            title
        )
    })

    it("is where versus stage select goes back to, on the same mode", () => {
        const select: Screen = {
            kind: "stageSelect",
            mode: "versus",
            selected: 1,
        }
        expect(update(select, input([["pause"]]), deps())).toEqual({
            kind: "title",
            mode: "versus",
        })
    })
})

describe("2-player stage select", () => {
    const select = (selected: number): Screen => ({
        kind: "stageSelect",
        mode: "coop",
        selected,
    })

    it("opens difficulty select, then character select with both cursors on the last pick", () => {
        const d = deps({ lastAnimal: AnimalId.skunk })
        const difficulty = update(select(1), input([["confirm"]]), d)
        expect(difficulty).toEqual(difficultySelect(1, "medium", "coop"))
        const next = update(difficulty, input([["confirm"]]), d)
        expect(next).toEqual(
            characterSelect([AnimalId.skunk, AnimalId.skunk], [false, false], 1)
        )
    })

    it("plays only stages unlocked in 1-player", () => {
        const locked = select(2)
        expect(update(locked, input([["confirm"]]), deps())).toBe(locked)
    })
})

describe("2-player character select", () => {
    it("moves each player's cursor with its own keys", () => {
        const both = update(characterSelect(), input([["right"], []]), deps())
        expect(both).toEqual(
            characterSelect([AnimalId.penguin, AnimalId.dragon])
        )
        const next = update(both, input([[], ["right"]]), deps())
        expect(next).toEqual(
            characterSelect([AnimalId.penguin, AnimalId.penguin])
        )
    })

    it("waits for both players to confirm", () => {
        let screen: Screen = characterSelect([AnimalId.owl, AnimalId.boar])
        screen = update(screen, input([["confirm"]]), deps())
        expect(screen).toEqual(
            characterSelect([AnimalId.owl, AnimalId.boar], [true, false])
        )
        // Player 1's cursor stays on its pick once confirmed.
        const still = update(screen, input([["left"]]), deps())
        expect(still).toBe(screen)
        screen = update(screen, input([[], ["confirm"]]), deps())
        expect(screen.kind).toBe("playing")
        if (screen.kind !== "playing") return
        expect(screen.mode).toBe("coop")
        expect(screen.game.mode).toBe("coop")
        expect(screen.animals).toEqual([AnimalId.owl, AnimalId.boar])
        expect(screen.game.players).toHaveLength(2)
        expect(screen.game.players[1].breather.breath.animal).toBe(
            AnimalId.boar
        )
    })

    it("starts at once when both confirm on the same tick", () => {
        const next = update(
            characterSelect(),
            input([["confirm"], ["confirm"]]),
            deps()
        )
        expect(next.kind).toBe("playing")
    })

    it("lets both players pick the same character", () => {
        const next = update(
            characterSelect([AnimalId.skunk, AnimalId.skunk], [true, false]),
            input([[], ["confirm"]]),
            deps()
        )
        expect(next.kind === "playing" && next.animals).toEqual([
            AnimalId.skunk,
            AnimalId.skunk,
        ])
    })

    it("takes a confirmation back on back", () => {
        const ready = characterSelect(undefined, [false, true])
        const next = update(ready, input([[], ["pause"]]), deps())
        expect(next).toEqual(characterSelect())
    })

    it("goes back to difficulty select on back from a player who hasn't confirmed", () => {
        const ready = characterSelect(undefined, [true, false], 1)
        expect(update(ready, input([[], ["pause"]]), deps())).toEqual(
            difficultySelect(1, "medium", "coop")
        )
    })
})

describe("2-player play", () => {
    it("steps the game with both players' input", () => {
        const screen = playing()
        const stepper = vi.fn<typeof step>(() => null)
        update(screen, input([], [east, west]), deps({ step: stepper }))
        expect(stepper).toHaveBeenCalledWith(
            screen.game,
            1 / 60,
            [
                { held: [east], pressed: none },
                { held: [west], pressed: none },
            ],
            expect.any(Function)
        )
    })

    it("steps a 1-player game with player 1's input alone", () => {
        const screen = startLevel(levels, 0, AnimalId.owl)
        const stepper = vi.fn<typeof step>(() => null)
        update(screen, input([], [east, west]), deps({ step: stepper }))
        expect(stepper.mock.lastCall?.[2]).toEqual({
            held: [east],
            pressed: none,
        })
    })

    it("pauses on either player's pause and resumes on either's", () => {
        const screen = playing()
        const paused = update(screen, input([[], ["pause"]]), deps())
        expect(paused).toEqual({ ...screen, kind: "paused" })
        expect(update(paused, input([[], ["confirm"]]), deps())).toEqual(screen)
        expect(update(paused, input([["pause"]]), deps())).toEqual(screen)
    })

    it("ignores player 2's pause in a 1-player game", () => {
        const screen = startLevel(levels, 0, AnimalId.owl)
        const stepper = vi.fn<typeof step>(() => null)
        expect(
            update(screen, input([[], ["pause"]]), deps({ step: stepper }))
        ).toBe(screen)
    })

    // Player 2 eats both dots of the corridor (spawns P at 1 and Q at 2).
    it("keeps the mode and both characters through the end screen and Retry", () => {
        const d = deps()
        let screen: Screen = playing([AnimalId.boar, AnimalId.penguin])
        for (let i = 0; i < 60 && screen.kind === "playing"; i++) {
            screen = update(screen, input([], [none, east]), d)
        }
        expect(screen.kind).toBe("ending")
        for (let i = 0; i < 60 && screen.kind === "ending"; i++) {
            screen = update(screen, input(), d)
        }
        expect(screen).toMatchObject({
            kind: "stageClear",
            mode: "coop",
            animals: [AnimalId.boar, AnimalId.penguin],
        })
        // The end screen ignores confirm for END_CONFIRM_DELAY.
        expect(update(screen, input([["confirm"]]), d)).toBe(screen)
        for (let i = 0; i < 60; i++) screen = update(screen, input(), d)
        // Only player 1 drives the end screens.
        expect(update(screen, input([[], ["confirm"]]), d)).toBe(screen)
        expect(update(screen, input([[], ["down"]]), d)).toBe(screen)
        const retry = update(screen, input([["confirm"]]), d)
        expect(retry).toMatchObject({
            kind: "playing",
            mode: "coop",
            animals: [AnimalId.boar, AnimalId.penguin],
        })
        // The retried game plays by the same rules.
        expect(retry.kind === "playing" && retry.game.mode).toBe("coop")
        const back = update(
            {
                ...(screen as Extract<Screen, { kind: "stageClear" }>),
                choice: "stageSelect",
            },
            input([["confirm"]]),
            d
        )
        expect(back).toEqual({ kind: "stageSelect", mode: "coop", selected: 0 })
    })

    it.each(["solo", "coop"] as Mode[])(
        "starts a %s game with one player per pick",
        (mode) => {
            const count = playerCount(mode)
            const picks = Array(count).fill(AnimalId.owl) as unknown as Picks
            const screen = startLevel(levels, 0, picks, mode)
            expect(
                screen.kind === "playing" && screen.game.players
            ).toHaveLength(count)
        }
    )
})
