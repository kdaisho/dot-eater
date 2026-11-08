// The soundtrack player's (KDA-332) files: each track whole, as released,
// with its own ending. The game's copies (recorded.ts) are cut a second
// past their loop end, since the game loops them, so they stop mid-phrase
// when played straight through. These are made from the same originals,
// each as loud as its game copy with its MUSIC_TRIM_DB trim (audio.ts, set
// by ear in the mixer), all 2 dB up for a car (about -13 to -17 LUFS),
// peaks limited to -1 dBFS, 128 kbps. Haunted Halls and Gauntlet are made
// to loop and have no ending, so they fade out over their last 6 s. Only
// the player page loads them. A change to the trims means re-rendering
// these.

import classic from "./assets/soundtrack/01-classic.mp3"
import wrapMaze from "./assets/soundtrack/02-wrap-maze.mp3"
import iceRink from "./assets/soundtrack/03-ice-rink.mp3"
import fog from "./assets/soundtrack/04-fog.mp3"
import bossLair from "./assets/soundtrack/05-boss-lair.mp3"
import hauntedHalls from "./assets/soundtrack/06-haunted-halls.mp3"
import patrolBase from "./assets/soundtrack/07-patrol-base.mp3"
import frozenFog from "./assets/soundtrack/08-frozen-fog.mp3"
import gauntlet from "./assets/soundtrack/09-gauntlet.mp3"
import bossFinal from "./assets/soundtrack/10-boss-final.mp3"
import endRoll from "./assets/soundtrack/11-end-roll.mp3"
import opening from "./assets/soundtrack/opening.mp3"
import { MusicTrackId } from "./music"

export const PLAYER_FILES: Readonly<Partial<Record<MusicTrackId, string>>> = {
    [MusicTrackId.opening]: opening,
    [MusicTrackId.stage1]: classic,
    [MusicTrackId.stage2]: wrapMaze,
    [MusicTrackId.stage3]: iceRink,
    [MusicTrackId.stage4]: fog,
    [MusicTrackId.stage5]: bossLair,
    [MusicTrackId.stage6]: hauntedHalls,
    [MusicTrackId.stage7]: patrolBase,
    [MusicTrackId.stage8]: frozenFog,
    [MusicTrackId.stage9]: gauntlet,
    [MusicTrackId.stage10]: bossFinal,
    [MusicTrackId.endRoll]: endRoll,
}
