// The Cards page (KDA-320, cards.ts): the selected card in the middle, the
// cards either side of it peeking in (smaller, faded) with arrows, and page
// dots grouping the heroes, enemies and bosses; on a phone the card fills
// the width, with the arrows and dots under it (see .cards-page in the
// CSS). Each card is the end roll's (cardArt.ts), taller and wider, drawn
// on a pixel canvas; its text is DOM over the card's cream lower half, so
// it stays crisp at any size. The card's size is the CSS's --s, screen
// pixels per card pixel. The page is the overlay (#overlay), so a tap on a
// card, an arrow or a dot goes to that card and Back goes back, as on
// every overlay (overlayTap in ui.ts). DOM: no listeners or timers.

import {
    CARD_DEPTH,
    cardCanvas,
    cardFontReady,
    cardNumber,
    GOLD,
    loadCardFont,
} from "./cardArt"
import {
    CARD_H,
    CARD_W,
    cardGroups,
    CARDS,
    cardStep,
    cardText,
    TEXT_TOP,
    TEXT_X,
    TYPE,
    type CardInfo,
} from "./cards"

// The page for card `index`.
export function cardsPage(index: number): HTMLElement {
    loadCardFont()
    builtWithFont = cardFontReady()
    const prev = cardStep(index, -1)
    const next = cardStep(index, 1)
    const page = el("div", "cards-page")
    page.id = "overlay"
    page.dataset.screen = "cards"
    page.style.setProperty("--card-w", String(CARD_W + CARD_DEPTH))
    page.style.setProperty("--card-h", String(CARD_H + CARD_DEPTH))
    page.append(stars())

    const back = el("button", "cards-back", "← Back")
    back.setAttribute("type", "button")
    back.dataset.back = ""
    const count = el(
        "div",
        "cards-count",
        `${cardNumber(index)}/${String(CARDS.length).padStart(2, "0")}`
    )
    page.append(
        el("header", "cards-bar", [
            back,
            el("h1", "cards-title", "CARDS"),
            count,
        ])
    )

    const current = card(index)
    current.classList.add("cards-current")
    current.setAttribute("aria-current", "true")
    page.append(
        el("div", "cards-stage", [
            peek(prev, "prev"),
            arrow(prev, "prev"),
            current,
            arrow(next, "next"),
            peek(next, "next"),
            dots(index),
        ])
    )
    return page
}

// Whether the page showing was built before the cards' font loaded (their
// numbers are drawn in it), so it should be built again now that it has.
let builtWithFont = true
export function cardsPageStale(): boolean {
    return !builtWithFont && cardFontReady()
}

function el(
    tag: string,
    className: string,
    kids: string | readonly Node[] = []
): HTMLElement {
    const e = document.createElement(tag)
    e.className = className
    if (typeof kids === "string") e.textContent = kids
    else e.append(...kids)
    return e
}

// A length of `n` card pixels, at the card's size (--s).
const px = (n: number) => `calc(var(--s) * ${n})`

function styled(
    e: HTMLElement,
    type: { size?: number; line?: number },
    gap?: number
): HTMLElement {
    if (type.size !== undefined) e.style.fontSize = px(type.size)
    if (type.line !== undefined) e.style.lineHeight = String(type.line)
    if (gap !== undefined) e.style.marginTop = px(gap)
    return e
}

// One card: its canvas and its text.
function card(index: number): HTMLElement {
    const info = CARDS[index]!
    const art = cardCanvas(info, index, CARD_W, CARD_H)
    art.className = "tcard-art"
    art.setAttribute("aria-hidden", "true")
    const root = el("div", "tcard", [art, cardTextOf(info)])
    root.dataset.card = String(index)
    root.setAttribute("role", "group")
    root.setAttribute("aria-label", `${cardNumber(index)} ${info.name}`)
    return root
}

function cardTextOf(info: CardInfo): HTMLElement {
    const t = cardText(info)
    const { name, tag, ability, quote, rule, attack, text, foot } = TYPE
    const ruled = () => {
        const r = el("div", "tcard-rule")
        r.style.margin = `${px(rule.gap)} 0`
        r.style.borderTopWidth = px(rule.width)
        return r
    }
    const labelled = (label: string, s: string, gap?: number) =>
        styled(
            el("div", "tcard-tx", [
                el("span", "tcard-lab", label),
                document.createTextNode(` ${s}`),
            ]),
            text,
            gap
        )
    const boss = info.details.kind === "boss"
    const kids = [
        el("div", "tcard-row", [
            styled(
                el("span", `tcard-name${boss ? " boss" : ""}`, t.name),
                name
            ),
            styled(el("span", "tcard-tag", t.tag), tag),
        ]),
        styled(el("div", "tcard-ability", t.ability), ability, ability.gap),
        styled(el("div", "tcard-quote", t.quote), quote, quote.gap),
        ruled(),
        styled(
            el("div", "tcard-attack", [
                el("span", "tcard-attack-name", t.attack),
                el("span", "tcard-attack-value", t.value),
            ]),
            attack
        ),
        styled(el("div", "tcard-tx", t.body), text, text.gap),
        ...(t.charge === undefined
            ? []
            : [labelled("CHARGE", t.charge, text.gap)]),
        ruled(),
        labelled(t.note.label, t.note.text),
        styled(
            el(
                "div",
                "tcard-foot",
                t.foot.map((line) => el("div", "", line))
            ),
            foot,
            foot.gap
        ),
    ]
    const box = el("div", "tcard-text", kids)
    box.style.left = px(TEXT_X)
    box.style.top = px(TEXT_TOP)
    box.style.width = px(CARD_W - 2 * TEXT_X)
    return box
}

// A neighbouring card, smaller and faded; a tap goes to it.
function peek(index: number, side: "prev" | "next"): HTMLElement {
    const root = el("div", `cards-peek ${side}`, [card(index)])
    root.dataset.index = String(index)
    root.setAttribute("aria-hidden", "true")
    return root
}

function arrow(index: number, side: "prev" | "next"): HTMLElement {
    const button = el("button", `cards-arrow ${side}`)
    button.setAttribute("type", "button")
    button.dataset.index = String(index)
    button.setAttribute(
        "aria-label",
        side === "prev" ? "Previous card" : "Next card"
    )
    return button
}

// A dot a card, a gap between the groups; the selected card's is lit, and
// a tap on one goes to its card.
function dots(index: number): HTMLElement {
    const row = el("div", "cards-dots")
    for (const [from, to] of cardGroups()) {
        const group = el("div", "cards-dot-group")
        for (let i = from; i < to; i++) {
            const dot = el("span", i === index ? "cards-dot on" : "cards-dot")
            dot.dataset.index = String(i)
            group.append(dot)
        }
        row.append(group)
    }
    return row
}

// The night sky behind the cards: the end roll's stars, the same ones
// every time.
function stars(): HTMLCanvasElement {
    const canvas = document.createElement("canvas")
    canvas.className = "cards-stars"
    canvas.width = 320
    canvas.height = 240
    canvas.setAttribute("aria-hidden", "true")
    const g = canvas.getContext("2d")
    if (!g) return canvas
    let seed = 7
    const r = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0
        return seed / 4294967296
    }
    for (let k = 0; k < 90; k++) {
        const x = Math.floor(r() * canvas.width)
        const y = Math.floor(r() * canvas.height)
        const p = r()
        g.globalAlpha = 0.3 + p * 0.6
        g.fillStyle = p > 0.75 ? GOLD.face : "#fcfcfc"
        g.fillRect(x, y, 1, 1)
    }
    return canvas
}
