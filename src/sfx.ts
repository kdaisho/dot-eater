// Sound effects as data (KDA-212): each effect is a short list of tones (see
// tone.ts), all synthesized, no asset files. The ids are the vocabulary the
// game plays sounds by: phase 2 maps each game event to one id with a small
// table, and the audio engine plays it (`playSfx`). Tweak a sound by editing
// its numbers here; the tests check every id has a playable definition.

import type { AnimalId } from "./roster"
import { noteFreq, type Tone } from "./tone"

export const SfxId = {
    // Play
    dot: "dot",
    breathDragon: "breath.dragon",
    breathPenguin: "breath.penguin",
    breathOwl: "breath.owl",
    breathSkunk: "breath.skunk",
    breathBoar: "breath.boar",
    enemyDefeated: "enemyDefeated",
    bossHit: "bossHit",
    bossDefeated: "bossDefeated",
    // The boss's breath (KDA-268): a low rumble as it winds up, then a roar.
    bossWindUp: "boss.windUp",
    bossBreath: "boss.breath",
    // A player hurt with health left (KDA-257): a short knock.
    hurt: "hurt",
    // A player knocked out: its health gone.
    caught: "caught",
    // Versus: a player stunned by the other's breath.
    stunned: "stunned",
    // A Splitter dropped a dot (KDA-270): a soft, low plop.
    dotDropped: "dotDropped",
    // The punch (KDA-258): a whiff for a jab, a thwack when it lands on an
    // enemy or the other player, a dull thud on the boss.
    punch: "punch",
    punchHit: "punchHit",
    punchHitBoss: "punchHit.boss",
    // Results: also fit a won or lost versus round.
    stageClear: "stageClear",
    gameOver: "gameOver",
    // Menus
    menuMove: "menuMove",
    confirm: "confirm",
    back: "back",
    pause: "pause",
} as const
export type SfxId = (typeof SfxId)[keyof typeof SfxId]

export const SFX_IDS: readonly SfxId[] = Object.values(SfxId)

// Each animal's breath sound. A Record over AnimalId, so a new animal without
// one is a type error.
export const BREATH_SFX: Readonly<Record<AnimalId, SfxId>> = {
    dragon: SfxId.breathDragon,
    penguin: SfxId.breathPenguin,
    owl: SfxId.breathOwl,
    skunk: SfxId.breathSkunk,
    boar: SfxId.breathBoar,
}

// The sound of an animal's breath.
export function breathSfx(animal: AnimalId): SfxId {
    return BREATH_SFX[animal]
}

// Notes one after another, `step` seconds apart, each `length` long.
function arpeggio(
    notes: readonly string[],
    step: number,
    length: number,
    rest: Omit<Tone, "at" | "duration" | "freq">
): Tone[] {
    return notes.map((name, i) => ({
        ...rest,
        at: i * step,
        duration: length,
        freq: noteFreq(name),
    }))
}

