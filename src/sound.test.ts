import { describe, expect, it, vi } from "vite-plus/test"
import { type Audio } from "./audio"
import { DEFAULT_BINDINGS, rebind } from "./bindings"
import type { GameEvent } from "./events"
import { initialScreen, STORY_CARD_SECONDS, type Screen } from "./flow"
import type { GameState } from "./game"
import { ANIMAL_IDS } from "./roster"
import { defaultSettings } from "./settings"
import {
    eventSounds,
    menuSound,
    musicForScreen,
    playEventSounds,
    screenSound,
    soundForEvent,
} from "./sound"
import { breathSfx } from "./sfx"
import { vec2 } from "./vec2"

const at = vec2(1, 1)
const game = {} as GameState
const settings = defaultSettings()

// A screen of one kind.
type ScreenOf<K extends Screen["kind"]> = Extract<Screen, { kind: K }>

const title: ScreenOf<"title"> = { kind: "title", mode: "solo" }
const stageSelect: Screen = { kind: "stageSelect", mode: "solo", selected: 0 }
const difficultySelect: ScreenOf<"difficultySelect"> = {
    kind: "difficultySelect",
    mode: "coop",
    difficulty: "medium",
    next: { kind: "characterSelect", level: 0 },
    back: { kind: "stageSelect", mode: "coop", selected: 0 },
}
const characterSelect: Screen = {
    kind: "characterSelect",
    mode: "coop",
    level: 0,
    difficulty: "medium",
    picks: ["dragon", "owl"],
    ready: [false, false],
}
const playing = (level = 0): Screen => ({
    kind: "playing",
    mode: "solo",
    level,
    difficulty: "medium",
    animals: ["dragon"],
    game,
})
const paused = (level = 0): ScreenOf<"paused"> => ({
    kind: "paused",
    mode: "solo",
    level,
    difficulty: "medium",
    animals: ["dragon"],
    game,
})
const ending: Screen = {
    kind: "ending",
    mode: "solo",
    level: 0,
    difficulty: "medium",
    animals: ["dragon"],
    game,
    outcome: "won",
}
const gameOver: Screen = {
    kind: "gameOver",
    mode: "solo",
    level: 0,
    difficulty: "medium",
    animals: ["dragon"],
    game,
    choice: "retry",
}
const settingsOver = (
    back: ScreenOf<"title" | "paused">
): ScreenOf<"settings"> => ({
    kind: "settings",
    mode: "solo",
    back,
    row: 0,
    settings,
})

describe("soundForEvent", () => {
    it("maps each game event to its effect", () => {
        const cases: [GameEvent, string | undefined][] = [
            [{ type: "dotEaten", player: 0, at }, "dot"],
            [
                {
                    type: "enemyDefeated",
                    player: 0,
                    enemy: 1,
                    at,
                    split: false,
                },
                "enemyDefeated",
            ],
            [{ type: "bossHit", player: 0, at, health: 3 }, "bossHit"],
            [{ type: "bossDefeated", player: 1, at }, "bossDefeated"],
            [{ type: "bossWindUp", at, facing: at }, "boss.windUp"],
            [
                { type: "bossBreathed", at, facing: at, cells: [at] },
                "boss.breath",
            ],
            [
                { type: "enemyWindUp", enemy: 0, at, facing: at },
                "breather.windUp",
            ],
            [
                {
                    type: "enemyBreathed",
                    enemy: 0,
                    at,
                    facing: at,
                    cells: [at],
                },
                "breather.breath",
            ],
            [{ type: "hurt", player: 0, at, damage: 25 }, "hurt"],
            [
                { type: "playerCaught", player: 0, at, outForGood: false },
                "caught",
            ],
            [{ type: "playerStunned", player: 1, by: 0, at }, "stunned"],
            [{ type: "punched", player: 0, at, facing: vec2(1, 0) }, "punch"],
            [
                { type: "punchHit", player: 0, at, target: "enemy", enemy: 1 },
                "punchHit",
            ],
            [{ type: "punchHit", player: 1, at, target: "player" }, "punchHit"],
            [
                { type: "punchHit", player: 0, at, target: "boss" },
                "punchHit.boss",
            ],
            [
                {
                    type: "punchBlocked",
                    player: 0,
                    at,
                    facing: vec2(1, 0),
                    enemy: 1,
                },
                "punch.blocked",
            ],
            [{ type: "gameWon" }, "stageClear"],
            [{ type: "gameLost" }, "gameOver"],
            [{ type: "playerRespawned", player: 0, at }, undefined],
            [{ type: "dotRegrown", at }, undefined],
            [{ type: "dotDropped", enemy: 0, at }, "dotDropped"],
        ]
        for (const [event, sound] of cases)
            expect(soundForEvent(event), event.type).toBe(sound)
    })

    it("plays each animal's own breath", () => {
        for (const animal of ANIMAL_IDS) {
            const event: GameEvent = {
                type: "breathed",
                player: 0,
                animal,
                at,
                facing: vec2(1, 0),
                cells: [at],
            }
            expect(soundForEvent(event)).toBe(breathSfx(animal))
        }
    })
})

