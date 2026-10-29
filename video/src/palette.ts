import { ANIMALS, type AnimalId } from "../../src/roster"

// The v2 look: the game's clean black and white, plus one bold colour per
// character for its slams, flashes and wipes.

export const INK = "#000"
export const PAPER = "#fff"

// Bolder cousins of the game's type: Helvetica at its heaviest for names,
// and a heavy monospace for the ability words.
export const DISPLAY =
    '"Helvetica Neue", Helvetica, Arial, "Apple Color Emoji", "Noto Color Emoji", sans-serif'
export const MONO =
    '"SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas, "Apple Color Emoji", monospace'

export type CharacterLook = {
    id: AnimalId
    emoji: string
    // The name and ability word as the slam card shows them.
    name: string
    ability: string
    // The character's colour, and a darker shade of it for text on paper
    // and for the card's shadow.
    colour: string
    deep: string
}

export const LOOKS: Readonly<Record<AnimalId, CharacterLook>> = {
    dragon: {
        id: "dragon",
        emoji: ANIMALS.dragon.emoji,
        name: "DRAGON",
        ability: "FIRE.",
        colour: "#FF4B12",
        deep: "#B22A00",
    },
    penguin: {
        id: "penguin",
        emoji: ANIMALS.penguin.emoji,
        name: "PENGUIN",
        ability: "ICE.",
        colour: "#12C8F2",
        deep: "#006F96",
    },
    owl: {
        id: "owl",
        emoji: ANIMALS.owl.emoji,
        name: "OWL",
        ability: "WIND.",
        colour: "#8B4DFF",
        deep: "#4A1DB0",
    },
    skunk: {
        id: "skunk",
        emoji: ANIMALS.skunk.emoji,
        name: "SKUNK",
        ability: "STINK.",
        colour: "#34D058",
        deep: "#137A2C",
    },
    boar: {
        id: "boar",
        emoji: ANIMALS.boar.emoji,
        name: "BOAR",
        ability: "SMASH.",
        colour: "#A8642A",
        deep: "#5E3410",
    },
}
