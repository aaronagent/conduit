import { events } from "../../util/sse"
import { copilotBaseUrl, copilotHeaders } from "../../lib/api-config"
import { HTTPError } from "../../lib/error"
import { state } from "../../lib/state"
import { ensureFreshCopilotToken, forceCopilotTokenRefresh } from "../../lib/token"

export interface ResponsesPayload {
  model: string
  input: unknown
  stream?: boolean
  [key: string]: unknown
}

export const createResponses = async (payload: ResponsesPayload) => {
  await ensureFreshCopilotToken()
  if (!state.copilotToken) throw new Error("Copilot token not found")

  // Truncate stale large screenshots in history to avoid Copilot 413
  // ("failed to parse request"). Strategy: keep the most recent N large
  // function_call_output entries intact (model needs current vision input),
  // replace earlier ones with a tiny input_text placeholder. Old screenshots
  // have already been processed by the model in their original turn — keeping
  // their bytes around just bloats the payload.
  // Threshold lowered from 1MB → 256KB after observing 413s where 6 stale
  // screenshots in the 700–840KB band (just under the old threshold) totaled
  // ~4.8MB and pushed the request over Copilot's body cap.
  truncateStaleScreenshots(payload, { keepRecent: 2, byteThreshold: 256 * 1024 })

  const enableVision = hasVisionContent(payload)
  const isAgentCall = hasAgentHistory(payload)

  const doFetch = () =>
    fetch(`${copilotBaseUrl(state)}/responses`, {
      method: "POST",
      headers: {
        ...copilotHeaders(state, enableVision),
        "X-Initiator": isAgentCall ? "agent" : "user",
      },
      body: JSON.stringify(payload),
    })

  let response = await doFetch()
  if (response.status === 401) {
    await forceCopilotTokenRefresh()
    response = await doFetch()
  }

  if (!response.ok) {
    // DIAGNOSTIC: dump payload + response to /tmp on any non-2xx so we can
    // identify exactly what Copilot rejected (e.g. 413 "failed to parse request").
    // Safe: only writes on error, never on the hot success path.
    try {
      const cloned = response.clone()
      const respBody = await cloned.text()
      const ts = new Date().toISOString().replace(/[:.]/g, "-")
      const dumpPath = `/tmp/conduit-bad-payload-${ts}-${response.status}.json`
      const dump = {
        timestamp: new Date().toISOString(),
        upstream_status: response.status,
        upstream_headers: Object.fromEntries(response.headers.entries()),
        upstream_body: respBody,
        request_url: `${copilotBaseUrl(state)}/responses`,
        request_byte_size: JSON.stringify(payload).length,
        request_payload: payload,
      }
      await Bun.write(dumpPath, JSON.stringify(dump, null, 2))
      // eslint-disable-next-line no-console
      console.error(`[conduit-diag] dumped failing payload -> ${dumpPath} (status=${response.status}, bytes=${dump.request_byte_size})`)
    } catch (dumpErr) {
      // eslint-disable-next-line no-console
      console.error("[conduit-diag] failed to dump payload:", dumpErr)
    }
    throw await HTTPError.fromResponse("Failed to create responses", response)
  }

  if (payload.stream) {
    return events(response)
  }

  return await response.json()
}

export function hasVisionContent(payload: ResponsesPayload): boolean {
  if (!Array.isArray(payload.input)) return false
  return payload.input.some((item: unknown) => {
    if (typeof item !== "object" || item === null) return false
    const content = (item as Record<string, unknown>).content
    if (!Array.isArray(content)) return false
    return content.some((part: unknown) => {
      if (typeof part !== "object" || part === null) return false
      return (part as Record<string, unknown>).type === "input_image"
    })
  })
}

export function hasAgentHistory(payload: ResponsesPayload): boolean {
  if (!Array.isArray(payload.input)) return false
  return payload.input.some((item: unknown) => {
    if (typeof item !== "object" || item === null) return false
    const role = (item as Record<string, unknown>).role
    const type = (item as Record<string, unknown>).type
    return role === "assistant" || type === "function_call" || type === "function_call_output"
  })
}

/**
 * Mutates payload.input in place. Walks function_call_output items from the
 * end (most recent first) and replaces oversized ones with a small text
 * placeholder once we've already kept `keepRecent` of them. Items whose
 * serialized size is below `byteThreshold` are always left alone.
 *
 * Why: Copilot Responses API has a per-message size cap and returns the
 * misleading "failed to parse request" with HTTP 413 when exceeded. Old
 * screenshots in conversation history were already consumed by the model
 * in their original turn and provide no value when re-sent verbatim.
 */
export function truncateStaleScreenshots(
  payload: ResponsesPayload,
  opts: { keepRecent: number; byteThreshold: number },
): void {
  if (!Array.isArray(payload.input)) return
  const { keepRecent, byteThreshold } = opts
  let kept = 0
  let replaced = 0
  let bytesSaved = 0

  for (let i = payload.input.length - 1; i >= 0; i--) {
    const item = payload.input[i]
    if (typeof item !== "object" || item === null) continue
    const rec = item as Record<string, unknown>
    if (rec.type !== "function_call_output") continue

    // Estimate size cheaply: stringify only this item.
    let sz: number
    try {
      sz = JSON.stringify(item).length
    } catch {
      continue
    }
    if (sz < byteThreshold) continue

    if (kept < keepRecent) {
      kept++
      continue
    }

    // Replace output with a small text placeholder. Keep type/call_id intact
    // so the function_call/function_call_output pairing the API requires is
    // preserved.
    const cid = rec.call_id ?? "?"
    const placeholder = [
      {
        type: "input_text",
        text:
          `[earlier large output omitted by conduit to stay under Copilot ` +
          `Responses API per-message size limit. Original was ~${(sz / 1024 / 1024).toFixed(2)} MB ` +
          `(call_id=${cid}). The model already processed this content in the ` +
          `original turn; only the most recent ${keepRecent} large output(s) are kept verbatim.]`,
      },
    ]
    rec.output = placeholder
    replaced++
    bytesSaved += sz
  }

  if (replaced > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[conduit] truncated ${replaced} stale large function_call_output(s), ` +
        `kept ${kept} recent, saved ~${(bytesSaved / 1024 / 1024).toFixed(2)} MB`,
    )
  }
}
