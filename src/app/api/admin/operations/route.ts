import { NextResponse } from "next/server";
import { z } from "zod";
import { adminFailure } from "../../../../lib/server/admin-failure";
import {
  authenticatedServer,
  verifyOrigin,
  serviceClient,
} from "../../../../lib/server/auth";
import {
  AIServiceError,
  configuredModel,
  generateGeminiJSON,
} from "../../../../lib/server/gemini";
const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("deleteBusiness"),
    businessId: z.uuid(),
    confirmationName: z.string().min(1).max(120),
    permanent: z.literal(true),
    reason: z.string().trim().min(10).max(500),
  }),
  z.object({ action: z.literal("settings") }),
  z.object({ action: z.literal("access") }),
  z.object({ action: z.literal("supportHistory") }),
  z.object({
    action: z.literal("businessSearch"),
    search: z.string().max(150).default(""),
    offset: z.number().int().nonnegative().max(100000).default(0),
  }),
  z.object({
    action: z.literal("updatePlan"),
    code: z.string().max(50),
    amount: z.number().int().positive().safe(),
    enabled: z.boolean(),
    revision: z.number().int().nonnegative(),
    reason: z.string().trim().min(5).max(500),
  }),
  z.object({
    action: z.literal("updateTrial"),
    days: z.number().int().min(1).max(90),
    enabled: z.boolean(),
    revision: z.number().int().nonnegative(),
    reason: z.string().trim().min(5).max(500),
  }),
  z.object({
    action: z.literal("inspect"),
    businessId: z.uuid(),
    reason: z.string().trim().min(5).max(500),
  }),
  z.object({
    action: z.literal("health"),
    probeAI: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("traffic"),
    days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
  }),
]);
export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const { client } = await authenticatedServer(request);
    const access = await client.rpc("platform_access");
    if (access.error) throw access.error;
    if (access.error || !access.data)
      return NextResponse.json(
        { error: "Platform administrator access required." },
        { status: 403 },
      );
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Check the requested operation and fields." },
        { status: 400 },
      );
    const input = parsed.data;
    if (input.action === "access")
      return NextResponse.json({ role: access.data });
    if (input.action === "deleteBusiness") {
      const result = await client.rpc("platform_delete_business", {
        bid: input.businessId,
        confirmation_name: input.confirmationName,
        permanent: input.permanent,
        deletion_reason: input.reason,
      });
      return result.error
        ? NextResponse.json({ error: result.error.message }, { status: 403 })
        : NextResponse.json({ deleted: true });
    }
    if (input.action === "health") {
      const config = {
        aiKey: !!process.env.GEMINI_API_KEY?.trim(),
        aiModel: configuredModel(),
        serverKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
        bachsKey: !!process.env.BACHS_API_KEY?.trim(),
        bachsWebhook: !!process.env.BACHS_WEBHOOK_SECRET?.trim(),
        bachsAccount: !!process.env.BACHS_ACCOUNT_ID?.trim(),
        push: !!(
          process.env.VAPID_PRIVATE_KEY &&
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
          process.env.VAPID_SUBJECT
        ),
        scheduler: !!process.env.CRON_SECRET,
      };
      let probe: { ok: boolean; message: string; model?: string } | null = null;
      if (input.probeAI) {
        const reserved = await client.rpc("reserve_platform_ai_check");
        if (reserved.error)
          return NextResponse.json(
            { error: reserved.error.message },
            { status: 429 },
          );
        let databaseReady = false;
        try {
          const checked = await serviceClient().rpc("platform_server_health");
          databaseReady =
            !checked.error &&
            checked.data?.ready === true &&
            checked.data?.dailyInsights === true &&
            checked.data?.stockScans === true;
        } catch {}
        try {
          const result = await generateGeminiJSON(
            'Return JSON {"ok":true}. This is a Countiva connectivity check.',
            {
              type: "object",
              properties: { ok: { type: "boolean" } },
              required: ["ok"],
            },
          );
          probe = {
            ok: result.data.ok === true && databaseReady,
            message: databaseReady
              ? "AI returned a valid response. Server database permissions are ready."
              : "AI returned a valid response, but the server database check failed. Check the hosting project, server key and installed migrations.",
            model: result.model,
          };
        } catch (e) {
          probe = {
            ok: false,
            message:
              e instanceof AIServiceError
                ? e.message
                : "AI check did not complete.",
          };
        }
      }
      return NextResponse.json({ config, probe });
    }
    const operation =
      input.action === "settings"
        ? ["platform_plan_settings", {}]
        : input.action === "supportHistory"
          ? ["platform_support_history", {}]
          : input.action === "businessSearch"
            ? [
                "platform_business_search",
                { search_text: input.search, offset_rows: input.offset },
              ]
            : input.action === "traffic"
              ? ["platform_traffic_summary", { period_days: input.days }]
              : input.action === "updatePlan"
                ? [
                    "platform_update_plan",
                    {
                      plan_code: input.code,
                      amount_kobo: input.amount,
                      available: input.enabled,
                      expected_revision: input.revision,
                      change_reason: input.reason,
                    },
                  ]
                : input.action === "updateTrial"
                  ? [
                      "platform_update_trial",
                      {
                        trial_days: input.days,
                        available: input.enabled,
                        expected_revision: input.revision,
                        change_reason: input.reason,
                      },
                    ]
                  : [
                      "platform_business_workspace",
                      { bid: input.businessId, access_reason: input.reason },
                    ];
    const result = await client.rpc(
      operation[0] as string,
      operation[1] as Record<string, unknown>,
    );
    if (result.error)
      return NextResponse.json(
        { error: result.error.message },
        { status: 400 },
      );
    return NextResponse.json(result.data);
  } catch (error) {
    const failure = adminFailure(error);
    console.error("Countiva admin request failed", { code: failure.code });
    return NextResponse.json(
      { error: failure.error, code: failure.code },
      { status: failure.status },
    );
  }
}
