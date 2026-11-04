import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/backend/auth-schema.ts", "./src/backend/share-schema.ts"],
  out: "./migrations",
});
