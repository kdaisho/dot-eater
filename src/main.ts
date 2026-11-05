import type { Random } from "./ai"
import {
    captureButton,
    captureKey,
    effectiveBindings,
    FIXED_PAUSE_KEY,
    sameBindings,
    type Bindings,
} from "./bindings"
import { adminScreen, loadAdmin, saveAdmin, unlockAll } from "./admin"
import { createAdminBadge } from "./adminBadge"
import { createAdminPanel } from "./adminPanel"
import { browserAudioContext, createAudio, volumesOf } from "./audio"
import { RECORDED_TRACKS, trackProgress } from "./recorded"
import { SOUNDTRACK } from "./soundtrack"
import { createMuteButton } from "./muteButton"
import { playEventSounds, screenSound } from "./sound"
import { cancelCharge, energyHud } from "./breath"
import { swipeStep } from "./cards"
import { cardsPageStale } from "./cardsView"
import {
    drawEndRoll,
    END_ROLL_HEIGHT,
    END_ROLL_WIDTH,
    loadEndRollFont,
} from "./endRollRender"
import { MAX_FRAME_MS, TICK_MS } from "./constants"
import {
    DIFFICULTIES,
    DIFFICULTY_LABELS,
    difficultyDescription,
    type Difficulty,
} from "./difficulty"
import {
    createTouchControls,
    DpadSource,
    setBreathReady,
    setControls,
} from "./dpad"
import { applyMotion, effectsForEvents } from "./eventEffects"
import { defeatTimeScale } from "./bossDefeat"
import { takeEvents, type GameEvent } from "./events"
import {
    baseScreen,
    canContinue,
    endChoices,
    gameOf,
    initialScreen,
    openingScreen,
    PAUSE_CHOICES,
    pauseIfPlaying,
    PLAY_CHOICES,
    playerCount,
    recordsProgress,
    runTotal,
    screenSettings,
    selectItem,
    settingsContext,
    STORY_CHOICES,
    storyStart,
    TITLE_CHOICES,
    titleChoice,
    choosingMode,
    update,
    type EndChoice,
    type Capture,
    type FlowDeps,
    type Mode,
    type PauseChoice,
    type PlayChoice,
    type Screen,
    type StoryChoice,
    type TickInput,
    type TitleChoice,
} from "./flow"
import { totalScore, type GameState } from "./game"
import {
    CONTROLS_ROWS,
    controlsRowLabel,
    controlsRowValue,
} from "./controlsMenu"
import {
    browserPadList,
    GamepadSource,
    pressedButtons,
    type PadAssignment,
    type PadChange,
} from "./gamepad"
import { InputState, KeyboardSource, keyMapsFor, type Action } from "./input"
import {
    loadLastDifficulty,
    loadLastPick,
    saveLastDifficulty,
    saveLastPick,
} from "./lastPick"
import { controlsSpace } from "./layout"
import { levels, stages } from "./levels"
import { createLoop } from "./loop"
import {
    loadProgress,
    recordClear,
    recordStoryBest,
    stageSlots,
    type Progress,
} from "./progress"
import { createParticles } from "./particles"
import { createRushView } from "./rushView"
import { createRenderer, type Effects } from "./render"
import {
    createRecorder,
    newSeed,
    seededRandom,
    shouldRecord,
    type Recorder,
    type Recording,
} from "./replay"
import { ANIMAL_IDS, ANIMALS, type AnimalId } from "./roster"
import {
    bindingsOf,
    loadSettings,
    saveSettings,
    type Settings,
} from "./settings"
import { hudOf, rulesOf, screenEffects } from "./scene"
import { rowValue, settingsRows } from "./settingsMenu"
import { createShake } from "./shake"
import {
    burst,
    celebrate,
    downloadFile,
    hideOverlay,
    hideToast,
    overlayTap,
    showCharacterSelect,
    showControls,
    showDifficultySelect,
    showGameOver,
    showPause,
    showRecordingBadge,
    showPlaySelect,
    showSettings,
    showStageClear,
    showStageSelect,
    showStoryClear,
    showEndRoll,
    showStoryEnd,
    showStoryMenu,
    setHintBindings,
    showTitle,
    showTutorial,
    showCards,
    showSoundtrack,
    showToast,
    showTrackProgress,
    type EndScreenView,
} from "./ui"
import { heading, isTouchDevice, isTouchFirst, TouchSource } from "./touch"
import { OPENING_DRUM } from "./opening"
import { tutorialPages } from "./tutorial"
import { drawTutorialFrame, tutorialZoom } from "./tutorialView"
import { createOpeningLayer, openingItemAt } from "./openingView"

// The game opens on the opening (opening.ts) on every load. Tests of the
// rest of the game start on the title instead: their setup file sets
// skipOpening (src/test/setup.ts).
const skipOpening = (globalThis as { skipOpening?: boolean }).skipOpening
let screen: Screen = skipOpening ? initialScreen() : openingScreen()
const openingLayer = createOpeningLayer(document)

