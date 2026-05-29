import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Upload, Save, RotateCcw } from 'lucide-react';
import { loadBankSlots, updateBankSlot, BANK_SLOTS, type BankSlot } from '@/utils/bankSlots';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

interface BankSlotManagerProps {
  darkMode?: boolean;
}

const BankSlotManager: React.FC<BankSlotManagerProps> = ({ darkMode = false }) => {
  const dm = darkMode;
  const { toast } = useToast();
  const [bankSlots, setBankSlots] = useState<ReturnType<typeof loadBankSlots>>(() => loadBankSlots());
  const [selectedSlot, setSelectedSlot] = useState<BankSlot>('A');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = () => setBankSlots(loadBankSlots());
    window.addEventListener('cgap-bank-slots-update', handler);
    return () => window.removeEventListener('cgap-bank-slots-update', handler);
  }, []);

  const selectedConfig = bankSlots.find((c) => c.slot === selectedSlot) || bankSlots[0];

  const handleUpdate = (field: keyof typeof selectedConfig, value: any) => {
    if (!selectedConfig) return;
    updateBankSlot(selectedSlot, { [field]: value });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      handleUpdate('qrImage', base64);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast({ title: 'Bank slot saved', description: `Slot ${selectedSlot} has been updated.` });
    }, 500);
  };

  const handleReset = () => {
    if (!window.confirm(`Reset slot ${selectedSlot} to default values?`)) return;
    updateBankSlot(selectedSlot, {
      bankName: '',
      accountName: '',
      accountNumber: '',
      branch: '',
      includeQrCode: false,
      qrImage: undefined,
    });
    toast({ title: 'Slot reset', description: `Slot ${selectedSlot} has been reset to default.` });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Building2 className={`w-4 h-4 ${dm ? 'text-teal-400' : 'text-teal-600'}`} />
        <h4 className={`text-sm font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>Bank Slot Manager</h4>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {BANK_SLOTS.filter(s => s !== 'ALL').map((s) => (
          <Button
            key={s}
            variant={selectedSlot === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedSlot(s)}
            className={selectedSlot === s ? 'bg-teal-600 hover:bg-teal-700' : ''}
          >
            Slot {s}
          </Button>
        ))}
      </div>

      {selectedConfig && (
        <div className="space-y-3">
          <div>
            <Label className={`text-xs ${dm ? 'text-gray-400' : 'text-gray-600'}`}>Label</Label>
            <Input
              value={selectedConfig.label}
              onChange={(e) => handleUpdate('label', e.target.value)}
              className={`mt-1 ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'}`}
            />
          </div>

          <div>
            <Label className={`text-xs ${dm ? 'text-gray-400' : 'text-gray-600'}`}>Bank Name</Label>
            <Input
              value={selectedConfig.bankName}
              onChange={(e) => handleUpdate('bankName', e.target.value)}
              className={`mt-1 ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'}`}
            />
          </div>

          <div>
            <Label className={`text-xs ${dm ? 'text-gray-400' : 'text-gray-600'}`}>Account Name (Payee)</Label>
            <Input
              value={selectedConfig.accountName}
              onChange={(e) => handleUpdate('accountName', e.target.value)}
              className={`mt-1 ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'}`}
            />
          </div>

          <div>
            <Label className={`text-xs ${dm ? 'text-gray-400' : 'text-gray-600'}`}>Account Number</Label>
            <Input
              value={selectedConfig.accountNumber}
              onChange={(e) => handleUpdate('accountNumber', e.target.value)}
              className={`mt-1 ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'}`}
            />
          </div>

          <div>
            <Label className={`text-xs ${dm ? 'text-gray-400' : 'text-gray-600'}`}>Branch</Label>
            <Input
              value={selectedConfig.branch}
              onChange={(e) => handleUpdate('branch', e.target.value)}
              className={`mt-1 ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'}`}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="include-qr"
              checked={selectedConfig.includeQrCode}
              onCheckedChange={(checked) => handleUpdate('includeQrCode', checked === true)}
            />
            <label htmlFor="include-qr" className={`text-xs cursor-pointer ${dm ? 'text-gray-300' : 'text-gray-700'}`}>
              Include FonePay QR Code
            </label>
          </div>

          {selectedConfig.includeQrCode && (
            <div>
              <Label className={`text-xs ${dm ? 'text-gray-400' : 'text-gray-600'}`}>QR Code Image</Label>
              <div className="mt-2 space-y-2">
                {selectedConfig.qrImage ? (
                  <div className={`p-3 rounded-lg border ${dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                    <img src={selectedConfig.qrImage} alt="QR Code" className="max-w-[150px] h-auto mb-2" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdate('qrImage', undefined)}
                      className="gap-1.5"
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      id="qr-upload"
                    />
                    <label htmlFor="qr-upload">
                      <Button variant="outline" size="sm" asChild className="gap-1.5">
                        <span>
                          <Upload className="w-3 h-3" /> Upload QR Code
                        </span>
                      </Button>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save className="w-3 h-3" /> {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
              <RotateCcw className="w-3 h-3" /> Reset
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankSlotManager;