export const SFX: Readonly<Record<SfxId, readonly Tone[]>> = {
    // A quick upward blip; it plays several times a second, so it stays short
    // and quiet.
    dot: [
        {
            wave: "square",
            at: 0,
            duration: 0.05,
            freq: 880,
            freqEnd: 1320,
            volume: 0.15,
        },
    ],
    // Fire: a roaring hiss falling in pitch over a low growl.
    "breath.dragon": [
        {
            wave: "noise",
            at: 0,
            duration: 0.4,
            freq: 1500,
            freqEnd: 300,
            volume: 0.6,
            attack: 0.02,
        },
        {
            wave: "sawtooth",
            at: 0,
            duration: 0.3,
            freq: 160,
            freqEnd: 70,
            volume: 0.2,
        },
    ],
    // Ice: a rising glassy sparkle over a thin, high hiss.
    "breath.penguin": [
        ...arpeggio(["C7", "E7", "G7", "C8"], 0.05, 0.12, {
            wave: "triangle",
            volume: 0.25,
        }),
        {
            wave: "noise",
            at: 0,
            duration: 0.3,
            freq: 7000,
            volume: 0.2,
            attack: 0.03,
        },
    ],
    // Wind: a whoosh that swells and rises.
    "breath.owl": [
        {
            wave: "noise",
            at: 0,
            duration: 0.35,
            freq: 400,
            freqEnd: 1800,
            volume: 0.6,
            attack: 0.12,
        },
    ],
    // Stink: a low, buzzy raspberry.
    "breath.skunk": [
        {
            wave: "sawtooth",
            at: 0,
            duration: 0.4,
            freq: 110,
            freqEnd: 65,
            volume: 0.25,
            attack: 0.02,
        },
        {
            wave: "noise",
            at: 0,
            duration: 0.4,
            freq: 350,
            volume: 0.3,
            attack: 0.05,
        },
    ],
    // Wall-break: a thud and a crumbling crash.
    "breath.boar": [
        {
            wave: "square",
            at: 0,
            duration: 0.2,
            freq: 110,
            freqEnd: 40,
            volume: 0.35,
        },
        {
            wave: "noise",
            at: 0.02,
            duration: 0.35,
            freq: 900,
            freqEnd: 120,
            volume: 0.6,
        },
    ],
    // Two quick rising chirps.
    enemyDefeated: [
        {
            wave: "square",
            at: 0,
            duration: 0.1,
            freq: 660,
            freqEnd: 1320,
            volume: 0.2,
        },
        {
            wave: "square",
            at: 0.08,
            duration: 0.12,
            freq: 990,
            freqEnd: 1980,
            volume: 0.2,
        },
    ],
    // A dull clank.
    bossHit: [
        {
            wave: "square",
            at: 0,
            duration: 0.15,
            freq: 220,
            freqEnd: 110,
            volume: 0.3,
        },
        {
            wave: "noise",
            at: 0,
            duration: 0.1,
            freq: 2000,
            volume: 0.3,
        },
    ],
    // A rising fanfare, then a boom.
    bossDefeated: [
        ...arpeggio(["C5", "E5", "G5", "C6", "E6", "G6", "C7"], 0.07, 0.1, {
            wave: "square",
            volume: 0.2,
        }),
        {
            wave: "noise",
            at: 0.5,
            duration: 0.8,
            freq: 600,
            freqEnd: 80,
            volume: 0.7,
        },
        {
            wave: "sine",
            at: 0.5,
            duration: 0.6,
            freq: 120,
            freqEnd: 35,
            volume: 0.5,
        },
    ],
    // A low rumble swelling over the wind-up (about as long as the default
    // BOSS_BREATH_WIND_UP), a growl over a deep hiss.
    "boss.windUp": [
        {
            wave: "sawtooth",
            at: 0,
            duration: 0.9,
            freq: 50,
            freqEnd: 75,
            volume: 0.3,
            attack: 0.5,
        },
        {
            wave: "noise",
            at: 0,
            duration: 0.9,
            freq: 180,
            freqEnd: 260,
            volume: 0.35,
            attack: 0.5,
        },
    ],
    // A roar: a loud falling blast of noise over a deep, falling growl.
    "boss.breath": [
        {
            wave: "noise",
            at: 0,
            duration: 0.6,
            freq: 1100,
            freqEnd: 180,
            volume: 0.75,
            attack: 0.02,
        },
        {
            wave: "sawtooth",
            at: 0,
            duration: 0.5,
            freq: 130,
            freqEnd: 45,
            volume: 0.35,
            attack: 0.02,
        },
    ],
    // A short, dull thump with a crunch: less dramatic than the knockout's
    // long fall.
    hurt: [
        {
            wave: "square",
            at: 0,
            duration: 0.12,
            freq: 330,
            freqEnd: 140,
            volume: 0.25,
            attack: 0.005,
        },
        {
            wave: "noise",
            at: 0,
            duration: 0.08,
            freq: 1200,
            volume: 0.2,
        },
    ],
    // The classic falling "caught" wail, for a knockout.
    caught: [
        {
            wave: "square",
            at: 0,
            duration: 0.7,
            freq: 880,
            freqEnd: 90,
            volume: 0.25,
            attack: 0.01,
        },
    ],
    // A dizzy wobble: three falling chirps.
    stunned: arpeggio(["G6", "E6", "C6"], 0.08, 0.08, {
        wave: "triangle",
        freqEnd: 900,
        volume: 0.3,
    }),
    // A soft, low plop, falling: quieter than the dot blip, since every
    // Splitter makes one every few seconds, wherever it is.
    dotDropped: [
        {
            wave: "triangle",
            at: 0,
            duration: 0.08,
            freq: 520,
            freqEnd: 260,
            volume: 0.12,
        },
    ],
    // A quick, quiet whiff: a tiny falling breath of air. It can play several
    // times a second, so it stays short and soft.
    punch: [
        {
            wave: "noise",
            at: 0,
            duration: 0.07,
            freq: 2500,
            freqEnd: 900,
            volume: 0.25,
            attack: 0.01,
        },
    ],
    // A punchy thwack: a sharp crack over a short low knock.
    punchHit: [
        {
            wave: "noise",
            at: 0,
            duration: 0.06,
            freq: 3000,
            freqEnd: 1200,
            volume: 0.45,
        },
        {
            wave: "square",
            at: 0,
            duration: 0.09,
            freq: 330,
            freqEnd: 120,
            volume: 0.3,
        },
    ],
    // A dull thud: the boss takes it without a flinch.
    "punchHit.boss": [
        {
            wave: "sine",
            at: 0,
            duration: 0.15,
            freq: 140,
            freqEnd: 50,
            volume: 0.5,
        },
        {
            wave: "noise",
            at: 0,
            duration: 0.06,
            freq: 500,
            volume: 0.25,
        },
    ],
    // A short rising jingle on a major chord.
    stageClear: [
        ...arpeggio(["C5", "E5", "G5"], 0.1, 0.1, {
            wave: "square",
            volume: 0.2,
            hold: true,
        }),
        {
            wave: "square",
            at: 0.3,
            duration: 0.5,
            freq: noteFreq("C6"),
            volume: 0.2,
            hold: true,
        },
        {
            wave: "triangle",
            at: 0.3,
            duration: 0.5,
            freq: noteFreq("C4"),
            volume: 0.4,
            hold: true,
        },
    ],
    // A slow, falling minor phrase.
    gameOver: [
        ...arpeggio(["G4", "Eb4", "C4"], 0.25, 0.22, {
            wave: "square",
            volume: 0.2,
            hold: true,
        }),
        {
            wave: "triangle",
            at: 0.75,
            duration: 0.8,
            freq: noteFreq("C3"),
            volume: 0.4,
        },
    ],
    menuMove: [
        {
            wave: "square",
            at: 0,
            duration: 0.04,
            freq: 660,
            volume: 0.12,
        },
    ],
    confirm: arpeggio(["A5", "E6"], 0.05, 0.06, {
        wave: "square",
        volume: 0.15,
    }),
    back: arpeggio(["E6", "A5"], 0.05, 0.06, {
        wave: "square",
        volume: 0.15,
    }),
    pause: arpeggio(["E6", "B5"], 0.06, 0.06, {
        wave: "triangle",
        volume: 0.3,
    }),
}