// Even reading window.localStorage can throw (e.g. when site data is
// blocked); the game then runs with progress kept for this session only.
function browserStorage(): Storage | undefined {
    try {
        return window.localStorage
    } catch {
        return undefined
    }
}
const storage = browserStorage()
let progress: Progress = loadProgress(storage)
// Kept here too, so the last pick holds for the session if saving fails.
let lastAnimal: AnimalId = loadLastPick(storage)
// The difficulty picked last, kept the same way: where difficulty select
// opens, and whose bests stage select shows.
let lastDifficulty: Difficulty = loadLastDifficulty(storage)
// Likewise the settings: saved on every change on the settings screen.
let settings: Settings = loadSettings(storage)
// The mute button (muteButton.ts) flips the settings' mute from any
// screen. On the settings and controls screens, which keep their own
// copy of the settings, it goes through that screen so the copy agrees.
const muteButton = createMuteButton(document, {
    isMuted: () => settings.muted,
    toggle() {
        const muted = !settings.muted
        if (screen.kind === "settings" || screen.kind === "controls") {
            enter(screen, {
                ...screen,
                settings: { ...screen.settings, muted },
            })
            return
        }
        settings = { ...settings, muted }
        saveSettings(storage, settings)
        audio.setVolumes(volumesOf(settings))
        // The soundtrack page says when sound is muted.
        if (screen.kind === "soundtrack") showOverlay(screen)
    },
})
// Debug mode (admin.ts): on while this browser holds the hash of the
// passphrase the build was given. Tests set their own (main.admin.test.ts).
const adminHash =
    (globalThis as { adminHash?: string }).adminHash ?? __ADMIN_HASH__
let admin = loadAdmin(storage, adminHash)

// Progress as the menus see it: in debug mode, every stage open.
function shownProgress(): Progress {
    return admin ? unlockAll(progress) : progress
}

// The system's reduced motion setting, read as it is now on every tick (it
// can change while the game runs), and whether this is a touch device:
// what some settings depend on (see SettingsContext).
function mediaQuery(query: string): MediaQueryList | undefined {
    try {
        return window.matchMedia(query)
    } catch {
        return undefined
    }
}
const reducedMotion = mediaQuery("(prefers-reduced-motion: reduce)")
const touch = isTouchDevice(window)
// Whether the window has focus and the tab shows (see autoPause): what
// flow needs so a game never starts unwatched (FlowDeps.focused).
let focused = !document.hidden
// Touch is the main input (a phone or tablet, not a laptop's touch screen):
// the breath button shows, with room kept for it.
const touchFirst = isTouchFirst(window)

// Gameplay recording, for videos (see replay.ts), on with ?record in the
// URL. Each run (a game from its start in `playing` to its end screen)
// gets a fresh seed, and its game randomness comes from
// that seed; its ticks are recorded, and the recording downloads when the
// run reaches its end screen. Without ?record nothing is recorded and the
// game uses Math.random as always.
const recordingOn = new URLSearchParams(location.search).has("record")
let recorder: Recorder | undefined
let gameRandom: Random = Math.random

const canvas = document.getElementById("game")
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("No #game canvas")
// Touch: dragging on the play area steers player 1 while the finger is
// down (TouchSource). The on-screen pause button (dpad.ts) shows during
// play on touch devices, and the breath button where touch is the main
// input or the D-pad shows. The optional D-pad steers too,
// alongside the drag: it shows on touch devices when the Show D-pad
// setting is on (applyDpad, live as the setting changes).
const playArea = document.getElementById("play") ?? canvas
const touchControls = createTouchControls()
// Losing focus or hiding the page lets go of the drag, since the finger's
// lift may never come.
// A tap on the board breathes, and a finger resting on it charges; one
// that turns into a flick drops player 1's charge (see touch.ts).
const touchSource = new TouchSource(playArea, {
    view: window,
    doc: document,
    cancelCharge: () => {
        const breather = gameOf(screen)?.players[0]?.breather
        if (breather) cancelCharge(breather)
    },
})
let dpadShown = false
setControls(document, {
    touch,
    buttons: touchFirst,
    dpad: false,
    playing: false,
})

// The renderer fits the maze into the window less the touch controls' band.
const renderer = createRenderer(canvas, {
    view: {
        get innerWidth() {
            return innerWidth - controlsRoom().width
        },
        get innerHeight() {
            return innerHeight - controlsRoom().height
        },
        get devicePixelRatio() {
            return devicePixelRatio
        },
    },
})
// The tutorial's drawings are sized to the window, so a resize redraws it.
addEventListener("resize", () => {
    renderer.resize()
    if (screen.kind === "tutorial") showOverlay(screen)
})

function controlsRoom() {
    const shown = dpadShown ? "dpad" : touchFirst ? "buttons" : "none"
    return controlsSpace(innerWidth, innerHeight, shown)
}

// Show or hide the on-screen D-pad as the settings say, refitting the maze
// when that changes. Breath shows beside it, on a laptop's touch screen
// too.
function applyDpad() {
    const on = touch && settings.showDpad
    if (on === dpadShown) return
    dpadShown = on
    setControls(document, { dpad: on, buttons: touchFirst || on })
    renderer.resize()
}
applyDpad()

