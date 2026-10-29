import type { Recording } from "../../src/replay"
import type { AnimalId } from "../../src/roster"
import type { CardShot, CutList, GameShot, Shot } from "./cutList"
import type { RampOptions, Transition } from "./drama"
import { PROMO2_EXCERPT } from "./excerpts"
import { heroMoment, highlightsOf, type Moment } from "./highlights"
import { LOOKS, PAPER } from "./palette"
import type { SceneName } from "./scenes"

// The v2 promo's edit (see Promo2.tsx): the 64 beats of PROMO2_EXCERPT,
// beat 0 on its first downbeat. Bars below count from the excerpt's start
// (bar 0). Pure, so it is tested: it compiles, fills the excerpt, shows
// every character and lands the boss going down on bar 13.
//
//   beats  0–8   HOOK: the chase, quick snippets, the near miss in slow
//                motion with the DOT EATER slam, a half-beat montage
//   beats  8–12  DROPOUT (bar 2): a freeze frame, 5 ANIMALS. 5 POWERS.
//   beats 12–32  CHARACTERS (bars 3–8): a slam card then the ability in
//                slow motion, a bar each; quicker cards from the lift
//   beats 32–56  BOSS (bars 8–14): hits on the backbeat, a stutter, the
//                boss down on bar 13
//   beats 56–64  END CARD (bars 14–16)
//
// The backbeat is on beats 2 and 4 of each bar: odd beats here.

export type Scenes = Readonly<Record<SceneName, Recording>>

// Bar `bar` of the excerpt (fractions are beats) as a beat of the edit.
export const beatOfBar = (bar: number) => bar * 4

const cueBar = (cue: keyof typeof PROMO2_EXCERPT.cues) =>
    PROMO2_EXCERPT.cues[cue] - PROMO2_EXCERPT.fromBar

// Where each section starts, in beats.
export const SECTIONS = {
    hook: beatOfBar(cueBar("open")),
    dropout: beatOfBar(cueBar("dropout")),
    characters: beatOfBar(cueBar("dropout") + 1),
    lift: beatOfBar(cueBar("lift")),
    boss: beatOfBar(cueBar("hook")),
    endCard: beatOfBar(cueBar("endCard")),
    end: beatOfBar(cueBar("end")),
} as const

// The beat the boss goes down on: the downbeat of bar 13.
export const BOSS_DOWN_BEAT = beatOfBar(13)

// The characters in the order they're shown.
export const CHARACTER_ORDER: readonly AnimalId[] = [
    "dragon",
    "penguin",
    "owl",
    "skunk",
    "boar",
]

// Each character's scene is named after it.
const SCENE_OF: Readonly<Record<AnimalId, SceneName>> = {
    dragon: "dragon",
    penguin: "penguin",
    owl: "owl",
    skunk: "skunk",
    boar: "boar",
}

const FIRE = LOOKS.dragon.colour

// A caption's inset that clears the boss fight's letterbox (2.39:1 bars on
// a 1080p frame are 138 px).
const LETTERBOXED = 170

function hero(scenes: Scenes, scene: SceneName): Moment {
    const m = heroMoment(scene, scenes[scene])
    if (!m) throw new Error(`No hero moment in scene "${scene}"`)
    return m
}

// A gameplay shot of `scene` landing `moment` on its hero beat.
function on(
    scenes: Scenes,
    scene: SceneName,
    moment: Pick<Moment, "tick" | "focus"> & { player?: number },
    shot: Omit<GameShot, "recording" | "heroTick" | "at">
): GameShot {
    return {
        recording: scenes[scene],
        heroTick: moment.tick,
        at: moment.focus,
        ...shot,
        camera: {
            ...(moment.player !== undefined && { player: moment.player }),
            ...shot.camera,
        },
    }
}

// The hard slow motion on an ability (see speedRamp).
const ABILITY_RAMP: RampOptions = { slow: 0.1, hold: 18 }

