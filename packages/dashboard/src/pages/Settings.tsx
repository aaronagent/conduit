import { useState, useEffect } from "react"
import { api } from "../lib/api"

export function Settings() {
  const [settings, setSettings] = useState<any>(null)
  const [connInfo, setConnInfo] = useState<any>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    Promise.all([
      api.getSettings().catch(() => null),
      api.getConnectionInfo().catch(() => null),
    ]).then(([s, c]) => {
      setSettings(s)
      setConnInfo(c)
    }).catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="error-msg">{error}</div>

  return (
    <div>
      <h1 className="page-title">Settings</h1>

      {connInfo && (
        <div className="section">
          <div className="section-title">Connection Info</div>
          <div className="card">
            <dl className="kv-list">
              {connInfo.base_url && <><dt>Base URL</dt><dd>{connInfo.base_url}</dd></>}
              {connInfo.endpoints?.map((ep: string) => (
                <span key={ep}><dt>Endpoint</dt><dd>{ep}</dd></span>
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
            <div className="loading">Loading settings...</div>
          )}
        </div>
      </div>
    </div>
  )
}
