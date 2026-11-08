import { describe, expect, it } from "vite-plus/test"
import {
    createPlaylist,
    currentTrack,
    cycleRepeat,
    next,
    pick,
    previous,
    setShuffle,
    type Playlist,
} from "./playlist"

// A fixed "random" sequence, so shuffles are repeatable.
function seq(...values: number[]): () => number {
    let i = 0
    return () => values[i++ % values.length]!
}

function at(p: Playlist, track: number): Playlist {
    return pick(p, track)
}

describe("createPlaylist", () => {
    it("starts on the first track, in order, repeating all", () => {
        const p = createPlaylist(4)
        expect(p.order).toEqual([0, 1, 2, 3])
        expect(currentTrack(p)).toBe(0)
        expect(p.repeat).toBe("all")
    })

    it("can start shuffled, from track 0", () => {
        const p = createPlaylist(4, "off", true, seq(0))
        expect(p.order).toHaveLength(4)
        expect(new Set(p.order)).toEqual(new Set([0, 1, 2, 3]))
        expect(currentTrack(p)).toBe(0)
    })
})

describe("next", () => {
    it("moves to the next track and plays", () => {
        const step = next(createPlaylist(3), false)
        expect(currentTrack(step.playlist)).toBe(1)
        expect(step.play).toBe(true)
    })

    it("wraps round at the end with repeat all", () => {
        const p = at(createPlaylist(3, "all"), 2)
        const step = next(p, true)
        expect(currentTrack(step.playlist)).toBe(0)
        expect(step.play).toBe(true)
    })

    it("goes back to the first track and stops with repeat off", () => {
        const p = at(createPlaylist(3, "off"), 2)
        const step = next(p, true)
        expect(currentTrack(step.playlist)).toBe(0)
        expect(step.play).toBe(false)
    })

    it("keeps playing when the button is pressed on the last track", () => {
        const p = at(createPlaylist(3, "off"), 2)
        expect(next(p, false).play).toBe(true)
    })

    it("plays the same track again when it ends with repeat one", () => {
        const p = at(createPlaylist(3, "one"), 1)
        const step = next(p, true)
        expect(currentTrack(step.playlist)).toBe(1)
        expect(step.play).toBe(true)
    })

    it("still moves on when the button is pressed with repeat one", () => {
        const p = at(createPlaylist(3, "one"), 1)
        expect(currentTrack(next(p, false).playlist)).toBe(2)
    })

    it("follows the shuffled order", () => {
        const p: Playlist = { ...createPlaylist(3), order: [2, 0, 1] }
        expect(currentTrack(next(p, false).playlist)).toBe(0)
    })
})

describe("previous", () => {
    it("restarts the track when more than 3 seconds in", () => {
        const p = at(createPlaylist(3), 1)
        const back = previous(p, 3.5)
        expect(back.restart).toBe(true)
        expect(currentTrack(back.playlist)).toBe(1)
    })

    it("goes to the track before near the start", () => {
        const back = previous(at(createPlaylist(3), 1), 1)
        expect(back.restart).toBe(false)
        expect(currentTrack(back.playlist)).toBe(0)
    })

    it("wraps to the last track from the first with repeat all", () => {
        const back = previous(createPlaylist(3, "all"), 0)
        expect(currentTrack(back.playlist)).toBe(2)
    })

    it("restarts the first track with repeat off", () => {
        const back = previous(createPlaylist(3, "off"), 0)
        expect(back.restart).toBe(true)
        expect(currentTrack(back.playlist)).toBe(0)
    })
})

describe("setShuffle", () => {
    it("keeps the current track playing, first in the new order", () => {
        const p = setShuffle(at(createPlaylist(5), 3), true, seq(0.1, 0.9))
        expect(p.shuffle).toBe(true)
        expect(currentTrack(p)).toBe(3)
        expect(p.pos).toBe(0)
        expect([...p.order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
    })

    it("goes back to the track order on the same track when turned off", () => {
        const on = setShuffle(at(createPlaylist(5), 3), true, seq(0.5))
        const off = setShuffle(on, false)
        expect(off.order).toEqual([0, 1, 2, 3, 4])
        expect(currentTrack(off)).toBe(3)
    })
})

describe("cycleRepeat", () => {
    it("goes off, all, one, off", () => {
        const p = createPlaylist(2, "off")
        const seen = [p, cycleRepeat(p)]
        seen.push(cycleRepeat(seen[1]!), cycleRepeat(cycleRepeat(seen[1]!)))
        expect(seen.map((s) => s.repeat)).toEqual(["off", "all", "one", "off"])
    })
})

describe("pick", () => {
    it("jumps to a track in the shuffled order", () => {
        const p: Playlist = { ...createPlaylist(3), order: [2, 0, 1] }
        expect(pick(p, 1).pos).toBe(2)
    })
})
