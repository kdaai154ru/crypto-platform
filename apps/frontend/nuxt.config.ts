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
      apiUrl: process.env["NUXT_PUBLIC_API_URL"] ?? "http://localhost:3001",
    }
  },
  vite: {
    optimizeDeps: { include: ['vue-grid-layout'] },
  },
  typescript: { strict: true },
  app: { head: { title: "Crypto Analytics Platform" } }
})