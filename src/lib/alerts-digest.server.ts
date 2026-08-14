/**
 * Daily outbound alert digests: pending approvals, overdue/escalated RAID, pulse snapshot.
 * Called from /api/public/hooks/alerts-digest (cron). Also runs RAID auto-escalation.
 *
 * Respects platform → org → role → user hierarchy via alert-outbound-config.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  readAlertOutboundFromUiConfig,
  resolveEffectiveAlertEmails,
  type EffectiveAlertEmailChannels,
} from "@/lib/alert-outbound-config";
import {
  escapeHtml,
  sendTransactionalEmail,
} from "@/lib/transactional-email.server";

const DIGEST_KIND = "daily_pmo";
/** Skip re-send within this window (ms). */
const DEDUPE_MS = 20 * 60 * 60 * 1000;

function appBaseUrl() {
  return (
    process.env.APP_BASE_URL ||
    process.env.VITE_APP_URL ||
    process.env.PUBLIC_APP_URL ||
    "https://iprojectx.com"
  ).replace(/\/$/, "");
}

type DigestBucket = {
  approvals: Array<{ title: string; project?: string; link: string }>;
  overdueRaid: Array<{ kind: string; title: string; reason?: string; link: string }>;
  pulse: {
    criticalRisks: number;
    overdueDecisions: number;
    escalatedOpen: number;
    pendingApprovals: number;
  };
};

function emptyBucket(): DigestBucket {
  return {
    approvals: [],
    overdueRaid: [],
    pulse: {
      criticalRisks: 0,
      overdueDecisions: 0,
      escalatedOpen: 0,
      pendingApprovals: 0,
    },
  };
}

