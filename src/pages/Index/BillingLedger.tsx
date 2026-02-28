import React, { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, Plus, X, ArrowRight, ArrowDown, Package, Sparkles, ChevronDown, ChevronUp, Trash2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseDate, formatDate } from "./dateUtils";
import { useAuth } from "@/contexts/AuthContext";
import jsPDF from "jspdf";

/* ─── Types ─── */
interface UpgradeStep {
  id: string;
  upgradeDateText: string;
  upgradeDate: Date | undefined;
  // For step 1 only: manual source products
  sourceProducts: SourceProduct[];
  // Target plan (becomes source of next step)
  targetCategory: string;
  targetPlan: string;
  targetBillingCycle: string;
  targetPriceOverride: string;
  collapsed: boolean;
}

interface SourceProduct {
  id: string;
  category: string;
  plan: string;
  billingCycle: string;
  billingStartDateText: string;
  billingStartDate: Date | undefined;
  priceOverride: string;
}

interface BillingLedgerProps {
  darkMode: boolean;
}

const cycleLabels: Record<number, string> = {
  1: "Monthly",
  12: "Annually",
  36: "3 Years",
};

const cycleDays: Record<number, number> = {
  1: 30,
  6: 180,
  12: 365,
  36: 1095,
};

const tileColors = [
  { bg: "bg-blue-100 dark:bg-blue-900/40", border: "border-blue-300 dark:border-blue-700", text: "text-blue-700 dark:text-blue-300", accent: "text-blue-600 dark:text-blue-400" },
  { bg: "bg-purple-100 dark:bg-purple-900/40", border: "border-purple-300 dark:border-purple-700", text: "text-purple-700 dark:text-purple-300", accent: "text-purple-600 dark:text-purple-400" },
  { bg: "bg-amber-100 dark:bg-amber-900/40", border: "border-amber-300 dark:border-amber-700", text: "text-amber-700 dark:text-amber-300", accent: "text-amber-600 dark:text-amber-400" },
  { bg: "bg-rose-100 dark:bg-rose-900/40", border: "border-rose-300 dark:border-rose-700", text: "text-rose-700 dark:text-rose-300", accent: "text-rose-600 dark:text-rose-400" },
  { bg: "bg-teal-100 dark:bg-teal-900/40", border: "border-teal-300 dark:border-teal-700", text: "text-teal-700 dark:text-teal-300", accent: "text-teal-600 dark:text-teal-400" },
  { bg: "bg-indigo-100 dark:bg-indigo-900/40", border: "border-indigo-300 dark:border-indigo-700", text: "text-indigo-700 dark:text-indigo-300", accent: "text-indigo-600 dark:text-indigo-400" },
];

/* ─── Animated number ─── */
const AnimatedNumber: React.FC<{ value: number; darkMode: boolean; className?: string }> = ({ value, darkMode, className }) => {
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

  return (
    <span className={cn(
      "font-mono font-bold transition-colors duration-300",
      value < 0
        ? darkMode ? "text-red-400" : "text-red-600"
        : darkMode ? "text-emerald-400" : "text-emerald-700",
      className
    )}>
      {formatted}
    </span>
  );
};

