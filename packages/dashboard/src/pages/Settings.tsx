import { useState, useEffect } from "react"
import { api } from "../lib/api"

export function Settings() {
  const [settings, setSettings] = useState<any>(null)
  const [connInfo, setConnInfo] = useState<any>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getSettings().catch(() => null),
      api.getConnectionInfo().catch(() => null),
    ]).then(([s, c]) => {
      setSettings(s)
      setConnInfo(c)
      setLoading(false)
    }).catch((e) => { setError(e.message); setLoading(false) })
  }, [])

  if (error) return <div className="error-msg">{error}</div>
  if (loading) return <div className="loading"><div className="spinner" /><p>Loading settings...</p></div>

  return (
    <div>
      <h1 className="page-title">Settings</h1>

      {connInfo && (
        <div className="section">
          <div className="section-title">Connection Info</div>
          <div className="card">
            <dl className="kv-list">
              {connInfo.base_url && <><dt>Base URL</dt><dd>{connInfo.base_url}</dd></>}
              {connInfo.endpoints && Object.entries(connInfo.endpoints).map(([name, path]) => (
                <span key={name}><dt>{name}</dt><dd>{String(path)}</dd></span>
              ))}
              {connInfo.models?.length && <><dt>Models</dt><dd>{connInfo.models.length} available</dd></>}
            </dl>
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-title">Configuration</div>
        <div className="card">
          {settings ? (
            <dl className="kv-list">
              {Object.entries(settings).map(([k, v]) => (
                <span key={k}>
                  <dt>{k}</dt>
                  <dd>{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                </span>
              ))}
            </dl>
          ) : (
            <div className="empty-state"><p>No settings available.</p></div>
          )}
        </div>
      </div>
    </div>
  )
}
