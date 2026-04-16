import { describe, it, expect } from "vitest"
import { HTTPError, extractErrorDetails } from "../src/lib/error"

describe("HTTPError", () => {
  it("preserves status and body", () => {
    const err = new HTTPError("test", 400, "bad request")
    expect(err.status).toBe(400)
    expect(err.responseBody).toBe("bad request")
    expect(err.message).toBe("test")
  })
})

describe("extractErrorDetails", () => {
  it("extracts from HTTPError", () => {
    const err = new HTTPError("fail", 429, "rate limited")
    const details = extractErrorDetails(err)
    expect(details.statusCode).toBe(429)
    expect(details.upstreamStatus).toBe(429)
    expect(details.errorDetail).toContain("rate limited")
  })

  it("handles plain Error", () => {
    const err = new Error("something broke")
    const details = extractErrorDetails(err)
    expect(details.statusCode).toBe(502)
    expect(details.upstreamStatus).toBeNull()
  })
})
