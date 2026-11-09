import { config } from "dotenv"
import { defineConfig, env } from "prisma/config"

// Misma precedencia local que Next.js; las variables del proceso conservan prioridad.
config({ path: [".env.local", ".env"], quiet: true })

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
})
