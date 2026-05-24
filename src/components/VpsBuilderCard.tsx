import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Server, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Custom-VPS pricing calculator extracted from the old UCAP VPS tab.
 *  Output is one line item the caller drops into a QGAP quote.
 *  Formula (unchanged from UCAP):
 *    monthly_base = (storageGB * 15) + (cpuCores * 600) + (ramGB * 250) + managementFee
 *    monthly_total = (monthly_base * 1.13) * (1 - discount/100)
 *    annual_total = monthly_total * 12 */

const VAT_RATE = 0.13;
const RATES = { storage: 15, cpu: 600, ram: 250 } as const;

export interface VpsLineItemPayload {
  planName: string;     // human-readable, e.g. "Custom VPS · 4C / 8GB / 100GB"
  cycle: number;        // 1 (monthly) or 12 (annual)
  unitPrice: number;    // matching the selected cycle
  qty: number;          // always 1 — the VPS instance itself
}

interface Props {
  darkMode?: boolean;
  /** Called when the user clicks "Add to quote". */
  onAdd: (payload: VpsLineItemPayload) => void;
  /** Accent colour for the action button (defaults to QGAP brand blue). */
  accent?: string;
}

const VpsBuilderCard: React.FC<Props> = ({ darkMode = false, onAdd, accent = '#1E40AF' }) => {
  const [storageGB, setStorageGB] = useState(40);
  const [cpuCores, setCpuCores] = useState(2);
  const [ramGB, setRamGB] = useState(4);
  const [discountPct, setDiscountPct] = useState(0);
  const [managementFee, setManagementFee] = useState(0);
  const [annual, setAnnual] = useState(true);

  const calc = useMemo(() => {
    const resource = storageGB * RATES.storage + cpuCores * RATES.cpu + ramGB * RATES.ram;
    const base = resource + managementFee;
    const withVat = base * (1 + VAT_RATE);
    const monthly = withVat * (1 - discountPct / 100);
    const annualTotal = monthly * 12;
    return { resource, base, monthly, annual: annualTotal };
  }, [storageGB, cpuCores, ramGB, discountPct, managementFee]);

  const fmt = (n: number) => `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const planName = `Custom VPS · ${cpuCores}C / ${ramGB}GB RAM / ${storageGB}GB SSD${managementFee > 0 ? ' + managed' : ''}`;
  const cycle = annual ? 12 : 1;
  const unitPrice = annual ? calc.annual : calc.monthly;

  const dm = darkMode;
  const inputCls = `w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border focus:border-blue-500`;
  const labelCls = `text-[10px] uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;

  const NumField = ({ label, value, set, icon, step = 1, min = 0, suffix }: { label: string; value: number; set: (n: number) => void; icon: React.ReactNode; step?: number; min?: number; suffix?: string }) => (
    <div>
      <Label className={`${labelCls} flex items-center gap-1`}>{icon}{label}</Label>
      <div className="flex items-center gap-1 mt-1">
        <Input
          type="number"
          value={value}
          step={step}
          min={min}
          onChange={(e) => set(Math.max(min, parseFloat(e.target.value) || 0))}
          className={`${inputCls} text-right`}
        />
        {suffix && <span className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-500'} w-8`}>{suffix}</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Server className="w-4 h-4" style={{ color: accent }} />
        <span className={`text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
          Build custom VPS
        </span>
      </div>
      <p className={`text-[11px] ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
        Spec a custom-config VPS. Output drops in as a line item — set Qty, Cycle, and override unit price after adding if you need to discount further.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <NumField label={`Storage (Rs ${RATES.storage}/GB)`} value={storageGB} set={setStorageGB} icon={null} step={10} suffix="GB" />
        <NumField label={`vCPU (Rs ${RATES.cpu}/core)`} value={cpuCores} set={setCpuCores} icon={null} step={1} suffix="cores" />
        <NumField label={`RAM (Rs ${RATES.ram}/GB)`} value={ramGB} set={setRamGB} icon={null} step={1} suffix="GB" />
        <NumField label="Management Fee (Rs/month)" value={managementFee} set={setManagementFee} icon={null} step={100} />
        <NumField label="Discount %" value={discountPct} set={(n) => setDiscountPct(Math.min(100, n))} icon={null} step={1} suffix="%" />
        <div className="flex items-end justify-end pb-1 gap-2">
          <span className={`text-xs ${dm ? 'text-gray-400' : 'text-gray-500'}`}>{annual ? 'Annual' : 'Monthly'}</span>
          <Switch checked={annual} onCheckedChange={setAnnual} />
        </div>
      </div>

      <div className={cn('rounded-lg p-3 border', dm ? 'bg-gray-800/40 border-gray-700' : 'bg-white/60 border-gray-200')}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className={`text-[10px] uppercase tracking-wider ${dm ? 'text-gray-500' : 'text-gray-500'}`}>Calculated</div>
            <div className={`text-sm font-medium ${dm ? 'text-gray-100' : 'text-gray-800'}`}>{planName}</div>
            <div className={`text-[11px] mt-0.5 ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
              Resources: {fmt(calc.resource)} + Management: {fmt(managementFee)} + 13% VAT
              {discountPct > 0 && ` − ${discountPct}% discount`}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold tabular-nums" style={{ color: accent }}>{fmt(unitPrice)}</div>
            <div className={`text-[10px] ${dm ? 'text-gray-500' : 'text-gray-500'}`}>{annual ? '/year' : '/month'} (incl. VAT)</div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => onAdd({ planName, cycle, unitPrice, qty: 1 })}
          style={{ background: accent, color: '#fff' }}
          className="gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add to quote
        </Button>
      </div>
    </div>
  );
};

export default VpsBuilderCard;
