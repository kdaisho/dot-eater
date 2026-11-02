import type { Recording } from "../../src/replay"
import { playerCentre } from "./camera"
import type { BoardPoint, CutList } from "./cutList"
import { LOOKS } from "./palette"
import { nearMisses, runOf } from "./replayers"

// The ToolkitDemo's cut list (see ToolkitDemo.tsx): pure, so it is tested.
// Its moments come straight from the demo run. The highlight finder
// (highlights.ts, KDA-254) will give the v2 promo its moments the same
// way: a tick and a board position.

export type Moment = { heroTick: number; at: BoardPoint }

// Player 1's position on tick `tick`.
function at(run: Recording, tick: number): Moment {
    return { heroTick: tick, at: playerCentre(runOf(run).track, 0, tick, 0) }
}

// The tick of the `nth` event of type `type` (the last one if there are
// fewer).
export function eventMoment(run: Recording, type: string, nth = 0): Moment {
    const ticks = runOf(run).ticks.flatMap((t, k) =>
        t.events.some((e) => e.type === type) ? [k] : []
    )
    return at(run, ticks[Math.min(nth, ticks.length - 1)] ?? 0)
}

// The run's closest call that leaves `margin` ticks either side and isn't
// within `margin` ticks of a kill (a breath's close call is the kill's
// moment, already shown).
export function closeCallMoment(run: Recording, margin = 200): Moment {
    const log = runOf(run)
    const kills = log.ticks.flatMap((t, k) =>
        t.events.some((e) => e.type === "enemyDefeated") ? [k] : []
    )
    const miss = nearMisses(run).find(
        (m) =>
            m.tick >= margin &&
            m.tick <= log.ticks.length - 1 - margin &&
            kills.every((k) => Math.abs(k - m.tick) >= margin)
    )
    return at(run, miss?.tick ?? Math.floor(log.ticks.length / 2))
}

export function demoCutList(run: Recording): CutList {
    const dragon = LOOKS.dragon
    return {
        shots: [
            {
                kind: "card",
                name: "Dragon card",
                animal: "dragon",
                durationBeats: 4,
            },
            {
                // The dragon's first fire kill, ramped: fast in, hard slow
                // motion on the beat, a colour flash, a caption.
                name: "Fire",
                recording: run,
                ...eventMoment(run, "enemyDefeated", 0),
                durationBeats: 4,
                heroBeat: 2,
                transition: "flash",
                colour: dragon.colour,
                camera: { move: "push", zoom: [2, 3.2] },
                caption: "Fire.",
            },
            {
                // A close call, whipped in, punching in hard on every beat.
                name: "Close call",
                recording: run,
                ...closeCallMoment(run),
                durationBeats: 4,
                heroBeat: 1,
                transition: "whip",
                colour: dragon.colour,
                speed: { slow: 0.2, hold: 10 },
                camera: { move: "hold", zoom: 2.6, punch: 0.2 },
                shake: 1.6,
            },
            {
                // The last kill, just before the stage clears, wiped in,
                // with the boss look.
                name: "Last kill",
                recording: run,
                ...eventMoment(run, "enemyDefeated", 1),
                durationBeats: 4,
                heroBeat: 3,
                transition: "wipe",
                colour: dragon.colour,
                camera: { move: "push", zoom: [2.2, 3.4], punch: 0.08 },
            },
        ],
    }
}
