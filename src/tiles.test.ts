import { describe, expect, it } from "vite-plus/test"
import { addTileEffect } from "./breath"
import { BROKEN_WALL } from "./breaths/boar"
import { BREATH_ICE } from "./breaths/penguin"
import { Cell } from "./constants"
import type { GameState } from "./game"
import { createRegrow, dotGone } from "./regrow"
import { makeState, textMap } from "./test/helpers"
import {
    ART,
    cellLetters,
    createMapArt,
    dotGrid,
    EFFECT_TILES,
    effectPixels,
    patternAt,
    SHARED_ICE,
    spriteOutline,
    STAGE_STYLES,
    styleFor,
    tileCodes,
    TileCode,
    updateMapArt,
    wallPixel,
    type Neighbours,
    type TileStyle,
    type WallStyle,
} from "./tiles"
import { vec2 } from "./vec2"

// Neighbours with the walls named in `walls` (e.g. "N W NW").
function nb(walls = ""): Neighbours {
    const on = new Set(walls.split(" "))
    const keys = ["N", "S", "W", "E", "NW", "NE", "SW", "SE"] as const
    return Object.fromEntries(keys.map((k) => [k, on.has(k)])) as Neighbours
}

// A wall cell's letters, row by row, as strings ("." where the floor shows).
function wallRows(w: WallStyle, n: Neighbours): string[] {
    return Array.from({ length: ART }, (_, py) =>
        Array.from(
            { length: ART },
            (_, px) => wallPixel(w, n, px, py, px, py) ?? "."
        ).join("")
    )
}

// Plain walls: an outline band "K", then "H", then the fill "W".
const ROUND: WallStyle = { round: 2, bands: ["K", "H"], fill: "W" }
const SQUARE: WallStyle = { ...ROUND, round: 0 }

describe("wallPixel", () => {
    it("rounds the outer corners of a wall on its own", () => {
        expect(wallRows(ROUND, nb())).toEqual([
            "..KKKKKK..",
            ".KHHHHHHK.",
            "KHWWWWWWHK",
            "KHWWWWWWHK",
            "KHWWWWWWHK",
            "KHWWWWWWHK",
            "KHWWWWWWHK",
            "KHWWWWWWHK",
            ".KHHHHHHK.",
            "..KKKKKK..",
        ])
    })

    it("keeps square corners at radius 0", () => {
        const rows = wallRows(SQUARE, nb())
        expect(rows[0]).toBe("KKKKKKKKKK")
        expect(rows[1]).toBe("KHHHHHHHHK")
        expect(rows[5]).toBe("KHWWWWWWHK")
    })

    it("joins a wall into its neighbours: no edge where a wall goes on", () => {
        // In a row running left to right: bands only top and bottom.
        const rows = wallRows(ROUND, nb("W E"))
        expect(rows[0]).toBe("KKKKKKKKKK")
        expect(rows[1]).toBe("HHHHHHHHHH")
        expect(rows[5]).toBe("WWWWWWWWWW")
        expect(rows[9]).toBe("KKKKKKKKKK")
        // Its end: rounded on the open side only.
        const end = wallRows(ROUND, nb("W"))
        expect(end[0]).toBe("KKKKKKKK..")
        expect(end[5]).toBe("WWWWWWWWHK")
    })

    it("runs the band round an inner corner where the diagonal is open", () => {
        // An L's inside: walls north and west, open to the north-west.
        const rows = wallRows(ROUND, nb("N W S E SW NE SE"))
        expect(rows[0].slice(0, 3)).toBe("KHW")
        expect(rows[1].slice(0, 3)).toBe("HHW")
        expect(rows[2].slice(0, 3)).toBe("WWW")
        // Everything away from the corner is the fill.
        expect(rows[9]).toBe("WWWWWWWWWW")
        // Square walls make a square inner corner.
        const square = wallRows(SQUARE, nb("N W S E SW NE SE"))
        expect(square[0].slice(0, 3)).toBe("KHW")
        expect(square[1].slice(0, 3)).toBe("HHW")
    })

    it("fills a wall surrounded by walls, with no edge", () => {
        const rows = wallRows(ROUND, nb("N S W E NW NE SW SE"))
        expect(new Set(rows.join(""))).toEqual(new Set(["W"]))
    })

    it("colours each side by its own bands", () => {
        const w: WallStyle = { ...SQUARE, sides: { S: ["K", "S"] } }
        const rows = wallRows(w, nb("W E"))
        expect(rows[1]).toBe("HHHHHHHHHH")
        expect(rows[8]).toBe("SSSSSSSSSS")
    })

    it("draws the pattern under the bands, in world pixels", () => {
        const w: WallStyle = {
            ...SQUARE,
            pattern: { type: "brick", mortar: "M", h: 5, w: 10 },
        }
        const all = nb("N S W E NW NE SW SE")
        // A brick's bottom row is mortar, wherever the cell is.
        expect(wallPixel(w, all, 3, 4, 3, 4)).toBe("M")
        expect(wallPixel(w, all, 3, 3, 3, 3)).toBe("W")
        // The second row is offset half a brick: its joint moves with the
        // world position, so it runs on across the next cell.
        expect(wallPixel(w, all, 4, 6, 4, 6)).toBe("M")
        expect(wallPixel(w, all, 4, 6, 14, 6)).toBe("M")
        expect(wallPixel(w, all, 4, 6, 9, 6)).toBe("W")
    })
})

