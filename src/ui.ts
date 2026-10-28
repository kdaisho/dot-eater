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

// One big burst from the middle of the screen, for the boss's defeat: far
// more confetti than a single shot of celebrate, all at once, mid-game.
export function burst() {
    void confetti({
        particleCount: 250,
        spread: 160,
        startVelocity: 45,
        origin: { x: 0.5, y: 0.5 },
    })
}

// Screen overlays. Every screen other than plain play is one overlay: a
// backdrop plus a panel with a title, optional detail lines and an optional
// menu (on character select, a row of cards instead). At most one overlay
// exists at a time; each show* replaces whatever is showing, and hideOverlay
// removes it. Input is handled by the state machine (flow.ts), not here.
//
// Overlays can be tapped or clicked, so a phone player needs no keyboard:
// each menu item and card carries its index (data-index), and menus that
// can go back have a Back button (data-back). main listens for clicks and
// reads them with overlayTap.

// A locked item is shown greyed out and marked aria-disabled.
export type MenuItem = { label: string; selected: boolean; locked?: boolean }

// What the end screens show.
export type EndScreenView = {
    // The final score.
    score: number
    // With two players, each one's share of it, player 1 first.
    playerScores?: readonly number[]
    // With two players, the dots each one ate, player 1 first. Given with
    // playerScores, each player gets a line of its own with both.
    playerDots?: readonly number[]
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
    // A Back button, for screens that go back (the pause action).
    back?: boolean
}

// A character select card: emoji and name, the breath, the stat. With two
// players, `players` are the ones whose cursor is on it.
type Card = {
    animal: AnimalInfo
    selected: boolean
    players?: readonly { index: number; ready: boolean }[]
}

