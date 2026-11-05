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
    // The Boar's Rush ramming something (KDA-304): a heavy thud.
    ram: "ram",
    enemyDefeated: "enemyDefeated",
    bossHit: "bossHit",
    // The boss's defeat (KDA-301): the killing blow's heavy hit, as the
    // music cuts; the burst's shatter; the chain's small blasts and its big
    // one. The clear jingle follows (stageClear).
    bossDefeated: "bossDefeated",
    bossShatter: "boss.shatter",
    bossBlast: "boss.blast",
    bossBigBlast: "boss.bigBlast",
    // The boss's breath (KDA-268): a low rumble as it winds up, then a roar.
    bossWindUp: "boss.windUp",
    bossBreath: "boss.breath",
    // A breather's breath (KDA-291): a soft rising charge as it winds up,
    // then a short hiss, both quieter than the boss's.
    enemyWindUp: "breather.windUp",
    enemyBreath: "breather.breath",
    // A player hurt with health left (KDA-257): a short knock.
    hurt: "hurt",
    // A player knocked out: its health gone (KDA-329, timed to the
    // knockout's look in knockoutView.ts).
    caught: "caught",
    // Co-op: a player panicked by the other's breath (KDA-316).
    panicked: "panicked",
    // A Splitter dropped a dot (KDA-270): a soft, low plop.
    dotDropped: "dotDropped",
    // Present boxes (KDA-324): one dropping, and a short pickup sound per
    // content as one opens (a rumble for the Earthquake).
    presentDropped: "present.dropped",
    presentHeal: "present.heal",
    presentHugeDot: "present.hugeDot",
    presentSpeed: "present.speed",
    presentQuake: "present.quake",
    presentGerm: "present.germ",
    // Results
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

