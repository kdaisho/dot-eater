import { describe, expect, it } from "vite-plus/test"
import { noteFreq, noteNumber, soundLength } from "./tone"

describe("noteNumber", () => {
    it("numbers notes as MIDI does", () => {
        expect(noteNumber("A4")).toBe(69)
        expect(noteNumber("C4")).toBe(60)
        expect(noteNumber("F#3")).toBe(54)
        expect(noteNumber("Bb2")).toBe(46)
        expect(noteNumber("C-1")).toBe(0)
    })

    it("knows nothing else", () => {
        for (const name of ["", "H4", "C", "c4", "C10", "C#b4", "-"])
            expect(noteNumber(name)).toBeUndefined()
    })
})

describe("noteFreq", () => {
    it("tunes A4 to 440 Hz, octaves doubling", () => {
        expect(noteFreq("A4")).toBe(440)
        expect(noteFreq("A5")).toBe(880)
        expect(noteFreq("C4")).toBeCloseTo(261.63, 2)
    })

    it("throws on an unknown name", () => {
        expect(() => noteFreq("X4")).toThrow("Unknown note: X4")
    })
})

describe("soundLength", () => {
    it("ends with the last tone to end", () => {
        expect(
            soundLength([
                { wave: "square", at: 0, duration: 0.5, freq: 1, volume: 1 },
                { wave: "sine", at: 0.2, duration: 0.1, freq: 1, volume: 1 },
            ])
        ).toBe(0.5)
        expect(soundLength([])).toBe(0)
    })
})
