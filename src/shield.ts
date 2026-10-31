// The block look (KDA-288): for a moment after an enemy blocks a punch with
// its guard (see guard.ts), a 🛡 shows over it. Purely visual, like jab.ts:
// eventEffects.ts starts one on each punchBlocked event, main.ts moves them
// on with the game's ticks (so they freeze while paused) and render.ts
// draws them over the enemy, wherever it is drawn. Pure, no DOM. The
// numbers are placeholders to tune at preview.

// How long a shield shows, in seconds.
export const SHIELD_SECONDS = 0.3

// One enemy's shield: which enemy (its index in GameState.enemies) and how
// long ago it blocked, in seconds.
export type Shield = { enemy: number; age: number }

export type Shields = {
    // Start a shield over `enemy`, replacing any it has.
    add(enemy: number): void
    // Age every shield by `dt` seconds, dropping those that are over.
    update(dt: number): void
    // Drop every shield, e.g. when a new game starts.
    clear(): void
    readonly list: readonly Shield[]
}

export function createShields(): Shields {
    let list: Shield[] = []
    return {
        add(enemy) {
            list = [...list.filter((s) => s.enemy !== enemy), { enemy, age: 0 }]
        },
        update(dt) {
            list = list
                .map((s) => ({ ...s, age: s.age + dt }))
                .filter((s) => s.age < SHIELD_SECONDS)
        },
        clear() {
            list = []
        },
        get list() {
            return list
        },
    }
}
