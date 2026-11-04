// The tutorial's pages as DOM (KDA-319, the "Pixel kit" design): the
// keyboard and pad drawn like the sprites, with each player's keys in its
// colour, and little scenes of the real sprites on stage 1's tiles, which
// light the keys and buttons in step. ui.ts puts the content in the
// overlay; main draws each frame (drawTutorialFrame) from its loop, with
// the time its ticks have moved on, so nothing here keeps a clock or
// starts a timer. With reduced motion every scene stands on a still frame.

import "@fontsource/press-start-2p/latin-400.css"
import { buttonName, keyName, type Bindings } from "./bindings"
import { drawMeter, PLAYER_COLORS } from "./render"
import { ANIMAL_IDS, ANIMALS } from "./roster"
import {
    ANIMAL_SPRITES,
    mirrored,
    paintSprite,
    SpriteId,
    type SpriteLook,
} from "./sprites"
import {
    ART,
    createMapArt,
    effectPixels,
    styleFor,
    TileCode,
    updateMapArt,
} from "./tiles"
import {
    ACT_CYCLE,
    ACT_OFFSET,
    ACT_STILL,
    actPhase,
    actScene,
    BREATH_CAPTIONS,
    BREATH_CYCLE,
    BREATH_STILL,
    breathScene,
    dotEaten,
    GOAL_LINES,
    HEALTH_LINES,
    KEY_CAPS,
    keyLegend,
    keyOwners,
    loopTime,
    navHint,
    offLayoutKeys,
    padLegend,
    soloBreathKey,
    soloKeys,
    TOUCH_CAPTIONS,
    TOUCH_CYCLE,
    TOUCH_STILL,
    touchScene,
    type SceneState,
    type TutorialPage,
} from "./tutorial"

// What the tutorial shows: page `index` (of `count`) and the bindings its
// keys and buttons are named from. On a touch device the nav has Prev and
// Next buttons.
export type TutorialView = {
    page: TutorialPage
    index: number
    count: number
    bindings: Bindings
    touch: boolean
}

// Something on the page that moves: drawn at the time, or with reduced
// motion at `still`.
type Animator = { draw: (t: number) => void; still: number }

// The page showing's animators. A new page replaces them.
let animators: Animator[] = []

// Draw the page showing at `seconds` into it, or its still frames.
export function drawTutorialFrame(seconds: number, reduced: boolean) {
    for (const a of animators) a.draw(reduced ? a.still : seconds)
}

// The page's content, under the overlay's title: its body, then the nav.
// Its scenes are drawn on their still frames until the next frame.
export function tutorialContent(view: TutorialView): HTMLElement {
    animators = []
    const root = el("div", "tutorial")
    root.dataset.page = view.page
    root.append(PAGE_BODIES[view.page](view.bindings), nav(view))
    for (const a of animators) a.draw(a.still)
    return root
}

const PAGE_BODIES: Readonly<
    Record<TutorialPage, (bindings: Bindings) => HTMLElement>
> = {
    goal: goalPage,
    keyboard: keyboardPage,
    controller: controllerPage,
    breath: breathPage,
    health: () => col(...HEALTH_LINES.map((l) => line(l))),
    touch: touchPage,
}

// ---- DOM helpers ----

function el(
    tag: string,
    className: string,
    ...children: (Node | string | null | undefined)[]
): HTMLElement {
    const e = document.createElement(tag)
    e.className = className
    for (const child of children) if (child != null) e.append(child)
    return e
}

const col = (...children: (Node | string | null)[]) =>
    el("div", "tut-col", ...children)
const row = (...children: (Node | string | null)[]) =>
    el("div", "tut-row", ...children)
const line = (...children: (Node | string)[]) =>
    el("p", "tut-line", ...children)
const small = (...children: (Node | string)[]) =>
    el("span", "tut-small", ...children)
const pixel = (text: string, extra = "") =>
    el("span", `tut-px ${extra}`.trim(), text)

// A key or button's name as a chip, in player `player`'s colour (or
// Escape's white).
function chip(text: string, kind: number | "esc", extra = "") {
    const owner = kind === "esc" ? "esc" : `p${kind + 1}`
    const e = el("span", `tut-chip ${owner} ${extra}`.trim(), text)
    if (symbol(text)) e.classList.add("sym")
    return e
}

