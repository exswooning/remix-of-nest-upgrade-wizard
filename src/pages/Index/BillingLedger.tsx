import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Calendar, Plus, Trash2, FileText, ChevronDown, ChevronUp, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { parseDate, formatDate } from "./dateUtils";
import { useAuth } from "@/contexts/AuthContext";

/* ─── Types ─── */
interface SourceProduct {
  id: string;
  category: string;
  plan: string;
  billingCycle: string;
  billingStartDateText: string;
  billingStartDate: Date | undefined;
  priceOverride: string; // empty = use plan price
}

interface LedgerEvent {
  id: string;
  upgradeDateText: string;
  upgradeDate: Date | undefined;
  sourceProducts: SourceProduct[];
  targetCategory: string;
  targetPlan: string;
  targetBillingCycle: string;
  targetPriceOverride: string;
  expanded: boolean;
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

/* ─── Component ─── */
const BillingLedger: React.FC<BillingLedgerProps> = ({ darkMode }) => {
  const { getPlanData } = useAuth();
  const planData = getPlanData();
  const [events, setEvents] = useState<LedgerEvent[]>([]);

  const formatCurrency = (val: number) => {
    const prefix = val < 0 ? "-" : "";
    return `${prefix}NPR ${Math.abs(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  /* ─── Plan helpers ─── */
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

  /* ─── Proration calculation ─── */
  const calcSourceCredit = (src: SourceProduct, upgradeDate: Date | undefined) => {
    if (!upgradeDate || !src.billingStartDate) return null;

    const price = src.priceOverride
      ? parseFloat(src.priceOverride)
      : getPlanPrice(src.category, src.plan, src.billingCycle);
    if (!price || price <= 0) return null;

    const cycle = parseInt(src.billingCycle) || 12;
    const totalDays = cycleDays[cycle] || 365;

    const diffMs = upgradeDate.getTime() - src.billingStartDate.getTime();
    const usedDays = Math.max(0, Math.min(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), totalDays));
    const dailyCost = price / totalDays;
    const usedMoney = usedDays * dailyCost;
    const remaining = price - usedMoney;

    return {
      price,
      totalDays,
      usedDays,
      dailyCost,
      usedMoney,
      remaining: Math.max(0, remaining),
    };
  };

  /* ─── Event CRUD ─── */
  const addEvent = () => {
    setEvents((prev) => [
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
        expanded: true,
      },
    ]);
  };

  const removeEvent = (id: string) => setEvents((prev) => prev.filter((e) => e.id !== id));

  const updateEvent = (id: string, patch: Partial<LedgerEvent>) => {
    setEvents((prev) =>
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

  const toggleExpand = (id: string) =>
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, expanded: !e.expanded } : e)));

  /* ─── Source product CRUD ─── */
  const addSourceProduct = (eventId: string) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
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

  const removeSourceProduct = (eventId: string, srcId: string) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        return { ...e, sourceProducts: e.sourceProducts.filter((s) => s.id !== srcId) };
      })
    );
  };

  const updateSourceProduct = (eventId: string, srcId: string, patch: Partial<SourceProduct>) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        return {
          ...e,
          sourceProducts: e.sourceProducts.map((s) => {
            if (s.id !== srcId) return s;
            const updated = { ...s, ...patch };
            if ("billingStartDateText" in patch) {
              const parsed = parseDate(patch.billingStartDateText!);
              updated.billingStartDate = parsed ?? undefined;
            }
            // Reset plan when category changes
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

  /* ─── Computed totals for an event ─── */
  const getEventSummary = (event: LedgerEvent) => {
    const credits = event.sourceProducts.map((src) => {
      const calc = calcSourceCredit(src, event.upgradeDate);
      return { src, calc };
    });

    const totalCredit = credits.reduce((sum, c) => sum + (c.calc?.remaining ?? 0), 0);

    const targetPrice = event.targetPriceOverride
      ? parseFloat(event.targetPriceOverride)
      : getPlanPrice(event.targetCategory, event.targetPlan, event.targetBillingCycle) ?? 0;

    const netCost = targetPrice - totalCredit;

    return { credits, totalCredit, targetPrice, netCost };
  };

  const grandTotal = useMemo(() => {
    return events.reduce((sum, e) => {
      const { netCost } = getEventSummary(e);
      return sum + netCost;
    }, 0);
  }, [events, planData]);

  /* ─── Render helpers ─── */
  const inputClass = darkMode ? "bg-gray-700 border-gray-600 text-white" : "";
  const cardClass = darkMode ? "bg-gray-800 border-gray-700" : "";

  const renderDateInput = (
    value: string,
    onChange: (v: string) => void,
    date: Date | undefined,
    onCalendarSelect: (d: Date) => void,
    small = false
  ) => (
    <div className="flex gap-1">
      <Input
        placeholder="DD/MM/YYYY"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(small ? "h-8 text-xs" : "", inputClass)}
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className={cn(small ? "h-8 w-8 shrink-0" : "shrink-0", darkMode ? "border-gray-600" : "")}>
            <Calendar className={small ? "h-3 w-3" : "h-4 w-4"} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarComponent
            mode="single"
            selected={date}
            onSelect={(d) => { if (d) onCalendarSelect(d); }}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className={cardClass}>
        <CardHeader className="pb-3">
          <CardTitle className={`text-lg ${darkMode ? "text-white" : ""}`}>
            <FileText className="w-5 h-5 inline mr-2" />
            Multi-Product Upgrade Ledger
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-sm mb-4 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
            Consolidate multiple existing plans into one upgrade. Each event calculates remaining credit from source plans and subtracts it from the target plan price.
          </p>
          <Button onClick={addEvent} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-1" /> Add Upgrade Event
          </Button>
        </CardContent>
      </Card>

      {/* Events */}
      {events.map((event, idx) => {
        const summary = getEventSummary(event);
        return (
          <Card key={event.id} className={cardClass}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle
                  className={`text-base cursor-pointer flex items-center gap-2 ${darkMode ? "text-white" : ""}`}
                  onClick={() => toggleExpand(event.id)}
                >
                  {event.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  Event #{idx + 1}
                  {event.targetPlan && (
                    <span className={`text-sm font-normal ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                      — Target: {event.targetPlan}
                    </span>
                  )}
                </CardTitle>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm font-bold font-mono ${
                      summary.netCost < 0
                        ? darkMode ? "text-red-400" : "text-red-600"
                        : darkMode ? "text-green-400" : "text-green-600"
                    }`}
                  >
                    {formatCurrency(summary.netCost)}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => removeEvent(event.id)} className="h-8 w-8 text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            {event.expanded && (
              <CardContent className="space-y-5">
                {/* Upgrade Date */}
                <div className="space-y-2">
                  <Label className={darkMode ? "text-gray-200" : ""}>Upgrade Date</Label>
                  {renderDateInput(
                    event.upgradeDateText,
                    (v) => updateEvent(event.id, { upgradeDateText: v }),
                    event.upgradeDate,
                    (d) => updateEvent(event.id, { upgradeDateText: formatDate(d), upgradeDate: d })
                  )}
                </div>

                {/* Source Products */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className={`text-sm font-semibold ${darkMode ? "text-gray-200" : ""}`}>
                      Source Products ({event.sourceProducts.length})
                    </Label>
                    <Button variant="outline" size="sm" onClick={() => addSourceProduct(event.id)} className={darkMode ? "border-gray-600" : ""}>
                      <Plus className="w-3 h-3 mr-1" /> Add Product
                    </Button>
                  </div>

                  {event.sourceProducts.length === 0 && (
                    <div className={`text-center py-4 rounded-lg border border-dashed ${darkMode ? "border-gray-600 text-gray-500" : "border-gray-300 text-gray-400"}`}>
                      <Package className="w-6 h-6 mx-auto mb-1 opacity-50" />
                      <p className="text-xs">Click "Add Product" to add existing plans to consolidate</p>
                    </div>
                  )}

                  {event.sourceProducts.map((src, srcIdx) => {
                    const credit = calcSourceCredit(src, event.upgradeDate);
                    return (
                      <Card key={src.id} className={`${darkMode ? "bg-gray-700 border-gray-600" : "bg-gray-50 border-gray-200"}`}>
                        <CardContent className="p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-semibold ${darkMode ? "text-gray-300" : "text-gray-500"}`}>
                              Product #{srcIdx + 1}
                            </span>
                            <Button variant="ghost" size="icon" onClick={() => removeSourceProduct(event.id, src.id)} className="h-6 w-6 text-destructive">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Category */}
                            <div className="space-y-1">
                              <Label className={`text-xs ${darkMode ? "text-gray-300" : ""}`}>Category</Label>
                              <Select value={src.category} onValueChange={(v) => updateSourceProduct(event.id, src.id, { category: v })}>
                                <SelectTrigger className={`h-8 text-xs ${inputClass}`}>
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(planData).map(([key, val]: [string, any]) => (
                                    <SelectItem key={key} value={key}>{val.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Plan */}
                            <div className="space-y-1">
                              <Label className={`text-xs ${darkMode ? "text-gray-300" : ""}`}>Plan</Label>
                              <Select value={src.plan} onValueChange={(v) => updateSourceProduct(event.id, src.id, { plan: v })} disabled={!src.category}>
                                <SelectTrigger className={`h-8 text-xs ${inputClass}`}>
                                  <SelectValue placeholder="Select plan" />
                                </SelectTrigger>
                                <SelectContent>
                                  {getPlansForCategory(src.category).map((p: any) => (
                                    <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Billing Cycle */}
                            <div className="space-y-1">
                              <Label className={`text-xs ${darkMode ? "text-gray-300" : ""}`}>Billing Cycle</Label>
                              <Select value={src.billingCycle} onValueChange={(v) => updateSourceProduct(event.id, src.id, { billingCycle: v })} disabled={!src.category}>
                                <SelectTrigger className={`h-8 text-xs ${inputClass}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {getCyclesForCategory(src.category).map((c: number) => (
                                    <SelectItem key={c} value={c.toString()}>{cycleLabels[c] || `${c} months`}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Price Override */}
                            <div className="space-y-1">
                              <Label className={`text-xs ${darkMode ? "text-gray-300" : ""}`}>
                                Price {src.priceOverride ? "(Override)" : getPlanPrice(src.category, src.plan, src.billingCycle) ? `(${formatCurrency(getPlanPrice(src.category, src.plan, src.billingCycle)!)})` : ""}
                              </Label>
                              <Input
                                type="number"
                                placeholder="Use plan price"
                                value={src.priceOverride}
                                onChange={(e) => updateSourceProduct(event.id, src.id, { priceOverride: e.target.value })}
                                className={`h-8 text-xs ${inputClass}`}
                              />
                            </div>

                            {/* Billing Start Date */}
                            <div className="space-y-1 sm:col-span-2">
                              <Label className={`text-xs ${darkMode ? "text-gray-300" : ""}`}>Billing Start Date</Label>
                              {renderDateInput(
                                src.billingStartDateText,
                                (v) => updateSourceProduct(event.id, src.id, { billingStartDateText: v }),
                                src.billingStartDate,
                                (d) => updateSourceProduct(event.id, src.id, { billingStartDateText: formatDate(d), billingStartDate: d }),
                                true
                              )}
                            </div>
                          </div>

                          {/* Credit breakdown */}
                          {credit && (
                            <div className={`rounded-md p-2 text-xs space-y-1 ${darkMode ? "bg-gray-800" : "bg-white border border-gray-200"}`}>
                              <div className="flex justify-between">
                                <span className={darkMode ? "text-gray-400" : "text-gray-500"}>
                                  Used: {credit.usedDays}/{credit.totalDays} days
                                </span>
                                <span className={darkMode ? "text-gray-400" : "text-gray-500"}>
                                  Daily: {formatCurrency(credit.dailyCost)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className={darkMode ? "text-gray-400" : "text-gray-500"}>
                                  Used: {formatCurrency(credit.usedMoney)}
                                </span>
                                <span className={`font-semibold ${darkMode ? "text-green-400" : "text-green-600"}`}>
                                  Credit: {formatCurrency(credit.remaining)}
                                </span>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Target Plan */}
                <div className="space-y-3">
                  <Label className={`text-sm font-semibold ${darkMode ? "text-gray-200" : ""}`}>Target Plan</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className={`text-xs ${darkMode ? "text-gray-300" : ""}`}>Category</Label>
                      <Select
                        value={event.targetCategory}
                        onValueChange={(v) => {
                          const cycles = getCyclesForCategory(v);
                          const defCycle = cycles.includes(12) ? "12" : cycles[0]?.toString() || "12";
                          updateEvent(event.id, { targetCategory: v, targetPlan: "", targetBillingCycle: defCycle });
                        }}
                      >
                        <SelectTrigger className={`h-8 text-xs ${inputClass}`}>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(planData).map(([key, val]: [string, any]) => (
                            <SelectItem key={key} value={key}>{val.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className={`text-xs ${darkMode ? "text-gray-300" : ""}`}>Plan</Label>
                      <Select value={event.targetPlan} onValueChange={(v) => updateEvent(event.id, { targetPlan: v })} disabled={!event.targetCategory}>
                        <SelectTrigger className={`h-8 text-xs ${inputClass}`}>
                          <SelectValue placeholder="Select plan" />
                        </SelectTrigger>
                        <SelectContent>
                          {getPlansForCategory(event.targetCategory).map((p: any) => (
                            <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className={`text-xs ${darkMode ? "text-gray-300" : ""}`}>Cycle</Label>
                      <Select value={event.targetBillingCycle} onValueChange={(v) => updateEvent(event.id, { targetBillingCycle: v })} disabled={!event.targetCategory}>
                        <SelectTrigger className={`h-8 text-xs ${inputClass}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getCyclesForCategory(event.targetCategory).map((c: number) => (
                            <SelectItem key={c} value={c.toString()}>{cycleLabels[c] || `${c} months`}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Target price override */}
                  <div className="space-y-1">
                    <Label className={`text-xs ${darkMode ? "text-gray-300" : ""}`}>
                      Target Price {event.targetPriceOverride ? "(Override)" : summary.targetPrice ? `(${formatCurrency(summary.targetPrice)})` : ""}
                    </Label>
                    <Input
                      type="number"
                      placeholder="Use plan price"
                      value={event.targetPriceOverride}
                      onChange={(e) => updateEvent(event.id, { targetPriceOverride: e.target.value })}
                      className={`h-8 text-xs ${inputClass}`}
                    />
                  </div>
                </div>

                {/* Summary */}
                {(event.sourceProducts.length > 0 || summary.targetPrice > 0) && (
                  <div className={`rounded-lg p-4 space-y-2 ${darkMode ? "bg-gray-900 border border-gray-700" : "bg-blue-50 border border-blue-200"}`}>
                    <div className="flex justify-between text-sm">
                      <span className={darkMode ? "text-gray-300" : "text-gray-600"}>Total Credit (from {event.sourceProducts.length} product{event.sourceProducts.length !== 1 ? "s" : ""}):</span>
                      <span className={`font-semibold ${darkMode ? "text-green-400" : "text-green-600"}`}>{formatCurrency(summary.totalCredit)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className={darkMode ? "text-gray-300" : "text-gray-600"}>Target Plan Price:</span>
                      <span className={`font-semibold ${darkMode ? "text-blue-400" : "text-blue-600"}`}>{formatCurrency(summary.targetPrice)}</span>
                    </div>
                    <hr className={darkMode ? "border-gray-700" : "border-blue-200"} />
                    <div className="flex justify-between text-base font-bold">
                      <span className={darkMode ? "text-white" : "text-gray-800"}>Net Upgrade Cost:</span>
                      <span className={summary.netCost < 0 ? (darkMode ? "text-red-400" : "text-red-600") : (darkMode ? "text-emerald-400" : "text-emerald-700")}>
                        {formatCurrency(summary.netCost)}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Grand Total */}
      {events.length > 1 && (
        <Card className={`${darkMode ? "bg-gray-900 border-gray-700" : "bg-emerald-50 border-emerald-200"}`}>
          <CardContent className="py-4">
            <div className="flex justify-between items-center text-lg font-bold">
              <span className={darkMode ? "text-white" : "text-gray-800"}>Grand Total ({events.length} events):</span>
              <span className={`font-mono ${grandTotal < 0 ? (darkMode ? "text-red-400" : "text-red-600") : (darkMode ? "text-green-400" : "text-green-600")}`}>
                {formatCurrency(grandTotal)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {events.length === 0 && (
        <Card className={cardClass}>
          <CardContent className="py-12 text-center">
            <FileText className={`w-12 h-12 mx-auto mb-3 ${darkMode ? "text-gray-600" : "text-gray-300"}`} />
            <p className={`text-lg font-medium ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
              No upgrade events yet
            </p>
            <p className={`text-sm ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
              Click "Add Upgrade Event" to consolidate multiple plans into a single upgrade.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BillingLedger;
