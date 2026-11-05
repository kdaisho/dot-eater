// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { MASTER_LEVEL } from "./audio"
import type { Pad } from "./gamepad"
import { RECORDED_TRACKS } from "./recorded"
import { SOUNDTRACK } from "./soundtrack"
import { fakeContext } from "./test/fakeAudio"

// main's soundtrack page (KDA-321) end to end, on a fake AudioContext:
// silence on the way in, a track picked with the keys, a pad or a tap
// plays its file through the engine, its bar moves with the music, stop
// and Back stop it and the title tune comes back; muted, the page says so.
// (A separate file, since main is imported once per module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

const context = fakeContext()
vi.stubGlobal(
    "AudioContext",
    vi.fn(function () {
        return context
    })
)
// Every file "loads": its bytes name it, and the fake decodes them to a
// buffer naming them.
const fetch = vi.fn((url: string) =>
    Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(url),
    })
)
vi.stubGlobal("fetch", fetch)

let pads: (Pad | null)[] = []

function pad(buttons: number[] = []): Pad {
    return {
        index: 0,
        buttons: Array.from({ length: 17 }, (_, i) => ({
            pressed: buttons.includes(i),
        })),
        axes: [0, 0, 0, 0],
    }
}

const A = 0
const B = 1
const DOWN = 13

// Hold the buttons for a few frames, then let go for a few, and let the
// file's fetch and decode settle.
async function tapPad(...buttons: number[]) {
    pads = [pad(buttons)]
    await vi.advanceTimersByTimeAsync(100)
    pads = [pad()]
    await vi.advanceTimersByTimeAsync(100)
}

async function pressAndTick(code: string) {
    document.dispatchEvent(
        new KeyboardEvent("keydown", { code, bubbles: true })
    )
    document.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }))
    await vi.advanceTimersByTimeAsync(100)
}

async function tap(selector: string) {
    const found = document.querySelector<HTMLElement>(selector)
    if (!found) throw new Error(`No ${selector}`)
    found.click()
    await vi.advanceTimersByTimeAsync(100)
}

// Let `seconds` pass on the audio clock, then a frame.
async function wait(seconds: number) {
    context.currentTime += seconds
    await vi.advanceTimersByTimeAsync(50)
}

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const screen = () => overlay()?.dataset.screen ?? "playing"
const lines = () =>
    [...(overlay()?.querySelectorAll("p") ?? [])].map((p) => p.textContent)
const items = () =>
    [...(overlay()?.querySelectorAll("li") ?? [])].map(
        (li) => li.firstChild?.textContent
    )
const selectedItem = () =>
    overlay()?.querySelector("li.selected")?.firstChild?.textContent
const playingItem = () =>
    overlay()?.querySelector("li.playing")?.firstChild?.textContent
const time = (i: number) =>
    overlay()?.querySelector(`li[data-index='${i}'] .menu-time`)?.textContent
const masterGain = () => context.gains[0]!.gain.events.at(-1)?.[1]
const mute = () => document.querySelector<HTMLButtonElement>("#mute")!

// The recorded file playing now, if any: the last buffer source started
// and not stopped.
function playingFile() {
    const source = context.bufferSources.at(-1)
    if (!source || source.stopped !== undefined) return undefined
    return {
        url: (source.buffer as { decodedFrom: string }).decodedFrom,
        loopStart: source.loopStart,
        loopEnd: source.loopEnd,
    }
}

const file = (index: number) => RECORDED_TRACKS[SOUNDTRACK[index]!.track]!

// Whether the title's chip tune makes notes over the next second.
async function titleTunePlays(): Promise<boolean> {
    const before = context.oscillators.length
    for (let i = 0; i < 10; i++) {
        context.currentTime += 0.1
        await vi.advanceTimersByTimeAsync(100)
    }
    return context.oscillators.length > before
}

