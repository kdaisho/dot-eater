import type { MomentKind } from "./highlights"

// The directed scenes: short runs, each played by the director bot
// (scripts/director.ts) to show off one thing, saved as
// recordings/scenes/<name>.json (`pnpm --filter dot-eater-video
// record-scenes`).

export const SCENE_NAMES = [
    "hook",
    "dragon",
    "penguin",
    "owl",
    "skunk",
    "boar",
    "punch",
    "guard",
    "breather",
    "boss",
] as const

export type SceneName = (typeof SCENE_NAMES)[number]

// The kind of each scene's hero moment (see heroMoment in highlights.ts):
// the one tick the edit lands on a beat.
export const HERO_KIND: Readonly<Record<SceneName, MomentKind>> = {
    // A frantic chase: the closest call.
    hook: "nearMiss",
    // The fire reaches an enemy.
    dragon: "enemyDefeated",
    // Enemies turn to ice blocks.
    penguin: "enemyFrozen",
    // The gust throws an enemy back.
    owl: "enemyBlown",
    // An enemy turns back at the stink cloud.
    skunk: "enemyRepelled",
    // A wall bursts into rubble.
    boar: "wallBroken",
    // A punch knocks an enemy back.
    punch: "punchHit",
    // An enemy's guard blocks a punch.
    guard: "punchBlocked",
    // A breather's breath hurts the player.
    breather: "hurt",
    // The boss goes down.
    boss: "bossDefeated",
}
