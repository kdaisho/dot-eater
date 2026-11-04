import { describe, expect, it } from "vite-plus/test"
import { CARDS } from "./cards"
import {
    initialScreen,
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

// The Cards page (KDA-320): it opens on No.01, browses with left/right and
// up/down, wrapping round, goes to a tapped card, and Back returns to the
// title on Cards.

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

const CARDS_AT = TITLE_CHOICES.indexOf("cards")
const onCards: Screen = { kind: "title", mode: "solo", on: "cards" }
const page = (index = 0): Screen => ({ kind: "cards", mode: "solo", index })

describe("the Cards page", () => {
    it("opens on the first card from the title's Cards, with its mode kept", () => {
        // Down from 1 Player passes 2 Players, so the mode is co-op's.
        const walked = press(
            initialScreen(),
            Array<Action>(CARDS_AT).fill("down")
        )
        expect(walked).toEqual({ ...onCards, mode: "coop" })
        expect(press(onCards, ["confirm"])).toEqual(page(0))
        const coop: Screen = { kind: "title", mode: "coop", on: "cards" }
        expect(press(coop, ["confirm"])).toEqual({
            kind: "cards",
            mode: "coop",
            index: 0,
        })
    })

    it("browses with right and down, and back with left and up", () => {
        expect(press(page(0), ["right"])).toEqual(page(1))
        expect(press(page(0), ["down"])).toEqual(page(1))
        expect(press(page(5), ["left"])).toEqual(page(4))
        expect(press(page(5), ["up"])).toEqual(page(4))
        expect(press(page(0), ["right", "right", "left"])).toEqual(page(1))
    })

    it("wraps round at either end", () => {
        const last = CARDS.length - 1
        expect(press(page(last), ["right"])).toEqual(page(0))
        expect(press(page(0), ["left"])).toEqual(page(last))
        expect(
            press(page(0), Array<Action>(CARDS.length).fill("down"))
        ).toEqual(page(0))
    })

    it("stays put on confirm, on left and right together, and on player 2", () => {
        const screen = page(3)
        expect(update(screen, input(["confirm"]), deps())).toBe(screen)
        expect(update(screen, input(["left", "right"]), deps())).toBe(screen)
        for (const action of ["left", "right", "pause"] as const) {
            expect(update(screen, input([], [action]), deps())).toBe(screen)
        }
    })

    it("goes back to the title on Cards with the pause action, from any card", () => {
        expect(press(page(7), ["pause"])).toEqual(onCards)
        expect(press(onCards, ["confirm", "right", "pause"])).toEqual(onCards)
    })

    it("goes to a tapped card (an arrow, a side card or a dot)", () => {
        expect(selectItem(page(0), 14)).toEqual(page(14))
        expect(selectItem(page(4), 5)).toEqual(page(5))
        const screen = page(2)
        expect(selectItem(screen, 2)).toBe(screen)
        expect(selectItem(screen, CARDS.length)).toBe(screen)
        expect(selectItem(screen, -1)).toBe(screen)
        expect(selectItem(screen, 1.5)).toBe(screen)
    })
})
