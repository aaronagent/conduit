/**
 * Passthrough handler for Claude models.
 * Forwards Anthropic Messages API requests directly to Copilot
 * WITHOUT format translation. Only patches the model name.
 */

import { copilotHeaders, copilotBaseUrl } from "../../lib/api-config"
import { HTTPError } from "../../lib/error"
import { state } from "../../lib/state"
import { translateModelName } from "../../lib/model-router"
import { logger } from "../../util/logger"

export async function passthroughToMessages(
  rawBody: string,
  model: string,
  stream: boolean,
): Promise<Response> {
  if (!state.copilotToken) throw new Error("Copilot token not found")

  const translatedModel = translateModelName(model)

  // Patch model name in the raw JSON body - minimal modification
  const patchedBody = rawBody.replace(
    `"model":"${model}"`,
    `"model":"${translatedModel}"`,
  )

  logger.debug(`Passthrough: ${model} → ${translatedModel}`)

  // Check for vision content
  const hasVision = rawBody.includes('"type":"image"') || rawBody.includes('"type":"image_url"')

  // Check for agent messages
  const isAgentCall = rawBody.includes('"role":"assistant"') || rawBody.includes('"role":"tool"')

  const headers: Record<string, string> = {
    ...copilotHeaders(state, hasVision),
    "X-Initiator": isAgentCall ? "agent" : "user",
  }

  const response = await fetch(`${copilotBaseUrl(state)}/chat/completions`, {
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