// Whether a label has a sign the pixel font lacks (it has Latin only: ↑,
// ⌫, ⌘), so it is drawn in the game's monospace instead, bigger.
function symbol(text: string): boolean {
    return /[^ -ÿ]/.test(text)
}

// ---- Pages ----

function goalPage(): HTMLElement {
    return col(
        scene({ cols: 10, scale: 2, cycle: ACT_CYCLE, script: actScene }),
        ...GOAL_LINES.map((l) => line(l))
    )
}

function keyboardPage(bindings: Bindings): HTMLElement {
    const owners = keyOwners(bindings)
    const board = el("div", "tut-kb")
    board.setAttribute("aria-hidden", "true")
    const caps = new Map<string, HTMLElement>()
    for (const cap of KEY_CAPS) {
        const owner = owners.get(cap.code)
        const kind = !owner
            ? ""
            : "esc" in owner
              ? " esc"
              : ` p${owner.player + 1}`
        const e = el("span", `tut-cap${kind}`, cap.label)
        if (symbol(cap.label)) e.classList.add("sym")
        e.dataset.code = cap.code
        e.style.left = `calc(var(--u) * ${cap.x})`
        e.style.top = `calc(var(--u) * ${cap.y})`
        e.style.width = `calc(var(--u) * ${cap.w} - 4px)`
        board.append(e)
        caps.set(cap.code, e)
    }
    // Each player's right and breath keys light as its scene walks and
    // breathes: on the drawing and in the legend.
    const lit: { right: HTMLElement[]; breath: HTMLElement[] }[] = []
    const legends = [0, 1].map((player) => {
        const keys = keyLegend(bindings, player)
        const move = keys.move.map((k) => chip(k, player))
        const breath = chip(keys.breath, player)
        const { right, breath: breathCode } = bindings.players[player]!.keys
        lit.push({
            right: [move[3]!, caps.get(right)].filter((e) => e !== undefined),
            breath: [breath, caps.get(breathCode)].filter(
                (e) => e !== undefined
            ),
        })
        return el(
            "div",
            "tut-legend",
            pixel(`${player + 1}P`, `tut-head p${player + 1}c`),
            el("span", "", ...move),
            small("Move"),
            el("span", "", breath),
            small("Breathe"),
            el("span", "", chip(keys.pause, player)),
            small("Pause"),
            el("span", "", chip(keys.confirm, player)),
            small("Confirm")
        )
    })
    animators.push({
        still: ACT_STILL,
        draw(t) {
            lit.forEach(({ right, breath }, player) => {
                const u = loopTime(t, ACT_CYCLE, player * ACT_OFFSET)
                const phase = actPhase(u)
                for (const e of right)
                    e.classList.toggle("lit", phase === "move")
                for (const e of breath) {
                    e.classList.toggle("lit", phase === "breath")
                }
            })
        },
    })
    const off = offLayoutKeys(bindings)
    const solo = soloBreathKey(bindings)
    return col(
        board,
        row(col(...[0, 1].map((player) => actStrip(player))), row(...legends)),
        off.length > 0
            ? line(
                  "Not on the drawing: ",
                  ...off.map((k) => chip(k.name, k.player))
              )
            : null,
        line(chip("Esc", "esc"), " always pauses and goes back"),
        solo ? line("1 Player: breathe with ", chip(solo, 0)) : null,
        el("p", "tut-small", "Change keys in Settings › Controls.")
    )
}

// Player `player`'s scene on the Keyboard and Controller pages: 1P's
// Dragon, 2P's Penguin half a loop behind, each with its number.
function actStrip(player: number, scale = 2): HTMLCanvasElement {
    return scene({
        cols: 10,
        scale,
        cycle: ACT_CYCLE,
        script: actScene,
        offset: player * ACT_OFFSET,
        animal: player === 0 ? SpriteId.dragon : SpriteId.penguin,
        player,
    })
}

