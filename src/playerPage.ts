// The soundtrack player page (KDA-332), soundtrack/index.html: the game's
// recorded music as a music app, for a phone in the car. The entry of its
// own page, apart from the game (main.ts).
//
// It plays through an <audio> element, not Web Audio, so it keeps playing
// with the screen locked, and it tells the browser what's playing through
// the Media Session API: the lock screen, a car over Bluetooth and
// headphones get the track's name and picture, play/pause, next, previous
// and seeking. Repeat and shuffle are on the page only: Media Session has
// no actions for them. Each file plays from its start to its end; the
// game's loop points (recorded.ts) aren't used.

import "@fontsource/press-start-2p/latin-400.css"
import { trackArt, trackDots } from "./playerArt"
import { PLAYER_ICONS } from "./playerIcons"
import {
    createPlaylist,
    currentTrack,
    cycleRepeat,
    next,
    pick,
    previous,
    setShuffle,
    type Playlist,
    type Repeat,
} from "./playlist"
import { pixelSvg } from "./pixelSvg"
import { RECORDED_TRACKS } from "./recorded"
import { formatClock, SOUNDTRACK } from "./soundtrack"
import type { Dots, PixelArt } from "./sprites"

const ARTIST = "Dot Eater"
const ALBUM = "Dot Eater Soundtrack"
const SAVED = "dot-eater.player"
const ARTWORK_SIZE = 512

const TRACKS = SOUNDTRACK.flatMap((entry) => {
    const recorded = RECORDED_TRACKS[entry.track]
    return recorded ? [{ ...entry, url: recorded.url }] : []
})

type Saved = { repeat: Repeat; shuffle: boolean }

function loadSaved(): Saved {
    try {
        const raw = JSON.parse(localStorage.getItem(SAVED) ?? "{}") as Partial<
            Record<string, unknown>
        >
        const repeat = ["off", "all", "one"].includes(raw.repeat as string)
            ? (raw.repeat as Repeat)
            : "all"
        return { repeat, shuffle: raw.shuffle === true }
    } catch {
        return { repeat: "all", shuffle: false }
    }
}

function save(p: Playlist) {
    try {
        localStorage.setItem(
            SAVED,
            JSON.stringify({ repeat: p.repeat, shuffle: p.shuffle })
        )
    } catch {
        // Private windows can refuse storage; the settings just aren't kept.
    }
}

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
}

function iconButton(label: string, icon: PixelArt, className = "") {
    const button = el("button", `key ${className}`.trim())
    button.type = "button"
    button.setAttribute("aria-label", label)
    button.append(pixelSvg(document, icon))
    return button
}

function setIcon(button: HTMLButtonElement, icon: PixelArt) {
    button.replaceChildren(pixelSvg(document, icon))
}

// Dots drawn on a canvas, centred on the track's colour, as large as
// whole pixels allow within `fill` of the side.
function drawArt(
    canvas: HTMLCanvasElement,
    dots: Dots,
    background: string,
    fill: number
) {
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const side = canvas.width
    const h = dots.length
    const w = Math.max(...dots.map((row) => row.length))
    const scale = Math.max(1, Math.floor((side * fill) / Math.max(w, h)))
    const x0 = Math.floor((side - w * scale) / 2)
    const y0 = Math.floor((side - h * scale) / 2)
    ctx.fillStyle = background
    ctx.fillRect(0, 0, side, side)
    dots.forEach((row, y) =>
        row.forEach((colour, x) => {
            if (!colour) return
            ctx.fillStyle = colour
            ctx.fillRect(x0 + x * scale, y0 + y * scale, scale, scale)
        })
    )
}

function artCanvas(index: number, side: number, fill: number) {
    const track = TRACKS[index]!.track
    const canvas = el("canvas")
    canvas.width = side
    canvas.height = side
    drawArt(canvas, trackDots(track), trackArt(track).background, fill)
    return canvas
}

// Each track's Media Session picture, made once.
const artworkUrls = new Map<number, string>()
function artworkUrl(index: number): string {
    let url = artworkUrls.get(index)
    if (!url) {
        url = artCanvas(index, ARTWORK_SIZE, 0.7).toDataURL("image/png")
        artworkUrls.set(index, url)
    }
    return url
}

