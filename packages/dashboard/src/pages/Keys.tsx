import { useState, useEffect } from "react"
import { api } from "../lib/api"

export function Keys() {
  const [keys, setKeys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)

  const load = () => {
    api.getKeys()
      .then(data => { setKeys(Array.isArray(data) ? data : data.keys || []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await api.createKey(newName.trim())
      setNewName("")
      setShowCreate(false)
      load()
    } catch (e: any) { setError(e.message) }
    setCreating(false)
  }

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this API key?")) return
    try {
      await api.revokeKey(id)
      load()
    } catch (e: any) { setError(e.message) }
  }

  if (error) return <div className="error-msg">{error}</div>
  if (loading) return <div className="loading"><div className="spinner" /><p>Loading keys...</p></div>

  return (
    <div>
      <h1 className="page-title">API Keys</h1>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Create Key</button>
      </div>

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Create API Key</h3>
            <div className="form-group">
              <label>Name</label>
              <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. my-app" autoFocus onKeyDown={e => e.key === "Enter" && handleCreate()} />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>{creating ? "Creating..." : "Create"}</button>
            </div>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔑</div>
          <p>No API keys yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Key</th>
                <th>Created</th>
                <th>Last Used</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k, i) => (
                <tr key={k.id || i}>
                  <td>{k.name || "--"}</td>
                  <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{k.hash || k.key_prefix || k.key || "--"}</td>
                  <td>{k.created_at ? new Date(k.created_at).toLocaleDateString() : "--"}</td>
                  <td>{k.last_used ? new Date(k.last_used).toLocaleDateString() : "Never"}</td>
                  <td>
                    <button className="btn btn-sm btn-danger" onClick={() => handleRevoke(k.id)}>Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
