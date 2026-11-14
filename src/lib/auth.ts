import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { after } from "next/server";
import { prisma } from "./db";
import { sendSignInCode } from "./email";

/**
 * Email-only sign-in with a 6-digit code (no passwords, no magic links:
 * links tend to open inside the mail app's own browser on phones, so the
 * session would land in the wrong place). New emails get an account
 * automatically on first sign-in.
 *
 * Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh expiry at most daily
  },
  // On by default in production; stored in the DB so limits hold across serverless instances.
  rateLimit: { storage: "database" },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 10 * 60,
      allowedAttempts: 5,
      storeOTP: "hashed",
      // Send after the response so response timing doesn't reveal anything about the email.
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== "sign-in") return;
        after(() => sendSignInCode(email, otp));
      },
    }),
    nextCookies(), // must stay last
  ],
});
