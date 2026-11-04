import { describe, expect, it } from "vite-plus/test"
import {
    initialScreen,
    PAGE_CHOICES,
    pageScreen,
    selectItem,
    TITLE_CHOICES,
    titleChoice,
    update,
    type FlowDeps,
    type Screen,
    type TickInput,
} from "./flow"
import type { MoveInput } from "./game"
import type { Action } from "./input"
import { emptyProgress } from "./progress"
import { fixedRandom, parseFlat, sameAtEvery } from "./test/helpers"
import { vec2 } from "./vec2"

// The title's main menu (KDA-318): the modes, the pages (Tutorial, Cards,
// Soundtrack) and Settings, each page a screen of its own that Back leaves
// for the title, on that page.

const levels = [
    parseFlat({
        name: "corridor",
        parTime: 60,
        map: ["######", "#PQ..#", "######"],
        enemies: [],
    }),
].map(sameAtEvery)

// Player 1 pressing `pressed`; player 2 pressing `second`.
function input(
    pressed: readonly Action[] = [],
    second: readonly Action[] = []
): TickInput {
    return {
        wasPressed: (action, player = 0) =>
            (player === 0 ? pressed : second).includes(action),
        move: (): MoveInput => ({ held: [], pressed: vec2(0, 0) }),
    }
}

function deps(): FlowDeps {
    return {
        levels,
        progress: emptyProgress(),
        dt: 1 / 60,
        random: fixedRandom(0),
    }
}

// One tick per action, in order.
function press(screen: Screen, actions: readonly Action[]): Screen {
    return actions.reduce((s, a) => update(s, input([a]), deps()), screen)
}

// The title with the cursor `count` entries down from 1 player.
function down(count: number): Screen {
    return press(initialScreen(), Array<Action>(count).fill("down"))
}

function asTitle(screen: Screen) {
    if (screen.kind !== "title") throw new Error(`On ${screen.kind}`)
    return screen
}

describe("the main menu", () => {
    it("offers 1 player, 2 players, Tutorial, Cards, Soundtrack, Settings", () => {
        expect(TITLE_CHOICES).toEqual([
            "solo",
            "coop",
            "tutorial",
            "cards",
            "soundtrack",
            "settings",
        ])
        expect(PAGE_CHOICES).toEqual(["tutorial", "cards", "soundtrack"])
    })

    it("moves down over every entry in order, stopping at the end", () => {
        TITLE_CHOICES.forEach((choice, i) => {
            expect(titleChoice(asTitle(down(i)))).toBe(choice)
        })
        const last = down(TITLE_CHOICES.length - 1)
        expect(press(last, ["down"])).toBe(last)
    })

    it.each(["solo", "coop"] as const)(
        "goes on to the choice of story or stage mode on %s",
        (mode) => {
            const title = down(TITLE_CHOICES.indexOf(mode))
            expect(press(title, ["confirm"])).toEqual({
                kind: "playSelect",
                mode,
                choice: "story",
            })
        }
    )

    it("opens the settings on Settings", () => {
        const title = down(TITLE_CHOICES.indexOf("settings"))
        expect(press(title, ["confirm"])).toMatchObject({
            kind: "settings",
            back: title,
        })
    })
})

describe.each(PAGE_CHOICES)("the %s page", (page) => {
    const index = TITLE_CHOICES.indexOf(page)
    const title = () => down(index)

    it("opens from its entry, with the title's mode kept", () => {
        expect(press(title(), ["confirm"])).toEqual(pageScreen(page, "coop"))
        expect(press(title(), ["confirm"])).toMatchObject({
            kind: page,
            mode: "coop",
        })
    })

    it("goes back to the title on its entry with the pause action", () => {
        const back = press(title(), ["confirm", "pause"])
        expect(back).toEqual(title())
        expect(titleChoice(asTitle(back))).toBe(page)
    })

    it("ignores player 2's Back", () => {
        const screen = press(title(), ["confirm"])
        expect(update(screen, input([], ["pause"]), deps())).toBe(screen)
    })

    it("opens from a tap on its entry, then confirm", () => {
        const tapped = selectItem(initialScreen(), index)
        expect(tapped).toEqual({ kind: "title", mode: "solo", on: page })
        expect(selectItem(tapped, index)).toBe(tapped)
        expect(press(tapped, ["confirm"])).toEqual(pageScreen(page, "solo"))
    })
})

// The pages still to be built: Back is all they do.
describe.each(["cards"] as const)("the %s placeholder", (page) => {
    const title = () => down(TITLE_CHOICES.indexOf(page))

    it("stays put on any other input, player 2's Back included", () => {
        const screen = press(title(), ["confirm"])
        for (const action of ["up", "down", "left", "right", "confirm"]) {
            expect(update(screen, input([action as Action]), deps())).toBe(
                screen
            )
        }
        expect(update(screen, input([], ["pause"]), deps())).toBe(screen)
    })

    it("has no menu to tap", () => {
        const screen = press(title(), ["confirm"])
        expect(selectItem(screen, 0)).toBe(screen)
    })
})

describe("selectItem on the main menu", () => {
    it("puts the cursor back on a mode from a page's entry", () => {
        const onCards = selectItem(
            initialScreen(),
            TITLE_CHOICES.indexOf("cards")
        )
        expect(selectItem(onCards, 1)).toEqual({ kind: "title", mode: "coop" })
        expect(selectItem(onCards, 0)).toEqual(initialScreen())
    })
})
