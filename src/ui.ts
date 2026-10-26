import confetti from "canvas-confetti"
import type { StageSlot } from "./progress"
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
// menu. At most one overlay exists at a time; each show* replaces whatever is
// showing, and hideOverlay removes it. Input is handled by the state machine
// (flow.ts), not here.

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
}

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
        lines: ["↑ ↓ to choose, Space to play"],
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
            return [slot.name, ...bests].join("  ")
        }
        case "locked":
            return `🔒 ${slot.name}`
        case "comingSoon":
            return "Coming soon"
    }
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

function show({ id, title, lines = [], items = [] }: Overlay) {
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

    document.body.appendChild(panel)
}
