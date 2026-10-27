import { describe, expect, it } from "vite-plus/test"
import { energyHud } from "../breath"
import { AiType, TICK_RATE } from "../constants"
import type { Character } from "../character"
import { createGameState, step, type GameState, type MoveInput } from "../game"
import {
    fixedRandom,
    makeEnemy,
    makeState,
    OLD_LEVEL,
    textMap,
} from "../test/helpers"
import { vec2, type Vec2 } from "../vec2"
import { skunk } from "./skunk"

// The Skunk's smelly breath end to end through step().

const TICK = 1 / TICK_RATE
const none = vec2(0, 0)
const CLOUD_TICKS = TICK_RATE * skunk.duration

function tick(state: GameState, breath = false, held?: Vec2) {
    const move: MoveInput = {
        held: held ? [held] : [],
        pressed: none,
        breath,
    }
    return step(state, TICK, move, fixedRandom(0))
}

// A 5x5 room with the player in the middle, and a dot shut away in a wall
// pocket (bottom row) so the game isn't won.
const room = textMap([
    "#######",
    "#     #",
    "#     #",
    "#     #",
    "#     #",
    "#     #",
    "#######",
    "#.#####",
]).map
const centre = { x: 3, y: 3 }

// A dead-end corridor with the player at its closed end.
const corridor = textMap([
    "#########",
    "#       #",
    "#########",
    "#.#######",
]).map

function skunkState(
    map: Parameters<typeof makeState>[0],
    player: { x: number; y: number },
    enemies: Character[] = []
) {
    const state = makeState(map, player, enemies, { breath: skunk })
    state.players[0].breather.energy = skunk.maxEnergy
    return state
}

const cloud = (state: GameState) =>
    state.tiles
        .filter((t) => t.effect.name === "skunk.stink")
        .map((t) => `${t.pos.x},${t.pos.y}`)
        .sort()

// The cells showing a 💨.
const puffs = (state: GameState) =>
    state.tiles
        .filter((t) => t.effect.look?.emoji === "💨")
        .map((t) => `${t.pos.x},${t.pos.y}`)
        .sort()

const inCloud = (state: GameState, who: Character) =>
    cloud(state).includes(`${who.pos.x},${who.pos.y}`)