// Particles and screen shake (KDA-213): visual only, never read by the
// game. They move on with the game's ticks (so they freeze while paused),
// start over with each game, and show only while it is played, paused or
// ending. With reduced motion there is no shake and particles are fewer and
// shorter; the Screen shake setting, when set, overrides the shake part.
const particles = createParticles({ random: Math.random })
const shake = createShake()
// The Boar's Rushes landing (KDA-307): they hold back their ram's events
// until the Boar gets there, and are drawn flying.
const rush = createRushView()
const effects = {
    // Follow reduced motion and the Screen shake setting: on load, when the
    // settings change and when the system setting does.
    motion() {
        const reduced = reducedMotion?.matches ?? false
        applyMotion({ particles, shake }, settings, reduced)
    },
    // The bursts and shakes for a tick's game events (see eventEffects.ts).
    events(events: readonly GameEvent[], game: GameState) {
        effectsForEvents(events, game, { particles, shake })
    },
    // Moves on by `dt`; a Rush's held events due by then are returned, for
    // their sounds and effects.
    tick(dt: number): readonly GameEvent[] {
        particles.update(dt)
        shake.update(dt)
        return rush.update(dt)
    },
    reset() {
        particles.clear()
        shake.clear()
        rush.clear()
    },
    of(s: Screen): Effects {
        return screenEffects(s, {
            particles: particles.list,
            shake: () => shake.offset(Math.random),
            reducedMotion: reducedMotion?.matches ?? false,
            rush: rush.flights,
        })
    },
}
effects.motion()
reducedMotion?.addEventListener?.("change", () => effects.motion())

const input = new InputState()
// Both players' keys, as bound in the settings and as the screen's player
// count uses them (see keyBindingsFor).
let keyBindings = keyBindingsFor(screen, settings)
const keys = new KeyboardSource(keyMapsFor(keyBindings))
// Each player's input, by index (player 1 is 0): flow asks for player 2's
// only in a 2-player mode.
const tickInput: TickInput = {
    wasPressed: (action, player = 0) => input.player(player).wasPressed(action),
    move: (player = 0) => {
        const p = input.player(player)
        return {
            held: p.heldSteps(),
            pressed: p.pressedStep(),
            // Held, the breath charges, and it fires once let go (KDA-289):
            // keys, pads and the touch Breath button all hold it.
            breath: p.wasPressed("breath"),
            breathHeld: p.isDown("breath"),
        }
    },
    captured: () => pendingCapture,
}

// The controls screen's capture (see Capture in flow.ts): the first key and
// the first pad button pressed while it waits, each kind apart, so a stray
// press of one kind doesn't hide the other, and Escape. Taken only while it
// waits, and cleared after every tick like the press edges.
let pendingCapture: Capture = {}
const capturing = () => screen.kind === "controls" && !!screen.capturing

addEventListener("keydown", (event) => {
    if (!capturing()) return
    if (event.code === FIXED_PAUSE_KEY) {
        pendingCapture = { ...pendingCapture, cancel: true }
        return
    }
    if (pendingCapture.key !== undefined) return
    const key = captureKey(event)
    if (key === undefined) return
    // Tab and the like do nothing else while bound.
    event.preventDefault()
    pendingCapture = { ...pendingCapture, key }
})

// The buttons each pad held at the last frame, so only a fresh press is
// captured: a button held when the prompt opens (the confirm that opened
// it), or when a pad is first listed, doesn't count. Read only while the
// prompt waits; its first frame only notes what is held.
const padList = browserPadList(navigator)
let padButtonsDown = new Map<number, readonly number[]>()
function capturePads() {
    const down = new Map<number, readonly number[]>()
    if (!capturing()) {
        padButtonsDown = down
        return
    }
    for (const pad of padList()) {
        if (!pad || pad.connected === false) continue
        const now = pressedButtons(pad)
        down.set(pad.index, now)
        if (pendingCapture.button !== undefined) continue
        const before = padButtonsDown.get(pad.index) ?? now
        const button = captureButton(before, now)
        if (button !== undefined) pendingCapture = { ...pendingCapture, button }
    }
    padButtonsDown = down
}

// Gamepads: in one-player play every pad drives player 1, alongside the
// keyboard; in a 2-player mode the first pad connected drives player 1 and
// the second player 2 (see padAssignment). A pad in use lost mid-game pauses it, like leaving the window;
// an idle pad going to sleep doesn't. Set up before the loop, whose frames
// poll it. (Toasts and auto-pause only run on events, after startup.)
const TOAST_MS = 2000
let toastTimer: ReturnType<typeof setTimeout> | undefined
function onPadChange(change: PadChange) {
    showToast(
        change.kind === "connected"
            ? "Controller connected"
            : "Controller disconnected"
    )
    clearTimeout(toastTimer)
    toastTimer = setTimeout(hideToast, TOAST_MS)
    if (change.kind === "disconnected" && change.wasUsed) autoPause()
}
const pads = new GamepadSource(
    padList,
    globalThis,
    onPadChange,
    bindingsOf(settings)
)
pads.setAssignment(padAssignment(screen))
pads.setMenus(screen.kind !== "playing")
let padPollFailed = false
let padCaptureFailed = false

