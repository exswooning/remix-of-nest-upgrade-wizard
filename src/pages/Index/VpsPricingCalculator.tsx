import React, { useState, useMemo } from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { HardDrive, Cpu, MemoryStick, Calendar, CalendarDays, Percent } from "lucide-react";

interface VpsPricingCalculatorProps {
  darkMode: boolean;
}

const VpsPricingCalculator: React.FC<VpsPricingCalculatorProps> = ({ darkMode }) => {
  const [storageGB, setStorageGB] = useState(0);
  const [cpuCores, setCpuCores] = useState(0);
  const [ramGB, setRamGB] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [showAnnual, setShowAnnual] = useState(false);

  const VAT_RATE = 0.13;

  const calculations = useMemo(() => {
    const monthlySubtotal = (storageGB * 15) + (cpuCores * 600) + (ramGB * 250);
    const monthlyVat = monthlySubtotal * VAT_RATE;
    const totalBeforeDiscount = monthlySubtotal + monthlyVat;
    const discountAmount = totalBeforeDiscount * (discountPct / 100);
    const monthlyTotal = totalBeforeDiscount - discountAmount;
    const annualTotal = monthlyTotal * 12;
    return { monthlySubtotal, monthlyVat, totalBeforeDiscount, discountAmount, monthlyTotal, annualTotal };
  }, [storageGB, cpuCores, ramGB, discountPct]);

  const formatCurrency = (amount: number) => {
    return `Rs. ${amount.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const inputClass = `${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`;
  const cardClass = `rounded-lg border p-4 ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`;
  const labelClass = `text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`;

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

      {/* Inputs */}
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

      {/* Hero number */}
      <div className={`text-center py-4 rounded-lg ${darkMode ? 'bg-blue-950/40 border border-blue-900' : 'bg-blue-50 border border-blue-200'}`}>
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
              <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Subtotal</span>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-800'}>{formatCurrency(calculations.monthlySubtotal)}</span>
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
          <div className={`text-2xl font-bold mb-1 ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
            {formatCurrency(calculations.annualTotal)}
          </div>
          <p className={`text-xs ${darkMode ? 'text-emerald-400/70' : 'text-emerald-600/70'}`}>
            / year (Incl. VAT)
          </p>
        </div>
      </div>
    </div>
  );
};

export default VpsPricingCalculator;
