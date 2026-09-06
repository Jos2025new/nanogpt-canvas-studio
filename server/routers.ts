import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const nanoGptInput = z.object({
  apiKey: z.string().trim().min(1, "API key is required").max(512),
  model: z.string().trim().min(1).max(128).default("hidream"),
  prompt: z.string().trim().min(1, "Prompt is required").max(8000),
  size: z.enum(["1376x768", "1024x1024", "768x1376", "auto"]).default("1024x1024"),
  imageDataUrls: z.array(z.string().regex(/^data:image\/(png|jpe?g|webp);base64,/i)).max(3).optional(),
});

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  nanogpt: router({
    models: publicProcedure.input(z.object({ apiKey: z.string().trim().min(1).max(512) })).query(async ({ input }) => {
      let response: Response;
      try {
        response = await fetch("https://nano-gpt.com/api/v1/image-models?detailed=true", {
          headers: { Authorization: `Bearer ${input.apiKey}` },
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new TRPCError({ code: "TIMEOUT", message: "Could not load nanoGPT models right now." });
      }
      const payload = await response.json().catch(() => ({} as Record<string, unknown>)) as Record<string, any>;
      if (!response.ok) {
        const providerMessage = payload?.error?.message || payload?.message || `nanoGPT returned ${response.status}`;
        throw new TRPCError({ code: "BAD_REQUEST", message: String(providerMessage).slice(0, 320) });
      }
      const models = Array.isArray(payload) ? payload : payload.models || payload.data || [];
      return models.map((item: any) => ({
        id: String(item.id || item.model || item.name || "").trim(),
        name: String(item.name || item.id || item.model || "").trim(),
        resolutions: Array.isArray(item.supported_parameters?.resolutions) ? item.supported_parameters.resolutions.map(String) : [],
      })).filter((item: { id: string }) => item.id);
    }),
    generate: publicProcedure.input(nanoGptInput).mutation(async ({ input }) => {
      const body: Record<string, unknown> = {
        model: input.model,
        prompt: input.prompt,
        n: 1,
        size: input.size,
        response_format: "url",
      };

      if (input.imageDataUrls?.length) {
        body.imageDataUrls = input.imageDataUrls;
      }

      let response: Response;
      try {
        response = await fetch("https://nano-gpt.com/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(115_000),
        });
      } catch (error) {
        const message = error instanceof Error && error.name === "TimeoutError"
          ? "nanoGPT timed out. Try a smaller reference or another model."
          : "Could not reach nanoGPT. Check your connection and try again.";
        throw new TRPCError({ code: "TIMEOUT", message });
      }

      const payload = await response.json().catch(() => ({} as Record<string, unknown>)) as Record<string, any>;
      if (!response.ok) {
        const providerMessage = payload?.error?.message || payload?.message || `nanoGPT returned ${response.status}`;
        throw new TRPCError({ code: "BAD_REQUEST", message: String(providerMessage).slice(0, 320) });
      }

      const firstImage = payload?.data?.[0];
      if (!firstImage) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "nanoGPT returned no image. Check the selected model and prompt." });
      }

      return {
        imageUrl: typeof firstImage.url === "string" ? firstImage.url : null,
        imageDataUrl: typeof firstImage.b64_json === "string" ? `data:image/png;base64,${firstImage.b64_json}` : null,
        model: input.model,
        cost: typeof payload.cost === "number" ? payload.cost : null,
        remainingBalance: typeof payload.remainingBalance === "number" ? payload.remainingBalance : null,
      };
    }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
