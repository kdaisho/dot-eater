import confetti from "canvas-confetti"

function genConfetti(interval: number = 20) {
    let counter = 0
    return (count: number = 10) => {
        const intId = setInterval(() => {
            void confetti({ origin: { x: 0.1 * counter, y: 0.65 } })
            counter++

            if (counter > count) {
                clearInterval(intId)
            }
        }, interval)
    }
}

export const celebrate = genConfetti()

// Tears down the message currently on screen (its elements and its Space
// handler), if any. At most one message and handler exist at a time.
let dismissMessage: (() => void) | undefined

export function displayMessage(dead: boolean, onRestart: () => void) {
    dismissMessage?.()

    const backdrop = document.createElement("div")
    backdrop.setAttribute("id", "backdrop")
    backdrop.setAttribute("class", "backdrop")
    document.body.appendChild(backdrop)

    const msg = document.createElement("div")
    const txt = dead
        ? document.createTextNode("💀 Press Space to restart.")
        : document.createTextNode("Congrats! Press Space to restart.")

    msg.appendChild(txt)
    msg.setAttribute("id", "msg")
    msg.setAttribute("class", "msg")
    document.body.appendChild(msg)

    // Other keys may be pressed first, so `{ once: true }` would not do: keep
    // listening until Space, then unregister before restarting.
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== " ") return
        dismiss()
        onRestart()
    }
    const dismiss = () => {
        removeEventListener("keydown", onKeyDown)
        backdrop.remove()
        msg.remove()
        if (dismissMessage === dismiss) dismissMessage = undefined
    }
    dismissMessage = dismiss
    addEventListener("keydown", onKeyDown)
}
