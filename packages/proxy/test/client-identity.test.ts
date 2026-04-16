import { describe, it, expect } from "vitest"
import { deriveClientIdentity } from "../src/util/client-identity"

describe("deriveClientIdentity", () => {
  it("detects Claude Code", () => {
    const result = deriveClientIdentity(null, "claude-cli/2.1.104", "default", null)
    expect(result.clientName).toBe("claude-code")
    expect(result.clientVersion).toBe("2.1.104")
  })

  it("detects Cursor", () => {
    const result = deriveClientIdentity(null, "cursor/1.0", "default", null)
    expect(result.clientName).toBe("cursor")
  })

  it("detects curl", () => {
    const result = deriveClientIdentity(null, "curl/8.7.1", "default", null)
    expect(result.clientName).toBe("curl")
  })

  it("returns unknown for unrecognized UA", () => {
    const result = deriveClientIdentity(null, "something-else", "default", null)
    expect(result.clientName).toBe("unknown")
  })

  it("uses openaiUser as sessionId", () => {
    const result = deriveClientIdentity(null, null, "default", "user123")
    expect(result.sessionId).toBe("user123")
  })

  it("falls back to empty string sessionId", () => {
    const result = deriveClientIdentity(null, null, "default", null)
    expect(result.sessionId).toBe("")
  })

  it("uses userId when openaiUser is null", () => {
    const result = deriveClientIdentity("uid-abc", null, "default", null)
    expect(result.sessionId).toBe("uid-abc")
  })
})
