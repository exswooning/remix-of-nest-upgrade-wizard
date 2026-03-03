import React, { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, Plus, X, ArrowRight, ChevronRight, Sparkles, Download, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseDate, formatDate } from "./dateUtils";
import { useAuth } from "@/contexts/AuthContext";
import jsPDF from "jspdf";

/* ─── Types ─── */
interface PlanNode {
  id: string;
  category: string;
  plan: string;
  billingCycle: string;
  priceOverride: string;
  dateText: string;
  date: Date | undefined;
}

interface BillingLedgerProps {
  darkMode: boolean;
}

const cycleLabels: Record<number, string> = { 1: "Monthly", 12: "Annually", 36: "3 Years" };
const cycleDaysMap: Record<number, number> = { 1: 30, 6: 180, 12: 365, 36: 1095 };

const nodeColors = [
  { bg: "bg-blue-500/10", border: "border-blue-400/50", text: "text-blue-600 dark:text-blue-400", badge: "bg-blue-600" },
  { bg: "bg-violet-500/10", border: "border-violet-400/50", text: "text-violet-600 dark:text-violet-400", badge: "bg-violet-600" },
  { bg: "bg-amber-500/10", border: "border-amber-400/50", text: "text-amber-600 dark:text-amber-400", badge: "bg-amber-600" },
  { bg: "bg-rose-500/10", border: "border-rose-400/50", text: "text-rose-600 dark:text-rose-400", badge: "bg-rose-600" },
  { bg: "bg-teal-500/10", border: "border-teal-400/50", text: "text-teal-600 dark:text-teal-400", badge: "bg-teal-600" },
  { bg: "bg-indigo-500/10", border: "border-indigo-400/50", text: "text-indigo-600 dark:text-indigo-400", badge: "bg-indigo-600" },
  { bg: "bg-emerald-500/10", border: "border-emerald-400/50", text: "text-emerald-600 dark:text-emerald-400", badge: "bg-emerald-600" },
  { bg: "bg-pink-500/10", border: "border-pink-400/50", text: "text-pink-600 dark:text-pink-400", badge: "bg-pink-600" },
];

