// The soundtrack player's queue (KDA-332): which track plays, in what
// order, and what comes after it, like a music app's next, previous,
// repeat and shuffle. No DOM access: the page (playerPage.ts) plays the
// tracks and calls these. Randomness comes in as a parameter.

export type Repeat = "off" | "all" | "one"

export type Playlist = {
    // Track indexes in the order they play: 0, 1, 2… or shuffled.
    order: readonly number[]
    // Where in `order` the current track is.
    pos: number
    repeat: Repeat
    shuffle: boolean
}

// After a step: the new queue, and whether to keep playing. Stopping is
// running off the end with repeat off.
export type Step = { playlist: Playlist; play: boolean }

// Past this many seconds in, previous restarts the track instead.
export const RESTART_AFTER = 3

export const REPEAT_CYCLE: Readonly<Record<Repeat, Repeat>> = {
    off: "all",
    all: "one",
    one: "off",
}

function inOrder(count: number): number[] {
    return Array.from({ length: count }, (_, i) => i)
}

export function createPlaylist(
    count: number,
    repeat: Repeat = "all",
    shuffle = false,
    random: () => number = Math.random
): Playlist {
    const plain: Playlist = { order: inOrder(count), pos: 0, repeat, shuffle }
    return shuffle
        ? { ...plain, order: shuffled(plain.order, 0, random) }
        : plain
}

export function currentTrack(p: Playlist): number {
    return p.order[p.pos]!
}

// `order` shuffled (Fisher–Yates) with track `first` moved to the front,
// so turning shuffle on doesn't change what's playing.
function shuffled(
    order: readonly number[],
    first: number,
    random: () => number
): number[] {
    const rest = order.filter((t) => t !== first)
    for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[rest[i], rest[j]] = [rest[j]!, rest[i]!]
    }
    return [first, ...rest]
}

// The next track. `ended` is the track finishing on its own: repeat one
// plays it again then, but the next button still moves on. Off the end,
// repeat all wraps round; repeat off goes back to the first track and
// stops (the next button wraps and keeps playing).
export function next(p: Playlist, ended: boolean): Step {
    if (ended && p.repeat === "one") return { playlist: p, play: true }
    const last = p.pos >= p.order.length - 1
    if (!last) return { playlist: { ...p, pos: p.pos + 1 }, play: true }
    const wrapped = { ...p, pos: 0 }
    return { playlist: wrapped, play: !ended || p.repeat === "all" }
}

// The previous track, or the start of this one when it's more than
// RESTART_AFTER seconds in (`restart` is then true). From the first track,
// repeat all wraps to the last; otherwise it restarts.
export function previous(
    p: Playlist,
    elapsed: number
): { playlist: Playlist; restart: boolean } {
    if (elapsed > RESTART_AFTER) return { playlist: p, restart: true }
    if (p.pos > 0) return { playlist: { ...p, pos: p.pos - 1 }, restart: false }
    if (p.repeat === "all")
        return {
            playlist: { ...p, pos: p.order.length - 1 },
            restart: false,
        }
    return { playlist: p, restart: true }
}

// Play track `track` (picked from the list), keeping the order.
export function pick(p: Playlist, track: number): Playlist {
    const pos = p.order.indexOf(track)
    return pos < 0 ? p : { ...p, pos }
}

// Shuffle on: the current track first, the rest in a random order. Off:
// back to the track order, still on the current track.
export function setShuffle(
    p: Playlist,
    shuffle: boolean,
    random: () => number = Math.random
): Playlist {
    const track = currentTrack(p)
    const order = shuffle
        ? shuffled(p.order, track, random)
        : inOrder(p.order.length)
    return { ...p, shuffle, order, pos: order.indexOf(track) }
}

export function cycleRepeat(p: Playlist): Playlist {
    return { ...p, repeat: REPEAT_CYCLE[p.repeat] }
}
