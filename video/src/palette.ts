import type { AnimalId } from "../../src/roster"

// The game's pixel look: its sprites and pixel font, black and white,
// plus one bold colour per character for its slams, flashes and wipes.

export const INK = "#000"
export const PAPER = "#fff"

// The promo's words are the game's own lettering (pixelType.ts): the
// logo's block letters and the title menu's font. DISPLAY is for the odd
// word still set as text.
export const DISPLAY = '"Press Start 2P", monospace'

export type CharacterLook = {
    id: AnimalId
    // The name and ability word as the slam card shows them.
    name: string
    ability: string
    // The sound its ability makes, as a comic would spell it: the caption
    // over its ability shot.
    sound: string
    // The character's colour, and a darker shade of it for text on paper
    // and for the card's shadow.
    colour: string
    deep: string
}

export const LOOKS: Readonly<Record<AnimalId, CharacterLook>> = {
    dragon: {
        id: "dragon",
        name: "DRAGON",
        ability: "FIRE.",
        sound: "FWOOOSH!",
        colour: "#FF4B12",
        deep: "#B22A00",
    },
    penguin: {
        id: "penguin",
        name: "PENGUIN",
        ability: "ICE.",
        sound: "BRRR... CLONK!",
        colour: "#12C8F2",
        deep: "#006F96",
    },
    owl: {
        id: "owl",
        name: "OWL",
        ability: "WIND.",
        sound: "HOO-WHOOOSH!",
        colour: "#8B4DFF",
        deep: "#4A1DB0",
    },
    skunk: {
        id: "skunk",
        name: "SKUNK",
        ability: "STINK.",
        sound: "PFFFRRRT!",
        colour: "#34D058",
        deep: "#137A2C",
    },
    boar: {
        id: "boar",
        name: "BOAR",
        ability: "SMASH.",
        sound: "OINK-KABLAM!",
        colour: "#A8642A",
        deep: "#5E3410",
    },
}
