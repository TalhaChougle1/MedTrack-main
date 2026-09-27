import { AuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { initDatabase } from "@/lib/db/init";
import { users, auditLogs, userSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateEmail } from "@/lib/emailValidation";

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }

        const validation = validateEmail(credentials.email);
        if (!validation.isValid) {
          throw new Error(validation.error || "Invalid email format");
        }

        try {
          await initDatabase();
        } catch (e) {}

        const userList = await db
          .select()
          .from(users)
          .where(eq(users.email, credentials.email.toLowerCase().trim()));

        const user = userList[0];

        if (!user) {
          throw new Error("Invalid email or password");
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isValid) {
          throw new Error("Invalid email or password");
        }

        return {
          id: user.id.toString(),
          shopId: user.shopId,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.shopId = user.shopId;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.shopId = token.shopId as number;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      try {
        const uId = parseInt(user.id);
        const shopId = (user as any).shopId || 1;
        const nowIso = new Date().toISOString();

        // 1. Audit log for LOGIN
        await db.insert(auditLogs).values({
          shopId,
          userId: uId,
          action: "LOGIN",
          entityType: "user",
          entityId: uId,
          detail: JSON.stringify({
            userName: user.name,
            email: user.email,
            role: (user as any).role,
            timestamp: nowIso,
          }),
          timestamp: nowIso,
        });

        // 2. Insert active user session
        await db.insert(userSessions).values({
          shopId,
          userId: uId,
          userName: user.name,
          loginTime: nowIso,
          lastActivity: nowIso,
          isActive: true,
        });
      } catch (err) {
        console.warn("Session tracking signIn error:", err);
      }
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET || "medtrack-secret-key-2026-nep-project",
};

export async function getAuthSession() {
  return await getServerSession(authOptions);
}
