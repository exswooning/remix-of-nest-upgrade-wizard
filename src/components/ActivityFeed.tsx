import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  FileText,
  Calculator,
  Settings as SettingsIcon,
  LogIn,
  Sparkles,
  ScrollText,
  Server,
  FileSignature,
  ClipboardList,
  Receipt,
  Building2,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  getActivityLog,
  onActivityLogChange,
  type ActivityEntry,
} from "@/utils/activityLog";

interface Props {
  darkMode?: boolean;
  /** Max entries to display. Defaults to 25. */
  limit?: number;
  /** Compact mode strips the card chrome — useful as an embedded widget. */
  compact?: boolean;
}

interface RenderedEntry {
  id: string;
  ts: number;
  user: string;
  initials: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColour: string;
  sentence: React.ReactNode;
}

const initialsOf = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const pick = (meta: Record<string, unknown> | undefined, key: string): string | undefined => {
  const v = meta?.[key];
  if (v === undefined || v === null) return undefined;
  return String(v);
};

const fmtCurrency = (n: unknown): string | undefined => {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return undefined;
  return `NPR ${num.toLocaleString("en-NP", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Turn a raw activity entry into a human sentence + icon. Each row that
 * `logActivity` emits anywhere in the app should resolve to a clause here.
 * Unknown shapes fall through to a generic "{user} {action}" rendering so
 * nothing is hidden from the feed.
 */
const render = (e: ActivityEntry): RenderedEntry => {
  const user = e.user || "Someone";
  const initials = initialsOf(user);
  const meta = e.meta as Record<string, unknown> | undefined;

  const userEl = <span className="font-semibold">{user}</span>;

  const dim = "text-muted-foreground";
  const strong = "font-medium";

  // Defaults — overridden by specific cases.
  let icon: React.ComponentType<{ className?: string }> = SettingsIcon;
  let iconColour = "text-slate-500";
  let sentence: React.ReactNode = (
    <>
      {userEl} <span className={dim}>{e.action.toLowerCase()}</span>{" "}
      <span className={dim}>in</span> <span className={strong}>{e.module}</span>
    </>
  );

  // Auth.
  if (e.kind === "auth") {
    icon = LogIn;
    iconColour = "text-slate-500";
    sentence = (
      <>
        {userEl} <span className={dim}>{e.action.toLowerCase()}</span>
      </>
    );
    return { id: e.id, ts: e.ts, user, initials, icon, iconColour, sentence };
  }

  // UCAP — upgrade calculator.
  if (e.module === "UCAP/Upgrade" && e.kind === "calculation") {
    icon = Calculator;
    iconColour = "text-blue-500";
    const current = pick(meta, "currentPlan");
    const target = pick(meta, "targetPlan");
    const amt = fmtCurrency(meta?.upgradeAmount);
    sentence = (
      <>
        {userEl} <span className={dim}>calculated an upgrade</span>
        {current && target ? (
          <>
            {" "}
            <span className={dim}>from</span> <span className={strong}>{current}</span>{" "}
            <span className={dim}>to</span> <span className={strong}>{target}</span>
          </>
        ) : null}
        {amt ? (
          <>
            {" "}
            <span className={dim}>·</span> <span className={strong}>{amt}</span>
          </>
        ) : null}
      </>
    );
    return { id: e.id, ts: e.ts, user, initials, icon, iconColour, sentence };
  }

  // UCAP — billing ledger.
  if (e.module === "UCAP/Ledger") {
    icon = ScrollText;
    iconColour = "text-emerald-500";
    sentence = <>{userEl} <span className={dim}>generated a billing ledger PDF</span></>;
    return { id: e.id, ts: e.ts, user, initials, icon, iconColour, sentence };
  }

  // UCAP — VPS pricing.
  if (e.module === "UCAP/VPS") {
    icon = Server;
    iconColour = "text-purple-500";
    const customer = pick(meta, "customer");
    const quoteNumber = pick(meta, "quoteNumber");
    sentence = (
      <>
        {userEl} <span className={dim}>generated a VPS quote</span>
        {customer ? <> <span className={dim}>for</span> <span className={strong}>{customer}</span></> : null}
        {quoteNumber ? <> <span className={dim}>(#{quoteNumber})</span></> : null}
      </>
    );
    return { id: e.id, ts: e.ts, user, initials, icon, iconColour, sentence };
  }

  // CGAP — generic upgrade/pro-rata PDF.
  if (e.module.startsWith("UCAP/") && e.kind === "pdf") {
    icon = FileText;
    iconColour = "text-blue-500";
    const filename = pick(meta, "filename");
    sentence = (
      <>
        {userEl} <span className={dim}>exported a</span>{" "}
        <span className={strong}>{e.module.replace("UCAP/", "")}</span>{" "}
        <span className={dim}>PDF</span>
        {filename ? <> <span className={dim}>· {filename}</span></> : null}
      </>
    );
    return { id: e.id, ts: e.ts, user, initials, icon, iconColour, sentence };
  }

  // QGAP — quote.
  if (e.module === "QGAP") {
    icon = Receipt;
    iconColour = "text-blue-600";
    const customer = pick(meta, "customer");
    const quoteNumber = pick(meta, "quoteNumber");
    sentence = (
      <>
        {userEl} <span className={dim}>created a quote</span>
        {customer ? <> <span className={dim}>for</span> <span className={strong}>{customer}</span></> : null}
        {quoteNumber ? <> <span className={dim}>(#{quoteNumber})</span></> : null}
      </>
    );
    return { id: e.id, ts: e.ts, user, initials, icon, iconColour, sentence };
  }

  // CGAP — RfP.
  if (e.module === "CGAP/RfP") {
    icon = Receipt;
    iconColour = "text-orange-500";
    const invoice = pick(meta, "invoiceNumber");
    const amount = fmtCurrency(meta?.amount);
    const contract = pick(meta, "contract");
    sentence = (
      <>
        {userEl} <span className={dim}>issued a Request for Payment</span>
        {invoice ? <> <span className={dim}>(#{invoice})</span></> : null}
        {contract ? <> <span className={dim}>against contract</span> <span className={strong}>{contract}</span></> : null}
        {amount ? <> <span className={dim}>·</span> <span className={strong}>{amount}</span></> : null}
      </>
    );
    return { id: e.id, ts: e.ts, user, initials, icon, iconColour, sentence };
  }

  // CGAP — SLA.
  if (e.module === "CGAP/SLA") {
    icon = FileSignature;
    iconColour = "text-cyan-600";
    const customer = pick(meta, "customer");
    sentence = (
      <>
        {userEl} <span className={dim}>generated an SLA</span>
        {customer ? <> <span className={dim}>for</span> <span className={strong}>{customer}</span></> : null}
      </>
    );
    return { id: e.id, ts: e.ts, user, initials, icon, iconColour, sentence };
  }

  // CGAP — Service Order.
  if (e.module === "CGAP/ServiceOrder") {
    icon = ClipboardList;
    iconColour = "text-teal-600";
    const customer = pick(meta, "customer");
    const contract = pick(meta, "contract");
    sentence = (
      <>
        {userEl} <span className={dim}>generated a Service Order</span>
        {customer ? <> <span className={dim}>for</span> <span className={strong}>{customer}</span></> : null}
        {contract ? <> <span className={dim}>(contract</span> <span className={strong}>{contract}</span><span className={dim}>)</span></> : null}
      </>
    );
    return { id: e.id, ts: e.ts, user, initials, icon, iconColour, sentence };
  }

  // CGAP — Contract.
  if (e.module === "CGAP/Contract") {
    icon = FileSignature;
    iconColour = "text-indigo-600";
    const client = pick(meta, "client") || pick(meta, "customer");
    sentence = (
      <>
        {userEl} <span className={dim}>generated a contract</span>
        {client ? <> <span className={dim}>for</span> <span className={strong}>{client}</span></> : null}
      </>
    );
    return { id: e.id, ts: e.ts, user, initials, icon, iconColour, sentence };
  }

  // VRAP.
  if (e.module === "VRAP") {
    icon = Building2;
    iconColour = "text-rose-500";
    const filename = pick(meta, "filename");
    sentence = (
      <>
        {userEl} <span className={dim}>generated a VRAP quote</span>
        {filename ? <> <span className={dim}>·</span> <span className={strong}>{filename}</span></> : null}
      </>
    );
    return { id: e.id, ts: e.ts, user, initials, icon, iconColour, sentence };
  }

  // TTAP — AI assistant.
  if (e.module === "TTAP") {
    icon = Sparkles;
    iconColour = "text-fuchsia-500";
    sentence = (
      <>
        {userEl} <span className={dim}>via TTAP:</span> <span className={strong}>{e.action}</span>
      </>
    );
    return { id: e.id, ts: e.ts, user, initials, icon, iconColour, sentence };
  }

  // Fallback — uses the generic sentence defined above.
  if (e.kind === "pdf") icon = FileText;
  if (e.kind === "calculation") icon = Calculator;
  return { id: e.id, ts: e.ts, user, initials, icon, iconColour, sentence };
};

const ActivityFeed: React.FC<Props> = ({ darkMode = false, limit = 25, compact = false }) => {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const refresh = () => setEntries(getActivityLog());
    refresh();
    return onActivityLogChange(refresh);
  }, []);

  // Tick once a minute so "5 minutes ago" stays fresh without re-rendering on every keystroke.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const rendered = useMemo(
    () => entries.slice(0, limit).map(render),
    [entries, limit],
  );

  const body = (
    <div className="space-y-3">
      {rendered.length === 0 ? (
        <p className={`text-sm italic py-8 text-center ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
          No activity yet. Generate a PDF, run a calculation, or save a quote — it'll appear here.
        </p>
      ) : (
        rendered.map((r) => {
          const Icon = r.icon;
          const when = new Date(r.ts);
          const relative = formatDistanceToNow(when, { addSuffix: true });
          const absolute = format(when, "PPpp"); // e.g. "May 24, 2026 at 11:32:14 AM"
          return (
            <div
              key={r.id}
              className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                darkMode ? "hover:bg-white/[0.04]" : "hover:bg-black/[0.025]"
              }`}
            >
              <div className="relative shrink-0">
                <Avatar className="h-9 w-9">
                  <AvatarFallback
                    className={`text-xs font-semibold ${
                      darkMode ? "bg-slate-800 text-slate-200" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {r.initials}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                    darkMode ? "border-slate-900 bg-slate-800" : "border-white bg-slate-100"
                  }`}
                >
                  <Icon className={`h-3 w-3 ${r.iconColour}`} />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-snug ${darkMode ? "text-slate-100" : "text-slate-800"}`}>
                  {r.sentence}
                </p>
                <p
                  className={`text-xs mt-0.5 ${darkMode ? "text-slate-500" : "text-slate-500"}`}
                  title={absolute}
                  // Suppress hydration warnings since relative time changes between server/client renders.
                  suppressHydrationWarning
                >
                  {relative}
                </p>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  if (compact) return body;

  return (
    <Card className={`glass-card rounded-2xl p-6 ${darkMode ? "text-slate-100" : ""}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className={`text-lg font-semibold ${darkMode ? "text-white" : "text-gray-800"}`}>
            Recent activity
          </h3>
          <p className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-500"}`}>
            Everything that happened in this browser, newest first.
          </p>
        </div>
        <span
          className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}
          // Avoid hydration mismatch since `now` differs server vs client.
          suppressHydrationWarning
        >
          {entries.length ? `Updated ${formatDistanceToNow(new Date(now), { addSuffix: true })}` : ""}
        </span>
      </div>
      {body}
    </Card>
  );
};

export default ActivityFeed;