describe("eventSounds", () => {
    it("plays each sound once per tick, in order", () => {
        expect(
            eventSounds([
                { type: "dotEaten", player: 0, at },
                { type: "playerStunned", player: 1, by: 0, at },
                { type: "dotEaten", player: 1, at },
            ])
        ).toEqual(["dot", "stunned"])
        expect(eventSounds([])).toEqual([])
    })

    it("makes a versus knockout and coming back one sound", () => {
        expect(
            eventSounds([
                { type: "playerCaught", player: 0, at, outForGood: false },
                { type: "playerRespawned", player: 1, at },
            ])
        ).toEqual(["caught"])
    })

    it("lets the game over jingle replace the catch that lost the game", () => {
        expect(
            eventSounds([
                { type: "playerCaught", player: 0, at, outForGood: true },
                { type: "gameLost" },
            ])
        ).toEqual(["gameOver"])
    })

    it("plays a landed punch as its hit only, not a whiff too", () => {
        const punched: GameEvent = {
            type: "punched",
            player: 0,
            at,
            facing: vec2(1, 0),
        }
        expect(eventSounds([punched])).toEqual(["punch"])
        expect(
            eventSounds([
                punched,
                { type: "punchHit", player: 0, at, target: "enemy", enemy: 0 },
            ])
        ).toEqual(["punchHit"])
        expect(
            eventSounds([
                punched,
                { type: "punchHit", player: 0, at, target: "boss" },
            ])
        ).toEqual(["punchHit.boss"])
    })

    // Regression: a punch hitting an enemy and the boss played both the
    // thwack and the thud.
    it("plays one hit sound per punch, the enemy's over the boss's", () => {
        const punched: GameEvent = {
            type: "punched",
            player: 0,
            at,
            facing: vec2(1, 0),
        }
        expect(
            eventSounds([
                punched,
                { type: "punchHit", player: 0, at, target: "enemy", enemy: 0 },
                { type: "punchHit", player: 0, at, target: "boss" },
            ])
        ).toEqual(["punchHit"])
        // Another player's punch on the boss still thuds.
        expect(
            eventSounds([
                punched,
                { type: "punchHit", player: 0, at, target: "enemy", enemy: 0 },
                { type: "punchHit", player: 1, at, target: "boss" },
            ])
        ).toEqual(["punchHit", "punchHit.boss"])
    })

    // Regression: any landed punch dropped the whiff for the whole tick,
    // so player 1's miss was silent when player 2's punch landed.
    it("plays one player's whiff alongside the other's hit", () => {
        const punched = (player: number): GameEvent => ({
            type: "punched",
            player,
            at,
            facing: vec2(1, 0),
        })
        expect(
            eventSounds([
                punched(0),
                punched(1),
                { type: "punchHit", player: 1, at, target: "player" },
            ])
        ).toEqual(["punch", "punchHit"])
    })

    it("plays a blocked punch as its thock, under a landed hit (KDA-288)", () => {
        const punched = (player: number): GameEvent => ({
            type: "punched",
            player,
            at,
            facing: vec2(1, 0),
        })
        const blocked = (player: number): GameEvent => ({
            type: "punchBlocked",
            player,
            at,
            facing: vec2(1, 0),
            enemy: 0,
        })
        // A thock over the whiff.
        expect(eventSounds([punched(0), blocked(0)])).toEqual(["punch.blocked"])
        // A hit's thwack over the thock, whichever is nearer.
        expect(
            eventSounds([
                punched(0),
                blocked(0),
                { type: "punchHit", player: 0, at, target: "enemy", enemy: 1 },
            ])
        ).toEqual(["punchHit"])
        // The boss's thud is a hit too.
        expect(
            eventSounds([
                punched(0),
                blocked(0),
                { type: "punchHit", player: 0, at, target: "boss" },
            ])
        ).toEqual(["punchHit.boss"])
        // One player's block doesn't silence the other's whiff.
        expect(eventSounds([punched(0), blocked(0), punched(1)])).toEqual([
            "punch.blocked",
            "punch",
        ])
    })

    it("plays them on the audio engine", () => {
        const audio = { playSfx: vi.fn() }
        playEventSounds(audio, [
            { type: "dotEaten", player: 0, at },
            { type: "gameWon" },
        ])
        expect(audio.playSfx.mock.calls).toEqual([["dot"], ["stageClear"]])
    })
})

