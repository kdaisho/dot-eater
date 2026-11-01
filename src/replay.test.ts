import { describe, expect, it } from "vite-plus/test"
import { TICK_MS } from "./constants"
import {
    playerCount,
    startLevel,
    update,
    type Mode,
    type Screen,
    type TickInput,
} from "./flow"
import { directionStep, type DirectionAction } from "./input"
import { stages as levels } from "./levels"
import { emptyProgress } from "./progress"
import {
    checksumOf,
    createRecorder,
    createReplayer,
    recordTick,
    seededRandom,
    shouldRecord,
    tickCount,
    tickInputOf,
    verify,
    type Checksum,
    type Recording,
} from "./replay"
import { vec2 } from "./vec2"

const DIRECTIONS: readonly DirectionAction[] = ["up", "down", "left", "right"]
const END_KINDS = ["stageClear", "gameOver", "roundResult", "matchResult"]

// A made-up player: each holds a direction for 20 ticks, pressing it on the
// first, then turns a direction picked by `script`'s own seeded random;
// player i breathes every 45 ticks. Player 1 presses pause on the ticks in
// `pauses`.
function scripted(tick: number, pauses: ReadonlySet<number>): TickInput {
    const random = seededRandom(Math.floor(tick / 20) + 1)
    const dirs = [0, 1].map((i) => DIRECTIONS[Math.floor(random() * 4) ^ i])
    const pressedNow = tick % 20 === 0
    const breathNow = (player: number) => tick % 45 === player * 7
    return {
        wasPressed: (action, player = 0) =>
            (action === "pause" && player === 0 && pauses.has(tick)) ||
            (action === "breath" && breathNow(player)) ||
            (pressedNow && action === dirs[player]),
        move: (player = 0) => ({
            held: [directionStep(dirs[player])],
            pressed: pressedNow ? directionStep(dirs[player]) : vec2(0, 0),
            breath: breathNow(player),
        }),
    }
}

// Play stage `level` live with scripted input until an end screen or
// `max` ticks, recording it as main does. Returns the recording, the
// checksum after each recorded tick and how many ticks were played.
function playRun(
    level: number,
    mode: Mode,
    seed: number,
    { max = 2000, pauses = new Set<number>() } = {}
) {
    const start = startLevel(
        levels,
        level,
        mode === "solo" ? ["dragon"] : ["dragon", "penguin"],
        mode
    )
    if (start.kind !== "playing") throw new Error("Not playing")
    const deps = {
        levels,
        progress: emptyProgress(),
        dt: TICK_MS / 1000,
        random: seededRandom(seed),
    }
    const recorder = createRecorder(start, seed)
    const seen: Checksum[] = []
    let screen: Screen = start
    let played = 0
    while (played < max && !END_KINDS.includes(screen.kind)) {
        const input = scripted(played, pauses)
        const next = update(screen, input, deps)
        if (shouldRecord(screen, next)) {
            recorder.add(input)
            seen.push(checksumOf(next))
        }
        screen = next
        played++
    }
    return { recording: recorder.finish(screen), seen, played, screen }
}

describe("seededRandom", () => {
    it("gives the same numbers for the same seed", () => {
        const a = seededRandom(42)
        const b = seededRandom(42)
        const first = Array.from({ length: 100 }, a)
        expect(Array.from({ length: 100 }, b)).toEqual(first)
        expect(first.every((n) => n >= 0 && n < 1)).toBe(true)
        expect(new Set(first).size).toBe(100)
    })

    it("gives different numbers for different seeds", () => {
        expect(seededRandom(1)()).not.toBe(seededRandom(2)())
    })
})

describe("recordTick and tickInputOf", () => {
    it("leaves out what's empty, so an idle player is {}", () => {
        const idle: TickInput = {
            wasPressed: () => false,
            move: () => ({ held: [], pressed: vec2(0, 0) }),
        }
        expect(recordTick(idle, 2)).toEqual([{}, {}])
    })

    it("round-trips a tick, keeping the held order and dropping pause", () => {
        const input: TickInput = {
            wasPressed: (action, player = 0) =>
                player === 1 &&
                ["left", "breath", "confirm", "pause"].includes(action),
            move: (player = 0) =>
                player === 0
                    ? { held: [vec2(0, -1), vec2(1, 0)], pressed: vec2(0, 0) }
                    : { held: [], pressed: vec2(-1, 0), breath: true },
        }
        const tick = recordTick(input, 2)
        expect(tick).toEqual([{ h: "ur" }, { p: "l", a: "lbc" }])
        const replayed = tickInputOf(tick)
        expect(replayed.move()).toEqual({
            held: [vec2(0, -1), vec2(1, 0)],
            pressed: vec2(0, 0),
            breath: false,
        })
        expect(replayed.move(1)).toEqual({
            held: [],
            pressed: vec2(-1, 0),
            breath: true,
        })
        expect(replayed.wasPressed("confirm", 1)).toBe(true)
        expect(replayed.wasPressed("pause", 1)).toBe(false)
        expect(replayed.wasPressed("confirm")).toBe(false)
    })

    it("hands out vectors of its own, so changing one changes no other tick", () => {
        // The game keeps the steps it's given (a press is buffered), so a
        // vector shared between ticks could be changed under a later one.
        const tick = recordTick(
            {
                wasPressed: () => false,
                move: () => ({ held: [vec2(-1, 0)], pressed: vec2(-1, 0) }),
            },
            1
        )
        const first = tickInputOf(tick).move()
        first.pressed.x = 5
        first.held[0].y = 5
        expect(tickInputOf(tick).move()).toEqual({
            held: [vec2(-1, 0)],
            pressed: vec2(-1, 0),
            breath: false,
        })
        // Nor within a tick: each call is fresh.
        const replayed = tickInputOf(tick)
        expect(replayed.move().pressed).not.toBe(replayed.move().pressed)
    })
})

