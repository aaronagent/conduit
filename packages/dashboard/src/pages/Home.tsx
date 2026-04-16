import { useState, useEffect, useMemo } from "react"
import { api } from "../lib/api"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from "recharts"

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#22c55e", "#06b6d4", "#ef4444", "#84cc16"]

export function Home() {
  const [stats, setStats] = useState<any>(null)
  const [requests, setRequests] = useState<any[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = () => {
      Promise.all([
        api.getStats(),
        api.getRequests({ limit: 200 }).then(d => Array.isArray(d) ? d : d.requests || []).catch(() => []),
      ]).then(([s, r]) => {
        setStats(s)
        setRequests(r)
        setLoading(false)
      }).catch((e) => { setError(e.message); setLoading(false) })
    }
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  const rpmData = useMemo(() => {
    if (!requests.length) return []
    const buckets: Record<string, number> = {}
    for (const r of requests) {
      if (!r.timestamp) continue
      const d = new Date(r.timestamp)
      const key = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
      buckets[key] = (buckets[key] || 0) + 1
    }
    return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([time, count]) => ({ time, count }))
  }, [requests])

  const modelData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of requests) {
      const m = r.model || "unknown"
      counts[m] = (counts[m] || 0) + 1
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [requests])

  const tokenData = useMemo(() => {
    const byModel: Record<string, { input: number; output: number }> = {}
    for (const r of requests) {
      const m = r.model || "unknown"
      if (!byModel[m]) byModel[m] = { input: 0, output: 0 }
      byModel[m].input += r.inputTokens || 0
      byModel[m].output += r.outputTokens || 0
    }
    return Object.entries(byModel)
      .map(([model, t]) => ({ model: model.split("/").pop() || model, ...t }))
      .sort((a, b) => (b.input + b.output) - (a.input + a.output))
      .slice(0, 6)
  }, [requests])

  if (error) return <div className="error-msg">{error}</div>
  if (loading) return <div className="loading"><div className="spinner" /><p>Loading dashboard...</p></div>

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Total Requests</div>
          <div className="value">{stats?.total?.toLocaleString() ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">Errors</div>
          <div className="value error">{stats?.errors?.toLocaleString() ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">Avg Latency</div>
          <div className="value">{stats?.avgLatency != null ? `${Math.round(stats.avgLatency)}ms` : "--"}</div>
        </div>
        <div className="stat-card">
          <div className="label">Input Tokens</div>
          <div className="value">{stats?.totalInputTokens?.toLocaleString() ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">Output Tokens</div>
          <div className="value">{stats?.totalOutputTokens?.toLocaleString() ?? 0}</div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card full-width">
          <h3>Requests / Minute</h3>
          {rpmData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={rpmData}>
                <defs>
                  <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#888" fontSize={11} />
                <YAxis stroke="#888" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#141414", border: "1px solid #262626", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#colorReq)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="empty-state"><p>No request data yet</p></div>}
        </div>

        <div className="chart-card">
          <h3>Model Usage</h3>
          {modelData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={modelData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${(name as string).split("/").pop()} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {modelData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#141414", border: "1px solid #262626", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="empty-state"><p>No model data</p></div>}
        </div>

        <div className="chart-card">
          <h3>Token Usage by Model</h3>
          {tokenData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tokenData}>
                <XAxis dataKey="model" stroke="#888" fontSize={10} />
                <YAxis stroke="#888" fontSize={11} />
                <Tooltip contentStyle={{ background: "#141414", border: "1px solid #262626", borderRadius: 8, fontSize: 12 }} />
                <Legend />
                <Bar dataKey="input" fill="#3b82f6" name="Input" radius={[4, 4, 0, 0]} />
                <Bar dataKey="output" fill="#8b5cf6" name="Output" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="empty-state"><p>No token data</p></div>}
        </div>
      </div>
    </div>
  )
}
