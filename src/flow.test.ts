import { describe, expect, it, vi } from "vite-plus/test"
import {
    Cell,
    DOT_POINTS,
    ENEMY_DAMAGE,
    MAX_HEALTH,
    TICK_RATE,
} from "./constants"
import {
    END_CHOICES,
    END_CONFIRM_DELAY,
    gameOf,
    initialScreen,
    pauseIfPlaying,
    selectItem,
    startLevel,
    update,
    type FlowDeps,
    type Screen,
    type TickInput,
} from "./flow"
import { step, type MoveInput } from "./game"
import { DEFAULT_DIFFICULTY, type Difficulty } from "./difficulty"
import type { Action } from "./input"
import type { Stage } from "./level"
import { emptyProgress, markCleared, STAGE_COUNT } from "./progress"
import { ANIMAL_IDS, AnimalId, DEFAULT_ANIMAL } from "./roster"
import { rateClear } from "./stars"
import {
    cloneState,
    difficultySelect,
    fixedRandom,
    parseFlat,
    sameAtEvery,
} from "./test/helpers"
import { vec2 } from "./vec2"

const none = vec2(0, 0)
const east = vec2(1, 0)

// Two tiny levels. "corridor" has no enemies and is won by walking east to
// eat its two dots; "second" is there so stage select has a list to move in.
const corridorData = {
    name: "corridor",
    parTime: 60,
    map: ["#####", "#P..#", "#####"],
    enemies: [],
}
const corridor = parseFlat(corridorData)
const second = parseFlat({
    name: "second",
    parTime: 60,
    map: ["#####", "#P.E#", "#####"],
    enemies: [{ ai: "random" }],
})
const levels = [corridor, second].map(sameAtEvery)