// The knockout's crumble ticks (see caught below): one noise click each,
// 0.07 s apart, at these filter centres, so they don't all sound alike.
const CRUMBLE_TICKS = [2600, 1900, 3100, 2200, 2900, 2000, 2500] as const

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
    // Rush (KDA-304): a quick rising whoosh of hooves over a short growl,
    // the dash itself. What it rams adds the ram's thud.
    "breath.boar": [
        {
            wave: "noise",
            at: 0,
            duration: 0.22,
            freq: 300,
            freqEnd: 1400,
            volume: 0.5,
            attack: 0.04,
        },
        {
            wave: "sawtooth",
            at: 0,
            duration: 0.18,
            freq: 90,
            freqEnd: 140,
            volume: 0.18,
        },
    ],
    // A heavy thud and a short crunch (it was the wall-break breath's
    // sound, KDA-220).
    ram: [
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
            duration: 0.3,
            freq: 900,
            freqEnd: 120,
            volume: 0.55,
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
    // A heavy hit (KDA-301): a sharp crack over a deep thump that drops
    // away, in the silence of the music cut. No fanfare: the clear jingle
    // comes once the defeat has played out.
    bossDefeated: [
        {
            wave: "noise",
            at: 0,
            duration: 0.25,
            freq: 2400,
            freqEnd: 400,
            volume: 0.7,
        },
        {
            wave: "square",
            at: 0,
            duration: 0.35,
            freq: 140,
            freqEnd: 40,
            volume: 0.4,
        },
        {
            wave: "sine",
            at: 0,
            duration: 0.6,
            freq: 90,
            freqEnd: 30,
            volume: 0.6,
        },
    ],
    // Glass-like shards: a bright crash and a falling sprinkle of high
    // notes, as the burst's boss breaks into its pixels.
    "boss.shatter": [
        {
            wave: "noise",
            at: 0,
            duration: 0.5,
            freq: 5000,
            freqEnd: 1500,
            volume: 0.55,
        },
        ...arpeggio(["E7", "B6", "G6", "E6", "B5"], 0.06, 0.12, {
            wave: "triangle",
            volume: 0.2,
        }),
    ],
    // One small blast of the chain: a short pop. Up to 14 of them close
    // together, so short and not loud.
    "boss.blast": [
        {
            wave: "noise",
            at: 0,
            duration: 0.14,
            freq: 900,
            freqEnd: 250,
            volume: 0.45,
        },
        {
            wave: "square",
            at: 0,
            duration: 0.08,
            freq: 110,
            freqEnd: 55,
            volume: 0.2,
        },
    ],
    // The chain's big blast: a long roaring boom.
    "boss.bigBlast": [
        {
            wave: "noise",
            at: 0,
            duration: 1.1,
            freq: 700,
            freqEnd: 60,
            volume: 0.7,
        },
        {
            wave: "sine",
            at: 0,
            duration: 0.9,
            freq: 110,
            freqEnd: 28,
            volume: 0.6,
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
    // A soft rising whine over the wind-up (about as long as
    // ENEMY_BREATH_WIND_UP): higher and quieter than the boss's rumble.
    "breather.windUp": [
        {
            wave: "triangle",
            at: 0,
            duration: 0.6,
            freq: 220,
            freqEnd: 440,
            volume: 0.15,
            attack: 0.35,
        },
        {
            wave: "noise",
            at: 0,
            duration: 0.6,
            freq: 900,
            freqEnd: 1600,
            volume: 0.1,
            attack: 0.4,
        },
    ],
    // A short hiss: a falling puff of noise over a small falling buzz, far
    // softer than the boss's roar.
    "breather.breath": [
        {
            wave: "noise",
            at: 0,
            duration: 0.3,
            freq: 2200,
            freqEnd: 600,
            volume: 0.3,
            attack: 0.01,
        },
        {
            wave: "square",
            at: 0,
            duration: 0.2,
            freq: 330,
            freqEnd: 165,
            volume: 0.12,
            attack: 0.01,
        },
    ],
    // A short, dull thump with a crunch: less dramatic than the knockout.
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
    // A knockout (KDA-329, "Shockwave crumble"): a burst of noise sweeping
    // down over a low thud as the rings go out, the crumble's tiny ticks
    // as it falls into its pile, and a falling arpeggio over them.
    caught: [
        {
            wave: "noise",
            at: 0,
            duration: 0.38,
            freq: 5000,
            freqEnd: 250,
            volume: 0.6,
        },
        {
            wave: "triangle",
            at: 0.02,
            duration: 0.32,
            freq: 150,
            freqEnd: 40,
            volume: 0.6,
        },
        ...CRUMBLE_TICKS.map((freq, i): Tone => ({
            wave: "noise",
            at: 0.5 + i * 0.07,
            duration: 0.03,
            freq,
            volume: 0.12,
        })),
        ...arpeggio(["C6", "A5", "F5", "D5"], 0.08, 0.09, {
            wave: "triangle",
            volume: 0.14,
        }).map((t) => ({ ...t, at: t.at + 0.55 })),
    ],
    // A startled yelp: two quick rising chirps up high, light and short,
    // nothing like a hurt's thump (nobody is hurt).
    panicked: arpeggio(["E6", "A6"], 0.07, 0.07, {
        wave: "triangle",
        volume: 0.25,
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
    // A box dropping: a light double tap, a little bright, so it is
    // noticed over the defeat's chirps.
    "present.dropped": arpeggio(["G5", "D6"], 0.06, 0.06, {
        wave: "triangle",
        volume: 0.2,
    }),
    // Heal: a warm rising third, like a sigh of relief.
    "present.heal": arpeggio(["C5", "E5", "G5", "C6"], 0.06, 0.09, {
        wave: "triangle",
        volume: 0.3,
    }),
    // Huge dot: the dot blip's sweep, big and quick, then a sparkle.
    "present.hugeDot": [
        {
            wave: "square",
            at: 0,
            duration: 0.12,
            freq: 660,
            freqEnd: 1760,
            volume: 0.18,
        },
        ...arpeggio(["E6", "B6"], 0.05, 0.08, {
            wave: "square",
            volume: 0.12,
        }).map((t) => ({ ...t, at: t.at + 0.12 })),
    ],
    // Speed boost: a fast upward whoosh.
    "present.speed": [
        {
            wave: "sawtooth",
            at: 0,
            duration: 0.25,
            freq: 220,
            freqEnd: 1320,
            volume: 0.15,
        },
        {
            wave: "noise",
            at: 0,
            duration: 0.25,
            freq: 800,
            freqEnd: 3000,
            volume: 0.15,
        },
    ],
    // Earthquake: a deep rumble that rolls on under everything.
    "present.quake": [
        {
            wave: "noise",
            at: 0,
            duration: 0.9,
            freq: 160,
            freqEnd: 60,
            volume: 0.6,
            attack: 0.03,
        },
        {
            wave: "sine",
            at: 0,
            duration: 0.8,
            freq: 55,
            freqEnd: 35,
            volume: 0.5,
            attack: 0.03,
        },
    ],
    // Germ: a sour falling wobble, bad luck.
    "present.germ": arpeggio(["E4", "Eb4", "Bb3"], 0.08, 0.1, {
        wave: "square",
        volume: 0.2,
    }),
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
