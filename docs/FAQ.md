# FAQ

## Is this legal? Will my Copilot get banned?

Conduit uses the same Copilot API endpoints that GitHub's own VS Code extension uses. The OAuth Device Flow is the same flow `gh auth login` uses. That said, GitHub's terms of service for Copilot forbid reselling the capacity — **use Conduit for your own personal coding, not as a paid service for others.**

At the time of writing (April 2026) there's no public case of an account being banned for local API use, but anyone using this accepts the residual risk.

## Does this bypass Anthropic's rate limits?

Conduit doesn't bypass anything — your requests hit Copilot, which has its own per-user limits. If you're a Copilot Business or Enterprise user those limits are generally higher. Heavy `thinking` usage (Opus 4.7 with big prompts) is what eats the budget fastest.

## Why does the Claude Code banner show "Opus 4 · API Usage Billing"?

That banner is a UI cache based on your last Anthropic login, not the live model. The real model being sent is whatever `ANTHROPIC_MODEL` is set to, which you can confirm in Conduit's dashboard at `http://localhost:7023/logs`.

## Why do I keep getting `401 Invalid API key`?

99% of the time: you have `ANTHROPIC_API_KEY` set in your shell. Claude Code treats that as "Anthropic direct mode" and ignores your `ANTHROPIC_BASE_URL`. Fix:

```bash
unset ANTHROPIC_API_KEY
export ANTHROPIC_AUTH_TOKEN=<your-conduit-key>
```

Or put `unset ANTHROPIC_API_KEY; ` at the start of your alias.

## Can I use this with the Anthropic SDK directly (Python / Node)?

Yes. Set:

```python
from anthropic import Anthropic
client = Anthropic(
    base_url="http://localhost:7033",
    auth_token="<your-conduit-key>",   # NOT api_key
)
```

Streaming, tool use, thinking, and prompt caching all work.

## Can I use this with Cursor / Cline / Aider?

Any tool that lets you set `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` (or equivalent) should work. Cline is known to work. Cursor is trickier because it uses its own server-side proxy.

## How do I run this in the background?

### macOS (launchd)

Create `~/Library/LaunchAgents/com.conduit.proxy.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>          <string>com.conduit.proxy</string>
  <key>WorkingDirectory</key><string>/path/to/conduit</string>
  <key>ProgramArguments</key><array>
    <string>/opt/homebrew/bin/bun</string>
    <string>run</string>
    <string>dev:proxy</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>CONDUIT_API_KEY</key><string>your-key-here</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/conduit.log</string>
  <key>StandardErrorPath</key><string>/tmp/conduit.err</string>
</dict>
</plist>
```

Then `launchctl load ~/Library/LaunchAgents/com.conduit.proxy.plist`.

### Linux (systemd)

Create `~/.config/systemd/user/conduit.service`:

```ini
[Unit]
Description=Conduit proxy
After=network.target

[Service]
WorkingDirectory=/path/to/conduit
ExecStart=/home/you/.bun/bin/bun run dev:proxy
Environment="CONDUIT_API_KEY=your-key-here"
Restart=always

[Install]
WantedBy=default.target
```

Then `systemctl --user enable --now conduit`.

## Does prompt caching work?

Yes. Conduit preserves per-block `cache_control` in the passthrough, and Copilot's backend honors it. The `cache_creation_input_tokens` and `cache_read_input_tokens` fields come back correctly in the `usage` object. You can see cache hit rates in the dashboard.

## I have a model that isn't on Copilot. Can Conduit route to it?

Yes — the "Custom upstream providers" feature. Open the dashboard, go to Settings → Upstream Providers, and add an OpenAI-compatible endpoint. Any request whose `model` matches a configured prefix will be routed to that provider instead of Copilot.

## The `-1m` thing — do I need `anthropic-beta: context-1m-*`?

For `claude-opus-4.6` specifically, no. We've measured it accepting up to 1,000,000 input tokens without any beta header. The `-1m` variant exists in Copilot's catalog but the base variant is already 1M-capable. Conduit will still switch to `-1m` if you pass the beta header, for future-proofing.

For other models the limit is lower (168K for most Sonnet/Opus 4.5+, 136K for Haiku 4.5).

## What about Anthropic's 200K / 400K / 1M pricing tiers?

Copilot flat-rates the underlying inference as part of your subscription, so tier pricing doesn't apply here. You're paying GitHub, not Anthropic.

## Streams get cut off on long `thinking` responses. What's going on?

Bun's default HTTP idle timeout is 10 seconds. Conduit raises it to 255 (Bun's max). If you still see cut-offs, it's almost always the upstream (Copilot) silently killing slow streams — in which case retrying with a shorter `effort` or splitting the prompt usually fixes it.

SSE keepalive (periodic `: keepalive\n\n` comments) is on the roadmap to make this fully bulletproof.

## How do I contribute?

PRs welcome. Things that would actually help:

- Tests for edge cases we've missed (report them as issues first)
- SSE keepalive implementation
- DB-backed multi-tenant API keys
- Better Cursor / Cline / Aider compatibility notes

Run `bun run typecheck && bun run test` before opening a PR.
