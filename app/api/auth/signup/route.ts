import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createUserWithPassword } from "@/lib/users";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const signupSchema = z.object({
  email: z.string().email("Please provide a valid email address").max(255),
  password: z.string().min(8, "Password must be at least 8 characters long").max(128),
  name: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  // 1. Rate limiting (max 10 signup attempts per minute per IP)
  const rateLimit = await checkRateLimit(req, "auth_signup", {
    windowMs: 60_000,
    maxRequests: 10,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfterSeconds);
  }

  try {
    const body = await req.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: parsed.error.issues[0]?.message || "Invalid input data",
        },
        { status: 400 }
      );
    }

    const user = await createUserWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
      name: parsed.data.name,
    });

    return NextResponse.json(
      {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          name: user.name,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create account";
    if (message.includes("already exists")) {
      return NextResponse.json(
        {
          error: "conflict",
          message: "An account with this email address already exists.",
        },
        { status: 409 }
      );
    }

    console.error("[kankali] Signup error:", err);
    return NextResponse.json(
      {
        error: "internal_error",
        message: "An unexpected error occurred during account creation.",
      },
      { status: 500 }
    );
  }
}
