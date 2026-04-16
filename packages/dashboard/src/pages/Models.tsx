import { useState, useEffect } from "react"
import { api } from "../lib/api"

export function Models() {
  const [models, setModels] = useState<any[]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    api.getModels()
      .then((data) => setModels(Array.isArray(data) ? data : data.data || data.models || []))
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="error-msg">{error}</div>
  if (!models.length) return <div className="loading">Loading models...</div>

  const grouped: Record<string, any[]> = {}
  for (const m of models) {
    const vendor = m.vendor || m.owned_by || m.id?.split(/[\/\-\.]/)[0] || "Other"
    ;(grouped[vendor] ??= []).push(m)
  }

  return (
    <div>
      <h1 className="page-title">Models</h1>
      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([vendor, list]) => (
        <div className="card" key={vendor}>
          <h3>{vendor} ({list.length})</h3>
          <div className="card-grid">
            {list.map((m) => (
              <div className="model-item" key={m.id}>
                <div className="model-name">{m.name || m.id}</div>
                <div className="model-meta">
                  {m.id}
                  {m.context_window ? ` · ${(m.context_window / 1000).toFixed(0)}k ctx` : ""}
                  {m.max_output_tokens ? ` · ${(m.max_output_tokens / 1000).toFixed(0)}k out` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
