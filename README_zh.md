# Conduit

**用你的 GitHub Copilot 订阅，在 Claude Code 里跑 Opus 4.7。**

简体中文 · [English](./README.md)

---

Claude Code 是目前最好用的 AI 编程 Agent。但它官方 API：

- 很多地区用不了
- 花的是 Anthropic 的钱，即使你已经订阅了 Copilot 或别的 IDE 服务
- 要单独注册 Anthropic 账号、绑卡

另一边，**GitHub Copilot 里包含了 Claude Opus 4.7、Sonnet 4.6、Haiku 4.5 等模型**，而且原生支持 Anthropic Messages API。只要你有 Copilot 订阅（个人版、Business、Microsoft 账号都行），今天就能让 Claude Code 用上。

Conduit 就是让这条路走通的本地代理。

```
Claude Code ──▶ Conduit（本地）──▶ GitHub Copilot API
                                   │
                                   └─ Claude Opus 4.7 等模型
```

## 和其它 Copilot 代理有什么不同？

市面上大多数 Copilot 代理把 Anthropic Messages → OpenAI Chat Completions 来回翻译。翻译的过程中会悄悄丢掉这些东西：

- `thinking` 思考块
- `output_config.effort`（思考强度）
- `cache_control`（Prompt 缓存！）
- `context_management`
- `top_k`、`service_tier`

**Conduit 原样透传 Anthropic 请求，不做翻译、不丢参数。** 工具调用、流式、thinking、prompt 缓存都按 Anthropic 设计的方式工作。

## 快速开始

```bash
# 1. 安装
git clone https://github.com/aaronagent/conduit.git
cd conduit
bun install

# 2. 启动代理，首次运行会提示你用 GitHub 登录
CONDUIT_API_KEY=$(openssl rand -hex 16) bun run dev
```

代理监听 `:7033`，Dashboard 监听 `:7023`。把控制台里打出来的 API key 记下来，下一步会用。

### 让 Claude Code 走 Conduit

```bash
export ANTHROPIC_BASE_URL=http://localhost:7033
export ANTHROPIC_AUTH_TOKEN=<上一步生成的 key>
export ANTHROPIC_MODEL=claude-opus-4.7
export ANTHROPIC_SMALL_FAST_MODEL=claude-haiku-4.5
claude
```

> **⚠️ 重点：** 用 `ANTHROPIC_AUTH_TOKEN`，**不要**用 `ANTHROPIC_API_KEY`。如果你 shell 里已经设了 `ANTHROPIC_API_KEY`，Claude Code 会绕过 Conduit 直接打 Anthropic 官方，你还会被扣 Anthropic 那边的钱。

也可以直接写一条 alias（加到 `~/.zshrc`）：

```bash
alias claude-copilot='unset ANTHROPIC_API_KEY; \
  ANTHROPIC_BASE_URL=http://localhost:7033 \
  ANTHROPIC_AUTH_TOKEN=<你的 key> \
  ANTHROPIC_MODEL=claude-opus-4.7 \
  ANTHROPIC_SMALL_FAST_MODEL=claude-haiku-4.5 \
  claude --dangerously-skip-permissions'
```

之后 `claude-copilot` 就是**用 Copilot 订阅跑 Opus 4.7 版的 Claude Code**。

## 功能

- **Anthropic Messages API 原生透传**——thinking、effort、cache_control、流式、tool_use 全部原汁原味
- **OpenAI Chat Completions 翻译**——GPT/Gemini 模型也能用（同一个端点）
- **智能模型路由**——一个 endpoint 两套协议，按模型名自动判断
- **按模型做请求适配**——自动修正上游会拒的请求形状（比如 Opus 4.7 只收 `adaptive` thinking，Conduit 会自动把 `enabled` 翻成 `adaptive`）
- **GitHub OAuth Device Flow**——扫一次码，Copilot JWT 自动续期
- **监控 Dashboard**（`:7023`）——实时统计、请求日志、模型目录
- **SQLite 请求日志**——每一条都留痕（模型、延迟、token 数）
- **SSE 心跳 & 255s idle 超时**——长思考不会被切断

详细的模型兼容矩阵见 [docs/MODEL_COMPATIBILITY.md](./docs/MODEL_COMPATIBILITY.md)，架构细节见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CONDUIT_PORT` | `7033` | 代理监听端口 |
| `CONDUIT_API_KEY` | _(空)_ | 客户端要带的 API key。留空等于开发模式，任何请求都放行 |
| `CONDUIT_INTERNAL_KEY` | _(空)_ | Dashboard → proxy 之间的内部鉴权 |
| `CONDUIT_TOKEN_PATH` | `data/github_token` | GitHub token 文件位置 |
| `CONDUIT_DB_PATH` | `data/conduit.db` | SQLite 数据库位置 |
| `CONDUIT_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `CONDUIT_BASE_URL` | _(空)_ | Conduit 的公网地址，Dashboard 的 Connect 页会用到 |

## API Endpoints

| Method | Path | 说明 |
|---|---|---|
| POST | `/v1/messages` | Anthropic Messages API（Claude 走 passthrough）|
| POST | `/v1/chat/completions` | OpenAI Chat Completions |
| GET | `/v1/models` | 模型列表 |
| GET | `/health` | 健康检查 |
| GET | `/api/stats` | Dashboard 统计 |
| GET | `/api/requests` | 请求日志（分页） |
| GET | `/api/copilot/models` | Copilot 模型能力明细 |

## 前置要求

- **GitHub Copilot 订阅**——Individual / Business / Enterprise 都行
- [**Bun**](https://bun.sh) ≥ 1.3
- macOS / Linux / WSL

## 常见问题

- **`API Error: 401 Invalid API key`** → 大概率是你 shell 里还留着 `ANTHROPIC_API_KEY`。`unset ANTHROPIC_API_KEY`，然后用 `ANTHROPIC_AUTH_TOKEN`。
- **启动时报 `Failed to get Copilot token`** → 你的 GitHub 账号没开 Copilot。订阅一下或者换个有 Copilot 的账号。
- **Claude Code 的 banner 显示 `Opus 4 · API Usage Billing`** → 纯 UI 缓存，不是实际在用的模型。去 Conduit Dashboard（`http://localhost:7023`）看真实走的模型。
- **更多** → [docs/FAQ.md](./docs/FAQ.md)

## 技术栈

Bun · Hono 4 · Vite + React 19 · SQLite (WAL) · TypeScript (strict)

## 许可证

MIT。Conduit 是个人项目，与 Anthropic 和 GitHub 没有官方关联。
