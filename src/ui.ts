import confetti from "canvas-confetti"
import type { StageSlot } from "./progress"
import type { AnimalId, AnimalInfo } from "./roster"
import { formatTicks, starList, starText, type ClearRating } from "./stars"

function genConfetti(interval: number = 20) {
    return (count: number = 10) => {
        // Per celebration, so every win sweeps across the screen from x = 0.
        let counter = 0
        const intId = setInterval(() => {
            void confetti({ origin: { x: 0.1 * counter, y: 0.65 } })
            counter++

            if (counter > count) {
                clearInterval(intId)
            }
        }, interval)
    }
}

export const celebrate = genConfetti()

// Screen overlays. Every screen other than plain play is one overlay: a
// backdrop plus a panel with a title, optional detail lines and an optional
// menu (on character select, a row of cards instead). At most one overlay
// exists at a time; each show* replaces whatever is showing, and hideOverlay
// removes it. Input is handled by the state machine (flow.ts), not here.

// A locked item is shown greyed out and marked aria-disabled.
export type MenuItem = { label: string; selected: boolean; locked?: boolean }

// What the end screens show.
export type EndScreenView = {
    // The final score.
    score: number
    // The menu, in order; exactly one item is selected.
    items: readonly MenuItem[]
}

// Stage clear also shows the clear's stars and time.
export type StageClearView = EndScreenView & { rating: ClearRating }

type Overlay = {
    id: string
    title: string
    // Short lines under the title (hints, the final score).
    lines?: readonly string[]
    items?: readonly MenuItem[]
    cards?: readonly Card[]
}

// A character select card: emoji and name, the breath, the stat.
type Card = { animal: AnimalInfo; selected: boolean }

export function showTitle() {
    show({
        id: "title",
        title: "Dot Eater",
        lines: ["Press Space to start"],
    })
}

// Stage select: one item per slot. Locked stages keep their name behind a
// lock; slots with no level yet read "Coming soon". Both are greyed out. A
// cleared stage shows its best stars and best time after its name.
export function showStageSelect(slots: readonly StageSlot[], selected: number) {
    show({
        id: "stage-select",
        title: "Select a stage",
        lines: ["↑ ↓ to choose, Space to pick a character, Esc to go back"],
        items: slots.map((slot, i) => ({
            label: slotLabel(slot),
            selected: i === selected,
            locked: slot.kind !== "open",
        })),
    })
}

function slotLabel(slot: StageSlot): string {
    switch (slot.kind) {
        case "open": {
            const bests = [
                slot.stars === undefined ? "" : starText(slot.stars),
                slot.bestTime === undefined ? "" : formatTicks(slot.bestTime),
            ].filter(Boolean)
            return [slot.name, ...bests].join(" · ")
        }
        case "locked":
            return `🔒 ${slot.name}`
        case "comingSoon":
            return "Coming soon"
    }
}

// Character select: one card per character, in the order given, with the
// cursor's card marked.
export function showCharacterSelect(
    animals: readonly AnimalInfo[],
    selected: AnimalId
) {
    show({
        id: "character-select",
        title: "Pick a character",
        lines: ["← → to choose, Space to play, Esc to go back"],
        cards: animals.map((animal) => ({
            animal,
            selected: animal.id === selected,
        })),
    })
}

export function showPause() {
    show({
        id: "pause",
        title: "Paused",
        lines: ["Press P, Esc or Space to resume"],
    })
}

// The score, then the clear time and the three stars, each marked earned
// (★) or not (☆), e.g. "☆ Under par (1:00)".
export function showStageClear(view: StageClearView) {
    const { lines, items } = endScreen(view)
    const { rating } = view
    show({
        id: "stage-clear",
        title: "Stage clear!",
        lines: [
            ...lines,
            `Time ${formatTicks(rating.ticks)}`,
            ...starList(rating).map(
                (star) => `${star.earned ? "★" : "☆"} ${star.label}`
            ),
        ],
        items,
    })
}

export function showGameOver(view: EndScreenView) {
    show({ id: "game-over", title: "💀 Game over", ...endScreen(view) })
}

function endScreen({ score, items }: EndScreenView) {
    return { lines: [`Score ${score}`], items }
}

export function hideOverlay() {
    document.getElementById("backdrop")?.remove()
    document.getElementById("overlay")?.remove()
}

function show({ id, title, lines = [], items = [], cards = [] }: Overlay) {
    hideOverlay()

    const backdrop = document.createElement("div")
    backdrop.id = "backdrop"
    backdrop.className = "backdrop"
    document.body.appendChild(backdrop)

    const panel = document.createElement("div")
    panel.id = "overlay"
    panel.className = "overlay"
    panel.dataset.screen = id

    const heading = document.createElement("h1")
    heading.className = "overlay-title"
    heading.textContent = title
    panel.appendChild(heading)

    for (const line of lines) {
        const p = document.createElement("p")
        p.className = "overlay-line"
        p.textContent = line
        panel.appendChild(p)
    }

    if (items.length > 0) {
        const menu = document.createElement("ul")
        menu.className = "overlay-menu"
        for (const item of items) {
            const li = document.createElement("li")
            li.textContent = item.label
            if (item.selected) {
                li.classList.add("selected")
                li.setAttribute("aria-current", "true")
            }
            if (item.locked) {
                li.classList.add("locked")
                li.setAttribute("aria-disabled", "true")
            }
            menu.appendChild(li)
        }
        panel.appendChild(menu)
    }

    if (cards.length > 0) panel.appendChild(cardRow(cards))

    document.body.appendChild(panel)
    // The panel scrolls when it's taller than the window, and is rebuilt on
    // every cursor move, so bring the selection back into view each time.
    panel.querySelector(".selected")?.scrollIntoView({ block: "nearest" })
}

function cardRow(cards: readonly Card[]): HTMLElement {
    const row = document.createElement("ul")
    row.className = "overlay-cards"
    for (const { animal, selected } of cards) {
        const li = document.createElement("li")
        li.className = "card"
        li.dataset.animal = animal.id
        if (selected) {
            li.classList.add("selected")
            li.setAttribute("aria-current", "true")
        }
        const parts = [
            ["card-emoji", animal.emoji],
            ["card-name", animal.name],
            ["card-breath", animal.breathName],
            ["card-text", animal.breathText],
            ["card-stat", animal.statText],
        ] as const
        for (const [className, text] of parts) {
            const div = document.createElement("div")
            div.className = className
            div.textContent = text
            li.appendChild(div)
        }
        row.appendChild(li)
    }
    return row
}