function controllerPage(bindings: Bindings): HTMLElement {
    const pads = [0, 1].map((player) => {
        const n = player + 1
        const legend = el("div", "tut-legend")
        for (const { buttons, label, back } of padLegend(bindings, player)) {
            const shape = (b: string) => (b.length > 1 ? "pad wide" : "pad")
            legend.append(
                el(
                    "span",
                    "",
                    ...buttons.map((b) =>
                        chip(b, back ? "esc" : player, shape(b))
                    )
                ),
                small(label)
            )
        }
        return col(
            pixel(`PAD ${n} = ${n}P`, `p${n}c`),
            padCanvas(bindings, player),
            actStrip(player, 1.6),
            legend
        )
    })
    return col(row(...pads), line("Pad 1 plays 1P, pad 2 plays 2P."))
}

function breathPage(bindings: Bindings): HTMLElement {
    const keys = soloKeys(bindings)
    const right = chip(keyName(keys.right), 0)
    const breath = chip(keyName(keys.breath), 0)
    const caption = el("p", "tut-line tut-caption")
    caption.setAttribute("aria-live", "off")
    const strip = row(
        ...ANIMAL_IDS.map((id) =>
            col(
                walker(ANIMAL_SPRITES[id]),
                pixel(ANIMALS[id].name, "tut-name"),
                el("span", "tut-tiny", ANIMALS[id].breathName)
            )
        )
    )
    strip.classList.add("tut-animals")
    return col(
        line("Every animal has its own breath."),
        strip,
        scene({
            cols: 12,
            scale: 3,
            cycle: BREATH_CYCLE,
            script: breathScene,
            hud: true,
            still: BREATH_STILL,
            onState(st) {
                right.classList.toggle("lit", st.phase === "walk")
                breath.classList.toggle("lit", st.phase === "hold")
                const text =
                    BREATH_CAPTIONS[st.phase as keyof typeof BREATH_CAPTIONS]
                if (caption.textContent !== text) caption.textContent = text
            },
        }),
        row(right, small("walk"), breath, small("hold, then let go")),
        caption
    )
}

function touchPage(): HTMLElement {
    const caption = el("p", "tut-line tut-caption")
    // The game's Breath button (dpad.ts), as it looks when a breath is
    // ready.
    const button = el("span", "tut-breath-button", "💨")
    button.setAttribute("aria-hidden", "true")
    return col(
        scene({
            cols: 10,
            scale: 1.75,
            cycle: TOUCH_CYCLE,
            script: touchScene,
            still: TOUCH_STILL,
            onState(st) {
                const text =
                    TOUCH_CAPTIONS[st.phase as keyof typeof TOUCH_CAPTIONS]
                if (caption.textContent !== text) caption.textContent = text
            },
        }),
        caption,
        el(
            "div",
            "tut-legend",
            pixel("HOLD"),
            small("Keep your finger still to charge, then lift."),
            button,
            small("Or use the Breath button.")
        )
    )
}

// The page dots and "n/N", then on a keyboard the hint (bound keys), and
// on a touch device Prev and Next (Done on the last page), which tap
// through the overlay as menus do: Next confirms, Prev steps left.
function nav(view: TutorialView): HTMLElement {
    const { index, count, bindings, touch } = view
    const last = index === count - 1
    const dots = el("div", "tut-dots")
    for (let i = 0; i < count; i++) {
        dots.append(el("i", i === index ? "on" : ""))
    }
    const hint = el("p", "tut-hint overlay-hint", navHint(bindings, last))
    if (!touch) {
        return el(
            "div",
            "tut-nav",
            dots,
            pixel(`${index + 1}/${count}`, "tut-count"),
            hint
        )
    }
    const prev = el("button", "tut-button ghost", "‹ Prev")
    if (index > 0) {
        prev.dataset.index = String(index)
        prev.dataset.step = "-1"
    } else {
        prev.style.visibility = "hidden"
    }
    const next = el("button", "tut-button", last ? "Done" : "Next ›")
    next.dataset.index = String(index)
    for (const b of [prev, next]) b.setAttribute("type", "button")
    return el(
        "div",
        "tut-nav",
        el("div", "tut-navrow", prev, dots, next),
        pixel(`${index + 1}/${count}`, "tut-count"),
        el("p", "tut-small", "Swipe or tap Next"),
        hint
    )
}

