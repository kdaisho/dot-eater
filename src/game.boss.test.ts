import { describe, expect, it } from "vite-plus/test"
import { bossDamage, inFootprint } from "./boss"
import {
    MAX_CHARGE,
    type BreathDef,
    type BreathHit,
    type TileEffect,
} from "./breath"
import { BREATHS } from "./breaths"
import { BURNING } from "./breaths/dragon"
import {
    BOSS_DAMAGE,
    BOSS_DEFEAT_POINTS,
    BOSS_HEALTH,
    BOSS_SPEED,
    CATCH_DISTANCE,
    Cell,
    DOT_ENERGY,
    DOT_POINTS,
    MAX_HEALTH,
    PLAYER_SPEED,
    TICK_RATE,
} from "./constants"
import {
    bossHud,
    createGameState,
    drawnPos,
    step,
    type GameState,
    type MoveInput,
} from "./game"
import { parseFlat } from "./test/helpers"
import { ANIMAL_IDS } from "./roster"
import {
    drawn,
    fixedRandom,
    makeBoss,
    makeEnemy,
    makeState,
    OLD_LEVEL,
    testBreath,
    textMap,
    ticksUntilCaught,
    withoutBreath,
    type MapLiteral,
} from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"

// The boss (boss.ts) end to end through step(): breaths, moving, touching
// (and hurting) the player, and winning.

const TICK = 1 / TICK_RATE
const none = vec2(0, 0)
const east = vec2(1, 0)

type Press = {
    held?: Vec2
    pressed?: Vec2
    breath?: boolean
    breathHeld?: boolean
}

function tick(
    state: GameState,
    { held, pressed, breath, breathHeld }: Press = {}
) {
    const move: MoveInput = {
        held: held ? [held] : [],
        pressed: pressed ?? none,
        breath: breath ?? false,
        breathHeld: breathHeld ?? false,
    }
    return step(state, TICK, move, fixedRandom(0))
}

// An 8x4 arena. The dot in the wall pocket (bottom row) is never eaten, so
// the game isn't won by clearing the dots.
const arena = textMap([
    "##########",
    "#        #",
    "#        #",
    "#        #",
    "#        #",
    "##########",
    "#.########",
]).map

// The arena with no dots anywhere.
const bare = textMap([
    "##########",
    "#        #",
    "#        #",
    "#        #",
    "#        #",
    "##########",
]).map

// A game on `map` with the player at `player` (facing right) breathing
// `breath` with a full meter, and a boss at `boss` that won't move for a
// while unless `ready`.
function bossGame(
    player: Vec2,
    boss: Vec2,
    {
        breath = BREATHS.dragon,
        map = arena,
        health = 1,
        ready = false,
        speed,
    }: {
        breath?: BreathDef
        map?: MapLiteral
        health?: number
        ready?: boolean
        speed?: number
    } = {}
): GameState {
    const state = makeState(map, player, [], {
        breath,
        health,
        boss: makeBoss(boss.x, boss.y, speed),
    })
    state.players[0].breather.energy = breath.maxEnergy
    if (!ready) state.boss!.moveProgress = 0
    return state
}

// The damage a tap (level 1) of `breath` does: its cost over 25, the Owl
// 0.4, the Dragon, Penguin and Boar 0.8, the Skunk 1.2.
const tap = (breath: BreathDef) => bossDamage(breath.cost)

// How far the player's drawn position is from the square the boss's cell
// centres span, as collisions measure it.
function gap(state: GameState): number {
    const cols = state.cells[0].length
    const rows = state.cells.length
    const p = drawn(state, state.players[0].character)
    const b = drawnPos(state.boss!, cols, rows)
    const dx = Math.max(b.x - p.x, 0, p.x - (b.x + 1))
    const dy = Math.max(b.y - p.y, 0, p.y - (b.y + 1))
    return Math.hypot(dx, dy)
}

