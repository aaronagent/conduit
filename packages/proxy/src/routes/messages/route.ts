import { Hono } from "hono"
import { handleMessages } from "./handler"

export const messageRoutes = new Hono()
messageRoutes.post("/", handleMessages)
