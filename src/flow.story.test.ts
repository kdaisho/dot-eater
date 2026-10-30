import { describe, expect, it } from "vite-plus/test"
import { MAX_HEALTH } from "./constants"
import {
    END_CONFIRM_DELAY,
    initialScreen,
    pauseChoices,
    selectItem,
    startLevel,
    STORY_CARD_SECONDS,
    STORY_END_CHOICES,
    update,
    type FlowDeps,
    type Mode,
    type Run,
    type Screen,
    type TickInput,
} from "./flow"
import type { GameState, Outcome } from "./game"
import type { Action } from "./input"
import type { Stage } from "./level"
import {
    emptyProgress,
    markCleared,
    STAGE_COUNT,
    type Progress,
} from "./progress"
import { fixedRandom, parseFlat, sameAtEvery } from "./test/helpers"
import { vec2 } from "./vec2"

// Story mode (KDA-271): the title's choice of story or stage mode, the
// story menu, a run's stages one after another with the run total carried
// on, retry and quit, "To be continued" and the ending.

// `count` one-row stages, "Stage 1" first.
function stageList(count: number): Stage[] {
    return Array.from({ length: count }, (_, i) =>
        sameAtEvery(
            parseFlat({
                name: `Stage ${i + 1}`,
                parTime: 60,
                map: ["######", "#PQ..#", "######"],
                enemies: [],
            })
        )
    )
}

// One tick's presses, by player (player 1 first).
function input(pressed: readonly (readonly Action[])[] = []): TickInput {
    return {
        wasPressed: (action, player = 0) =>
            pressed[player]?.includes(action) ?? false,
        move: () => ({ held: [], pressed: vec2(0, 0) }),
    }
}
const p1 = (...actions: Action[]) => input([actions])
const none = input()

// Every game step scores `points` for player 1, then ends the game with
// the outcome given, if any.
function stepping(outcome: Outcome | null = null, points = 0) {
    return (game: GameState) => {
        game.players[0].score += points
        return outcome
    }
}

function deps(overrides: Partial<FlowDeps> = {}): FlowDeps {
    return {
        levels: stageList(STAGE_COUNT),
        progress: emptyProgress(),
        dt: 1 / 60,
        random: fixedRandom(0),
        step: stepping(),
        ...overrides,
    }
}

// Progress with stages 1 to `count` cleared.
function clearedTo(count: number): Progress {
    let progress = emptyProgress()
    for (let i = 0; i < count; i++) progress = markCleared(progress, i)
    return progress
}

const TICKS_TO_CONFIRM = Math.ceil(END_CONFIRM_DELAY * 60)

// Tick with no input until the screen changes kind, at most `limit` ticks.
function runUntilChange(screen: Screen, d: FlowDeps, limit = 600): Screen {
    let current = screen
    for (let i = 0; i < limit; i++) {
        const next = update(current, none, d)
        if (next.kind !== current.kind) return next
        current = next
    }
    return current
}

// Wait out an end screen's confirm delay, then press `actions`.
function afterDelay(screen: Screen, d: FlowDeps, ...actions: Action[]) {
    let current = screen
    for (let i = 0; i < TICKS_TO_CONFIRM; i++) {
        current = update(current, none, d)
    }
    return update(current, p1(...actions), d)
}

// A story run's game on stage `level`, started with `total`.
function storyGame(
    level: number,
    total = 0,
    mode: Mode = "solo",
    levels = deps().levels
): Screen {
    const run: Run = { total, from: "continue" }
    const animals = mode === "solo" ? "dragon" : (["dragon", "owl"] as const)
    return startLevel(levels, level, animals, mode, [], "hard", run)
}

// Play `screen` until the game ends with `outcome`, scoring `points`, and
// the outro finishes.
function finish(
    screen: Screen,
    outcome: Outcome,
    points: number,
    overrides: Partial<FlowDeps> = {}
): Screen {
    const ending = update(
        screen,
        none,
        deps({ step: stepping(outcome, points), ...overrides })
    )
    expect(ending.kind).toBe("ending")
    return runUntilChange(ending, deps(overrides))
}

describe("the title", () => {
    it.each(["solo", "coop"] as const)(
        "offers story or stage mode in %s, on Story",
        (mode) => {
            const title: Screen = { kind: "title", mode }
            expect(update(title, p1("confirm"), deps())).toEqual({
                kind: "playSelect",
                mode,
                choice: "story",
            })
        }
    )

    it("doesn't offer story mode in versus: it goes to stage select", () => {
        const title: Screen = { kind: "title", mode: "versus" }
        expect(update(title, p1("confirm"), deps())).toEqual({
            kind: "stageSelect",
            mode: "versus",
            selected: 0,
        })
        const select = update(title, p1("confirm"), deps())
        expect(update(select, p1("pause"), deps())).toEqual(title)
    })
})

