import { useState, useEffect } from "react"
import { api } from "../lib/api"

export function Home() {
  const [stats, setStats] = useState<any>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const load = () => {
      api.getStats().then(setStats).catch((e) => setError(e.message))
    }
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  if (error) return <div className="error-msg">{error}</div>
  if (!stats) return <div className="loading">Loading stats...</div>

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Total Requests</div>
          <div className="value">{stats.total?.toLocaleString() ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">Errors</div>
          <div className="value error">{stats.errors?.toLocaleString() ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">Avg Latency</div>
          <div className="value">{stats.avgLatency != null ? `${Math.round(stats.avgLatency)}ms` : "—"}</div>
        </div>
        <div className="stat-card">
          <div className="label">Input Tokens</div>
          <div className="value">{stats.totalInputTokens?.toLocaleString() ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">Output Tokens</div>
          <div className="value">{stats.totalOutputTokens?.toLocaleString() ?? 0}</div>
        </div>
      </div>
    </div>
  )
}
