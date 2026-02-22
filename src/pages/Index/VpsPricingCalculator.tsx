import React, { useState, useMemo } from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { HardDrive, Cpu, MemoryStick, Calendar, CalendarDays, Percent, Wrench } from "lucide-react";

interface VpsPricingCalculatorProps {
  darkMode: boolean;
}

const VpsPricingCalculator: React.FC<VpsPricingCalculatorProps> = ({ darkMode }) => {
  const [storageGB, setStorageGB] = useState(0);
  const [cpuCores, setCpuCores] = useState(0);
  const [ramGB, setRamGB] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [managementFee, setManagementFee] = useState(10000);
  const [showAnnual, setShowAnnual] = useState(false);

  const VAT_RATE = 0.13;

  const calculations = useMemo(() => {
    const resourceSubtotal = (storageGB * 15) + (cpuCores * 600) + (ramGB * 250);
    const totalMonthlyBase = resourceSubtotal + managementFee;
    const monthlyVat = totalMonthlyBase * VAT_RATE;
    const totalBeforeDiscount = totalMonthlyBase + monthlyVat;
    const discountAmount = totalBeforeDiscount * (discountPct / 100);
    const monthlyTotal = totalBeforeDiscount - discountAmount;
    const annualTotal = monthlyTotal * 12;
    const annualResourceCost = resourceSubtotal * 12;
    const annualManagementFee = managementFee * 12;
    const annualVat = (totalMonthlyBase * VAT_RATE) * 12;
    return { resourceSubtotal, totalMonthlyBase, monthlyVat, totalBeforeDiscount, discountAmount, monthlyTotal, annualTotal, annualResourceCost, annualManagementFee, annualVat };
  }, [storageGB, cpuCores, ramGB, discountPct, managementFee]);

  const formatCurrency = (amount: number) => {
    return `Rs. ${amount.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const inputClass = `${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`;
  const cardClass = `rounded-lg border p-4 ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`;
  const labelClass = `text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`;
  const sectionTitleClass = `text-xs font-semibold uppercase tracking-wider mb-3 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`;

  return (
    <div className="space-y-6">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <Label className={labelClass}>Show primary figure as:</Label>
        <div className="flex items-center gap-2">
          <span className={`text-sm ${!showAnnual ? 'font-semibold' : 'opacity-60'} ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Monthly</span>
          <Switch checked={showAnnual} onCheckedChange={setShowAnnual} />
          <span className={`text-sm ${showAnnual ? 'font-semibold' : 'opacity-60'} ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Annual</span>
        </div>
      </div>

      {/* Hardware Resources */}
      <div>
        <p className={sectionTitleClass}>Hardware Resources</p>
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label className={`${labelClass} flex items-center gap-1.5`}>
              <Cpu className="w-4 h-4" /> CPU (Cores)
            </Label>
            <Input
              type="number"
              min={0}
              value={cpuCores || ''}
              onChange={e => setCpuCores(Number(e.target.value) || 0)}
              placeholder="0"
              className={inputClass}
            />
            <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>× Rs. 600/core</p>
          </div>
          <div className="space-y-2">
            <Label className={`${labelClass} flex items-center gap-1.5`}>
              <MemoryStick className="w-4 h-4" /> RAM (GB)
            </Label>
            <Input
              type="number"
              min={0}
              value={ramGB || ''}
              onChange={e => setRamGB(Number(e.target.value) || 0)}
              placeholder="0"
              className={inputClass}
            />
            <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>× Rs. 250/GB</p>
          </div>
          <div className="space-y-2">
            <Label className={`${labelClass} flex items-center gap-1.5`}>
              <HardDrive className="w-4 h-4" /> Storage (GB)
            </Label>
            <Input
              type="number"
              min={0}
              value={storageGB || ''}
              onChange={e => setStorageGB(Number(e.target.value) || 0)}
              placeholder="0"
              className={inputClass}
            />
            <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>× Rs. 15/GB</p>
          </div>
          <div className="space-y-2">
            <Label className={`${labelClass} flex items-center gap-1.5`}>
              <Percent className="w-4 h-4" /> Discount (%)
            </Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={discountPct || ''}
              onChange={e => setDiscountPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              placeholder="0"
              className={inputClass}
            />
            <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>off total</p>
          </div>
        </div>
      </div>

      {/* Service & Support + Hero */}
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <p className={sectionTitleClass}>Service & Support</p>
          <div className="space-y-2">
            <Label className={`${labelClass} flex items-center gap-1.5`}>
              <Wrench className="w-4 h-4" /> Monthly Management Fee (NRs.)
            </Label>
            <Input
              type="number"
              min={0}
              value={managementFee || ''}
              onChange={e => setManagementFee(Number(e.target.value) || 0)}
              placeholder="10000"
              className={inputClass}
            />
            <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Subject to Scope of Service (SoS) agreement. Billed annually.</p>
          </div>
        </div>
        <div className={`flex-1 text-center py-4 rounded-lg ${darkMode ? 'bg-blue-950/40 border border-blue-900' : 'bg-blue-50 border border-blue-200'}`}>
          <p className={`text-xs uppercase tracking-wider mb-1 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
            {showAnnual ? 'Annual Total (Incl. VAT)' : 'Monthly Total (Incl. VAT)'}
          </p>
          <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {formatCurrency(showAnnual ? calculations.annualTotal : calculations.monthlyTotal)}
          </p>
          <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {showAnnual ? `${formatCurrency(calculations.monthlyTotal)} / month` : `${formatCurrency(calculations.annualTotal)} / year`}
          </p>
        </div>
      </div>

      {/* Two-column breakdown */}
      <div className="grid grid-cols-2 gap-4">
        {/* Monthly */}
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
            <h4 className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-800'}`}>Monthly Billing</h4>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Resource Subtotal</span>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-800'}>{formatCurrency(calculations.resourceSubtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Management Fee</span>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-800'}>{formatCurrency(managementFee)}</span>
            </div>
            <div className="flex justify-between">
              <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Total Monthly Base</span>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-800'}>{formatCurrency(calculations.totalMonthlyBase)}</span>
            </div>
            <div className="flex justify-between">
              <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>VAT (13%)</span>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-800'}>{formatCurrency(calculations.monthlyVat)}</span>
            </div>
            <div className="flex justify-between">
              <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Total (Incl. VAT)</span>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-800'}>{formatCurrency(calculations.totalBeforeDiscount)}</span>
            </div>
            {discountPct > 0 && (
              <div className="flex justify-between">
                <span className={darkMode ? 'text-red-400' : 'text-red-600'}>Discount ({discountPct}%)</span>
                <span className={darkMode ? 'text-red-400' : 'text-red-600'}>-{formatCurrency(calculations.discountAmount)}</span>
              </div>
            )}
            <div className={`flex justify-between pt-2 border-t font-semibold ${darkMode ? 'border-gray-700 text-white' : 'border-gray-300 text-gray-900'}`}>
              <span>Grand Total</span>
              <span>{formatCurrency(calculations.monthlyTotal)}</span>
            </div>
          </div>
        </div>

        {/* Annual */}
        <div className={`rounded-lg border p-4 ${darkMode ? 'bg-emerald-950/30 border-emerald-800' : 'bg-emerald-50 border-emerald-200'}`}>
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className={`w-4 h-4 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
            <h4 className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-800'}`}>Pay Annually</h4>
            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${darkMode ? 'bg-emerald-900 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>
              12 months
            </Badge>
          </div>
          <div className={`text-3xl font-extrabold text-center mb-3 ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
            {formatCurrency(calculations.annualTotal)}
          </div>
          <p className={`text-xs mb-4 ${darkMode ? 'text-emerald-400/70' : 'text-emerald-600/70'}`}>
            / year (Incl. VAT)
          </p>

          {/* Annual Breakdown Table */}
          <div className={`rounded border ${darkMode ? 'border-emerald-800/60' : 'border-emerald-200'}`}>
            <Table>
              <TableBody>
                <TableRow className={`border-b ${darkMode ? 'border-emerald-800/40' : 'border-emerald-100'}`}>
                  <TableCell className={`py-2 px-3 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Annual Resource Cost</TableCell>
                  <TableCell className={`py-2 px-3 text-xs text-right font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{formatCurrency(calculations.annualResourceCost)}</TableCell>
                </TableRow>
                <TableRow className={`border-b ${darkMode ? 'border-emerald-800/40' : 'border-emerald-100'}`}>
                  <TableCell className={`py-2 px-3 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Annual Management Fee</TableCell>
                  <TableCell className={`py-2 px-3 text-xs text-right font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{formatCurrency(calculations.annualManagementFee)}</TableCell>
                </TableRow>
                <TableRow className={`border-b ${darkMode ? 'border-emerald-800/40' : 'border-emerald-100'}`}>
                  <TableCell className={`py-2 px-3 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Annual VAT (13%)</TableCell>
                  <TableCell className={`py-2 px-3 text-xs text-right font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{formatCurrency(calculations.annualVat)}</TableCell>
                </TableRow>
                {discountPct > 0 && (
                  <TableRow className={`border-b ${darkMode ? 'border-emerald-800/40' : 'border-emerald-100'}`}>
                    <TableCell className={`py-2 px-3 text-xs ${darkMode ? 'text-red-400' : 'text-red-600'}`}>Annual Discount ({discountPct}%)</TableCell>
                    <TableCell className={`py-2 px-3 text-xs text-right font-medium ${darkMode ? 'text-red-400' : 'text-red-600'}`}>-{formatCurrency(calculations.discountAmount * 12)}</TableCell>
                  </TableRow>
                )}
                <TableRow className="border-0">
                  <TableCell className={`py-2 px-3 text-xs font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Final Annual Commitment</TableCell>
                  <TableCell className={`py-2 px-3 text-xs text-right font-bold ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>{formatCurrency(calculations.annualTotal)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VpsPricingCalculator;