// The loop ticks on every screen; menus and pause poll their input per tick
// like play does. Only `playing` steps the game.
const loop = createLoop({
    update: tick,
    render,
    stepMs: TICK_MS,
    maxFrameMs: MAX_FRAME_MS,
    now: () => performance.now(),
    // Pads are polled once per frame, before the frame's ticks read input.
    // A throw from a bad pad entry must not stop the frame: the loop asks
    // for the next frame from within this one.
    requestFrame: (callback) =>
        requestAnimationFrame(() => {
            try {
                pads.poll()
            } catch (error) {
                // Once, not every frame.
                if (!padPollFailed) console.error(error)
                padPollFailed = true
            }
            // Apart, so a throw from one doesn't skip the other.
            try {
                capturePads()
            } catch (error) {
                if (!padCaptureFailed) console.error(error)
                padCaptureFailed = true
            }
            callback()
        }),
    cancelFrame: (id) => cancelAnimationFrame(id),
})

// One logic tick: advance the screen machine with player 1's input, then
// clear this tick's press edges, so a press is seen by exactly one tick (and
// one screen). A boss's defeat gets its big burst of confetti as its
// effect ends and the clear jingle plays (its gameWon, KDA-301), not on
// the killing blow, which freezes the frame. What the game reported goes
// to onGameEvents.
function tick(dt: number) {
    // Before the game reads its input: a finger resting on the board
    // starts charging the breath.
    touchSource.tick(dt)
    const game = gameOf(screen)
    const next = update(screen, tickInput, flowDeps(dt))
    // Before endTick, which clears the presses the recorder reads.
    if (recorder && shouldRecord(screen, next)) recorder.add(tickInput)
    input.endTick()
    pendingCapture = {}
    const events = game ? takeEvents(game) : []
    if (game) onGameEvents(events, game)
    if (game?.boss && events.some((e) => e.type === "gameWon")) burst()
    // Effects move on only when this tick moved the game on: a step, or
    // the outro's settle. Not on a tick that pauses or resumes. In a boss
    // defeat's hit-stop they stand still with the glides (KDA-301).
    const moved =
        screen.kind === "ending" ||
        (screen.kind === "playing" && next.kind !== "paused")
    const scale =
        screen.kind === "ending" && screen.game.defeat
            ? defeatTimeScale(screen.game.defeat)
            : 1
    if (next !== screen) enter(screen, next)
    const due = moved ? effects.tick(dt * scale) : []
    if (screen.kind === "tutorial") tutorialClock += dt
    if (game && due.length > 0) playEvents(due, game)
    // The way player 1 is going, for the flicks (see TouchSource.follow).
    const player =
        next.kind === "playing" ? gameOf(next)?.players[0] : undefined
    touchSource.follow(player && heading(player))
}

function flowDeps(dt: number): FlowDeps {
    return {
        levels: stages,
        progress: shownProgress(),
        lastAnimal,
        lastDifficulty,
        dt,
        // Seeded while recording (see recordRuns).
        random: gameRandom,
        settings,
        touch,
        focused,
        ...(screen.kind === "opening" ? openingClock() : {}),
        ...(screen.kind === "endRoll" ? endRollClock() : {}),
    }
}

// The opening's title follows the music, so its menu lands on the drum.
function openingClock(): Pick<FlowDeps, "openingClock"> {
    const seconds = audio.musicPosition()
    return seconds === undefined ? {} : { openingClock: seconds }
}

// The end roll follows its music too, so the cards keep to the beat even
// when the track takes a moment to load.
function endRollClock(): Pick<FlowDeps, "endRollClock"> {
    const seconds = audio.musicPosition()
    return seconds === undefined ? {} : { endRollClock: seconds }
}

// What happened in the tick's game step, if it stepped the game, or the
// outro's held stage clear (see events.ts); empty otherwise. Sound (KDA-212) and particles and screen
// shake (KDA-213) hook in here.
// A Rush's ram and what it sets off wait for the Boar to get there (see
// rushView.ts), and come back here from effects.tick when they are due.
function onGameEvents(events: readonly GameEvent[], game: GameState) {
    playEvents(rush.take(events, game), game)
}

function playEvents(events: readonly GameEvent[], game: GameState) {
    playEventSounds(audio, events)
    effects.events(events, game)
}

// How pads map to players on a screen. The title and its pages, where the
// mode is still being chosen, share every pad with player 1, so any pad
// can pick the mode (and go back to 1 player). From stage select on, a
// 2-player mode gives each pad its own player, so player 2's pad picks its
// character. Settings follow the screen they were opened over.
function padAssignment(shown: Screen): PadAssignment {
    const screen = baseScreen(shown)
    return !choosingMode(screen) && playerCount(screen.mode) > 1
        ? "perPad"
        : "shared"
}

// The keys a screen uses: a 1-player game's breath may move to Left Shift
// (see effectiveBindings). The opening, the title and its pages, where the
// mode is still being chosen, use the bindings as they are. Settings follow
// the screen they were opened over.
function keyBindingsFor(shown: Screen, s: Settings): Bindings {
    const base = baseScreen(shown)
    const solo = !choosingMode(base) && playerCount(base.mode) === 1
    return effectiveBindings(bindingsOf(s), solo ? 1 : 2)
}

// Rebuild the key maps only when the keys change: rebuilding lets go of
// every held key.
function applyKeyBindings() {
    const next = keyBindingsFor(screen, settings)
    if (sameBindings(next, keyBindings)) return
    keyBindings = next
    keys.setBindings(next)
}

