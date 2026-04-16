import { describe, it, expect, beforeEach } from "vitest"
import { checkRateLimit } from "../src/lib/rate-limit"
import { state } from "../src/lib/state"

describe("checkRateLimit", () => {
  beforeEach(() => {
    state.rateLimitSeconds = null
    state.lastRequestTimestamp = null
    state.rateLimitWait = false
  })

  it("does nothing when rate limit is null", async () => {
    await expect(checkRateLimit(state)).resolves.toBeUndefined()
  })

  it("allows first request", async () => {
    state.rateLimitSeconds = 1
    await expect(checkRateLimit(state)).resolves.toBeUndefined()
    expect(state.lastRequestTimestamp).not.toBeNull()
  })

  it("throws 429 when rate limited", async () => {
    state.rateLimitSeconds = 10
    state.lastRequestTimestamp = Date.now()
    state.rateLimitWait = false
    await expect(checkRateLimit(state)).rejects.toThrow()
  })
})