describe("the choice of story or stage mode", () => {
    const at = (choice: "story" | "stage", mode: Mode = "solo"): Screen => ({
        kind: "playSelect",
        mode,
        choice,
    })

    it("moves between Story and Stage select, stopping at either end", () => {
        expect(update(at("story"), p1("down"), deps())).toEqual(at("stage"))
        expect(update(at("stage"), p1("down"), deps())).toEqual(at("stage"))
        expect(update(at("stage"), p1("up"), deps())).toEqual(at("story"))
        const story = at("story")
        expect(update(story, p1("up"), deps())).toBe(story)
        expect(update(story, none, deps())).toBe(story)
    })

    it("goes on to the story menu, on Continue", () => {
        expect(update(at("story", "coop"), p1("confirm"), deps())).toEqual({
            kind: "storyMenu",
            mode: "coop",
            choice: "continue",
        })
    })

    it("goes on to stage select, which goes back to it on Stage select", () => {
        const select = update(at("stage"), p1("confirm"), deps())
        expect(select).toEqual({
            kind: "stageSelect",
            mode: "solo",
            selected: 0,
        })
        expect(update(select, p1("pause"), deps())).toEqual(at("stage"))
    })

    it("goes back to the title on the mode", () => {
        expect(update(at("stage", "coop"), p1("pause"), deps())).toEqual({
            kind: "title",
            mode: "coop",
        })
    })

    it("follows player 1 only", () => {
        const screen = at("story", "coop")
        expect(update(screen, input([[], ["down", "confirm"]]), deps())).toBe(
            screen
        )
    })
})

describe("the story menu", () => {
    const menu = (
        choice: "continue" | "newStory",
        mode: Mode = "solo"
    ): Screen => ({ kind: "storyMenu", mode, choice })

    it("moves between Continue and New story", () => {
        expect(update(menu("continue"), p1("down"), deps())).toEqual(
            menu("newStory")
        )
        expect(update(menu("newStory"), p1("up"), deps())).toEqual(
            menu("continue")
        )
    })

    it("goes back to the choice of story or stage mode, on Story", () => {
        expect(update(menu("newStory"), p1("pause"), deps())).toEqual({
            kind: "playSelect",
            mode: "solo",
            choice: "story",
        })
    })

    it("continues from the furthest stage reached", () => {
        const d = deps({ progress: clearedTo(2), lastDifficulty: "easy" })
        expect(update(menu("continue"), p1("confirm"), d)).toEqual({
            kind: "difficultySelect",
            mode: "solo",
            difficulty: "easy",
            next: {
                kind: "characterSelect",
                level: 2,
                run: { total: 0, from: "continue" },
            },
            back: menu("continue"),
        })
    })

    it("starts a new story from stage 1", () => {
        const d = deps({ progress: clearedTo(2) })
        expect(update(menu("newStory"), p1("confirm"), d)).toEqual({
            kind: "difficultySelect",
            mode: "solo",
            difficulty: "medium",
            next: {
                kind: "characterSelect",
                level: 0,
                run: { total: 0, from: "newStory" },
            },
            back: menu("newStory"),
        })
    })

    it("continues from stage 1 with nothing cleared", () => {
        const next = update(menu("continue"), p1("confirm"), deps())
        expect(next).toMatchObject({ next: { level: 0 } })
    })

    it("can't continue while the furthest stage isn't built yet", () => {
        // Stages 1 and 2 built and cleared: stage 3 is reached but has no
        // level.
        const d = deps({ levels: stageList(2), progress: clearedTo(2) })
        const screen = menu("continue")
        expect(update(screen, p1("confirm"), d)).toBe(screen)
        // A new story still starts.
        expect(update(menu("newStory"), p1("confirm"), d).kind).toBe(
            "difficultySelect"
        )
    })

    it("follows the 1-player unlocks in co-op", () => {
        const d = deps({ progress: clearedTo(1) })
        const next = update(menu("continue", "coop"), p1("confirm"), d)
        expect(next).toMatchObject({ mode: "coop", next: { level: 1 } })
    })
})

