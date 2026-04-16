import { describe, it, expect } from "vitest"
import { parseSSELine } from "../src/util/sse"

describe("parseSSELine", () => {
  it("parses data lines", () => {
    expect(parseSSELine('data: {"test":true}')).toEqual({ type: "data", value: '{"test":true}' })
  })

  it("parses data without space", () => {
    expect(parseSSELine('data:{"test":true}')).toEqual({ type: "data", value: '{"test":true}' })
  })

  it("detects DONE", () => {
    expect(parseSSELine("data: [DONE]")).toEqual({ type: "done", value: "[DONE]" })
  })

  it("ignores comments", () => {
    expect(parseSSELine(": keepalive")).toBeNull()
  })

  it("ignores empty lines", () => {
    expect(parseSSELine("")).toBeNull()
  })

  it("parses event lines", () => {
    expect(parseSSELine("event: message_start")).toEqual({ type: "event", value: "message_start" })
  })
})
