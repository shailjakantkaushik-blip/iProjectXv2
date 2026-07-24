import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const verifyTurnstile = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ token: z.string().min(1).max(2048) }).parse(data))
  .handler(async ({ data }) => {
    const limited = checkRateLimit({
      key: `turnstile:${data.token.slice(0, 16)}`,
      limit: 30,
      windowMs: 60_000,
    });
    if (!limited.ok) {
      throw new Error("Too many verification attempts. Please wait and try again.");
    }

    const secret =
      process.env.TURNSTILE_SECRET_KEY ||
      process.env.CF_TURNSTILE_SECRET_KEY ||
      process.env.NEXT_TURNSTILE_SECRET_KEY;

    // Production must fail closed — never skip bot checks when the secret is missing.
    if (!secret) {
      const prod =
        process.env.NODE_ENV === "production" ||
        process.env.VERCEL_ENV === "production" ||
        process.env.VERCEL_ENV === "preview";
      if (prod) {
        throw new Error(
          "Bot check is not configured on the server. Sign-in is temporarily unavailable.",
        );
      }
      // Local/dev convenience when Turnstile secret is unset.
      return { ok: true, disabled: true };
    }

    const body = new URLSearchParams();
    body.append("secret", secret);
    body.append("response", data.token);

    const resp = await fetch(VERIFY_URL, { method: "POST", body });
    const json = (await resp.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };
    if (!json.success) {
      throw new Error(
        `Turnstile verification failed: ${(json["error-codes"] || []).join(", ") || "unknown"}`,
      );
    }
    return { ok: true, disabled: false };
  });