describe("patternAt", () => {
    it("draws grout on a tiles floor along each cell's top and left", () => {
        const p = { type: "tiles", letter: "f" } as const
        expect(patternAt(p, 0, 3, 0, 3)).toBe("f")
        expect(patternAt(p, 3, 0, 3, 0)).toBe("f")
        expect(patternAt(p, 3, 3, 3, 3)).toBeNull()
        expect(patternAt({ ...p, size: 5 }, 5, 3, 5, 3)).toBe("f")
    })

    it("puts rivets near a cell's corners", () => {
        const p = { type: "rivet", letter: "R" } as const
        expect(patternAt(p, 0, 0, 2, 7)).toBe("R")
        expect(patternAt(p, 0, 0, 3, 7)).toBeNull()
    })

    it("is the same every time at the same place", () => {
        const p = { type: "noise", letters: "ab", density: 0.5 } as const
        const once = Array.from({ length: 50 }, (_, i) =>
            patternAt(p, i, 3, 0, 0)
        )
        const again = Array.from({ length: 50 }, (_, i) =>
            patternAt(p, i, 3, 0, 0)
        )
        expect(again).toEqual(once)
        // About half the pixels get a speck.
        const specks = once.filter((l) => l !== null).length
        expect(specks).toBeGreaterThan(10)
        expect(specks).toBeLessThan(40)
    })
})

// Every letter a style draws with.
function lettersOf(s: TileStyle): string[] {
    const keys = s.rubble.keys ?? {}
    const pattern = (p: (typeof s.walls)["pattern"]) => {
        if (!p) return ""
        switch (p.type) {
            case "brick":
                return p.mortar
            case "stones":
                return p.mortar + p.alt
            case "noise":
                return p.letters
            default:
                return p.letter
        }
    }
    const text = [
        s.floor.fill,
        s.floor.shadow?.letter ?? "",
        pattern(s.floor.pattern),
        pattern(s.walls.pattern),
        s.walls.bands.join(""),
        s.walls.fill,
        ...Object.values(s.walls.sides ?? {}).map((b) => b.join("")),
        s.ice.fill + s.ice.shine + s.ice.rim,
        s.tunnel ?? "",
        ...s.dot,
        ...(s.regrow ?? []),
        ...(s.seed ?? []),
        ...s.rubble.grid.map((row) =>
            Array.from(row, (c) => keys[c] ?? c).join("")
        ),
    ].join("")
    return [...new Set(text)].filter((c) => c !== ".")
}