/* ─── Component ─── */
const BillingLedger: React.FC<BillingLedgerProps> = ({ darkMode }) => {
  const { getPlanData } = useAuth();
  const planData = getPlanData();
  const [steps, setSteps] = useState<UpgradeStep[]>([]);

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

  const calcCredit = (price: number, billingStartDate: Date, upgradeDate: Date, cycleDaysVal: number) => {
    const diffMs = upgradeDate.getTime() - billingStartDate.getTime();
    const usedDays = Math.max(0, Math.min(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), cycleDaysVal));
    const dailyCost = price / cycleDaysVal;
    const usedMoney = usedDays * dailyCost;
    const remaining = Math.max(0, price - usedMoney);
    return { price, totalDays: cycleDaysVal, usedDays, dailyCost, usedMoney, remaining };
  };

  const calcSourceCredit = (src: SourceProduct, upgradeDate: Date | undefined) => {
    if (!upgradeDate || !src.billingStartDate) return null;
    const price = src.priceOverride
      ? parseFloat(src.priceOverride)
      : getPlanPrice(src.category, src.plan, src.billingCycle);
    if (!price || price <= 0) return null;
    const cycle = parseInt(src.billingCycle) || 12;
    const totalDays = cycleDays[cycle] || 365;
    return calcCredit(price, src.billingStartDate, upgradeDate, totalDays);
  };

  // Get the summary for a step, considering chaining
  const getStepSummary = (stepIdx: number) => {
    const step = steps[stepIdx];
    const targetPrice = step.targetPriceOverride
      ? parseFloat(step.targetPriceOverride)
      : getPlanPrice(step.targetCategory, step.targetPlan, step.targetBillingCycle) ?? 0;

    if (stepIdx === 0) {
      // First step: manual source products
      const credits = step.sourceProducts.map((src) => {
        const calc = calcSourceCredit(src, step.upgradeDate);
        return { label: src.plan || "Unnamed", calc };
      });
      const totalCredit = credits.reduce((sum, c) => sum + (c.calc?.remaining ?? 0), 0);
      const netCost = targetPrice - totalCredit;
      return { credits, totalCredit, targetPrice, netCost, prevPlanLabel: null, prevPlanCredit: null };
    } else {
      // Chained step: source is the previous step's target
      const prevStep = steps[stepIdx - 1];
      const prevPrice = prevStep.targetPriceOverride
        ? parseFloat(prevStep.targetPriceOverride)
        : getPlanPrice(prevStep.targetCategory, prevStep.targetPlan, prevStep.targetBillingCycle) ?? 0;
      const prevLabel = prevStep.targetPlan || "Previous Plan";
      const prevCycle = parseInt(prevStep.targetBillingCycle) || 12;
      const prevTotalDays = cycleDays[prevCycle] || 365;

      // The previous plan's start date is the previous upgrade date
      const prevStartDate = prevStep.upgradeDate;
      let prevCredit: ReturnType<typeof calcCredit> | null = null;

      if (prevPrice > 0 && prevStartDate && step.upgradeDate) {
        prevCredit = calcCredit(prevPrice, prevStartDate, step.upgradeDate, prevTotalDays);
      }

      // Also include any manual source products for this step
      const manualCredits = step.sourceProducts.map((src) => {
        const calc = calcSourceCredit(src, step.upgradeDate);
        return { label: src.plan || "Unnamed", calc };
      });

      const totalCredit = (prevCredit?.remaining ?? 0) + manualCredits.reduce((sum, c) => sum + (c.calc?.remaining ?? 0), 0);
      const netCost = targetPrice - totalCredit;
      return { credits: manualCredits, totalCredit, targetPrice, netCost, prevPlanLabel: prevLabel, prevPlanCredit: prevCredit };
    }
  };

  /* ─── Step CRUD ─── */
  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        upgradeDateText: "",
        upgradeDate: undefined,
        sourceProducts: [],
        targetCategory: "",
        targetPlan: "",
        targetBillingCycle: "12",
        targetPriceOverride: "",
        collapsed: false,
      },
    ]);
  };

  const removeStep = (id: string) => setSteps((prev) => prev.filter((e) => e.id !== id));

  const toggleCollapse = (id: string) => {
    setSteps((prev) => prev.map((e) => e.id === id ? { ...e, collapsed: !e.collapsed } : e));
  };

  const updateStep = (id: string, patch: Partial<UpgradeStep>) => {
    setSteps((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const updated = { ...e, ...patch };
        if ("upgradeDateText" in patch) {
          const parsed = parseDate(patch.upgradeDateText!);
          updated.upgradeDate = parsed ?? undefined;
        }
        return updated;
      })
    );
  };

  const addSourceProduct = (stepId: string) => {
    setSteps((prev) =>
      prev.map((e) => {
        if (e.id !== stepId) return e;
        return {
          ...e,
          sourceProducts: [
            ...e.sourceProducts,
            {
              id: crypto.randomUUID(),
              category: "",
              plan: "",
              billingCycle: "12",
              billingStartDateText: "",
              billingStartDate: undefined,
              priceOverride: "",
            },
          ],
        };
      })
    );
  };

  const removeSourceProduct = (stepId: string, srcId: string) => {
    setSteps((prev) =>
      prev.map((e) => {
        if (e.id !== stepId) return e;
        return { ...e, sourceProducts: e.sourceProducts.filter((s) => s.id !== srcId) };
      })
    );
  };

  const updateSourceProduct = (stepId: string, srcId: string, patch: Partial<SourceProduct>) => {
    setSteps((prev) =>
      prev.map((e) => {
        if (e.id !== stepId) return e;
        return {
          ...e,
          sourceProducts: e.sourceProducts.map((s) => {
            if (s.id !== srcId) return s;
            const updated = { ...s, ...patch };
            if ("billingStartDateText" in patch) {
              const parsed = parseDate(patch.billingStartDateText!);
              updated.billingStartDate = parsed ?? undefined;
            }
            if ("category" in patch && patch.category !== s.category) {
              updated.plan = "";
              const cycles = getCyclesForCategory(patch.category!);
              if (cycles.length > 0 && !cycles.includes(parseInt(updated.billingCycle))) {
                updated.billingCycle = cycles[0].toString();
              }
            }
            return updated;
          }),
        };
      })
    );
  };

  const grandTotal = useMemo(() => {
    return steps.reduce((sum, _, idx) => sum + getStepSummary(idx).netCost, 0);
  }, [steps, planData]);

  /* ─── PDF Export ─── */
  const exportChainPDF = () => {
    const pdf = new jsPDF("p", "mm", "a4");
    const pw = pdf.internal.pageSize.getWidth();

    // Header
    pdf.setFillColor(59, 130, 246);
    pdf.rect(0, 0, pw, 28, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.text("Plan Upgrade Pipeline", pw / 2, 17, { align: "center" });
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Generated: ${new Date().toLocaleDateString("en-GB")}`, 14, 36);

    let y = 44;

    steps.forEach((step, idx) => {
      const summary = getStepSummary(idx);

      // Check page overflow
      if (y > 240) {
        pdf.addPage();
        y = 20;
      }

      // Step header
      pdf.setFillColor(229, 231, 235);
      pdf.rect(14, y, pw - 28, 9, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Upgrade ${idx + 1}${step.upgradeDate ? ` — ${step.upgradeDateText}` : ""}`, 18, y + 6);
      y += 12;

      // Trading In section
      if (idx === 0 && step.sourceProducts.length > 0) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.text("Trading In:", 18, y + 5);
        y += 8;
        pdf.setFont("helvetica", "normal");
        step.sourceProducts.forEach((src) => {
          const credit = calcSourceCredit(src, step.upgradeDate);
          const label = src.plan || "Unnamed";
          const creditStr = credit ? formatCurrency(credit.remaining) : "—";
          pdf.text(`• ${label} → Money Back: ${creditStr}`, 22, y + 5);
          y += 7;
        });
      }

      // Chained source
      if (idx > 0 && summary.prevPlanLabel) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.text("Trading In (from previous upgrade):", 18, y + 5);
        y += 8;
        pdf.setFont("helvetica", "normal");
        const creditStr = summary.prevPlanCredit ? formatCurrency(summary.prevPlanCredit.remaining) : "—";
        pdf.text(`• ${summary.prevPlanLabel} → Money Back: ${creditStr}`, 22, y + 5);
        y += 7;

        // Additional manual sources
        if (step.sourceProducts.length > 0) {
          pdf.text("Additional plans trading in:", 18, y + 5);
          y += 7;
          step.sourceProducts.forEach((src) => {
            const credit = calcSourceCredit(src, step.upgradeDate);
            const label = src.plan || "Unnamed";
            const creditStr2 = credit ? formatCurrency(credit.remaining) : "—";
            pdf.text(`• ${label} → Money Back: ${creditStr2}`, 22, y + 5);
            y += 7;
          });
        }
      }

      // Target
      pdf.setFont("helvetica", "bold");
      pdf.text(`New Plan: ${step.targetPlan || "—"} (${formatCurrency(summary.targetPrice)})`, 18, y + 5);
      y += 8;

      // Net cost
      pdf.setFillColor(summary.netCost < 0 ? 239 : 16, summary.netCost < 0 ? 68 : 185, summary.netCost < 0 ? 68 : 129);
      pdf.rect(14, y, pw - 28, 10, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(10);
      pdf.text(`Total to Pay: ${formatCurrency(summary.netCost)}`, 18, y + 7);
      pdf.setTextColor(0, 0, 0);
      y += 16;
    });

    // Grand total
    if (y > 250) { pdf.addPage(); y = 20; }
    pdf.setFillColor(30, 64, 175);
    pdf.rect(14, y, pw - 28, 14, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text(`Grand Total: ${formatCurrency(grandTotal)}`, pw / 2, y + 9, { align: "center" });

    // Footer
    pdf.setTextColor(128, 128, 128);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text("System-generated upgrade pipeline document.", pw / 2, 285, { align: "center" });

    pdf.save(`upgrade-pipeline-${new Date().toISOString().split("T")[0]}.pdf`);
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

  const renderSourceTile = (step: UpgradeStep, src: SourceProduct, srcIdx: number) => {
    const credit = calcSourceCredit(src, step.upgradeDate);
    const color = tileColors[srcIdx % tileColors.length];
    return (
      <div
        key={src.id}
        className={cn("rounded-xl border-2 p-3 transition-all duration-300", color.bg, color.border)}
      >
        <div className="flex items-start justify-between mb-2">
          <span className={cn("text-xs font-bold uppercase tracking-wider", color.text)}>
            Plan #{srcIdx + 1}
          </span>
          <button
            onClick={() => removeSourceProduct(step.id, src.id)}
            className="text-gray-400 hover:text-red-500 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={src.category} onValueChange={(v) => updateSourceProduct(step.id, src.id, { category: v })}>
            <SelectTrigger className={cn("h-7 text-xs", inputClass)}><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              {Object.entries(planData).map(([key, val]: [string, any]) => (
                <SelectItem key={key} value={key}>{val.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={src.plan} onValueChange={(v) => updateSourceProduct(step.id, src.id, { plan: v })} disabled={!src.category}>
            <SelectTrigger className={cn("h-7 text-xs", inputClass)}><SelectValue placeholder="Plan" /></SelectTrigger>
            <SelectContent>
              {getPlansForCategory(src.category).map((p: any) => (
                <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={src.billingCycle} onValueChange={(v) => updateSourceProduct(step.id, src.id, { billingCycle: v })} disabled={!src.category}>
            <SelectTrigger className={cn("h-7 text-xs", inputClass)}><SelectValue /></SelectTrigger>
            <SelectContent>
              {getCyclesForCategory(src.category).map((c: number) => (
                <SelectItem key={c} value={c.toString()}>{cycleLabels[c] || `${c}mo`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            placeholder="Price override"
            value={src.priceOverride}
            onChange={(e) => updateSourceProduct(step.id, src.id, { priceOverride: e.target.value })}
            className={cn("h-7 text-xs", inputClass)}
          />
        </div>
        <div className="mt-2">
          <Label className={cn("text-xs", color.text)}>Started</Label>
          {renderDateInput(
            src.billingStartDateText,
            (v) => updateSourceProduct(step.id, src.id, { billingStartDateText: v }),
            src.billingStartDate,
            (d) => updateSourceProduct(step.id, src.id, { billingStartDateText: formatDate(d), billingStartDate: d })
          )}
        </div>
        {credit && (
          <div className={cn("mt-2 rounded-lg p-2 text-xs", darkMode ? "bg-black/20" : "bg-white/70")}>
            <div className="flex justify-between">
              <span className={darkMode ? "text-gray-400" : "text-gray-500"}>
                Used {credit.usedDays}/{credit.totalDays} days
              </span>
              <span className={cn("font-bold", color.accent)}>
                Money Back: {formatCurrency(credit.remaining)}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className={cn("text-xl font-bold flex items-center gap-2", darkMode ? "text-white" : "text-gray-900")}>
            <Sparkles className="w-5 h-5 text-amber-500" />
            Plan Upgrade Chain
          </h2>
          <p className={cn("text-sm mt-1", darkMode ? "text-gray-400" : "text-gray-500")}>
            Chain upgrades: Plan 1 → Plan 2 → Plan 3 → … Each new plan feeds into the next.
          </p>
        </div>
        <div className="flex gap-2">
          {steps.length > 0 && (
            <Button onClick={exportChainPDF} variant="outline" className={cn(darkMode ? "border-gray-600 text-gray-300 hover:bg-gray-800" : "")}>
              <Download className="w-4 h-4 mr-1" /> Export PDF
            </Button>
          )}
          <Button onClick={addStep} className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg">
            <Plus className="w-4 h-4 mr-1" /> Add Upgrade Step
          </Button>
        </div>
      </div>

      {/* Chain */}
      {steps.map((step, idx) => {
        const summary = getStepSummary(idx);
        const isFirst = idx === 0;
        const prevStep = idx > 0 ? steps[idx - 1] : null;

        return (
          <React.Fragment key={step.id}>
            {/* Chain connector between steps */}
            {idx > 0 && (
              <div className="flex justify-center py-1">
                <div className={cn(
                  "flex flex-col items-center gap-1",
                  darkMode ? "text-gray-500" : "text-gray-400"
                )}>
                  <div className="w-px h-4 bg-gradient-to-b from-emerald-500 to-blue-500" />
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-emerald-500 to-blue-600 text-white shadow-md">
                    <ArrowDown className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest">feeds into</span>
                  <div className="w-px h-4 bg-gradient-to-b from-blue-500 to-emerald-500" />
                </div>
              </div>
            )}

            <Card className={cn(
              "overflow-hidden transition-all duration-200",
              darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
            )}>
              {/* Step header */}
              <div
                className={cn(
                  "flex items-center justify-between px-4 py-3 cursor-pointer select-none border-b",
                  darkMode ? "bg-gray-900/60 border-gray-700 hover:bg-gray-900/80" : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                )}
                onClick={() => toggleCollapse(step.id)}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-blue-600 text-white">
                    {idx + 1}
                  </div>
                  <span className={cn("text-sm font-bold", darkMode ? "text-white" : "text-gray-800")}>
                    Upgrade {idx + 1}
                  </span>

                  {/* Show chain info */}
                  {!isFirst && prevStep?.targetPlan && (
                    <span className={cn("text-xs px-2 py-0.5 rounded-full", darkMode ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-100 text-emerald-700")}>
                      From: {prevStep.targetPlan}
                    </span>
                  )}
                  {step.targetPlan && (
                    <span className={cn("text-xs px-2 py-0.5 rounded-full", darkMode ? "bg-blue-900/40 text-blue-400" : "bg-blue-100 text-blue-700")}>
                      To: {step.targetPlan}
                    </span>
                  )}

                  {step.collapsed && summary.targetPrice > 0 && (
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-mono font-semibold",
                      summary.netCost < 0
                        ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                    )}>
                      Pay: {formatCurrency(summary.netCost)}
                    </span>
                  )}

                  {/* Date picker */}
                  <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                    <Label className={cn("text-xs", darkMode ? "text-gray-400" : "text-gray-500")}>Date:</Label>
                    {renderDateInput(
                      step.upgradeDateText,
                      (v) => updateStep(step.id, { upgradeDateText: v }),
                      step.upgradeDate,
                      (d) => updateStep(step.id, { upgradeDateText: formatDate(d), upgradeDate: d })
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); removeStep(step.id); }}
                    className="text-destructive hover:text-destructive h-7 w-7 p-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  {step.collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>

              {/* Body */}
              {!step.collapsed && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-0">
                  {/* ─── LEFT: Trading In ─── */}
                  <div className={cn("p-4 space-y-3", darkMode ? "bg-gray-800/50" : "bg-slate-50/50")}>
                    <div className="flex items-center justify-between">
                      <h3 className={cn("text-sm font-bold uppercase tracking-wide", darkMode ? "text-gray-300" : "text-gray-600")}>
                        🔄 Trading In
                      </h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addSourceProduct(step.id)}
                        className={cn("h-7 text-xs", darkMode ? "border-gray-600" : "")}
                      >
                        <Plus className="w-3 h-3 mr-1" /> {isFirst ? "Add Old Plan" : "Add Extra Plan"}
                      </Button>
                    </div>

                    {/* Chained source tile (auto from previous) */}
                    {!isFirst && prevStep?.targetPlan && (
                      <div className={cn(
                        "rounded-xl border-2 p-3 border-dashed",
                        darkMode ? "bg-emerald-900/20 border-emerald-700" : "bg-emerald-50 border-emerald-300"
                      )}>
                        <div className="flex items-center gap-2 mb-1">
                          <ArrowDown className="w-3 h-3 text-emerald-500" />
                          <span className={cn("text-xs font-bold uppercase tracking-wider", darkMode ? "text-emerald-400" : "text-emerald-700")}>
                            From Previous Upgrade
                          </span>
                        </div>
                        <p className={cn("text-sm font-semibold", darkMode ? "text-white" : "text-gray-800")}>
                          {prevStep.targetPlan}
                          <span className={cn("text-xs ml-2 font-normal", darkMode ? "text-gray-400" : "text-gray-500")}>
                            {prevStep.targetCategory && planData[prevStep.targetCategory]?.name}
                          </span>
                        </p>
                        {summary.prevPlanCredit && (
                          <div className={cn("mt-2 rounded-lg p-2 text-xs", darkMode ? "bg-black/20" : "bg-white/70")}>
                            <div className="flex justify-between">
                              <span className={darkMode ? "text-gray-400" : "text-gray-500"}>
                                Used {summary.prevPlanCredit.usedDays}/{summary.prevPlanCredit.totalDays} days
                              </span>
                              <span className={cn("font-bold", darkMode ? "text-emerald-400" : "text-emerald-600")}>
                                Money Back: {formatCurrency(summary.prevPlanCredit.remaining)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Manual source products */}
                    {isFirst && step.sourceProducts.length === 0 && (
                      <div className={cn(
                        "flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed",
                        darkMode ? "border-gray-600 text-gray-500" : "border-gray-300 text-gray-400"
                      )}>
                        <Package className="w-8 h-8 mb-2 opacity-40" />
                        <p className="text-xs font-medium">No old plans added yet</p>
                        <p className="text-xs opacity-60">Click "Add Old Plan" to trade in</p>
                      </div>
                    )}

                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                      {step.sourceProducts.map((src, srcIdx) => renderSourceTile(step, src, srcIdx))}
                    </div>

                    {summary.totalCredit > 0 && (
                      <div className={cn(
                        "rounded-lg p-3 text-center border",
                        darkMode ? "bg-green-900/20 border-green-800" : "bg-green-50 border-green-200"
                      )}>
                        <p className={cn("text-xs uppercase tracking-wide mb-1", darkMode ? "text-green-400" : "text-green-600")}>
                          Total Money Back
                        </p>
                        <p className={cn("text-lg font-bold font-mono", darkMode ? "text-green-300" : "text-green-700")}>
                          {formatCurrency(summary.totalCredit)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* ─── MIDDLE: Bridge ─── */}
                  <div className={cn(
                    "flex flex-col items-center justify-center px-6 py-4 border-x",
                    darkMode ? "border-gray-700" : "border-gray-200"
                  )}>
                    <div className="hidden lg:flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg animate-pulse">
                        <ArrowRight className="w-6 h-6" />
                      </div>
                      <span className={cn("text-xs font-bold uppercase tracking-widest", darkMode ? "text-gray-500" : "text-gray-400")}>
                        Upgrade
                      </span>
                    </div>
                    <div className="lg:hidden flex items-center gap-2 py-2">
                      <div className="h-px w-8 bg-gradient-to-r from-transparent to-blue-500" />
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg">
                        <ArrowRight className="w-4 h-4 rotate-90 lg:rotate-0" />
                      </div>
                      <div className="h-px w-8 bg-gradient-to-l from-transparent to-purple-500" />
                    </div>
                  </div>

                  {/* ─── RIGHT: New Plan ─── */}
                  <div className={cn("p-4 space-y-4", darkMode ? "bg-gray-800/50" : "bg-emerald-50/30")}>
                    <h3 className={cn("text-sm font-bold uppercase tracking-wide", darkMode ? "text-gray-300" : "text-gray-600")}>
                      🎯 New Plan
                    </h3>

                    <div className={cn(
                      "rounded-xl border-2 p-4 space-y-3",
                      darkMode ? "bg-emerald-900/20 border-emerald-700" : "bg-white border-emerald-300"
                    )}>
                      <div className="grid grid-cols-1 gap-2">
                        <div className="space-y-1">
                          <Label className={cn("text-xs", darkMode ? "text-gray-300" : "text-gray-600")}>Category</Label>
                          <Select
                            value={step.targetCategory}
                            onValueChange={(v) => {
                              const cycles = getCyclesForCategory(v);
                              const defCycle = cycles.includes(12) ? "12" : cycles[0]?.toString() || "12";
                              updateStep(step.id, { targetCategory: v, targetPlan: "", targetBillingCycle: defCycle });
                            }}
                          >
                            <SelectTrigger className={cn("h-8 text-xs", inputClass)}><SelectValue placeholder="Select category" /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(planData).map(([key, val]: [string, any]) => (
                                <SelectItem key={key} value={key}>{val.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className={cn("text-xs", darkMode ? "text-gray-300" : "text-gray-600")}>Plan</Label>
                          <Select value={step.targetPlan} onValueChange={(v) => updateStep(step.id, { targetPlan: v })} disabled={!step.targetCategory}>
                            <SelectTrigger className={cn("h-8 text-xs", inputClass)}><SelectValue placeholder="Select plan" /></SelectTrigger>
                            <SelectContent>
                              {getPlansForCategory(step.targetCategory).map((p: any) => (
                                <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className={cn("text-xs", darkMode ? "text-gray-300" : "text-gray-600")}>Cycle</Label>
                          <Select value={step.targetBillingCycle} onValueChange={(v) => updateStep(step.id, { targetBillingCycle: v })} disabled={!step.targetCategory}>
                            <SelectTrigger className={cn("h-8 text-xs", inputClass)}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {getCyclesForCategory(step.targetCategory).map((c: number) => (
                                <SelectItem key={c} value={c.toString()}>{cycleLabels[c] || `${c}mo`}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className={cn("text-xs", darkMode ? "text-gray-300" : "text-gray-600")}>
                            Price {step.targetPriceOverride ? "(Override)" : summary.targetPrice ? `(${formatCurrency(summary.targetPrice)})` : ""}
                          </Label>
                          <Input
                            type="number"
                            placeholder="Use plan price"
                            value={step.targetPriceOverride}
                            onChange={(e) => updateStep(step.id, { targetPriceOverride: e.target.value })}
                            className={cn("h-8 text-xs", inputClass)}
                          />
                        </div>
                      </div>

                      {summary.targetPrice > 0 && (
                        <div className={cn("rounded-lg p-3 text-center", darkMode ? "bg-blue-900/20" : "bg-blue-50")}>
                          <p className={cn("text-xs uppercase tracking-wide mb-1", darkMode ? "text-blue-400" : "text-blue-600")}>
                            New Plan Price
                          </p>
                          <p className={cn("text-lg font-bold font-mono", darkMode ? "text-blue-300" : "text-blue-700")}>
                            {formatCurrency(summary.targetPrice)}
                          </p>
                        </div>
                      )}
                    </div>

                    {(summary.totalCredit > 0 || summary.targetPrice > 0) && (
                      <div className={cn(
                        "rounded-xl p-4 text-center border-2",
                        summary.netCost < 0
                          ? darkMode ? "bg-red-900/20 border-red-700" : "bg-red-50 border-red-300"
                          : darkMode ? "bg-emerald-900/30 border-emerald-600" : "bg-emerald-50 border-emerald-300"
                      )}>
                        <p className={cn("text-xs uppercase tracking-wide mb-1 font-bold", darkMode ? "text-gray-300" : "text-gray-600")}>
                          💰 Total to Pay
                        </p>
                        <div className="text-2xl">
                          <AnimatedNumber value={summary.netCost} darkMode={darkMode} />
                        </div>
                        {summary.totalCredit > 0 && (
                          <p className={cn("text-xs mt-1", darkMode ? "text-gray-400" : "text-gray-500")}>
                            After {formatCurrency(summary.totalCredit)} money back
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </React.Fragment>
        );
      })}

      {/* Empty state */}
      {steps.length === 0 && (
        <Card className={cn("overflow-hidden", darkMode ? "bg-gray-800 border-gray-700" : "")}>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-3">🔗</div>
            <p className={cn("text-lg font-bold mb-1", darkMode ? "text-gray-300" : "text-gray-600")}>
              Start your upgrade chain
            </p>
            <p className={cn("text-sm mb-4", darkMode ? "text-gray-500" : "text-gray-400")}>
              Plan 1 → Plan 2 → Plan 3 → … Each upgrade feeds into the next automatically.
            </p>
            <Button onClick={addStep} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-1" /> Add First Upgrade
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Grand Total Footer */}
      {steps.length > 0 && (
        <div className={cn(
          "fixed bottom-0 left-0 right-0 z-50 border-t shadow-2xl",
          darkMode ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"
        )}>
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <span className={cn("text-sm font-bold uppercase tracking-wide", darkMode ? "text-gray-300" : "text-gray-600")}>
              Grand Total ({steps.length} upgrade{steps.length !== 1 ? "s" : ""})
            </span>
            <div className="text-2xl">
              <AnimatedNumber value={grandTotal} darkMode={darkMode} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingLedger;
