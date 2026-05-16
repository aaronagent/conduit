/**
 * chat/completions ↔ /responses bridge.
 *
 * Some Copilot models (notably gpt-5.5) are only available on the upstream
 * `/responses` endpoint — calling them via `/chat/completions` returns
 * `unsupported_api_for_model`. This module lets us accept OpenAI-style
 * `/v1/chat/completions` requests for those models and silently bridge to
 * `/responses` upstream, then translate the answer back.
 *
 * Scope (intentionally minimal — covers ToonFlow / ai-sdk text generation):
 *   - text content (no images, no audio)
 *   - simple tool calls (function tools)
 *   - reasoning_effort passthrough
 *   - streaming + non-streaming
 */
import type { ChatCompletionsPayload, Tool } from "../services/copilot/create-chat-completions"
import type { ResponsesPayload } from "../services/copilot/create-responses"
import type { ServerSentEvent } from "../util/sse"

/** Models that must be routed through /responses instead of /chat/completions. */
const RESPONSES_ONLY_MODELS = new Set<string>([
  "gpt-5.5",
])

/** Optional aliases: virtual model id → {real model, default reasoning effort}. */
const MODEL_ALIASES: Record<string, { model: string; effort: "low" | "medium" | "high" | "xhigh" | "minimal" }> = {
  "gpt-5.5-low": { model: "gpt-5.5", effort: "low" },
  "gpt-5.5-medium": { model: "gpt-5.5", effort: "medium" },
  "gpt-5.5-high": { model: "gpt-5.5", effort: "high" },
  "gpt-5.5-xhigh": { model: "gpt-5.5", effort: "xhigh" },
}

export function shouldBridgeToResponses(model: string): boolean {
  if (RESPONSES_ONLY_MODELS.has(model)) return true
  if (model in MODEL_ALIASES) return true
  return false
}

export function resolveAlias(model: string): { model: string; defaultEffort?: "low" | "medium" | "high" | "xhigh" | "minimal" } {
  const a = MODEL_ALIASES[model]
  if (a) return { model: a.model, defaultEffort: a.effort }
  return { model }
}

/**
 * Convert a chat/completions payload into a /responses payload.
 */
export function chatToResponses(chat: ChatCompletionsPayload): ResponsesPayload {
  const { model: realModel, defaultEffort } = resolveAlias(chat.model)

  // Build /responses `input` array.
  // /responses accepts message items {role, content} AND tool items
  // {type:"function_call", call_id, name, arguments} and
  // {type:"function_call_output", call_id, output}.
  const input: Array<Record<string, unknown>> = []
  for (const m of chat.messages) {
    const role = m.role

    // tool result message → function_call_output item
    if (role === "tool") {
      const text = typeof m.content === "string" ? m.content : extractTextFromParts(m.content)
      input.push({
        type: "function_call_output",
        call_id: m.tool_call_id ?? "",
        output: text,
      })
      continue
    }

    // assistant message that contains tool_calls → emit text first (if any), then function_call items
    if (role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const text =
        typeof m.content === "string"
          ? m.content
          : Array.isArray(m.content)
          ? extractTextFromParts(m.content)
          : ""
      if (text && text.length > 0) {
        input.push({ role: "assistant", content: text })
      }
      for (const tc of m.tool_calls) {
        input.push({
          type: "function_call",
          call_id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments ?? "",
        })
      }
      continue
    }

    // plain message
    let content: string
    if (typeof m.content === "string") {
      content = m.content ?? ""
    } else if (Array.isArray(m.content)) {
      content = extractTextFromParts(m.content)
    } else {
      content = ""
    }
    input.push({
      role: role as "user" | "assistant" | "system" | "developer",
      content,
    })
  }

  const payload: ResponsesPayload = {
    model: realModel,
    input,
  }

  if (chat.stream) payload.stream = true

  // reasoning_effort → reasoning.effort
  const effort = chat.reasoning_effort ?? defaultEffort
  if (effort && effort !== "none") {
    payload.reasoning = { effort }
  }

  // temperature / top_p
  if (typeof chat.temperature === "number") payload.temperature = chat.temperature
  if (typeof chat.top_p === "number") payload.top_p = chat.top_p

  // max_tokens → max_output_tokens
  if (typeof chat.max_tokens === "number") payload.max_output_tokens = chat.max_tokens

  // tools: chat shape {type:"function", function:{name,description,parameters}}
  //        → responses shape {type:"function", name, description, parameters}
  if (Array.isArray(chat.tools) && chat.tools.length) {
    payload.tools = chat.tools.map((t: Tool) => ({
      type: "function" as const,
      name: t.function.name,
      description: t.function.description ?? undefined,
      parameters: t.function.parameters,
    }))
  }

  // tool_choice: leave as-is when string, or convert object form
  if (chat.tool_choice) {
    if (typeof chat.tool_choice === "string") {
      payload.tool_choice = chat.tool_choice
    } else if (typeof chat.tool_choice === "object" && chat.tool_choice.type === "function") {
      payload.tool_choice = { type: "function", name: chat.tool_choice.function.name }
    }
  }

  return payload
}

function extractTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return ""
  return parts
    .map((p: unknown) => {
      if (typeof p !== "object" || p === null) return ""
      const r = p as Record<string, unknown>
      if (r.type === "text" && typeof r.text === "string") return r.text
      // Drop image/audio parts silently — bridge is text-only for now.
      return ""
    })
    .join("")
}

/**
 * Convert a non-streaming /responses JSON body into a /chat/completions response.
 */
export function responsesToChat(
  resp: Record<string, unknown>,
  requestedModel: string,
): unknown {
  const id = (resp.id as string) ?? `chatcmpl-bridge-${Date.now()}`
  const created = Math.floor(((resp.created_at as number) ?? Date.now() / 1000))
  const model = (resp.model as string) ?? requestedModel

  const output = (resp.output as Array<Record<string, unknown>>) ?? []
  let text = ""
  const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = []
  let finishReason: "stop" | "length" | "tool_calls" | "content_filter" = "stop"

  for (const item of output) {
    const itype = item.type as string | undefined
    if (itype === "message") {
      const content = (item.content as Array<Record<string, unknown>>) ?? []
      for (const c of content) {
        if (c.type === "output_text" && typeof c.text === "string") text += c.text
      }
    } else if (itype === "function_call") {
      toolCalls.push({
        id: (item.call_id as string) ?? (item.id as string) ?? `call_${Date.now()}`,
        type: "function",
        function: {
          name: (item.name as string) ?? "",
          arguments: (item.arguments as string) ?? "{}",
        },
      })
    }
    // reasoning items are dropped — chat/completions has no analog
  }

  if (toolCalls.length) finishReason = "tool_calls"
  // map incomplete_details
  const incomplete = resp.incomplete_details as Record<string, unknown> | null
  if (incomplete && incomplete.reason === "max_output_tokens") finishReason = "length"

  const usage = resp.usage as Record<string, unknown> | undefined
  const promptTokens = usage ? (usage.input_tokens as number) ?? 0 : 0
  const completionTokens = usage ? (usage.output_tokens as number) ?? 0 : 0
  const totalTokens = usage ? (usage.total_tokens as number) ?? promptTokens + completionTokens : promptTokens + completionTokens
  const cachedTokens =
    usage && (usage.input_tokens_details as Record<string, unknown> | undefined)
      ? ((usage.input_tokens_details as Record<string, unknown>).cached_tokens as number) ?? 0
      : 0

  return {
    id,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text || null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: finishReason,
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      prompt_tokens_details: { cached_tokens: cachedTokens },
    },
  }
}

/**
 * Convert a streaming /responses event iterator into chat/completion chunks
 * (objects ready to JSON.stringify into the SSE `data:` field).
 *
 * Emits in order:
 *   1. role chunk (delta.role="assistant")
 *   2. one delta per response.output_text.delta event
 *   3. tool_calls deltas if function_call items show up
 *   4. final stop chunk (or tool_calls stop) with finish_reason
 *   5. usage chunk (if include_usage-like info available)
 */
