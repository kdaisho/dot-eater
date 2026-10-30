import { describe, expect, it } from "vite-plus/test"
import { addStatus } from "./breath"
import {
    AiType,
    BLINK_RATE,
    Cell,
    ENEMY_DAMAGE,
    MAX_HEALTH,
    PLAYER_RESPAWN_DELAY,
    TICK_RATE,
} from "./constants"
import {
    HURT_INVULNERABLE_TICKS,
    hurtPlayer,
    IDLE,
    knockBack,
    playerVisible,
    step,
    type GameState,
    type Mode,
} from "./game"
import {
    drawn,
    fixedRandom,
    makeEnemy,
    makeState,
    textMap,
} from "./test/helpers"
import { CATCH_DOTS } from "./versus"
import { vec2, type Vec2 } from "./vec2"

const east = vec2(1, 0)
const west = vec2(-1, 0)
const south = vec2(0, 1)

// An open 5x3 room with a dot in its bottom right corner and the player in
// the middle, at full health.
const room = textMap(["#######", "#     #", "#     #", "#    .#", "#######"])

function roomState(mode: Mode = "solo", at: Vec2 = vec2(3, 2)): GameState {
    const players = mode === "solo" ? [at] : [at, vec2(1, 1)]
    const state = makeState(room.map, players, [], { mode })
    for (const p of state.players) {
        p.health = MAX_HEALTH
        p.character.moveProgress = 1
    }
    return state
}

