import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/lib/token", () => ({
  ensureFreshCopilotToken: vi.fn(async () => undefined),
  forceCopilotTokenRefresh: vi.fn(async () => undefined),
}))

import { state } from "../src/lib/state"
import { passthroughToMessages } from "../src/routes/messages/passthrough"

describe("passthroughToMessages", () => {
  beforeEach(() => {
    state.copilotToken = "test-token"
    state.copilotTokenExpiresAt = Math.floor(Date.now() / 1000) + 3600
    state.accountType = "individual"
    state.vsCodeVersion = "1.114.0"
    state.copilotChatVersion = "0.43.0"
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("strips thinking and effort for haiku 4.5 before forwarding", async () => {
    let forwardedBody: Record<string, unknown> | null = null
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        forwardedBody = JSON.parse(String(init?.body))
        return new Response(JSON.stringify({ id: "msg_test", content: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }),
    )

    await passthroughToMessages(
      JSON.stringify({
        model: "claude-haiku-4.5",
        max_tokens: 64,
        messages: [{ role: "user", content: "hello" }],
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
      }),
      "claude-haiku-4.5",
      false,
    )

    expect(forwardedBody).toMatchObject({
      model: "claude-haiku-4.5",
      max_tokens: 64,
      messages: [{ role: "user", content: "hello" }],
    })
    expect(forwardedBody).not.toHaveProperty("thinking")
    expect(forwardedBody).not.toHaveProperty("output_config")
  })
})
