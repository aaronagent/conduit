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
export function translateModelName(model: string, anthropicBeta?: string | null): string {
  // Parse beta flags from anthropic-beta header
  const betas = anthropicBeta?.split(",").map((b) => b.trim()) ?? []
  const wants1m = betas.some((b) => b.startsWith("context-1m-"))
  const wantsFast = betas.some((b) => b.startsWith("fast-mode-"))

  const match = model.match(
    /^(claude-(?:opus|sonnet|haiku))-(\d+)-(\d{1,2})(?:(?:-|\[)(1m|fast)\]?)?(?:-\d{8})?$/
  )
  if (match) {
    const [, family, major, minor, suffix] = match
    const base = `${family}-${major}.${minor}`
    if (suffix) return `${base}-${suffix}`
    if (wants1m) return `${base}-1m`
    if (wantsFast) return `${base}-fast`
    return base
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
