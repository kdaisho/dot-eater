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
import { SOUNDTRACK } from "./soundtrack"
import { fixedRandom, parseFlat, sameAtEvery } from "./test/helpers"
import { vec2 } from "./vec2"

// The soundtrack page (KDA-321): the cursor over every track, confirm
// playing or stopping the one under it, Back to the title.

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

function deps(): FlowDeps {
    return {
        levels,
        progress: emptyProgress(),
        dt: 1 / 60,
        random: fixedRandom(0),
    }
}

function press(screen: Screen, actions: readonly Action[]): Screen {
    return actions.reduce((s, a) => update(s, input([a]), deps()), screen)
}

const page = (selected = 0, playing?: number): Screen => ({
    kind: "soundtrack",
    mode: "solo",
    selected,
    ...(playing === undefined ? {} : { playing }),
})

const last = SOUNDTRACK.length - 1

describe("the soundtrack page", () => {
    it("opens from the title on the first track, nothing playing", () => {
        const down = Array<Action>(TITLE_CHOICES.indexOf("soundtrack")).fill(
            "down"
        )
        const opened = press(initialScreen(), [...down, "confirm"])
        // The cursor passed 2 Players on the way, so the mode kept is co-op.
        expect(opened).toEqual({ ...page(), mode: "coop" })
        expect(pageScreen("soundtrack", "coop")).toEqual({
            kind: "soundtrack",
            mode: "coop",
            selected: 0,
        })
    })

    it("moves the cursor with up/down and left/right, stopping at the ends", () => {
        expect(press(page(), ["down"])).toEqual(page(1))
        expect(press(page(), ["right"])).toEqual(page(1))
        expect(press(page(3), ["up"])).toEqual(page(2))
        expect(press(page(3), ["left"])).toEqual(page(2))
        expect(press(page(), Array<Action>(20).fill("down"))).toEqual(
            page(last)
        )
        const top = page()
        expect(press(top, ["up"])).toBe(top)
        expect(press(top, ["left"])).toBe(top)
        const bottom = page(last)
        expect(press(bottom, ["down"])).toBe(bottom)
        expect(press(bottom, ["right"])).toBe(bottom)
    })

    it("plays the track under the cursor on confirm", () => {
        expect(press(page(4), ["confirm"])).toEqual(page(4, 4))
    })

    it("stops the track playing on confirm on it", () => {
        expect(press(page(4, 4), ["confirm"])).toEqual(page(4))
    })

    it("keeps a track playing while the cursor moves, and switches on confirm", () => {
        expect(press(page(4, 4), ["down", "down"])).toEqual(page(6, 4))
        expect(press(page(6, 4), ["confirm"])).toEqual(page(6, 6))
    })

    it("goes back to the title on its entry, whatever is playing", () => {
        const back = { kind: "title", mode: "solo", on: "soundtrack" }
        expect(press(page(3, 2), ["pause"])).toEqual(back)
        expect(press(page(), ["pause"])).toEqual(back)
        const coop: Screen = { kind: "soundtrack", mode: "coop", selected: 1 }
        expect(press(coop, ["pause"])).toEqual({ ...back, mode: "coop" })
    })

    it("follows player 1 only", () => {
        const screen = page(2)
        for (const action of ["down", "confirm", "pause"] as const) {
            expect(update(screen, input([], [action]), deps())).toBe(screen)
        }
    })

    it("puts the cursor on a tapped track, which confirm then plays", () => {
        const tapped = selectItem(page(), 5)
        expect(tapped).toEqual(page(5))
        expect(press(tapped, ["confirm"])).toEqual(page(5, 5))
        const playing = page(5, 5)
        expect(selectItem(playing, 5)).toBe(playing)
        expect(press(playing, ["confirm"])).toEqual(page(5))
        expect(selectItem(page(), SOUNDTRACK.length)).toEqual(page())
        expect(selectItem(page(), -1)).toEqual(page())
    })
})
