import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import { runTelegramBackup, sendTelegramTest } from "@/lib/backup/autoBackup";
import { verifyDashboardPassword } from "@/lib/auth/dashboardSession";
import { hasValidCliToken } from "@/lib/auth/cliToken";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PASSWORD_HEADER = "x-9r-password";
const HEADERS = { "Cache-Control": "no-store" };

// Status only — no secrets, safe to return without re-auth.
export async function GET() {
  try {
    const s = await getSettings();
    const intervalMinutes = Math.max(1, Number(s.telegramBackupIntervalMinutes) || 1440);
    const last = s.telegramBackupLastRunAt ? Date.parse(s.telegramBackupLastRunAt) : 0;
    return NextResponse.json({
      enabled: s.telegramBackupEnabled === true,
      configured: !!(s.telegramBackupBotToken && s.telegramBackupChatId),
      hasToken: !!s.telegramBackupBotToken,
      hasChatId: !!s.telegramBackupChatId,
      intervalMinutes,
      lastRunAt: s.telegramBackupLastRunAt || "",
      lastStatus: s.telegramBackupLastStatus || "",
      nextRunAt: s.telegramBackupEnabled === true && last ? new Date(last + intervalMinutes * 60000).toISOString() : "",
    }, { headers: HEADERS });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Send a backup (or a test message) now. Requires password re-auth — the payload
// carries provider credentials, same sensitivity as the export endpoint.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!(await hasValidCliToken(request)) && !(await verifyDashboardPassword(request.headers.get(PASSWORD_HEADER)))) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }
    const result = body?.action === "test" ? await sendTelegramTest() : await runTelegramBackup({ reason: "manual" });
    if (!result.ok) return NextResponse.json({ error: result.error || "Failed to send backup" }, { status: 400 });
    return NextResponse.json({ success: true }, { headers: HEADERS });
  } catch (error) {
    // Don't echo a raw error message — it may embed the Bot API URL.
    console.warn("[TelegramBackup] request failed:", error?.message || error);
    return NextResponse.json({ error: "Failed to send backup" }, { status: 500 });
  }
}