describe("createGameState", () => {
    const lair = parseFlat({
        name: "lair",
        parTime: 60,
        map: ["#######", "#P.B..#", "#.....#", "#######"],
        enemies: [],
        boss: { speed: 2 },
        rules: { regrowDots: { seconds: 10 } },
    })

    it("builds the level's boss, waiting out the grace period", () => {
        const game = createGameState(lair)
        expect(game.boss).toMatchObject({
            pos: vec2(3, 1),
            spawn: vec2(3, 1),
            speed: 2,
            health: BOSS_HEALTH,
            moveProgress: 0,
            defeated: false,
        })
        expect(game.enemies).toEqual([])
    })

    it("gives the boss the level's health, and the HUD shows it", () => {
        const tough = parseFlat({
            name: "lair",
            parTime: 60,
            map: ["#######", "#P.B..#", "#.....#", "#######"],
            enemies: [],
            boss: { health: 18 },
            rules: { regrowDots: { seconds: 10 } },
        })
        const game = createGameState(tough)
        expect(game.boss).toMatchObject({ health: 18, maxHealth: 18 })
        expect(bossHud(game)).toEqual({ health: 18, max: 18 })
    })

    it("has no boss on a level without one", () => {
        expect(createGameState(OLD_LEVEL).boss).toBeNull()
    })
})

