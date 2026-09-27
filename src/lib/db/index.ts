import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const getDatabaseUrl = () => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  // On Vercel serverless, root filesystem is read-only, so use writable /tmp directory
  if (process.env.VERCEL === "1") {
    return "file:/tmp/medtrack.db";
  }
  return "file:medtrack.db";
};

const dbUrl = getDatabaseUrl();
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;

export const client = createClient({
  url: dbUrl,
  ...(authToken ? { authToken } : {}),
});

export const db = drizzle(client, { schema });

export function getDatabaseConnectionType(): { isTurso: boolean; url: string } {
  return {
    isTurso: dbUrl.startsWith("libsql://") || dbUrl.startsWith("https://"),
    url: dbUrl.startsWith("file:") ? dbUrl : dbUrl.replace(/\/\/[^@]+@/, "//***@"),
  };
}

