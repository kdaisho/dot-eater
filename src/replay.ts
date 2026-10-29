import type { Random } from "./ai"
import { Cell, TICK_MS } from "./constants"
import {
    playerCount,
    startLevel,
    update,
    type FlowDeps,
    type Match,
    type Mode,
    type Picks,
    type Screen,
    type ScreenKind,
    type TickInput,
} from "./flow"
import type { GameState, MoveInput } from "./game"
import { DIRECTION_ACTIONS, directionStep, type Action } from "./input"
import type { Level } from "./level"
import { emptyProgress } from "./progress"
import { vec2, type Vec2 } from "./vec2"

// Recording and replaying a run, for videos of real play.
//
// A recording is one run: from a `playing` screen as startLevel makes it
// (stage, mode, characters and, in versus, the match so far) to the end
// screen it reaches. It holds every tick's input and the seed of the
// run's randomness (seededRandom), which is all the game reads, so feeding
// the ticks back through flow's update replays the run exactly. `final`
// is a checksum of where the run ended, to prove a replay matched.
//
// Only ticks that advance the run are recorded (see shouldRecord): those
// taken in `playing` or `ending`, minus any that pause. Pause presses are
// dropped, so a replay never pauses, and paused time doesn't exist in it.
//
// Ticks are stored compactly, since a recording runs at TICK_RATE ticks a
// second for minutes: each player's tick is a few letters (see PlayerTick),
// and runs of identical ticks are stored once with a count (see TickRun).

export const RECORDING_VERSION = 1

// One player's input on one tick. Fields with nothing in them are left
// out, so an idle player is `{}`. Directions are the letters u, d, l, r.
export type PlayerTick = {
    // MoveInput.held: the directions held, most recently pressed first.
    h?: string
    // MoveInput.pressed: the direction newly pressed this tick.
    p?: string
    // The actions pressed this tick other than pause: directions, b for
    // breath, c for confirm. A replay's MoveInput.breath is whether b is in
    // it.
    a?: string
}

// Every player's input on one tick, player 1 first.
export type RecordedTick = readonly PlayerTick[]

// `n` ticks in a row with the same input (1 when left out).
export type TickRun = { t: RecordedTick; n?: number }

// Where a run ended, cheap to compare: if a replay ends the same way, it
// played the same game.
export type Checksum = {
    // The screen the run ended on.
    kind: ScreenKind
    // GameState.ticks: the ticks the game was stepped.
    ticks: number
    // Per player, player 1 first.
    scores: number[]
    dots: number[]
    // Dots left on the board.
    dotsLeft: number
    lives: number
    // Where everyone is, as "x,y" cells: the players, then the enemies,
    // then the boss if there is one.
    positions: string
}

export type Recording = {
    version: typeof RECORDING_VERSION
    level: number
    mode: Mode
    animals: Picks
    // Versus only: the rounds before this one.
    match?: Match
    // Seeds the run's randomness (see seededRandom).
    seed: number
    ticks: TickRun[]
    final: Checksum
}

// ---- Randomness ----

// A seeded random source (mulberry32): the same seed gives the same
// numbers, in [0, 1) like Math.random. `state` is where it is in its
// sequence, so a replay can save it and carry on from there later.
export type Rng = { next: Random; state: number }

export function createRng(seed: number): Rng {
    const rng: Rng = {
        state: seed | 0,
        next: () => {
            rng.state = (rng.state + 0x6d2b79f5) | 0
            let t = rng.state
            t = Math.imul(t ^ (t >>> 15), t | 1)
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        },
    }
    return rng
}

export function seededRandom(seed: number): Random {
    return createRng(seed).next
}

// A new seed (a 32-bit integer) drawn from `random`, e.g. Math.random.
export function newSeed(random: Random): number {
    return Math.floor(random() * 2 ** 32) | 0
}

// ---- Ticks ----

const ACTION_LETTERS: Partial<Record<Action, string>> = {
    up: "u",
    down: "d",
    left: "l",
    right: "r",
    breath: "b",
    confirm: "c",
}

// A direction's letter, for its unit step.
function letterOf(step: Vec2): string {
    const direction = DIRECTION_ACTIONS.find((action) => {
        const { x, y } = directionStep(action)
        return x === step.x && y === step.y
    })
    if (!direction) throw new Error(`Not a direction: ${step.x},${step.y}`)
    return ACTION_LETTERS[direction]!
}