function enter(prev: Screen, next: Screen) {
    screen = next
    // Each tutorial page plays its scenes from their start.
    if (
        next.kind === "tutorial" &&
        (prev.kind !== "tutorial" || prev.page !== next.page)
    ) {
        tutorialClock = 0
    }
    pads.setAssignment(padAssignment(next))
    pads.setMenus(next.kind !== "playing")
    setControls(document, { playing: next.kind === "playing" })
    // A drag holds its direction while the finger is down; a game starting
    // or ending (not a pause or resume) lets go of it, so it neither steers
    // the next game nor sets that direction aside for the keys there. A
    // finger still down steers again once it drags anew.
    const wasPlaying = prev.kind === "playing"
    const isPlaying = next.kind === "playing"
    // A game starts: playing, or paused when it starts in an unfocused
    // window (see FlowDeps.focused); not a pause or resume of the same one.
    const started =
        (isPlaying || next.kind === "paused") && gameOf(next) !== gameOf(prev)
    if (started || (wasPlaying && !isPlaying && next.kind !== "paused")) {
        touchSource.release()
    }
    // Play started from a menu (character select, Retry or the story
    // card): a direction still held from the menu waits for a fresh press.
    // Resuming from pause keeps held directions, so holding through a pause
    // carries on moving. A new game also starts with no particles or shake
    // left over.
    if (started) {
        input.ignoreHeld()
        effects.reset()
    }
    // Only 1-player games remember the picks: 2-player games leave saved
    // data alone.
    if (
        next.kind === "characterSelect" &&
        prev.kind === "difficultySelect" &&
        playerCount(next.mode) === 1
    ) {
        lastDifficulty = next.difficulty
        saveLastDifficulty(storage, lastDifficulty)
    }
    if (
        started &&
        prev.kind === "characterSelect" &&
        playerCount(next.mode) === 1
    ) {
        lastAnimal = next.animals[0]
        saveLastPick(storage, lastAnimal)
    }
    // A clear in stage mode or in a story run (KDA-271) records its stars
    // and bests alike, but only a story run's unlocks the next stage
    // (KDA-272): stages unlock only by story progress.
    const cleared =
        next.kind === "stageClear" ||
        next.kind === "storyClear" ||
        next.kind === "storyEnd"
    if (cleared && prev.kind === "ending") {
        // 2-player games, and debug mode, leave saved progress alone.
        if (recordsProgress(next.mode) && !admin) {
            const { stars, ticks } = next.rating
            const clear = { difficulty: next.difficulty, stars, ticks }
            progress = recordClear(progress, storage, next.level, clear, {
                unlocks: next.kind !== "stageClear",
            })
            // A run that reached the ending: its total may be the best.
            if (next.kind === "storyEnd") {
                const total = runTotal(next)
                progress = recordStoryBest(
                    progress,
                    storage,
                    next.difficulty,
                    total
                )
            }
        }
        celebrate(10)
        // The ending gets a burst on top.
        if (next.kind === "storyEnd") burst()
    }
    if (recordingOn) recordRuns(prev, next)
    // Every change on the settings and controls screens is saved, and
    // applied, at once.
    const changed = screenSettings(next)
    if (changed && changed !== settings) {
        // By value: Reset gives equal bindings as another object.
        if (!sameBindings(bindingsOf(changed), bindingsOf(settings))) {
            applyBindings(changed)
        }
        settings = changed
        saveSettings(storage, settings)
        applyDpad()
        effects.motion()
    }
    applyKeyBindings()
    screenSound(audio, prev, next, settings)
    muteButton.update()
    showOverlay(next)
}

// Use the settings' bindings for the pads and the hints. The keyboard
// follows in applyKeyBindings.
function applyBindings(s: Settings) {
    const bindings = bindingsOf(s)
    pads.setBindings(bindings)
    setHintBindings(bindings)
}

// Interpolation only moves on during play and the ending outro (where the
// glides finish); other screens with a game keep the last picture still. Screens without one (title, stage select) show an
// empty canvas rather than the previous game's board.
let lastAlpha = 0
// Seconds of ticks on the tutorial page showing: the time its scenes are
// drawn at (see tutorialView.ts).
let tutorialClock = 0

function render(alpha: number) {
    if (screen.kind === "opening") {
        openingLayer.show({
            stage: screen.stage,
            seconds: screen.clock.seconds,
            choice: screen.choice,
            canContinue: canContinue(flowDeps(0)),
        })
        return renderer.clear()
    }
    openingLayer.hide()
    if (screen.kind === "soundtrack") showPlayingProgress(screen)
    if (screen.kind === "tutorial") {
        drawTutorialFrame(tutorialClock, reducedMotion?.matches ?? false)
    }
    // The Cards page made before the cards' font had loaded is made again.
    if (screen.kind === "cards" && cardsPageStale()) showOverlay(screen)
    // The end roll draws on its own canvas, over everything.
    if (screen.kind === "endRoll") return renderEndRoll(screen)
    // Settings over a paused game show that game behind them.
    const shown = baseScreen(screen)
    const game = gameOf(shown)
    if (!game) return renderer.clear()
    showBreathReady(energyHud(game).ready)
    if (shown.kind === "playing" || shown.kind === "ending") {
        lastAlpha = alpha
    }
    renderer.draw(
        game,
        lastAlpha,
        hudOf(game, shown),
        rulesOf(shown, stages),
        effects.of(shown)
    )
}