describe("recording and replaying", () => {
    const solo = playRun(0, "solo", 1234)

    it("plays a run long enough to matter", () => {
        // Past a few snapshots, eating dots, to the end screen of a lost
        // game (so the ending outro is in it too).
        expect(solo.screen.kind).toBe("gameOver")
        expect(solo.recording.final.kind).toBe("gameOver")
        expect(solo.seen.length).toBeGreaterThan(900)
        expect(solo.recording.final.scores[0]).toBeGreaterThan(0)
        expect(tickCount(solo.recording)).toBe(solo.seen.length)
    })

    it("stores runs of the same input once", () => {
        expect(solo.recording.ticks.length).toBeLessThan(solo.seen.length / 5)
    })

    it("replays every tick as it was played", () => {
        const replayer = createReplayer(solo.recording, levels)
        expect(replayer.length).toBe(solo.seen.length)
        expect(checksumOf(replayer.at(0)).ticks).toBe(0)
        solo.seen.forEach((checksum, i) => {
            expect(checksumOf(replayer.at(i + 1))).toEqual(checksum)
        })
        expect(verify(solo.recording, levels)).toBe(true)
    })

    it("holds the end screen past the last tick", () => {
        const replayer = createReplayer(solo.recording, levels)
        const end = JSON.stringify(replayer.at(replayer.length))
        expect(JSON.stringify(replayer.at(replayer.length + 100))).toBe(end)
        expect(checksumOf(replayer.at(replayer.length))).toEqual(
            solo.recording.final
        )
    })

    it("throws for a tick that isn't a finite number", () => {
        const replayer = createReplayer(solo.recording, levels)
        replayer.at(50)
        for (const tick of [NaN, Infinity, -Infinity]) {
            expect(() => replayer.at(tick)).toThrow(`Not a tick: ${tick}`)
        }
        // And it carries on as before.
        expect(checksumOf(replayer.at(51))).toEqual(solo.seen[50])
    })

    it("gives the same screens when ticks are asked for out of order", () => {
        const ticks = [700, 10, 650, 301, 300, 0, 899]
        const inOrder = createReplayer(solo.recording, levels)
        const expected = new Map(
            [...ticks]
                .sort((a, b) => a - b)
                .map((t) => [t, JSON.stringify(inOrder.at(t))])
        )
        const outOfOrder = createReplayer(solo.recording, levels)
        for (const t of ticks) {
            expect(JSON.stringify(outOfOrder.at(t))).toBe(expected.get(t))
        }
    })

    it("returns screens later calls don't change", () => {
        const replayer = createReplayer(solo.recording, levels)
        const screen = replayer.at(100)
        const before = JSON.stringify(screen)
        replayer.at(400)
        replayer.at(50)
        expect(JSON.stringify(screen)).toBe(before)
    })

    it("survives a JSON round trip", () => {
        const parsed = JSON.parse(JSON.stringify(solo.recording)) as Recording
        expect(verify(parsed, levels)).toBe(true)
    })

    it("fails to verify with the wrong seed", () => {
        const wrong = { ...solo.recording, seed: solo.recording.seed + 1 }
        expect(verify(wrong, levels)).toBe(false)
    })

    it("leaves out the ticks that pause and resume", () => {
        const pauses = new Set([50, 80, 200, 201])
        const run = playRun(0, "solo", 1234, { pauses, max: 600 })
        // 50 pauses and 80 resumes; 200 pauses and 201 resumes, so ticks
        // 50 to 80 and 200 to 201 aren't recorded.
        expect(run.seen.length).toBe(run.played - 33)
        expect(verify(run.recording, levels)).toBe(true)
    })

    it.each<[Mode, number]>([
        ["coop", 2],
        ["versus", 3],
    ])("replays a %s run", (mode, level) => {
        const run = playRun(level, mode, 99, { max: 1500 })
        expect(run.recording.ticks[0].t).toHaveLength(playerCount(mode))
        expect(verify(run.recording, levels)).toBe(true)
        const replayer = createReplayer(run.recording, levels)
        expect(checksumOf(replayer.at(700))).toEqual(run.seen[699])
    })
})