// ---- Drawing ----

// A cell is CELL canvas pixels: two a tile's art pixel, so a sprite's dot
// (with its outline, 18 across) is one.
const CELL = ART * 2
const STAGE = styleFor(1)
const FIRE_WASH = "rgba(255, 110, 20, 0.45)"
const HUD_HEIGHT = 14

function context(canvas: HTMLCanvasElement) {
    const g = canvas.getContext("2d")
    if (g) g.imageSmoothingEnabled = false
    return g
}

function pixelCanvas(width: number, height: number, scale: number) {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    canvas.className = "tut-pixels"
    canvas.style.width = `${width * scale}px`
    canvas.setAttribute("aria-hidden", "true")
    return canvas
}

// Stage 1's tiles for a corridor `cols` cells long between two walls, at
// one canvas pixel an art pixel; made once per length.
const corridors = new Map<number, HTMLCanvasElement>()
function corridor(cols: number): HTMLCanvasElement {
    const hit = corridors.get(cols)
    if (hit) return hit
    const codes = new Uint8Array(cols * 3).fill(TileCode.wall)
    for (let x = 1; x < cols - 1; x++) codes[cols + x] = TileCode.floor
    const art = createMapArt(STAGE, cols, 3)
    updateMapArt(art, codes)
    const canvas = imageCanvas(cols * ART, 3 * ART, art.pixels)
    corridors.set(cols, canvas)
    return canvas
}

let fireTile: HTMLCanvasElement | undefined
function fire(): HTMLCanvasElement {
    fireTile ??= imageCanvas(ART, ART, effectPixels("fire"))
    return fireTile
}

function imageCanvas(w: number, h: number, pixels: Uint8ClampedArray) {
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const g = canvas.getContext("2d")
    if (g) {
        const image = g.createImageData(w, h)
        image.data.set(pixels)
        g.putImageData(image, 0, 0)
    }
    return canvas
}

// A sprite's look rasterised with the game's outline, one canvas pixel a
// dot; made once per look.
const looks = new Map<string, HTMLCanvasElement>()
function sprite(look: SpriteLook): HTMLCanvasElement {
    const key = JSON.stringify(look)
    const hit = looks.get(key)
    if (hit) return hit
    const canvas = paintSprite(document.createElement("canvas"), look, 18)
    looks.set(key, canvas)
    return canvas
}

function drawSpriteAt(
    g: CanvasRenderingContext2D,
    id: SpriteId,
    x: number,
    y: number,
    frame: number,
    right: boolean
) {
    const canvas = sprite({ id, frame, mirror: mirrored(id, right) })
    g.drawImage(canvas, Math.round(x * CELL + 1), Math.round(y * CELL + 1))
}

function drawDot(g: CanvasRenderingContext2D, cx: number, cy: number) {
    const grid = STAGE.dot
    const x0 = cx * CELL + Math.floor((ART - grid[0]!.length) / 2) * 2
    const y0 = cy * CELL + Math.floor((ART - grid.length) / 2) * 2
    grid.forEach((letters, y) => {
        for (let x = 0; x < letters.length; x++) {
            const color = STAGE.palette[letters[x]!]
            if (!color) continue
            g.fillStyle = color
            g.fillRect(x0 + x * 2, y0 + y * 2, 2, 2)
        }
    })
}

// 3x5 pixel glyphs: the players' numbers over their sprites and the pad's
// face buttons.
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
    A: [".#.", "#.#", "###", "#.#", "#.#"],
    B: ["##.", "#.#", "##.", "#.#", "##."],
    X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
    Y: ["#.#", "#.#", ".#.", ".#.", ".#."],
    1: [".#.", "##.", ".#.", ".#.", "###"],
    2: ["##.", "..#", ".#.", "#..", "###"],
}

function glyph(
    g: CanvasRenderingContext2D,
    ch: string,
    x: number,
    y: number,
    color: string,
    outline?: string
) {
    const rows = GLYPHS[ch]
    if (!rows) return
    if (outline) {
        g.fillStyle = outline
        g.fillRect(x - 1, y - 1, 5, 7)
    }
    g.fillStyle = color
    rows.forEach((r, j) => {
        for (let i = 0; i < r.length; i++) {
            if (r[i] === "#") g.fillRect(x + i, y + j, 1, 1)
        }
    })
}

