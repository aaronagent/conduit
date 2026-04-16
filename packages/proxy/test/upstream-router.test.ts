import { describe, it, expect, beforeEach } from "vitest"
import { resolveProvider } from "../src/lib/upstream-router"
import { state } from "../src/lib/state"

describe("resolveProvider", () => {
  beforeEach(() => {
    state.providers = []
  })

  it("returns null when no providers configured", () => {
    expect(resolveProvider("gpt-5.4")).toBeNull()
  })

  it("matches exact pattern", () => {
    state.providers = [{
      id: 1, name: "test", base_url: "http://localhost:8080",
      api_key: "", format: "openai", model_patterns: '["gpt-5.4"]',
      enabled: 1, supports_models_endpoint: 0,
    }]
    const result = resolveProvider("gpt-5.4")
    expect(result).not.toBeNull()
    expect(result!.provider.name).toBe("test")
  })

  it("matches glob pattern", () => {
    state.providers = [{
      id: 1, name: "test", base_url: "http://localhost:8080",
      api_key: "", format: "openai", model_patterns: '["gpt-*"]',
      enabled: 1, supports_models_endpoint: 0,
    }]
    expect(resolveProvider("gpt-5.4")).not.toBeNull()
    expect(resolveProvider("claude-opus-4-6")).toBeNull()
  })

  it("exact match takes priority over glob", () => {
    state.providers = [
      { id: 1, name: "glob", base_url: "http://a", api_key: "", format: "openai", model_patterns: '["gpt-*"]', enabled: 1, supports_models_endpoint: 0 },
      { id: 2, name: "exact", base_url: "http://b", api_key: "", format: "openai", model_patterns: '["gpt-5.4"]', enabled: 1, supports_models_endpoint: 0 },
    ]
    const result = resolveProvider("gpt-5.4")
    expect(result!.provider.name).toBe("exact")
  })
})