describe("breathing at the boss", () => {
    // Every real breath, from (1, 2) facing right, with the boss's
    // footprint (2-3, 1-2) right in front.
    it.each(ANIMAL_IDS)("damages it by a tap's cost / 25: %s", (animal) => {
        const breath = BREATHS[animal]
        const state = bossGame(vec2(1, 2), vec2(2, 1), { breath })
        expect(tick(state, { breath: true })).toBeNull()
        const boss = state.boss!
        expect(boss.health).toBeCloseTo(BOSS_HEALTH - tap(breath))
        expect(boss.flash).toBeGreaterThan(0)
        // Paid for, like any breath that fires.
        expect(state.players[0].breather.energy).toBe(
            breath.maxEnergy - breath.cost
        )
        expect(state.players[0].breather.cooldown).toBeCloseTo(breath.cooldown)
        // Not pushed (the Owl) or moved otherwise.
        expect(boss.pos).toEqual(vec2(2, 1))
    })

    // KDA-289: damage goes by the energy spent, so a charge does what the
    // taps its energy pays for would, and the boss's health stays an
    // energy budget: 300 for BOSS_HEALTH, whatever the character.
    it.each(ANIMAL_IDS)(
        "damages it by the energy a charged breath spends: %s",
        (animal) => {
            const breath = BREATHS[animal]
            // A boss too slow to come round meanwhile.
            const state = bossGame(vec2(1, 2), vec2(2, 1), {
                breath,
                speed: 0.01,
            })
            // Held for a full charge, then let go.
            tick(state, { breath: true, breathHeld: true })
            for (let i = 0; i < TICK_RATE; i++)
                tick(state, { breathHeld: true })
            tick(state)
            const spent = breath.cost * MAX_CHARGE
            expect(state.players[0].breather.energy).toBe(
                breath.maxEnergy - spent
            )
            expect(state.boss!.health).toBeCloseTo(BOSS_HEALTH - spent / 25)
            expect(bossDamage(300)).toBe(BOSS_HEALTH)
        }
    )

    it("lets the Boar's breath hit it with no wall to break", () => {
        const state = bossGame(vec2(1, 2), vec2(2, 1), { breath: BREATHS.boar })
        tick(state, { breath: true })
        expect(state.boss!.health).toBeCloseTo(BOSS_HEALTH - tap(BREATHS.boar))
        expect(state.tiles).toEqual([])
        // With the boss elsewhere, the same breath refuses for free.
        const missed = bossGame(vec2(1, 2), vec2(5, 1), {
            breath: BREATHS.boar,
        })
        tick(missed, { breath: true })
        expect(missed.boss!.health).toBe(BOSS_HEALTH)
        expect(missed.players[0].breather.energy).toBe(BREATHS.boar.maxEnergy)
    })

    it("damages it once however many of its cells a breath covers", () => {
        // A tap of the Skunk's cloud covers three of its cells, (2, 2),
        // (2, 1) and (3, 2).
        const state = bossGame(vec2(1, 2), vec2(2, 1), {
            breath: BREATHS.skunk,
        })
        tick(state, { breath: true })
        expect(state.boss!.health).toBeCloseTo(BOSS_HEALTH - tap(BREATHS.skunk))
    })

    it("hits it from the player's own cell", () => {
        // The player overlapping its footprint, facing the wall: the line
        // has nowhere to go, but the boss is on the origin.
        const state = bossGame(vec2(8, 2), vec2(7, 1), {
            breath: BREATHS.owl,
            health: MAX_HEALTH,
        })
        tick(state, { breath: true })
        expect(state.boss!.health).toBeCloseTo(BOSS_HEALTH - tap(BREATHS.owl))
    })

    it("stops a line at its body", () => {
        const hits: BreathHit[] = []
        const breath = testBreath({
            shape: () => ({ kind: "line", range: 8 }),
            fire(hit) {
                hits.push(hit)
            },
        })
        const beyond = makeEnemy(6, 2)
        const state = makeState(arena, { x: 1, y: 2 }, [beyond], {
            breath,
            boss: makeBoss(3, 1),
        })
        state.boss!.moveProgress = 0
        state.players[0].breather.energy = 100
        tick(state, { breath: true })
        expect(hits[0].cells).toEqual([vec2(2, 2), vec2(3, 2)])
        expect(hits[0].enemies).toEqual([])
        expect(state.boss!.health).toBeCloseTo(BOSS_HEALTH - 10 / 25)
    })

    it("can't freeze it: it moves on after the Penguin's breath", () => {
        const state = bossGame(vec2(1, 2), vec2(2, 1), {
            breath: BREATHS.penguin,
            ready: true,
        })
        tick(state, { breath: true })
        expect(state.boss!.health).toBeCloseTo(
            BOSS_HEALTH - tap(BREATHS.penguin)
        )
        // No ice under it, as under any character.
        expect(state.ice[2][2]).toBe(false)
        // It came straight on for the player and caught it.
        expect(ticksUntilCaught(state)).toBeLessThan(TICK_RATE)
    })

    it("defeats it at 0 health: +500, gone for good, harmless", () => {
        const state = bossGame(vec2(1, 2), vec2(2, 1), { ready: true })
        state.boss!.health = tap(BREATHS.dragon)
        // Defeating it clears the stage (see "winning a boss level").
        expect(tick(state, { breath: true })).toBe("won")
        const boss = state.boss!
        expect(boss.defeated).toBe(true)
        expect(boss.health).toBe(0)
        expect(state.players[0].score).toBe(BOSS_DEFEAT_POINTS)
        // It doesn't move, and touching where it was doesn't catch.
        state.players[0].character.pos = vec2(2, 2)
        state.players[0].character.lastPos = vec2(1, 2)
        for (let i = 0; i < TICK_RATE * 2; i++) tick(state)
        expect(boss.pos).toEqual(vec2(2, 1))
        expect(state.players[0].health).toBe(1)
        // A breath no longer hits it.
        state.players[0].breather.cooldown = 0
        state.players[0].breather.energy = 100
        tick(state, { breath: true })
        expect(state.players[0].score).toBe(BOSS_DEFEAT_POINTS)
    })

    it("flashes for a moment after a hit", () => {
        const state = bossGame(vec2(1, 2), vec2(2, 1))
        tick(state, { breath: true })
        expect(state.boss!.flash).toBeGreaterThan(0)
        for (let i = 0; i < TICK_RATE / 5; i++) tick(state)
        expect(state.boss!.flash).toBe(0)
    })
})