type SceneOptions = {
    cols: number
    scale: number
    cycle: number
    script: (u: number) => SceneState
    offset?: number
    still?: number
    hud?: boolean
    animal?: SpriteId
    player?: number
    onState?: (st: SceneState) => void
}

// A corridor scene played by `script` over a `cycle` second loop: the
// tiles, the dots not yet eaten, fire, a ghost, the character, a finger,
// and with `hud` the energy meter in a white strip on top.
function scene(o: SceneOptions): HTMLCanvasElement {
    const top = o.hud ? HUD_HEIGHT : 0
    const width = o.cols * CELL
    const canvas = pixelCanvas(width, 2 * CELL + top, o.scale)
    canvas.classList.add("tut-scene")
    const g = context(canvas)
    const animal = o.animal ?? SpriteId.dragon
    animators.push({
        still: o.still ?? ACT_STILL,
        draw(t) {
            const u = loopTime(t, o.cycle, o.offset)
            const st = o.script(u)
            canvas.dataset.phase = st.phase ?? ""
            o.onState?.(st)
            if (!g) return
            g.save()
            g.clearRect(0, 0, canvas.width, canvas.height)
            if (top) {
                g.fillStyle = "#fff"
                g.fillRect(0, 0, width, top)
            }
            g.beginPath()
            g.rect(0, top, width, canvas.height - top)
            g.clip()
            // Half of each wall row shows: the map's row 1 is the floor.
            g.translate(0, top - CELL / 2)
            g.drawImage(corridor(o.cols), 0, 0, width, 3 * CELL)
            if (st.dotsFrom !== undefined && st.dotsTo !== undefined) {
                for (let x = st.dotsFrom; x <= st.dotsTo; x++) {
                    if (!dotEaten(x, st.x)) drawDot(g, x, 1)
                }
            }
            g.globalAlpha = st.fireAlpha ?? 1
            for (const x of st.fire ?? []) {
                g.fillStyle = FIRE_WASH
                g.fillRect(x * CELL, CELL, CELL, CELL)
                g.drawImage(fire(), x * CELL, CELL, CELL, CELL)
            }
            g.globalAlpha = 1
            if (st.ghost !== undefined) {
                const frame = Math.floor(u * 4) % 2
                drawSpriteAt(g, SpriteId.ghost, st.ghost, 1, frame, false)
            }
            const frame = st.walking ? Math.floor(u * 8) % 2 : 0
            const right = st.faceRight ?? true
            drawSpriteAt(g, animal, st.x, 1, frame, right)
            if (o.player !== undefined) {
                const x = Math.round(st.x * CELL + 15)
                const color = PLAYER_COLORS[o.player] ?? PLAYER_COLORS[0]
                glyph(g, String(o.player + 1), x, CELL, color, "#000")
            }
            if (st.finger && st.finger.alpha > 0) {
                g.globalAlpha = st.finger.alpha
                g.fillStyle = "#fcfcfc"
                g.beginPath()
                g.arc(st.finger.x, st.finger.y, 7, 0, Math.PI * 2)
                g.fill()
                g.strokeStyle = "#000"
                g.lineWidth = 1.5
                g.stroke()
                g.globalAlpha = 1
            }
            g.restore()
            if (st.meter && top) {
                drawMeter(g, st.meter, width - 82, 3, 78, 8)
            }
        },
    })
    return canvas
}

// An animal walking on the spot, facing right, for the Breath page's row.
function walker(id: SpriteId): HTMLCanvasElement {
    const canvas = pixelCanvas(18, 18, 3)
    canvas.dataset.sprite = id
    const g = context(canvas)
    animators.push({
        still: 0,
        draw(t) {
            if (!g) return
            g.clearRect(0, 0, 18, 18)
            const frame = Math.floor(t * 3) % 2
            g.drawImage(sprite({ id, frame, mirror: mirrored(id, true) }), 0, 0)
        },
    })
    return canvas
}