describe("musicForScreen", () => {
    it("plays the title tune on the title and the menus before play", () => {
        for (const screen of [
            initialScreen(),
            stageSelect,
            difficultySelect,
            characterSelect,
            settingsOver({ kind: "title", mode: "solo" }),
        ])
            expect(musicForScreen(screen), screen.kind).toEqual({
                track: "title",
                paused: false,
            })
    })

    it("plays the stage's tune while playing, frozen while paused", () => {
        expect(musicForScreen(playing(2))).toEqual({
            track: "stage3",
            paused: false,
        })
        expect(musicForScreen(paused(2))).toEqual({
            track: "stage3",
            paused: true,
        })
        expect(musicForScreen(settingsOver(paused(4)))).toEqual({
            track: "stage5",
            paused: true,
        })
    })

    it("is quiet from the outro on, for the jingles", () => {
        expect(musicForScreen(ending)).toBeUndefined()
        expect(musicForScreen(gameOver)).toBeUndefined()
    })

    it("plays the end roll's own track on the end roll", () => {
        const endRoll: Screen = {
            kind: "endRoll",
            mode: "solo",
            difficulty: "hard",
            elapsed: { seconds: 12 },
        }
        expect(musicForScreen(endRoll)).toEqual({
            track: "endRoll",
            paused: false,
        })
    })
})

describe("menuSound", () => {
    it("blips when a menu's cursor moves or a value changes", () => {
        expect(menuSound(title, { kind: "title", mode: "coop" })).toBe(
            "menuMove"
        )
        expect(
            menuSound(title, { kind: "title", mode: "solo", onSettings: true })
        ).toBe("menuMove")
        expect(menuSound(stageSelect, { ...stageSelect, selected: 1 })).toBe(
            "menuMove"
        )
        expect(
            menuSound(difficultySelect, {
                ...difficultySelect,
                difficulty: "hard",
            })
        ).toBe("menuMove")
        expect(menuSound(difficultySelect, { ...difficultySelect })).toBe(
            undefined
        )
        expect(
            menuSound(characterSelect, {
                ...characterSelect,
                picks: ["dragon", "boar"],
            })
        ).toBe("menuMove")
        expect(
            menuSound(gameOver, { ...gameOver, choice: "stageSelect" })
        ).toBe("menuMove")
        const s = settingsOver(title)
        expect(menuSound(s, { ...s, row: 1 })).toBe("menuMove")
        expect(
            menuSound(s, { ...s, settings: { ...settings, musicVolume: 3 } })
        ).toBe("menuMove")
    })

    it("blips on the first move of a pause menu made from play", () => {
        // From play, the pause screen has no choice yet (on Resume).
        expect(menuSound(paused(), { ...paused(), choice: "settings" })).toBe(
            "menuMove"
        )
        expect(menuSound({ ...paused(), choice: "settings" }, paused())).toBe(
            "menuMove"
        )
        expect(menuSound(paused(), { ...paused(), choice: "resume" })).toBe(
            undefined
        )
    })

    it("is quiet when a screen changes without its cursor", () => {
        expect(
            menuSound(gameOver, { ...gameOver, shown: { seconds: 1 } })
        ).toBe(undefined)
        expect(menuSound(playing(), playing())).toBeUndefined()
    })

    it("confirms going forward, and a player's ready", () => {
        expect(menuSound(title, stageSelect)).toBe("confirm")
        expect(menuSound(stageSelect, difficultySelect)).toBe("confirm")
        expect(menuSound(difficultySelect, characterSelect)).toBe("confirm")
        expect(menuSound(characterSelect, playing())).toBe("confirm")
        expect(menuSound(gameOver, playing())).toBe("confirm")
        expect(
            menuSound(characterSelect, {
                ...characterSelect,
                ready: [true, false],
            })
        ).toBe("confirm")
    })

    it("goes back one menu up, out of settings, or taking a ready back", () => {
        expect(menuSound(stageSelect, title)).toBe("back")
        expect(menuSound(difficultySelect, difficultySelect.back)).toBe("back")
        expect(menuSound(characterSelect, difficultySelect)).toBe("back")
        expect(menuSound(settingsOver(paused()), paused())).toBe("back")
        expect(
            menuSound(
                { ...characterSelect, ready: [true, false] },
                characterSelect
            )
        ).toBe("back")
    })

    it("pauses and resumes with the pause sound", () => {
        expect(menuSound(playing(), paused())).toBe("pause")
        expect(menuSound(paused(), playing())).toBe("pause")
    })

    it("leaves the end of a game to the game's own sounds", () => {
        expect(menuSound(playing(), ending)).toBeUndefined()
        expect(menuSound(ending, gameOver)).toBeUndefined()
    })
})

