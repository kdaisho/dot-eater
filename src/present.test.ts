import { describe, expect, it } from "vite-plus/test"
import { defeatEnemy, hasStatus, inPlay } from "./breath"
import { createCharacter } from "./character"
import {
    AiType,
    DOT_POINTS,
    ENEMY_IDS,
    MAX_ENEMIES,
    MAX_HEALTH,
    TICK_RATE,
} from "./constants"
import { enemySpeed } from "./difficulty"
import { step, type GameState } from "./game"
import {
    BOSS_DROP_AT,
    bossDropCell,
    dropPresents,
    enemyCount,
    GERM_LAND_SECONDS,
    germCell,
    HEAL_HEALTH,
    HUGE_DOT_DOTS,
    openBox,
    placeBox,
    PRESENT_DROP_CHANCE,
    PRESENT_SECONDS,
    PRESENT_WEIGHTS,
    PresentContent,
    QUAKE,
    QUAKE_SECONDS,
    rollContent,
    SPEED_BOOST,
    SPEED_BOOST_SECONDS,
    tickPresents,
} from "./present"
import { createSplitter, GONE } from "./splitter"
import {
    fixedRandom,
    makeBoss,
    makeEnemy,
    makeState,
    testBreath,
    textMap,
    withoutBreath,
} from "./test/helpers"
import { vec2 } from "./vec2"

const TICK = 1 / TICK_RATE

// Random numbers that roll each content (see rollContent: by weight, in
// order, out of 10).
const ROLL: Readonly<Record<PresentContent, number>> = {
    heal: 0.05,
    hugeDot: 0.2,
    speed: 0.4,
    quake: 0.7,
    germ: 0.9,
}
// A number that drops a box (the top PRESENT_DROP_CHANCE of the range),
// and one that doesn't.
const DROP = 0.99
const NO_DROP = 0.5

// An open room, and a dot shut away under it so a tick isn't a win.
const room = textMap([
    "#########",
    "#       #",
    "#       #",
    "#       #",
    "#       #",
    "#########",
    "#.#######",
    "#########",
]).map

// A stage with the player at (1, 1), ready to move, and `enemies`, 50
// health and an empty meter.
function setup(enemies = [makeEnemy(5, 3, AiType.breather)]) {
    const state = makeState(room, { x: 1, y: 1 }, enemies, { health: 50 })
    state.players[0].character.moveProgress = 1
    return state
}

// Report enemy `i` defeated by a breath (as breathe does) and drop this
// tick's boxes with `random`.
function defeatAndDrop(state: GameState, i: number, random: number) {
    state.events = []
    defeatEnemy(state, state.enemies[i])
    dropPresents(state, fixedRandom(random))
}

describe("the drop", () => {
    it("drops a box on a strong enemy's cell, PRESENT_DROP_CHANCE of the time", () => {
        expect(PRESENT_DROP_CHANCE).toBe(0.15)
        for (const ai of [
            AiType.breather,
            AiType.interceptor,
            AiType.phantom,
        ]) {
            const state = setup([makeEnemy(5, 3, ai)])
            defeatAndDrop(state, 0, NO_DROP)
            expect(state.presents.boxes).toEqual([])
            const again = setup([makeEnemy(5, 3, ai)])
            defeatAndDrop(again, 0, DROP)
            expect(again.presents.boxes).toEqual([
                { pos: vec2(5, 3), left: PRESENT_SECONDS },
            ])
            expect(again.events.at(-1)).toEqual({
                type: "presentDropped",
                at: vec2(5, 3),
            })
        }
    })

    it("drops nothing at the bottom of the range (a fixed 0)", () => {
        const state = setup()
        defeatAndDrop(state, 0, 0)
        expect(state.presents.boxes).toEqual([])
    })

    it("drops none from the weak enemies", () => {
        for (const ai of [
            AiType.random,
            AiType.chase,
            AiType.ambusher,
            AiType.patroller,
        ]) {
            const state = setup([makeEnemy(5, 3, ai)])
            defeatAndDrop(state, 0, DROP)
            expect(state.presents.boxes, `ai ${ai}`).toEqual([])
        }
    })

    it("drops one from a whole Splitter as it splits, none from its halves", () => {
        const state = setup(
            createSplitter([ENEMY_IDS[0], ENEMY_IDS[1]], vec2(5, 3))
        )
        defeatAndDrop(state, 0, DROP)
        expect(state.presents.boxes).toHaveLength(1)
        state.presents.boxes = []
        defeatAndDrop(state, 0, DROP)
        defeatAndDrop(state, 1, DROP)
        expect(state.presents.boxes).toEqual([])
    })

    it("keeps to one box a cell", () => {
        const state = setup()
        expect(placeBox(state, vec2(5, 3))).toBe(true)
        state.presents.boxes[0].left = 3
        defeatAndDrop(state, 0, DROP)
        expect(state.presents.boxes).toEqual([{ pos: vec2(5, 3), left: 3 }])
    })

    it("drops from a breath's defeat in a real tick", () => {
        const state = makeState(
            room,
            { x: 1, y: 1 },
            [makeEnemy(4, 1, AiType.breather)],
            {
                breath: testBreath({
                    shape: () => ({ kind: "line", range: 5 }),
                    fire: (hit) => hit.enemies.forEach((e) => hit.defeat(e)),
                }),
            }
        )
        state.players[0].breather.energy = 100
        state.players[0].breather.facing = vec2(1, 0)
        step(
            state,
            TICK,
            { held: [], pressed: vec2(0, 0), breath: true },
            fixedRandom(DROP)
        )
        expect(state.presents.boxes.map((b) => b.pos)).toEqual([vec2(4, 1)])
    })
})

