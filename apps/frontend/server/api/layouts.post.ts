// apps/frontend/server/api/layouts.post.ts
import { readBody } from 'h3'
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  // TODO: save to Postgres
  return { ok: true, received: body }
})
