# Model Compatibility

What each Claude model on Copilot actually supports. Based on live testing against `api.githubcopilot.com/v1/messages`.

## Summary

| Model | Passthrough | `effort` | `thinking` | Tools | Streaming | Tested max input |
|---|---|---|---|---|---|---|
| `claude-opus-4.7` | ✅ | only `medium` | only `adaptive` | ✅ | ✅ | 630K tokens |
| `claude-opus-4.6` | ✅ | low / medium / high | enabled or adaptive | ✅ | ✅ | ~1M tokens (hard cap) |
| `claude-opus-4.5` | ✅ | low / medium / high | enabled or adaptive | ✅ | ✅ | 168K (declared) |
| `claude-sonnet-4.6` | ✅ | low / medium / high | enabled or adaptive | ✅ | ✅ | 168K (declared) |
| `claude-sonnet-4.5` | ✅ | low / medium / high | enabled or adaptive | ✅ | ✅ | 168K (declared) |
| `claude-haiku-4.5` | ✅ | **not supported** | _none_ | ✅ | ✅ | 136K (declared) |

"Declared" numbers come from Copilot's `/models` catalog. Actual upstream limits can be more lenient — for instance `claude-opus-4.6` advertises `max_prompt_tokens: 168000` but the real hard cap is 1,000,000 tokens, with no beta header needed.

## How Conduit handles the quirks

Conduit transparently reshapes requests so you don't have to special-case per model in your client:

### `thinking.type: "enabled"` → `adaptive` for Opus 4.7

Anthropic SDKs send `{"thinking": {"type": "enabled", "budget_tokens": 8000}}`, but Copilot's Opus 4.7 rejects `enabled` with:

```
"thinking.type.enabled" is not supported for this model.
Use "thinking.type.adaptive" and "output_config.effort" to control thinking behavior.
```

Conduit rewrites the payload on the fly: `type` becomes `adaptive`, and the budget is translated into an `effort` level (`<=4000` → `low`, `4000–16000` → `medium`, `>=16000` → `high`) unless the caller already picked one explicitly.

### `effort` clamping per model

- **`claude-opus-4.7`** — upstream whitelist is `["medium"]`. Anything else (low / high / max) gets clamped to `medium`.
- **`claude-haiku-4.5`** — does not support `reasoning_effort` at all. Conduit strips the field.

### `max` / `xhigh` → `high`

Anthropic's SDK sometimes sends `effort: "max"` or `"xhigh"`. Copilot only accepts `low / medium / high`, so Conduit maps those to `high` before forwarding.

### Unsupported top-level fields

The following fields are silently stripped on their way out because Copilot's `/v1/messages` returns "Extra inputs" errors for them. Per-block `cache_control` is preserved — only the _top-level_ shortcut is dropped.

- `context_management`
- top-level `cache_control`
- `container`
- `inference_geo`

### Model name normalization

SDK-style model names (`claude-opus-4-6-20250820`) are mapped to Copilot IDs (`claude-opus-4.6`). When the client sends `anthropic-beta: context-1m-*`, Conduit picks the `-1m` variant (`claude-opus-4.6-1m`). In our tests `claude-opus-4.6` already accepts up to 1,000,000 input tokens without the `-1m` suffix, so the beta header isn't strictly required.

## How to test yourself

Conduit's dashboard shows exactly what got sent to upstream and what came back — no guessing:

1. Send a request through Conduit
2. Open `http://localhost:7023/logs`
3. Click the row to see the full request body, response body, and token usage

For programmatic access, query the SQLite DB directly:

```bash
sqlite3 data/conduit.db \
  "SELECT timestamp, model, resolved_model, strategy, status_code
   FROM requests ORDER BY timestamp DESC LIMIT 10;"
```