describe("screenSound", () => {
    function fakeAudio() {
        return {
            unlock: vi.fn(),
            setVolumes: vi.fn(),
            playSfx: vi.fn(),
            playMusic: vi.fn(),
            stopMusic: vi.fn(),
            pauseMusic: vi.fn(),
            resumeMusic: vi.fn(),
            unlocked: true,
            music: undefined,
            musicPaused: false,
        } satisfies Audio
    }

    it("applies the volumes from settings on every screen change", () => {
        const audio = fakeAudio()
        screenSound(audio, undefined, title, {
            ...settings,
            musicVolume: 2,
            effectsVolume: 9,
            muted: true,
        })
        expect(audio.setVolumes).toHaveBeenCalledWith({
            music: 2,
            effects: 9,
            muted: true,
        })
    })

    it("starts the title tune on startup, with no menu sound", () => {
        const audio = fakeAudio()
        screenSound(audio, undefined, initialScreen(), settings)
        expect(audio.playMusic).toHaveBeenCalledWith("title")
        expect(audio.resumeMusic).toHaveBeenCalled()
        expect(audio.playSfx).not.toHaveBeenCalled()
    })

    it("freezes the tune on pause and resumes it after", () => {
        const audio = fakeAudio()
        screenSound(audio, playing(1), paused(1), settings)
        expect(audio.playMusic).toHaveBeenLastCalledWith("stage2")
        expect(audio.pauseMusic).toHaveBeenCalledTimes(1)
        expect(audio.playSfx).toHaveBeenCalledWith("pause")
        screenSound(audio, paused(1), playing(1), settings)
        expect(audio.resumeMusic).toHaveBeenCalledTimes(1)
    })

    it("stops the tune when the game ends", () => {
        const audio = fakeAudio()
        screenSound(audio, playing(), ending, settings)
        expect(audio.stopMusic).toHaveBeenCalled()
        expect(audio.playMusic).not.toHaveBeenCalled()
    })
})

