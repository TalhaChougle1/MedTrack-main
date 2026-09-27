import type { NextConfig } from "next";

// Ensure NEXTAUTH_URL is never an empty string or invalid URL during SSR / build
const sanitizeNextAuthUrl = (): string => {
  const url = process.env.NEXTAUTH_URL?.trim();
  if (!url) {
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    }
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`;
    }
    return "http://localhost:3000";
  }
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
};

const resolvedNextAuthUrl = sanitizeNextAuthUrl();
process.env.NEXTAUTH_URL = resolvedNextAuthUrl;

if (!process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.trim() === "") {
  process.env.NEXTAUTH_SECRET = "medtrack-secret-key-2026-nep-project";
}

const nextConfig: NextConfig = {
  env: {
    NEXTAUTH_URL: resolvedNextAuthUrl,
  },
};

export default nextConfig;

