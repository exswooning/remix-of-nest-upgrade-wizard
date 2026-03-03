import React, { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, Plus, X, ArrowDown, ChevronDown, Sparkles, Download, FileSpreadsheet } from "lucide-react";
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

  /* ─── Excel-style PDF Export ─── */
  const exportPDF = () => {
    const pdf = new jsPDF("l", "mm", "a4"); // landscape for table
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const tableW = pw - margin * 2;

    // Colors
    const headerBg = [37, 99, 235]; // blue-600
    const altRowBg = [241, 245, 249]; // slate-100
    const borderColor = [203, 213, 225]; // slate-300
    const successBg = [220, 252, 231]; // green-100
    const dangerBg = [254, 226, 226]; // red-100
    const totalBg = [30, 58, 138]; // blue-900

    // ─── Title area ───
    pdf.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
    pdf.rect(0, 0, pw, 18, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(13);
    pdf.setFont("helvetica", "bold");
    pdf.text("PLAN UPGRADE CHAIN — BILLING LEDGER", pw / 2, 12, { align: "center" });

    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Generated: ${new Date().toLocaleDateString("en-GB")} at ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`, margin, 26);
    pdf.text(`Total Plans: ${nodes.length} | Upgrades: ${nodes.length - 1}`, pw - margin, 26, { align: "right" });

    let y = 32;

    // ─── SECTION 1: Plan Details Table ───
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(30, 58, 138);
    pdf.text("PLAN DETAILS", margin, y);
    y += 4;

    // Table headers
    const planCols = [
      { label: "#", w: 8 },
      { label: "Plan Name", w: 50 },
      { label: "Category", w: 45 },
      { label: "Billing Cycle", w: 30 },
      { label: "Plan Price", w: 35 },
      { label: "Date", w: 28 },
      { label: "Role", w: 30 },
    ];
    const planTableW = planCols.reduce((s, c) => s + c.w, 0);

    // Draw header row
    let x = margin;
    const rowH = 8;
    pdf.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
    pdf.rect(margin, y, planTableW, rowH, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "bold");
    planCols.forEach((col) => {
      pdf.text(col.label, x + 2, y + 5.5);
      x += col.w;
    });
    y += rowH;

    // Draw data rows
    nodes.forEach((node, idx) => {
      if (y > ph - 25) { pdf.addPage(); y = 15; }

      const isAlt = idx % 2 === 1;
      if (isAlt) {
        pdf.setFillColor(altRowBg[0], altRowBg[1], altRowBg[2]);
        pdf.rect(margin, y, planTableW, rowH, "F");
      }

      // Border
      pdf.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      pdf.rect(margin, y, planTableW, rowH, "S");

      const price = getNodePrice(node);
      const isFirst = idx === 0;
      const isLast = idx === nodes.length - 1 && nodes.length > 1;

      const rowData = [
        `${idx + 1}`,
        node.plan || "—",
        node.category ? (planData[node.category]?.name || node.category) : "—",
        cycleLabels[parseInt(node.billingCycle)] || "—",
        price > 0 ? formatCurrency(price) : "—",
        node.dateText || "—",
        isFirst ? "Starting Plan" : isLast ? "Final Plan" : `Step ${idx + 1}`,
      ];

      x = margin;
      pdf.setTextColor(30, 41, 59);
      pdf.setFontSize(7);
      pdf.setFont("helvetica", "normal");
      planCols.forEach((col, ci) => {
        const text = rowData[ci];
        if (ci === 4 && price > 0) {
          pdf.setFont("helvetica", "bold");
        }
        pdf.text(text, x + 2, y + 5.5, { maxWidth: col.w - 4 });
        pdf.setFont("helvetica", "normal");
        // Column borders
        if (ci > 0) {
          pdf.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
          pdf.line(x, y, x, y + rowH);
        }
        x += col.w;
      });
      y += rowH;
    });

    y += 8;

    // ─── SECTION 2: Upgrade Calculations Table ───
    if (nodes.length > 1) {
      if (y > ph - 50) { pdf.addPage(); y = 15; }

      pdf.setFontSize(9);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(30, 58, 138);
      pdf.text("UPGRADE CALCULATIONS", margin, y);
      y += 4;

      const upgCols = [
        { label: "Upgrade", w: 14 },
        { label: "From Plan", w: 38 },
        { label: "From Price", w: 28 },
        { label: "To Plan", w: 38 },
        { label: "To Price", w: 28 },
        { label: "Days Used", w: 22 },
        { label: "Total Days", w: 22 },
        { label: "Used Amount", w: 30 },
        { label: "Money Back", w: 30 },
        { label: "Upgrade Cost", w: 32 },
      ];
      const upgTableW = upgCols.reduce((s, c) => s + c.w, 0);

      // Header
      x = margin;
      pdf.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
      pdf.rect(margin, y, upgTableW, rowH, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(6.5);
      pdf.setFont("helvetica", "bold");
      upgCols.forEach((col) => {
        pdf.text(col.label, x + 1.5, y + 5.5);
        x += col.w;
      });
      y += rowH;

      // Upgrade rows
      for (let i = 0; i < nodes.length - 1; i++) {
        if (y > ph - 25) { pdf.addPage(); y = 15; }

        const upgrade = upgrades[i];
        const fromNode = nodes[i];
        const toNode = nodes[i + 1];
        const isAlt = i % 2 === 1;

        if (upgrade) {
          const costBg = upgrade.upgradeCost < 0 ? dangerBg : successBg;
          if (isAlt) {
            pdf.setFillColor(altRowBg[0], altRowBg[1], altRowBg[2]);
          } else {
            pdf.setFillColor(255, 255, 255);
          }
          pdf.rect(margin, y, upgTableW, rowH, "F");
          pdf.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
          pdf.rect(margin, y, upgTableW, rowH, "S");

          const upgRowData = [
            `${i + 1} → ${i + 2}`,
            fromNode.plan || "—",
            formatCurrency(upgrade.fromPrice),
            toNode.plan || "—",
            formatCurrency(upgrade.toPrice),
            `${upgrade.usedDays}`,
            `${upgrade.totalDays}`,
            formatCurrency(upgrade.usedMoney),
            formatCurrency(upgrade.remaining),
            formatCurrency(upgrade.upgradeCost),
          ];

          x = margin;
          pdf.setTextColor(30, 41, 59);
          pdf.setFontSize(6.5);
          pdf.setFont("helvetica", "normal");
          upgCols.forEach((col, ci) => {
            // Highlight the cost cell
            if (ci === 9) {
              pdf.setFillColor(costBg[0], costBg[1], costBg[2]);
              pdf.rect(x, y, col.w, rowH, "F");
              pdf.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
              pdf.rect(x, y, col.w, rowH, "S");
              pdf.setFont("helvetica", "bold");
              pdf.setTextColor(upgrade.upgradeCost < 0 ? 185 : 22, upgrade.upgradeCost < 0 ? 28 : 101, upgrade.upgradeCost < 0 ? 28 : 52);
            }
            // Money back highlight
            if (ci === 8) {
              pdf.setFont("helvetica", "bold");
              pdf.setTextColor(22, 101, 52);
            }
            pdf.text(upgRowData[ci], x + 1.5, y + 5.5, { maxWidth: col.w - 3 });
            pdf.setFont("helvetica", "normal");
            pdf.setTextColor(30, 41, 59);
            if (ci > 0) {
              pdf.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
              pdf.line(x, y, x, y + rowH);
            }
            x += col.w;
          });
          y += rowH;
        } else {
          pdf.setFillColor(255, 255, 255);
          pdf.rect(margin, y, upgTableW, rowH, "F");
          pdf.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
          pdf.rect(margin, y, upgTableW, rowH, "S");
          pdf.setTextColor(148, 163, 184);
          pdf.setFontSize(7);
          pdf.text(`${i + 1} → ${i + 2}`, margin + 2, y + 5.5);
          pdf.text("Incomplete data — fill in both plans and dates", margin + 60, y + 5.5);
          y += rowH;
        }
      }

      // Grand total row
      y += 1;
      pdf.setFillColor(totalBg[0], totalBg[1], totalBg[2]);
      pdf.rect(margin, y, upgTableW, 10, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "bold");
      pdf.text("GRAND TOTAL", margin + 4, y + 7);
      pdf.text(formatCurrency(grandTotal), margin + upgTableW - 4, y + 7, { align: "right" });
      y += 14;
    }

    // ─── Footer ───
    pdf.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    pdf.line(margin, ph - 12, pw - margin, ph - 12);
    pdf.setTextColor(148, 163, 184);
    pdf.setFontSize(6.5);
    pdf.setFont("helvetica", "normal");
    pdf.text("Auto-generated billing ledger • Plan Upgrade Chain Calculator", margin, ph - 8);
    pdf.text(`Page 1 of ${pdf.getNumberOfPages()}`, pw - margin, ph - 8, { align: "right" });

    pdf.save(`billing-ledger-${new Date().toISOString().split("T")[0]}.pdf`);
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
    const price = getNodePrice(node);
    const isFirst = idx === 0;
    const isLast = idx === nodes.length - 1 && nodes.length > 1;

    return (
      <div key={node.id} className="w-full">
        <Card className={cn(
          "relative overflow-hidden transition-all duration-200 hover:shadow-md",
          darkMode
            ? "bg-card border-border"
            : "bg-card border-border"
        )}>
          <CardContent className="p-0">
            {/* Card Header */}
            <div className={cn(
              "flex items-center justify-between px-4 py-2.5 border-b",
              darkMode ? "bg-muted/30 border-border" : "bg-muted/50 border-border"
            )}>
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold text-primary-foreground",
                  isFirst ? "bg-blue-600" : isLast ? "bg-emerald-600" : "bg-violet-600"
                )}>
                  {idx + 1}
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm font-semibold", darkMode ? "text-foreground" : "text-foreground")}>
                    {isFirst ? "Starting Plan" : isLast ? "Final Plan" : `Plan ${idx + 1}`}
                  </span>
                  {node.plan && (
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-md font-medium",
                      darkMode ? "bg-primary/10 text-primary" : "bg-primary/5 text-primary"
                    )}>
                      {node.plan}
                    </span>
                  )}
                </div>
              </div>
              {nodes.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeNode(node.id)}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            {/* Card Body */}
            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Category */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Category</Label>
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

                {/* Plan */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Plan</Label>
                  <Select value={node.plan} onValueChange={(v) => updateNode(node.id, { plan: v })} disabled={!node.category}>
                    <SelectTrigger className={cn("h-8 text-xs", inputClass)}><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {getPlansForCategory(node.category).map((p: any) => (
                        <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Cycle */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Cycle</Label>
                  <Select value={node.billingCycle} onValueChange={(v) => updateNode(node.id, { billingCycle: v })} disabled={!node.category}>
                    <SelectTrigger className={cn("h-8 text-xs", inputClass)}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {getCyclesForCategory(node.category).map((c: number) => (
                        <SelectItem key={c} value={c.toString()}>{cycleLabels[c] || `${c}mo`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    {isFirst ? "Start Date" : "Upgrade Date"}
                  </Label>
                  {renderDateInput(
                    node.dateText,
                    (v) => updateNode(node.id, { dateText: v }),
                    node.date,
                    (d) => updateNode(node.id, { dateText: formatDate(d), date: d })
                  )}
                </div>
              </div>

              {/* Price row */}
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Price Override</Label>
                  <Input
                    type="number"
                    placeholder={price > 0 ? `Auto: ${formatCurrency(price)}` : "Enter price"}
                    value={node.priceOverride}
                    onChange={(e) => updateNode(node.id, { priceOverride: e.target.value })}
                    className={cn("h-8 text-xs", inputClass)}
                  />
                </div>
                {price > 0 && (
                  <div className={cn(
                    "px-4 py-2 rounded-lg text-center min-w-[130px]",
                    darkMode ? "bg-muted/50" : "bg-muted/70"
                  )}>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Price</p>
                    <p className={cn("text-base font-bold font-mono", darkMode ? "text-foreground" : "text-foreground")}>
                      {formatCurrency(price)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  /* ─── Render upgrade cost connector ─── */
  const renderUpgradeConnector = (idx: number) => {
    const upgrade = upgrades[idx];
    const fromNode = nodes[idx];
    const toNode = nodes[idx + 1];

    return (
      <div key={`conn-${idx}`} className="flex flex-col items-center w-full py-1">
        {/* Top line */}
        <div className={cn(
          "w-0.5 h-3 rounded-full",
          darkMode ? "bg-muted-foreground/20" : "bg-border"
        )} />

        {/* Connector card */}
        <div className={cn(
          "w-full max-w-md rounded-lg border px-4 py-2.5 relative",
          darkMode ? "bg-muted/20 border-border" : "bg-muted/40 border-border"
        )}>
          {upgrade ? (
            <div className="space-y-1.5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ArrowDown className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Upgrade {idx + 1} → {idx + 2}
                  </span>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase">Used</p>
                  <p className={cn("text-xs font-semibold font-mono", darkMode ? "text-foreground" : "text-foreground")}>
                    {upgrade.usedDays}/{upgrade.totalDays} days
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase">Money Back</p>
                  <p className="text-xs font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(upgrade.remaining)}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase">Cost</p>
                  <AnimatedNumber
                    value={upgrade.upgradeCost}
                    className={cn(
                      "text-xs",
                      upgrade.upgradeCost < 0
                        ? "text-destructive"
                        : "text-emerald-600 dark:text-emerald-400"
                    )}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-1">
              <ArrowDown className="w-3 h-3 text-muted-foreground/50" />
              <p className="text-xs italic text-muted-foreground">
                Fill in both plans & dates to calculate
              </p>
            </div>
          )}
        </div>

        {/* Bottom line */}
        <div className={cn(
          "w-0.5 h-3 rounded-full",
          darkMode ? "bg-muted-foreground/20" : "bg-border"
        )} />
      </div>
    );
  };

  return (
    <div className="space-y-2 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Plan Upgrade Chain
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Build your upgrade path. Costs auto-calculate between each consecutive plan.
          </p>
        </div>
        <div className="flex gap-2">
          {nodes.length > 1 && (
            <Button onClick={exportPDF} variant="outline" size="sm" className="gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export PDF
            </Button>
          )}
        </div>
      </div>

      {/* Chain */}
      <div className="flex flex-col items-center max-w-xl mx-auto gap-0">
        {nodes.map((node, idx) => (
          <React.Fragment key={node.id}>
            {renderPlanNode(node, idx)}
            {idx < nodes.length - 1 && renderUpgradeConnector(idx)}
          </React.Fragment>
        ))}

        {/* Add button */}
        <div className="flex flex-col items-center pt-2">
          <div className={cn(
            "w-0.5 h-5 rounded-full",
            darkMode ? "bg-muted-foreground/20" : "bg-border"
          )} />
          <Button
            onClick={addNode}
            variant="outline"
            size="sm"
            className="rounded-full px-5 border-dashed border-2 gap-1.5 hover:border-solid transition-all text-muted-foreground hover:text-foreground"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Next Plan
          </Button>
        </div>
      </div>

      {/* Grand Total Footer */}
      {nodes.length > 1 && (
        <div className={cn(
          "fixed bottom-0 left-0 right-0 z-50 border-t shadow-xl backdrop-blur-sm",
          darkMode ? "bg-background/95 border-border" : "bg-background/95 border-border"
        )}>
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Grand Total
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                {nodes.length} plans · {nodes.length - 1} upgrade{nodes.length - 1 !== 1 ? "s" : ""}
              </span>
            </div>
            <AnimatedNumber
              value={grandTotal}
              className={cn(
                "text-xl",
                grandTotal < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingLedger;