describe("into a story run", () => {
    const d = deps({ progress: clearedTo(1) })
    const select = update(
        { kind: "storyMenu", mode: "solo", choice: "continue" },
        p1("confirm"),
        d
    )

    it("goes from difficulty select to character select for the run", () => {
        expect(update(select, p1("confirm"), d)).toEqual({
            kind: "characterSelect",
            mode: "solo",
            level: 1,
            difficulty: "medium",
            picks: ["dragon"],
            ready: [false],
            run: { total: 0, from: "continue" },
        })
    })

    it("goes back from difficulty select to the story menu", () => {
        expect(update(select, p1("pause"), d)).toEqual({
            kind: "storyMenu",
            mode: "solo",
            choice: "continue",
        })
    })

    it("goes back from character select to the run's difficulty select", () => {
        const hard = update(select, p1("down"), d)
        const characters = update(hard, p1("confirm"), d)
        expect(update(characters, p1("pause"), d)).toEqual(hard)
    })

    it("starts the run on the stage, with a run total of 0", () => {
        const characters = update(select, p1("confirm"), d)
        const playing = update(characters, p1("confirm"), d)
        expect(playing).toMatchObject({
            kind: "playing",
            level: 1,
            run: { total: 0, from: "continue" },
        })
    })
})

describe("a story run's stages", () => {
    it("shows the clear card, with the stage's rating and what's next", () => {
        const card = finish(storyGame(1, 100), "won", 50)
        expect(card).toMatchObject({
            kind: "storyClear",
            level: 1,
            difficulty: "hard",
            run: { total: 100 },
            next: 2,
        })
        if (card.kind !== "storyClear") throw new Error(card.kind)
        expect(card.rating.stars).toBeGreaterThan(0)
    })

    it("starts the next stage on confirm, carrying the run total on", () => {
        const card = finish(storyGame(1, 100), "won", 50)
        const next = afterDelay(card, deps(), "confirm")
        expect(next).toMatchObject({
            kind: "playing",
            level: 2,
            difficulty: "hard",
            animals: ["dragon"],
            run: { total: 150, from: "continue" },
        })
        // A fresh game: full health and no score yet.
        if (next.kind !== "playing") throw new Error(next.kind)
        expect(next.game.players[0].health).toBe(MAX_HEALTH)
        expect(next.game.players[0].score).toBe(0)
    })

    it("ignores confirm until the end screen delay is over", () => {
        const card = finish(storyGame(0), "won", 10)
        expect(update(card, p1("confirm"), deps()).kind).toBe("storyClear")
    })

    it("starts the next stage by itself after STORY_CARD_SECONDS", () => {
        const card = finish(storyGame(0, 0), "won", 10)
        const ticks = Math.round(STORY_CARD_SECONDS * 60)
        let screen = card
        for (let i = 0; i < ticks - 1; i++)
            screen = update(screen, none, deps())
        expect(screen.kind).toBe("storyClear")
        screen = update(screen, none, deps())
        expect(screen).toMatchObject({
            kind: "playing",
            level: 1,
            run: { total: 10 },
        })
    })

    it("plays co-op runs on, adding both players' scores", () => {
        const playing = storyGame(0, 30, "coop")
        if (playing.kind !== "playing") throw new Error(playing.kind)
        playing.game.players[1].score = 20
        const card = finish(playing, "won", 5)
        const next = afterDelay(card, deps(), "confirm")
        expect(next).toMatchObject({
            kind: "playing",
            mode: "coop",
            level: 1,
            animals: ["dragon", "owl"],
            run: { total: 55 },
        })
    })
})

describe("a failed story stage", () => {
    const failed = () => finish(storyGame(2, 120), "dead", 40)

    it("offers Retry, then Quit", () => {
        expect(failed()).toMatchObject({
            kind: "gameOver",
            level: 2,
            choice: "retry",
            run: { total: 120 },
        })
        expect(STORY_END_CHOICES).toEqual(["retry", "quit"])
    })

    it("retries the stage from the run total it started with", () => {
        const retry = afterDelay(failed(), deps(), "confirm")
        expect(retry).toMatchObject({
            kind: "playing",
            level: 2,
            difficulty: "hard",
            run: { total: 120, from: "continue" },
        })
        if (retry.kind !== "playing") throw new Error(retry.kind)
        expect(retry.game.players[0].score).toBe(0)
        expect(retry.game.players[0].health).toBe(MAX_HEALTH)
    })

    it("quits to the title", () => {
        const quit = update(failed(), p1("down"), deps())
        expect(quit).toMatchObject({ choice: "quit" })
        expect(afterDelay(quit, deps(), "confirm")).toEqual({
            kind: "title",
            mode: "solo",
        })
    })

    it("goes on to Quit by a tap, not Stage select", () => {
        const screen = failed()
        expect(selectItem(screen, 1)).toMatchObject({ choice: "quit" })
        expect(selectItem(screen, 2)).toBe(screen)
    })

    it("fails in co-op once both players are out", () => {
        const over = finish(storyGame(0, 0, "coop"), "dead", 0)
        expect(over).toMatchObject({ kind: "gameOver", mode: "coop" })
        expect(update(over, p1("down"), deps())).toMatchObject({
            choice: "quit",
        })
    })
})

