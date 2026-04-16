import { readdir, readFile } from "fs/promises"
import { join } from "path"
import { homedir } from "os"

/**
 * Detect locally installed VSCode version by reading package.json
 * from known installation paths.
 */
export async function detectLocalVSCodeVersion(): Promise<string | null> {
  const paths = [
    // macOS
    "/Applications/Visual Studio Code.app/Contents/Resources/app/package.json",
    // Linux snap
    "/snap/code/current/usr/share/code/resources/app/package.json",
    // Linux standard
    "/usr/share/code/resources/app/package.json",
    "/usr/lib/code/package.json",
  ]

  for (const p of paths) {
    try {
      const content = await readFile(p, "utf-8")
      const pkg = JSON.parse(content)
      if (pkg.version) return pkg.version
    } catch {
      // Not found at this path
    }
  }

  return null
}

/**
 * Detect locally installed GitHub Copilot Chat extension version.
 */
export async function detectLocalCopilotVersion(): Promise<string | null> {
  const extensionsDir = join(homedir(), ".vscode", "extensions")

  try {
    const entries = await readdir(extensionsDir)
    const copilotChat = entries
      .filter((e) => e.startsWith("github.copilot-chat-"))
      .sort()
      .pop()

    if (copilotChat) {
      // Extract version from directory name: github.copilot-chat-0.43.0
      const match = copilotChat.match(/github\.copilot-chat-(.+)$/)
      if (match) return match[1] ?? null
    }
  } catch {
    // Extensions dir not found
  }

  return null
}
