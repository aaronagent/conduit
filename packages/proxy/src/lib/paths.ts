import fs from "node:fs/promises"
import path from "node:path"

const DATA_DIR = process.env.CONDUIT_DATA_DIR ?? "data"
const GITHUB_TOKEN_PATH = process.env.CONDUIT_TOKEN_PATH ?? path.join(DATA_DIR, "github_token")

export const PATHS = {
  APP_DIR: path.resolve(DATA_DIR),
  GITHUB_TOKEN_PATH: path.resolve(GITHUB_TOKEN_PATH),
}

export async function ensurePaths(): Promise<void> {
  await fs.mkdir(PATHS.APP_DIR, { recursive: true })
  try {
    await fs.access(PATHS.GITHUB_TOKEN_PATH)
  } catch {
    await fs.writeFile(PATHS.GITHUB_TOKEN_PATH, "")
    await fs.chmod(PATHS.GITHUB_TOKEN_PATH, 0o600)
  }
}
