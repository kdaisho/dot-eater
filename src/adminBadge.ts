// The debug mode badge (see admin.ts), in the top left corner on every
// screen while debug mode is on, so it is never mistaken for normal play:
// a "DEBUG MODE" label and a Clear button that turns debug mode off and
// forgets it in this browser (the same as the admin panel's Turn off),
// without opening #admin. Hidden while debug mode is off.

export type AdminBadgeOptions = {
    isOn: () => boolean
    clear: () => void
}

export type AdminBadge = {
    // Show or hide it, after debug mode was turned on or off elsewhere.
    update(): void
}

export function createAdminBadge(
    doc: Document,
    options: AdminBadgeOptions
): AdminBadge {
    const badge = doc.createElement("div")
    badge.id = "admin-badge"
    badge.setAttribute("role", "status")
    const label = doc.createElement("span")
    label.textContent = "DEBUG MODE"
    const clear = doc.createElement("button")
    clear.type = "button"
    clear.textContent = "Clear"
    clear.setAttribute("aria-label", "Clear debug mode")
    badge.append(label, clear)
    function update() {
        badge.hidden = !options.isOn()
    }
    clear.addEventListener("click", (event) => {
        // Only the button: not also a tap on the screen under it (the
        // opening's "push any button").
        event.stopPropagation()
        options.clear()
        update()
        clear.blur()
    })
    // Space or Enter on the focused button (from Tab) only presses it,
    // not the game's confirm too.
    clear.addEventListener("keydown", (event) => {
        if (event.key === " " || event.key === "Enter") event.stopPropagation()
    })
    update()
    doc.body.append(badge)
    return { update }
}
