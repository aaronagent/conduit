import { describe, it, expect } from "vitest"
import { getRouteStrategy, translateModelName } from "../src/lib/model-router"

describe("getRouteStrategy", () => {
  it("returns passthrough for Claude models", () => {
    expect(getRouteStrategy("claude-opus-4-6")).toBe("passthrough")
    expect(getRouteStrategy("claude-sonnet-4-6")).toBe("passthrough")
    expect(getRouteStrategy("claude-haiku-4-5")).toBe("passthrough")
  })

  it("returns translate for non-Claude models", () => {
    expect(getRouteStrategy("gpt-5.4")).toBe("translate")
    expect(getRouteStrategy("gemini-3-flash")).toBe("translate")
  })
})

describe("translateModelName", () => {
  it("translates opus 4-6 to dot notation", () => {
    expect(translateModelName("claude-opus-4-6")).toBe("claude-opus-4.6")
  })

  it("adds -1m suffix when anthropic-beta has context-1m", () => {
    expect(translateModelName("claude-opus-4-6", "context-1m-2025-08-07")).toBe("claude-opus-4.6-1m")
  })

  it("adds -fast suffix when anthropic-beta has fast-mode", () => {
    expect(translateModelName("claude-opus-4-6", "fast-mode-2025-01-01")).toBe("claude-opus-4.6-fast")
  })

  it("preserves explicit suffix over header", () => {
    expect(translateModelName("claude-opus-4-6-1m")).toBe("claude-opus-4.6-1m")
  })

  it("strips date suffix", () => {
    expect(translateModelName("claude-opus-4-6-20250820")).toBe("claude-opus-4.6")
  })

  it("handles sonnet", () => {
    expect(translateModelName("claude-sonnet-4-5")).toBe("claude-sonnet-4.5")
    expect(translateModelName("claude-sonnet-4-6")).toBe("claude-sonnet-4.6")
  })

  it("handles haiku", () => {
    expect(translateModelName("claude-haiku-4-5-20251001")).toBe("claude-haiku-4.5")
  })

  it("handles no minor version", () => {
    expect(translateModelName("claude-sonnet-4")).toBe("claude-sonnet-4")
  })

  it("passes through unknown models", () => {
    expect(translateModelName("gpt-5.4")).toBe("gpt-5.4")
  })

  it("handles multiple beta flags", () => {
    expect(translateModelName("claude-opus-4-6", "interleaved-thinking-2025-05-14,context-1m-2025-08-07")).toBe("claude-opus-4.6-1m")
  })

  it("handles bracket notation", () => {
    expect(translateModelName("claude-opus-4-6[1m]")).toBe("claude-opus-4.6-1m")
  })
})
