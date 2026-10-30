// What the game sounds like when (KDA-212): which effect each game event
// plays, which tune each screen plays, and the menu sounds that screen
// changes make. Pure, no DOM: main.ts hands it the audio engine (audio.ts)
// along with the events and screens.

import { volumesOf, type Audio } from "./audio"
import type { GameEvent } from "./events"
import type { Screen } from "./flow"
import { MusicTrackId, stageTrack } from "./music"
import type { Settings } from "./settings"
import { breathSfx, SfxId } from "./sfx"

// The effect a game event plays, if any. playerRespawned plays nothing: a
// versus player coming back makes no sound. Nor does a dot growing back
// (KDA-269): dots regrow about as often as they are eaten, so a sound for
// it would echo every dot blip a few seconds later, often off screen; its
// sparkle is enough.
export function soundForEvent(event: GameEvent): SfxId | undefined {
    switch (event.type) {
        case "dotEaten":
            return SfxId.dot
        case "dotDropped":
            return SfxId.dotDropped
        case "breathed":
            return breathSfx(event.animal)
        case "enemyDefeated":
            return SfxId.enemyDefeated
        case "bossHit":
            return SfxId.bossHit
        case "bossDefeated":
            return SfxId.bossDefeated
        case "bossWindUp":
            return SfxId.bossWindUp
        case "bossBreathed":
            return SfxId.bossBreath
        case "hurt":
            return SfxId.hurt
        case "playerCaught":
            return SfxId.caught
        case "playerStunned":
            return SfxId.stunned
        case "punched":
            return SfxId.punch
        case "punchHit":
            return event.target === "boss" ? SfxId.punchHitBoss : SfxId.punchHit
        case "gameWon":
            return SfxId.stageClear
        case "gameLost":
            return SfxId.gameOver
        case "playerRespawned":
        case "dotRegrown":
            return undefined
    }
}

// The effects a tick's events play, each once (two dots eaten on one tick
// are one blip), in the order they first happened. The game over jingle
// replaces the catch that lost the game. Each punch is one sound: its
// first hit's if it landed (a punch reports enemies first, so an enemy's
// thwack wins over the boss's thud), else its whiff. A player punches once
// a tick at most, so one player's punch never silences the other's.
export function eventSounds(events: readonly GameEvent[]): SfxId[] {
    const landed = new Set(
        events.flatMap((e) => (e.type === "punchHit" ? [e.player] : []))
    )
    // Players whose punch has made its sound this tick.
    const sounded = new Set<number>()
    const ids = new Set<SfxId>()
    for (const event of events) {
        if (event.type === "punched" && landed.has(event.player)) continue
        if (event.type === "punchHit") {
            if (sounded.has(event.player)) continue
            sounded.add(event.player)
        }
        const id = soundForEvent(event)
        if (id) ids.add(id)
    }
    if (ids.has(SfxId.gameOver)) ids.delete(SfxId.caught)
    return [...ids]
}

export function playEventSounds(
    audio: Pick<Audio, "playSfx">,
    events: readonly GameEvent[]
) {
    for (const id of eventSounds(events)) audio.playSfx(id)
}

// The tune a screen plays: the title's on the title and the menus (the
// story menus too), the stage's while playing, frozen while paused
// (settings opened from pause included). None from the ending outro on, so
// the stage clear and game over jingles play alone; the result screens,
// story mode's clear card and ending included, stay quiet.
export type MusicCue = { track: MusicTrackId; paused: boolean }

export function musicForScreen(screen: Screen): MusicCue | undefined {
    switch (screen.kind) {
        case "title":
        case "playSelect":
        case "storyMenu":
        case "stageSelect":
        case "difficultySelect":
        case "characterSelect":
            return { track: MusicTrackId.title, paused: false }
        case "settings":
        case "controls":
            return musicForScreen(screen.back)
        case "playing":
            return { track: stageTrack(screen.level), paused: false }
        case "paused":
            return { track: stageTrack(screen.level), paused: true }
        case "ending":
        case "roundResult":
        case "matchResult":
        case "stageClear":
        case "gameOver":
        case "storyClear":
        case "storyEnd":
            return undefined
    }
}

