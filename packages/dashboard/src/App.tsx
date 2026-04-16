import { useState, useEffect } from "react"
import { Home } from "./pages/Home"
import { Logs } from "./pages/Logs"
import { Models } from "./pages/Models"
import { Settings } from "./pages/Settings"
import { Connect } from "./pages/Connect"
import { api } from "./lib/api"

const pages = [
  { id: "home", label: "Home", icon: "◉" },
  { id: "logs", label: "Logs", icon: "☰" },
  { id: "models", label: "Models", icon: "◈" },
  { id: "settings", label: "Settings", icon: "⚙" },
  { id: "connect", label: "Connect", icon: "⌘" },
] as const

type Page = (typeof pages)[number]["id"]

export function App() {
  const [page, setPage] = useState<Page>("home")
  const [healthy, setHealthy] = useState(true)

  useEffect(() => {
    const check = () => api.getHealth().then(() => setHealthy(true)).catch(() => setHealthy(false))
    check()
    const id = setInterval(check, 10000)
    return () => clearInterval(id)
  }, [])

  const content = {
    home: <Home />,
    logs: <Logs />,
    models: <Models />,
    settings: <Settings />,
    connect: <Connect />,
  }[page]

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">⚡ Conduit</div>
        <nav className="sidebar-nav">
          {pages.map((p) => (
            <button key={p.id} className={page === p.id ? "active" : ""} onClick={() => setPage(p.id)}>
              {p.icon} {p.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-status">
          <span className={`status-dot ${healthy ? "" : "offline"}`} />
          {healthy ? "Proxy online" : "Proxy offline"}
        </div>
      </aside>
      <main className="main">{content}</main>
    </div>
  )
}
