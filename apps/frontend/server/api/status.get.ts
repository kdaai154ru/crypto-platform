// apps/frontend/server/api/status.get.ts
export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  try {
    const res = await fetch(`${config.public.apiUrl}/status`)
    if (!res.ok) return { error: 'orchestrator unreachable' }
    return await res.json()
  } catch {
    return { error: 'orchestrator unreachable' }
  }
})
