// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { DEFAULT_BINDINGS, rebind } from "./bindings"
import { ANIMAL_IDS, ANIMALS, AnimalId } from "./roster"
import {
    setHintBindings,
    showCharacterSelect,
    showControls,
    showDifficultySelect,
    showPause,
    showSettings,
    showStageSelect,
    showTitle,
} from "./ui"

// The hints name the keys as bound (KDA-215), and the controls screen.

// canvas-confetti touches a 2D canvas context on import, which happy-dom
// doesn't provide.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

afterEach(() => {
    document.body.innerHTML = ""
    setHintBindings(DEFAULT_BINDINGS)
})

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const title = () => overlay()?.querySelector("h1")?.textContent
const lines = () =>
    [...(overlay()?.querySelectorAll("p") ?? [])].map((p) => p.textContent)
const items = () =>
    [...(overlay()?.querySelectorAll("li") ?? [])].map((li) => li.textContent)

// P1: I K J L to move, Enter to confirm, O to pause. P2: confirm on F,
// left/right on Z X, pause on R.
function remapped() {
    let b = DEFAULT_BINDINGS
    const p1 = [
        ["up", "KeyI"],
        ["down", "KeyK"],
        ["left", "KeyJ"],
        ["right", "KeyL"],
        ["confirm", "Enter"],
        ["pause", "KeyO"],
    ] as const
    for (const [action, code] of p1) b = rebind(b, 0, action, code)
    const p2 = [
        ["confirm", "KeyF"],
        ["left", "KeyZ"],
        ["right", "KeyX"],
        ["pause", "KeyR"],
    ] as const
    for (const [action, code] of p2) b = rebind(b, 1, action, code)
    return b
}

describe("hints follow the bindings", () => {
    it("names the bound keys on every menu", () => {
        setHintBindings(remapped())
        showTitle([{ label: "1 player", selected: true }])
        expect(lines()).toEqual(["I K to choose, Enter to start"])
        showTitle()
        expect(lines()).toEqual(["Press Enter to start"])
        showStageSelect([], 0)
        expect(lines()).toEqual([
            "I K to choose, Enter to pick a difficulty, Esc or B to go back",
        ])
        showDifficultySelect([])
        expect(lines()).toEqual([
            "I K to choose, Enter to pick a character, Esc or B to go back",
        ])
        const animals = ANIMAL_IDS.map((id) => ANIMALS[id])
        showCharacterSelect(animals, AnimalId.dragon)
        expect(lines()).toEqual([
            "J L to choose, Enter to play, Esc or B to go back",
        ])
        showCharacterSelect(animals, [AnimalId.dragon, AnimalId.owl])
        expect(lines()).toEqual([
            "1P: J L to choose, Enter to confirm",
            "2P: Z X to choose, F to confirm",
            "Esc, B or R to go back",
        ])
        showPause()
        expect(lines()).toEqual(["I K to choose, Enter to pick, Esc to resume"])
        showPause(2)
        expect(lines()).toEqual([
            "I K to choose, Enter or F to pick",
            "Esc or R to resume",
        ])
        showSettings([])
        expect(lines()).toEqual([
            "I K to choose, J L to change, Esc or B to go back",
        ])
    })

    it("goes back to today's hints with the defaults", () => {
        setHintBindings(remapped())
        setHintBindings(DEFAULT_BINDINGS)
        showTitle()
        expect(lines()).toEqual(["Press Space to start"])
    })
})

describe("showControls", () => {
    it("shows a player's rows and how to move", () => {
        showControls({
            player: 0,
            items: [
                { label: "Up", value: "↑", selected: true },
                { label: "Back", selected: false },
            ],
        })
        expect(overlay()?.dataset.screen).toBe("controls")
        expect(title()).toBe("Controls · 1P")
        expect(items()).toEqual(["Up ↑", "Back"])
        expect(lines()).toEqual([
            "↑ ↓ to choose, Space to change",
            "← → for 2P's controls, Esc or B to go back",
        ])
        // Key hints, hidden on phones.
        expect(overlay()?.querySelectorAll("p.overlay-hint")).toHaveLength(2)
    })

    it("prompts for a key or a button while capturing", () => {
        showControls({
            player: 1,
            items: [],
            capturing: { label: "Breath", pad: false },
        })
        expect(title()).toBe("Controls · 2P")
        // A pad-only player can cancel a key prompt too.
        expect(lines()).toEqual([
            "Press a key for Breath",
            "Esc or a pad button to cancel",
        ])
        showControls({
            player: 1,
            items: [],
            capturing: { label: "Pad pause", pad: true },
        })
        expect(lines()).toEqual([
            "Press a button for Pad pause",
            "Esc to cancel",
        ])
    })

    // Phones hide .overlay-hint lines: the prompt must stay, and only the
    // key-only cancel line goes.
    it("keeps the prompt visible on phones, hiding only the key cancel", () => {
        const hints = () =>
            [...(overlay()?.querySelectorAll("p.overlay-hint") ?? [])].map(
                (p) => p.textContent
            )
        showControls({
            player: 0,
            items: [],
            capturing: { label: "Breath", pad: false },
        })
        expect(hints()).toEqual(["Esc or a pad button to cancel"])
        showControls({
            player: 0,
            items: [],
            capturing: { label: "Breath", pad: false, touch: true },
        })
        expect(lines()).toEqual(["Press a key for Breath", "Tap to cancel"])
        expect(hints()).toEqual([])
    })
})