// Start a recording when a run starts (play entered other than from
// pause), and download it when the run leaves its outro for an end screen.
function recordRuns(prev: Screen, next: Screen) {
    if (next.kind === "playing" && prev.kind !== "paused") {
        const seed = newSeed(Math.random)
        gameRandom = seededRandom(seed)
        recorder = createRecorder(next, seed)
    } else if (prev.kind === "ending" && recorder) {
        const recording = recorder.finish(next)
        recorder = undefined
        downloadFile(
            recordingName(recording, new Date()),
            JSON.stringify(recording),
            "application/json"
        )
    }
}

// e.g. dot-eater-stage1-solo-dragon-lost-2026-10-28T19-40-05.json: easy to
// tell apart, and in time order when sorted by name.
function recordingName(recording: Recording, date: Date): string {
    const { level, mode, animals, final } = recording
    const outcome = final.kind === "gameOver" ? "lost" : "won"
    const time = date.toISOString().slice(0, 19).replaceAll(":", "-")
    return `dot-eater-stage${level + 1}-${mode}-${animals.join("+")}-${outcome}-${time}.json`
}

type SoundtrackScreen = Extract<Screen, { kind: "soundtrack" }>

// Where soundtrack track `index` is: the music's place in its file while
// it plays (the start until the file has loaded, or with no sound), else
// the start.
function soundtrackProgress(s: SoundtrackScreen, index: number) {
    const entry = SOUNDTRACK[index]!
    const recorded = RECORDED_TRACKS[entry.track]
    const position =
        index === s.playing && audio.music === entry.track
            ? audio.musicPosition()
            : undefined
    return recorded
        ? trackProgress(recorded, position)
        : { elapsed: 0, length: 0 }
}

// The playing track's bar moves on every frame, in place.
function showPlayingProgress(s: SoundtrackScreen) {
    if (s.playing === undefined) return
    const { elapsed, length } = soundtrackProgress(s, s.playing)
    showTrackProgress(s.playing, elapsed, length)
}

function renderEndRoll(s: Extract<Screen, { kind: "endRoll" }>) {
    const canvas = showEndRoll(END_ROLL_WIDTH, END_ROLL_HEIGHT)
    const context = canvas.getContext("2d")
    if (context) drawEndRoll(context, s.elapsed.seconds, s.difficulty)
}

// The breath button looks ready while player 1's meter shows ready
// (amber). Set on the DOM only when that changes.
let breathReady: boolean | undefined
function showBreathReady(ready: boolean) {
    if (ready === breathReady) return
    breathReady = ready
    setBreathReady(touchControls, ready)
}

function showOverlay(s: Screen) {
    switch (s.kind) {
        // The opening draws on its own canvas (see render).
        case "opening":
            return hideOverlay()
        case "title": {
            const current = titleChoice(s)
            return showTitle(
                TITLE_CHOICES.map((choice) => ({
                    label: TITLE_LABELS[choice],
                    selected: choice === current,
                }))
            )
        }
        case "tutorial": {
            const pages = tutorialPages(touch)
            return showTutorial({
                page: pages[Math.min(s.page, pages.length - 1)]!,
                index: s.page,
                count: pages.length,
                bindings: bindingsOf(settings),
                touch,
                zoom: tutorialZoom(innerWidth, innerHeight),
            })
        }
        case "cards":
            return showCards(s.index)
        case "soundtrack":
            return showSoundtrack({
                tracks: SOUNDTRACK.map((entry, i) => ({
                    name: entry.name,
                    plays: entry.plays,
                    ...soundtrackProgress(s, i),
                })),
                selected: s.selected,
                ...(s.playing === undefined ? {} : { playing: s.playing }),
                muted: settings.muted,
            })
        case "settings": {
            const context = settingsContext(s, flowDeps(0))
            return showSettings(
                settingsRows(context).map((row, i) => {
                    const value = rowValue(row, s.settings)
                    return {
                        label: row.label,
                        ...(value === undefined ? {} : { value }),
                        ...(row.kind === "slider" || row.kind === "choice"
                            ? { steps: true }
                            : {}),
                        selected: i === s.row,
                    }
                })
            )
        }
        case "controls": {
            const bindings = bindingsOf(s.settings)
            const current = CONTROLS_ROWS[s.row]
            return showControls({
                player: s.player,
                items: CONTROLS_ROWS.map((row, i) => {
                    const value = controlsRowValue(row, bindings, s.player)
                    return {
                        label: controlsRowLabel(row),
                        ...(value === undefined ? {} : { value }),
                        selected: i === s.row,
                    }
                }),
                ...(s.capturing && current
                    ? {
                          capturing: {
                              label: controlsRowLabel(current),
                              pad: current.kind === "pad",
                              touch,
                          },
                      }
                    : {}),
            })
        }
        case "playSelect":
            return showPlaySelect(
                MODE_LABELS[s.mode],
                PLAY_CHOICES.map((c) => ({
                    label: PLAY_LABELS[c],
                    selected: c === s.choice,
                }))
            )
        case "storyMenu":
            return showStoryMenu(
                STORY_CHOICES.map((c) => ({
                    label: storyLabel(c),
                    selected: c === s.choice,
                    ...(storyStart(c, shownProgress()) >= levels.length
                        ? { locked: true }
                        : {}),
                }))
            )
        case "stageSelect":
            return showStageSelect(
                stageSlots(
                    shownProgress(),
                    levels.map((level) => level.name),
                    lastDifficulty
                ),
                s.selected,
                DIFFICULTY_LABELS[lastDifficulty]
            )
        case "difficultySelect":
            return showDifficultySelect(
                DIFFICULTIES.map((d) => ({
                    label: DIFFICULTY_LABELS[d],
                    detail: difficultyDescription(d),
                    selected: d === s.difficulty,
                }))
            )
        case "characterSelect":
            return showCharacterSelect(
                ANIMAL_IDS.map((id) => ANIMALS[id]),
                s.picks,
                s.ready
            )
        case "playing":
        case "ending":
            return hideOverlay()
        case "paused":
            return showPause(
                s.game.players.length,
                PAUSE_CHOICES.map((c) => ({
                    label: PAUSE_LABELS[c],
                    selected: c === (s.choice ?? "resume"),
                }))
            )
        case "stageClear":
            return showStageClear({ ...endView(s), rating: s.rating })
        case "gameOver":
            return showGameOver(endView(s))
        case "storyClear":
            return showStoryClear({
                difficulty: DIFFICULTY_LABELS[s.difficulty],
                score: totalScore(s.game),
                runTotal: runTotal(s),
                rating: s.rating,
                ...(s.next === undefined
                    ? {}
                    : { next: `Stage ${s.next + 1}: ${levels[s.next].name}` }),
                items: [
                    {
                        label: s.next === undefined ? "Title" : "Next stage",
                        selected: true,
                    },
                ],
            })
        case "storyEnd": {
            const best = recordsProgress(s.mode)
                ? progress.storyBests?.[s.difficulty]
                : undefined
            return showStoryEnd({
                difficulty: DIFFICULTY_LABELS[s.difficulty],
                runTotal: runTotal(s),
                ...(best === undefined ? {} : { best }),
                items: [{ label: "Continue", selected: true }],
            })
        }
        case "endRoll":
            loadEndRollFont()
            showEndRoll(END_ROLL_WIDTH, END_ROLL_HEIGHT)
            return
    }
}