describe("the stage styles", () => {
    it("has the style the user picked for every stage (KDA-299)", () => {
        expect(
            Array.from({ length: 10 }, (_, i) => styleFor(i + 1).name)
        ).toEqual([
            "Toy blocks",
            "Warp pipes",
            "Glacier",
            "Moor stones",
            "Shrine",
            "Crypt",
            "Steel base",
            "Ice cave",
            "Iron gauntlet",
            "Dark castle",
        ])
    })

    it("falls back to stage 1's style off the stage list", () => {
        expect(styleFor(undefined)).toBe(STAGE_STYLES[1])
        expect(styleFor(11)).toBe(STAGE_STYLES[1])
    })

    it("has a colour for every letter each style draws with", () => {
        for (const [stage, style] of Object.entries(STAGE_STYLES)) {
            for (const l of lettersOf(style)) {
                expect(style.palette[l], `stage ${stage} ${l}`).toMatch(
                    /^#[0-9a-f]{6}$/
                )
            }
        }
    })

    it("draws ice on every stage: its own on the ice stages, else shared", () => {
        expect(styleFor(3).ice).toEqual({ fill: "I", shine: "i", rim: "j" })
        expect(styleFor(8).palette.I).toBe("#3f79a8")
        expect(styleFor(1).ice).toBe(SHARED_ICE)
        expect(styleFor(10).palette[SHARED_ICE.fill]).toBe("#a9e1f7")
    })

    it("tints the fog per stage", () => {
        expect(styleFor(4).fog).toBe("17, 17, 17")
        expect(styleFor(8).fog).toBe("8, 14, 28")
    })

    it("gives the dark-floor stages a light sprite outline", () => {
        const outlines = Array.from({ length: 10 }, (_, i) =>
            spriteOutline(i + 1)
        )
        expect(outlines.slice(0, 7)).toEqual(Array(7).fill("#000000"))
        for (const o of outlines.slice(7)) {
            const n = parseInt(o.slice(1), 16)
            const light = ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)
            expect(light).toBeGreaterThan(3 * 180)
        }
    })

    it("has growing-back dots and seeds on the boss stages only", () => {
        for (const [stage, style] of Object.entries(STAGE_STYLES)) {
            const boss = stage === "5" || stage === "10"
            expect(Boolean(style.regrow), stage).toBe(boss)
            expect(Boolean(style.seed), stage).toBe(boss)
        }
    })

    it("marks tunnel mouths where the stage has wrap tunnels", () => {
        expect(styleFor(2).tunnel).toBeDefined()
        expect(styleFor(9).tunnel).toBeDefined()
        expect(styleFor(5).tunnel).toBeUndefined()
    })
})

// A boss stage's state: dots growing back (rules.regrowDots), from `rows`.
function regrowState(rows: readonly string[]): GameState {
    const { map, ice } = textMap(rows)
    const state = makeState(map, { x: 1, y: 1 }, [], { ice })
    state.regrow = createRegrow({ seconds: 10 }, state.cells)
    return state
}

describe("tileCodes", () => {
    it("tells walls, floor and ice apart, with their dots", () => {
        const { map, ice } = textMap(["#####", "# .:#", "#~ ##", "#####"])
        const codes = tileCodes(makeState(map, { x: 1, y: 1 }, [], { ice }), [])
        expect(codes[0]).toBe(TileCode.wall)
        expect(codes[6]).toBe(TileCode.floor)
        expect(codes[7]).toBe(TileCode.floor | TileCode.dot)
        expect(codes[8]).toBe(TileCode.ice | TileCode.dot)
        expect(codes[11]).toBe(TileCode.ice)
    })

    it("marks the map's dots that grow back apart from a Splitter's drops", () => {
        const state = regrowState(["#####", "# . #", "#####"])
        // A drop on a cell that had no dot at the start.
        state.cells[1][3] = Cell.dot
        const codes = tileCodes(state, [])
        expect(codes[7]).toBe(TileCode.floor | TileCode.dot | TileCode.regrow)
        expect(codes[8]).toBe(TileCode.floor | TileCode.dot)
    })

    it("marks an eaten dot waiting to grow back with a seed", () => {
        const state = regrowState(["#####", "# ..#", "#####"])
        state.cells[1][2] = Cell.none
        dotGone(state, vec2(2, 1))
        const codes = tileCodes(state, [])
        expect(codes[7]).toBe(TileCode.floor | TileCode.seed)
        // Still drawn as a dot while the player glides onto it.
        const shown = tileCodes(state, [vec2(2, 1)])
        expect(shown[7]).toBe(TileCode.floor | TileCode.dot | TileCode.regrow)
    })

    it("draws a broken wall as rubble, and breath ice as ice", () => {
        const state = makeState(
            [
                [1, 1, 1, 1, 1],
                [1, 0, 0, 1, 1],
                [1, 1, 1, 1, 1],
            ],
            { x: 1, y: 1 }
        )
        addTileEffect(state, vec2(3, 1), BROKEN_WALL, 10)
        addTileEffect(state, vec2(2, 1), BREATH_ICE, 5)
        const codes = tileCodes(state, [])
        expect(codes[8]).toBe(TileCode.floor | TileCode.rubble)
        expect(codes[7]).toBe(TileCode.ice)
    })
})