// The controls screen (KDA-215) sits on the title's settings.
describe("the controls screen", () => {
    const back = { ...settingsOver(title), row: 4 }
    const controls: ScreenOf<"controls"> = {
        kind: "controls",
        mode: "solo",
        back,
        player: 0,
        row: 0,
        settings,
    }
    const capturing = { ...controls, capturing: true }

    it("keeps the title tune playing", () => {
        expect(musicForScreen(controls)).toEqual({
            track: "title",
            paused: false,
        })
    })

    it("confirms going in and goes back out", () => {
        expect(menuSound(back, controls)).toBe("confirm")
        expect(menuSound(controls, back)).toBe("back")
    })

    it("blips when the cursor or the player changes", () => {
        expect(menuSound(controls, { ...controls, row: 1 })).toBe("menuMove")
        expect(menuSound(controls, { ...controls, player: 1 })).toBe("menuMove")
        expect(menuSound(controls, controls)).toBeUndefined()
    })

    it("confirms a prompt, a binding and a reset, and backs out of a cancel", () => {
        const rebound = {
            ...settings,
            bindings: rebind(DEFAULT_BINDINGS, 0, "breath", "KeyB"),
        }
        expect(menuSound(controls, capturing)).toBe("confirm")
        expect(menuSound(capturing, { ...controls, settings: rebound })).toBe(
            "confirm"
        )
        expect(menuSound(capturing, controls)).toBe("back")
        expect(menuSound({ ...controls, settings: rebound }, controls)).toBe(
            "confirm"
        )
    })
})

describe("story mode (KDA-271)", () => {
    const playSelect: ScreenOf<"playSelect"> = {
        kind: "playSelect",
        mode: "solo",
        choice: "story",
    }
    const storyMenu: ScreenOf<"storyMenu"> = {
        kind: "storyMenu",
        mode: "solo",
        choice: "continue",
    }
    const run = { total: 100, from: "continue" } as const
    const rating = {
        ticks: 600,
        parTime: 60,
        healthy: true,
        underPar: true,
        stars: 3,
    } as const
    const cleared = {
        mode: "solo",
        level: 0,
        difficulty: "medium",
        animals: ["dragon"],
        game,
        run,
        rating,
    } as const
    const storyClear: Screen = { kind: "storyClear", ...cleared, next: 1 }
    const storyEnd: Screen = { kind: "storyEnd", ...cleared }

    it("plays the title tune on the story menus", () => {
        for (const screen of [playSelect, storyMenu])
            expect(musicForScreen(screen), screen.kind).toEqual({
                track: "title",
                paused: false,
            })
    })

    it("plays the stage's tune in a run's game", () => {
        expect(musicForScreen({ ...playing(1), run } as Screen)).toEqual({
            track: "stage2",
            paused: false,
        })
    })

    it("leaves the clear card and the ending to the stage clear jingle", () => {
        expect(musicForScreen(storyClear)).toBeUndefined()
        expect(musicForScreen(storyEnd)).toBeUndefined()
    })

    it("blips on the story menus' moves", () => {
        expect(menuSound(playSelect, { ...playSelect, choice: "stage" })).toBe(
            "menuMove"
        )
        expect(menuSound(storyMenu, { ...storyMenu, choice: "newStory" })).toBe(
            "menuMove"
        )
    })

    it("confirms going forward and goes back one menu up", () => {
        expect(menuSound(title, playSelect)).toBe("confirm")
        expect(menuSound(playSelect, storyMenu)).toBe("confirm")
        expect(menuSound(playSelect, stageSelect)).toBe("confirm")
        expect(menuSound(playSelect, title)).toBe("back")
        expect(menuSound(storyMenu, playSelect)).toBe("back")
        expect(menuSound(stageSelect, playSelect)).toBe("back")
        const storyDifficulty: Screen = { ...difficultySelect, back: storyMenu }
        expect(menuSound(storyMenu, storyDifficulty)).toBe("confirm")
        expect(menuSound(storyDifficulty, storyMenu)).toBe("back")
    })

    it("confirms the next stage from the clear card, quietly entered", () => {
        expect(menuSound(storyClear, playing(1))).toBe("confirm")
        expect(menuSound(ending, storyClear)).toBeUndefined()
        expect(menuSound(ending, storyEnd)).toBeUndefined()
    })

    // Regression: the card starting the next stage by itself played the
    // confirm sound, with nothing pressed.
    it("is quiet when the card starts the next stage by itself", () => {
        const waited = (seconds: number): Screen => ({
            ...(storyClear as ScreenOf<"storyClear">),
            waited: { seconds },
        })
        expect(
            menuSound(waited(STORY_CARD_SECONDS), playing(1))
        ).toBeUndefined()
        expect(menuSound(waited(1), playing(1))).toBe("confirm")
    })
})
