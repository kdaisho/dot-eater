import type { Recording } from "../../src/replay"
import type { AnimalId } from "../../src/roster"
import type { CardShot, CutList, GameShot, Shot } from "./cutList"
import type { RampOptions, Transition } from "./drama"
import { PROMO3_EXCERPT } from "./excerpts"
import { heroMoment, highlightsOf, type Moment } from "./highlights"
import { LOOKS, PAPER } from "./palette"
import type { SceneName } from "./scenes"

// The v3 promo's edit (see Promo3.tsx): the 80 beats of PROMO3_EXCERPT,
// the song from its start on its half-time grid, beat 0 on its first
// downbeat. Made from the user's notes on v2: each character gets two
// whole bars (v2's card and caption, then its charged ability), the boss
// is short and wordless, and the name shows only on the end card.
//
//   beats  0–8   OPEN: the chase, a close call in gentle slow motion
//   beats  8–48  CHARACTERS: two bars each: a slam card, then the charged
//                ability in hard slow motion on the second bar's snare
//   beats 48–56  FIGHT: a punch lands, a guard blocks one, a breather's
//                breath hurts
//   beats 56–66  BOSS: two hits, the boss down on bar 16 (the lift)
//   beats 66–72  MONTAGE: a beat per character on the hook
//   beats 72–80  END CARD

export type Scenes = Readonly<Record<SceneName, Recording>>

// Bar `bar` of the excerpt as a beat of the edit.
export const beatOfBar = (bar: number) => bar * 4

const cue = (name: keyof typeof PROMO3_EXCERPT.cues) =>
    beatOfBar(PROMO3_EXCERPT.cues[name] - PROMO3_EXCERPT.fromBar)

// Where each section starts, in beats.
export const SECTIONS = {
    open: cue("open"),
    characters: cue("characters"),
    fight: cue("fight"),
    boss: cue("boss"),
    lift: cue("lift"),
    montage: cue("lift") + 2,
    endCard: cue("title"),
    end: cue("end"),
} as const

// The beat the boss goes down on: the lift.
export const BOSS_DOWN_BEAT = SECTIONS.lift

// The characters in the order they're shown.
export const CHARACTER_ORDER: readonly AnimalId[] = [
    "dragon",
    "penguin",
    "owl",
    "skunk",
    "boar",
]

// The slow motion on a moment: fast into it, hard slow on it.
const SOFT: RampOptions = { slow: 0.15, hold: 20 }

// The hard slow motion on an ability, as v2 had it (see speedRamp).
const ABILITY_RAMP: RampOptions = { slow: 0.1, hold: 18 }

// Zoom punches on the beat, a little under v2's.
const STILL = { punch: 0.12 } as const

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
            ...STILL,
            ...(moment.player !== undefined && { player: moment.player }),
            ...shot.camera,
        },
    }
}

function openShots(scenes: Scenes): Shot[] {
    return [
        on(scenes, "hook", hero(scenes, "hook"), {
            name: "Chase",
            durationBeats: 8,
            heroBeat: 2.5,
            speed: SOFT,
            camera: { move: "follow", zoom: 2.3, punch: 0.14 },
            shake: 1,
        }),
    ]
}

// Each character, two bars, as v2 introduced them: a slam card (emoji,
// name, ability word) for two beats, then its charged ability for six,
// landing in hard slow motion on the second bar's snare, with its colour,
// caption and a zoom punch.
function characterShots(scenes: Scenes): Shot[] {
    const ways: Transition[] = ["flash", "whip", "wipe", "flash", "whip"]
    const cardWays: Transition[] = ["cut", "wipe", "flash", "whip", "wipe"]
    return CHARACTER_ORDER.flatMap((animal, i) => {
        const look = LOOKS[animal]
        const card: CardShot = {
            kind: "card",
            name: `${look.name} card`,
            animal,
            durationBeats: 2,
            hits: [0, 0.5, 1],
            transition: cardWays[i],
            colour: look.colour,
        }
        const shot = on(scenes, animal, hero(scenes, animal), {
            name: `${look.name} ${look.ability}`,
            durationBeats: 6,
            // The owl's run before its gust is short.
            heroBeat: animal === "owl" ? 2.5 : 3,
            transition: ways[i],
            colour: look.colour,
            speed: ABILITY_RAMP,
            camera: {
                move: "push",
                // The dragon's fire is six cells long: keep it in shot.
                zoom: animal === "dragon" ? [1.6, 2.2] : [2, 3.2],
                punch: 0.18,
            },
            // A sound, not what it is: the card said that.
            caption: look.sound,
            // The skunk's cloud is low in the frame.
            ...(animal === "skunk" && { captionPosition: "top" as const }),
            shake: 1.4,
        })
        return [card, shot]
    })
}

