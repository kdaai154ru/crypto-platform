// apps/frontend/server/api/status.get.ts
// FIX #5: AbortController с таймаутом 3s
// Было: fetch без таймаута — при зависшем оркестраторе SSR висел вечно
export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3_000)
  try {
    const res = await fetch(`${config.public.apiUrl}/status`, {
      signal: controller.signal,
    })
    if (!res.ok) return { error: 'orchestrator unreachable' }
    return await res.json()
  } catch {
    return { error: 'orchestrator unreachable' }
  } finally {
    clearTimeout(timeout)
  }
})
