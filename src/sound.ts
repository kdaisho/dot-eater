// What the game sounds like when (KDA-212): which effect each game event
// plays, which tune each screen plays, and the menu sounds that screen
// changes make. Pure, no DOM: main.ts hands it the audio engine (audio.ts)
// along with the events and screens.

import { volumesOf, type Audio } from "./audio"
import type { GameEvent } from "./events"
import { storyCardTimedOut, type Screen } from "./flow"
import { MusicTrackId, stageTrack } from "./music"
import type { PresentContent } from "./present"
import type { Settings } from "./settings"
import { breathSfx, SfxId } from "./sfx"

// The effect a game event plays, if any. A dot growing back (KDA-269)
// plays nothing: dots regrow about as often as they are eaten, so a sound for
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
        case "rammed":
            return SfxId.ram
        case "knockedFlying":
            // The ram's thud and the defeat's chirps say it all.
            return undefined
        case "bossHit":
            return SfxId.bossHit
        case "bossDefeated":
            return SfxId.bossDefeated
        case "bossShattered":
            return SfxId.bossShatter
        case "bossBlast":
            return event.big ? SfxId.bossBigBlast : SfxId.bossBlast
        case "bossWindUp":
            return SfxId.bossWindUp
        case "bossBreathed":
            return SfxId.bossBreath
        case "enemyWindUp":
            return SfxId.enemyWindUp
        case "enemyBreathed":
            return SfxId.enemyBreath
        case "hurt":
            return SfxId.hurt
        case "playerCaught":
            return SfxId.caught
        case "playerPanicked":
            return SfxId.panicked
        case "presentDropped":
            return SfxId.presentDropped
        case "presentOpened":
            return PRESENT_SFX[event.content]
        case "presentExpired":
            // Its puff is enough.
            return undefined
        case "gameWon":
            return SfxId.stageClear
        case "gameLost":
            return SfxId.gameOver
        case "dotRegrown":
            return undefined
    }
}

// The sound a present box (KDA-324) opens with, by what was inside.
export const PRESENT_SFX: Readonly<Record<PresentContent, SfxId>> = {
    heal: SfxId.presentHeal,
    hugeDot: SfxId.presentHugeDot,
    speed: SfxId.presentSpeed,
    quake: SfxId.presentQuake,
    germ: SfxId.presentGerm,
}

// The effects a tick's events play, each once (two dots eaten on one tick
// are one blip), in the order they first happened. The game over jingle
// replaces a catch on the same tick, though the game's gameLost now waits
// for the knockout's effect and sound (KDA-329, GameState.lossHeld).
export function eventSounds(events: readonly GameEvent[]): SfxId[] {
    const ids = new Set<SfxId>()
    for (const event of events) {
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

// The tune a screen plays: the title's on the title, Tutorial and Cards and the
// menus (the story menus too), the stage's while playing, frozen while paused
// (settings opened from pause included). None from the ending outro on, so
// the stage clear and game over jingles play alone; the result screens,
// story mode's clear card and ending included, stay quiet. The end roll
// plays its own track (endRoll.ts). Leaving for the soundtrack player
// page (KDA-333) stops the music: that page plays its own.
export type MusicCue = { track: MusicTrackId; paused: boolean }

export function musicForScreen(screen: Screen): MusicCue | undefined {
    switch (screen.kind) {
        // The opening's own track once its title shows; quiet on the
        // studio logo.
        case "opening":
            return screen.stage === "title"
                ? { track: MusicTrackId.opening, paused: false }
                : undefined
        case "soundtrack":
            return undefined
        case "title":
        case "tutorial":
        case "cards":
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
        case "stageClear":
        case "gameOver":
        case "storyClear":
        case "storyEnd":
            return undefined
        case "endRoll":
            return { track: MusicTrackId.endRoll, paused: false }
    }
}

// Back moves: one menu up, or leaving settings (but not for the controls
// screen, which is a step in).
function isBack(prev: Screen, next: Screen): boolean {
    return (
        ((prev.kind === "playSelect" ||
            prev.kind === "tutorial" ||
            prev.kind === "cards") &&
            next.kind === "title") ||
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
    if (prev.kind === "opening" && next.kind === "opening")
        return prev.choice !== next.choice ? SfxId.menuMove : undefined
    if (prev.kind === "title" && next.kind === "title")
        return prev.mode !== next.mode || prev.on !== next.on
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
    // The story clear card starting the next stage by itself: nobody
    // pressed anything, so no confirm.
    if (prev.kind === "storyClear" && storyCardTimedOut(prev)) return undefined
    // The ALL CLEAR card always starts the end roll by itself (KDA-323).
    if (prev.kind === "storyEnd") return undefined
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
