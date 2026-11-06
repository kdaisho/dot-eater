import { describe, expect, it } from "vite-plus/test"
import { levels } from "./levels"
import {
    mazeBox,
    MINION_PACK,
    OPENING_DRUM,
    PACK_DELAY,
    PACK_LAP,
    runnerFeet,
} from "./opening"
import { drawOpening, type OpeningFrame } from "./openingView"
import { SPRITES } from "./sprites"
import { spriteOutline } from "./tiles"

// A 2D context that records what is drawn: each filled pixel rectangle
// with its colour and alpha, and each image drawn.
type Fill = {
    x: number
    y: number
    w: number
    h: number
    color: string
    alpha: number
}
// A document whose canvases keep the pixels put on them.
type FakeCanvas = { width: number; height: number; pixels?: Uint8ClampedArray }
const fakeDoc = {
    createElement() {
        const canvas: FakeCanvas = { width: 0, height: 0 }
        return Object.assign(canvas, {
            getContext: () => ({
                createImageData: (w: number, h: number) => ({
                    data: new Uint8ClampedArray(w * h * 4),
                }),
                putImageData: (img: { data: Uint8ClampedArray }) => {
                    canvas.pixels = img.data
                },
            }),
        })
    },
}

function recorder() {
    const fills: Fill[] = []
    const images: { x: number; y: number; image: FakeCanvas }[] = []
    const g = {
        fillStyle: "",
        globalAlpha: 1,
        canvas: { ownerDocument: fakeDoc },
        save() {},
        restore() {},
        translate() {},
        fillRect(x: number, y: number, w: number, h: number) {
            fills.push({ x, y, w, h, color: g.fillStyle, alpha: g.globalAlpha })
        },
        drawImage(image: FakeCanvas, x: number, y: number) {
            images.push({ x, y, image })
        },
    }
    return { g: g as unknown as CanvasRenderingContext2D, fills, images }
}

const frame = (seconds: number): OpeningFrame => ({
    stage: "title",
    seconds,
    choice: "start",
    canContinue: false,
})

const BOSS_COLORS = new Set(
    Object.entries(SPRITES.finalBoss.palette)
        .filter(([ch]) => "VDHRKG".includes(ch))
        .map(([, c]) => c.toLowerCase())
)

describe("drawOpening's title", () => {
    it("draws the final stage's maze, dimmed, behind it from the start", () => {
        const final = levels[levels.length - 1]!
        const box = mazeBox(final.width, final.height)
        for (const s of [0, OPENING_DRUM - 1, OPENING_DRUM + 3]) {
            const { g, images } = recorder()
            drawOpening(g, frame(s))
            expect(images).toHaveLength(1)
            expect(images[0]).toMatchObject({ x: box.left, y: box.top })
            expect(images[0]!.image).toMatchObject({
                width: box.width,
                height: box.height,
            })
        }
        const { g, images } = recorder()
        drawOpening(g, frame(1))
        const pixels = images[0]!.image.pixels!
        // its colours show at 40% over the sky: the walls' light band (#8f70c2)
        // shows, nothing comes near full brightness
        let brightest = 0
        for (let i = 0; i < pixels.length; i += 4)
            brightest = Math.max(brightest, pixels[i]!, pixels[i + 1]!)
        expect(brightest).toBeGreaterThan(0x8f * 0.4)
        expect(brightest).toBeLessThan(0xff * 0.4 + 0x1c * 0.6 + 1)
    })

    it("keeps the boss a silhouette before the drum", () => {
        const { g, fills } = recorder()
        drawOpening(g, frame(OPENING_DRUM - 0.5))
        const boss = fills.filter((f) => BOSS_COLORS.has(f.color.toLowerCase()))
        expect(boss).toHaveLength(0)
    })

    it("fades the boss's real colours in after the drum", () => {
        const at = (s: number) => {
            const { g, fills } = recorder()
            drawOpening(g, frame(s))
            return fills.filter((f) => BOSS_COLORS.has(f.color.toLowerCase()))
        }
        const half = at(OPENING_DRUM + 0.25)
        expect(half.length).toBeGreaterThan(100)
        for (const f of half) expect(f.alpha).toBeCloseTo(0.5, 9)
        for (const f of at(OPENING_DRUM + 1)) expect(f.alpha).toBe(1)
    })

    it("runs the pack along the maze's bottom corridor, outlined", () => {
        const { g, fills } = recorder()
        // a moment into the first run: the leaders are on the screen
        drawOpening(g, frame(OPENING_DRUM + PACK_DELAY + 0.5))
        const outline = fills.filter(
            (f) => f.color === spriteOutline(levels.length) && f.w === 1
        )
        expect(outline.length).toBeGreaterThan(20)
        const feet = runnerFeet(levels[levels.length - 1]!.height)
        const lowest = Math.max(...outline.map((f) => f.y))
        const dys = MINION_PACK.map((r) => r.dy)
        expect(lowest).toBeGreaterThanOrEqual(feet)
        expect(lowest).toBeLessThanOrEqual(feet + Math.max(...dys) + 1)
    })

    it("draws the Kitsune's lap every other run", () => {
        // the Kitsune's own colours, none of them a minion's
        const lower = (cs: Iterable<string>) =>
            [...cs].map((c) => c.toLowerCase())
        const minions = new Set(
            MINION_PACK.flatMap((r) =>
                lower(Object.values(SPRITES[r.id].palette))
            )
        )
        const kitsune = new Set(
            lower(Object.values(SPRITES.kitsune.palette)).filter(
                (c) => !minions.has(c)
            )
        )
        expect(kitsune.size).toBeGreaterThan(0)
        const has = (s: number) => {
            const { g, fills } = recorder()
            drawOpening(g, frame(s))
            return fills.some(
                (f) => f.y > 150 && kitsune.has(f.color.toLowerCase())
            )
        }
        const run = OPENING_DRUM + PACK_DELAY + 0.5
        expect(has(run + PACK_LAP)).toBe(true)
        expect(has(run)).toBe(false)
    })
})
