import { useState, useEffect } from "react"
import { Home } from "./pages/Home"
import { Logs } from "./pages/Logs"
import { Models } from "./pages/Models"
import { Keys } from "./pages/Keys"
import { Providers } from "./pages/Providers"
import { Settings } from "./pages/Settings"
import { Connect } from "./pages/Connect"
import { api } from "./lib/api"

const pages = [
  { id: "home", label: "Home", icon: "◉" },
  { id: "logs", label: "Logs", icon: "☰" },
  { id: "models", label: "Models", icon: "◈" },
  { id: "keys", label: "Keys", icon: "🔑" },
  { id: "providers", label: "Providers", icon: "☁" },
  { id: "settings", label: "Settings", icon: "⚙" },
  { id: "connect", label: "Connect", icon: "⌘" },
] as const

type Page = (typeof pages)[number]["id"]

function getTheme(): "dark" | "light" {
  return (localStorage.getItem("conduit-theme") as any) || "dark"
}

export function App() {
  const [page, setPage] = useState<Page>("home")
  const [healthy, setHealthy] = useState(true)
  const [theme, setTheme] = useState<"dark" | "light">(getTheme)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    localStorage.setItem("conduit-theme", theme)
  }, [theme])

  useEffect(() => {
    const check = () => api.getHealth().then(() => setHealthy(true)).catch(() => setHealthy(false))
    check()
    const id = setInterval(check, 10000)
    return () => clearInterval(id)
  }, [])

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark")

  const navigate = (p: Page) => {
    setPage(p)
    setSidebarOpen(false)
  }

  const content: Record<Page, React.ReactNode> = {
    home: <Home />,
    logs: <Logs />,
    models: <Models />,
    keys: <Keys />,
    providers: <Providers />,
    settings: <Settings />,
    connect: <Connect />,
  }

  return (
    <div className="layout">
      <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
      <div className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">⚡ Conduit</div>
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
        <nav className="sidebar-nav">
          {pages.map((p) => (
            <button key={p.id} className={page === p.id ? "active" : ""} onClick={() => navigate(p.id)}>
              {p.icon} {p.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-status">
          <span className={`status-dot ${healthy ? "" : "offline"}`} />
          {healthy ? "Proxy online" : "Proxy offline"}
        </div>
      </aside>
      <main className="main">{content[page]}</main>
    </div>
  )
}
