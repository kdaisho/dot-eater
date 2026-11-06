import confetti from "canvas-confetti"
import { DEFAULT_BINDINGS, keyName, type Bindings } from "./bindings"
import { cardsPage } from "./cardsView"
import { ACTIONS, type Action } from "./input"
import type { StageSlot } from "./progress"
import type { AnimalId, AnimalInfo } from "./roster"
import { formatClock } from "./soundtrack"
import { ANIMAL_SPRITES, paintSprite } from "./sprites"
import { formatTicks, starList, starText, type ClearRating } from "./stars"
import { TUTORIAL_TITLES } from "./tutorial"
import { tutorialContent, type TutorialView } from "./tutorialView"

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

// A locked item is shown greyed out and marked aria-disabled. An item with
// a `value` (a setting's, e.g. "On") shows it after the label.
export type MenuItem = {
    label: string
    selected: boolean
    locked?: boolean
    value?: string
    // The value is a slider's ("◀ 7 ▶"): its arrows get tap targets of
    // their own (data-step -1 and 1), so a tap steps it.
    steps?: boolean
    // A short description, on a smaller line under the label.
    detail?: string
    // A progress bar under it: how far along (0–1), and the text after it.
    progress?: ItemProgress
    // Marked as playing (the soundtrack's track).
    playing?: boolean
}

export type ItemProgress = { share: number; text: string }

// What the end screens show.
export type EndScreenView = {
    // The difficulty's name (e.g. "Hard"), shown first.
    difficulty?: string
    // The final score.
    score: number
    // With two players, each one's share of it, player 1 first.
    playerScores?: readonly number[]
    // With two players, the dots each one ate, player 1 first. Given with
    // playerScores, each player gets a line of its own with both.
    playerDots?: readonly number[]
    // In a story run (KDA-271), the run total, shown after the score (the
    // stage's).
    runTotal?: number
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
    // The lines only name keys: they are hidden on phones (see
    // .overlay-hint in the CSS), where the overlay is tapped instead. A
    // number marks only the lines from that index on.
    keyHints?: boolean | number
    // A page's own content (the tutorial's), last.
    content?: HTMLElement
}

// A character select card: sprite and name, the breath, the stat. With two
// players, `players` are the ones whose cursor is on it.
type Card = {
    animal: AnimalInfo
    selected: boolean
    players?: readonly { index: number; ready: boolean }[]
}

// A card's sprite canvas is this many pixels across: one a dot of the
// 16x16 sprite and its outline. The CSS shows it at a whole multiple.
const SPRITE_PIXELS = 18

// The hints name each player's keys as bound (see setHintBindings):
// keys[player][action] is the key's display name.
let keys = hintKeys(DEFAULT_BINDINGS)

function hintKeys(bindings: Bindings): Record<Action, string>[] {
    return bindings.players.map((player) => {
        const names = {} as Record<Action, string>
        for (const action of ACTIONS) {
            names[action] = keyName(player.keys[action])
        }
        return names
    })
}

// Make the hints name these bindings' keys from the next overlay shown.
// Escape, fixed to pause and back, is always "Esc".
export function setHintBindings(bindings: Bindings) {
    keys = hintKeys(bindings)
}

// Player `player`'s key for `action`, as the hints name it.
const key = (action: Action, player = 0) => keys[player]![action]

// "↑ ↓": player `player`'s two keys for a menu axis.
const keyPair = (a: Action, b: Action, player = 0) =>
    `${key(a, player)} ${key(b, player)}`

// The title, with the mode select's menu when `modes` are given.
export function showTitle(modes: readonly MenuItem[] = []) {
    show({
        id: "title",
        title: "Dot Eater",
        lines: [
            modes.length > 0
                ? `${keyPair("up", "down")} to choose, ${key("confirm")} to start`
                : `Press ${key("confirm")} to start`,
        ],
        keyHints: true,
        items: modes,
    })
}

