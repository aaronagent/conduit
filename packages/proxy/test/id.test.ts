import { describe, it, expect } from "vitest"
import { generateRequestId } from "../src/util/id"

describe("generateRequestId", () => {
  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()))
    expect(ids.size).toBe(100)
  })

  it("generates 26-char IDs", () => {
    const id = generateRequestId()
    expect(id.length).toBe(26)
  })
})