// The letters of cell (x, y) of `rows` (a textMap) in `style`, as strings.
function cellRows(
    style: TileStyle,
    state: GameState,
    x: number,
    y: number,
    shown: ReturnType<typeof vec2>[] = []
): string[] {
    const codes = tileCodes(state, shown)
    const cols = state.cells[0].length
    const letters = cellLetters(
        style,
        { codes, cols, rows: state.cells.length },
        x,
        y
    )
    return Array.from({ length: ART }, (_, i) =>
        letters.slice(i * ART, (i + 1) * ART).join("")
    )
}

describe("cellLetters", () => {
    it("draws a boss stage's growing-back dot, a drop and a seed differently", () => {
        const style = styleFor(5)
        const state = regrowState(["######", "# .. #", "######"])
        state.cells[1][3] = Cell.none
        dotGone(state, vec2(3, 1))
        state.cells[1][4] = Cell.dot
        const regrow = cellRows(style, state, 2, 1)
        const seed = cellRows(style, state, 3, 1)
        const drop = cellRows(style, state, 4, 1)
        // The shrine's blue foxfire, its gold drop and the seed's corners.
        expect(regrow.join("")).toContain("b")
        expect(regrow.join("")).not.toContain("Y")
        expect(drop.join("")).toContain("Y")
        expect(drop.join("")).not.toContain("b")
        expect([seed[3][3], seed[3][6], seed[6][3], seed[6][6]]).toEqual([
            "c",
            "c",
            "c",
            "c",
        ])
        expect(seed[3][4]).not.toBe("c")
        expect(seed.join("")).not.toMatch(/[bY]/)
    })

    it("draws every dot plainly on a stage without growing back", () => {
        expect(dotGrid(styleFor(1), TileCode.dot | TileCode.regrow)).toBe(
            styleFor(1).dot
        )
        expect(dotGrid(styleFor(1), TileCode.seed)).toBeNull()
        expect(dotGrid(styleFor(10), TileCode.dot | TileCode.regrow)).toBe(
            styleFor(10).regrow
        )
        expect(dotGrid(styleFor(10), TileCode.floor)).toBeNull()
    })

    it("centres the dot in its cell", () => {
        const style = styleFor(10)
        const { map } = textMap(["###", "#.#", "###"])
        const rows = cellRows(style, makeState(map, { x: 0, y: 0 }), 1, 1)
        expect(rows[4].slice(3, 7)).toBe("FDDF".replace(/F/g, rows[4][3]))
        expect(rows[4][4]).toBe("D")
        expect(rows[5][5]).toBe("D")
        expect(rows[3][4]).not.toBe("D")
    })

    it("rims ice against plain floor, not against walls or more ice", () => {
        const style = styleFor(3)
        const { map, ice } = textMap(["#####", "# ~~#", "#####"])
        const state = makeState(map, { x: 1, y: 1 }, [], { ice })
        const left = cellRows(style, state, 2, 1)
        expect(left.every((row) => row[0] === "j")).toBe(true)
        expect(left[5][9]).not.toBe("j")
        expect(left[0][5]).not.toBe("j")
    })

    it("shades the floor just under a wall", () => {
        const style = styleFor(1)
        const { map } = textMap(["#####", "#   #", "#   #", "#####"])
        const state = makeState(map, { x: 1, y: 2 })
        const under = cellRows(style, state, 2, 1)
        expect(under[0][5]).toBe("s")
        expect(under[1][5]).toBe("s")
        expect(under[2][5]).not.toBe("s")
        expect(cellRows(style, state, 2, 2)[0][5]).not.toBe("s")
    })

    it("draws rubble on a broken wall, and edges on the walls round it", () => {
        const style = styleFor(7)
        const state = makeState(
            [
                [1, 1, 1, 1, 1],
                [1, 0, 1, 1, 1],
                [1, 1, 1, 1, 1],
            ],
            { x: 1, y: 1 }
        )
        const before = cellRows(style, state, 3, 1)
        addTileEffect(state, vec2(2, 1), BROKEN_WALL, 10)
        const rubble = cellRows(style, state, 2, 1).join("")
        expect(rubble).toMatch(/[WHS]/)
        expect(rubble).toContain("F")
        // The wall past it now has an open side facing it.
        const after = cellRows(style, state, 3, 1)
        expect(after[5][0]).toBe("K")
        expect(before[5][0]).not.toBe("K")
    })

    it("marks the mouths of wrap tunnels on a stage that has them", () => {
        const { map } = textMap(["###", "   ", "###"])
        const state = makeState(map, { x: 1, y: 1 })
        const mouth = cellRows(styleFor(2), state, 0, 1)
        expect(mouth[1][0]).toBe("T")
        expect(mouth[1][2]).toBe("T")
        expect(mouth[2][0]).not.toBe("T")
        // None inside the map, and none on a stage without tunnels.
        expect(cellRows(styleFor(2), state, 1, 1)[1][0]).not.toBe("T")
        expect(cellRows(styleFor(6), state, 0, 1).join("")).not.toContain("T")
    })
})