describe("the boss's drops", () => {
    // A boss in the middle of a bigger room.
    const hall = textMap([
        "###########",
        "#         #",
        "#         #",
        "#         #",
        "#         #",
        "###########",
    ]).map
    const boss = () => {
        const state = makeState(hall, { x: 1, y: 1 }, [], {
            boss: withoutBreath(makeBoss(5, 2)),
        })
        return { state, boss: state.boss! }
    }

    it("drops one as its health first falls to 75%, 50% and 25%", () => {
        expect(BOSS_DROP_AT).toEqual([0.75, 0.5, 0.25])
        const { state, boss: b } = boss()
        dropPresents(state, fixedRandom(0))
        expect(state.presents.boxes).toEqual([])
        b.health = b.maxHealth * 0.8
        dropPresents(state, fixedRandom(0))
        expect(state.presents.boxes).toEqual([])
        b.health = b.maxHealth * 0.75
        dropPresents(state, fixedRandom(0))
        expect(state.presents.boxes).toHaveLength(1)
        // Once each: the same health again drops nothing more.
        dropPresents(state, fixedRandom(0))
        expect(state.presents.boxes).toHaveLength(1)
        // A big hit past two at once drops both.
        b.health = b.maxHealth * 0.2
        dropPresents(state, fixedRandom(0))
        expect(state.presents.boxes).toHaveLength(3)
        expect(state.presents.bossDrops).toBe(3)
    })

    it("drops on a free cell next to its footprint", () => {
        const { state, boss: b } = boss()
        const first = bossDropCell(state)!
        // Next to the 2x2 at (5, 2), outside it.
        const dx = first.x - 5
        const dy = first.y - 2
        expect(dx >= -1 && dx <= 2 && dy >= -1 && dy <= 2).toBe(true)
        expect(dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1).toBe(false)
        b.health = 0.1 * b.maxHealth
        dropPresents(state, fixedRandom(0))
        const cells = state.presents.boxes.map((p) => `${p.pos.x},${p.pos.y}`)
        expect(new Set(cells).size).toBe(3)
    })

    it("drops none once it is defeated", () => {
        const { state, boss: b } = boss()
        b.health = 0
        b.defeated = true
        dropPresents(state, fixedRandom(0))
        expect(state.presents.boxes).toEqual([])
    })
})

