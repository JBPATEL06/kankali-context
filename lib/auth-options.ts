import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { upsertUserFromAuth, verifyUserPassword } from "./users";

export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                scope: "openid email profile https://www.googleapis.com/auth/drive.appdata",
                prompt: "consent",
                access_type: "offline",
                response_type: "code"
              }
            }
          }),
        ]
      : []),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }
        const user = await verifyUserPassword(credentials.email, credentials.password);
        if (!user) {
          throw new Error("Invalid email or password");
        }
        return {
          id: user.uid,
          email: user.email,
          name: user.name || user.email.split("@")[0],
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email || !account) return false;
      if (account.provider === "google") {
        const uid = account.providerAccountId || user.id || user.email;
        try {
          await upsertUserFromAuth({
            uid: String(uid),
            email: user.email,
            name: user.name ?? undefined,
            refreshToken: account.refresh_token ?? undefined,
          });
        } catch (err) {
          console.error("[kankali] upsertUserFromAuth failed:", err);
        }
      }
      return true;
    },
    async jwt({ token, account, user }) {
      if (user) {
        token.uid = String(user.id || account?.providerAccountId || user.email || "");
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { uid?: string }).uid = token.uid as string;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/",
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.JWT_SIGNING_SECRET,
};
