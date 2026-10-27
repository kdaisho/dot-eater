// @vitest-environment happy-dom
import confetti from "canvas-confetti"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import {
    celebrate,
    hideOverlay,
    hideToast,
    showCharacterSelect,
    showGameOver,
    showPause,
    showStageClear,
    showStageSelect,
    showTitle,
    showToast,
} from "./ui"
import type { StageSlot } from "./progress"
import { ANIMAL_IDS, AnimalId, ANIMALS } from "./roster"
import { rateClear } from "./stars"
import { START_LIVES, TICK_RATE } from "./constants"

// canvas-confetti touches a 2D canvas context on import, which happy-dom
// doesn't provide.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

afterEach(() => {
    document.body.innerHTML = ""
})

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const title = () => overlay()?.querySelector("h1")?.textContent
const lines = () =>
    [...(overlay()?.querySelectorAll("p") ?? [])].map((p) => p.textContent)
const items = () =>
    [...(overlay()?.querySelectorAll("li") ?? [])].map((li) => li.textContent)
const selected = () =>
    [...(overlay()?.querySelectorAll("li.selected") ?? [])].map(
        (li) => li.textContent
    )
// Exactly one overlay and one backdrop are on screen.
const expectSingle = () => {
    expect(document.querySelectorAll("#overlay")).toHaveLength(1)
    expect(document.querySelectorAll("#backdrop")).toHaveLength(1)
}

const endView = (choice: 0 | 1, score = 0) => ({
    score,
    items: ["Retry", "Stage select"].map((label, i) => ({
        label,
        selected: i === choice,
    })),
})

// A stage clear view: 2 stars (no lives lost, over a 60 s par) in 1:02.5.
const clearView = (choice: 0 | 1, score = 0) => ({
    ...endView(choice, score),
    rating: rateClear({ ticks: 62.5 * TICK_RATE, lives: START_LIVES }, 60),
})

describe("showTitle", () => {
    it("shows the title with a backdrop and how to start", () => {
        showTitle()
        expectSingle()
        expect(overlay()?.dataset.screen).toBe("title")
        expect(title()).toBe("Dot Eater")
        expect(lines()).toEqual(["Press Space to start"])
        expect(items()).toEqual([])
    })
})

describe("showStageSelect", () => {
    const open = (name: string): StageSlot => ({ kind: "open", name })
    const slots: StageSlot[] = [
        open("Level 1"),
        open("Level 2"),
        { kind: "locked", name: "Level 3" },
        { kind: "comingSoon" },
        { kind: "comingSoon" },
    ]
    const locked = () =>
        [...(overlay()?.querySelectorAll("li.locked") ?? [])].map(
            (li) => li.textContent
        )

    it("lists the stages with the selected one marked", () => {
        showStageSelect(slots, 1)
        expectSingle()
        expect(overlay()?.dataset.screen).toBe("stage-select")
        expect(lines()).toEqual([
            "↑ ↓ to choose, Space to pick a character, Esc to go back",
        ])
        expect(items()).toEqual([
            "Level 1",
            "Level 2",
            "🔒 Level 3",
            "Coming soon",
            "Coming soon",
        ])
        expect(selected()).toEqual(["Level 2"])
        expect(
            overlay()
                ?.querySelector("li.selected")
                ?.getAttribute("aria-current")
        ).toBe("true")
    })

    it("greys out locked stages and placeholders, and only those", () => {
        showStageSelect(slots, 0)
        expect(locked()).toEqual(["🔒 Level 3", "Coming soon", "Coming soon"])
        const disabled = [
            ...(overlay()?.querySelectorAll("li[aria-disabled=true]") ?? []),
        ]
        expect(disabled).toHaveLength(3)
    })

    it("marks a locked slot as selected when the cursor is on it", () => {
        showStageSelect(slots, 3)
        const li = overlay()?.querySelector("li.selected")
        expect(li?.textContent).toBe("Coming soon")
        expect(li?.classList.contains("locked")).toBe(true)
        expect(selected()).toEqual(["Coming soon"])
    })

    it("shows the best stars and best time of cleared stages", () => {
        showStageSelect(
            [
                {
                    kind: "open",
                    name: "Classic",
                    stars: 2,
                    bestTime: 42 * 60 + 18,
                },
                { kind: "open", name: "Wrap", stars: 3 },
                { kind: "open", name: "Ice" },
                { kind: "locked", name: "Fog" },
                { kind: "comingSoon" },
            ],
            0
        )
        expect(items()).toEqual([
            "Classic · ★★☆ · 0:42.3",
            "Wrap · ★★★",
            "Ice",
            "🔒 Fog",
            "Coming soon",
        ])
        expect(selected()).toEqual(["Classic · ★★☆ · 0:42.3"])
    })

    it("moves the mark when shown again", () => {
        showStageSelect(slots, 0)
        showStageSelect(slots, 1)
        expectSingle()
        expect(selected()).toEqual(["Level 2"])
    })
})