// A direction letter's unit step: a new vector on every call, since the
// game keeps the steps it is given (a pressed one is buffered) and must
// not share them between ticks.
function stepOf(letter: string): Vec2 {
    const direction = DIRECTION_ACTIONS.find(
        (action) => ACTION_LETTERS[action] === letter
    )
    if (!direction) throw new Error(`Not a direction letter: ${letter}`)
    return directionStep(direction)
}

// One tick of `input` for `players` players, as a recording stores it.
export function recordTick(input: TickInput, players: number): RecordedTick {
    return Array.from({ length: players }, (_, i) => {
        const move = input.move(i)
        const tick: PlayerTick = {}
        const held = move.held.map(letterOf).join("")
        if (held) tick.h = held
        if (move.pressed.x !== 0 || move.pressed.y !== 0) {
            tick.p = letterOf(move.pressed)
        }
        let actions = ""
        for (const [action, letter] of Object.entries(ACTION_LETTERS)) {
            const pressed =
                action === "breath"
                    ? move.breath || input.wasPressed("breath", i)
                    : input.wasPressed(action as Action, i)
            if (pressed) actions += letter
        }
        if (actions) tick.a = actions
        return tick
    })
}

// A recorded tick as flow's input. Players beyond the recorded ones are
// idle.
export function tickInputOf(tick: RecordedTick): TickInput {
    return {
        wasPressed: (action, player = 0) => {
            const letter = ACTION_LETTERS[action]
            return !!letter && !!tick[player]?.a?.includes(letter)
        },
        move: (player = 0): MoveInput => {
            const { h = "", p, a = "" } = tick[player] ?? {}
            return {
                held: h.split("").map(stepOf),
                pressed: p ? stepOf(p) : vec2(0, 0),
                breath: a.includes("b"),
            }
        },
    }
}

// Whether the tick that took the run from `before` to `after` belongs in
// its recording: it was taken in `playing` or `ending` and didn't pause.
// (A tick that pauses doesn't step the game, so replaying it without its
// pause press would.)
export function shouldRecord(before: Screen, after: Screen): boolean {
    return (
        (before.kind === "playing" || before.kind === "ending") &&
        after.kind !== "paused"
    )
}

function sameTick(a: RecordedTick, b: RecordedTick): boolean {
    return (
        a.length === b.length &&
        a.every((t, i) => t.h === b[i].h && t.p === b[i].p && t.a === b[i].a)
    )
}

// The ticks of `runs`, one entry per tick.
function expandRuns(runs: readonly TickRun[]): RecordedTick[] {
    return runs.flatMap((run) => Array<RecordedTick>(run.n ?? 1).fill(run.t))
}

// How many ticks a recording has.
export function tickCount(recording: Recording): number {
    return recording.ticks.reduce((sum, run) => sum + (run.n ?? 1), 0)
}

// ---- Recording ----

export type Recorder = {
    // Record one tick's input (only for ticks shouldRecord accepts).
    add(input: TickInput): void
    // The recording, ending on `screen` (the end screen the run reached).
    finish(screen: Screen): Recording
}

// Start recording the run that `start` (a fresh `playing` screen) begins,
// whose randomness is seededRandom(seed).
export function createRecorder(
    start: Extract<Screen, { kind: "playing" }>,
    seed: number
): Recorder {
    const players = playerCount(start.mode)
    const runs: TickRun[] = []
    return {
        add(input) {
            const tick = recordTick(input, players)
            const last = runs.at(-1)
            if (last && sameTick(last.t, tick)) last.n = (last.n ?? 1) + 1
            else runs.push({ t: tick })
        },
        finish(screen) {
            return {
                version: RECORDING_VERSION,
                level: start.level,
                mode: start.mode,
                animals: start.animals,
                ...(start.match ? { match: start.match } : {}),
                seed,
                ticks: runs.map((run) => ({ ...run })),
                final: checksumOf(screen),
            }
        },
    }
}

// ---- Replaying ----

export function checksumOf(screen: Screen): Checksum {
    if (!("game" in screen)) {
        throw new Error(`No game on screen: ${screen.kind}`)
    }
    const { game } = screen
    let dotsLeft = 0
    for (const row of game.cells) {
        for (const cell of row) if (cell === Cell.dot) dotsLeft++
    }
    return {
        kind: screen.kind,
        ticks: game.ticks,
        scores: game.players.map((p) => p.score),
        dots: game.players.map((p) => p.dots),
        dotsLeft,
        lives: game.lives,
        positions: [
            ...game.players.map((p) => p.character),
            ...game.enemies,
            ...(game.boss ? [game.boss] : []),
        ]
            .map(({ pos }) => `${pos.x},${pos.y}`)
            .join(" "),
    }
}

