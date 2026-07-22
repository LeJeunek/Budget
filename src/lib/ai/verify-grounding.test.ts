import { describe, expect, it } from "vitest"

import { verifyGrounding } from "./verify-grounding"

const GROUNDING_DATA = {
  diningSpent: 340.5,
  diningAllocated: 300,
  groceriesRemaining: -60,
}

describe("verifyGrounding", () => {
  it("passes when every cited figure matches a known value exactly", () => {
    expect(
      verifyGrounding(
        [
          { label: "Dining spent", value: 340.5 },
          { label: "Dining allocated", value: 300 },
        ],
        GROUNDING_DATA,
      ),
    ).toBe(true)
  })

  it("passes when a cited figure is within the rounding epsilon", () => {
    expect(
      verifyGrounding([{ label: "Dining spent", value: 340.505 }], GROUNDING_DATA),
    ).toBe(true)
  })

  it("fails when a cited figure does not match any known value (a fabricated number)", () => {
    expect(
      verifyGrounding([{ label: "Dining spent", value: 999.99 }], GROUNDING_DATA),
    ).toBe(false)
  })

  it("fails if even one of several cited figures is fabricated", () => {
    expect(
      verifyGrounding(
        [
          { label: "Dining spent", value: 340.5 },
          { label: "Made up figure", value: 12_345 },
        ],
        GROUNDING_DATA,
      ),
    ).toBe(false)
  })

  it("passes trivially for an empty citedFigures array", () => {
    expect(verifyGrounding([], GROUNDING_DATA)).toBe(true)
  })

  it("fails when groundingData is empty but a figure is cited", () => {
    expect(verifyGrounding([{ label: "Anything", value: 1 }], {})).toBe(false)
  })

  it("matches by value only, ignoring the model's chosen label text", () => {
    expect(
      verifyGrounding(
        [{ label: "a completely different label", value: 300 }],
        GROUNDING_DATA,
      ),
    ).toBe(true)
  })
})
