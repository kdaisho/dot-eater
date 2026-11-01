import { describe, expect, it } from "vite-plus/test"
import { hashPassphrase } from "./adminHash"

describe("hashPassphrase", () => {
    it("is the SHA-256 of the salted passphrase, in hex", async () => {
        // printf 'dot-eater-admin:abc' | shasum -a 256
        expect(await hashPassphrase("abc")).toBe(
            "2046171d5a93179715dbf9acff03472264bbdeef883673020e5336c3c46abe94"
        )
    })
})