// Back moves: one menu up, or leaving settings (but not for the controls
// screen, which is a step in).
function isBack(prev: Screen, next: Screen): boolean {
    return (
        (prev.kind === "playSelect" && next.kind === "title") ||
        (prev.kind === "storyMenu" && next.kind === "playSelect") ||
        (prev.kind === "stageSelect" &&
            (next.kind === "title" || next.kind === "playSelect")) ||
        (prev.kind === "difficultySelect" && next.kind === prev.back.kind) ||
        (prev.kind === "characterSelect" && next.kind === "difficultySelect") ||
        (prev.kind === "settings" && next.kind !== "controls") ||
        prev.kind === "controls"
    )
}

function readyCount(ready: readonly boolean[]): number {
    return ready.filter(Boolean).length
}

// A change within one menu: the cursor moved or a value changed.
function sameScreenSound(prev: Screen, next: Screen): SfxId | undefined {
    if (prev.kind === "title" && next.kind === "title")
        return prev.mode !== next.mode || prev.onSettings !== next.onSettings
            ? SfxId.menuMove
            : undefined
    if (prev.kind === "settings" && next.kind === "settings")
        return prev.row !== next.row || prev.settings !== next.settings
            ? SfxId.menuMove
            : undefined
    if (prev.kind === "controls" && next.kind === "controls") {
        // A prompt opening, or a key or button bound, confirms; a cancel
        // (nothing bound) goes back. Reset to defaults confirms too.
        if (!prev.capturing && next.capturing) return SfxId.confirm
        if (prev.capturing && !next.capturing)
            return prev.settings !== next.settings ? SfxId.confirm : SfxId.back
        if (prev.settings !== next.settings) return SfxId.confirm
        return prev.row !== next.row || prev.player !== next.player
            ? SfxId.menuMove
            : undefined
    }
    if (prev.kind === "stageSelect" && next.kind === "stageSelect")
        return prev.selected !== next.selected ? SfxId.menuMove : undefined
    if (prev.kind === "difficultySelect" && next.kind === "difficultySelect")
        return prev.difficulty !== next.difficulty ? SfxId.menuMove : undefined
    if (prev.kind === "characterSelect" && next.kind === "characterSelect") {
        const was = readyCount(prev.ready)
        const now = readyCount(next.ready)
        if (now > was) return SfxId.confirm
        if (now < was) return SfxId.back
        return prev.picks.some((p, i) => p !== next.picks[i])
            ? SfxId.menuMove
            : undefined
    }
    // A pause screen made from play has no choice yet: it is on Resume.
    if (prev.kind === "paused" && next.kind === "paused")
        return (prev.choice ?? "resume") !== (next.choice ?? "resume")
            ? SfxId.menuMove
            : undefined
    if ("choice" in prev && "choice" in next)
        return prev.choice !== next.choice ? SfxId.menuMove : undefined
    return undefined
}

// The menu sound a screen change makes, if any. Entering or leaving pause
// plays `pause`; going back plays `back`; any other move from a menu to
// another screen is a confirm. Play, the outro and their results make none
// (game events sound for those).
export function menuSound(prev: Screen, next: Screen): SfxId | undefined {
    if (prev.kind === next.kind) return sameScreenSound(prev, next)
    if (
        (prev.kind === "playing" && next.kind === "paused") ||
        (prev.kind === "paused" && next.kind === "playing")
    )
        return SfxId.pause
    if (prev.kind === "playing" || prev.kind === "ending") return undefined
    if (isBack(prev, next)) return SfxId.back
    return SfxId.confirm
}

// Bring the audio in line with a screen change: the menu sound, the tune
// for the new screen (frozen or resumed in place) and the volumes, which
// the settings screen changes live. `prev` is left out on startup.
export function screenSound(
    audio: Audio,
    prev: Screen | undefined,
    next: Screen,
    settings: Settings
) {
    audio.setVolumes(volumesOf(settings))
    const cue = musicForScreen(next)
    if (!cue) {
        audio.stopMusic()
    } else {
        audio.playMusic(cue.track)
        if (cue.paused) audio.pauseMusic()
        else audio.resumeMusic()
    }
    const sound = prev && menuSound(prev, next)
    if (sound) audio.playSfx(sound)
}