describe("the boss moving", () => {
    // A 4x4 arena with a 1-wide corridor off it along row 2.
    const lair = textMap([
        "##########",
        "#    #####",
        "#        #",
        "#    #####",
        "#    #####",
        "##########",
        "#.########",
    ]).map

    it("moves at its speed", () => {
        const state = bossGame(vec2(1, 1), vec2(7, 1), { ready: true })
        for (let i = 0; i < TICK_RATE * 2; i++) tick(state)
        // Along the top: ready at once, then 1.5 cells/s, so 1 + 2 moves
        // in 2 s.
        expect(state.boss!.pos).toEqual(vec2(4, 1))
    })

    it("doesn't follow the player into a 1-wide corridor", () => {
        const state = bossGame(vec2(5, 2), vec2(1, 3), {
            map: lair,
            ready: true,
        })
        // Waiting at the mouth, it would breathe down the corridor.
        withoutBreath(state.boss!)
        for (let i = 0; i < TICK_RATE * 5; i++) {
            expect(tick(state)).toBeNull()
        }
        // It waits at the corridor's mouth, a cell from the player.
        expect(state.boss!.pos.x).toBe(3)
        expect(gap(state)).toBeCloseTo(1)
    })

    it("keeps out of burning cells, leaving the way it came in", () => {
        // The Dragon's fire stops at its body and burns (2, 2), under it.
        const state = bossGame(vec2(1, 2), vec2(2, 1), {
            ready: true,
            health: MAX_HEALTH,
        })
        tick(state, { breath: true })
        expect(state.tiles.map((t) => t.effect)).toEqual([BURNING])
        const burning = vec2(2, 2)
        // Out at once (it was ready), and kept out while it burns.
        expect(state.boss!.pos).toEqual(vec2(3, 1))
        while (state.tiles.length > 0) {
            expect(tick(state)).toBeNull()
            expect(inFootprint(state.boss!.pos, burning)).toBe(false)
        }
        expect(state.players[0].health).toBe(MAX_HEALTH)
    })

    it("isn't where a regrowing wall pushes the player", () => {
        // The player stands in an opened wall at (5, 1), come from (4, 1).
        // The boss treats the opened wall as a wall, so it parks on
        // (3, 1), its footprint over (4, 1), and waits.
        const open: TileEffect = { name: "test.open", opensWall: true }
        const { map } = textMap([
            "########",
            "#    ###",
            "#    ###",
            "########",
            "#.######",
        ])
        // Without its breath, which would hold it still to breathe at the
        // player pushed out next to it.
        const state = makeState(map, { x: 5, y: 1 }, [], {
            boss: withoutBreath(makeBoss(1, 1)),
            health: MAX_HEALTH,
        })
        state.cells[1][5] = Cell.none
        state.players[0].character.lastPos = vec2(4, 1)
        state.tiles.push({ pos: vec2(5, 1), effect: open, left: 5 })
        for (let i = 0; i < TICK_RATE * 4; i++) {
            expect(tick(state)).toBeNull()
        }
        expect(state.boss!.pos).toEqual(vec2(3, 1))
        while (state.tiles.length > 0) {
            expect(tick(state)).toBeNull()
        }
        // Not back to (4, 1), under the boss, but to the nearest open cell
        // clear of it. (The boss sets off after the player on that tick:
        // a fair chase from there.)
        expect(state.cells[1][5]).toBe(Cell.wall)
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        expect(state.boss!.lastPos).toEqual(vec2(3, 1))
        expect(state.players[0].health).toBe(MAX_HEALTH)
    })
})