// The pad in pixels: the D-pad and the left stick light (the player's
// colour) while its scene walks, its breath button while it breathes; the
// buttons bound to an action are in its colour, B white (back).
const PAD_W = 76
const PAD_H = 42
const LIT = ["#3cbcfc", "#f87858"]
const BASE = ["#1c4c9c", "#a81800"]

function padCanvas(bindings: Bindings, player: number): HTMLCanvasElement {
    const canvas = pixelCanvas(PAD_W, PAD_H, 4)
    canvas.classList.add("tut-pad")
    const g = context(canvas)
    const pad = bindings.players[player]!.pad
    const lit = LIT[player]!
    const base = BASE[player]!
    const bound = (b: number) =>
        b === pad.breath || b === pad.confirm || b === pad.pause
    const disc = (cx: number, cy: number, r: number, color: string) => {
        if (!g) return
        g.fillStyle = color
        for (let y = -r; y <= r; y++) {
            for (let x = -r; x <= r; x++) {
                if (x * x + y * y <= r * r + r * 0.6) {
                    g.fillRect(cx + x, cy + y, 1, 1)
                }
            }
        }
    }
    animators.push({
        still: ACT_STILL,
        draw(t) {
            const phase = actPhase(loopTime(t, ACT_CYCLE, player * ACT_OFFSET))
            canvas.dataset.phase = phase
            if (!g) return
            const moving = phase === "move"
            g.clearRect(0, 0, PAD_W, PAD_H)
            // The body and its outline.
            disc(19, 25, 15, "#000")
            disc(57, 25, 15, "#000")
            g.fillRect(18, 9, 40, 26)
            disc(19, 25, 14, "#bcbcbc")
            disc(57, 25, 14, "#bcbcbc")
            g.fillStyle = "#bcbcbc"
            g.fillRect(19, 10, 38, 24)
            g.fillStyle = "#e4e4e4"
            g.fillRect(19, 10, 38, 2)
            // The shoulder buttons (LB/LT, RB/RT).
            g.fillStyle = "#000"
            g.fillRect(7, 5, 21, 5)
            g.fillRect(48, 5, 21, 5)
            g.fillStyle = bound(4) || bound(6) ? base : "#7c7c7c"
            g.fillRect(8, 6, 19, 3)
            g.fillStyle = bound(5) || bound(7) ? base : "#7c7c7c"
            g.fillRect(49, 6, 19, 3)
            // The D-pad.
            g.fillStyle = "#000"
            g.fillRect(11, 17, 13, 7)
            g.fillRect(14, 14, 7, 13)
            g.fillStyle = moving ? lit : base
            g.fillRect(12, 18, 11, 5)
            g.fillRect(15, 15, 5, 11)
            if (moving) {
                g.fillStyle = "#fcfcfc"
                g.fillRect(21, 19, 2, 3)
            }
            // The sticks.
            disc(28, 32, 4, "#000")
            disc(28, 32, 3, moving ? lit : base)
            disc(48, 32, 4, "#000")
            disc(48, 32, 3, "#5c5c5c")
            // Back and Start.
            g.fillStyle = "#000"
            g.fillRect(30, 15, 7, 4)
            g.fillRect(40, 15, 7, 4)
            g.fillStyle = bound(8) ? base : "#5c5c5c"
            g.fillRect(31, 16, 5, 2)
            g.fillStyle = bound(9) ? base : "#5c5c5c"
            g.fillRect(41, 16, 5, 2)
            // The face buttons: Y, X, B, A.
            const face: [number, number, number][] = [
                [3, 58, 12],
                [2, 51, 19],
                [1, 65, 19],
                [0, 58, 26],
            ]
            for (const [b, cx, cy] of face) {
                let color = b === 1 ? "#fcfcfc" : "#5c5c5c"
                if (b === pad.breath || b === pad.confirm) {
                    color = b === pad.breath && phase === "breath" ? lit : base
                }
                disc(cx, cy, 4, "#000")
                disc(cx, cy, 3, color)
                const text = color === "#fcfcfc" ? "#000" : "#fcfcfc"
                glyph(g, buttonName(b), cx - 1, cy - 2, text)
            }
        },
    })
    return canvas
}