describe("showCharacterSelect", () => {
    const animals = ANIMAL_IDS.map((id) => ANIMALS[id])
    const cards = () => [
        ...(overlay()?.querySelectorAll<HTMLElement>(".overlay-cards li") ??
            []),
    ]
    const part = (card: HTMLElement, name: string) =>
        card.querySelector(`.card-${name}`)?.textContent

    it("shows one card per character in roster order", () => {
        showCharacterSelect(animals, AnimalId.dragon)
        expectSingle()
        expect(overlay()?.dataset.screen).toBe("character-select")
        expect(title()).toBe("Pick a character")
        expect(lines()).toEqual([
            "← → to choose, Space to play, Esc to go back",
        ])
        expect(cards().map((card) => card.dataset.animal)).toEqual(ANIMAL_IDS)
    })

    it("shows each character's emoji, name, breath and stat", () => {
        showCharacterSelect(animals, AnimalId.dragon)
        cards().forEach((card, i) => {
            const animal = animals[i]
            expect(part(card, "emoji")).toBe(animal.emoji)
            expect(part(card, "name")).toBe(animal.name)
            expect(part(card, "breath")).toBe(animal.breathName)
            expect(part(card, "text")).toBe(animal.breathText)
            expect(part(card, "stat")).toBe(animal.statText)
        })
        const owl = cards()[ANIMAL_IDS.indexOf(AnimalId.owl)]
        expect(part(owl, "emoji")).toBe("🦉")
        expect(part(owl, "name")).toBe("Owl")
        expect(part(owl, "breath")).toBe("Wind breath")
    })

    it("marks only the selected card", () => {
        showCharacterSelect(animals, AnimalId.skunk)
        const marked = cards().filter((card) =>
            card.classList.contains("selected")
        )
        expect(marked.map((card) => card.dataset.animal)).toEqual(["skunk"])
        expect(marked[0].getAttribute("aria-current")).toBe("true")
        expect(overlay()?.querySelectorAll("[aria-current=true]")).toHaveLength(
            1
        )
    })

    it("moves the mark when shown again", () => {
        showCharacterSelect(animals, AnimalId.skunk)
        showCharacterSelect(animals, AnimalId.boar)
        expectSingle()
        const marked = overlay()?.querySelector<HTMLElement>("li.selected")
        expect(marked?.dataset.animal).toBe("boar")
    })

    it("scrolls the selected card into view", () => {
        const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView")
        try {
            showCharacterSelect(animals, AnimalId.boar)
            expect(scroll).toHaveBeenCalledOnce()
            expect(scroll.mock.contexts[0]).toBe(
                overlay()?.querySelector("li.selected")
            )
        } finally {
            scroll.mockRestore()
        }
    })

    it("adds no menu or text lines inside the cards", () => {
        showCharacterSelect(animals, AnimalId.dragon)
        expect(overlay()?.querySelector(".overlay-menu")).toBeNull()
        expect(lines()).toHaveLength(1)
    })
})