function sameChecksum(a: Checksum, b: Checksum): boolean {
    return (
        a.kind === b.kind &&
        a.ticks === b.ticks &&
        a.dotsLeft === b.dotsLeft &&
        a.lives === b.lives &&
        a.positions === b.positions &&
        a.scores.join() === b.scores.join() &&
        a.dots.join() === b.dots.join()
    )
}

// A deep copy of a game. Breath definitions hold functions, which
// structuredClone can't copy; they never change, so the copy shares them.
function cloneGame(game: GameState): GameState {
    const breaths = game.players.map((p) => p.breather.breath)
    const players = game.players.map((p) => {
        const { breath: _, ...breather } = p.breather
        return { ...p, breather }
    })
    const copy = structuredClone({ ...game, players })
    return {
        ...copy,
        players: copy.players.map((p, i) => ({
            ...p,
            breather: { ...p.breather, breath: breaths[i] },
        })),
    } as GameState
}

// A deep copy of a screen, so stepping the original doesn't change it.
export function cloneScreen(screen: Screen): Screen {
    if (!("game" in screen)) return structuredClone(screen)
    const { game, ...rest } = screen
    return { ...structuredClone(rest), game: cloneGame(game) } as Screen
}

export type Replayer = {
    // How many ticks the recording has: at(length) is its end screen.
    length: number
    // The screen after the recording's first `tick` ticks: at(0) is the
    // start, and any tick past the end holds the end screen. Fractions
    // round down; a tick that isn't a finite number (NaN, Infinity) throws.
    // Ticks may be asked for in any order; each call returns a copy of its
    // own, which later calls never change.
    at(tick: number): Screen
}

// How often (in ticks) the replayer keeps a copy of where it is, so going
// back replays from the nearest copy instead of from the start.
const SNAPSHOT_EVERY = 300

// Replay `recording` on `levels` (the game's levels, in the order the
// recording's `level` indexes). Steps forward from where it is for a later
// tick, and from the nearest snapshot for an earlier one.
export function createReplayer(
    recording: Recording,
    levels: readonly Level[]
): Replayer {
    if (recording.version !== RECORDING_VERSION) {
        throw new Error(
            `Unknown recording version: ${String(recording.version)}`
        )
    }
    const ticks = expandRuns(recording.ticks)
    const rng = createRng(recording.seed)
    const deps: FlowDeps = {
        levels,
        progress: emptyProgress(),
        dt: TICK_MS / 1000,
        random: rng.next,
    }
    let screen = startLevel(
        levels,
        recording.level,
        recording.animals,
        recording.mode,
        recording.match
    )
    let done = 0
    const snapshots = new Map<number, { screen: Screen; rng: number }>()
    snapshots.set(0, { screen: cloneScreen(screen), rng: rng.state })

    return {
        length: ticks.length,
        at(tick) {
            if (!Number.isFinite(tick)) {
                throw new Error(`Not a tick: ${String(tick)}`)
            }
            const target = Math.min(Math.max(Math.floor(tick), 0), ticks.length)
            if (target < done) {
                // Every multiple of SNAPSHOT_EVERY up to `done` has one.
                const from = target - (target % SNAPSHOT_EVERY)
                const snapshot = snapshots.get(from)!
                screen = cloneScreen(snapshot.screen)
                rng.state = snapshot.rng
                done = from
            }
            while (done < target) {
                screen = update(screen, tickInputOf(ticks[done]), deps)
                done++
                if (done % SNAPSHOT_EVERY === 0 && !snapshots.has(done)) {
                    snapshots.set(done, {
                        screen: cloneScreen(screen),
                        rng: rng.state,
                    })
                }
            }
            return cloneScreen(screen)
        },
    }
}

// Whether replaying `recording` ends where the recorded run did.
export function verify(
    recording: Recording,
    levels: readonly Level[]
): boolean {
    const replayer = createReplayer(recording, levels)
    const end = replayer.at(replayer.length)
    return sameChecksum(checksumOf(end), recording.final)
}
