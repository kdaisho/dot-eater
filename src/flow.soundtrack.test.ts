import { describe, expect, it } from "vite-plus/test"
import {
    initialScreen,
    pageScreen,
    selectItem,
    titleFrom,
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

// The soundtrack is the player page (KDA-333): the title's Soundtrack
// leaves for it, and its back link returns to the title on Soundtrack.

const levels = [
    parseFlat({
        name: "corridor",
        parTime: 60,
        map: ["######", "#PQ..#", "######"],
        enemies: [],
    }),
].map(sameAtEvery)

function input(pressed: readonly Action[] = []): TickInput {
    return {
        wasPressed: (action, player = 0) =>
            player === 0 && pressed.includes(action),
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

describe("the soundtrack", () => {
    it("is left for from the title's Soundtrack", () => {
        const down = Array<Action>(TITLE_CHOICES.indexOf("soundtrack")).fill(
            "down"
        )
        const left = press(initialScreen(), [...down, "confirm"])
        // The cursor passed 2 Players on the way, so the mode kept is co-op.
        expect(left).toEqual({ kind: "soundtrack", mode: "coop" })
        expect(pageScreen("soundtrack", "solo")).toEqual({
            kind: "soundtrack",
            mode: "solo",
        })
    })

    it("ignores input while the game leaves for the player page", () => {
        const leaving: Screen = { kind: "soundtrack", mode: "solo" }
        for (const action of ["down", "confirm", "pause"] as const) {
            expect(press(leaving, [action])).toBe(leaving)
        }
        expect(selectItem(leaving, 2)).toBe(leaving)
    })

    it("comes back to the title on Soundtrack", () => {
        expect(titleFrom("soundtrack")).toEqual({
            kind: "title",
            mode: "solo",
            on: "soundtrack",
        })
    })
})