const END_LABELS: Record<EndChoice, string> = {
    retry: "Retry",
    stageSelect: "Stage select",
    quit: "Quit",
}

// The choice of story or stage mode (KDA-271).
const PLAY_LABELS: Record<PlayChoice, string> = {
    story: "Story",
    stage: "Stage select",
}

// The story menu's items. Continue names the stage it starts on (e.g.
// "Continue (stage 3: Ice)"), or says it is coming soon when that stage
// isn't built yet.
function storyLabel(choice: StoryChoice): string {
    if (choice === "newStory") return "New story"
    const index = storyStart(choice, shownProgress())
    const name = levels[index]?.name ?? "coming soon"
    return `Continue (stage ${index + 1}: ${name})`
}

// The mode select's labels, one per mode; the main menu offers them all, in
// MODE_CHOICES order, then the pages and Settings.
const MODE_LABELS: Record<Mode, string> = {
    solo: "1 Player",
    coop: "2 Players",
}

const TITLE_LABELS: Record<TitleChoice, string> = {
    ...MODE_LABELS,
    tutorial: "Tutorial",
    cards: "Cards",
    soundtrack: "Soundtrack",
    settings: "Settings",
}

// Quit says where it goes: the title, in every mode.
const PAUSE_LABELS: Record<PauseChoice, string> = {
    resume: "Resume",
    settings: "Settings",
    quit: "Quit to title",
}

// An end screen's view. In a story run (KDA-271), game over also shows the
// run total the stage started with: what Retry plays on from.
function endView(
    s: Extract<Screen, { kind: "stageClear" | "gameOver" }>
): EndScreenView {
    const { game } = s
    return {
        difficulty: DIFFICULTY_LABELS[s.difficulty],
        score: totalScore(game),
        ...(game.players.length > 1
            ? {
                  playerScores: game.players.map((p) => p.score),
                  playerDots: game.players.map((p) => p.dots),
              }
            : {}),
        ...("run" in s && s.run ? { runTotal: s.run.total } : {}),
        items: endChoices(s).map((c) => ({
            label: END_LABELS[c],
            selected: c === s.choice,
        })),
    }
}

// Auto-pause: leaving the window or hiding the tab mid-game pauses it, so
// the game doesn't play on unwatched. Whether the window is focused also
// goes to flow (FlowDeps.focused), so a game doesn't start unwatched
// either: the story card waits, and a game that starts meanwhile starts
// paused.
function autoPause() {
    const next = pauseIfPlaying(screen)
    if (next !== screen) enter(screen, next)
}
function unfocus() {
    focused = false
    autoPause()
}
addEventListener("blur", unfocus)
document.addEventListener("visibilitychange", () => {
    if (document.hidden) unfocus()
})
// Focus back, or a key or pointer press, which only a focused page gets.
for (const type of ["focus", "keydown", "pointerdown"]) {
    addEventListener(type, () => {
        focused = true
    })
}