describe("showPause", () => {
    it("shows the pause screen", () => {
        showPause()
        expectSingle()
        expect(overlay()?.dataset.screen).toBe("pause")
        expect(title()).toBe("Paused")
    })
})

describe("showStageClear", () => {
    it("shows the clear screen with the score, time, stars and menu", () => {
        showStageClear(clearView(0, 340))
        expectSingle()
        expect(overlay()?.dataset.screen).toBe("stage-clear")
        expect(title()).toBe("Stage clear!")
        expect(lines()).toEqual([
            "Score 340",
            "Time 1:02.5",
            "★ Cleared",
            "★ No lives lost",
            "☆ Under par (1:00)",
        ])
        expect(items()).toEqual(["Retry", "Stage select"])
        expect(selected()).toEqual(["Retry"])
    })

    it("marks every star earned on a perfect clear", () => {
        showStageClear({
            ...endView(0),
            rating: rateClear({ ticks: 600, lives: START_LIVES }, 45),
        })
        expect(lines()).toEqual([
            "Score 0",
            "Time 0:10.0",
            "★ Cleared",
            "★ No lives lost",
            "★ Under par (0:45)",
        ])
    })

    it("marks only the clear star on a slow clear with lives lost", () => {
        showStageClear({
            ...endView(0),
            rating: rateClear({ ticks: 3601, lives: 1 }, 60),
        })
        expect(lines().slice(1)).toEqual([
            "Time 1:00.1",
            "★ Cleared",
            "☆ No lives lost",
            "☆ Under par (1:00)",
        ])
    })
})

describe("showGameOver", () => {
    it("shows the game-over screen with the final score and its menu", () => {
        showGameOver(endView(1, 0))
        expectSingle()
        expect(overlay()?.dataset.screen).toBe("game-over")
        expect(title()).toBe("💀 Game over")
        expect(lines()).toEqual(["Score 0"])
        expect(selected()).toEqual(["Stage select"])
    })
})

describe("overlays", () => {
    it("replace whatever overlay is showing", () => {
        showTitle()
        showStageSelect([{ kind: "open", name: "Level 1" }], 0)
        showCharacterSelect([ANIMALS.dragon], AnimalId.dragon)
        showPause()
        showGameOver(endView(0))
        showStageClear(clearView(0))
        expectSingle()
        expect(overlay()?.dataset.screen).toBe("stage-clear")
    })
})

describe("hideOverlay", () => {
    it("removes the overlay and backdrop", () => {
        showGameOver(endView(0))
        hideOverlay()
        expect(overlay()).toBeNull()
        expect(document.querySelector("#backdrop")).toBeNull()
    })

    it("does nothing when no overlay is showing", () => {
        expect(() => hideOverlay()).not.toThrow()
    })
})

describe("celebrate", () => {
    afterEach(() => {
        vi.useRealTimers()
        vi.mocked(confetti).mockClear()
    })

    // Burst origins, left to right, of the confetti fired so far.
    const origins = () =>
        vi.mocked(confetti).mock.calls.map(([options]) => options?.origin?.x)

    // celebrate(10) fires 11 bursts, at x = 0, 0.1, ..., 1.0.
    const sweep = Array.from({ length: 11 }, (_, i) => 0.1 * i)

    it("fires the full sweep on every win, not just the first", () => {
        vi.useFakeTimers()
        for (let win = 0; win < 2; win++) {
            vi.mocked(confetti).mockClear()
            celebrate(10)
            vi.runAllTimers()
            expect(origins()).toEqual(sweep)
        }
    })
})