describe("the Skunk's smelly breath", () => {
    it("covers the 3x3 square around the player, its own cell too, for 5 s", () => {
        const state = skunkState(room, centre)
        tick(state, true)
        const square = [2, 3, 4].flatMap((y) =>
            [2, 3, 4].map((x) => `${x},${y}`)
        )
        expect(cloud(state)).toEqual(square.sort())
        expect(state.tiles.every((t) => t.effect.blocksEnemies)).toBe(true)
        for (let i = 1; i < CLOUD_TICKS; i++) tick(state)
        expect(cloud(state)).toHaveLength(9)
        tick(state)
        expect(state.tiles).toEqual([])
    })

    it("doesn't leak past walls", () => {
        const state = skunkState(corridor, { x: 1, y: 1 })
        tick(state, true)
        expect(cloud(state)).toEqual(["1,1", "2,1"])
    })

    it("stays where it was breathed when the player walks off", () => {
        const state = skunkState(corridor, { x: 1, y: 1 })
        state.players[0].character.moveProgress = 1
        tick(state, true)
        for (let i = 0; i < TICK_RATE; i++) tick(state, false, vec2(1, 0))
        expect(state.players[0].character.pos.x).toBeGreaterThan(3)
        expect(cloud(state)).toEqual(["1,1", "2,1"])
    })

    it("shows a green haze, with a 💨 on the player's cell", () => {
        const state = skunkState(room, centre)
        tick(state, true)
        for (const t of state.tiles.filter((t) => t.effect.look?.color)) {
            expect(t.effect.look?.emoji).toBeUndefined()
        }
        expect(state.tiles.filter((t) => t.effect.look?.color)).toHaveLength(9)
        expect(puffs(state)).toEqual(["3,3"])
    })

    // Regression: the second cloud's centre was already stink from the
    // first, so it was refreshed without its 💨.
    it("shows a 💨 on the centre of a cloud breathed over another", () => {
        const state = skunkState(corridor, { x: 3, y: 1 })
        state.players[0].character.moveProgress = 1
        tick(state, true)
        tick(state, false, vec2(1, 0))
        expect(state.players[0].character.pos).toEqual(vec2(4, 1))
        while (state.players[0].breather.cooldown > 0) tick(state)
        tick(state, true)
        expect(puffs(state)).toContain("4,1")
        // Still one haze and one block per cell, the overlap refreshed.
        expect(cloud(state)).toEqual(["2,1", "3,1", "4,1", "5,1"])
        const at3 = state.tiles.find(
            (t) => t.effect.name === "skunk.stink" && t.pos.x === 3
        )
        expect(at3?.left).toBeCloseTo(skunk.duration)
        expect(state.tiles.every((t) => t.effect.blocksEnemies)).toBe(true)
    })

    it("keeps a chaser out, circling the cloud's edge", () => {
        // A 9x9 room: the cloud is the 3x3 in the middle, and its edge is
        // the ring of cells just outside it (2 from the player either way).
        const { map } = textMap([
            "###########",
            "#         #",
            "#         #",
            "#         #",
            "#         #",
            "#         #",
            "#         #",
            "#         #",
            "#         #",
            "#         #",
            "###########",
            "#.#########",
        ])
        const enemy = makeEnemy(1, 1, AiType.chase)
        const state = skunkState(map, { x: 5, y: 5 }, [enemy])
        tick(state, true)
        const ring = () =>
            Math.max(Math.abs(enemy.pos.x - 5), Math.abs(enemy.pos.y - 5))
        let reached = false
        for (let i = 1; i < CLOUD_TICKS; i++) {
            expect(tick(state)).toBeNull()
            expect(inCloud(state, enemy)).toBe(false)
            // Once at the edge it stays by it, rather than wandering off: it
            // can't turn back, so where going on along the edge and stepping
            // away tie it may step away, then comes straight back.
            if (reached) expect(ring()).toBeLessThanOrEqual(3)
            reached ||= ring() === 2
        }
        expect(reached).toBe(true)
        // The cloud gone, it comes for the player.
        tick(state)
        expect(state.tiles).toEqual([])
        let caught = false
        for (let i = 0; i < TICK_RATE * 2 && !caught; i++) {
            caught = tick(state) === "dead"
        }
        expect(caught).toBe(true)
    })

    it("sends an enemy inside it out the shortest way, away from the player", () => {
        // Next to the player, about to step onto it.
        const enemy = makeEnemy(4, 3, AiType.chase, { x: 5, y: 3 })
        enemy.moveProgress = 1
        const state = skunkState(room, centre, [enemy])
        expect(tick(state, true)).toBeNull()
        expect(enemy.pos).toEqual(vec2(5, 3))
        for (let i = 1; i < CLOUD_TICKS; i++) {
            expect(tick(state)).toBeNull()
            expect(inCloud(state, enemy)).toBe(false)
        }
    })

    it("keeps a phantom out too", () => {
        // A phantom ignores walls: it starts in the wall above the room.
        const enemy = makeEnemy(3, 0, AiType.phantom)
        const state = skunkState(room, centre, [enemy])
        tick(state, true)
        let closest = Infinity
        for (let i = 1; i < CLOUD_TICKS; i++) {
            expect(tick(state)).toBeNull()
            expect(inCloud(state, enemy)).toBe(false)
            closest = Math.min(
                closest,
                Math.abs(enemy.pos.x - 3) + Math.abs(enemy.pos.y - 3)
            )
        }
        // It still came up to the edge.
        expect(closest).toBe(2)
    })

    // An enemy already on the player's cell is mid-glide into the player:
    // it can't turn until its step ends, and by then it has touched the
    // player. The cloud doesn't undo a catch that was already under way.
    it("doesn't save the player from an enemy already on its cell", () => {
        const enemy = makeEnemy(3, 3, AiType.chase, { x: 4, y: 3 })
        // Drawn 0.7 cells away, just outside catching distance.
        enemy.moveProgress = 0.3
        const state = skunkState(room, centre, [enemy])
        let outcome = tick(state, true)
        expect(cloud(state)).toHaveLength(9)
        for (let i = 0; i < 10 && outcome === null; i++) outcome = tick(state)
        expect(outcome).toBe("dead")
    })
})

describe("the Skunk's stats", () => {
    it("has a 150 meter: three breaths from full", () => {
        expect(
            createGameState(OLD_LEVEL, "skunk").players[0].breather.breath
        ).toBe(skunk)
        const state = skunkState(room, centre)
        expect(energyHud(state).max).toBe(150)
        for (const left of [100, 50, 0]) {
            tick(state, true)
            expect(state.players[0].breather.energy).toBe(left)
            for (let i = 0; i < TICK_RATE * skunk.cooldown; i++) tick(state)
        }
    })

    it("fills the meter up to 150 from dots", () => {
        const { map } = textMap(["#####", "#  .#", "#####", "#.###"])
        const state = skunkState(map, { x: 1, y: 1 })
        state.players[0].breather.energy = 148
        state.players[0].character.moveProgress = 1
        for (let i = 0; i < TICK_RATE; i++) tick(state, false, vec2(1, 0))
        expect(state.players[0].character.pos).toEqual(vec2(3, 1))
        expect(state.players[0].breather.energy).toBe(150)
    })

    it("does nothing without enough energy", () => {
        const enemy = makeEnemy(4, 3, AiType.chase, { x: 5, y: 3 })
        enemy.moveProgress = 1
        const state = skunkState(room, centre, [enemy])
        state.players[0].breather.energy = skunk.cost - 5
        tick(state, true)
        expect(state.tiles).toEqual([])
        expect(state.players[0].breather.energy).toBe(skunk.cost - 5)
        expect(state.players[0].breather.cooldown).toBe(0)
        // The enemy steps onto the player as if nothing happened.
        expect(enemy.pos).toEqual(vec2(3, 3))
    })
})
