# Conduit

A local GitHub Copilot API reverse proxy with **native Anthropic Messages API passthrough**.

## Why Conduit?

AI coding tools like Claude Code send requests in Anthropic's Messages API format. Most Copilot proxies translate these to OpenAI's Chat Completions format before forwarding — losing critical parameters like `thinking`, `output_config.effort`, `context_management`, and `cache_control` in the process.

**Conduit doesn't translate. It passes through.**

GitHub Copilot natively supports the Anthropic Messages API for Claude models. Conduit detects Claude model requests and forwards them directly — zero translation, zero data loss.

```
Claude Code → Conduit → Copilot API
                │
                ├─ Claude models:  PASSTHROUGH (direct, no translation)
                │   ✅ thinking, effort, cache_control all preserved
                │
                └─ GPT/Gemini:     TRANSLATE (Anthropic → OpenAI format)
```

## Quick Start

```bash
# Clone and install
git clone https://github.com/aaronagent/conduit.git
cd conduit
bun install

# Start (proxy :7033 + dashboard :7023)
bun run dev

# First run: follow the GitHub OAuth prompt in terminal
```

### Configure Claude Code

```bash
export ANTHROPIC_BASE_URL=http://localhost:7033
export ANTHROPIC_API_KEY=your-conduit-api-key
claude
```

## Features

### Core Proxy
- **Anthropic Messages API passthrough** for Claude models — preserves `thinking`, `output_config.effort`, `context_management`, `cache_control`, `top_k`, `service_tier`
- **OpenAI Chat Completions** passthrough for GPT/Gemini models
- **Smart model routing** — automatically detects Claude vs non-Claude models
- **Model name translation** — `claude-opus-4-6` → `claude-opus-4.6-1m` (forced 1M context)
- **SSE streaming** support for both protocols

### Authentication
- **GitHub OAuth Device Flow** — one-time setup, token persisted
- **Copilot JWT** — auto-refreshes with exponential backoff retry
- **API key management** — database-backed keys with `ck-` prefix, or env var

### Monitoring Dashboard
- **Real-time stats** — request count, error rate, latency, token usage
- **Request log** — filterable table with strategy (passthrough/translate) indicator
- **Model list** — all available Copilot models grouped by vendor
- **Connection info** — copy-paste setup instructions

### Advanced
- **Custom upstream providers** — route models to third-party AI backends
- **Rate limiting** — configurable per-second limit with wait mode
- **SQLite logging** — WAL mode, full request history with indexes
- **Health check** — `GET /health`

## Architecture

```
packages/
├── proxy/          # Bun + Hono (port :7033)
│   └── src/
│       ├── routes/messages/
│       │   ├── passthrough.ts    ★ Direct Anthropic → Copilot
│       │   ├── handler.ts        ★ Smart routing logic
│       │   └── translate.ts        Fallback for non-Claude
│       ├── lib/model-router.ts   ★ Route strategy detection
│       ├── services/             GitHub OAuth, Copilot API
│       └── db/                   SQLite (requests, keys, settings)
│
└── dashboard/      # Vite + React (port :7023)
    └── src/pages/  Home, Logs, Models, Settings, Connect
```

## API Endpoints

### AI Routes (authenticated)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/messages` | Anthropic Messages API (passthrough for Claude) |
| POST | `/v1/chat/completions` | OpenAI Chat Completions |
| GET | `/v1/models` | List available models |

### Management Routes
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stats` | Request statistics |
| GET | `/api/requests` | Request log (paginated) |
| GET | `/api/copilot/models` | Copilot model capabilities |
| GET | `/api/connection-info` | Proxy endpoints |
| GET/POST | `/api/settings` | Configuration |
| GET/POST/DELETE | `/api/keys` | API key management |
| GET/POST/PUT/DELETE | `/api/upstreams` | Custom providers |
| GET | `/health` | Health check |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONDUIT_PORT` | `7033` | Proxy listen port |
| `CONDUIT_API_KEY` | _(empty)_ | API key for AI routes |
| `CONDUIT_INTERNAL_KEY` | _(empty)_ | Dashboard → proxy auth |
| `CONDUIT_TOKEN_PATH` | `data/github_token` | GitHub token file |
| `CONDUIT_DB_PATH` | `data/conduit.db` | SQLite database path |
| `CONDUIT_LOG_LEVEL` | `info` | Log level (debug/info/warn/error) |
| `CONDUIT_BASE_URL` | _(empty)_ | Public URL for connection info |

## Tech Stack

- **Runtime**: Bun
- **Proxy**: Hono 4
- **Dashboard**: Vite + React 19
- **Database**: SQLite (bun:sqlite, WAL mode)
- **Language**: TypeScript (strict mode)

## License

MIT