// The character run-through: a card, then the ability shot with its hero
// moment on the snare, in slow motion, with its colour and caption. The
// dragon's card is two beats; from the lift (bar 4) cards are a beat and
// a half and the shots punch harder.
function characterShots(scenes: Scenes): Shot[] {
    const ways: Transition[] = ["flash", "whip", "wipe", "flash", "whip"]
    const cardWays: Transition[] = ["cut", "wipe", "flash", "whip", "wipe"]
    return CHARACTER_ORDER.flatMap((animal, i) => {
        const look = LOOKS[animal]
        const first = i === 0
        const card: CardShot = {
            kind: "card",
            name: `${look.name} card`,
            animal,
            durationBeats: first ? 2 : 1.5,
            hits: first ? [0, 0.5, 1] : [0, 0.25, 0.75],
            transition: cardWays[i],
            colour: look.colour,
        }
        const shot = on(scenes, SCENE_OF[animal], hero(scenes, animal), {
            name: `${look.name} ${look.ability}`,
            durationBeats: first ? 2 : 2.5,
            // On a snare: the dragon's on beat 4 of its bar, the others'
            // on beat 2 (their card took beat 1 and half of 2).
            heroBeat: first ? 1 : 1.5,
            transition: ways[i],
            colour: look.colour,
            speed: ABILITY_RAMP,
            camera: {
                move: "push",
                // The dragon's fire is five cells long: keep it in shot.
                zoom: first ? [1.6, 2.2] : [2.1, 3.5],
                punch: first ? 0.12 : 0.2,
            },
            caption: look.ability,
            // The skunk's cloud is low in the frame.
            ...(animal === "skunk" && { captionPosition: "top" as const }),
            shake: first ? 1.2 : 1.5,
        })
        return [card, shot]
    })
}

function hookShots(scenes: Scenes): Shot[] {
    const close = hero(scenes, "hook")
    const glimpse = (animal: AnimalId, transition: Transition): GameShot => ({
        ...on(scenes, SCENE_OF[animal], hero(scenes, animal), {
            name: `Glimpse: ${animal}`,
            durationBeats: 0.5,
            heroBeat: 0.25,
            speed: false,
            transition,
            colour: LOOKS[animal].colour,
            camera: { move: "hold", zoom: 1.9, punch: 0 },
            shake: 0.7,
        }),
    })
    const boar = scenes.boar
    const boarRun = highlightsOf(boar).find((m) => m.kind === "nearMiss")
    const boss = highlightsOf(scenes.boss).find(
        (m) => m.kind === "enemyDefeated"
    )
    return [
        on(
            scenes,
            "hook",
            { tick: 60, focus: close.focus },
            {
                // The chase, in real time, punching on every beat.
                name: "Chase",
                durationBeats: 2,
                heroBeat: 1,
                speed: false,
                camera: { move: "follow", zoom: 2.3, punch: 0.14 },
                shake: 0,
            }
        ),
        on(scenes, "boar", boarRun ?? hero(scenes, "boar"), {
            name: "Run",
            durationBeats: 1,
            heroBeat: 0.5,
            speed: false,
            transition: "whip",
            camera: { move: "follow", zoom: 2.6, punch: 0.16 },
            shake: 0,
        }),
        on(scenes, "boss", boss ?? hero(scenes, "boss"), {
            name: "Fire",
            durationBeats: 0.5,
            heroBeat: 0.25,
            speed: false,
            transition: "flash",
            colour: FIRE,
            camera: { move: "hold", zoom: 2, punch: 0 },
            shake: 0.8,
        }),
        on(scenes, "hook", close, {
            // The near miss lands on bar 1's downbeat and all but
            // freezes, and the title slams over it.
            name: "Near miss",
            durationBeats: 2.5,
            heroBeat: 0.5,
            speed: { fast: 2.2, fastFrames: 6, slow: 0.06, hold: 34 },
            camera: { move: "hold", zoom: 3, punch: 0.2 },
            caption: "DOT EATER",
            // Low, so the close call stays in sight above it.
            captionSize: 250,
            colour: PAPER,
            shake: 1.6,
        }),
        // Four characters in half a beat each, flashing in their colours.
        glimpse("dragon", "flash"),
        glimpse("penguin", "flash"),
        glimpse("owl", "flash"),
        glimpse("boar", "flash"),
    ]
}

function dropoutShots(scenes: Scenes): Shot[] {
    const boar = hero(scenes, "boar")
    return [
        {
            // The music drops out: the last glimpse freezes and darkens.
            kind: "title",
            name: "5 animals, 5 powers",
            durationBeats: 4,
            freeze: {
                recording: scenes.boar,
                tick: boar.tick + 8,
                at: boar.focus,
                zoom: 1.9,
                untilBeat: 2,
            },
            lines: [
                { text: "5 ANIMALS.", beat: 0, size: 230 },
                {
                    text: CHARACTER_ORDER.map((a) => LOOKS[a].emoji).join(" "),
                    beat: 1,
                    size: 150,
                },
                { text: "5 POWERS.", beat: 2, size: 230, colour: FIRE },
            ],
        },
    ]
}

