import { describe, expect, it } from "vite-plus/test"
import {
    initialScreen,
    pageScreen,
    selectItem,
    TITLE_CHOICES,
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

// The tutorial's pages (KDA-319): left and right turn them, stopping at
// the ends, confirm goes on and from the last page back to the title, as
// Back does from any; the Touch page only on touch devices.

const levels = [
    parseFlat({
        name: "corridor",
        parTime: 60,
        map: ["######", "#PQ..#", "######"],
        enemies: [],
    }),
].map(sameAtEvery)

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

function deps(touch = false): FlowDeps {
    return {
        levels,
        progress: emptyProgress(),
        dt: 1 / 60,
        random: fixedRandom(0),
        touch,
    }
}

function press(screen: Screen, actions: readonly Action[], touch = false) {
    return actions.reduce((s, a) => update(s, input([a]), deps(touch)), screen)
}

const pageOf = (screen: Screen) =>
    screen.kind === "tutorial" ? screen.page : undefined

const tutorial = (page = 0): Screen => ({
    kind: "tutorial",
    mode: "solo",
    page,
})

describe("the tutorial's pages", () => {
    it("opens on its first page", () => {
        expect(pageScreen("tutorial", "coop")).toEqual({
            kind: "tutorial",
            mode: "coop",
            page: 0,
        })
        const title = press(
            initialScreen(),
            Array<Action>(TITLE_CHOICES.indexOf("tutorial")).fill("down")
        )
        // The cursor passed 2 Players on its way down.
        expect(press(title, ["confirm"])).toEqual({
            ...tutorial(0),
            mode: "coop",
        })
    })

    it("turns with right and left", () => {
        const second = press(tutorial(), ["right"])
        expect(pageOf(second)).toBe(1)
        expect(pageOf(press(second, ["right", "right"]))).toBe(3)
        expect(pageOf(press(second, ["left"]))).toBe(0)
    })

    it("stops at either end", () => {
        expect(update(tutorial(0), input(["left"]), deps())).toEqual(
            tutorial(0)
        )
        expect(pageOf(press(tutorial(), Array(9).fill("right")))).toBe(4)
        expect(pageOf(press(tutorial(), Array(9).fill("right"), true))).toBe(5)
    })

    it("goes to the next page on confirm, and to the title from the last", () => {
        expect(pageOf(press(tutorial(), ["confirm"]))).toBe(1)
        expect(press(tutorial(4), ["confirm"])).toEqual({
            kind: "title",
            mode: "solo",
            on: "tutorial",
        })
    })

    it("has the Touch page only on touch devices", () => {
        expect(pageOf(press(tutorial(4), ["confirm"], true))).toBe(5)
        expect(press(tutorial(5), ["confirm"], true)).toMatchObject({
            kind: "title",
            on: "tutorial",
        })
    })

    it("goes back to the title on Tutorial from any page", () => {
        for (const page of [0, 2, 4]) {
            expect(press(tutorial(page), ["pause"])).toEqual({
                kind: "title",
                mode: "solo",
                on: "tutorial",
            })
        }
    })

    it("stays put on up, down and player 2's presses", () => {
        const screen = tutorial(2)
        for (const action of ["up", "down"] as const) {
            expect(update(screen, input([action]), deps())).toBe(screen)
        }
        for (const action of ["left", "right", "confirm", "pause"] as const) {
            expect(update(screen, input([], [action]), deps())).toBe(screen)
        }
    })

    it("leaves a tap's page to its confirm or step", () => {
        const screen = tutorial(2)
        expect(selectItem(screen, 2)).toBe(screen)
    })
})
