import { useState, useEffect } from "react"
import { api } from "../lib/api"

export function Logs() {
  const [requests, setRequests] = useState<any[]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    const load = () => {
      api.getRequests({ limit: 50 }).then((data) => {
        setRequests(Array.isArray(data) ? data : data.requests || [])
      }).catch((e) => setError(e.message))
    }
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [])

  if (error) return <div className="error-msg">{error}</div>

  return (
    <div>
      <h1 className="page-title">Request Logs</h1>
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
            {requests.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)" }}>No requests yet</td></tr>
            ) : requests.map((r, i) => (
              <tr key={r.id || i}>
                <td>{r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : "—"}</td>
                <td>{r.model || "—"}</td>
                <td><span className="badge info">{r.strategy || r.type || "passthrough"}</span></td>
                <td>
                  <span className={`badge ${r.status >= 200 && r.status < 400 ? "success" : "error"}`}>
                    {r.status || (r.error ? "error" : "ok")}
                  </span>
                </td>
                <td>{r.latency != null ? `${Math.round(r.latency)}ms` : "—"}</td>
                <td>{r.tokens != null ? r.tokens.toLocaleString() : (r.inputTokens != null ? `${r.inputTokens}/${r.outputTokens}` : "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
