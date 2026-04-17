# Architecture

Conduit is a monorepo with two packages:

```
packages/
├── proxy/         Bun + Hono HTTP proxy on :7033
└── dashboard/     Vite + React 19 UI on :7023
```

## Request lifecycle

```
┌──────────────┐     1. POST /v1/messages           ┌──────────────┐
│  Claude Code │ ──────────────────────────────────▶│   Conduit    │
└──────────────┘   (Anthropic Messages API)         │   :7033      │
                                                    └──────┬───────┘
                                                           │
                                2. model router            │
                                   claude-*  → passthrough │
                                   else       → translate  │
                                                           │
                              ┌────────────────────────────┤
                              │                            │
                              ▼                            ▼
                      ┌──────────────┐            ┌──────────────┐
                      │ passthrough  │            │  translate   │
                      │   (Claude)   │            │ (GPT/Gemini) │
                      └──────┬───────┘            └──────┬───────┘
                             │                           │
                             │ strip fields,             │ convert to
                             │ clamp effort,             │ OpenAI Chat
                             │ rewrite thinking          │ Completions
                             │                           │
                             ▼                           ▼
                      /v1/messages               /chat/completions
                      (Copilot native            (Copilot OpenAI
                       Anthropic endpoint)        endpoint)
```

## Key files

### `packages/proxy/src/`

| File | Role |
|---|---|
| `index.ts` | Bun.serve entry, WebSocket handling, startup orchestration |
| `app.ts` | Hono app assembly — mounts all routes with middleware |
| `middleware.ts` | API key auth (`Authorization: Bearer` / `x-api-key`) |
| `lib/model-router.ts` | Decides passthrough vs translate, normalizes model names |
| `routes/messages/passthrough.ts` | Anthropic → Copilot native `/v1/messages` |
| `routes/messages/translate.ts` | Anthropic → OpenAI Chat Completions fallback |
| `routes/messages/handler.ts` | Dispatches between passthrough and translate |
| `services/github/` | OAuth Device Flow + Copilot JWT refresh |
| `db/` | SQLite schema, request log sink, settings, DB-backed API keys (roadmap) |
| `util/logger.ts` | Structured logger that also writes to DB |

### `packages/dashboard/src/pages/`

- `Home` — live stats (requests, error rate, latency, tokens)
- `Logs` — request log with full request/response body inspection
- `Models` — Copilot model catalog grouped by vendor
- `Connect` — copy-paste setup instructions
- `Settings` — toggles: web search, custom upstream providers, rate limiting

## Why Bun.serve instead of Node?

- Native `fetch` and `ReadableStream` semantics — streaming proxy is trivial
- ~4× faster cold start than Node + Fastify for this workload
- Built-in TypeScript, no bundler needed in dev
- `bun:sqlite` is WAL-mode out of the box

`idleTimeout` is set to 255 (Bun's max) so long-running `thinking` responses aren't cut off. If you need even longer we plan to add SSE keepalive comments (`: keepalive\n\n`) inside the passthrough stream.

## Auth chain

```
User ──OAuth Device Flow──▶ github.com  ──access token──▶ Conduit
                                                          │
Conduit ──access token──▶ api.github.com/copilot_internal/v2/token
                                                          │
                                                    ──Copilot JWT──▶ Conduit
                                                          │
Conduit ──Copilot JWT──▶ api.githubcopilot.com (all API calls)
```

- Access token is persisted to `data/github_token`
- Copilot JWT is kept in memory and auto-refreshed on expiry with exponential backoff

## Database

SQLite in WAL mode at `data/conduit.db`. Main tables:

- `requests` — one row per API call (id, timestamp, path, model, resolved_model, strategy, tokens, latency, client, status)
- `settings` — key/value config edited from the dashboard
- `providers` — custom upstream providers (e.g. point `deepseek-*` at DeepSeek's OpenAI-compatible endpoint)
- `api_keys` — roadmap: DB-backed multi-tenant API keys

Indexes on `timestamp`, `model`, and `status` keep the Logs page responsive even with 100K+ rows.