describe("the boss catching", () => {
    it("catches the player as its footprint touches it", () => {
        const state = bossGame(vec2(1, 1), vec2(5, 1), { ready: true })
        ticksUntilCaught(state, none, TICK_RATE * 5)
        expect(state.players[0].health).toBe(0)
        // Within CATCH_DISTANCE of the square of its cell centres, but by
        // less than a tick's glide (1.5 / 60 cells).
        expect(gap(state)).toBeLessThanOrEqual(CATCH_DISTANCE + 1e-9)
        expect(gap(state)).toBeGreaterThan(CATCH_DISTANCE - 0.026)
    })

    it("catches the player head on where the sprites meet", () => {
        const state = bossGame(vec2(1, 2), vec2(6, 1), { ready: true })
        state.players[0].character.moveProgress = 1
        ticksUntilCaught(state, east, TICK_RATE * 5)
        const closing = (BOSS_SPEED + PLAYER_SPEED) / TICK_RATE
        expect(gap(state)).toBeLessThanOrEqual(CATCH_DISTANCE + 1e-9)
        expect(gap(state)).toBeGreaterThan(CATCH_DISTANCE - closing)
    })

    it("catches the player walking into it", () => {
        const state = bossGame(vec2(1, 2), vec2(3, 1), { speed: 0.01 })
        state.players[0].character.moveProgress = 1
        ticksUntilCaught(state, east)
        expect(state.boss!.pos).toEqual(vec2(3, 1))
        expect(gap(state)).toBeLessThanOrEqual(CATCH_DISTANCE + 1e-9)
        expect(gap(state)).toBeGreaterThan(
            CATCH_DISTANCE - PLAYER_SPEED / TICK_RATE
        )
    })

    it.each([
        ["right below it", vec2(3, 3)],
        ["right beside it", vec2(5, 2)],
        ["right beside it on the left", vec2(2, 1)],
        ["diagonally off its corner", vec2(5, 3)],
        ["diagonally off its other corner", vec2(2, 3)],
    ])("doesn't catch a player %s", (_where, player) => {
        // A boss at (3, 1) to (4, 2), too slow to move in time.
        const state = bossGame(player, vec2(3, 1), { speed: 0.01 })
        for (let i = 0; i < TICK_RATE; i++) expect(tick(state)).toBeNull()
    })

    it("doesn't catch a player walking past along its side", () => {
        const state = bossGame(vec2(1, 3), vec2(3, 1), { speed: 0.01 })
        state.players[0].character.moveProgress = 1
        for (let i = 0; i < TICK_RATE * 2; i++) {
            expect(tick(state, { held: east })).toBeNull()
        }
        expect(state.players[0].character.pos).toEqual(vec2(8, 3))
    })

    it("costs BOSS_DAMAGE and stays where it is, keeping its damage", () => {
        const state = bossGame(vec2(1, 2), vec2(2, 1), { health: MAX_HEALTH })
        tick(state, { breath: true })
        expect(state.boss!.health).toBeCloseTo(
            BOSS_HEALTH - tap(BREATHS.dragon)
        )
        state.boss!.pos = vec2(5, 2)
        state.boss!.lastPos = vec2(5, 2)
        state.players[0].character.pos = vec2(6, 3)
        state.players[0].character.lastPos = vec2(6, 3)
        expect(tick(state)).toBeNull()
        expect(state.players[0].health).toBe(MAX_HEALTH - BOSS_DAMAGE)
        expect(state.boss!.pos).toEqual(vec2(5, 2))
        expect(state.boss!.health).toBeCloseTo(
            BOSS_HEALTH - tap(BREATHS.dragon)
        )
        // Knocked away from its footprint's centre, (5.5, 2.5): level on
        // both axes, so along x.
        expect(state.players[0].character.pos).toEqual(vec2(7, 3))
        expect(state.players[0].invulnerableFor).toBeGreaterThan(0)
    })

    it("passes through a player invulnerable after a hit", () => {
        const state = bossGame(vec2(6, 3), vec2(5, 2), { health: MAX_HEALTH })
        state.boss!.speed = 0
        expect(tick(state)).toBeNull()
        expect(state.players[0].health).toBe(MAX_HEALTH - BOSS_DAMAGE)
        // Back onto it: no second hit while invulnerable.
        state.players[0].character.pos = vec2(6, 3)
        state.players[0].character.lastPos = vec2(6, 3)
        state.players[0].character.moveProgress = 1
        for (let i = 0; i < TICK_RATE; i++) expect(tick(state)).toBeNull()
        expect(state.players[0].health).toBe(MAX_HEALTH - BOSS_DAMAGE)
    })

    it("hurts harder than an enemy touching on the same tick", () => {
        const state = bossGame(vec2(6, 3), vec2(5, 2), { health: MAX_HEALTH })
        state.enemies.push(makeEnemy(6, 3))
        state.spawns = { ...state.spawns, enemies: [vec2(6, 3)] }
        expect(tick(state)).toBeNull()
        expect(state.players[0].health).toBe(MAX_HEALTH - BOSS_DAMAGE)
    })
})

