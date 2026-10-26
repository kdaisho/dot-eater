// The character picked last, so character select opens on it next time.
//
// Kept under its own key, apart from saved progress, so neither save format
// has to know about the other. As in progress.ts, storage is passed in and
// every access is wrapped in try/catch: storage can be missing, blocked or
// full, and none of that may break the game. The value is the plain
// AnimalId string; anything else (nothing saved, an unknown or retired id)
// gives DEFAULT_ANIMAL.
//
// One pick for now: player 1's. 2-player (KDA-211) can save player 2's
// under a key of its own.

import { DEFAULT_ANIMAL, isAnimalId, type AnimalId } from "./roster"

export const LAST_PICK_KEY = "dot-eater:character:v1"

// The part of the Web Storage API this module uses.
export type PickStorage = Pick<Storage, "getItem" | "setItem">

// A saved string as a pick; DEFAULT_ANIMAL when it isn't a known id.
export function parseLastPick(raw: string | null): AnimalId {
    return isAnimalId(raw) ? raw : DEFAULT_ANIMAL
}

// Load the last pick; DEFAULT_ANIMAL when there is no storage, it throws, or
// what it holds isn't a known character.
export function loadLastPick(storage: PickStorage | undefined): AnimalId {
    try {
        return parseLastPick(storage?.getItem(LAST_PICK_KEY) ?? null)
    } catch {
        return DEFAULT_ANIMAL
    }
}

// Save the pick; returns whether it was written. Failure is silent: the
// game remembers the pick for this session only.
export function saveLastPick(
    storage: PickStorage | undefined,
    animal: AnimalId
): boolean {
    if (!storage) return false
    try {
        storage.setItem(LAST_PICK_KEY, animal)
        return true
    } catch {
        return false
    }
}