function start() {
    const saved = loadSaved()
    let playlist = createPlaylist(TRACKS.length, saved.repeat, saved.shuffle)
    // Set while the user drags the seek bar, so time updates don't fight it.
    let seeking = false

    const audio = el("audio")
    audio.preload = "metadata"

    const root = el("main", "player")
    const header = el("header", "player-head")
    const back = el("a", "back", "◀ Game")
    // The game is one folder up, in dev and on Pages alike.
    back.href = "../"
    header.append(back, el("h1", "player-title", "Soundtrack"))

    const now = el("section", "now")
    const nowArt = el("div", "now-art")
    const nowName = el("h2", "now-name")
    const nowPlays = el("p", "now-plays")

    const seek = el("input", "seek")
    seek.type = "range"
    seek.min = "0"
    seek.step = "0.1"
    seek.value = "0"
    seek.setAttribute("aria-label", "Seek")
    const times = el("div", "times")
    const elapsedText = el("span", "", "0:00")
    const lengthText = el("span", "", "0:00")
    times.append(elapsedText, lengthText)

    const controls = el("div", "controls")
    const shuffleKey = iconButton("Shuffle", PLAYER_ICONS.shuffle, "toggle")
    const prevKey = iconButton("Previous", PLAYER_ICONS.previous)
    const playKey = iconButton("Play", PLAYER_ICONS.play, "play")
    const nextKey = iconButton("Next", PLAYER_ICONS.next)
    const repeatKey = iconButton("Repeat", PLAYER_ICONS.repeat, "toggle")
    controls.append(shuffleKey, prevKey, playKey, nextKey, repeatKey)
    now.append(nowArt, nowName, nowPlays, seek, times, controls)

    const list = el("ol", "tracks")
    const rows = TRACKS.map((entry, i) => {
        const row = el("li")
        const button = el("button", "track")
        button.type = "button"
        const text = el("span", "track-text")
        text.append(
            el("span", "track-name", entry.name),
            el("span", "track-plays", entry.plays)
        )
        button.append(artCanvas(i, 96, 0.8), text)
        button.addEventListener("click", () => {
            if (i === currentTrack(playlist)) return togglePlay()
            playlist = pick(playlist, i)
            load(true)
        })
        row.append(button)
        list.append(row)
        return row
    })

    root.append(header, now, list, audio)
    document.body.append(root)

    function showTrack() {
        const i = currentTrack(playlist)
        const entry = TRACKS[i]!
        nowArt.replaceChildren(artCanvas(i, 384, 0.7))
        nowName.textContent = entry.name
        nowPlays.textContent = entry.plays
        rows.forEach((row, r) => row.classList.toggle("current", r === i))
        document.title = `${entry.name} · Dot Eater Soundtrack`
        if ("mediaSession" in navigator)
            navigator.mediaSession.metadata = new MediaMetadata({
                title: entry.name,
                artist: ARTIST,
                album: ALBUM,
                artwork: [
                    {
                        src: artworkUrl(i),
                        sizes: `${ARTWORK_SIZE}x${ARTWORK_SIZE}`,
                        type: "image/png",
                    },
                ],
            })
    }

    function showModes() {
        shuffleKey.classList.toggle("on", playlist.shuffle)
        shuffleKey.setAttribute("aria-pressed", String(playlist.shuffle))
        const repeat = playlist.repeat
        repeatKey.classList.toggle("on", repeat !== "off")
        repeatKey.setAttribute("aria-pressed", String(repeat !== "off"))
        repeatKey.setAttribute(
            "aria-label",
            { off: "Repeat: off", all: "Repeat: all", one: "Repeat: one" }[
                repeat
            ]
        )
        setIcon(
            repeatKey,
            repeat === "one" ? PLAYER_ICONS.repeatOne : PLAYER_ICONS.repeat
        )
    }

    function showPlaying() {
        const playing = !audio.paused
        setIcon(playKey, playing ? PLAYER_ICONS.pause : PLAYER_ICONS.play)
        playKey.setAttribute("aria-label", playing ? "Pause" : "Play")
        root.classList.toggle("playing", playing)
        if ("mediaSession" in navigator)
            navigator.mediaSession.playbackState = playing
                ? "playing"
                : "paused"
    }

    function showTime() {
        const length = Number.isFinite(audio.duration) ? audio.duration : 0
        seek.max = String(length)
        if (!seeking) seek.value = String(audio.currentTime)
        elapsedText.textContent = formatClock(
            seeking ? Number(seek.value) : audio.currentTime
        )
        lengthText.textContent = formatClock(length)
        seek.style.setProperty(
            "--done",
            `${length ? (Number(seek.value) / length) * 100 : 0}%`
        )
    }

    function showPosition() {
        if (!("mediaSession" in navigator)) return
        if (!Number.isFinite(audio.duration)) return
        try {
            navigator.mediaSession.setPositionState({
                duration: audio.duration,
                playbackRate: audio.playbackRate,
                position: Math.min(audio.currentTime, audio.duration),
            })
        } catch {
            // Some browsers refuse a position state; the bar just won't show.
        }
    }

    function play() {
        audio.play().catch(() => showPlaying())
    }

    function load(autoplay: boolean) {
        audio.src = TRACKS[currentTrack(playlist)]!.url
        audio.currentTime = 0
        showTrack()
        showTime()
        if (autoplay) play()
        else showPlaying()
    }

    function togglePlay() {
        if (audio.paused) play()
        else audio.pause()
    }

    function goNext(ended: boolean) {
        const step = next(playlist, ended)
        const same = currentTrack(step.playlist) === currentTrack(playlist)
        playlist = step.playlist
        if (same && step.play) {
            audio.currentTime = 0
            play()
        } else load(step.play)
    }

    function goPrevious() {
        const back = previous(playlist, audio.currentTime)
        if (back.restart) {
            audio.currentTime = 0
            return
        }
        playlist = back.playlist
        load(!audio.paused)
    }

    function seekTo(seconds: number) {
        audio.currentTime = Math.max(0, seconds)
        showTime()
        showPosition()
    }

    playKey.addEventListener("click", togglePlay)
    nextKey.addEventListener("click", () => goNext(false))
    prevKey.addEventListener("click", goPrevious)
    shuffleKey.addEventListener("click", () => {
        playlist = setShuffle(playlist, !playlist.shuffle)
        save(playlist)
        showModes()
    })
    repeatKey.addEventListener("click", () => {
        playlist = cycleRepeat(playlist)
        save(playlist)
        showModes()
    })
    seek.addEventListener("input", () => {
        seeking = true
        showTime()
    })
    seek.addEventListener("change", () => {
        seeking = false
        seekTo(Number(seek.value))
    })

    audio.addEventListener("play", showPlaying)
    audio.addEventListener("pause", showPlaying)
    audio.addEventListener("ended", () => goNext(true))
    audio.addEventListener("timeupdate", showTime)
    audio.addEventListener("loadedmetadata", () => {
        showTime()
        showPosition()
    })
    audio.addEventListener("seeked", showPosition)
    audio.addEventListener("ratechange", showPosition)

    // Space plays and pauses, the arrows skip, for a keyboard.
    document.addEventListener("keydown", (e) => {
        if (e.target instanceof HTMLInputElement) return
        if (e.key === " ") {
            e.preventDefault()
            togglePlay()
        } else if (e.key === "ArrowRight") goNext(false)
        else if (e.key === "ArrowLeft") goPrevious()
    })

    // The lock screen's, the car's and the headphones' buttons. No
    // seekbackward/seekforward: on iOS they take the place of next and
    // previous.
    if ("mediaSession" in navigator) {
        const session = navigator.mediaSession
        const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
            ["play", play],
            ["pause", () => audio.pause()],
            ["stop", () => audio.pause()],
            ["nexttrack", () => goNext(false)],
            ["previoustrack", goPrevious],
            [
                "seekto",
                (details) => {
                    if (details.seekTime !== undefined) seekTo(details.seekTime)
                },
            ],
        ]
        for (const [action, handler] of handlers) {
            try {
                session.setActionHandler(action, handler)
            } catch {
                // An action this browser doesn't know.
            }
        }
    }

    showModes()
    load(false)
}

start()