describe("two players", () => {
    it("shows the title's mode select", () => {
        showTitle([
            { label: "1 player", selected: false },
            { label: "2 players", selected: true },
        ])
        expect(title()).toBe("Dot Eater")
        expect(lines()).toEqual(["↑ ↓ to choose, Space to start"])
        expect(items()).toEqual(["1 player", "2 players"])
        expect(selected()).toEqual(["2 players"])
    })

    describe("character select", () => {
        const animals = ANIMAL_IDS.map((id) => ANIMALS[id])
        const card = (id: AnimalId) =>
            overlay()?.querySelector<HTMLElement>(`li[data-animal="${id}"]`)
        const tags = (id: AnimalId) =>
            [...(card(id)?.querySelectorAll(".card-player") ?? [])].map(
                (tag) => tag.textContent
            )

        it("marks each player's card, and who has confirmed", () => {
            showCharacterSelect(
                animals,
                [AnimalId.owl, AnimalId.boar],
                [true, false]
            )
            expect(title()).toBe("Pick your characters")
            expect(lines()).toEqual([
                "1P: ← → to choose, Space to confirm",
                "2P: A D to choose, E to confirm",
                "Esc or Q to go back",
            ])
            expect(tags(AnimalId.owl)).toEqual(["1P ✓"])
            expect(tags(AnimalId.boar)).toEqual(["2P"])
            expect(tags(AnimalId.dragon)).toEqual([])
            expect(card(AnimalId.owl)?.classList.contains("p1")).toBe(true)
            expect(card(AnimalId.boar)?.classList.contains("p2")).toBe(true)
            // Player 1's card is the selected one.
            expect(card(AnimalId.owl)?.classList.contains("selected")).toBe(
                true
            )
        })

        it("shows both players on one card when they pick the same", () => {
            showCharacterSelect(animals, [AnimalId.skunk, AnimalId.skunk])
            expect(tags(AnimalId.skunk)).toEqual(["1P", "2P"])
            const skunk = card(AnimalId.skunk)
            expect(skunk?.classList.contains("p1")).toBe(true)
            expect(skunk?.classList.contains("p2")).toBe(true)
        })

        it("marks no players with one", () => {
            showCharacterSelect(animals, [AnimalId.skunk])
            expect(overlay()?.querySelector(".card-players")).toBeNull()
            expect(title()).toBe("Pick a character")
        })
    })

    it("shows each player's score on the end screens", () => {
        showGameOver({ ...endView(0, 50), playerScores: [30, 20] })
        expect(lines()).toEqual(["Score 50", "1P 30 · 2P 20"])
        showStageClear({ ...clearView(0, 50), playerScores: [30, 20] })
        expect(lines().slice(0, 2)).toEqual(["Score 50", "1P 30 · 2P 20"])
    })
})

describe("toast", () => {
    const toasts = () => [...document.querySelectorAll("#toast")]

    it("shows a status note without touching the overlay", () => {
        showPause()
        showToast("Controller connected")
        expect(toasts().map((t) => t.textContent)).toEqual([
            "Controller connected",
        ])
        expect(toasts()[0]?.getAttribute("role")).toBe("status")
        expect(title()).toBe("Paused")
    })

    it("replaces the previous toast", () => {
        showToast("Controller connected")
        showToast("Controller disconnected")
        expect(toasts().map((t) => t.textContent)).toEqual([
            "Controller disconnected",
        ])
    })

    it("hides, and survives overlays coming and going", () => {
        showToast("Controller connected")
        showTitle()
        hideOverlay()
        expect(toasts().map((t) => t.textContent)).toEqual([
            "Controller connected",
        ])
        hideToast()
        expect(toasts().map((t) => t.textContent)).toEqual([""])
        hideToast()
        expect(toasts()).toHaveLength(1)
    })

    // Regression: each toast was a new role="status" element added with its
    // text already in it, which screen readers don't announce.
    it("keeps one live region in the page and changes its text", () => {
        hideToast()
        const region = toasts()[0]
        expect(region?.getAttribute("role")).toBe("status")
        expect(region?.textContent).toBe("")
        showToast("Controller connected")
        hideToast()
        showToast("Controller disconnected")
        expect(toasts()).toEqual([region])
        expect(region?.isConnected).toBe(true)
        expect(region?.textContent).toBe("Controller disconnected")
    })
})
