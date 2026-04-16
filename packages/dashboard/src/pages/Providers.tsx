import { useState, useEffect } from "react"
import { api } from "../lib/api"

export function Providers() {
  const [upstreams, setUpstreams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: "", base_url: "", api_key: "", format: "openai", model_patterns: "" })
  const [creating, setCreating] = useState(false)

  const load = () => {
    api.getUpstreams()
      .then(data => { setUpstreams(Array.isArray(data) ? data : data.upstreams || []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!form.name.trim() || !form.base_url.trim()) return
    setCreating(true)
    try {
      await api.createUpstream({
        ...form,
        model_patterns: form.model_patterns ? form.model_patterns.split(",").map(s => s.trim()) : [],
      })
      setForm({ name: "", base_url: "", api_key: "", format: "openai", model_patterns: "" })
      setShowCreate(false)
      load()
    } catch (e: any) { setError(e.message) }
    setCreating(false)
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this provider?")) return
    try {
      await api.deleteUpstream(id)
      load()
    } catch (e: any) { setError(e.message) }
  }

  if (error) return <div className="error-msg">{error}</div>
  if (loading) return <div className="loading"><div className="spinner" /><p>Loading providers...</p></div>

  return (
    <div>
      <h1 className="page-title">Providers</h1>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add Provider</button>
      </div>

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Add Provider</h3>
            <div className="form-group">
              <label>Name</label>
              <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. openai-prod" />
            </div>
            <div className="form-group">
              <label>Base URL</label>
              <input className="form-input" value={form.base_url} onChange={e => setForm({ ...form, base_url: e.target.value })} placeholder="https://api.openai.com/v1" />
            </div>
            <div className="form-group">
              <label>API Key</label>
              <input className="form-input" type="password" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} placeholder="sk-..." />
            </div>
            <div className="form-group">
              <label>Format</label>
              <select className="form-input" value={form.format} onChange={e => setForm({ ...form, format: e.target.value })}>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="azure">Azure</option>
              </select>
            </div>
            <div className="form-group">
              <label>Model Patterns (comma-separated)</label>
              <input className="form-input" value={form.model_patterns} onChange={e => setForm({ ...form, model_patterns: e.target.value })} placeholder="gpt-*, claude-*" />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>{creating ? "Creating..." : "Create"}</button>
            </div>
          </div>
        </div>
      )}

      {upstreams.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">☁</div>
          <p>No providers configured. Add one to get started.</p>
        </div>
      ) : (
        <div className="card-grid">
          {upstreams.map((u, i) => (
            <div className="card" key={u.id || i}>
              <h3>{u.name || `Provider ${i + 1}`}</h3>
              <dl className="kv-list">
                <dt>URL</dt><dd>{u.base_url || "--"}</dd>
                <dt>Format</dt><dd>{u.format || "openai"}</dd>
                <dt>Status</dt><dd><span className={`badge ${u.enabled !== false ? "success" : "error"}`}>{u.enabled !== false ? "Enabled" : "Disabled"}</span></dd>
                {u.model_patterns?.length > 0 && <><dt>Models</dt><dd>{u.model_patterns.join(", ")}</dd></>}
              </dl>
              <div style={{ marginTop: 12 }}>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
