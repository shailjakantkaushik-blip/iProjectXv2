import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const verifyTurnstile = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ token: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const secret =
      process.env.TURNSTILE_SECRET_KEY ||
      process.env.CF_TURNSTILE_SECRET_KEY ||
      process.env.NEXT_TURNSTILE_SECRET_KEY;

    // If not configured on the server, treat as disabled (dev mode).
    if (!secret) return { ok: true, disabled: true };

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
