import { useState, useEffect, useRef, useCallback } from "react"

export function Logs() {
  const [events, setEvents] = useState<any[]>([])
  const [paused, setPaused] = useState(false)
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const wsRef = useRef<WebSocket | null>(null)
  const pausedRef = useRef(false)
  const eventsRef = useRef<any[]>([])

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
        const data = JSON.parse(e.data)
        eventsRef.current = [data, ...eventsRef.current].slice(0, 200)
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
        const list = Array.isArray(data) ? data : data.requests || []
        eventsRef.current = list.slice(0, 200)
        setEvents([...eventsRef.current])
      } catch (e: any) { setError(e.message) }
    }
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [useFallback])

  if (error) return <div className="error-msg">{error}</div>

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
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{events.length} events</span>
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
            {events.length === 0 ? (
              <tr><td colSpan={6}>
                <div className="empty-state">
                  <div className="empty-icon">☰</div>
                  <p>No requests yet. Events will appear here in real-time.</p>
                </div>
              </td></tr>
            ) : events.map((r, i) => {
              const id = r.id || String(i)
              const expanded = expandedId === id
              return (<>
                <tr key={id} className="clickable-row" onClick={() => setExpandedId(expanded ? null : id)}>
                  <td>{r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : "--"}</td>
                  <td>{r.model || "--"}</td>
                  <td><span className="badge info">{r.strategy || r.type || "passthrough"}</span></td>
                  <td>
                    <span className={`badge ${r.status >= 200 && r.status < 400 ? "success" : "error"}`}>
                      {r.status || (r.error ? "error" : "ok")}
                    </span>
                  </td>
                  <td>{r.latency != null ? `${Math.round(r.latency)}ms` : "--"}</td>
                  <td>{r.tokens != null ? r.tokens.toLocaleString() : (r.inputTokens != null ? `${r.inputTokens}/${r.outputTokens}` : "--")}</td>
                </tr>
                {expanded && (
                  <tr key={`${id}-detail`} className="detail-row">
                    <td colSpan={6}>
                      <div className="detail-grid">
                        <div className="detail-item">
                          <div className="detail-label">Model</div>
                          <div className="detail-value">{r.model || "--"}</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Strategy</div>
                          <div className="detail-value">{r.strategy || r.type || "passthrough"}</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Status Code</div>
                          <div className="detail-value">{r.status || "--"}</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Latency</div>
                          <div className="detail-value">{r.latency != null ? `${Math.round(r.latency)}ms` : "--"}</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Input Tokens</div>
                          <div className="detail-value">{r.inputTokens?.toLocaleString() ?? "--"}</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Output Tokens</div>
                          <div className="detail-value">{r.outputTokens?.toLocaleString() ?? "--"}</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Session ID</div>
                          <div className="detail-value">{r.sessionId || r.session_id || "--"}</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Client</div>
                          <div className="detail-value">{r.clientName || r.client_name || r.client || "--"}</div>
                        </div>
                        {r.error && (
                          <div className="detail-item" style={{ gridColumn: "1 / -1" }}>
                            <div className="detail-label">Error</div>
                            <div className="detail-value" style={{ color: "var(--error)" }}>{typeof r.error === "string" ? r.error : JSON.stringify(r.error)}</div>
                          </div>
                        )}
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
