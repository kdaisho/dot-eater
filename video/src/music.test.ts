import { describe, expect, it } from "vite-plus/test"
import { pickTrack } from "./music"

describe("pickTrack", () => {
    const file = (name: string) => ({ name })

    it("picks the first audio file in public/music/ by name", () => {
        expect(
            pickTrack([
                file("audio/effects.wav"),
                file("music/b.mp3"),
                file("music/a.m4a"),
                file("music/notes.txt"),
            ])
        ).toEqual(file("music/a.m4a"))
    })

    it("finds none without a song", () => {
        expect(pickTrack([])).toBeUndefined()
        expect(
            pickTrack([file("audio/music.wav"), file("music/README.txt")])
        ).toBeUndefined()
    })
})
