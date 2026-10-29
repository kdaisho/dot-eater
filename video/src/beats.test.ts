import { describe, expect, it } from "vite-plus/test"
import { beatsOf, fallbackBeats, type BeatsFile } from "./beats"

describe("fallbackBeats", () => {
    it("lays a 4/4 grid from the offset, with sections on bars", () => {
        const file = fallbackBeats({ bpm: 120, bars: 8, offset: 0.25 })
        expect(file.beatPeriod).toBe(0.5)
        expect(file.beats).toHaveLength(32)
        expect(file.beats[1]).toBe(0.75)
        expect(file.downbeats).toEqual([
            0.25, 2.25, 4.25, 6.25, 8.25, 10.25, 12.25, 14.25,
        ])
        expect(file.sections.map((s) => s.label)).toEqual([
            "intro",
            "build",
            "drop",
            "outro",
        ])
        const drop = file.sections[2]
        expect(drop.start).toBe(file.downbeats[drop.startBar])
        expect(file.drop).toEqual({
            time: drop.start,
            bar: drop.startBar,
            section: 2,
        })
        expect(file.bars).toHaveLength(8)
    })
})

describe("beatsOf", () => {
    // 120 bpm from 0.5 s: a beat is 15 frames at 30 fps, a bar 60.
    const file = fallbackBeats({ bpm: 120, bars: 16, offset: 0.5 })

    it("gives beat and bar frames from the start", () => {
        const beats = beatsOf(file, { fps: 30 })
        expect(beats.beatFrames).toBe(15)
        expect(beats.barFrames).toBe(60)
        expect(beats.beatFrame(0)).toBe(15)
        expect(beats.beatFrame(3)).toBe(60)
        expect(beats.beatFrame(0.5)).toBe(22.5)
        expect(beats.barFrame(2)).toBe(135)
        // Past the grid's end it keeps the tempo.
        expect(beats.beatFrame(64)).toBe(15 + 64 * 15)
    })

    it("counts from the first beat at or after the start", () => {
        // 2.5 s into the song is bar 1's downbeat.
        const beats = beatsOf(file, { fps: 30, start: 2.5 })
        expect(beats.barFrame(0)).toBe(0)
        expect(beats.beatFrame(1)).toBe(15)
        expect(beats.frameOf(2.5)).toBe(0)
        // A start between beats: beat 0 is the next one.
        const late = beatsOf(file, { fps: 30, start: 2.6 })
        expect(late.beatFrame(0)).toBeCloseTo(12)
    })

    it("finds sections, the drop and the nearest beat", () => {
        const beats = beatsOf(file, { fps: 30 })
        const drop = file.sections.find((s) => s.label === "drop")
        expect(beats.sectionFrames("drop")).toEqual({
            from: ((drop?.start ?? 0) - 0) * 30,
            to: ((drop?.end ?? 0) - 0) * 30,
        })
        expect(beats.sectionFrames("hook")).toBeUndefined()
        expect(beats.dropFrame).toBe((drop?.start ?? 0) * 30)
        expect(beats.nearestBeat(21)).toEqual({
            n: 0,
            frame: 15,
            downbeat: true,
        })
        expect(beats.nearestBeat(23)).toEqual({
            n: 1,
            frame: 30,
            downbeat: false,
        })
        expect(beats.beatAt(22.5)).toBeCloseTo(0.5)
    })

    it("pulses on each beat, hardest on downbeats, decaying between", () => {
        const beats = beatsOf(file, { fps: 30 })
        expect(beats.pulse(14)).toBeLessThan(0.1)
        expect(beats.pulse(15)).toBe(1)
        expect(beats.pulse(30)).toBeCloseTo(0.55)
        expect(beats.pulse(21)).toBeCloseTo(Math.exp(-1))
        expect(beats.pulse(29)).toBeLessThan(beats.pulse(16))
        expect(beats.pulse(75)).toBe(1)
        expect(beats.pulse(30, { offbeat: 0.3 })).toBeCloseTo(0.3)
    })

    it("follows an analysed grid's own beat times", () => {
        const swung: BeatsFile = {
            ...file,
            beats: [0, 0.5, 1.02, 1.5, 2, 2.5],
            downbeats: [0, 2],
        }
        const beats = beatsOf(swung, { fps: 100 })
        expect(beats.beatFrame(2)).toBeCloseTo(102)
        expect(beats.nearestBeat(201).downbeat).toBe(true)
        expect(beats.nearestBeat(150).downbeat).toBe(false)
    })
})
