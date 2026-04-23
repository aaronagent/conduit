# Conduit

**Run Claude Code with Opus 4.7 — powered by your GitHub Copilot subscription.**

[简体中文](./README_zh.md) · English

---

Claude Code is the best AI coding agent. But its official API:

- Isn't available in many countries
- Costs real money per token even when you already pay Anthropic or an IDE vendor
- Requires a separate Anthropic billing account

Meanwhile, **GitHub Copilot includes Claude Opus 4.7, Sonnet 4.6, Haiku 4.5 and more** — and natively speaks the Anthropic Messages API. If you already have a Copilot subscription (individual, Business, or an MSFT account), you can run Claude Code against it today.

Conduit is the local proxy that makes it work.

```
Claude Code ──▶ Conduit (localhost) ──▶ GitHub Copilot API
                                        │
                                        └─ Claude Opus 4.7 etc.
```

## Why not other Copilot proxies?

Most Copilot proxies translate Anthropic Messages → OpenAI Chat Completions and back. In that round-trip they silently drop:

- `thinking` blocks
- `output_config.effort`
- `cache_control` (prompt caching!)
- `context_management`
- `top_k`, `service_tier`

**Conduit passes Anthropic requests through unchanged.** No translation, no data loss. Tool calls, streaming, thinking, and prompt caching all work the way Anthropic designed them.

## Quick Start

```bash
# 1. Install
git clone https://github.com/aaronagent/conduit.git
cd conduit
bun install

# 2. Launch the proxy — you'll be prompted to log in to GitHub once
CONDUIT_API_KEY=$(openssl rand -hex 16) bun run dev
```

The proxy listens on `:7133` and a dashboard on `:7023`. Copy the key it prints — you'll use it below.

### Point Claude Code at Conduit

```bash
export ANTHROPIC_BASE_URL=http://localhost:7133
export ANTHROPIC_AUTH_TOKEN=<the-key-from-above>
export ANTHROPIC_MODEL=claude-opus-4.7
export ANTHROPIC_SMALL_FAST_MODEL=claude-haiku-4.5
claude
```

> **Important:** use `ANTHROPIC_AUTH_TOKEN`, not `ANTHROPIC_API_KEY`. If `ANTHROPIC_API_KEY` is set in your shell, Claude Code will send it to Anthropic's servers and bypass Conduit.

Or save it as a one-shot alias:

```bash
alias claude-copilot='unset ANTHROPIC_API_KEY; \
  ANTHROPIC_BASE_URL=http://localhost:7133 \
  ANTHROPIC_AUTH_TOKEN=<your-key> \
  ANTHROPIC_MODEL=claude-opus-4.7 \
  ANTHROPIC_SMALL_FAST_MODEL=claude-haiku-4.5 \
  claude --dangerously-skip-permissions'
```

Now `claude-copilot` runs Claude Code on Opus 4.7 via your Copilot subscription.

## Features

- **Anthropic Messages API passthrough** for Claude models — thinking, effort, cache_control, streaming, tool use all native
- **OpenAI Chat Completions translation** for GPT/Gemini models (so `/chat/completions` works too)
- **Smart model routing** — one endpoint serves both protocols, detection is automatic
- **Per-model compatibility shims** — automatically reshapes requests that upstream would reject (e.g. `thinking: enabled` → `adaptive` for Opus 4.7)
- **GitHub OAuth Device Flow** — one-time login, JWT auto-refreshes
- **Monitoring dashboard** on `:7023` — live stats, request log, model catalog
- **SQLite request log** — every request, model, latency, tokens
- **SSE keepalive & 255s idle timeout** — long `thinking` responses don't get cut off

See [docs/MODEL_COMPATIBILITY.md](./docs/MODEL_COMPATIBILITY.md) for which models support what, and [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the internals.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CONDUIT_PORT` | `7133` | Proxy listen port |
| `CONDUIT_API_KEY` | _(empty)_ | API key clients must present. If empty, dev-mode allows any request |
| `CONDUIT_INTERNAL_KEY` | _(empty)_ | Dashboard → proxy auth |
| `CONDUIT_TOKEN_PATH` | `data/github_token` | GitHub token file |
| `CONDUIT_DB_PATH` | `data/conduit.db` | SQLite database path |
| `CONDUIT_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `CONDUIT_BASE_URL` | _(empty)_ | Public URL, used in dashboard Connect page |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/v1/messages` | Anthropic Messages API (passthrough for Claude) |
| POST | `/v1/chat/completions` | OpenAI Chat Completions |
| GET | `/v1/models` | Model list |
| GET | `/health` | Health check |
| GET | `/api/stats` | Dashboard stats |
| GET | `/api/requests` | Request log (paginated) |
| GET | `/api/copilot/models` | Copilot model capabilities |

## Requirements

- **GitHub Copilot subscription** — Individual / Business / Enterprise all work
- [**Bun**](https://bun.sh) ≥ 1.3 (the proxy and dashboard both run on Bun)
- macOS / Linux / WSL

## Troubleshooting

- **`API Error: 401 Invalid API key`** → you probably left `ANTHROPIC_API_KEY` set. `unset ANTHROPIC_API_KEY` and use `ANTHROPIC_AUTH_TOKEN` instead.
- **`Failed to get Copilot token` on startup** → your GitHub account doesn't have Copilot access. Subscribe or log in with a different account.
- **Banner shows `Opus 4 · API Usage Billing`** → cosmetic, ignore. Check the Conduit dashboard (`http://localhost:7023`) for the real model being sent.
- **More** → [docs/FAQ.md](./docs/FAQ.md)

## Tech Stack

Bun · Hono 4 · Vite + React 19 · SQLite (WAL mode) · TypeScript (strict)

## License

MIT. Conduit is an independent project and is not affiliated with Anthropic or GitHub.