// A swipe across the Cards page turns a card, and across the tutorial a
// page (swipeStep), as left or right does: a swipe to the left shows the
// next one. Up and down scroll. The click it ends with, if any, is
// dropped; a new press forgets that, in case none came.
const swipes = (s: Screen) => s.kind === "cards" || s.kind === "tutorial"
let swipeFrom: { x: number; y: number } | undefined
let swiped = false
document.addEventListener("pointerdown", (event) => {
    swiped = false
    swipeFrom = swipes(screen)
        ? { x: event.clientX, y: event.clientY }
        : undefined
})
document.addEventListener("pointerup", (event) => {
    const from = swipeFrom
    swipeFrom = undefined
    if (!from || !swipes(screen)) return
    const step = swipeStep(event.clientX - from.x, event.clientY - from.y)
    if (step === 0) return
    swiped = true
    tapAction(step > 0 ? "right" : "left")
})

// Taps and clicks on the overlays: a menu item or card puts player 1's
// cursor on it and confirms (on settings that flips a toggle or runs
// Back), a slider's ◀ or ▶ puts the cursor on it and steps it (left or
// right), and Back is the pause action (Esc). They go through player 1's
// input like keys, so flow handles them on the next tick, delays and all.
// While the controls screen waits for a key or button, any tap on the
// overlay cancels, like Escape, so a phone isn't stuck on the prompt.
document.addEventListener("click", (event) => {
    // The click that ends a swipe is the swipe's, not a tap.
    if (swiped) {
        swiped = false
        return
    }
    if (screen.kind === "opening") return openingTap(event)
    const tap = overlayTap(event.target)
    if (tap && capturing()) {
        pendingCapture = { ...pendingCapture, cancel: true }
        return
    }
    if (!tap || tap.kind === "panel") return
    if (tap.kind === "back") return tapAction("pause")
    const next = selectItem(screen, tap.index, flowDeps(0))
    if (next !== screen) {
        screen = next
        showOverlay(screen)
    }
    if (tap.kind === "step") tapAction(tap.delta < 0 ? "left" : "right")
    else tapAction("confirm")
})

// A tap on the opening is a press, as any key is; on the menu, a tap on
// Start or Continue (when it can) puts the cursor there and confirms.
function openingTap(event: MouseEvent) {
    if (screen.kind !== "opening") return
    const point = openingLayer.toScreen(event.clientX, event.clientY)
    const item = point && openingItemAt(point.x, point.y)
    const menu =
        screen.stage === "title" && screen.clock.seconds >= OPENING_DRUM
    if (menu && !item) return
    if (menu && item && (item === "start" || canContinue(flowDeps(0)))) {
        screen = { ...screen, choice: item }
    }
    tapAction("confirm")
}

// Any key moves the opening on while it waits (the studio logo, the logo
// held, the title rising), not only the bound ones: what "press any
// button" says.
addEventListener("keydown", (event) => {
    if (event.repeat || screen.kind !== "opening") return
    const menu =
        screen.stage === "title" && screen.clock.seconds >= OPENING_DRUM
    if (!menu) tapAction("confirm")
})

function tapAction(action: Action) {
    const player = input.player(0)
    player.press(action, "tap")
    player.release(action, "tap")
}

// Sound (KDA-212). Browsers only start audio after a user gesture, so the
// first key or pointer press unlocks it; later ones resume it if the browser
// suspended it. Gamepad presses don't count as gestures. Each screen change
// sets the tune, menu sound and volumes (screenSound); the title tune waits
// for the unlock.
const audio = createAudio({
    createContext: browserAudioContext(globalThis),
    setTimer: (callback, ms) => window.setInterval(callback, ms),
    clearTimer: (handle) => window.clearInterval(handle),
    recorded: RECORDED_TRACKS,
})
for (const type of ["keydown", "pointerdown", "touchend"])
    document.addEventListener(type, () => audio.unlock(), { capture: true })
screenSound(audio, undefined, screen, settings)

keys.attach(input)
setHintBindings(bindingsOf(settings))
pads.attach(input)
touchSource.attach(input)
new DpadSource(touchControls).attach(input)
// Turn debug mode on or off, remembered in this browser, and show it.
function setAdmin(on: boolean) {
    admin = on
    saveAdmin(storage, on ? adminHash : undefined)
    adminBadge.update()
    showOverlay(screen)
}
// The debug mode badge (adminBadge.ts): shows debug mode is on, and clears
// it, from any screen.
const adminBadge = createAdminBadge(document, {
    isOn: () => admin,
    clear: () => setAdmin(false),
})
// The admin panel (adminPanel.ts) opens at #admin, on load or when the
// address changes to it; closing it takes #admin off the address again.
const adminPanel = createAdminPanel(document, {
    hash: adminHash,
    stageNames: levels.map((level) => level.name),
    isOn: () => admin,
    turnOn: () => setAdmin(true),
    turnOff: () => setAdmin(false),
    jump(target) {
        enter(screen, adminScreen(target, flowDeps(0)))
    },
    closed() {
        if (location.hash === "#admin")
            history.replaceState(null, "", location.pathname + location.search)
    },
})
function openAdminAtHash() {
    if (location.hash === "#admin") adminPanel.open()
}
addEventListener("hashchange", openAdminAtHash)
openAdminAtHash()

// The (empty) toast live region goes in at once, so screen readers already
// watch it when the first toast shows.
hideToast()
if (recordingOn) showRecordingBadge()
showOverlay(screen)
loop.start()
