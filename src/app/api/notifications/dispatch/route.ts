import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { serviceClient } from "../../../../lib/server/auth";
import { buildAnalytics } from "../../../../lib/analytics";
import type { State } from "../../../../lib/domain";
import { deliverPushJobs } from "../../../../lib/server/push-delivery";
import { deliverAdminPushAlerts } from "../../../../lib/server/admin-push-delivery";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET,
    provided =
      request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (
    !secret ||
    Buffer.byteLength(secret) !== Buffer.byteLength(provided) ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(provided))
  )
    return new Response("Unauthorized", { status: 401 });
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    privateKey = process.env.VAPID_PRIVATE_KEY,
    subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject)
    return NextResponse.json(
      { error: "Push delivery is not configured." },
      { status: 503 },
    );
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const admin = serviceClient();
    const adminAlerts = await deliverAdminPushAlerts(admin);
    const scheduled = await admin.rpc("claim_scheduled_reports");
    if (scheduled.error) throw scheduled.error;
    let reportsPrepared = 0;
    for (const job of scheduled.data || []) {
      try {
        const snapshot = await admin.rpc("scheduled_report_snapshot", {
          report_ref: job.id,
        });
        if (snapshot.error) throw snapshot.error;
        const report = buildAnalytics(
          snapshot.data as State,
          job.days,
          new Date(),
          `${job.endDate}T12:00:00+01:00`,
        );
        const saved = await admin.rpc("complete_scheduled_report", {
          report_ref: job.id,
          body_data: report,
        });
        if (saved.error) throw saved.error;
        reportsPrepared++;
      } catch {
        /* A failed durable reservation can retry after five minutes. */
      }
    }
    const { data: jobs, error } = await admin.rpc("claim_due_reminders");
    if (error) throw error;
    const events = await admin.rpc("claim_business_push_events");
    if (events.error) throw events.error;
    const delivery = await deliverPushJobs(admin, [
      ...(jobs || []),
      ...(events.data || []),
    ]);
    return NextResponse.json({ ...delivery, reportsPrepared, adminAlerts });
  } catch {
    return NextResponse.json(
      { error: "Reminder delivery did not complete. Retry the scheduler." },
      { status: 503 },
    );
  }
}