describe("the end of the built stages", () => {
    // Two stages built out of STAGE_COUNT.
    const built = { levels: stageList(2) }

    it("says To be continued after the last built stage", () => {
        const card = finish(
            storyGame(1, 0, "solo", built.levels),
            "won",
            10,
            built
        )
        expect(card).toMatchObject({ kind: "storyClear", level: 1 })
        expect(card).not.toHaveProperty("next")
    })

    it("waits for confirm, which goes to the title", () => {
        const d = deps(built)
        const card = finish(
            storyGame(1, 0, "coop", built.levels),
            "won",
            10,
            built
        )
        let screen = card
        for (let i = 0; i < STORY_CARD_SECONDS * 60 * 2; i++) {
            screen = update(screen, none, d)
        }
        expect(screen.kind).toBe("storyClear")
        expect(update(screen, p1("confirm"), d)).toEqual({
            kind: "title",
            mode: "coop",
        })
    })
})

describe("the ending", () => {
    const last = STAGE_COUNT - 1

    it("follows the last stage slot, with the run total", () => {
        const end = finish(storyGame(last, 900), "won", 100)
        expect(end).toMatchObject({
            kind: "storyEnd",
            level: last,
            difficulty: "hard",
            run: { total: 900 },
        })
    })

    it("goes to the title on confirm, once the delay is over", () => {
        const end = finish(storyGame(last, 900), "won", 100)
        expect(update(end, p1("confirm"), deps())).toBe(end)
        expect(afterDelay(end, deps(), "confirm")).toEqual({
            kind: "title",
            mode: "solo",
        })
    })

    it("is reached by playing every stage through", () => {
        let screen: Screen = storyGame(0)
        let cleared = 0
        while (screen.kind === "playing") {
            screen = finish(screen, "won", 10)
            cleared++
            if (screen.kind === "storyClear") {
                screen = afterDelay(screen, deps(), "confirm")
            }
        }
        expect(cleared).toBe(STAGE_COUNT)
        expect(screen).toMatchObject({
            kind: "storyEnd",
            run: { total: (STAGE_COUNT - 1) * 10 },
        })
    })
})

describe("pausing a story run", () => {
    const paused = (): Screen => {
        const playing = storyGame(1, 50)
        return update(playing, p1("pause"), deps())
    }

    it("offers Quit after Resume and Settings", () => {
        const screen = paused()
        expect(pauseChoices(screen)).toEqual(["resume", "settings", "quit"])
        const onSettings = update(screen, p1("down"), deps())
        expect(onSettings).toMatchObject({ choice: "settings" })
        expect(update(onSettings, p1("down"), deps())).toMatchObject({
            choice: "quit",
        })
    })

    it("quits to the title on Quit", () => {
        const onQuit = selectItem(paused(), 2)
        expect(onQuit).toMatchObject({ kind: "paused", choice: "quit" })
        expect(update(onQuit, p1("confirm"), deps())).toEqual({
            kind: "title",
            mode: "solo",
        })
    })

    it("still opens the settings, and resumes the run", () => {
        const onSettings = selectItem(paused(), 1)
        const settings = update(onSettings, p1("confirm"), deps())
        expect(settings.kind).toBe("settings")
        const back = update(settings, p1("pause"), deps())
        const resumed = update(back, p1("pause"), deps())
        expect(resumed).toMatchObject({ kind: "playing", run: { total: 50 } })
    })

    it("has no Quit in stage mode", () => {
        const screen = update(startLevel(deps().levels, 0), p1("pause"), deps())
        expect(pauseChoices(screen)).toEqual(["resume", "settings"])
        expect(selectItem(screen, 2)).toBe(screen)
    })
})

describe("taps", () => {
    it("pick story or stage mode and the story menu's items", () => {
        const title = selectItem(initialScreen(), 0)
        const choice = update(title, p1("confirm"), deps())
        expect(selectItem(choice, 1)).toMatchObject({ choice: "stage" })
        expect(selectItem(choice, 2)).toBe(choice)
        const story = update(choice, p1("confirm"), deps())
        expect(selectItem(story, 1)).toMatchObject({ choice: "newStory" })
        expect(selectItem(story, 0)).toBe(story)
    })

    it("on a story card only confirm", () => {
        const card = finish(storyGame(0), "won", 10)
        expect(selectItem(card, 0)).toBe(card)
        expect(selectItem(card, 1)).toBe(card)
    })
})
