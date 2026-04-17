import { useState, useEffect, useRef, useCallback } from "react"

interface LogEvent {
  ts: number
  level: string
  type: string
  requestId: string | null
  msg: string
  data?: Record<string, unknown> | null
}

export function Logs() {
  const [events, setEvents] = useState<LogEvent[]>([])
  const [paused, setPaused] = useState(false)
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const wsRef = useRef<WebSocket | null>(null)
  const pausedRef = useRef(false)
  const eventsRef = useRef<LogEvent[]>([])

  pausedRef.current = paused

  const connect = useCallback(() => {
    setWsStatus("connecting")
    const proto = location.protocol === "https:" ? "wss:" : "ws:"
    const ws = new WebSocket(`${proto}//${location.host}/ws/logs`)
    wsRef.current = ws

    ws.onopen = () => setWsStatus("connected")

    ws.onmessage = (e) => {
      if (pausedRef.current) return
      try {
        const event = JSON.parse(e.data) as LogEvent
        // Only show request events, not system logs
        if (event.type !== "request_start" && event.type !== "request_end") return
        eventsRef.current = [event, ...eventsRef.current].slice(0, 200)
        setEvents([...eventsRef.current])
      } catch {}
    }

    ws.onclose = () => {
      setWsStatus("disconnected")
      setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      setWsStatus("disconnected")
      ws.close()
    }
  }, [])

  useEffect(() => {
    connect()
    return () => { wsRef.current?.close() }
  }, [connect])

  // Fallback: if WS never connects after 3s, fall back to REST polling
  const [useFallback, setUseFallback] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => {
      if (wsStatus !== "connected") setUseFallback(true)
    }, 3000)
    return () => clearTimeout(t)
  }, [wsStatus])

  useEffect(() => {
    if (!useFallback) return
    const load = async () => {
      try {
        const { api } = await import("../lib/api")
        const data = await api.getRequests({ limit: 50 })
        const list = Array.isArray(data) ? data : []
        // Convert DB records to LogEvent-like format
        const mapped: LogEvent[] = list.map((r: any) => ({
          ts: r.timestamp,
          level: r.status === "error" ? "error" : "info",
          type: "request_end",
          requestId: r.id,
          msg: `${r.status_code} ${r.model}`,
          data: {
            model: r.model,
            strategy: r.strategy,
            status: r.status,
            statusCode: r.status_code,
            latencyMs: r.latency_ms,
            inputTokens: r.input_tokens,
            outputTokens: r.output_tokens,
            clientName: r.client_name,
            sessionId: r.session_id,
            error: r.error_message,
          },
        }))
        eventsRef.current = mapped.slice(0, 200)
        setEvents([...eventsRef.current])
      } catch (e: any) { setError(e.message) }
    }
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [useFallback])

  if (error) return <div className="error-msg">{error}</div>

  // Only show request_end events in the table, deduplicated by requestId
  const seen = new Set<string>()
  const requestEvents = events.filter(e => {
    if (e.type !== "request_end") return false
    const id = e.requestId || ""
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
  const pendingCount = events.filter(e => e.type === "request_start").length

  return (
    <div>
      <h1 className="page-title">Request Logs</h1>
      <div className="toolbar">
        <div className="ws-status">
          <span className={`status-dot ${wsStatus === "connected" ? "" : "offline"}`} />
          {wsStatus === "connected" ? "Live" : wsStatus === "connecting" ? "Connecting..." : useFallback ? "Polling" : "Disconnected"}
        </div>
        <button className="btn btn-sm" onClick={() => setPaused(!paused)}>
          {paused ? "▶ Resume" : "⏸ Pause"}
        </button>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {requestEvents.length} requests{pendingCount > 0 ? ` · ${pendingCount} pending` : ""}
        </span>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Model</th>
              <th>Strategy</th>
              <th>Status</th>
              <th>Latency</th>
              <th>Tokens</th>
            </tr>
          </thead>
          <tbody>
            {requestEvents.length === 0 ? (
              <tr><td colSpan={6}>
                <div className="empty-state">
                  <div className="empty-icon">☰</div>
                  <p>No requests yet. Send a request through Conduit to see it here.</p>
                </div>
              </td></tr>
            ) : requestEvents.map((evt, i) => {
              const d = evt.data ?? {}
              const id = evt.requestId || String(i)
              const expanded = expandedId === id
              const model = String(d.resolvedModel ?? d.model ?? "--")
              const strategy = String(d.strategy ?? "--")
              const status = String(d.status ?? "ok")
              const statusCode = Number(d.statusCode ?? 200)
              const latencyMs = d.latencyMs != null ? Number(d.latencyMs) : null
              const inputTokens = d.inputTokens != null ? Number(d.inputTokens) : null
              const outputTokens = d.outputTokens != null ? Number(d.outputTokens) : null
              const isError = status === "error" || statusCode >= 400

              return (<>
                <tr key={id} className="clickable-row" onClick={() => setExpandedId(expanded ? null : id)}>
                  <td>{new Date(evt.ts).toLocaleTimeString()}</td>
                  <td><strong>{model}</strong></td>
                  <td><span className="badge info">{strategy}</span></td>
                  <td>
                    <span className={`badge ${isError ? "error" : "success"}`}>
                      {statusCode}
                    </span>
                  </td>
                  <td>{latencyMs != null ? `${(latencyMs / 1000).toFixed(1)}s` : "--"}</td>
                  <td>{inputTokens != null ? `${inputTokens.toLocaleString()} → ${(outputTokens ?? 0).toLocaleString()}` : "--"}</td>
                </tr>
                {expanded && (
                  <tr key={`${id}-detail`} className="detail-row">
                    <td colSpan={6}>
                      <div className="detail-grid">
                        {Object.entries(d).map(([k, v]) => (
                          <div className="detail-item" key={k}>
                            <div className="detail-label">{k}</div>
                            <div className="detail-value" style={k === "error" ? { color: "var(--error)" } : undefined}>
                              {v == null ? "--" : typeof v === "object" ? JSON.stringify(v) : String(v)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>)
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
