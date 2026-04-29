export default defineNuxtConfig({
  compatibilityDate: "2026-04-16",
  devtools: { enabled: false },
  ssr: false,
  modules: ["@pinia/nuxt", "@nuxtjs/tailwindcss"],
  components: true,
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      wsUrl:  process.env["NUXT_PUBLIC_WS_URL"]  ?? "ws://localhost:4000",
      // FIX: was localhost:3001 (frontend port) — must point to orchestrator port 3010
      apiUrl: process.env["NUXT_PUBLIC_API_URL"] ?? "http://localhost:3010",
    }
  },
  typescript: { strict: true },
  app: { head: { title: "Crypto Analytics Platform" } }
})
