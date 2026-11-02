// The admin panel at #admin (see admin.ts): asks for the passphrase while
// debug mode is off, then offers the jumps (every stage, the story ending,
// the end roll) and turning debug mode off. It sits over the game, and
// keys, taps and clicks on it stay on it, so typing the passphrase doesn't
// play the game.

import type { AdminTarget } from "./admin"
import { hashPassphrase } from "./adminHash"

export type AdminPanelOptions = {
    // The passphrase's hash (__ADMIN_HASH__); empty when none is set.
    hash: string
    // The stages' names, in order.
    stageNames: readonly string[]
    isOn: () => boolean
    turnOn: () => void
    turnOff: () => void
    // Go to `target`; the panel closes first.
    jump: (target: AdminTarget) => void
    // The panel closed (Close, Escape or a jump).
    closed: () => void
}

export type AdminPanel = {
    open(): void
    close(): void
    readonly isOpen: boolean
}

// Events that stop at the panel, so the game's listeners (on the document
// and window) never see them.
const KEPT = ["keydown", "keyup", "click", "pointerdown", "pointerup"]

export function createAdminPanel(
    doc: Document,
    options: AdminPanelOptions
): AdminPanel {
    let root: HTMLElement | undefined

    function close() {
        if (!root) return
        root.remove()
        root = undefined
        options.closed()
    }

    function button(label: string, onClick: () => void): HTMLButtonElement {
        const b = doc.createElement("button")
        b.type = "button"
        b.textContent = label
        b.addEventListener("click", onClick)
        return b
    }

    function paragraph(text: string, className?: string): HTMLElement {
        const p = doc.createElement("p")
        p.textContent = text
        if (className) p.className = className
        return p
    }

    function jumpButton(label: string, target: AdminTarget) {
        return button(label, () => {
            close()
            options.jump(target)
        })
    }

    function render() {
        if (!root) return
        const panel = doc.createElement("div")
        panel.className = "admin-panel"
        panel.setAttribute("role", "dialog")
        panel.setAttribute("aria-label", "Admin")
        const heading = doc.createElement("h1")
        panel.append(heading)
        if (options.isOn()) {
            heading.textContent = "Debug mode"
            panel.append(
                paragraph(
                    "Every stage is open in stage select. Clears aren't saved while debug mode is on."
                )
            )
            const stages = doc.createElement("div")
            stages.className = "admin-jumps"
            options.stageNames.forEach((name, level) =>
                stages.append(
                    jumpButton(`${level + 1} ${name}`, {
                        kind: "stage",
                        level,
                    })
                )
            )
            const ends = doc.createElement("div")
            ends.className = "admin-jumps"
            ends.append(
                jumpButton("Story ending", { kind: "storyEnd" }),
                jumpButton("End roll", { kind: "endRoll" })
            )
            const actions = doc.createElement("div")
            actions.className = "admin-actions"
            actions.append(
                button("Turn off debug mode", () => {
                    options.turnOff()
                    render()
                }),
                button("Close", close)
            )
            panel.append(stages, ends, actions)
        } else if (options.hash === "") {
            heading.textContent = "Admin"
            panel.append(
                paragraph(
                    "Admin isn't set up on this build. Set ADMIN_PASSPHRASE and build again."
                ),
                button("Close", close)
            )
        } else {
            heading.textContent = "Admin"
            panel.append(passphraseForm(), button("Close", close))
        }
        root.replaceChildren(panel)
        root.querySelector<HTMLElement>("input, button")?.focus()
    }

    function passphraseForm(): HTMLFormElement {
        const form = doc.createElement("form")
        const label = doc.createElement("label")
        label.htmlFor = "admin-passphrase"
        label.textContent = "Passphrase"
        const input = doc.createElement("input")
        input.id = "admin-passphrase"
        input.type = "password"
        input.autocomplete = "off"
        const submit = doc.createElement("button")
        submit.type = "submit"
        submit.textContent = "Unlock"
        const error = paragraph("", "admin-error")
        error.setAttribute("role", "alert")
        form.append(label, input, submit, error)
        form.addEventListener("submit", (event) => {
            event.preventDefault()
            submit.disabled = true
            void hashPassphrase(input.value).then((hash) => {
                submit.disabled = false
                if (hash === options.hash) {
                    options.turnOn()
                    render()
                    return
                }
                input.value = ""
                input.focus()
                error.textContent = "That passphrase is wrong."
            })
        })
        return form
    }

    return {
        open() {
            if (root) return
            root = doc.createElement("div")
            root.id = "admin"
            for (const type of KEPT) {
                root.addEventListener(type, (event) => {
                    event.stopPropagation()
                    if (
                        event instanceof KeyboardEvent &&
                        event.type === "keydown" &&
                        event.key === "Escape"
                    )
                        close()
                })
            }
            doc.body.append(root)
            render()
        },
        close,
        get isOpen() {
            return root !== undefined
        },
    }
}