// Stage select: one item per slot. Locked stages keep their name behind a
// lock; slots with no level yet read "Coming soon". Both are greyed out. A
// cleared stage shows its best stars and best time after its name, at the
// difficulty named by `difficulty` (e.g. "Hard"), which a line says.
export function showStageSelect(
    slots: readonly StageSlot[],
    selected: number,
    difficulty?: string
) {
    const bestsOn = difficulty === undefined ? [] : [`Bests on ${difficulty}`]
    show({
        id: "stage-select",
        title: "Select a stage",
        lines: [
            ...bestsOn,
            `${keyPair("up", "down")} to choose, ${key("confirm")} to pick a difficulty, Esc or B to go back`,
        ],
        keyHints: bestsOn.length,
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

// Difficulty select: one item per difficulty, easiest first, each with a
// short description of how it plays.
export function showDifficultySelect(items: readonly MenuItem[]) {
    show({
        id: "difficulty-select",
        title: "Select a difficulty",
        lines: [
            `${keyPair("up", "down")} to choose, ${key("confirm")} to pick a character, Esc or B to go back`,
        ],
        keyHints: true,
        back: true,
        items,
    })
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
                  `1P: ${keyPair("left", "right")} to choose, ${key("confirm")} to confirm`,
                  `2P: ${keyPair("left", "right", 1)} to choose, ${key("confirm", 1)} to confirm`,
                  `Esc, B or ${key("pause", 1)} to go back`,
              ]
            : [
                  `${keyPair("left", "right")} to choose, ${key("confirm")} to play, Esc or B to go back`,
              ],
        keyHints: true,
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

// The pause screen, with its menu (Resume, Settings, Quit to title) when `items` are
// given. With two players either one resumes, so the hint gives player 2's
// keys too.
export function showPause(players = 1, items: readonly MenuItem[] = []) {
    show({
        id: "pause",
        title: "Paused",
        lines:
            players > 1
                ? [
                      `${keyPair("up", "down")} to choose, ${key("confirm")} or ${key("confirm", 1)} to pick`,
                      `Esc or ${key("pause", 1)} to resume`,
                  ]
                : [
                      `${keyPair("up", "down")} to choose, ${key("confirm")} to pick, Esc to resume`,
                  ],
        keyHints: true,
        items,
    })
}

// The settings screen: one item per row that shows, each with its value
// (see rowValue in settingsMenu.ts).
export function showSettings(items: readonly MenuItem[]) {
    show({
        id: "settings",
        title: "Settings",
        lines: [
            `${keyPair("up", "down")} to choose, ${keyPair("left", "right")} to change, Esc or B to go back`,
        ],
        keyHints: true,
        items,
    })
}

// The tutorial (KDA-319): the page's title, its content (tutorialView.ts)
// and Back.
export function showTutorial(view: TutorialView) {
    show({
        id: "tutorial",
        title: TUTORIAL_TITLES[view.page],
        back: true,
        content: tutorialContent(view),
    })
}

// The Cards page (KDA-320) on card `index`: a page of its own
// (cardsView.ts), in the overlay's place.
export function showCards(index: number) {
    hideOverlay()
    document.body.appendChild(cardsPage(index))
}

// What the soundtrack page (KDA-321) shows: every track, in order.
export type SoundtrackView = {
    tracks: readonly {
        name: string
        // Where it plays ("Stage 1").
        plays: string
        // Seconds into the file, and the length that plays.
        elapsed: number
        length: number
    }[]
    // The cursor's track and the one playing, indexes into `tracks`.
    selected: number
    playing?: number
    // Sound is muted, so the page says so.
    muted?: boolean
}

// The soundtrack page: a row per track with its name, where it plays, a
// progress bar and its time. Each row has at most one mark, left of its
// name (see menuLabel): ♪ on the playing row, cursor or not, and ▶ on the
// cursor's row otherwise. main moves the playing row's bar on with
// showTrackProgress.
export function showSoundtrack(view: SoundtrackView) {
    const muted = view.muted
        ? ["Sound is muted: turn it on with 🔇 at the top right"]
        : []
    show({
        id: "soundtrack",
        title: "Soundtrack",
        lines: [
            ...muted,
            `${keyPair("up", "down")} to choose, ${key("confirm")} to play or stop, Esc or B to go back`,
        ],
        keyHints: muted.length,
        back: true,
        items: view.tracks.map((track, i) => {
            const playing = i === view.playing
            const selected = i === view.selected
            return {
                label: track.name,
                selected,
                detail: track.plays,
                progress: trackProgressOf(track.elapsed, track.length),
                ...(playing ? { playing } : {}),
            }
        }),
    })
}

function trackProgressOf(elapsed: number, length: number): ItemProgress {
    return {
        share: length > 0 ? Math.min(Math.max(elapsed / length, 0), 1) : 0,
        text: `${formatClock(elapsed)} / ${formatClock(length)}`,
    }
}

// Move the soundtrack row `index`'s bar and time on in place (main does it
// every frame for the track playing), without rebuilding the overlay.
export function showTrackProgress(
    index: number,
    elapsed: number,
    length: number
) {
    const row = document.querySelector<HTMLElement>(
        `#overlay[data-screen='soundtrack'] li[data-index='${index}']`
    )
    const bar = row?.querySelector<HTMLElement>(".menu-progress")
    if (bar) fillProgress(bar, trackProgressOf(elapsed, length))
}

// What the controls screen shows (see the controls screen in flow.ts).
export type ControlsView = {
    // Whose controls show (player 1 is 0).
    player: number
    // One item per row, each with its key or button (see controlsMenu.ts).
    items: readonly MenuItem[]
    // While waiting for a key or button: the row's label, whether it
    // takes a pad button rather than a key, and whether this is a touch
    // device (where a tap cancels).
    capturing?: { label: string; pad: boolean; touch?: boolean }
}

// The controls screen: one player's keys and pad buttons, or while
// capturing, the prompt for the new one.
export function showControls({ player, items, capturing }: ControlsView) {
    const other = player === 0 ? 2 : 1
    show({
        id: "controls",
        title: `Controls · ${player + 1}P`,
        lines: capturing
            ? [
                  `Press a ${capturing.pad ? "button" : "key"} for ${capturing.label}`,
                  // A tap cancels on touch devices; a pad-only player
                  // cancels a key prompt with a button.
                  capturing.touch
                      ? "Tap to cancel"
                      : capturing.pad
                        ? "Esc to cancel"
                        : "Esc or a pad button to cancel",
              ]
            : [
                  `${keyPair("up", "down")} to choose, ${key("confirm")} to change`,
                  `${keyPair("left", "right")} for ${other}P's controls, Esc or B to go back`,
              ],
        // The prompt shows everywhere, and on touch devices so does how to
        // cancel it; the rest only name keys.
        keyHints: !capturing ? true : capturing.touch ? false : 1,
        items,
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

// The choice of story or stage mode (KDA-271), headed with the players
// picked on the title (e.g. "1 player").
export function showPlaySelect(heading: string, items: readonly MenuItem[]) {
    show({
        id: "play-select",
        title: heading,
        lines: [
            `${keyPair("up", "down")} to choose, ${key("confirm")} to pick, Esc or B to go back`,
        ],
        keyHints: true,
        back: true,
        items,
    })
}

// The story menu: Continue (locked while its stage isn't built yet) and
// New story.
export function showStoryMenu(items: readonly MenuItem[]) {
    show({
        id: "story-menu",
        title: "Story",
        lines: [
            `${keyPair("up", "down")} to choose, ${key("confirm")} to pick a difficulty, Esc or B to go back`,
        ],
        keyHints: true,
        back: true,
        items,
    })
}

// What the card between a story run's stages shows (see storyClear in
// flow.ts).
export type StoryClearView = {
    // The difficulty's name (e.g. "Hard"), shown first.
    difficulty?: string
    // The stage's score, and the run's total with it.
    score: number
    runTotal: number
    rating: ClearRating
    // The stage that comes next (e.g. "Stage 3: Ice"); left out when it
    // isn't built yet, and the card says "To be continued".
    next?: string
    // The card's one item: what confirm does.
    items: readonly MenuItem[]
}

// A story run's stage is cleared: its score and the run total, its time
// and stars, and what comes next.
export function showStoryClear(view: StoryClearView) {
    const { rating } = view
    show({
        id: "story-clear",
        title: view.next === undefined ? "To be continued…" : "Stage clear!",
        lines: [
            ...difficultyLine(view.difficulty),
            `Score ${view.score}`,
            `Run total ${view.runTotal}`,
            `Time ${formatTicks(rating.ticks)}`,
            ...starList(rating).map(
                (star) => `${star.earned ? "★" : "☆"} ${star.label}`
            ),
            view.next === undefined
                ? "More stages are coming soon"
                : `Next: ${view.next}`,
        ],
        items: view.items,
    })
}

// The story mode's ending (KDA-323): the ALL CLEAR card, drawn on a
// pixel canvas of `width` x `height` (storyEndView.ts) over the backdrop,
// the frozen maze behind it. It has nothing to tap. `label` says what the
// card says, for screen readers. It stays up while the card plays, so main
// draws on the same canvas each frame. Returns that canvas.
export function showStoryEnd(
    width: number,
    height: number,
    label: string
): HTMLCanvasElement {
    const shown = document.querySelector<HTMLCanvasElement>(
        "#overlay.story-end canvas"
    )
    if (shown) {
        shown.setAttribute("aria-label", label)
        return shown
    }
    hideOverlay()
    const backdrop = document.createElement("div")
    backdrop.id = "backdrop"
    backdrop.className = "backdrop"
    const page = document.createElement("div")
    page.id = "overlay"
    page.className = "story-end"
    page.dataset.screen = "story-end"
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    canvas.setAttribute("role", "img")
    canvas.setAttribute("aria-label", label)
    page.appendChild(canvas)
    document.body.append(backdrop, page)
    return canvas
}

// The pixel confetti's layer (pixelConfetti.ts): a canvas over the whole
// window, under the end roll, that lets taps through. Its pixels are as
// big as the end roll's would be in this window, so the bits match the
// card's. Made on first use; hideConfetti takes it away.
export function showConfetti(): HTMLCanvasElement {
    let canvas = document.querySelector<HTMLCanvasElement>("#confetti")
    if (!canvas) {
        canvas = document.createElement("canvas")
        canvas.id = "confetti"
        canvas.className = "confetti"
        canvas.setAttribute("aria-hidden", "true")
        document.body.appendChild(canvas)
    }
    const w = window.innerWidth || 256
    const h = window.innerHeight || 224
    const scale = Math.max(1, Math.min(w / 256, h / 224))
    const width = Math.ceil(w / scale)
    const height = Math.ceil(h / scale)
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    return canvas
}

export function hideConfetti() {
    document.getElementById("confetti")?.remove()
}

// The difficulty, the score, then with two players each one's share: on
// one line, or a line each with the dots it ate when playerDots are given.
function endScreen({
    difficulty,
    score,
    playerScores = [],
    playerDots,
    runTotal,
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
    const run = runTotal === undefined ? [] : [`Run total ${runTotal}`]
    return {
        lines: [
            ...difficultyLine(difficulty),
            `Score ${score}`,
            ...shares,
            ...run,
        ],
        items,
    }
}

// The line naming the difficulty on an end or result screen, if given.
function difficultyLine(difficulty: string | undefined): string[] {
    return difficulty === undefined ? [] : [`Difficulty ${difficulty}`]
}

function dotCount(n: number): string {
    return n === 1 ? "1 dot" : `${n} dots`
}

export function hideOverlay() {
    document.getElementById("backdrop")?.remove()
    document.getElementById("overlay")?.remove()
    document.getElementById("end-roll")?.remove()
}

// The end roll's screen: a black page with one pixel canvas of
// END_ROLL_WIDTH x END_ROLL_HEIGHT, scaled up to fit. It stays up while
// the end roll's screen changes (a skip), so main draws on the same
// canvas each frame. Returns that canvas.
export function showEndRoll(width: number, height: number): HTMLCanvasElement {
    const shown = document.querySelector<HTMLCanvasElement>("#end-roll canvas")
    if (shown) return shown
    hideOverlay()
    const page = document.createElement("div")
    page.id = "end-roll"
    page.className = "end-roll"
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    canvas.setAttribute("aria-label", "End roll")
    page.appendChild(canvas)
    document.body.appendChild(page)
    return canvas
}

function show({
    id,
    title,
    lines = [],
    items = [],
    cards = [],
    back = false,
    keyHints = false,
    content,
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

    const hintFrom =
        keyHints === true ? 0 : keyHints === false ? lines.length : keyHints
    for (const [i, line] of lines.entries()) {
        const p = document.createElement("p")
        p.className =
            i >= hintFrom ? "overlay-line overlay-hint" : "overlay-line"
        p.textContent = line
        panel.appendChild(p)
    }

    if (items.length > 0) {
        const menu = document.createElement("ul")
        menu.className = "overlay-menu"
        items.forEach((item, i) => {
            const li = document.createElement("li")
            li.dataset.index = String(i)
            li.append(menuLabel(item))
            if (item.playing) {
                // The ♪ is drawn by the CSS, so say it in words.
                const note = document.createElement("span")
                note.className = "visually-hidden"
                note.textContent = " (playing)"
                li.append(note)
            }
            if (item.value !== undefined) {
                const value = document.createElement("span")
                value.className = "menu-value"
                value.textContent = item.value
                if (item.steps) stepTargets(value, item.value)
                li.append(" ", value)
            }
            if (item.detail !== undefined) {
                const detail = document.createElement("span")
                detail.className = "menu-detail"
                detail.textContent = item.detail
                li.append(" ", detail)
            }
            if (item.progress !== undefined) {
                li.append(progressBar(item.progress))
            }
            if (item.playing) li.classList.add("playing")
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
    if (content) panel.appendChild(content)

    document.body.appendChild(panel)
    // The panel scrolls when it's taller than the window, and is rebuilt on
    // every cursor move, so bring the selection back into view each time.
    panel.querySelector(".selected")?.scrollIntoView({ block: "nearest" })
}

// A menu item's label. Its mark (data-mark), the cursor's ▶ or the playing
// track's ♪, is drawn by the CSS in a gutter just left of it, out of the
// text flow, so the centred label doesn't move with the cursor. The
// playing mark wins over the cursor's.
function menuLabel(item: MenuItem): HTMLElement {
    const label = document.createElement("span")
    label.className = "menu-label"
    label.textContent = item.label
    const mark = item.playing ? "♪" : item.selected ? "▶" : undefined
    if (mark) label.dataset.mark = mark
    return label
}

// A menu item's progress bar: the bar, then its text.
function progressBar(progress: ItemProgress): HTMLElement {
    const el = document.createElement("span")
    el.className = "menu-progress"
    const bar = document.createElement("span")
    bar.className = "menu-bar"
    bar.setAttribute("role", "progressbar")
    bar.setAttribute("aria-valuemin", "0")
    bar.setAttribute("aria-valuemax", "100")
    const fill = document.createElement("span")
    fill.className = "menu-bar-fill"
    bar.appendChild(fill)
    const text = document.createElement("span")
    text.className = "menu-time"
    el.append(bar, text)
    fillProgress(el, progress)
    return el
}

function fillProgress(el: HTMLElement, { share, text }: ItemProgress) {
    const percent = Math.round(share * 1000) / 10
    const bar = el.querySelector<HTMLElement>(".menu-bar")
    const fill = el.querySelector<HTMLElement>(".menu-bar-fill")
    const time = el.querySelector<HTMLElement>(".menu-time")
    bar?.setAttribute("aria-valuenow", String(percent))
    if (fill) fill.style.width = `${percent}%`
    if (time && time.textContent !== text) time.textContent = text
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
        // The character's pixel sprite, 1 canvas pixel a dot, scaled up
        // with crisp pixels by the CSS.
        const sprite = paintSprite(
            document.createElement("canvas"),
            { id: ANIMAL_SPRITES[animal.id] },
            SPRITE_PIXELS
        )
        sprite.className = "card-sprite"
        sprite.setAttribute("aria-hidden", "true")
        li.appendChild(sprite)
        const parts = [
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
    // A slider's ◀ (-1) or ▶ (1), on menu item `index`.
    | { kind: "step"; index: number; delta: -1 | 1 }
    | { kind: "panel" }

export function overlayTap(target: EventTarget | null): OverlayTap | undefined {
    if (!(target instanceof Element)) return undefined
    // A tap on the end roll is a press, as on a one-item menu.
    if (target.closest("#end-roll")) return { kind: "item", index: 0 }
    if (!target.closest("#overlay, #backdrop")) return undefined
    if (target.closest("[data-back]")) return { kind: "back" }
    const item = target.closest<HTMLElement>("#overlay [data-index]")
    if (!item) return { kind: "panel" }
    const index = Number(item.dataset.index)
    if (!Number.isInteger(index)) return undefined
    const step = target.closest<HTMLElement>("[data-step]")?.dataset.step
    if (step === "-1" || step === "1") {
        return { kind: "step", index, delta: step === "1" ? 1 : -1 }
    }
    return { kind: "item", index }
}

// Fill a slider's value ("◀ 7 ▶") with its arrows as tap targets of their
// own, the text unchanged.
function stepTargets(el: HTMLElement, value: string) {
    const arrow = (text: string, step: string) => {
        const span = document.createElement("span")
        span.className = "menu-step"
        span.dataset.step = step
        span.textContent = text
        return span
    }
    const middle = value.replace(/^◀/, "").replace(/▶$/, "")
    el.replaceChildren(arrow("◀", "-1"), middle, arrow("▶", "1"))
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

// A small "● REC" badge in the top corner while gameplay recording is on
// (?record, see replay.ts). It stays up for the whole session.
export function showRecordingBadge() {
    if (document.getElementById("rec-badge")) return
    const badge = document.createElement("div")
    badge.id = "rec-badge"
    badge.className = "rec-badge"
    badge.textContent = "● REC"
    badge.title = "Recording gameplay: each run downloads when it ends"
    document.body.appendChild(badge)
}

// How long a download's object URL stays valid after its click.
export const DOWNLOAD_REVOKE_MS = 1000

// Hand the player `text` as a file named `name` to save. The link goes in
// the document for its click (Firefox ignores clicks on detached links),
// and its URL is revoked only a while later: Safari and some Firefox
// setups start the download after the click returns, and lose it if the
// URL is already gone.
export function downloadFile(name: string, text: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }))
    const link = document.createElement("a")
    link.href = url
    link.download = name
    link.hidden = true
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_REVOKE_MS)
}
