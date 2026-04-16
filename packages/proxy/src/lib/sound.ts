import { spawn } from "child_process"

export const SYSTEM_SOUNDS = [
  "Basso", "Blow", "Bottle", "Frog", "Funk", "Glass",
  "Hero", "Morse", "Ping", "Pop", "Purr", "Sosumi", "Submarine", "Tink",
] as const

export type SystemSound = (typeof SYSTEM_SOUNDS)[number]

export function isValidSound(name: string): name is SystemSound {
  return (SYSTEM_SOUNDS as readonly string[]).includes(name)
}

export function playSound(name: string = "Basso"): void {
  if (process.platform !== "darwin") return
  spawn("afplay", [`/System/Library/Sounds/${name}.aiff`], {
    stdio: "ignore",
    detached: true,
  }).unref()
}
