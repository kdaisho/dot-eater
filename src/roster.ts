// The playable characters: who they are and what their select-screen card
// says. This is shared by the character select screen (KDA-209) and the
// breath system (KDA-208), which keeps each character's breath and stats in
// src/breaths/. Add fields as needed, but don't rename existing ones.
//
// Ids are strings because the last pick is saved to storage.

export const AnimalId = {
    dragon: "dragon",
    penguin: "penguin",
    owl: "owl",
    skunk: "skunk",
    boar: "boar",
} as const
export type AnimalId = (typeof AnimalId)[keyof typeof AnimalId]

export type AnimalInfo = {
    id: AnimalId
    name: string
    emoji: string
    // The breath's name and a one-line description, for the card.
    breathName: string
    breathText: string
    // The character's one stat, as card text.
    statText: string
}

// Card order on the select screen.
export const ANIMAL_IDS: readonly AnimalId[] = [
    AnimalId.dragon,
    AnimalId.penguin,
    AnimalId.owl,
    AnimalId.skunk,
    AnimalId.boar,
]

// Whether a value (e.g. one read back from storage) is a known id.
export function isAnimalId(value: unknown): value is AnimalId {
    return ANIMAL_IDS.includes(value as AnimalId)
}

// Picked when nothing has been chosen yet.
export const DEFAULT_ANIMAL: AnimalId = AnimalId.dragon

export const ANIMALS: Readonly<Record<AnimalId, AnimalInfo>> = {
    dragon: {
        id: AnimalId.dragon,
        name: "Dragon",
        emoji: "🐉",
        breathName: "Fire breath",
        breathText:
            "A line of fire that defeats the first enemy it hits. Burning cells block enemies for 2 s.",
        statText: "Balanced",
    },
    penguin: {
        id: AnimalId.penguin,
        name: "Penguin",
        emoji: "🐧",
        breathName: "Ice breath",
        breathText:
            "A cone that freezes enemies for 3 s and turns the floor to ice for 5 s.",
        statText: "Slides faster on ice",
    },
    owl: {
        id: AnimalId.owl,
        name: "Owl",
        emoji: "🦉",
        breathName: "Wind breath",
        breathText:
            "Blows every enemy in a line back 3 cells, even through tunnels.",
        statText: "Cheap breath, short cooldown",
    },
    skunk: {
        id: AnimalId.skunk,
        name: "Skunk",
        emoji: "🦨",
        breathName: "Smelly breath",
        breathText:
            "A stink cloud around you for 5 s. Enemies won't go in and turn back inside it.",
        statText: "Bigger energy meter",
    },
    boar: {
        id: AnimalId.boar,
        name: "Boar",
        emoji: "🐗",
        breathName: "Wall-break breath",
        breathText:
            "Breaks the wall in front of you. It grows back after 10 s. Outer walls hold.",
        statText: "Costly breath, slower movement",
    },
}
