import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Activity, Trash2, Download, FileText, Calculator, Settings as SettingsIcon, LogIn } from "lucide-react";
import {
  getActivityLog,
  clearActivityLog,
  onActivityLogChange,
  type ActivityEntry,
  type ActivityKind,
} from "@/utils/activityLog";

const KIND_ICON: Record<ActivityKind, React.ComponentType<{ className?: string }>> = {
  pdf: FileText,
  calculation: Calculator,
  action: SettingsIcon,
  auth: LogIn,
};

const KIND_LABEL: Record<ActivityKind, string> = {
  pdf: "PDF",
  calculation: "Calculation",
  action: "Action",
  auth: "Auth",
};

interface Props { darkMode?: boolean }

const ActivityLogPanel: React.FC<Props> = ({ darkMode = false }) => {
  const dm = darkMode;
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [filter, setFilter] = useState<ActivityKind | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const refresh = () => setEntries(getActivityLog());
    refresh();
    return onActivityLogChange(refresh);
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== "all" && e.kind !== filter) return false;
      if (!s) return true;
      const haystack = `${e.module} ${e.action} ${e.user ?? ""} ${JSON.stringify(e.meta ?? {})}`.toLowerCase();
      return haystack.includes(s);
    });
  }, [entries, filter, search]);

  const handleClear = () => {
    if (!confirm(`Clear all ${entries.length} activity log entries? This cannot be undone.`)) return;
    clearActivityLog();
  };

  const handleExport = () => {
    const csv = ["Time,User,Kind,Module,Action,Meta"]
      .concat(
        entries.map((e) => [
          new Date(e.ts).toISOString(),
          (e.user ?? "").replace(/,/g, ";"),
          e.kind,
          e.module.replace(/,/g, ";"),
          e.action.replace(/,/g, ";").replace(/"/g, "'"),
          JSON.stringify(e.meta ?? {}).replace(/,/g, ";").replace(/"/g, "'"),
        ].join(","))
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const card = `glass-card rounded-2xl p-6`;
  const counts = useMemo(() => {
    const c: Record<ActivityKind | "all", number> = { all: entries.length, pdf: 0, calculation: 0, action: 0, auth: 0 };
    entries.forEach((e) => { c[e.kind] += 1; });
    return c;
  }, [entries]);

  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Activity className={`w-5 h-5 ${dm ? "text-blue-400" : "text-blue-600"}`} />
          <h3 className={`text-lg font-semibold ${dm ? "text-white" : "text-gray-800"}`}>Activity Log</h3>
          <span className={`text-xs ${dm ? "text-gray-500" : "text-gray-500"}`}>
            {entries.length} entries (newest first) — per-browser
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!entries.length} className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear} disabled={!entries.length} className="gap-1.5 text-red-500">
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {(["all", "pdf", "calculation", "action", "auth"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`text-xs px-2.5 py-1 rounded-md border ${
              filter === k
                ? (dm ? "bg-blue-900/40 border-blue-700 text-blue-200" : "bg-blue-50 border-blue-300 text-blue-800")
                : (dm ? "bg-gray-800/40 border-gray-700 text-gray-400 hover:text-white" : "bg-white border-gray-200 text-gray-600 hover:text-gray-900")
            }`}
          >
            {k === "all" ? "All" : KIND_LABEL[k]} <span className="opacity-70">({counts[k]})</span>
          </button>
        ))}
        <div className="flex-1 min-w-[160px]">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search action, module, user, meta…"
            className={`h-8 text-xs ${dm ? "bg-gray-800 border-gray-700 text-white" : ""}`}
          />
        </div>
      </div>

      <div className={`rounded-lg border max-h-[600px] overflow-y-auto ${dm ? "border-gray-800" : "border-gray-200"}`}>
        {filtered.length === 0 ? (
          <p className={`text-xs italic p-6 text-center ${dm ? "text-gray-500" : "text-gray-400"}`}>
            {entries.length === 0
              ? "No activity recorded yet. Generate a PDF or run a calculation — it'll show up here."
              : "No entries match the current filter."}
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className={`sticky top-0 ${dm ? "bg-gray-900" : "bg-gray-50"}`}>
              <tr>
                <th className={`text-left py-2 px-3 font-medium uppercase tracking-wider ${dm ? "text-gray-500" : "text-gray-500"}`}>Time</th>
                <th className={`text-left py-2 px-3 font-medium uppercase tracking-wider ${dm ? "text-gray-500" : "text-gray-500"}`}>User</th>
                <th className={`text-left py-2 px-3 font-medium uppercase tracking-wider ${dm ? "text-gray-500" : "text-gray-500"}`}>Kind</th>
                <th className={`text-left py-2 px-3 font-medium uppercase tracking-wider ${dm ? "text-gray-500" : "text-gray-500"}`}>Module</th>
                <th className={`text-left py-2 px-3 font-medium uppercase tracking-wider ${dm ? "text-gray-500" : "text-gray-500"}`}>Action</th>
                <th className={`text-left py-2 px-3 font-medium uppercase tracking-wider ${dm ? "text-gray-500" : "text-gray-500"}`}>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const Icon = KIND_ICON[e.kind];
                return (
                  <tr key={e.id} className={`border-t ${dm ? "border-gray-800 hover:bg-gray-800/30" : "border-gray-100 hover:bg-gray-50"}`}>
                    <td className={`py-2 px-3 whitespace-nowrap ${dm ? "text-gray-400" : "text-gray-600"}`}>
                      {new Date(e.ts).toLocaleString()}
                    </td>
                    <td className={`py-2 px-3 ${dm ? "text-gray-300" : "text-gray-700"}`}>{e.user ?? "—"}</td>
                    <td className="py-2 px-3">
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <Icon className="w-3 h-3" /> {KIND_LABEL[e.kind]}
                      </Badge>
                    </td>
                    <td className={`py-2 px-3 ${dm ? "text-gray-300" : "text-gray-700"}`}>{e.module}</td>
                    <td className={`py-2 px-3 ${dm ? "text-white" : "text-gray-900"}`}>{e.action}</td>
                    <td className={`py-2 px-3 font-mono text-[10px] truncate max-w-[260px] ${dm ? "text-gray-500" : "text-gray-500"}`}
                        title={JSON.stringify(e.meta ?? {})}>
                      {e.meta && Object.keys(e.meta).length > 0
                        ? Object.entries(e.meta).map(([k, v]) => `${k}=${String(v).slice(0, 32)}`).join(", ")
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ActivityLogPanel;