describe("winning a boss level", () => {
    // The arena with a single dot at (8, 4).
    const oneDot = textMap([
        "##########",
        "#        #",
        "#        #",
        "#        #",
        "#       .#",
        "##########",
    ]).map

    it("isn't won by eating the last dot while the boss is about", () => {
        const state = bossGame(vec2(7, 4), vec2(2, 1), { map: oneDot })
        state.players[0].character.moveProgress = 1
        expect(tick(state, { held: east })).toBeNull()
        expect(state.cells[4][8]).toBe(Cell.none)
        expect(tick(state)).toBeNull()
    })

    it("is won the moment the boss is defeated, with dots left", () => {
        const state = bossGame(vec2(1, 2), vec2(2, 1), { breath: BREATHS.owl })
        state.boss!.health = tap(BREATHS.owl)
        expect(tick(state, { breath: true })).toBe("won")
        expect(state.boss!.defeated).toBe(true)
        // The pocket's dot is still there: dots don't matter.
        expect(state.cells[6][1]).toBe(Cell.dot)
    })

    it("is won by the last hit even if the boss catches the player on that tick", () => {
        const state = bossGame(vec2(3, 2), vec2(2, 1), {
            breath: BREATHS.owl,
        })
        state.boss!.health = tap(BREATHS.owl)
        expect(tick(state, { breath: true })).toBe("won")
        expect(state.players[0].health).toBe(1)
    })

    it("would be caught on that tick without the last hit", () => {
        const state = bossGame(vec2(3, 2), vec2(2, 1), { map: bare })
        expect(tick(state)).toBe("dead")
    })
})

describe("bossHud", () => {
    it("is the boss's health, or null without a boss", () => {
        const state = bossGame(vec2(1, 2), vec2(2, 1))
        state.boss!.health = 7
        expect(bossHud(state)).toEqual({ health: 7, max: BOSS_HEALTH })
        expect(bossHud(makeState(arena, vec2(1, 1)))).toBeNull()
    })
})

describe("energy on a boss level", () => {
    // KDA-267: the old refill once the dots were gone is dropped (regrowing
    // dots, KDA-269, keep the meters fed instead).
    it("doesn't refill by itself once the dots are gone", () => {
        const state = bossGame(vec2(1, 4), vec2(7, 1), {
            map: bare,
            speed: 0.01,
        })
        state.players[0].breather.energy = 0
        for (let i = 0; i < TICK_RATE; i++) tick(state)
        expect(state.players[0].breather.energy).toBe(0)
    })

    it("fills from dots as usual", () => {
        const state = bossGame(vec2(7, 4), vec2(2, 1), {
            map: textMap([
                "##########",
                "#        #",
                "#        #",
                "#        #",
                "#       .#",
                "##########",
            ]).map,
        })
        state.players[0].breather.energy = 0
        state.players[0].character.moveProgress = 1
        tick(state, { held: east })
        expect(state.players[0].breather.energy).toBe(DOT_ENERGY)
        expect(state.players[0].score).toBe(DOT_POINTS)
    })
})