function fightShots(scenes: Scenes): Shot[] {
    return [
        on(scenes, "punch", hero(scenes, "punch"), {
            name: "Punch",
            durationBeats: 3,
            heroBeat: 1.5,
            transition: "cut",
            speed: SOFT,
            camera: { move: "push", zoom: [2, 3], punch: 0.16 },
            shake: 1.3,
        }),
        on(scenes, "guard", hero(scenes, "guard"), {
            name: "Guard",
            durationBeats: 2.5,
            heroBeat: 1.25,
            transition: "cut",
            speed: SOFT,
            camera: { move: "push", zoom: [2, 3], punch: 0.16 },
            shake: 1.2,
        }),
        on(scenes, "breather", hero(scenes, "breather"), {
            name: "Breather",
            durationBeats: 2.5,
            heroBeat: 1.25,
            transition: "cut",
            speed: SOFT,
            camera: { move: "push", zoom: [1.8, 2.7], punch: 0.16 },
            shake: 1.4,
        }),
    ]
}

function bossShots(scenes: Scenes): Shot[] {
    const fire = LOOKS.dragon.colour
    const moments = highlightsOf(scenes.boss)
    const hits = moments.filter((m) => m.kind === "bossHit")
    const down = hero(scenes, "boss")
    if (hits.length < 2) throw new Error("The boss scene needs two hits")
    const hit = (n: number): GameShot =>
        on(scenes, "boss", hits[n], {
            name: `Boss hit ${n + 1}`,
            durationBeats: 2,
            heroBeat: 1,
            transition: n === 0 ? "flash" : "cut",
            colour: fire,
            speed: SOFT,
            camera: { move: "push", zoom: [1.8, 2.7], punch: 0.18 },
            shake: 1.6,
        })
    return [
        hit(0),
        hit(1),
        on(
            scenes,
            "boss",
            { tick: down.tick - 150, focus: down.focus, player: 0 },
            {
                name: "Closing in",
                durationBeats: 2,
                heroBeat: 1,
                speed: false,
                transition: "cut",
                camera: { move: "follow", zoom: 2.4, punch: 0.2 },
                shake: 0,
            }
        ),
        on(scenes, "boss", down, {
            // Down on the lift, in slow motion.
            name: "Boss down",
            durationBeats: 4,
            heroBeat: 2,
            colour: fire,
            speed: { fast: 2, fastFrames: 10, slow: 0.05, hold: 50 },
            camera: { move: "push", zoom: [2, 3.4], punch: 0.15 },
            shake: 2.4,
        }),
    ]
}

// A beat per character on the hook, just after its ability.
function montageShots(scenes: Scenes): Shot[] {
    return [...CHARACTER_ORDER, "punch" as const].map((scene) => {
        const moment = hero(scenes, scene)
        const look = scene === "punch" ? undefined : LOOKS[scene]
        return on(
            scenes,
            scene,
            { ...moment, tick: moment.tick + 20 },
            {
                name: `Montage: ${scene}`,
                durationBeats: 1,
                heroBeat: 0.5,
                speed: false,
                transition: "flash",
                ...(look && { colour: look.colour }),
                camera: { move: "hold", zoom: 1.9, punch: 0 },
                shake: 0.7,
            }
        )
    })
}

function endShots(): Shot[] {
    const fire = LOOKS.dragon.colour
    return [
        {
            kind: "title",
            name: "End card",
            // Up, to leave the foot to the emoji (see Promo3).
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
                    block: fire,
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

export function promo3CutList(scenes: Scenes): CutList {
    return {
        startBeat: 0,
        shots: [
            ...openShots(scenes),
            ...characterShots(scenes),
            ...fightShots(scenes),
            ...bossShots(scenes),
            ...montageShots(scenes),
            ...endShots(),
        ],
    }
}

// The end card's five emoji pop in on these beats of the edit, one per
// character in CHARACTER_ORDER.
export const END_EMOJI_BEATS: readonly number[] = [75, 76, 77, 78, 79]
