import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { upsertUserFromAuth } from "./users";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email || !account) return false;
      // Firebase-style uid: prefer Google sub, fall back to email hash
      const uid = account.providerAccountId || user.id || user.email;
      await upsertUserFromAuth({
        uid: String(uid),
        email: user.email,
        name: user.name ?? undefined,
      });
      return true;
    },
    async jwt({ token, account, user }) {
      if (account && user) {
        token.uid = account.providerAccountId || user.id || user.email;
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
  pages: {
    signIn: "/",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