export async function* responsesStreamToChat(
  events: AsyncIterable<ServerSentEvent>,
  requestedModel: string,
): AsyncGenerator<{ data: string }> {
  const id = `chatcmpl-bridge-${Date.now()}`
  const created = Math.floor(Date.now() / 1000)
  let model = requestedModel
  let roleSent = false
  let finishReason: "stop" | "length" | "tool_calls" | "content_filter" = "stop"
  // tool calls indexed by item_id
  const toolIndex = new Map<string, number>()
  let nextToolIdx = 0
  let usageChunk: Record<string, unknown> | null = null

  function chunk(delta: Record<string, unknown>, finish: string | null = null): { data: string } {
    return {
      data: JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta, finish_reason: finish }],
      }),
    }
  }

  for await (const ev of events) {
    const evType = ev.event ?? ""
    if (!ev.data) continue
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(ev.data)
    } catch {
      continue
    }

    if (evType === "response.created" || evType === "response.in_progress") {
      const r = parsed.response as Record<string, unknown> | undefined
      if (r && typeof r.model === "string") model = r.model
      continue
    }

    if (evType === "response.output_text.delta") {
      const delta = (parsed.delta as string) ?? ""
      if (!delta) continue
      if (!roleSent) {
        yield chunk({ role: "assistant", content: "" })
        roleSent = true
      }
      yield chunk({ content: delta })
      continue
    }

    if (evType === "response.output_item.added") {
      const item = parsed.item as Record<string, unknown> | undefined
      if (item && item.type === "function_call") {
        const itemId = (item.id as string) ?? `tool_${nextToolIdx}`
        const idx = nextToolIdx++
        toolIndex.set(itemId, idx)
        if (!roleSent) {
          yield chunk({ role: "assistant", content: "" })
          roleSent = true
        }
        yield chunk({
          tool_calls: [
            {
              index: idx,
              id: (item.call_id as string) ?? itemId,
              type: "function",
              function: {
                name: (item.name as string) ?? "",
                arguments: "",
              },
            },
          ],
        })
      }
      continue
    }

    if (evType === "response.function_call_arguments.delta") {
      const itemId = parsed.item_id as string
      const idx = toolIndex.get(itemId) ?? 0
      const delta = (parsed.delta as string) ?? ""
      yield chunk({
        tool_calls: [
          {
            index: idx,
            function: { arguments: delta },
          },
        ],
      })
      continue
    }

    if (evType === "response.completed") {
      const r = parsed.response as Record<string, unknown> | undefined
      if (r) {
        const incomplete = r.incomplete_details as Record<string, unknown> | null
        if (incomplete && incomplete.reason === "max_output_tokens") finishReason = "length"
        if (toolIndex.size > 0) finishReason = "tool_calls"
        const usage = r.usage as Record<string, unknown> | undefined
        if (usage) {
          usageChunk = {
            prompt_tokens: (usage.input_tokens as number) ?? 0,
            completion_tokens: (usage.output_tokens as number) ?? 0,
            total_tokens: (usage.total_tokens as number) ?? 0,
            prompt_tokens_details: {
              cached_tokens:
                ((usage.input_tokens_details as Record<string, unknown> | undefined)?.cached_tokens as number) ?? 0,
            },
            completion_tokens_details: {
              accepted_prediction_tokens: 0,
              rejected_prediction_tokens: 0,
            },
          }
        }
      }
      // emit final stop chunk
      yield chunk({}, finishReason)
      // emit usage chunk (OpenAI compat: separate chunk with usage and empty choices)
      if (usageChunk) {
        yield {
          data: JSON.stringify({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [],
            usage: usageChunk,
          }),
        }
      }
      return
    }

    if (evType === "response.failed" || evType === "error") {
      // Surface as an error chunk; client will see truncated stream.
      const errMsg =
        ((parsed.error as Record<string, unknown> | undefined)?.message as string) ?? "responses stream failed"
      yield {
        data: JSON.stringify({
          error: { message: errMsg, type: "error" },
        }),
      }
      return
    }
  }
}