// The player walks east straight into the enemy, getting hurt whenever it
// isn't invulnerable (with dt 1), while dots remain.
const trap = parseFlat({
    name: "trap",
    parTime: 60,
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

function playing(
    level = 0,
    animal: AnimalId = DEFAULT_ANIMAL,
    difficulty: Difficulty = DEFAULT_DIFFICULTY
): Extract<Screen, { kind: "playing" }> {
    const screen = startLevel(levels, level, animal, "solo", [], difficulty)
    if (screen.kind !== "playing") throw new Error("not playing")
    return screen
}

// The outro after a game ended with `outcome`, the player `progress` of the
// way through its last glide.
function ending(
    outcome: "dead" | "won",
    progress = 0
): Extract<Screen, { kind: "ending" }> {
    const { mode, level, difficulty, animals, game } = playing()
    game.players[0].character.moveProgress = progress
    return { kind: "ending", mode, level, difficulty, animals, game, outcome }
}

function end(
    kind: "stageClear" | "gameOver",
    choice: (typeof END_CHOICES)[number] = "retry",
    level = 0,
    animal: AnimalId = DEFAULT_ANIMAL,
    difficulty: Difficulty = DEFAULT_DIFFICULTY
): Screen {
    const { mode, animals, game } = playing(level, animal, difficulty)
    const screen = { mode, level, difficulty, animals, game, choice }
    if (kind === "gameOver") return { kind, ...screen }
    const rating = rateClear(game, levels[level][difficulty].parTime)
    return { kind, ...screen, rating }
}

// Character select for stage `level`, player 1's cursor on `pick`.
function characterSelect(
    level = 0,
    pick: AnimalId = DEFAULT_ANIMAL
): Extract<Screen, { kind: "characterSelect" }> {
    return {
        kind: "characterSelect",
        mode: "solo",
        level,
        difficulty: DEFAULT_DIFFICULTY,
        picks: [pick],
        ready: [false],
    }
}

describe("initialScreen", () => {
    it("opens on the title screen", () => {
        expect(initialScreen()).toEqual({ kind: "title", mode: "solo" })
    })
})

describe("title", () => {
    it("goes to the choice of story or stage mode on confirm, on story", () => {
        expect(update(initialScreen(), tickInput(["confirm"]), deps())).toEqual(
            { kind: "playSelect", mode: "solo", choice: "story" }
        )
    })

    it("stays put on any other input", () => {
        const title = initialScreen()
        for (const action of ["up", "left", "right", "pause", "breath"]) {
            expect(update(title, tickInput([action as Action]), deps())).toBe(
                title
            )
        }
    })
})

describe("stageSelect", () => {
    const select = (selected: number): Screen => ({
        kind: "stageSelect",
        mode: "solo",
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
        const one = deps({
            levels: [sameAtEvery(corridor)],
            progress: emptyProgress(),
        })
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

    it("opens difficulty select for stage 1 with nothing cleared", () => {
        const fresh = deps({ progress: emptyProgress() })
        const next = update(select(0), tickInput(["confirm"]), fresh)
        expect(next).toEqual(difficultySelect(0))
    })

    it("opens difficulty select for the selected stage on confirm", () => {
        const next = update(select(1), tickInput(["confirm"]), deps())
        expect(next).toEqual(difficultySelect(1))
    })

    it("starts character select on the last pick", () => {
        const d = deps({ lastAnimal: AnimalId.skunk })
        const next = update(select(1), tickInput(["confirm"]), d)
        expect(update(next, tickInput(["confirm"]), d)).toEqual(
            characterSelect(1, AnimalId.skunk)
        )
    })

    it("starts character select on the Dragon with no last pick", () => {
        const next = update(select(0), tickInput(["confirm"]), deps())
        expect(update(next, tickInput(["confirm"]), deps())).toEqual(
            characterSelect(0, AnimalId.dragon)
        )
    })

    it("goes back to the choice of story or stage mode on pause, on stage", () => {
        expect(update(select(0), tickInput(["pause"]), deps())).toEqual({
            kind: "playSelect",
            mode: "solo",
            choice: "stage",
        })
    })

    it("stays put with no input", () => {
        const screen = select(0)
        expect(update(screen, tickInput(), deps())).toBe(screen)
    })
})

describe("characterSelect", () => {
    const last = ANIMAL_IDS.length - 1

    it("moves the cursor with left and right in roster order, stopping at either end", () => {
        let screen: Screen = characterSelect(0, ANIMAL_IDS[0])
        const seen = [ANIMAL_IDS[0]]
        for (let i = 0; i < ANIMAL_IDS.length + 2; i++) {
            const next = update(screen, tickInput(["right"]), deps())
            if (next.kind !== "characterSelect") throw new Error(next.kind)
            if (next !== screen) seen.push(next.picks[0])
            screen = next
        }
        expect(seen).toEqual(ANIMAL_IDS)
        const right = characterSelect(0, ANIMAL_IDS[last])
        expect(update(right, tickInput(["right"]), deps())).toBe(right)
        expect(update(right, tickInput(["left"]), deps())).toEqual(
            characterSelect(0, ANIMAL_IDS[last - 1])
        )
        const left = characterSelect(0, ANIMAL_IDS[0])
        expect(update(left, tickInput(["left"]), deps())).toBe(left)
    })

    it("ignores up and down", () => {
        const screen = characterSelect(0, AnimalId.owl)
        for (const action of ["up", "down", "breath"] as const) {
            expect(update(screen, tickInput([action]), deps())).toBe(screen)
        }
    })

    it("keeps one pick per player while moving", () => {
        const next = update(
            characterSelect(1, AnimalId.dragon),
            tickInput(["right"]),
            deps()
        )
        expect(next).toEqual({
            kind: "characterSelect",
            mode: "solo",
            level: 1,
            difficulty: "medium",
            picks: [AnimalId.penguin],
            ready: [false],
        })
    })

    it("starts the stage with the picked character on confirm", () => {
        const next = update(
            characterSelect(1, AnimalId.boar),
            tickInput(["confirm"]),
            deps({ lastAnimal: AnimalId.owl })
        )
        expect(next.kind).toBe("playing")
        if (next.kind !== "playing") return
        expect(next.level).toBe(1)
        expect(next.animals).toEqual([AnimalId.boar])
        expect(next.game.players[0].breather.breath.animal).toBe(AnimalId.boar)
        expect(next.game.cells).toEqual(second.cells.map((row) => [...row]))
    })

    it("goes back to difficulty select on the same stage on pause", () => {
        const next = update(
            characterSelect(1, AnimalId.owl),
            tickInput(["pause"]),
            deps()
        )
        expect(next).toEqual(difficultySelect(1))
    })

    it("stays put with no input", () => {
        const screen = characterSelect()
        expect(update(screen, tickInput(), deps())).toBe(screen)
    })

    it("goes stage select -> difficulty select -> character select -> playing, one screen per confirm", () => {
        const stepper = vi.fn<typeof step>(() => null)
        const d = deps({ step: stepper, lastAnimal: AnimalId.penguin })
        let screen: Screen = { kind: "stageSelect", mode: "solo", selected: 0 }
        screen = update(screen, tickInput(["confirm"]), d)
        expect(screen).toEqual(difficultySelect(0))
        screen = update(screen, tickInput(["confirm"]), d)
        expect(screen).toEqual(characterSelect(0, AnimalId.penguin))
        screen = update(screen, tickInput(["right"]), d)
        screen = update(screen, tickInput(["confirm"]), d)
        expect(screen.kind).toBe("playing")
        if (screen.kind !== "playing") return
        expect(screen.animals).toEqual([AnimalId.owl])
        expect(stepper).not.toHaveBeenCalled()
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
        expect(screen.game.players[0].character.pos).toEqual(vec2(2, 1))
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
            const screen = playing(1, AnimalId.skunk)
            const d = deps({ step: endingStep(outcome) })
            const outro = update(screen, tickInput(), d)
            expect(outro).toEqual({
                kind: "ending",
                level: 1,
                difficulty: "medium",
                mode: "solo",
                animals: [AnimalId.skunk],
                game: screen.game,
                outcome,
            })
            // The player is already on its cell here, so the outro is over
            // after one tick.
            expect(update(outro, tickInput(), d)).toEqual({
                kind,
                level: 1,
                difficulty: "medium",
                mode: "solo",
                animals: [AnimalId.skunk],
                game: screen.game,
                choice: "retry",
                shown: { seconds: 0 },
                ...(kind === "stageClear"
                    ? { rating: rateClear(screen.game, second.parTime) }
                    : {}),
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

    it("keeps playing the same game after a hit, until the knockout", () => {
        const d = deps({ levels: [sameAtEvery(trap)], dt: 1 })
        const start = startLevel([sameAtEvery(trap)], 0)
        gameOf(start)!.players[0].health = ENEMY_DAMAGE + 1
        let screen: Screen = update(start, tickInput([], east), d)
        expect(screen).toBe(start)
        expect(gameOf(screen)?.players[0].health).toBe(1)
        // Once it can be hurt again, the enemy back on it knocks it out.
        const game = gameOf(screen)!
        const [player] = game.players
        const at = player.character.pos
        player.invulnerableFor = 0
        game.enemies[0].pos = vec2(at.x, at.y)
        game.enemies[0].lastPos = vec2(at.x, at.y)
        screen = update(screen, tickInput(), d)
        expect(screen.kind).toBe("ending")
        screen = update(screen, tickInput([], east), d)
        expect(screen.kind).toBe("gameOver")
        expect(gameOf(screen)).toBe(gameOf(start))
        expect(gameOf(screen)?.players[0].health).toBe(0)
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
        expect(game.players[0].character.pos).toEqual(vec2(3, 1))
        expect(game.players[0].character.moveProgress).toBeLessThan(0.1)
        expect(game.players[0].score).toBe(2 * DOT_POINTS)

        // A glide lasts 1/speed seconds: 15 ticks at 4 cells/s.
        const ticks = Math.ceil(
            (1 - game.players[0].character.moveProgress) /
                (game.players[0].character.speed * d.dt) -
                1e-9
        )
        expect(ticks).toBeGreaterThan(10)
        for (let i = 1; i < ticks; i++) {
            // Input, including confirm and pause, is ignored.
            screen = update(screen, tickInput(["confirm", "pause"], east), d)
            expect(screen.kind).toBe("ending")
            expect(game.players[0].character.moveProgress).toBeLessThan(1)
        }
        screen = update(screen, tickInput(["confirm"], east), d)
        expect(screen).toEqual({
            kind: "stageClear",
            level: 0,
            difficulty: "medium",
            mode: "solo",
            animals: [DEFAULT_ANIMAL],
            game,
            choice: "retry",
            rating: rateClear(game, corridor.parTime),
            shown: { seconds: 0 },
        })
        expect(game.players[0].character.moveProgress).toBe(1)
        expect(game.players[0].character.pos).toEqual(vec2(3, 1))
        expect(game.players[0].score).toBe(2 * DOT_POINTS)
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

describe("clear time", () => {
    // Play the corridor to the end, east held: pausing for `pausedTicks`
    // ticks after the first move. Returns the stage clear screen.
    function clear(pausedTicks: number, d = deps()) {
        let screen: Screen = playing()
        screen = update(screen, tickInput([], east), d)
        expect(gameOf(screen)?.ticks).toBe(1)
        screen = update(screen, tickInput(["pause"], east), d)
        expect(screen.kind).toBe("paused")
        for (let i = 0; i < pausedTicks; i++) {
            screen = update(screen, tickInput([], east), d)
        }
        expect(gameOf(screen)?.ticks).toBe(1)
        screen = update(screen, tickInput(["pause"], east), d)
        expect(screen.kind).toBe("playing")
        // Neither the pause tick nor the resume tick stepped the game.
        expect(gameOf(screen)?.ticks).toBe(1)
        while (screen.kind === "playing") {
            screen = update(screen, tickInput([], east), d)
        }
        expect(screen.kind).toBe("ending")
        const played = gameOf(screen)!.ticks
        while (screen.kind === "ending") {
            screen = update(screen, tickInput(["confirm"], east), d)
        }
        if (screen.kind !== "stageClear") throw new Error(screen.kind)
        // The outro adds nothing.
        expect(screen.game.ticks).toBe(played)
        return screen
    }

    it("counts only the ticks that step the game", () => {
        // The first move on tick 1, the second dot a glide (15 ticks at 4
        // cells/s) later.
        expect(clear(0).rating.ticks).toBe(16)
    })

    it("doesn't count paused ticks", () => {
        expect(clear(10 * TICK_RATE).rating.ticks).toBe(16)
    })

    it("rates the clear against the level's par time", () => {
        const fast = clear(0)
        expect(fast.rating).toMatchObject({ stars: 3, underPar: true })
        // A par of 0.2 s (12 ticks) is short of the 16 played.
        const tight = parseFlat({ ...corridorData, parTime: 0.2 })
        const slow = clear(
            0,
            deps({ levels: [tight, second].map(sameAtEvery) })
        )
        expect(slow.rating).toMatchObject({
            ticks: 16,
            stars: 2,
            healthy: true,
            underPar: false,
        })
    })
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
            { kind: "stageSelect", mode: "solo", selected: 0 },
            characterSelect(),
            { ...game, kind: "paused" },
            ending("won"),
            ending("dead"),
            end("stageClear"),
            end("gameOver"),
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

    it("retries with the same character", () => {
        const screen = end(kind, "retry", 1, AnimalId.penguin)
        const next = update(
            screen,
            tickInput(["confirm"]),
            deps({ lastAnimal: AnimalId.owl })
        )
        expect(next.kind).toBe("playing")
        if (next.kind !== "playing") return
        expect(next.animals).toEqual([AnimalId.penguin])
        expect(next.game.players[0].breather.breath.animal).toBe(
            AnimalId.penguin
        )
    })

    it("keeps the character through pause and the outro to the end screen", () => {
        const stepper = endingStep(kind === "stageClear" ? "won" : "dead")
        let screen: Screen = playing(1, AnimalId.boar)
        screen = update(screen, tickInput(["pause"]), deps())
        expect(screen).toMatchObject({ kind: "paused", animals: ["boar"] })
        screen = update(screen, tickInput(["pause"]), deps())
        screen = update(screen, tickInput(), deps({ step: stepper }))
        expect(screen).toMatchObject({ kind: "ending", animals: ["boar"] })
        screen = update(screen, tickInput(), deps())
        expect(screen).toMatchObject({ kind, animals: ["boar"] })
    })

    it("retries with the score reset and full health", () => {
        const screen = end(kind, "retry")
        const finished = gameOf(screen)!
        finished.players[0].score = 5 * DOT_POINTS
        finished.players[0].health = kind === "gameOver" ? 0 : 1
        const next = update(screen, tickInput(["confirm"]), deps())
        expect(gameOf(next)?.players[0].score).toBe(0)
        expect(gameOf(next)?.players[0].health).toBe(MAX_HEALTH)
    })

    it("goes to stage select on confirm with stage select selected", () => {
        const screen = end(kind, "stageSelect", 1)
        expect(update(screen, tickInput(["confirm"]), deps())).toEqual({
            kind: "stageSelect",
            mode: "solo",
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

    // Regression: breath and confirm share the pad's A button, so mashing
    // breath while dying or clearing picked Retry the moment the end screen
    // appeared.
    describe("just after it appears", () => {
        const d = deps({ dt: 1 / TICK_RATE })
        const delayTicks = Math.round(END_CONFIRM_DELAY * TICK_RATE)
        // The end screen as the outro leaves it.
        const entered = () => {
            const screen = update(
                ending(kind === "stageClear" ? "won" : "dead", 1),
                tickInput(),
                d
            )
            expect(screen.kind).toBe(kind)
            return screen
        }

        it("ignores confirm for END_CONFIRM_DELAY, then takes it", () => {
            expect(END_CONFIRM_DELAY).toBe(0.5)
            const screen = entered()
            for (let i = 1; i < delayTicks; i++) {
                // The same screen: no new object every tick.
                expect(update(screen, tickInput(["confirm"]), d)).toBe(screen)
            }
            expect(update(screen, tickInput(["confirm"]), d).kind).toBe(
                "playing"
            )
        })

        it("moves the cursor meanwhile, keeping the delay's count", () => {
            let screen = entered()
            screen = update(screen, tickInput(["down"]), d)
            expect(screen).toMatchObject({ kind, choice: "stageSelect" })
            for (let i = 2; i < delayTicks; i++) {
                expect(update(screen, tickInput(["confirm"]), d)).toBe(screen)
            }
            expect(update(screen, tickInput(["confirm"]), d)).toEqual({
                kind: "stageSelect",
                mode: "solo",
                selected: 0,
            })
        })
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
        // In the trap level the first tick hurts, and with the last
        // health the game ends there, with dots left and the enemy free to
        // wander off.
        const d = deps({ levels: [sameAtEvery(trap)], dt: 1 / 60 })
        let screen: Screen = startLevel([sameAtEvery(trap)], 0)
        gameOf(screen)!.players[0].health = 1
        screen = update(screen, tickInput([], east), deps({ ...d, dt: 1 }))
        expect(screen.kind).toBe("ending")
        const game = gameOf(screen)!
        const before = cloneState(game)
        // Mid-glide, so the outro has something to settle.
        game.players[0].character.moveProgress =
            before.players[0].character.moveProgress = 0
        for (let i = 0; i < 20; i++) {
            screen = update(screen, tickInput(["down"], east), d)
            screen = update(screen, tickInput(["up"], east), d)
        }
        expect(screen.kind).toBe("gameOver")
        // Only moveProgress may change during the outro: up to 1 (40 ticks
        // is plenty for every glide here), and never down.
        const characters = (g: typeof game) => [
            g.players[0].character,
            ...g.enemies,
        ]
        characters(game).forEach((c, i) => {
            const was = characters(before)[i].moveProgress
            expect(c.moveProgress).toBe(Math.max(was, 1))
        })
        const withoutProgress = (g: typeof game) => ({
            ...g,
            players: g.players.map((p) => ({
                ...p,
                character: { ...p.character, moveProgress: 0 },
            })),
            enemies: g.enemies.map((e) => ({ ...e, moveProgress: 0 })),
        })
        expect(withoutProgress(game)).toEqual(withoutProgress(before))
        expect(game.cells[1][3]).toBe(Cell.dot)

        // On the end screen, nothing changes at all.
        const ended = cloneState(game)
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
        const fromStages = update(
            { kind: "stageSelect", mode: "solo", selected: 0 },
            everything,
            d
        )
        expect(fromStages.kind).toBe("difficultySelect")
        const fromDifficulties = update(fromStages, everything, d)
        expect(fromDifficulties.kind).toBe("characterSelect")
        const fromCharacters = update(fromDifficulties, everything, d)
        expect(fromCharacters.kind).toBe("playing")
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
            { kind: "stageSelect", mode: "solo", selected: 0 },
            characterSelect(),
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
        expect(next.kind).toBe("playSelect")
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
        expect(
            gameOf({ kind: "stageSelect", mode: "solo", selected: 0 })
        ).toBeUndefined()
        expect(gameOf(characterSelect())).toBeUndefined()
    })
})

describe("selectItem", () => {
    it("moves the title's cursor to a mode, then confirm picks it", () => {
        const coop = selectItem(initialScreen(), 1)
        expect(coop).toEqual({ kind: "title", mode: "coop" })
        expect(update(coop, tickInput(["confirm"]), deps())).toEqual({
            kind: "playSelect",
            mode: "coop",
            choice: "story",
        })
    })

    it("moves stage select's cursor, locked slots included", () => {
        const stages: Screen = {
            kind: "stageSelect",
            mode: "solo",
            selected: 0,
        }
        expect(selectItem(stages, 1)).toEqual({ ...stages, selected: 1 })
        // Confirm on a slot with no level stays put, as with the keys.
        const empty = selectItem(stages, STAGE_COUNT - 1)
        expect(empty).toEqual({ ...stages, selected: STAGE_COUNT - 1 })
        expect(update(empty, tickInput(["confirm"]), deps())).toBe(empty)
    })

    it("moves player 1's character, then confirm plays it", () => {
        const screen = selectItem(characterSelect(), 2)
        expect(screen).toMatchObject({ picks: [ANIMAL_IDS[2]] })
        expect(update(screen, tickInput(["confirm"]), deps())).toMatchObject({
            kind: "playing",
            animals: [ANIMAL_IDS[2]],
        })
    })

    it("leaves player 2's cursor, and a confirmed player 1's pick", () => {
        const two: Screen = {
            kind: "characterSelect",
            mode: "coop",
            level: 0,
            difficulty: DEFAULT_DIFFICULTY,
            picks: [ANIMAL_IDS[0], ANIMAL_IDS[3]],
            ready: [false, false],
        }
        expect(selectItem(two, 1)).toMatchObject({
            picks: [ANIMAL_IDS[1], ANIMAL_IDS[3]],
        })
        const ready: Screen = { ...two, ready: [true, false] }
        expect(selectItem(ready, 1)).toBe(ready)
    })

    it("moves an end screen's choice, keeping its confirm delay", () => {
        const shown = { seconds: 0 }
        const over = end("gameOver")
        if (over.kind !== "gameOver") throw new Error(over.kind)
        const screen: Screen = { ...over, shown }
        const next = selectItem(screen, 1)
        expect(next).toMatchObject({ choice: "stageSelect" })
        expect("shown" in next && next.shown).toBe(shown)
        expect(selectItem(end("stageClear"), 1)).toMatchObject({
            choice: "stageSelect",
        })
    })

    it("comes back unchanged off the menu, on the current item, or without a menu", () => {
        const title = initialScreen()
        for (const index of [0, -1, 4, 0.5]) {
            expect(selectItem(title, index)).toBe(title)
        }
        const stages: Screen = {
            kind: "stageSelect",
            mode: "solo",
            selected: 0,
        }
        expect(selectItem(stages, STAGE_COUNT)).toBe(stages)
        const game = playing()
        expect(selectItem(game, 0)).toBe(game)
        const paused = pauseIfPlaying(playing())
        expect(selectItem(paused, 0)).toBe(paused)
    })
})

describe("difficulty", () => {
    // Stage 1 at Hard is a level of its own, with an enemy and its own par
    // time, so a game shows which difficulty it was started at.
    const hard = parseFlat({
        name: "corridor",
        parTime: 45,
        map: ["#####", "#P.E#", "#####"],
        enemies: [{ ai: "random" }],
    })
    const tiers: Stage = { ...sameAtEvery(corridor), hard }
    const d = (overrides: Partial<FlowDeps> = {}) =>
        deps({ levels: [tiers], ...overrides })
    const startHard = () =>
        startLevel([tiers], 0, DEFAULT_ANIMAL, "solo", [], "hard")

    it("starts from character select at the default difficulty", () => {
        const next = update(characterSelect(0), tickInput(["confirm"]), d())
        expect(next).toMatchObject({ kind: "playing", difficulty: "medium" })
        expect(gameOf(next)?.enemies).toEqual([])
    })

    it("plays the stage's level for the difficulty, medium by default", () => {
        expect(startHard()).toMatchObject({ difficulty: "hard" })
        expect(gameOf(startHard())?.enemies).toHaveLength(1)
        expect(startLevel([tiers], 0)).toMatchObject({ difficulty: "medium" })
    })

    it.each([
        ["dead", "gameOver"],
        ["won", "stageClear"],
    ] as const)(
        "carries it through pause and the outro (%s) to %s, and Retry keeps it",
        (outcome, kind) => {
            let screen = update(startHard(), tickInput(["pause"]), d())
            expect(screen).toMatchObject({ kind: "paused", difficulty: "hard" })
            screen = update(screen, tickInput(["pause"]), d())
            screen = update(
                screen,
                tickInput(),
                d({ step: endingStep(outcome) })
            )
            expect(screen).toMatchObject({ kind: "ending", difficulty: "hard" })
            screen = update(screen, tickInput(), d())
            expect(screen).toMatchObject({ kind, difficulty: "hard" })
            if (kind === "stageClear") {
                // Rated against Hard's par time.
                expect(screen).toMatchObject({ rating: { parTime: 45 } })
            }
            const finished = gameOf(screen)
            for (let i = 0; i < END_CONFIRM_DELAY * TICK_RATE; i++) {
                screen = update(screen, tickInput(), d())
            }
            const retried = update(screen, tickInput(["confirm"]), d())
            expect(retried).toMatchObject({
                kind: "playing",
                difficulty: "hard",
            })
            expect(gameOf(retried)).not.toBe(finished)
            expect(gameOf(retried)?.enemies).toHaveLength(1)
        }
    )
})
