// apps/frontend/server/api/layouts.get.ts
// Server-side: returns layouts from Postgres (placeholder — auth needed)
export default defineEventHandler(async (_event) => {
  // TODO: extract userId from JWT cookie
  return { layouts: [] }
})