/* ─── Animated number ─── */
const AnimatedNumber: React.FC<{ value: number; className?: string }> = ({ value, className }) => {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    if (from === to) return;
    const duration = 400;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(from + (to - from) * eased);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);

  const prefix = displayed < 0 ? "-" : "";
  const formatted = `${prefix}NPR ${Math.abs(displayed).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return <span className={cn("font-mono font-bold", className)}>{formatted}</span>;
};

/* ─── Component ─── */
const BillingLedger: React.FC<BillingLedgerProps> = ({ darkMode }) => {
  const { getPlanData } = useAuth();
  const planData = getPlanData();

  const createNode = (): PlanNode => ({
    id: crypto.randomUUID(),
    category: "",
    plan: "",
    billingCycle: "12",
    priceOverride: "",
    dateText: "",
    date: undefined,
  });

  const [nodes, setNodes] = useState<PlanNode[]>([createNode()]);

  const formatCurrency = (val: number) => {
    const prefix = val < 0 ? "-" : "";
    return `${prefix}NPR ${Math.abs(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getPlansForCategory = (cat: string) => {
    if (!cat || !planData[cat]) return [];
    return planData[cat].options;
  };

  const getCyclesForCategory = (cat: string) => {
    if (!cat || !planData[cat]) return [];
    return planData[cat].cycles;
  };

  const getPlanPrice = (cat: string, planName: string, cycle: string): number | null => {
    if (!cat || !planName || !cycle) return null;
    const plan = getPlansForCategory(cat).find((p: any) => p.name === planName);
    if (!plan) return null;
    if (plan.pricing) return plan.pricing[parseInt(cycle)] ?? null;
    return plan.price ?? null;
  };

  const getNodePrice = (node: PlanNode): number => {
    if (node.priceOverride) return parseFloat(node.priceOverride) || 0;
    return getPlanPrice(node.category, node.plan, node.billingCycle) ?? 0;
  };

  const calcUpgradeCost = (fromNode: PlanNode, toNode: PlanNode) => {
    const fromPrice = getNodePrice(fromNode);
    const toPrice = getNodePrice(toNode);
    if (fromPrice <= 0 || toPrice <= 0) return null;

    const fromCycle = parseInt(fromNode.billingCycle) || 12;
    const totalDays = cycleDaysMap[fromCycle] || 365;

    // Use the "to" node's date as the upgrade date, and the "from" node's date as start
    const startDate = fromNode.date;
    const upgradeDate = toNode.date;
    if (!startDate || !upgradeDate) return null;

    const diffMs = upgradeDate.getTime() - startDate.getTime();
    const usedDays = Math.max(0, Math.min(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), totalDays));
    const dailyCost = fromPrice / totalDays;
    const usedMoney = usedDays * dailyCost;
    const remaining = Math.max(0, fromPrice - usedMoney);
    const upgradeCost = toPrice - remaining;

    return { fromPrice, toPrice, totalDays, usedDays, dailyCost, usedMoney, remaining, upgradeCost };
  };

  /* ─── Node CRUD ─── */
  const addNode = () => setNodes((prev) => [...prev, createNode()]);

  const removeNode = (id: string) => {
    setNodes((prev) => {
      const filtered = prev.filter((n) => n.id !== id);
      return filtered.length === 0 ? [createNode()] : filtered;
    });
  };

  const updateNode = (id: string, patch: Partial<PlanNode>) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        const updated = { ...n, ...patch };
        if ("dateText" in patch) {
          updated.date = parseDate(patch.dateText!) ?? undefined;
        }
        if ("category" in patch && patch.category !== n.category) {
          updated.plan = "";
          const cycles = getCyclesForCategory(patch.category!);
          if (cycles.length > 0 && !cycles.includes(parseInt(updated.billingCycle))) {
            updated.billingCycle = cycles[0].toString();
          }
        }
        return updated;
      })
    );
  };

  /* ─── Calculations ─── */
  const upgrades = useMemo(() => {
    const results: ReturnType<typeof calcUpgradeCost>[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      results.push(calcUpgradeCost(nodes[i], nodes[i + 1]));
    }
    return results;
  }, [nodes, planData]);

  const grandTotal = useMemo(() => {
    return upgrades.reduce((sum, u) => sum + (u?.upgradeCost ?? 0), 0);
  }, [upgrades]);

  /* ─── PDF Export ─── */
  const exportPDF = () => {
    const pdf = new jsPDF("p", "mm", "a4");
    const pw = pdf.internal.pageSize.getWidth();

    pdf.setFillColor(30, 64, 175);
    pdf.rect(0, 0, pw, 26, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(15);
    pdf.setFont("helvetica", "bold");
    pdf.text("Plan Upgrade Chain", pw / 2, 16, { align: "center" });

    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Generated: ${new Date().toLocaleDateString("en-GB")}`, 14, 34);

    let y = 42;

    // Plan chain
    nodes.forEach((node, idx) => {
      if (y > 250) { pdf.addPage(); y = 20; }

      const price = getNodePrice(node);
      const color = nodeColors[idx % nodeColors.length];

      pdf.setFillColor(240, 240, 245);
      pdf.roundedRect(14, y, pw - 28, 18, 3, 3, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text(`Plan ${idx + 1}: ${node.plan || "Not selected"}`, 20, y + 7);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      const details = [
        node.category ? planData[node.category]?.name : "",
        cycleLabels[parseInt(node.billingCycle)] || "",
        price > 0 ? formatCurrency(price) : "",
        node.dateText ? `Date: ${node.dateText}` : "",
      ].filter(Boolean).join(" • ");
      pdf.text(details, 20, y + 14);
      y += 22;

      // Upgrade cost between this and next
      if (idx < nodes.length - 1) {
        const upgrade = upgrades[idx];
        if (upgrade) {
          pdf.setFontSize(8);
          pdf.setFont("helvetica", "normal");
          pdf.text(`  Used ${upgrade.usedDays}/${upgrade.totalDays} days • Money Back: ${formatCurrency(upgrade.remaining)}`, 22, y + 4);
          y += 6;
          
          const costColor = upgrade.upgradeCost < 0 ? [220, 50, 50] : [16, 150, 100];
          pdf.setFillColor(costColor[0], costColor[1], costColor[2]);
          pdf.roundedRect(20, y, pw - 40, 10, 2, 2, "F");
          pdf.setTextColor(255, 255, 255);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9);
          pdf.text(`Upgrade Cost: ${formatCurrency(upgrade.upgradeCost)}`, pw / 2, y + 7, { align: "center" });
          pdf.setTextColor(0, 0, 0);
          y += 14;

          // Arrow
          pdf.setFontSize(10);
          pdf.text("↓", pw / 2, y + 4, { align: "center" });
          y += 8;
        } else {
          pdf.setFontSize(8);
          pdf.setTextColor(150, 150, 150);
          pdf.text("(incomplete data for calculation)", pw / 2, y + 4, { align: "center" });
          pdf.setTextColor(0, 0, 0);
          y += 10;
        }
      }
    });

    // Grand total
    y += 4;
    if (y > 260) { pdf.addPage(); y = 20; }
    pdf.setFillColor(30, 64, 175);
    pdf.roundedRect(14, y, pw - 28, 14, 3, 3, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text(`Grand Total: ${formatCurrency(grandTotal)}`, pw / 2, y + 9, { align: "center" });

    pdf.setTextColor(128, 128, 128);
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "normal");
    pdf.text("System-generated upgrade chain document.", pw / 2, 287, { align: "center" });

    pdf.save(`upgrade-chain-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const inputClass = darkMode ? "bg-gray-700 border-gray-600 text-white" : "";

  const renderDateInput = (
    value: string,
    onChange: (v: string) => void,
    date: Date | undefined,
    onCalendarSelect: (d: Date) => void,
  ) => (
    <div className="flex gap-1">
      <Input
        placeholder="DD/MM/YYYY"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-8 text-xs", inputClass)}
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className={cn("h-8 w-8 shrink-0", darkMode ? "border-gray-600" : "")}>
            <Calendar className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarComponent
            mode="single"
            selected={date}
            onSelect={(d) => { if (d) onCalendarSelect(d); }}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );

  /* ─── Render a plan node card ─── */
  const renderPlanNode = (node: PlanNode, idx: number) => {
    const color = nodeColors[idx % nodeColors.length];
    const price = getNodePrice(node);
    const isFirst = idx === 0;
    const isLast = idx === nodes.length - 1;

    return (
      <div key={node.id} className="flex flex-col items-stretch">
        {/* Plan Card */}
        <Card className={cn(
          "relative overflow-hidden border-2 transition-all duration-200 hover:shadow-lg",
          color.border,
          darkMode ? "bg-gray-800/80" : "bg-white"
        )}>
          {/* Top accent bar */}
          <div className={cn("h-1.5 w-full", color.badge)} />

          <CardContent className="p-4 space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white", color.badge)}>
                  {idx + 1}
                </div>
                <div>
                  <p className={cn("text-xs font-semibold uppercase tracking-wider", color.text)}>
                    {isFirst ? "Starting Plan" : isLast && nodes.length > 1 ? "Final Plan" : `Plan ${idx + 1}`}
                  </p>
                  {node.plan && (
                    <p className={cn("text-sm font-bold", darkMode ? "text-white" : "text-gray-900")}>
                      {node.plan}
                    </p>
                  )}
                </div>
              </div>
              {nodes.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeNode(node.id)}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* Fields */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className={cn("text-[10px] uppercase tracking-wider", darkMode ? "text-gray-400" : "text-gray-500")}>Category</Label>
                <Select
                  value={node.category}
                  onValueChange={(v) => {
                    const cycles = getCyclesForCategory(v);
                    const defCycle = cycles.includes(12) ? "12" : cycles[0]?.toString() || "12";
                    updateNode(node.id, { category: v, plan: "", billingCycle: defCycle });
                  }}
                >
                  <SelectTrigger className={cn("h-8 text-xs", inputClass)}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(planData).map(([key, val]: [string, any]) => (
                      <SelectItem key={key} value={key}>{val.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className={cn("text-[10px] uppercase tracking-wider", darkMode ? "text-gray-400" : "text-gray-500")}>Plan</Label>
                <Select value={node.plan} onValueChange={(v) => updateNode(node.id, { plan: v })} disabled={!node.category}>
                  <SelectTrigger className={cn("h-8 text-xs", inputClass)}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {getPlansForCategory(node.category).map((p: any) => (
                      <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className={cn("text-[10px] uppercase tracking-wider", darkMode ? "text-gray-400" : "text-gray-500")}>Cycle</Label>
                <Select value={node.billingCycle} onValueChange={(v) => updateNode(node.id, { billingCycle: v })} disabled={!node.category}>
                  <SelectTrigger className={cn("h-8 text-xs", inputClass)}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {getCyclesForCategory(node.category).map((c: number) => (
                      <SelectItem key={c} value={c.toString()}>{cycleLabels[c] || `${c}mo`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className={cn("text-[10px] uppercase tracking-wider", darkMode ? "text-gray-400" : "text-gray-500")}>
                  Price Override
                </Label>
                <Input
                  type="number"
                  placeholder={price > 0 ? formatCurrency(price) : "Price"}
                  value={node.priceOverride}
                  onChange={(e) => updateNode(node.id, { priceOverride: e.target.value })}
                  className={cn("h-8 text-xs", inputClass)}
                />
              </div>
            </div>

            {/* Date */}
            <div className="space-y-1">
              <Label className={cn("text-[10px] uppercase tracking-wider", darkMode ? "text-gray-400" : "text-gray-500")}>
                {isFirst ? "Billing Start Date" : "Upgrade Date"}
              </Label>
              {renderDateInput(
                node.dateText,
                (v) => updateNode(node.id, { dateText: v }),
                node.date,
                (d) => updateNode(node.id, { dateText: formatDate(d), date: d })
              )}
            </div>

            {/* Price display */}
            {price > 0 && (
              <div className={cn("rounded-lg p-2 text-center", color.bg)}>
                <p className={cn("text-[10px] uppercase tracking-wider mb-0.5", color.text)}>Plan Price</p>
                <p className={cn("text-lg font-bold font-mono", color.text)}>{formatCurrency(price)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  /* ─── Render upgrade cost connector ─── */
  const renderUpgradeConnector = (idx: number) => {
    const upgrade = upgrades[idx];

    return (
      <div key={`conn-${idx}`} className="flex flex-col items-center py-2">
        {/* Connector line */}
        <div className="w-px h-4 bg-gradient-to-b from-muted-foreground/30 to-muted-foreground/60" />
        
        {/* Upgrade cost card */}
        <div className={cn(
          "rounded-xl border px-5 py-3 text-center shadow-sm min-w-[220px]",
          darkMode ? "bg-gray-800/60 border-gray-700" : "bg-muted/50 border-border"
        )}>
          {upgrade ? (
            <>
              <div className="flex items-center justify-center gap-2 mb-1.5">
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                <span className={cn("text-[10px] font-bold uppercase tracking-widest", darkMode ? "text-gray-400" : "text-gray-500")}>
                  Upgrade {idx + 1} → {idx + 2}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className={cn("text-xs mb-1", darkMode ? "text-gray-400" : "text-gray-500")}>
                Used {upgrade.usedDays}/{upgrade.totalDays} days • Money Back: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(upgrade.remaining)}</span>
              </div>
              <div className={cn(
                "rounded-lg px-4 py-1.5 inline-block",
                upgrade.upgradeCost < 0
                  ? "bg-red-100 dark:bg-red-900/30"
                  : "bg-emerald-100 dark:bg-emerald-900/30"
              )}>
                <span className={cn("text-xs font-semibold", darkMode ? "text-gray-400" : "text-gray-500")}>
                  Cost:{" "}
                </span>
                <AnimatedNumber
                  value={upgrade.upgradeCost}
                  className={cn(
                    "text-sm",
                    upgrade.upgradeCost < 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-emerald-700 dark:text-emerald-400"
                  )}
                />
              </div>
            </>
          ) : (
            <p className={cn("text-xs italic", darkMode ? "text-gray-500" : "text-gray-400")}>
              Fill in both plans & dates to see cost
            </p>
          )}
        </div>

        {/* Connector line */}
        <div className="w-px h-4 bg-gradient-to-b from-muted-foreground/60 to-muted-foreground/30" />
      </div>
    );
  };

  return (
    <div className="space-y-2 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className={cn("text-xl font-bold flex items-center gap-2", darkMode ? "text-white" : "text-gray-900")}>
            <Sparkles className="w-5 h-5 text-amber-500" />
            Plan Upgrade Chain
          </h2>
          <p className={cn("text-sm mt-1", darkMode ? "text-gray-400" : "text-gray-500")}>
            Start with your current plan and add upgrades. Costs are calculated between each consecutive plan.
          </p>
        </div>
        <div className="flex gap-2">
          {nodes.length > 1 && (
            <Button onClick={exportPDF} variant="outline" className={cn(darkMode ? "border-gray-600 text-gray-300 hover:bg-gray-800" : "")}>
              <Download className="w-4 h-4 mr-1" /> Export PDF
            </Button>
          )}
        </div>
      </div>

      {/* Chain visualization */}
      <div className="flex flex-col items-center max-w-lg mx-auto">
        {nodes.map((node, idx) => (
          <React.Fragment key={node.id}>
            {renderPlanNode(node, idx)}
            {idx < nodes.length - 1 && renderUpgradeConnector(idx)}
          </React.Fragment>
        ))}

        {/* Add next plan button */}
        <div className="flex flex-col items-center pt-3">
          <div className="w-px h-6 bg-gradient-to-b from-muted-foreground/30 to-transparent" />
          <Button
            onClick={addNode}
            variant="outline"
            className={cn(
              "rounded-full px-6 border-dashed border-2 hover:border-solid transition-all",
              darkMode ? "border-gray-600 hover:border-blue-500 hover:bg-blue-900/20" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"
            )}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Next Plan
          </Button>
        </div>
      </div>

      {/* Grand Total Footer */}
      {nodes.length > 1 && (
        <div className={cn(
          "fixed bottom-0 left-0 right-0 z-50 border-t shadow-2xl",
          darkMode ? "bg-gray-900 border-gray-700" : "bg-white border-border"
        )}>
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={cn("text-sm font-bold uppercase tracking-wide", darkMode ? "text-gray-300" : "text-gray-600")}>
                Grand Total
              </span>
              <span className={cn("text-xs px-2 py-0.5 rounded-full", darkMode ? "bg-gray-800 text-gray-400" : "bg-muted text-muted-foreground")}>
                {nodes.length} plans • {nodes.length - 1} upgrade{nodes.length - 1 !== 1 ? "s" : ""}
              </span>
            </div>
            <AnimatedNumber
              value={grandTotal}
              className={cn(
                "text-2xl",
                grandTotal < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingLedger;