function bossShots(scenes: Scenes): Shot[] {
    const boss = scenes.boss
    const moments = highlightsOf(boss)
    const hits = moments.filter((m) => m.kind === "bossHit")
    const down = hero(scenes, "boss")
    const hit = (n: number) => {
        const m = hits[Math.min(n, hits.length - 1)]
        if (!m) throw new Error("The boss scene has no boss hits")
        return m
    }
    const hitShot = (
        n: number,
        transition: Transition,
        extra: Partial<GameShot> = {}
    ): GameShot =>
        on(scenes, "boss", hit(n), {
            name: `Boss hit ${n + 1}`,
            durationBeats: 2,
            heroBeat: 1,
            transition,
            colour: FIRE,
            speed: { slow: 0.15, hold: 10 },
            camera: { move: "push", zoom: [1.8, 2.7], punch: 0.18 },
            shake: 1.6,
            ...extra,
        })
    const stutter = (zoom: number): GameShot =>
        on(scenes, "boss", hit(3), {
            name: `Stutter x${zoom}`,
            durationBeats: 0.5,
            heroBeat: 0.25,
            speed: false,
            colour: FIRE,
            camera: { move: "hold", zoom, punch: 0 },
            shake: 1,
        })
    // The fight between the hits, following a dragon.
    const fill = (name: string, tick: number, player: number): GameShot =>
        on(
            scenes,
            "boss",
            { tick, focus: down.focus, player },
            {
                name,
                durationBeats: 2,
                heroBeat: 1,
                speed: false,
                transition: "whip",
                camera: { move: "follow", zoom: 2.2, punch: 0.2 },
                shake: 0,
            }
        )
    return [
        on(
            scenes,
            "boss",
            { tick: 340, focus: hit(0).focus },
            {
                // The lair, wide, as the hook comes in.
                name: "Boss lair",
                durationBeats: 2,
                heroBeat: 1,
                speed: false,
                transition: "flash",
                colour: FIRE,
                camera: { move: "hold", zoom: 1.25, punch: 0.1 },
                caption: "BOSS FIGHT.",
                captionInset: LETTERBOXED,
                shake: 0,
            }
        ),
        hitShot(0, "cut"),
        hitShot(1, "whip"),
        fill("Dodge", 760, 1),
        hitShot(2, "flash"),
        // The fourth hit three times: b-b-BOOM.
        stutter(2.3),
        stutter(2.9),
        hitShot(3, "cut", {
            heroBeat: 0,
            camera: { move: "hold", zoom: 3.4, punch: 0.2 },
            shake: 2,
        }),
        fill("Close in", 900, 0),
        hitShot(4, "flash"),
        on(
            scenes,
            "boss",
            { tick: 1250, focus: down.focus, player: 1 },
            {
                name: "Last run",
                durationBeats: 1.5,
                heroBeat: 0.75,
                speed: false,
                transition: "whip",
                camera: { move: "follow", zoom: 2.6, punch: 0.22 },
                shake: 0,
            }
        ),
        on(scenes, "boss", down, {
            // Down on bar 13's downbeat, in super slow motion.
            name: "Boss down",
            durationBeats: 3.5,
            heroBeat: 1.5,
            colour: FIRE,
            speed: { fast: 2, fastFrames: 10, slow: 0.05, hold: 60 },
            camera: { move: "push", zoom: [2, 3.4], punch: 0.15 },
            caption: "BOSS DOWN.",
            captionPosition: "center",
            captionSize: 230,
            shake: 2.6,
        }),
        on(scenes, "boss", down, {
            // Again, pulling out, on bar 13's third beat.
            name: "Boom",
            durationBeats: 2,
            heroBeat: 0,
            transition: "flash",
            colour: FIRE,
            speed: { slow: 0.08, hold: 40 },
            camera: { move: "pull", zoom: [3.2, 1.5], punch: 0.12 },
            caption: "BOOM.",
            captionInset: LETTERBOXED,
            shake: 2,
        }),
    ]
}

function endShots(): Shot[] {
    return [
        {
            kind: "title",
            name: "End card",
            // Up, to leave the foot to the emoji (see Promo2).
            offset: -70,
            durationBeats: 8,
            transition: "flash",
            lines: [
                { text: "DOT EATER", beat: 0, size: 280 },
                {
                    text: "PLAY FREE",
                    beat: 1,
                    size: 120,
                    colour: PAPER,
                    block: FIRE,
                },
                {
                    text: "kdaisho.github.io/dot-eater",
                    beat: 1.5,
                    size: 76,
                    mono: true,
                },
                { text: "Keyboard · Gamepad · Touch", beat: 2, size: 56 },
            ],
        },
    ]
}

export function promo2CutList(scenes: Scenes): CutList {
    return {
        startBeat: 0,
        shots: [
            ...hookShots(scenes),
            ...dropoutShots(scenes),
            ...characterShots(scenes),
            ...bossShots(scenes),
            ...endShots(),
        ],
    }
}

// The end card's five emoji pop in on these beats of the edit, one per
// character in CHARACTER_ORDER.
export const END_EMOJI_BEATS: readonly number[] = [59, 60, 61, 62, 63]