describe("updateMapArt", () => {
    const pixel = (
        art: ReturnType<typeof createMapArt>,
        x: number,
        y: number
    ) =>
        Array.from(
            art.pixels.slice(
                ...[0, 4].map((d) => (y * art.cols * ART + x) * 4 + d)
            )
        )

    it("paints the whole map first, then only the cells that change", () => {
        const style = styleFor(1)
        const { map } = textMap(["#######", "#.....#", "#######"])
        const state = makeState(map, { x: 1, y: 1 })
        const art = createMapArt(style, 7, 3)
        const first = updateMapArt(art, tileCodes(state, []))
        expect(first).toHaveLength(1)
        expect(first[0]).toEqual({
            x: 0,
            y: 0,
            width: 7 * ART,
            height: 3 * ART,
        })
        // Every pixel painted, opaque.
        for (let i = 3; i < art.pixels.length; i += 4) {
            expect(art.pixels[i]).toBe(255)
        }
        // Nothing changed: nothing to copy.
        expect(updateMapArt(art, tileCodes(state, []))).toEqual([])
        // The dot at (3, 1) is eaten: its cell and its neighbours.
        const dot = pixel(art, 3 * ART + 5, ART + 5)
        expect(dot.slice(0, 3)).toEqual([0x1f, 0x3b, 0x8a])
        state.cells[1][3] = Cell.none
        expect(updateMapArt(art, tileCodes(state, []))).toEqual([
            { x: 2 * ART, y: 0, width: 3 * ART, height: 3 * ART },
        ])
        expect(pixel(art, 3 * ART + 5, ART + 5).slice(0, 3)).not.toEqual([
            0x1f, 0x3b, 0x8a,
        ])
    })

    it("paints into pixels it is given", () => {
        const pixels = new Uint8ClampedArray(2 * ART * ART * 4)
        const art = createMapArt(styleFor(1), 2, 1, pixels)
        expect(art.pixels).toBe(pixels)
    })
})

describe("effect tiles", () => {
    it("has a tile for each breath effect that was an emoji", () => {
        expect(Object.keys(EFFECT_TILES).sort()).toEqual([
            "fire",
            "frozen",
            "gust",
            "stink",
        ])
        for (const grid of Object.values(EFFECT_TILES)) {
            expect(grid).toHaveLength(ART)
            for (const row of grid) expect(row).toHaveLength(ART)
        }
    })

    it("is clear where its grid is empty, so the wash shows", () => {
        const fire = effectPixels("fire")
        // (0, 0) is clear; (4, 0) is the flame's dark tip.
        expect(Array.from(fire.slice(0, 4))).toEqual([0, 0, 0, 0])
        expect(Array.from(fire.slice(16, 20))).toEqual([0xb8, 0x32, 0x0a, 255])
        // The frozen block is a frame, open in the middle for the sprite.
        const frozen = effectPixels("frozen")
        expect(frozen[(5 * ART + 5) * 4 + 3]).toBe(0)
        expect(frozen[3]).toBe(255)
    })
})
