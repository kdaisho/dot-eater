// The admin passphrase (see admin.ts) is never in the code or the bundle:
// the build reads it from the ADMIN_PASSPHRASE environment variable
// (.env.local, or the deploy's secret) and puts only its hash in the bundle
// as __ADMIN_HASH__ (vite.config.ts). A static site can only check it in the
// browser, so this keeps players out of debug mode, not a determined one.
// Kept apart from admin.ts so vite.config.ts can import it without the game.

// Hashed in front of the passphrase, so the hash isn't a plain SHA-256 of it.
export const ADMIN_SALT = "dot-eater-admin:"

// The hash the build keeps of `passphrase`: SHA-256 of the salted text, in
// hex.
export async function hashPassphrase(passphrase: string): Promise<string> {
    const text = new TextEncoder().encode(ADMIN_SALT + passphrase)
    const digest = await crypto.subtle.digest("SHA-256", text)
    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0")
    ).join("")
}