function buildEmail(args: {
  name: string;
  orgName: string;
  bucket: DigestBucket;
  prefs: EffectiveAlertEmailChannels;
}) {
  const base = appBaseUrl();
  const sections: string[] = [];
  const textSections: string[] = [];

  if (args.prefs.approvals && args.bucket.approvals.length) {
    const items = args.bucket.approvals
      .slice(0, 12)
      .map(
        (a) =>
          `<li style="margin:0 0 6px"><a href="${escapeHtml(base + a.link)}">${escapeHtml(a.title)}</a>${
            a.project ? ` <span style="color:#64748b">· ${escapeHtml(a.project)}</span>` : ""
          }</li>`,
      )
      .join("");
    sections.push(
      `<h3 style="margin:20px 0 8px;font-size:14px">Approvals awaiting you</h3><ul style="margin:0;padding-left:18px;font-size:13px">${items}</ul>`,
    );
    textSections.push(
      "Approvals awaiting you:",
      ...args.bucket.approvals
        .slice(0, 12)
        .map((a) => `- ${a.title}${a.project ? ` (${a.project})` : ""}`),
      "",
    );
  }

  if (
    (args.prefs.overdue_raid || args.prefs.raid_escalation) &&
    args.bucket.overdueRaid.length
  ) {
    const items = args.bucket.overdueRaid
      .slice(0, 15)
      .map(
        (r) =>
          `<li style="margin:0 0 6px"><strong>${escapeHtml(r.kind)}</strong>: <a href="${escapeHtml(base + r.link)}">${escapeHtml(r.title)}</a>${
            r.reason ? ` <span style="color:#64748b">— ${escapeHtml(r.reason)}</span>` : ""
          }</li>`,
      )
      .join("");
    sections.push(
      `<h3 style="margin:20px 0 8px;font-size:14px">Overdue / escalated RAID</h3><ul style="margin:0;padding-left:18px;font-size:13px">${items}</ul>`,
    );
    textSections.push(
      "Overdue / escalated RAID:",
      ...args.bucket.overdueRaid
        .slice(0, 15)
        .map((r) => `- [${r.kind}] ${r.title}${r.reason ? ` — ${r.reason}` : ""}`),
      "",
    );
  }

  if (args.prefs.pulse) {
    const p = args.bucket.pulse;
    sections.push(
      `<h3 style="margin:20px 0 8px;font-size:14px">Portfolio pulse snapshot</h3>
       <p style="margin:0;font-size:13px;color:#334155">
         Critical risks: <strong>${p.criticalRisks}</strong> ·
         Overdue decisions: <strong>${p.overdueDecisions}</strong> ·
         Escalated open RAID: <strong>${p.escalatedOpen}</strong> ·
         Pending approvals (org): <strong>${p.pendingApprovals}</strong>
       </p>
       <p style="margin:8px 0 0;font-size:12px"><a href="${escapeHtml(base + "/app/portfolio-pulse")}">Open Portfolio Pulse</a></p>`,
    );
    textSections.push(
      "Portfolio pulse snapshot:",
      `- Critical risks: ${p.criticalRisks}`,
      `- Overdue decisions: ${p.overdueDecisions}`,
      `- Escalated open RAID: ${p.escalatedOpen}`,
      `- Pending approvals (org): ${p.pendingApprovals}`,
      "",
    );
  }

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f6f7f9;padding:24px;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
    <div style="padding:20px 24px;border-bottom:1px solid #eef1f5">
      <div style="font-size:11px;letter-spacing:.08em;color:#64748b;text-transform:uppercase">iProjectX alerts</div>
      <div style="font-size:18px;font-weight:700;margin-top:4px">${escapeHtml(args.orgName)} — daily digest</div>
    </div>
    <div style="padding:20px 24px">
      <p style="margin:0 0 12px">Hi ${escapeHtml(args.name || "there")},</p>
      <p style="margin:0 0 8px;font-size:13px;color:#475569">Here is your PMO alert digest.</p>
      ${sections.join("") || "<p style=\"font-size:13px;color:#64748b\">No items in your subscribed categories today.</p>"}
      <p style="margin:24px 0 0;font-size:11px;color:#94a3b8">Manage email alerts in App → Settings. In-app notifications remain available in the bell.</p>
    </div>
  </div>
</body></html>`;

  const text = [
    `Hi ${args.name || "there"},`,
    ``,
    `${args.orgName} — daily digest`,
    ``,
    ...textSections,
    `Open app: ${base}/app`,
    ``,
    `Manage email alerts in App → Settings.`,
  ].join("\n");

  return { html, text };
}

function hasContent(bucket: DigestBucket, prefs: EffectiveAlertEmailChannels) {
  if (prefs.approvals && bucket.approvals.length) return true;
  if ((prefs.overdue_raid || prefs.raid_escalation) && bucket.overdueRaid.length) {
    return true;
  }
  if (prefs.pulse) {
    const p = bucket.pulse;
    return (
      p.criticalRisks > 0 ||
      p.overdueDecisions > 0 ||
      p.escalatedOpen > 0 ||
      p.pendingApprovals > 0
    );
  }
  return false;
}

export async function runAlertsDigestJob(admin: SupabaseClient) {
  const { data: esc, error: escErr } = await admin.rpc("run_raid_auto_escalation");
  if (escErr) {
    console.error("run_raid_auto_escalation failed", escErr);
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  const { data: orgs, error: orgErr } = await admin
    .from("organizations")
    .select("id,name,brand_name,ui_config")
    .limit(500);
  if (orgErr) throw orgErr;

  let emailed = 0;
  let skipped = 0;
  const failures: Array<{ user_id: string; error: string }> = [];

  for (const org of orgs ?? []) {
    const orgId = org.id as string;
    const orgName = (org.brand_name || org.name || "Organisation") as string;
    const orgConfig = readAlertOutboundFromUiConfig(org.ui_config);
    if (!orgConfig.active) {
      skipped++;
      continue;
    }

    const [
      { data: profiles },
      { data: roles },
      { data: projects },
      { data: decisions },
      { data: risks },
      { data: issues },
      { data: actions },
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("id,email,full_name,notification_prefs,is_active,org_id")
        .eq("org_id", orgId)
        .eq("is_active", true),
      admin.from("user_roles").select("user_id,role").eq("org_id", orgId),
      admin.from("projects").select("id,name,project_code,pm_user_id").eq("org_id", orgId),
      admin
        .from("decisions")
        .select(
          "id,title,outcome,approver_user_id,decision_date,required_date,due_date,project_id",
        )
        .eq("org_id", orgId)
        .in("outcome", ["Pending", "In Review"]),
      admin
        .from("risks")
        .select(
          "id,title,status,severity,probability,impact,due_date,escalated_at,escalation_reason,owner,project_id",
        )
        .eq("org_id", orgId)
        .not("status", "in", "(Closed,Accepted)"),
      admin
        .from("issues")
        .select(
          "id,title,status,priority,target_date,escalated_at,escalation_reason,owner,project_id",
        )
        .eq("org_id", orgId)
        .not("status", "in", "(Resolved,Closed)"),
      admin
        .from("actions")
        .select(
          "id,title,status,priority,due_date,escalated_at,escalation_reason,owner,project_id",
        )
        .eq("org_id", orgId)
        .neq("status", "Closed"),
    ]);

    const projectById = new Map(
      (projects ?? []).map((p: any) => [
        p.id as string,
        {
          name: p.name as string,
          code: p.project_code as string | null,
          pm: p.pm_user_id as string | null,
        },
      ]),
    );

    const roleByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const uid = r.user_id as string;
      const list = roleByUser.get(uid) ?? [];
      list.push(r.role as string);
      roleByUser.set(uid, list);
    }

    const sev = (r: any) =>
      Number(r.severity) ||
      (r.probability && r.impact ? Number(r.probability) * Number(r.impact) : 0);

    const criticalRisks = (risks ?? []).filter((r: any) => sev(r) >= 15).length;
    const overdueDecisions = (decisions ?? []).filter((d: any) => {
      const due = d.required_date || d.due_date || d.decision_date;
      return due && String(due).slice(0, 10) < todayIso;
    }).length;
    const escalatedOpen =
      (risks ?? []).filter((r: any) => r.escalated_at).length +
      (issues ?? []).filter((i: any) => i.escalated_at).length +
      (actions ?? []).filter((a: any) => a.escalated_at).length;

    const orgPulse = {
      criticalRisks,
      overdueDecisions,
      escalatedOpen,
      pendingApprovals: (decisions ?? []).length,
    };

    for (const profile of profiles ?? []) {
      const roleKeys = roleByUser.get(profile.id as string) ?? [];
      const prefs = resolveEffectiveAlertEmails({
        orgConfig,
        roleKeys,
        userPrefs: profile.notification_prefs,
      });
      if (!prefs.email_digest) {
        skipped++;
        continue;
      }
      const email = typeof profile.email === "string" ? profile.email.trim() : "";
      if (!email || !email.includes("@")) {
        skipped++;
        continue;
      }

      const { data: recent } = await admin
        .from("alert_digest_sends")
        .select("sent_at")
        .eq("user_id", profile.id)
        .eq("digest_kind", DIGEST_KIND)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recent?.sent_at) {
        const age = Date.now() - new Date(recent.sent_at).getTime();
        if (age < DEDUPE_MS) {
          skipped++;
          continue;
        }
      }

      const isAdminUser = roleKeys.some((x) => x === "admin" || x === "org_admin");
      const isExec = roleKeys.some((x) => x === "executive" || x === "bu_lead");
      const pmProjectIds = new Set(
        (projects ?? [])
          .filter((p: any) => p.pm_user_id === profile.id)
          .map((p: any) => p.id as string),
      );
      const nameKey = (profile.full_name || "").trim().toLowerCase();

      const bucket = emptyBucket();
      bucket.pulse = { ...orgPulse };

      if (prefs.approvals) {
        for (const d of decisions ?? []) {
          if (d.approver_user_id !== profile.id) continue;
          const proj = d.project_id ? projectById.get(d.project_id) : undefined;
          bucket.approvals.push({
            title: d.title || "Untitled decision",
            project: proj
              ? [proj.code, proj.name].filter(Boolean).join(" — ")
              : undefined,
            link: "/app/decisions?awaiting=me",
          });
        }
      }

      const relevantProject = (projectId: string | null) => {
        if (!projectId) return isAdminUser || isExec;
        if (isAdminUser || isExec) return true;
        return pmProjectIds.has(projectId);
      };

      const ownerMatch = (owner: string | null | undefined) => {
        if (!nameKey || !owner) return false;
        return String(owner).trim().toLowerCase() === nameKey;
      };

      const includeRaidItem = (opts: {
        overdue: boolean;
        escalated: boolean;
        critical?: boolean;
      }) => {
        if (opts.escalated && prefs.raid_escalation) return true;
        if ((opts.overdue || opts.critical) && prefs.overdue_raid) return true;
        return false;
      };

      if (prefs.overdue_raid || prefs.raid_escalation) {
        for (const r of risks ?? []) {
          const overdue = !!(r.due_date && String(r.due_date).slice(0, 10) < todayIso);
          const escalated = Boolean(r.escalated_at);
          const critical = sev(r) >= 15;
          if (!includeRaidItem({ overdue, escalated, critical })) continue;
          if (!relevantProject(r.project_id) && !ownerMatch(r.owner)) continue;
          bucket.overdueRaid.push({
            kind: escalated
              ? "Risk (escalated)"
              : critical
                ? "Risk (critical)"
                : "Risk (overdue)",
            title: r.title || "Untitled",
            reason: r.escalation_reason || undefined,
            link: "/app/risks",
          });
        }

        for (const i of issues ?? []) {
          const overdue = !!(
            i.target_date && String(i.target_date).slice(0, 10) < todayIso
          );
          const escalated = Boolean(i.escalated_at);
          if (!includeRaidItem({ overdue, escalated })) continue;
          if (!relevantProject(i.project_id) && !ownerMatch(i.owner)) continue;
          bucket.overdueRaid.push({
            kind: escalated ? "Issue (escalated)" : "Issue (overdue)",
            title: i.title || "Untitled",
            reason: i.escalation_reason || undefined,
            link: "/app/issues",
          });
        }

        for (const a of actions ?? []) {
          const overdue = !!(a.due_date && String(a.due_date).slice(0, 10) < todayIso);
          const escalated = Boolean(a.escalated_at);
          if (!includeRaidItem({ overdue, escalated })) continue;
          if (!relevantProject(a.project_id) && !ownerMatch(a.owner)) continue;
          bucket.overdueRaid.push({
            kind: escalated ? "Action (escalated)" : "Action (overdue)",
            title: a.title || "Untitled",
            reason: a.escalation_reason || undefined,
            link: "/app/actions",
          });
        }
      }

      if (!(isAdminUser || isExec || pmProjectIds.size > 0)) {
        if (!bucket.approvals.length && !bucket.overdueRaid.length) {
          skipped++;
          continue;
        }
        if (!isAdminUser && !isExec) {
          bucket.pulse = {
            criticalRisks: 0,
            overdueDecisions: 0,
            escalatedOpen: 0,
            pendingApprovals: bucket.approvals.length,
          };
        }
      }

      if (!hasContent(bucket, prefs)) {
        skipped++;
        continue;
      }

      const { html, text } = buildEmail({
        name: profile.full_name || "",
        orgName,
        bucket,
        prefs,
      });

      try {
        await sendTransactionalEmail({
          to: email,
          subject: `${orgName} — daily PMO digest`,
          html,
          text,
          fromName: "iProjectX Alerts",
        });
        await admin.from("alert_digest_sends").insert({
          user_id: profile.id,
          org_id: orgId,
          digest_kind: DIGEST_KIND,
          meta: {
            approvals: bucket.approvals.length,
            overdue_raid: bucket.overdueRaid.length,
            pulse: bucket.pulse,
          },
        });

        await admin.from("notifications").insert({
          user_id: profile.id,
          org_id: orgId,
          kind: "alert_digest",
          title: "Daily PMO digest emailed",
          body: [
            prefs.approvals && bucket.approvals.length
              ? `${bucket.approvals.length} approval(s)`
              : null,
            (prefs.overdue_raid || prefs.raid_escalation) && bucket.overdueRaid.length
              ? `${bucket.overdueRaid.length} RAID item(s)`
              : null,
            prefs.pulse ? "pulse snapshot" : null,
          ]
            .filter(Boolean)
            .join(" · "),
          link: "/app/my-work",
        });

        emailed++;
      } catch (e: any) {
        failures.push({
          user_id: profile.id as string,
          error: e?.message ?? String(e),
        });
      }
    }
  }

  return {
    escalation: esc ?? null,
    escalationError: escErr?.message ?? null,
    emailed,
    skipped,
    failures,
  };
}