// The title, with the mode select's menu when `modes` are given.
export function showTitle(modes: readonly MenuItem[] = []) {
    show({
        id: "title",
        title: "Dot Eater",
        lines: [
            modes.length > 0
                ? "↑ ↓ to choose, Space to start"
                : "Press Space to start",
        ],
        items: modes,
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
        back: true,
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
// cursor's card marked. `selected` is player 1's pick, or every player's
// (player 1 first). With two players each card also shows whose cursor is
// on it ("1P", "2P", with a ✓ once that player has confirmed; `ready`),
// and player 1's card is the selected one.
export function showCharacterSelect(
    animals: readonly AnimalInfo[],
    selected: AnimalId | readonly AnimalId[],
    ready: readonly boolean[] = []
) {
    const picks = typeof selected === "string" ? [selected] : selected
    const two = picks.length > 1
    show({
        id: "character-select",
        title: two ? "Pick your characters" : "Pick a character",
        lines: two
            ? [
                  "1P: ← → to choose, Space to confirm",
                  "2P: A D to choose, E to confirm",
                  "Esc or Q to go back",
              ]
            : ["← → to choose, Space to play, Esc to go back"],
        back: true,
        cards: animals.map((animal) => ({
            animal,
            selected: animal.id === picks[0],
            players: two
                ? picks.flatMap((pick, i) =>
                      pick === animal.id
                          ? [{ index: i, ready: !!ready[i] }]
                          : []
                  )
                : [],
        })),
    })
}

// The pause screen. With two players either one resumes, so the hint
// gives player 2's keys too.
export function showPause(players = 1) {
    show({
        id: "pause",
        title: "Paused",
        lines:
            players > 1
                ? ["1P: P, Esc or Space to resume", "2P: Q or E to resume"]
                : ["Press P, Esc or Space to resume"],
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

// The score, then with two players each one's share: on one line, or a
// line each with the dots it ate when playerDots are given.
function endScreen({
    score,
    playerScores = [],
    playerDots,
    items,
}: EndScreenView) {
    const shares =
        playerScores.length < 2
            ? []
            : playerDots
              ? playerScores.map(
                    (s, i) => `${i + 1}P ${s} · ${dotCount(playerDots[i] ?? 0)}`
                )
              : [playerScores.map((s, i) => `${i + 1}P ${s}`).join(" · ")]
    return { lines: [`Score ${score}`, ...shares], items }
}

// What a versus round's result shows (see roundResult in flow.ts).
export type RoundResultView = {
    // Which round it was, from 1 (replayed rounds count).
    round: number
    // The round's winner (player 1 is 0), or null for an exact tie.
    winner: number | null
    // Each player's dots and score, player 1 first.
    dots: readonly number[]
    scores: readonly number[]
    // Each player's round wins so far, this round included.
    wins: readonly number[]
    // The menu (Next round / Quit), in order; exactly one item is selected.
    items: readonly MenuItem[]
}

// A versus round is over: who won it (or that it is replayed), each
// player's dots and score, the tally, and the menu.
export function showRoundResult(view: RoundResultView) {
    const { round, winner } = view
    show({
        id: "round-result",
        title:
            winner === null
                ? `Round ${round}: a draw`
                : `Round ${round}: ${winner + 1}P wins!`,
        lines: [
            perPlayer("Dots", view.dots),
            perPlayer("Score", view.scores),
            ...(winner === null ? ["A draw doesn't count: play it again"] : []),
            `Rounds ${view.wins.join("–")}`,
        ],
        items: view.items,
    })
}

// What a versus match's result shows (see matchResult in flow.ts).
export type MatchResultView = {
    // The match winner (player 1 is 0).
    winner: number
    // Every round played, in order, replayed ones included.
    rounds: readonly { winner: number | null; dots: readonly number[] }[]
    // Each player's round wins.
    wins: readonly number[]
    // The menu, in order; exactly one item is selected.
    items: readonly MenuItem[]
}

// A versus match is over: the winner, the tally and a line per round.
export function showMatchResult(view: MatchResultView) {
    show({
        id: "match-result",
        title: `🏆 ${view.winner + 1}P wins the match!`,
        lines: [
            `Rounds ${view.wins.join("–")}`,
            ...view.rounds.map(
                ({ winner, dots }, i) =>
                    `Round ${i + 1}: ${
                        winner === null ? "draw, replayed" : `${winner + 1}P`
                    } · ${dots.join("–")} dots`
            ),
        ],
        items: view.items,
    })
}

// "Dots 1P 12 · 2P 9": one value per player, player 1 first.
function perPlayer(label: string, values: readonly number[]): string {
    return `${label} ${values.map((v, i) => `${i + 1}P ${v}`).join(" · ")}`
}

function dotCount(n: number): string {
    return n === 1 ? "1 dot" : `${n} dots`
}

export function hideOverlay() {
    document.getElementById("backdrop")?.remove()
    document.getElementById("overlay")?.remove()
}

function show({
    id,
    title,
    lines = [],
    items = [],
    cards = [],
    back = false,
}: Overlay) {
    hideOverlay()

    const backdrop = document.createElement("div")
    backdrop.id = "backdrop"
    backdrop.className = "backdrop"
    document.body.appendChild(backdrop)

    const panel = document.createElement("div")
    panel.id = "overlay"
    panel.className = "overlay"
    panel.dataset.screen = id

    if (back) {
        const button = document.createElement("button")
        button.type = "button"
        button.className = "overlay-back"
        button.dataset.back = ""
        button.textContent = "‹ Back"
        panel.appendChild(button)
    }

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
        items.forEach((item, i) => {
            const li = document.createElement("li")
            li.textContent = item.label
            li.dataset.index = String(i)
            if (item.selected) {
                li.classList.add("selected")
                li.setAttribute("aria-current", "true")
            }
            if (item.locked) {
                li.classList.add("locked")
                li.setAttribute("aria-disabled", "true")
            }
            menu.appendChild(li)
        })
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
    cards.forEach(({ animal, selected, players = [] }, i) => {
        const li = document.createElement("li")
        li.className = "card"
        li.dataset.animal = animal.id
        li.dataset.index = String(i)
        if (selected) {
            li.classList.add("selected")
            li.setAttribute("aria-current", "true")
        }
        if (players.length > 0) {
            const tags = document.createElement("div")
            tags.className = "card-players"
            for (const { index, ready } of players) {
                li.classList.add(`p${index + 1}`)
                const tag = document.createElement("span")
                tag.className = `card-player p${index + 1}`
                tag.textContent = `${index + 1}P${ready ? " ✓" : ""}`
                tags.appendChild(tag)
            }
            li.appendChild(tags)
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
    })
    return row
}

// What a tap or click on the overlay hit: a menu item or card (its index
// in the menu), the Back button, or anywhere else on the overlay or its
// backdrop. Undefined for anything else.
export type OverlayTap =
    | { kind: "item"; index: number }
    | { kind: "back" }
    | { kind: "panel" }

export function overlayTap(target: EventTarget | null): OverlayTap | undefined {
    if (!(target instanceof Element)) return undefined
    if (!target.closest("#overlay, #backdrop")) return undefined
    if (target.closest("[data-back]")) return { kind: "back" }
    const item = target.closest<HTMLElement>("#overlay [data-index]")
    if (!item) return { kind: "panel" }
    const index = Number(item.dataset.index)
    return Number.isInteger(index) ? { kind: "item", index } : undefined
}

// A small note at the bottom of the screen (e.g. "Controller connected").
// It doesn't block play or replace the overlay; a new toast replaces the
// last. The caller hides it (main.ts owns the timer).
//
// The toast is one status live region that stays in the page and only
// changes its text: screen readers announce changes to a region they
// already watch, not a region added with its text in place. Hidden, it is
// empty (and drawn as nothing, see .toast:empty). Main calls hideToast at
// startup to put the region in place before the first toast.
export function showToast(text: string) {
    toastRegion().textContent = text
}

export function hideToast() {
    toastRegion().textContent = ""
}

function toastRegion(): HTMLElement {
    const existing = document.getElementById("toast")
    if (existing) return existing
    const toast = document.createElement("div")
    toast.id = "toast"
    toast.className = "toast"
    toast.setAttribute("role", "status")
    document.body.appendChild(toast)
    return toast
}
