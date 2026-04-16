/**
 * Model Router — determines whether a request should be passed through
 * directly (for Claude models) or translated (for non-Claude models).
 */

export type RouteStrategy = "passthrough" | "translate"

/**
 * Determine routing strategy based on model name.
 * Claude models -> passthrough (Copilot natively supports Anthropic Messages API)
 * Non-Claude models -> translate (Anthropic -> OpenAI format conversion)
 */
export function getRouteStrategy(model: string): RouteStrategy {
  // Claude models: passthrough directly to Copilot's native Messages API support
  if (model.startsWith("claude-")) {
    return "passthrough"
  }
  // All other models need Anthropic -> OpenAI translation
  return "translate"
}

/**
 * Translate Anthropic SDK model names to Copilot model IDs.
 * Only modifies the model name string, nothing else.
 *
 * Examples:
 *   claude-opus-4-6          → claude-opus-4.6-1m
 *   claude-opus-4-6-20250820 → claude-opus-4.6-1m
 *   claude-sonnet-4-6        → claude-sonnet-4.6
 *   claude-haiku-4-5         → claude-haiku-4.5
 */
export function translateModelName(model: string): string {
  const match = model.match(
    /^(claude-(?:opus|sonnet|haiku))-(\d+)-(\d{1,2})(?:-(1m))?(?:-\d{8})?$/
  )
  if (match) {
    const [, family, major, minor, suffix] = match
    const base = `${family}-${major}.${minor}`
    if (family === "claude-opus" && major === "4" && minor === "6") {
      return `${base}-1m`
    }
    return suffix ? `${base}-${suffix}` : base
  }

  const matchNoMinor = model.match(
    /^(claude-(?:opus|sonnet|haiku))-(\d+)(?:-\d{8})?$/
  )
  if (matchNoMinor) {
    const [, family, major] = matchNoMinor
    return `${family}-${major}`
  }

  return model
}