describe("the contents", () => {
    it("are rolled by PRESENT_WEIGHTS", () => {
        expect(PRESENT_WEIGHTS).toEqual({
            heal: 1,
            hugeDot: 2,
            speed: 2.5,
            quake: 3,
            germ: 1.5,
        })
        for (const [content, roll] of Object.entries(ROLL)) {
            expect(rollContent(fixedRandom(roll))).toBe(content)
        }
        // Their shares, over an even sweep of the range.
        const counts: Record<string, number> = {}
        const n = 1000
        for (let i = 0; i < n; i++) {
            const c = rollContent(fixedRandom((i + 0.5) / n))
            counts[c] = (counts[c] ?? 0) + 1
        }
        expect(counts).toEqual({
            heal: 100,
            hugeDot: 200,
            speed: 250,
            quake: 300,
            germ: 150,
        })
    })

    it("never roll the Germ without it", () => {
        for (let i = 0; i < 100; i++) {
            const c = rollContent(fixedRandom((i + 0.5) / 100), false)
            expect(c).not.toBe(PresentContent.germ)
        }
        // The top of the range is the Earthquake then.
        expect(rollContent(fixedRandom(0.99), false)).toBe("quake")
    })

    const open = (state: GameState, content: PresentContent) =>
        openBox(state, state.players[0], vec2(2, 1), fixedRandom(ROLL[content]))

    it("Heal gives a heart back, not above MAX_HEALTH", () => {
        const state = setup()
        open(state, PresentContent.heal)
        expect(state.players[0].health).toBe(50 + HEAL_HEALTH)
        state.players[0].health = MAX_HEALTH - 5
        open(state, PresentContent.heal)
        expect(state.players[0].health).toBe(MAX_HEALTH)
    })

    it("Huge dot scores ten dots and fills the meter, but isn't a dot", () => {
        const state = setup()
        const player = state.players[0]
        open(state, PresentContent.hugeDot)
        expect(player.score).toBe(HUGE_DOT_DOTS * DOT_POINTS)
        expect(player.breather.energy).toBe(player.breather.breath.maxEnergy)
        expect(player.dots).toBe(0)
    })

    it("Speed boost speeds the opener up for SPEED_BOOST_SECONDS", () => {
        const state = makeState(room, [vec2(1, 1), vec2(1, 3)], [], {
            mode: "coop",
        })
        const [p1, p2] = state.players
        const speed = p1.character.speed
        openBox(state, p1, vec2(2, 1), fixedRandom(ROLL.speed))
        expect(p1.character.speed).toBeCloseTo(speed * SPEED_BOOST)
        expect(p2.character.speed).toBe(speed)
        // Another one meanwhile starts the time again, at the same speed.
        tickPresents(state, 2)
        openBox(state, p1, vec2(2, 1), fixedRandom(ROLL.speed))
        expect(p1.character.speed).toBeCloseTo(speed * SPEED_BOOST)
        tickPresents(state, SPEED_BOOST_SECONDS - 0.1)
        expect(p1.character.speed).toBeCloseTo(speed * SPEED_BOOST)
        tickPresents(state, 0.2)
        expect(p1.character.speed).toBe(speed)
        expect(p1.speedBoost).toBeNull()
    })

    it("each reports its presentOpened and starts its reveal", () => {
        const state = setup()
        open(state, PresentContent.hugeDot)
        expect(state.events.at(-1)).toEqual({
            type: "presentOpened",
            player: 0,
            at: vec2(2, 1),
            content: "hugeDot",
        })
        expect(state.presents.reveals).toEqual([
            {
                pos: vec2(2, 1),
                player: 0,
                content: "hugeDot",
                germ: null,
                age: 0,
            },
        ])
    })
})

describe("the Earthquake", () => {
    it("freezes every enemy in play for QUAKE_SECONDS, harmless; not the boss", () => {
        const gone = makeEnemy(6, 4, AiType.chase)
        const state = makeState(
            room,
            { x: 1, y: 1 },
            [makeEnemy(5, 3, AiType.chase), gone],
            { boss: makeBoss(5, 1) }
        )
        defeatEnemy(state, gone)
        openBox(state, state.players[0], vec2(2, 1), fixedRandom(ROLL.quake))
        const [enemy] = state.enemies
        expect(hasStatus(enemy, "holds")).toBe(true)
        expect(hasStatus(enemy, "harmless")).toBe(true)
        expect(enemy.statuses[0].status).toBe(QUAKE)
        expect(QUAKE.panics).toBe(true)
        expect(gone.statuses).toEqual([])
        expect(state.boss!.stagger).toBe(0)
    })

    it("holds an enemy still, then lets it go", () => {
        const enemy = makeEnemy(5, 3, AiType.chase)
        const state = setup([enemy])
        openBox(state, state.players[0], vec2(2, 1), fixedRandom(ROLL.quake))
        const ticks = Math.round(QUAKE_SECONDS * TICK_RATE) - 2
        for (let i = 0; i < ticks; i++) {
            step(state, TICK, { held: [], pressed: vec2(0, 0) }, fixedRandom(0))
        }
        expect(enemy.pos).toEqual(vec2(5, 3))
        for (let i = 0; i < TICK_RATE; i++) {
            step(state, TICK, { held: [], pressed: vec2(0, 0) }, fixedRandom(0))
        }
        expect(enemy.statuses).toEqual([])
        expect(enemy.pos).not.toEqual(vec2(5, 3))
    })
})

