import { describe, expect, it } from "vite-plus/test"
import { pickTrack } from "./music"
import { beatsFileName, SONGS } from "./songs"

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

    it("picks a composition's song by name, ignoring case and punctuation", () => {
        const files = [
            file("music/01 Slam (Bionyx Remix).m4a"),
            file("music/03 Great Expectations.m4a"),
            file("music/03 Great Expectations.beats.json"),
        ]
        expect(pickTrack(files, SONGS.promo2)).toEqual(files[1])
        expect(pickTrack(files, SONGS.promo)).toEqual(files[0])
        expect(pickTrack(files, "other song")).toBeUndefined()
    })

    it("finds none without a song", () => {
        expect(pickTrack([])).toBeUndefined()
        expect(
            pickTrack([file("audio/music.wav"), file("music/README.txt")])
        ).toBeUndefined()
    })
})

describe("beatsFileName", () => {
    it("puts the analysis next to the song", () => {
        expect(beatsFileName("music/03 Great Expectations.m4a")).toBe(
            "03 Great Expectations.beats.json"
        )
        expect(beatsFileName("slam")).toBe("slam.beats.json")
    })
})