describe("knockBack", () => {
    it("moves a player at rest one cell, gliding in like a normal move", () => {
        const state = roomState()
        const { character } = state.players[0]
        expect(knockBack(state, state.players[0], east)).toBe(true)
        expect(character.pos).toEqual(vec2(4, 2))
        expect(character.lastPos).toEqual(vec2(3, 2))
        expect(character.moveProgress).toBe(0)
        // Drawn where it was: it glides from there.
        expect(drawn(state, character)).toEqual(vec2(3, 2))
    })

    it("keeps the player's facing", () => {
        const state = roomState()
        state.players[0].breather.facing = vec2(-1, 0)
        knockBack(state, state.players[0], east)
        expect(state.players[0].breather.facing).toEqual(vec2(-1, 0))
    })

    it("stays put against a wall", () => {
        const state = roomState("solo", vec2(1, 1))
        const { character } = state.players[0]
        expect(knockBack(state, state.players[0], west)).toBe(false)
        expect(character.pos).toEqual(vec2(1, 1))
        expect(character.moveProgress).toBe(1)
    })

    it("goes onto an enemy's cell, a frozen one's too", () => {
        const enemy = makeEnemy(4, 2)
        const state = makeState(room.map, vec2(3, 2), [enemy])
        addStatus(enemy, { name: "test.frozen", holds: true }, 1)
        expect(knockBack(state, state.players[0], east)).toBe(true)
        expect(state.players[0].character.pos).toEqual(vec2(4, 2))
    })

    it("eats a dot where it lands", () => {
        const state = roomState("solo", vec2(4, 3))
        const player = state.players[0]
        knockBack(state, player, east)
        expect(state.cells[3][5]).toBe(Cell.none)
        expect(player.dots).toBe(1)
        expect(player.eatenAt).toEqual(vec2(5, 3))
        expect(state.events).toContainEqual({
            type: "dotEaten",
            player: 0,
            at: vec2(5, 3),
        })
    })

    it("turns a glide back the way it came from where it is drawn", () => {
        const state = roomState()
        const { character } = state.players[0]
        // Three quarters of the way from (2, 2) to (3, 2).
        character.lastPos = vec2(2, 2)
        character.moveProgress = 0.75
        const before = drawn(state, character)
        expect(knockBack(state, state.players[0], west)).toBe(true)
        expect(character.pos).toEqual(vec2(2, 2))
        expect(character.lastPos).toEqual(vec2(3, 2))
        expect(drawn(state, character)).toEqual(before)
    })

    it("pushes a player less than halfway out of a cell back from that cell", () => {
        const state = roomState()
        const { character } = state.players[0]
        // A quarter of the way from (2, 2) to (3, 2).
        character.lastPos = vec2(2, 2)
        character.moveProgress = 0.25
        expect(knockBack(state, state.players[0], west)).toBe(true)
        expect(character.lastPos).toEqual(vec2(2, 2))
        expect(character.pos).toEqual(vec2(1, 2))
        expect(character.moveProgress).toBe(0)
    })

    it("pushes a player just starting a move on from the cell it is leaving", () => {
        const state = roomState()
        const { character } = state.players[0]
        character.lastPos = vec2(2, 2)
        character.moveProgress = 0.25
        expect(knockBack(state, state.players[0], south)).toBe(true)
        expect(character.lastPos).toEqual(vec2(2, 2))
        expect(character.pos).toEqual(vec2(2, 3))
        expect(character.moveProgress).toBe(0)
    })

    it("lets a glide on the way it is going carry the player there", () => {
        const state = roomState()
        const { character } = state.players[0]
        character.lastPos = vec2(2, 2)
        character.moveProgress = 0.25
        expect(knockBack(state, state.players[0], east)).toBe(true)
        expect(character.pos).toEqual(vec2(3, 2))
        expect(character.lastPos).toEqual(vec2(2, 2))
        expect(character.moveProgress).toBe(0.25)
    })

    describe("with a wall behind the cell it is leaving", () => {
        // The player glides east from (1, 1), a wall west of it, and is
        // knocked west.
        function leaving(progress: number) {
            const { map } = textMap(["######", "#    #", "######"])
            const state = makeState(map, vec2(2, 1))
            const { character } = state.players[0]
            character.lastPos = vec2(1, 1)
            character.moveProgress = progress
            return { state, character }
        }

        it("turns back from more than halfway", () => {
            const { state, character } = leaving(0.6)
            expect(knockBack(state, state.players[0], west)).toBe(true)
            expect(character.pos).toEqual(vec2(1, 1))
            expect(character.moveProgress).toBeCloseTo(0.4)
        })

        // Regression: less than halfway, the cell past (1, 1) is a wall,
        // so it stayed put and glided on into whatever hit it.
        it("turns back from less than halfway too, from where it is drawn", () => {
            const { state, character } = leaving(0.4)
            const before = drawn(state, character)
            expect(knockBack(state, state.players[0], west)).toBe(true)
            expect(character.pos).toEqual(vec2(1, 1))
            expect(character.lastPos).toEqual(vec2(2, 1))
            expect(drawn(state, character)).toEqual(before)
        })
    })

    it("goes through a wrap tunnel", () => {
        const { map } = textMap(["###", "   ", "###"])
        const state = makeState(map, vec2(0, 1))
        expect(knockBack(state, state.players[0], west)).toBe(true)
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
    })

    it("doesn't move a player out of play", () => {
        const state = roomState("versus")
        state.players[0].out = true
        expect(knockBack(state, state.players[0], east)).toBe(false)
    })
})

