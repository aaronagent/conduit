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
 * Fields that Copilot's /v1/messages endpoint rejects as "Extra inputs".
 * These are Anthropic API features not (yet) supported by Copilot.
 */
const FIELDS_TO_STRIP = new Set([
  "context_management",
  "cache_control",   // top-level cache_control (per-block cache_control IS supported)
  "container",
  "inference_geo",
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
  //   - Unsupported: max/xhigh → high, none → strip output_config
  //   - output_config.format (structured outputs) IS supported — don't strip it
  const outputConfig = parsed.output_config as Record<string, unknown> | undefined
  if (outputConfig) {
    const effort = outputConfig.effort
    if (effort === "max" || effort === "xhigh") {
      outputConfig.effort = "high"
      logger.debug(`Passthrough: mapped effort "${effort}" → "high" (Copilot limit)`)
    } else if (effort === "none") {
      delete outputConfig.effort
      logger.debug('Passthrough: stripped effort "none" (not supported by Copilot)')
      // If output_config is now empty, remove it
      if (Object.keys(outputConfig).length === 0) {
        delete parsed.output_config
      }
    }
  }

  // Copilot's Claude endpoint rejects `thinking.type: "enabled"` for newer
  // models (e.g. claude-opus-4.7) — it requires `adaptive` plus
  // output_config.effort to control thinking depth. Translate on the fly.
  const thinking = parsed.thinking as Record<string, unknown> | undefined
  if (thinking && thinking.type === "enabled") {
    const budget = thinking.budget_tokens
    thinking.type = "adaptive"
    delete thinking.budget_tokens
    // Carry budget → effort if the caller didn't pick one explicitly.
    const oc = (parsed.output_config as Record<string, unknown> | undefined) ?? {}
    if (!oc.effort) {
      let effort: "low" | "medium" | "high" = "medium"
      if (typeof budget === "number") {
        if (budget <= 4000) effort = "low"
        else if (budget >= 16000) effort = "high"
      }
      oc.effort = effort
      parsed.output_config = oc
    }
    logger.debug(
      `Passthrough: mapped thinking.enabled → adaptive (budget=${String(budget)}, effort=${String((parsed.output_config as Record<string, unknown>).effort)})`,
    )
  }

  // Per-model effort constraints. Copilot enforces different reasoning_effort
  // whitelists per model; clamp unsupported values instead of getting 400'd.
  //   claude-opus-4.7   → only "medium"
  //   claude-haiku-4.5  → does not support effort at all (strip)
  const MODEL_EFFORT_OVERRIDES: Record<string, "medium" | "strip"> = {
    "claude-opus-4.7": "medium",
    "claude-opus-4-7": "medium",
    "claude-haiku-4.5": "strip",
    "claude-haiku-4-5": "strip",
  }
  const override = MODEL_EFFORT_OVERRIDES[translatedModel]
  if (override) {
    const oc = parsed.output_config as Record<string, unknown> | undefined
    if (oc && "effort" in oc) {
      if (override === "strip") {
        delete oc.effort
        if (Object.keys(oc).length === 0) delete parsed.output_config
        logger.debug(`Passthrough: stripped effort for ${translatedModel} (not supported)`)
      } else if (oc.effort !== override) {
        logger.debug(
          `Passthrough: clamped effort "${String(oc.effort)}" → "${override}" for ${translatedModel}`,
        )
        oc.effort = override
      }
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
