// ---------------------------------------------------------------------------
// Unified SSE (Server-Sent Events) parsing module.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Low-level parsed line result. */
export interface SSEEvent {
  type: "data" | "event" | "done";
  value: string;
}

/**
 * High-level SSE event object, compatible with Hono's SSEMessage.
 */
export interface ServerSentEvent {
  data: string;
  event: string | null;
  id: string | null;
  retry: number | null;
}

// ---------------------------------------------------------------------------
// Low-level: line parser
// ---------------------------------------------------------------------------

export function parseSSELine(line: string): SSEEvent | null {
  if (!line || line.startsWith(":")) {
    return null;
  }

  if (line.startsWith("data: [DONE]") || line === "data:[DONE]") {
    return { type: "done", value: "[DONE]" };
  }

  if (line.startsWith("data:")) {
    const value = line.startsWith("data: ") ? line.slice(6) : line.slice(5);
    return { type: "data", value };
  }

  if (line.startsWith("event:")) {
    const value = line.startsWith("event: ") ? line.slice(7) : line.slice(6);
    return { type: "event", value };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Low-level: stream parser (yields raw data strings)
// ---------------------------------------------------------------------------

export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string | null> {
  const decoder = new TextDecoder();
  let buffer = "";

  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        if (buffer.trim()) {
          const event = parseSSELine(buffer.trim());
          if (event?.type === "data") {
            yield event.value;
          } else if (event?.type === "done") {
            yield null;
          }
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const lines = part.split("\n");
        for (const line of lines) {
          const event = parseSSELine(line);
          if (event?.type === "data") {
            yield event.value;
          } else if (event?.type === "done") {
            yield null;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// High-level: events(response) — full SSE event objects
// ---------------------------------------------------------------------------

function parseField(line: string): { field: string; value: string } | null {
  const colonIdx = line.indexOf(":");
  if (colonIdx === 0) return null;
  if (colonIdx === -1) return { field: line, value: "" };
  const field = line.slice(0, colonIdx);
  let value = line.slice(colonIdx + 1);
  if (value.startsWith(" ")) value = value.slice(1);
  return { field, value };
}

export async function* events(
  response: Response,
): AsyncGenerator<ServerSentEvent> {
  if (!response.body) return;

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";

  let data: string[] = [];
  let eventType: string | undefined;
  let id: string | undefined;
  let retry: number | undefined;
  let hasFields = false;

  function buildEvent(): ServerSentEvent | null {
    if (!hasFields) return null;
    const event: ServerSentEvent = {
      data: data.join("\n"),
      event: eventType ?? null,
      id: id ?? null,
      retry: retry ?? null,
    };
    data = [];
    eventType = undefined;
    id = undefined;
    retry = undefined;
    hasFields = false;
    return event;
  }

  function processLine(line: string): ServerSentEvent | null {
    if (line === "") {
      return buildEvent();
    }
    const parsed = parseField(line);
    if (!parsed) return null;
    const { field, value } = parsed;
    switch (field) {
      case "data":
        hasFields = true;
        data.push(value);
        break;
      case "event":
        hasFields = true;
        eventType = value;
        break;
      case "id":
        hasFields = true;
        id = value;
        break;
      case "retry": {
        const n = Number.parseInt(value, 10);
        if (!Number.isNaN(n)) {
          hasFields = true;
          retry = n;
        }
        break;
      }
    }
    return null;
  }

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        if (buffer) {
          const lines = buffer.split(/\r\n|\r|\n/);
          for (const line of lines) {
            const event = processLine(line);
            if (event) yield event;
          }
        }
        const event = buildEvent();
        if (event) yield event;
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split(/\r\n|\r|\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const event = processLine(line);
        if (event) yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