describe("knockBack with players bumping", () => {
    // Player 1 at (3, 2) and player 2 at `p2`, both at rest, in versus.
    function pair(bump: boolean, p2: Vec2 = vec2(4, 2)) {
        const state = makeState(room.map, [vec2(3, 2), p2], [], {
            mode: "versus",
            health: MAX_HEALTH,
            playersBump: bump,
        })
        for (const p of state.players) p.character.moveProgress = 1
        return state
    }

    it("treats the other player's cell as a wall", () => {
        const state = pair(true)
        const [p1, p2] = state.players
        expect(knockBack(state, p1, east)).toBe(false)
        expect(p1.character.pos).toEqual(vec2(3, 2))
        expect(p2.character.pos).toEqual(vec2(4, 2))
    })

    it("passes through the other player with Bump off", () => {
        const state = pair(false)
        expect(knockBack(state, state.players[0], east)).toBe(true)
        expect(state.players[0].character.pos).toEqual(vec2(4, 2))
    })

    it("ignores a player out of play", () => {
        const state = pair(true)
        state.players[1].out = true
        expect(knockBack(state, state.players[0], east)).toBe(true)
    })

    it("turns back into the cell it is leaving rather than onto the other", () => {
        // Player 1 a third of the way from (3, 2) to (4, 2); player 2 on
        // (3, 3), just past the cell it is leaving.
        const state = pair(true, vec2(3, 3))
        const [p1, p2] = state.players
        p1.character.pos = vec2(4, 2)
        p1.character.lastPos = vec2(3, 2)
        p1.character.moveProgress = 0.3
        expect(knockBack(state, p1, south)).toBe(true)
        expect(p1.character.pos).toEqual(vec2(3, 2))
        expect(p1.character.pos).not.toEqual(p2.character.pos)
    })

    it("never ends up on the other player's cell when hurt", () => {
        // Hit from the west with player 2 right behind to the east.
        const state = pair(true)
        const [p1, p2] = state.players
        expect(hurtPlayer(state, p1, ENEMY_DAMAGE, vec2(2.5, 2))).toBe(true)
        expect(p1.health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
        expect(p1.character.pos).toEqual(vec2(3, 2))
        expect(p2.character.pos).toEqual(vec2(4, 2))
    })
})

describe("hurtPlayer", () => {
    it("costs the damage and knocks the player away along the stronger axis", () => {
        const state = roomState()
        const player = state.players[0]
        // Up and to the left, mostly left: pushed right.
        expect(hurtPlayer(state, player, ENEMY_DAMAGE, vec2(2.4, 1.8))).toBe(
            true
        )
        expect(player.health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
        expect(player.character.pos).toEqual(vec2(4, 2))
        // Mostly above: pushed down.
        player.invulnerableFor = 0
        player.character.moveProgress = 1
        hurtPlayer(state, player, ENEMY_DAMAGE, vec2(3.8, 1.4))
        expect(player.character.pos).toEqual(vec2(4, 3))
    })

    it("reports a hurt event on the player's cell before the knockback", () => {
        const state = roomState()
        hurtPlayer(state, state.players[0], 30, vec2(2.5, 2))
        expect(state.events).toEqual([
            { type: "hurt", player: 0, at: vec2(3, 2), damage: 30 },
        ])
    })

    it("still hurts a player with its back to a wall, which stays put", () => {
        const state = roomState("solo", vec2(1, 2))
        const player = state.players[0]
        hurtPlayer(state, player, ENEMY_DAMAGE, vec2(1.5, 2))
        expect(player.health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
        expect(player.character.pos).toEqual(vec2(1, 2))
        expect(player.invulnerableFor).toBe(HURT_INVULNERABLE_TICKS)
    })

    it("backs away from its facing when drawn right on what hit it", () => {
        const state = roomState()
        state.players[0].breather.facing = vec2(0, 1)
        hurtPlayer(state, state.players[0], ENEMY_DAMAGE, vec2(3, 2))
        expect(state.players[0].character.pos).toEqual(vec2(3, 1))
    })

    it("makes the player invulnerable for HURT_INVULNERABLE_SECONDS", () => {
        const state = roomState()
        const player = state.players[0]
        hurtPlayer(state, player, ENEMY_DAMAGE, vec2(2.5, 2))
        expect(HURT_INVULNERABLE_TICKS).toBe(1.5 * TICK_RATE)
        expect(player.invulnerableFor).toBe(HURT_INVULNERABLE_TICKS)
        state.events = []
        expect(hurtPlayer(state, player, ENEMY_DAMAGE, vec2(3.5, 2))).toBe(
            false
        )
        expect(player.health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
        expect(state.events).toEqual([])
    })

    it("doesn't hurt a player out of play", () => {
        const state = roomState("versus")
        state.players[1].out = true
        expect(hurtPlayer(state, state.players[1], 10, vec2(0, 0))).toBe(false)
        expect(state.players[1].health).toBe(MAX_HEALTH)
    })

    it("knocks a solo player out at 0, where it stands", () => {
        const state = roomState()
        const player = state.players[0]
        player.health = ENEMY_DAMAGE
        hurtPlayer(state, player, ENEMY_DAMAGE, vec2(2.5, 2))
        expect(player.health).toBe(0)
        expect(player.character.pos).toEqual(vec2(3, 2))
        expect(player.out).toBe(false)
        // A knockout reports a catch, not a hurt.
        expect(state.events).toEqual([
            {
                type: "playerCaught",
                player: 0,
                at: vec2(3, 2),
                outForGood: true,
            },
        ])
        // Already knocked out: nothing more.
        expect(hurtPlayer(state, player, 1, vec2(2.5, 2))).toBe(false)
    })

    it("never takes health below 0", () => {
        const state = roomState()
        state.players[0].health = 10
        hurtPlayer(state, state.players[0], ENEMY_DAMAGE, vec2(2.5, 2))
        expect(state.players[0].health).toBe(0)
    })

    it("takes a co-op player out for good at 0", () => {
        const state = roomState("coop")
        const [p1, p2] = state.players
        p1.health = 5
        hurtPlayer(state, p1, ENEMY_DAMAGE, vec2(2.5, 2))
        expect(p1.out).toBe(true)
        expect(p1.respawnIn).toBeNull()
        expect(p2.out).toBe(false)
        expect(state.events).toContainEqual(
            expect.objectContaining({ type: "playerCaught", outForGood: true })
        )
    })

    it("costs a versus player its dots and takes it out for a while at 0", () => {
        const state = roomState("versus")
        const p1 = state.players[0]
        p1.dots = CATCH_DOTS + 2
        p1.health = 5
        hurtPlayer(state, p1, ENEMY_DAMAGE, vec2(2.5, 2))
        expect(p1.dots).toBe(2)
        expect(p1.out).toBe(true)
        expect(p1.respawnIn).toBe(PLAYER_RESPAWN_DELAY)
        expect(state.events).toContainEqual(
            expect.objectContaining({ type: "playerCaught", outForGood: false })
        )
    })
})

describe("a knockback onto the last dot", () => {
    // The only dot is at (1, 1). Player 1 rests at (2, 1); an enemy
    // halfway from (3, 1) into its cell hits it on the first tick and
    // knocks it west, onto the dot.
    function lastDotHit(mode: Mode) {
        const { map } = textMap(["#####", "#.  #", "#####"])
        const players =
            mode === "solo" ? [vec2(2, 1)] : [vec2(2, 1), vec2(3, 1)]
        const enemy = makeEnemy(2, 1, AiType.random, { x: 3, y: 1 })
        enemy.moveProgress = 0.5
        const state = makeState(map, players, [enemy], {
            mode,
            health: MAX_HEALTH,
        })
        state.players[0].character.moveProgress = 1
        // Player 2 is out of the way.
        if (mode !== "solo") state.players[1].out = true
        const outcome = step(state, 1 / TICK_RATE, IDLE, fixedRandom(0))
        return { state, outcome }
    }

    // Regression: clearing was checked before the hits, so the stage was
    // only won on the next tick.
    it.each(["solo", "coop", "versus"] as const)(
        "wins on that tick (%s)",
        (mode) => {
            const { state, outcome } = lastDotHit(mode)
            expect(state.players[0].health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
            expect(state.players[0].character.pos).toEqual(vec2(1, 1))
            expect(state.cells[1][1]).toBe(Cell.none)
            expect(outcome).toBe("won")
        }
    )
})

describe("playerVisible", () => {
    it("blinks BLINK_RATE times a second while invulnerable, starting on", () => {
        const state = roomState()
        const player = state.players[0]
        expect(playerVisible(player)).toBe(true)
        hurtPlayer(state, player, ENEMY_DAMAGE, vec2(2.5, 2))
        const ticksPerPhase = TICK_RATE / (BLINK_RATE * 2)
        const shown = (elapsed: number) => {
            player.invulnerableFor = HURT_INVULNERABLE_TICKS - elapsed
            return playerVisible(player)
        }
        expect(shown(0)).toBe(true)
        expect(shown(Math.ceil(ticksPerPhase))).toBe(false)
        expect(shown(Math.ceil(ticksPerPhase * 2))).toBe(true)
        player.invulnerableFor = 0
        expect(playerVisible(player)).toBe(true)
    })

    it("hides a player out of play", () => {
        const state = roomState("versus")
        state.players[1].out = true
        expect(playerVisible(state.players[1])).toBe(false)
    })
})
