/**
 * Passthrough handler for Claude models.
 * Forwards Anthropic Messages API requests directly to Copilot's
 * native /v1/messages endpoint. Patches model name and strips
 * fields that Copilot doesn't accept.
 *
 * Preserves all key Anthropic parameters:
 * - thinking (adaptive/enabled)
 * - output_config.effort
 * - cache_control
 * - top_k, service_tier
 */

import { copilotHeaders, copilotBaseUrl } from "../../lib/api-config"
import { HTTPError } from "../../lib/error"
import { state } from "../../lib/state"
import { translateModelName } from "../../lib/model-router"
import { logger } from "../../util/logger"

/**
 * Fields that Copilot's /v1/messages endpoint may reject.
 * context_management with non-empty edits is rejected; empty edits are OK but useless.
 * We strip it unconditionally for safety.
 */
const FIELDS_TO_STRIP = new Set([
  "context_management",
])

export async function passthroughToMessages(
  rawBody: string,
  model: string,
  _stream: boolean,
  anthropicBeta?: string | null,
): Promise<Response> {
  if (!state.copilotToken) throw new Error("Copilot token not found")

  const translatedModel = translateModelName(model, anthropicBeta)

  // Parse, patch model name, strip unsupported fields
  const parsed = JSON.parse(rawBody) as Record<string, unknown>
  parsed.model = translatedModel

  for (const field of FIELDS_TO_STRIP) {
    if (field in parsed) {
      logger.debug(`Passthrough: stripping unsupported field "${field}"`)
      delete parsed[field]
    }
  }

  // Copilot effort mapping:
  //   - Supported: low, medium, high
  //   - Unsupported: max (→ high), none (→ strip output_config), xhigh (→ high)
  //   - Extra fields in output_config are rejected, so only keep "effort"
  const outputConfig = parsed.output_config as Record<string, unknown> | undefined
  if (outputConfig) {
    const effort = outputConfig.effort
    if (effort === "max" || effort === "xhigh") {
      outputConfig.effort = "high"
      logger.debug(`Passthrough: mapped effort "${effort}" → "high" (Copilot limit)`)
    } else if (effort === "none") {
      delete parsed.output_config
      logger.debug('Passthrough: stripped effort "none" (not supported by Copilot)')
    }
    // Strip any unknown fields in output_config (Copilot rejects extra inputs)
    if (parsed.output_config) {
      const cleaned: Record<string, unknown> = {}
      if (outputConfig.effort) cleaned.effort = outputConfig.effort
      parsed.output_config = cleaned
    }
  }

  const patchedBody = JSON.stringify(parsed)

  logger.debug(`Passthrough: ${model} → ${translatedModel}`)

  // Check for vision content
  const hasVision = rawBody.includes('"type":"image"') || rawBody.includes('"type":"image_url"')

  // Check for agent messages
  const isAgentCall = rawBody.includes('"role":"assistant"') || rawBody.includes('"role":"tool"')

  const headers: Record<string, string> = {
    ...copilotHeaders(state, hasVision),
    "X-Initiator": isAgentCall ? "agent" : "user",
    "anthropic-version": "2023-06-01",
  }

  const response = await fetch(`${copilotBaseUrl(state)}/v1/messages`, {
    method: "POST",
    headers,
    body: patchedBody,
  })

  if (!response.ok) {
    throw await HTTPError.fromResponse(
      `Passthrough failed (${response.status})`,
      response,
    )
  }

  return response
}
