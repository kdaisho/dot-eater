// The mute button, in the top right corner on every screen: flips the
// settings' mute (the same one as on the settings screen), so sound can
// go off or on from anywhere. Unmuted unless turned off.

export type MuteButtonOptions = {
    isMuted: () => boolean
    toggle: () => void
}

export type MuteButton = {
    // Show the current mute, after it changed elsewhere (settings).
    update(): void
}

export function createMuteButton(
    doc: Document,
    options: MuteButtonOptions
): MuteButton {
    const button = doc.createElement("button")
    button.type = "button"
    button.id = "mute"
    function update() {
        const muted = options.isMuted()
        button.textContent = muted ? "🔇" : "🔊"
        button.setAttribute("aria-label", muted ? "Unmute" : "Mute")
        button.setAttribute("aria-pressed", String(muted))
    }
    button.addEventListener("click", (event) => {
        // Only the button: not also a tap on the screen under it (the
        // opening's "push any button").
        event.stopPropagation()
        options.toggle()
        update()
        // Keys go back to the game, so Space or Enter doesn't press the
        // button again.
        button.blur()
    })
    // Space or Enter on the focused button (from Tab) only presses it,
    // not the game's confirm too.
    button.addEventListener("keydown", (event) => {
        if (event.key === " " || event.key === "Enter") event.stopPropagation()
    })
    update()
    doc.body.append(button)
    return { update }
}