describe("the Germ", () => {
    // A corridor: the box at (4, 1), the player on it, come from (3, 1).
    const corridor = textMap([
        "#########",
        "#       #",
        "####.####",
        "#########",
    ]).map
    const germState = (enemies = [makeEnemy(7, 1, AiType.chase)]) => {
        const state = makeState(corridor, { x: 4, y: 1 }, enemies)
        state.players[0].character.lastPos = vec2(3, 1)
        return state
    }

    it("lands next to the box, the farthest such cell from the player, not on it", () => {
        // The player two cells off: of the box's neighbours (3, 1) is
        // nearest it; (5, 1) and (4, 2) tie for farthest, and direction
        // order (up, left, down, right) takes (4, 2).
        const off = makeState(corridor, { x: 2, y: 1 }, [])
        expect(germCell(off, vec2(4, 1))).toEqual(vec2(4, 2))
        // With the box in a dead end past the player, only the cell
        // towards it is free, and it isn't taken while the player is on it
        // or gliding out of it.
        const end = makeState(corridor, { x: 6, y: 1 }, [])
        expect(germCell(end, vec2(7, 1))).toBeNull()
        end.players[0].character.pos = vec2(5, 1)
        expect(germCell(end, vec2(7, 1))).toBeNull()
        end.players[0].character.lastPos = vec2(5, 1)
        end.players[0].character.pos = vec2(4, 1)
        expect(germCell(end, vec2(7, 1))).toEqual(vec2(6, 1))
        // Standing on the box, come from (3, 1): never that cell.
        const on = germState()
        expect(germCell(on, vec2(4, 1))).not.toEqual(vec2(3, 1))
    })

    it("jumps out a whole Splitter that counts as an enemy, at the difficulty's speed", () => {
        const state = germState()
        state.difficulty = "hard"
        openBox(state, state.players[0], vec2(4, 1), fixedRandom(ROLL.germ))
        const event = state.events.at(-1)!
        expect(event).toMatchObject({
            type: "presentOpened",
            content: "germ",
            germ: 1,
        })
        const [, main, spare] = state.enemies
        expect(main.ai).toBe(AiType.splitter)
        expect(main.germ).toBe(true)
        expect(spare.germ).toBe(true)
        expect(inPlay(main)).toBe(true)
        expect(inPlay(spare)).toBe(false)
        expect(main.speed).toBe(
            enemySpeed(createSplitter([1, 2], vec2(0, 0))[0].speed, "hard")
        )
        expect(state.spawns.enemies[1]).toEqual(main.pos)
        // In the air at first: still and harmless.
        expect(hasStatus(main, "holds")).toBe(true)
        expect(hasStatus(main, "harmless")).toBe(true)
        expect(main.statuses[0].left).toBe(GERM_LAND_SECONDS)
        expect(enemyCount(state)).toBe(2)
        // Never an id already taken.
        expect(new Set(state.enemies.map((e) => e.id)).size).toBe(3)
    })

    it("is rolled again, without the Germ, with no cell to land on", () => {
        // A dead end: the only cell next to the box is where the player
        // came from.
        const dead = textMap(["#####", "#   #", "#####"]).map
        const state = makeState(dead, { x: 3, y: 1 }, [])
        state.players[0].character.lastPos = vec2(2, 1)
        openBox(state, state.players[0], vec2(3, 1), fixedRandom(ROLL.germ))
        expect(state.enemies).toEqual([])
        // The same number again, without the Germ: the Earthquake.
        expect(state.events.at(-1)).toMatchObject({ content: "quake" })
    })

    it("is rolled again with MAX_ENEMIES in play", () => {
        const enemies = Array.from({ length: MAX_ENEMIES }, (_, i) =>
            createCharacter(ENEMY_IDS[i], vec2(7, 1), AiType.chase)
        )
        const state = germState(enemies)
        openBox(state, state.players[0], vec2(4, 1), fixedRandom(ROLL.germ))
        expect(state.enemies).toHaveLength(MAX_ENEMIES)
        expect(state.events.at(-1)).toMatchObject({ content: "quake" })
    })

    it("never comes back once its halves are defeated, nor drops a box", () => {
        const state = germState([])
        openBox(state, state.players[0], vec2(4, 1), fixedRandom(ROLL.germ))
        const [main, spare] = state.enemies
        defeatAndDrop(state, 0, DROP)
        expect(main.part!.half).toBe(true)
        defeatAndDrop(state, 0, DROP)
        defeatAndDrop(state, 1, DROP)
        expect(state.presents.boxes).toEqual([])
        expect(main.respawnIn).toBe(GONE)
        expect(spare.respawnIn).toBe(GONE)
        for (let i = 0; i < 20 * TICK_RATE; i++) {
            step(state, TICK, { held: [], pressed: vec2(0, 0) }, fixedRandom(0))
        }
        expect(inPlay(main)).toBe(false)
        expect(inPlay(spare)).toBe(false)
        expect(enemyCount(state)).toBe(0)
        // A new Germ takes its slots.
        state.players[0].character.lastPos = vec2(3, 1)
        openBox(state, state.players[0], vec2(4, 1), fixedRandom(ROLL.germ))
        expect(state.enemies).toHaveLength(2)
        expect(inPlay(state.enemies[0])).toBe(true)
    })
})

