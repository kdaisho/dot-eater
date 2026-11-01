import type { Recording } from "../../src/replay"
import type { AnimalId } from "../../src/roster"
import type { CutList, GameShot, Shot } from "./cutList"
import type { RampOptions, Transition } from "./drama"
import { PROMO3_EXCERPT } from "./excerpts"
import { heroMoment, highlightsOf, type Moment } from "./highlights"
import { LOOKS, PAPER } from "./palette"
import type { SceneName } from "./scenes"

// The v3 promo's edit (see Promo3.tsx): the 80 beats of PROMO3_EXCERPT,
// the song from its start on its half-time grid, beat 0 on its first
// downbeat. Made from the user's notes on v2: each character gets two
// whole bars and shows its charged ability, no caption explains it, the
// camera moves less, the boss is short and wordless, and the name shows
// only on the end card.
//
//   beats  0–8   OPEN: the chase, a close call in gentle slow motion
//   beats  8–48  CHARACTERS: two bars each, the charge building, then the
//                release in slow motion on beat 2 of the second bar
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

// Calm motion: a soft slow motion on a moment, no fast-forward into it.
const SOFT: RampOptions = { fast: 1, fastFrames: 1, slow: 0.3, hold: 24 }

// The camera never punches in on the beat in this edit (note 5).
const STILL = { punch: 0 } as const

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
            heroBeat: 3,
            speed: SOFT,
            camera: { move: "follow", zoom: 2 },
            shake: 0.3,
        }),
    ]
}

// Each character: two bars following it as the charge builds, the release
// on beat 2 of the second bar (beat 5) in soft slow motion, then what it
// did. The owl's run is short before its gust, so its release is earlier.
function characterShots(scenes: Scenes): Shot[] {
    const ways: Transition[] = ["wipe", "wipe", "wipe", "wipe", "wipe"]
    return CHARACTER_ORDER.map((animal, i) => {
        const look = LOOKS[animal]
        return on(scenes, animal, hero(scenes, animal), {
            name: `${look.name}: charged ${look.ability.toLowerCase()}`,
            durationBeats: 8,
            heroBeat: animal === "owl" ? 3 : 5,
            transition: ways[i],
            colour: look.colour,
            speed: SOFT,
            camera: { move: "push", zoom: [1.7, 2.2] },
            shake: 0.5,
        })
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
            camera: { move: "hold", zoom: 2.4 },
            shake: 0.4,
        }),
        on(scenes, "guard", hero(scenes, "guard"), {
            name: "Guard",
            durationBeats: 2.5,
            heroBeat: 1.25,
            transition: "cut",
            speed: SOFT,
            camera: { move: "hold", zoom: 2.4 },
            shake: 0.3,
        }),
        on(scenes, "breather", hero(scenes, "breather"), {
            name: "Breather",
            durationBeats: 2.5,
            heroBeat: 1.25,
            transition: "cut",
            speed: SOFT,
            camera: { move: "hold", zoom: 2 },
            shake: 0.5,
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
            camera: { move: "hold", zoom: 1.8 },
            shake: 0.6,
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
                camera: { move: "follow", zoom: 2 },
                shake: 0,
            }
        ),
        on(scenes, "boss", down, {
            // Down on the lift, in slow motion.
            name: "Boss down",
            durationBeats: 4,
            heroBeat: 2,
            colour: fire,
            speed: { fast: 1, fastFrames: 1, slow: 0.15, hold: 40 },
            camera: { move: "push", zoom: [1.8, 2.4] },
            shake: 0.8,
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
                transition: "cut",
                ...(look && { colour: look.colour }),
                camera: { move: "hold", zoom: 2 },
                shake: 0,
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
