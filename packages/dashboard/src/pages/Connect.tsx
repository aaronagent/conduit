import { useState, useEffect } from "react"
import { api } from "../lib/api"

export function Connect() {
  const [info, setInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    api.getConnectionInfo()
      .then(data => { setInfo(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (error) return <div className="error-msg">{error}</div>
  if (loading) return <div className="loading"><div className="spinner" /><p>Loading connection info...</p></div>

  const baseUrl = info?.base_url || "http://localhost:7033"

  return (
    <div>
      <h1 className="page-title">Connect</h1>

      <div className="section">
        <div className="section-title">Claude Code</div>
        <div className="card">
          <p style={{ marginBottom: 12, color: "var(--text-secondary)", fontSize: 13 }}>
            Set these environment variables to route Claude Code through Conduit:
          </p>
          <div className="code-block">{`export ANTHROPIC_BASE_URL=${baseUrl}
export ANTHROPIC_API_KEY=your-key`}</div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">OpenAI-compatible clients</div>
        <div className="card">
          <div className="code-block">{`export OPENAI_BASE_URL=${baseUrl}/v1
export OPENAI_API_KEY=your-key`}</div>
        </div>
      </div>

      {info?.endpoints && (
        <div className="section">
          <div className="section-title">Available Endpoints</div>
          <div className="card">
            {info.endpoints.map((ep: string) => (
              <div key={ep} className="model-item" style={{ marginBottom: 8 }}>
                <code>{baseUrl}{ep}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
