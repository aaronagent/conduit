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
 * Fields that Copilot's /v1/messages endpoint rejects.
 * These are Claude Code / Anthropic SDK extensions not (yet) supported by Copilot.
 */
const FIELDS_TO_STRIP = new Set([
  "context_management",
])

export async function passthroughToMessages(
  rawBody: string,
  model: string,
  _stream: boolean,
): Promise<Response> {
  if (!state.copilotToken) throw new Error("Copilot token not found")

  const translatedModel = translateModelName(model)

  // Parse, patch model name, strip unsupported fields
  const parsed = JSON.parse(rawBody) as Record<string, unknown>
  parsed.model = translatedModel

  for (const field of FIELDS_TO_STRIP) {
    if (field in parsed) {
      logger.debug(`Passthrough: stripping unsupported field "${field}"`)
      delete parsed[field]
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
