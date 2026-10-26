import confetti from "canvas-confetti"

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

export type MenuItem = { label: string; selected: boolean }

// What the end screens show. KDA-198 adds the final score here.
export type EndScreenView = {
    // The menu, in order; exactly one item is selected.
    items: readonly MenuItem[]
}

type Overlay = {
    id: string
    title: string
    // Short lines under the title (hints, and later the final score).
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

export function showStageSelect(names: readonly string[], selected: number) {
    show({
        id: "stage-select",
        title: "Select a stage",
        lines: ["↑ ↓ to choose, Space to play"],
        items: names.map((label, i) => ({ label, selected: i === selected })),
    })
}

export function showPause() {
    show({
        id: "pause",
        title: "Paused",
        lines: ["Press P, Esc or Space to resume"],
    })
}

export function showStageClear(view: EndScreenView) {
    show({ id: "stage-clear", title: "Stage clear!", items: view.items })
}

export function showGameOver(view: EndScreenView) {
    show({ id: "game-over", title: "💀 Game over", items: view.items })
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
                li.className = "selected"
                li.setAttribute("aria-current", "true")
            }
            menu.appendChild(li)
        }
        panel.appendChild(menu)
    }

    document.body.appendChild(panel)
}