describe("main's soundtrack page", () => {
    it("plays the tracks picked there, and nothing else", async () => {
        vi.useFakeTimers()
        Object.defineProperty(navigator, "getGamepads", {
            configurable: true,
            value: () => pads,
        })
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")
        pads = [pad()]
        dispatchEvent(
            Object.assign(new Event("gamepadconnected"), {
                gamepad: { index: 0 },
            })
        )
        await vi.advanceTimersByTimeAsync(100)

        // The title tune plays on the title (the first key unlocks).
        for (let i = 0; i < 4; i++) await pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Soundtrack")
        expect(await titleTunePlays()).toBe(true)

        // In: every track listed, the cursor on the first, silence.
        await pressAndTick("Space")
        expect(screen()).toBe("soundtrack")
        expect(items()).toEqual(SOUNDTRACK.map((entry) => entry.name))
        expect(selectedItem()).toBe("Opening")
        expect(playingItem()).toBeUndefined()
        expect(await titleTunePlays()).toBe(false)
        expect(playingFile()).toBeUndefined()

        // Keys: down to Classic, Space plays its file, looped as in game.
        await pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Classic")
        await pressAndTick("Space")
        expect(playingItem()).toBe("Classic")
        expect(playingFile()).toEqual(file(1))
        expect(time(1)).toBe("0:00 / 0:57")
        // The bar follows the music.
        await wait(30.5)
        expect(time(1)).toBe("0:30 / 0:57")
        // Right moves the cursor; the track plays on until a pick.
        await pressAndTick("ArrowRight")
        expect(selectedItem()).toBe("Wrap Maze")
        expect(playingFile()).toEqual(file(1))
        await pressAndTick("Space")
        expect(playingItem()).toBe("Wrap Maze")
        expect(playingFile()).toEqual(file(2))
        expect(time(1)).toBe("0:00 / 0:57")
        // Space on it again stops it, with no title tune.
        await pressAndTick("Space")
        expect(playingItem()).toBeUndefined()
        expect(playingFile()).toBeUndefined()
        expect(await titleTunePlays()).toBe(false)

        // A pad: down and A play Ice Rink; B leaves, stopping it, and the
        // title tune comes back.
        await tapPad(DOWN)
        await tapPad(A)
        expect(playingItem()).toBe("Ice Rink")
        expect(playingFile()).toEqual(file(3))
        await tapPad(B)
        expect(screen()).toBe("title")
        expect(selectedItem()).toBe("Soundtrack")
        expect(playingFile()).toBeUndefined()
        expect(await titleTunePlays()).toBe(true)

        // Taps: the entry opens it on the first track again, a row plays,
        // a tap on it again stops, and Back leaves.
        await tap("#overlay li[data-index='4']")
        expect(screen()).toBe("soundtrack")
        expect(selectedItem()).toBe("Opening")
        await tap("#overlay li[data-index='11']")
        expect(playingItem()).toBe("End Roll")
        expect(playingFile()).toEqual(file(11))
        await tap("#overlay li[data-index='11']")
        expect(playingFile()).toBeUndefined()
        await tap("#overlay li[data-index='10']")
        expect(playingFile()).toEqual(file(10))
        await tap("#overlay [data-back]")
        expect(screen()).toBe("title")
        expect(playingFile()).toBeUndefined()

        // Muted: the page says so, and a track plays through the muted
        // master gain; unmuted, the hint goes and the music is heard.
        await pressAndTick("Space")
        expect(screen()).toBe("soundtrack")
        expect(lines()).not.toContain(
            "Sound is muted: turn it on with 🔇 at the top right"
        )
        mute().click()
        expect(lines()[0]).toBe(
            "Sound is muted: turn it on with 🔇 at the top right"
        )
        await pressAndTick("Space")
        expect(playingFile()).toEqual(file(0))
        expect(masterGain()).toBe(0)
        mute().click()
        expect(lines()[0]).not.toContain("muted")
        expect(masterGain()).toBe(MASTER_LEVEL)
        expect(playingFile()).toEqual(file(0))
    })
})