describe("a box's life", () => {
    it("vanishes after PRESENT_SECONDS, with a presentExpired", () => {
        const state = setup()
        placeBox(state, vec2(3, 3))
        tickPresents(state, PRESENT_SECONDS - 0.1)
        expect(state.presents.boxes).toHaveLength(1)
        state.events = []
        tickPresents(state, 0.2)
        expect(state.presents.boxes).toEqual([])
        expect(state.events).toEqual([
            { type: "presentExpired", at: vec2(3, 3) },
        ])
    })

    it("opens as a player steps onto it, and is gone", () => {
        const state = setup([])
        placeBox(state, vec2(2, 1))
        step(
            state,
            TICK,
            { held: [vec2(1, 0)], pressed: vec2(1, 0) },
            fixedRandom(ROLL.hugeDot)
        )
        expect(state.presents.boxes).toEqual([])
        expect(state.players[0].score).toBe(HUGE_DOT_DOTS * DOT_POINTS)
        expect(state.events.some((e) => e.type === "presentOpened")).toBe(true)
    })

    it("opens for either player in co-op", () => {
        const state = makeState(room, [vec2(1, 1), vec2(1, 3)], [], {
            mode: "coop",
        })
        placeBox(state, vec2(2, 3))
        state.players[1].character.moveProgress = 1
        step(
            state,
            TICK,
            [
                { held: [], pressed: vec2(0, 0) },
                { held: [vec2(1, 0)], pressed: vec2(1, 0) },
            ],
            fixedRandom(ROLL.hugeDot)
        )
        expect(state.players[1].score).toBe(HUGE_DOT_DOTS * DOT_POINTS)
        expect(state.players[0].score).toBe(0)
    })

    it("is cleared when the stage ends", () => {
        // One dot left, next to the player.
        const map = textMap(["#####", "# . #", "#####"]).map
        const state = makeState(map, { x: 1, y: 1 }, [])
        placeBox(state, vec2(3, 1))
        state.players[0].character.moveProgress = 1
        const outcome = step(
            state,
            TICK,
            { held: [vec2(1, 0)], pressed: vec2(1, 0) },
            fixedRandom(0)
        )
        expect(outcome).toBe("won")
        expect(state.presents.boxes).toEqual([])
    })
})
