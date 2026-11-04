// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { DEFAULT_BINDINGS, rebind, type Bindings } from "./bindings"
import { tutorialPages, type TutorialPage } from "./tutorial"
import { drawTutorialFrame } from "./tutorialView"
import { hideOverlay, overlayTap, showTutorial } from "./ui"

// The tutorial's pages as shown (KDA-319): each page's title and keys, the
// nav on a keyboard and on touch, and the still frame with reduced motion.

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

function show(
    page: TutorialPage,
    { touch = false, bindings = DEFAULT_BINDINGS as Bindings } = {}
) {
    const pages = tutorialPages(touch)
    showTutorial({
        page,
        index: pages.indexOf(page),
        count: pages.length,
        bindings,
        touch,
    })
}

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const title = () => overlay()?.querySelector("h1")?.textContent
const text = () => overlay()?.textContent ?? ""
const chips = () =>
    [...(overlay()?.querySelectorAll(".tut-chip") ?? [])].map(
        (c) => c.textContent
    )
const cap = (code: string) =>
    overlay()?.querySelector<HTMLElement>(`.tut-cap[data-code='${code}']`)
const caption = () => overlay()?.querySelector(".tut-caption")?.textContent

beforeEach(() => hideOverlay())

describe("the tutorial's pages", () => {
    it.each([
        ["goal", "How to play", "Eat every dot in the maze"],
        ["keyboard", "Keyboard", "always pauses and goes back"],
        ["controller", "Controller", "Pad 1 plays 1P, pad 2 plays 2P."],
        ["breath", "Breath", "Every animal has its own breath."],
        ["health", "Health", "panic for 1.5 s"],
        ["touch", "Touch", "Or use the Breath button."],
    ] as const)("shows %s with its title", (page, heading, line) => {
        show(page, { touch: true })
        expect(overlay()?.dataset.screen).toBe("tutorial")
        expect(title()).toBe(heading)
        expect(text()).toContain(line)
        expect(overlay()?.querySelector("[data-back]")).not.toBeNull()
    })

    it("draws both players' keys on the keyboard, and names them", () => {
        show("keyboard")
        expect(cap("ArrowRight")?.classList).toContain("p1")
        expect(cap("ShiftRight")?.classList).toContain("p1")
        expect(cap("KeyW")?.classList).toContain("p2")
        expect(cap("ShiftLeft")?.classList).toContain("p2")
        expect(cap("Escape")?.classList).toContain("esc")
        expect(cap("KeyZ")?.classList).not.toContain("p1")
        expect(chips()).toEqual(
            expect.arrayContaining(["Right Shift", "P", "Space", "W", "Q", "E"])
        )
        expect(text()).toContain("1P")
        expect(text()).toContain("2P")
        expect(text()).toContain("1 Player: breathe with Left Shift")
    })

    it("follows a rebound key, and lists one off the drawing", () => {
        const bindings = rebind(
            rebind(DEFAULT_BINDINGS, 0, "breath", "KeyX"),
            0,
            "pause",
            "Home"
        )
        show("keyboard", { bindings })
        expect(cap("KeyX")?.classList).toContain("p1")
        expect(cap("ShiftRight")?.classList).not.toContain("p1")
        expect(text()).toContain("Not on the drawing: Home")
        expect(text()).not.toContain("1 Player: breathe with")
    })

    it("names the pad buttons as bound", () => {
        show("controller", {
            bindings: rebind(DEFAULT_BINDINGS, 0, "breath", 3),
        })
        expect(text()).toContain("PAD 1 = 1P")
        expect(text()).toContain("PAD 2 = 2P")
        expect(chips()).toEqual(expect.arrayContaining(["Y", "A", "Start"]))
        expect(text()).toContain("Confirm in menus")
    })

    it("shows the 1-player breath key on the Breath page", () => {
        show("breath")
        expect(chips()).toEqual(["→", "Left Shift"])
    })

    it("draws the game's Breath button on the Touch page", () => {
        show("touch", { touch: true })
        expect(
            overlay()?.querySelector(".tut-breath-button")?.textContent
        ).toBe("💨")
    })
})

describe("the tutorial's nav", () => {
    it("shows the page dots, n/N and the bound keys on a keyboard", () => {
        show("controller")
        expect(overlay()?.querySelectorAll(".tut-dots i")).toHaveLength(5)
        expect(overlay()?.querySelector(".tut-dots i.on")).toBe(
            overlay()?.querySelectorAll(".tut-dots i")[2]
        )
        expect(overlay()?.querySelector(".tut-count")?.textContent).toBe("3/5")
        expect(overlay()?.querySelector(".tut-hint")?.textContent).toBe(
            "← → to turn pages, Space or A for next, Esc or B to go back"
        )
        expect(overlay()?.querySelector(".tut-button")).toBeNull()
    })

    it("says done on the last page", () => {
        show("health")
        expect(overlay()?.querySelector(".tut-hint")?.textContent).toContain(
            "for done"
        )
    })

    it("has Prev and Next to tap on touch, Done on the last page", () => {
        show("breath", { touch: true })
        const [prev, next] = overlay()?.querySelectorAll(".tut-button") ?? []
        expect(prev?.textContent).toBe("‹ Prev")
        expect(next?.textContent).toBe("Next ›")
        expect(overlayTap(prev ?? null)).toEqual({
            kind: "step",
            index: 3,
            delta: -1,
        })
        expect(overlayTap(next ?? null)).toEqual({ kind: "item", index: 3 })
        expect(text()).toContain("Swipe or tap Next")
        expect(overlay()?.querySelector(".tut-count")?.textContent).toBe("4/6")

        show("touch", { touch: true })
        const done = overlay()?.querySelectorAll(".tut-button")[1]
        expect(done?.textContent).toBe("Done")
    })

    it("has no Prev to tap on the first page", () => {
        show("goal", { touch: true })
        const prev = overlay()?.querySelector(".tut-button")
        expect(overlayTap(prev ?? null)).toEqual({ kind: "panel" })
    })
})

describe("the scenes", () => {
    it("move with the time", () => {
        show("breath")
        drawTutorialFrame(0.5, false)
        expect(caption()).toBe("Eat dots: each one adds 5 energy.")
        drawTutorialFrame(3.5, false)
        expect(caption()).toBe("Let go: a bigger breath. Then a 1 s cooldown.")
    })

    it("light the keys in step: the right key walking, breath breathing", () => {
        show("keyboard")
        drawTutorialFrame(0.3, false)
        expect(cap("ArrowRight")?.classList).toContain("lit")
        expect(cap("ShiftRight")?.classList).not.toContain("lit")
        drawTutorialFrame(1.3, false)
        expect(cap("ArrowRight")?.classList).not.toContain("lit")
        expect(cap("ShiftRight")?.classList).toContain("lit")
    })

    it("stand on a still frame with reduced motion", () => {
        show("breath")
        const still = caption()
        expect(still).toBe("Hold to charge: one level every 0.25 s, up to 5.")
        for (const t of [0.5, 3.5, 5.5]) {
            drawTutorialFrame(t, true)
            expect(caption()).toBe(still)
        }
        const phases = () =>
            [...document.querySelectorAll<HTMLElement>(".tut-scene")].map(
                (c) => c.dataset.phase
            )
        show("keyboard")
        const before = phases()
        drawTutorialFrame(0.1, true)
        expect(phases()).toEqual(before)
        drawTutorialFrame(0.1, false)
        expect(phases()).not.toEqual(before)
    })
})
