import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useCGAP } from '@/contexts/CGAPContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Upload, Download, ChevronDown, ChevronUp, Sparkles, CheckCircle2, Loader2, AlertCircle, FileText, Wand2, Lock, ChevronsUpDown, Check, Package, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw, ScissorsSquareDashedBottom, X, Move, QrCode, Printer, GripVertical } from 'lucide-react';
import { numberToWords, periodToText, formatNepaliNumber, generateAbbreviation, getTodayISO } from '@/utils/cgapAutoFill';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { generateContractPdfFromStructure, type CostLineItem, type ContractFields } from '@/utils/contractTemplate';
import {
  loadContractStructure, saveContractStructure, blankContractSection,
  getDefaultStructureForCategory, suggestedContractProductFor,
  saveUserDefaultStructure,
  CONTRACT_CATEGORY_KEYS, CONTRACT_CATEGORY_LABELS,
  type ContractStructureSection,
} from '@/utils/contractStructure';
import SectionBodyEditor from '@/components/SectionBodyEditor';
import { letterheadToDataUrl } from '@/utils/letterheadToDataUrl';
import { loadUserDefaultToggles, saveUserDefaultToggles } from '@/utils/contractToggles';
import { TEST_DATA, DEFAULT_NEW_FIELDS, AUTO_FIELDS } from './contractDefaults';
import {
  fillContractHtmlTemplate,
  getEffectiveContractHtmlTemplateForLength,
  saveContractHtmlTemplateForLength,
  clearContractHtmlTemplateForLength,
  loadContractHtmlTemplateForLength,
  getEffectiveContractLengthOptions,
  noteUploadedTemplateLength,
  forgetExtraLength,
  detectTemplatePageCount,
  DEFAULT_CONTRACT_LENGTH,
  type ContractLength,
} from '@/utils/contractHtmlTemplate';
import { Slider } from '@/components/ui/slider';
import PdfToolsPanel from '@/components/PdfToolsPanel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { logActivity } from '@/utils/activityLog';
import { loadBankSlots, updateBankSlot, populateAllBankSlots, BANK_SLOTS, type BankSlot } from '@/utils/bankSlots';
import { resolveLetterhead } from '@/utils/templateAssignments';
import { Switch } from '@/components/ui/switch';
import ContractPreview from './ContractPreview';
import { loadContractAnchors, saveContractAnchors, saveUserDefaultContractAnchors, type ContractAnchor } from '@/utils/contractAnchors';
import ContractCustomTemplate from './ContractCustomTemplate';
import QuickFillFromReply from '@/components/QuickFillFromReply';
import { EDITED_HTML_KEY, FIELDS_SNAPSHOT_KEY } from '@/pages/ContractEditorPage';
import { generateContractQR, storeContractMetadata, type ContractQRMetadata } from '@/utils/contractQR';
import { PenLine, ExternalLink } from 'lucide-react';

// Helpers + constants extracted to dedicated modules so this file
// stays cheap to load. See:
//   src/utils/letterheadToDataUrl.ts   — canvas-based image fetcher
//   src/utils/contractToggles.ts       — ContractToggles + load/save
//   src/pages/CGAP/contractDefaults.ts — TEST_DATA / DEFAULT_NEW_FIELDS / AUTO_FIELDS
//   src/components/SectionBodyEditor.tsx — the per-row wrapper component

const ACCENT = '#0F766E';  // brand teal
const STEPS = ['Saving', 'Copying', 'Filling', 'Invoice', 'Done'];

interface ContractTabProps { darkMode?: boolean; }

const ContractTab: React.FC<ContractTabProps> = ({ darkMode = false }) => {
  const { fieldMappings, generateContractId, peekContractId, addContractLog } = useCGAP();
  const { isAdmin, currentUsername, getPlanData } = useAuth();
  const { toast } = useToast();
  const [fields, setFields] = useState<Record<string, string>>(() => ({ ...DEFAULT_NEW_FIELDS } as Record<string, string>));
  const [costItems, setCostItems] = useState<CostLineItem[]>([{ description: '', qty: '1', unitPrice: '' }]);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  // ID of the QR anchor the user last clicked / dragged in the preview.
  // Drives "Copy to page" so the source is whichever on-screen QR they
  // were just working with, not a hard-coded universal default.
  const [selectedQrAnchorId, setSelectedQrAnchorId] = useState<string | null>(null);
  // Letterhead + QR + HTML-template toggles. Initial values come from
  // the user's saved defaults (set via "Save as default" button) if
  // present, else ship-defaults (letterhead OFF, QR ON, template OFF).
  const [useLetterhead, setUseLetterhead] = useState(() => loadUserDefaultToggles()?.useLetterhead ?? false);
  const [showQrCode, setShowQrCode] = useState(() => loadUserDefaultToggles()?.showQrCode ?? true);
  // HTML template is the canonical render path — always on. The
  // previous toggle / saved-default fallback is ignored deliberately;
  // the React `ContractPreview` component is kept for the contract
  // editor route but not for the live preview / PDF download here.
  const [useHtmlTemplate, setUseHtmlTemplate] = useState(true);
  void setUseHtmlTemplate; // setter retained for future re-introduction
  // Length slider state. Each step (1 / 3 / 5 / 7 / 9 pages) maps to
  // its own uploaded HTML template — see `contractHtmlTemplate.ts`
  // for the storage cascade (length-specific → legacy single → bundled).
  // `templateBump` is incremented on Upload / Clear so the iframe and
  // PDF path pick up the freshly-written localStorage value without a
  // full reload.
  const [contractLength, setContractLength] = useState<ContractLength>(DEFAULT_CONTRACT_LENGTH);
  const [templateBump, setTemplateBump] = useState(0);
  const lengthTemplateUploaded = useMemo(
    () => !!loadContractHtmlTemplateForLength(contractLength),
    [contractLength, templateBump],
  );
  // Dynamic options: base 1..9 + any extras that were added by an
  // upload whose page count exceeded 9. Memo key bumps on upload /
  // clear so the slider extends and contracts in real time.
  const lengthOptions = useMemo(
    () => getEffectiveContractLengthOptions(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templateBump],
  );
  const templateFileInputRef = useRef<HTMLInputElement | null>(null);
  const handleUploadLengthTemplate = useCallback(async (file: File) => {
    try {
      const html = await file.text();
      if (!html.trim()) {
        toast({ title: 'Empty file', description: 'The selected file has no content.', variant: 'destructive' });
        return;
      }
      // Auto-detect the actual page count so the slot key matches
      // reality. The user no longer has to manually align the slider
      // with the file's length — the file decides. Falls back to the
      // current slider position if detection can't find page markers.
      const detected = detectTemplatePageCount(html);
      const targetLength: ContractLength = detected > 1 ? detected : contractLength;
      saveContractHtmlTemplateForLength(targetLength, html);
      noteUploadedTemplateLength(targetLength); // adds to slider if > 9
      setTemplateBump(b => b + 1);
      setContractLength(targetLength); // snap to the file's actual length
      const detectionNote = detected > 1
        ? (detected === contractLength ? '' : ` (auto-detected ${detected} pages)`)
        : ' (couldn’t detect page count — used current slider value)';
      toast({
        title: `${targetLength}-page template uploaded`,
        description: `${file.name} · ${(file.size / 1024).toFixed(1)} KB${detectionNote}`,
      });
    } catch (err) {
      toast({ title: 'Upload failed', description: String(err instanceof Error ? err.message : err).slice(0, 180), variant: 'destructive' });
    }
  }, [contractLength, toast]);
  const handleClearLengthTemplate = useCallback(() => {
    clearContractHtmlTemplateForLength(contractLength);
    // Lengths > 9 were dynamic extensions of the slider; drop the
    // extra slot now that nothing's stored there. Lengths 1..9 are
    // always shown so the user can re-upload without remembering they
    // existed.
    if (contractLength > 9) {
      forgetExtraLength(contractLength);
      setContractLength(DEFAULT_CONTRACT_LENGTH);
    }
    setTemplateBump(b => b + 1);
    toast({ title: `${contractLength}-page template cleared`, description: 'Reverted to the legacy single override / bundled default.' });
  }, [contractLength, toast]);
  // Edited-mode: when the user has opened the standalone editor and made
  // changes, the editor writes HTML into localStorage. We mirror it here
  // so the preview can render it instead of the template.
  const [editedHtml, setEditedHtml] = useState<string | null>(() => localStorage.getItem(EDITED_HTML_KEY));
  const [showMapping, setShowMapping] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoicePage, setInvoicePage] = useState('');
  const [generatedId, setGeneratedId] = useState('');
  // Manual override of the auto-computed Contract ID. When this is
  // non-null, the live ID display + previews + downloads all use this
  // value instead of `peekContractId(abv)`. Useful when migrating an
  // existing customer or matching a hand-written ID.
  const [contractIdOverride, setContractIdOverride] = useState<string | null>(null);
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [designerMode, setDesignerMode] = useState(false);
  const [newQrPage, setNewQrPage] = useState('1');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [showCustomTemplate, setShowCustomTemplate] = useState(false);
  const [showPdfTools, setShowPdfTools] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Bank slots (similar to VRAP issuing company slots) ───────────────
  const [bankSlots, setBankSlots] = useState<ReturnType<typeof loadBankSlots>>(() => {
    const slots = loadBankSlots();
    // If slots are empty, populate with pre-configured data
    if (!slots[0]?.bankName) {
      return populateAllBankSlots();
    }
    return slots;
  });
  const [selectedBankSlots, setSelectedBankSlots] = useState<BankSlot[]>(['A']);

  useEffect(() => {
    const handler = () => setBankSlots(loadBankSlots());
    window.addEventListener('cgap-bank-slots-update', handler);
    return () => window.removeEventListener('cgap-bank-slots-update', handler);
  }, []);

  const selectedBankConfigs = useMemo(
    () => bankSlots.filter((c) => selectedBankSlots.includes(c.slot)),
    [bankSlots, selectedBankSlots],
  );

  // ── Section structure (SLA-style, per UCAP category) ──────────────
  // Admins can reorder, add, edit, and page-break each contract clause.
  // Persisted per-category to `contract-sections-${categoryKey}`. Non-
  // admin users still see the form + Generate button; the section
  // manager is hidden behind isAdmin.
  const [categoryKey, setCategoryKey] = useState<string>('google-workspace');
  const [sections, setSections] = useState<ContractStructureSection[]>(() => loadContractStructure('google-workspace'));

  // Persist any change to the current category's structure (debounced via
  // React's batching — saveContractStructure is cheap, no real need to
  // debounce manually).
  useEffect(() => {
    saveContractStructure(categoryKey, sections);
  }, [categoryKey, sections]);

  const handleCategoryChange = (next: string) => {
    if (next === categoryKey) return;
    saveContractStructure(categoryKey, sections);
    setCategoryKey(next);
    setSections(loadContractStructure(next));
    // Suggest a default product so the title block reads sensibly when
    // switching categories cold. User can override.
    const sp = suggestedContractProductFor(next);
    if (sp && !selectedProduct) setSelectedProduct(sp);
  };

  const updateSection = (id: string, patch: Partial<ContractStructureSection>) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const moveSection = (idx: number, delta: -1 | 1) => {
    setSections((prev) => {
      const next = [...prev];
      const target = idx + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };
  const deleteSection = (id: string) => {
    if (!confirm('Delete this section? It will be removed from this category only.')) return;
    setSections((prev) => prev.filter((s) => s.id !== id));
  };
  const addSection = () => setSections((prev) => [...prev, blankContractSection()]);
  const addSubSection = (sectionId: string) => {
    setSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s;
      const newSubSection = {
        id: `sub_${Date.now()}`,
        heading: 'New Sub-section',
        body_html: '',
      };
      return {
        ...s,
        subSections: [...(s.subSections || []), newSubSection],
      };
    }));
  };
  const updateSubSection = (sectionId: string, subSectionId: string, updates: Partial<{ heading: string; body_html: string; forcePageBreakBefore?: boolean }>) => {
    setSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s;
      return {
        ...s,
        subSections: (s.subSections || []).map((sub) =>
          sub.id === subSectionId ? { ...sub, ...updates } : sub
        ),
      };
    }));
  };
  const deleteSubSection = (sectionId: string, subSectionId: string) => {
    if (!confirm('Delete this sub-section?')) return;
    setSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s;
      return {
        ...s,
        subSections: (s.subSections || []).filter((sub) => sub.id !== subSectionId),
      };
    }));
  };
  const resetSections = () => {
    if (!confirm(`Reset all sections for "${CONTRACT_CATEGORY_LABELS[categoryKey]}" to defaults? Custom edits will be lost.`)) return;
    setSections(getDefaultStructureForCategory(categoryKey));
  };
  const moveSubSection = (sectionId: string, idx: number, delta: -1 | 1) => {
    setSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s;
      const subs = s.subSections ?? [];
      const target = idx + delta;
      if (target < 0 || target >= subs.length) return s;
      const next = [...subs];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...s, subSections: next };
    }));
  };

  // Drag-and-drop reordering for the admin Pages & Sections panel. The
  // grip handle on each row is the only draggable element; the whole
  // card is the drop target. Sub-section drags carry their parent
  // section id so we never accidentally cross sections.
  const [dragSrcSection, setDragSrcSection] = useState<string | null>(null);
  const [dragOverSection, setDragOverSection] = useState<string | null>(null);
  const [dragSrcSubSection, setDragSrcSubSection] = useState<{ sectionId: string; subId: string } | null>(null);
  const [dragOverSubSection, setDragOverSubSection] = useState<{ sectionId: string; subId: string } | null>(null);
  const reorderSections = (srcId: string, dstId: string) => {
    if (srcId === dstId) return;
    setSections((prev) => {
      const srcIdx = prev.findIndex((s) => s.id === srcId);
      const dstIdx = prev.findIndex((s) => s.id === dstId);
      if (srcIdx < 0 || dstIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(srcIdx, 1);
      next.splice(dstIdx, 0, moved);
      return next;
    });
  };
  const reorderSubSections = (sectionId: string, srcId: string, dstId: string) => {
    if (srcId === dstId) return;
    setSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s;
      const subs = s.subSections ?? [];
      const srcIdx = subs.findIndex((sub) => sub.id === srcId);
      const dstIdx = subs.findIndex((sub) => sub.id === dstId);
      if (srcIdx < 0 || dstIdx < 0) return s;
      const next = [...subs];
      const [moved] = next.splice(srcIdx, 1);
      next.splice(dstIdx, 0, moved);
      return { ...s, subSections: next };
    }));
  };

  const productGroups = useMemo(() => {
    const staticGroups = [
      {
        heading: 'Google Workspace',
        options: ['Business Starter', 'Business Standard', 'Business Plus', 'Enterprise'].map((plan) => ({
          value: `Google Workspace — ${plan}`,
          label: plan,
        })),
      },
      {
        heading: 'Microsoft 365',
        options: ['Business Basic', 'Business Standard', 'Business Premium'].map((plan) => ({
          value: `Microsoft 365 — ${plan}`,
          label: plan,
        })),
      },
    ];

    const dynamicGroups = Object.values(getPlanData() ?? {}).flatMap((category) => {
      if (
        !category ||
        typeof category.name !== 'string' ||
        !Array.isArray(category.options)
      ) {
        return [];
      }

      const options = category.options
        .filter((option) => option && typeof option.name === 'string')
        .map((option) => ({
          value: `${category.name} — ${option.name}`,
          label: option.name,
        }));

      return options.length ? [{ heading: category.name, options }] : [];
    });

    return [...staticGroups, ...dynamicGroups];
  }, [getPlanData]);

  // Auto-fill companyAbv from clientCompanyName
  useEffect(() => {
    const name = fields.clientCompanyName || '';
    // Check if company name has brackets like "Nest Nepal (NNBS)"
    const bracketMatch = name.match(/\(([^)]+)\)$/);
    if (bracketMatch) {
      // Extract abbreviation from brackets
      setFields(prev => ({ ...prev, companyAbv: bracketMatch[1] }));
    } else {
      // Use the default abbreviation generator
      const abv = generateAbbreviation(name);
      setFields(prev => ({ ...prev, companyAbv: abv }));
    }
  }, [fields.clientCompanyName]);

  // Auto-fill paymentWords when paymentAmount changes
  useEffect(() => {
    const amount = parseFloat(fields.paymentAmount || '');
    if (!isNaN(amount) && amount > 0) {
      setFields(prev => ({ ...prev, paymentWords: numberToWords(amount) }));
    } else {
      setFields(prev => ({ ...prev, paymentWords: '' }));
    }
  }, [fields.paymentAmount]);

  // Auto-fill contractPeriod (text) when contractPeriodNum changes
  useEffect(() => {
    const text = periodToText(fields.contractPeriodNum || '');
    setFields(prev => ({ ...prev, contractPeriod: text }));
  }, [fields.contractPeriodNum]);

  const set = (id: string, val: string) => {
    if (AUTO_FIELDS.has(id)) return;
    setFields(prev => ({ ...prev, [id]: val }));
    if (val.trim()) setErrors(prev => ({ ...prev, [id]: false }));
  };

  const validate = () => {
    const errs: Record<string, boolean> = {};
    fieldMappings.forEach(f => {
      if (f.required && !AUTO_FIELDS.has(f.id) && !fields[f.id]?.trim()) errs[f.id] = true;
      if (f.required && AUTO_FIELDS.has(f.id) && !fields[f.id]?.trim()) errs[f.id] = true;
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf' && file.size <= 2 * 1024 * 1024) setInvoiceFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf' && file.size <= 2 * 1024 * 1024) setInvoiceFile(file);
  };

  const saveToDatabase = async (contractId: string) => {
    const { error } = await supabase.from('contracts').insert({
      contract_id: contractId,
      company_abv: fields.companyAbv || '',
      client_company_name: fields.clientCompanyName || '',
      client_location: fields.clientLocation || null,
      client_coordinator: fields.clientCoordinator || null,
      contract_period: fields.contractPeriod || null,
      contract_period_num: fields.contractPeriodNum ? parseInt(fields.contractPeriodNum) : null,
      num_users: fields.numUsers ? parseInt(fields.numUsers) : null,
      payment_amount: fields.paymentAmount ? parseFloat(fields.paymentAmount) : null,
      payment_words: fields.paymentWords || null,
      advance_percent: fields.advancePercent ? parseFloat(fields.advancePercent) : null,
      signatory_name: fields.signatoryName || null,
      signatory_title: fields.signatoryTitle || null,
      witness_name: fields.witnessName || null,
      witness_designation: fields.witnessDesignation || null,
      sp_signatory_name: fields.spSignatoryName || null,
      sp_signatory_title: fields.spSignatoryTitle || null,
      sp_witness_name: fields.spWitnessName || null,
      sp_witness_designation: fields.spWitnessDesignation || null,
      is_signed: isSigned,
      signed_at: isSigned ? new Date().toISOString() : null,
      signed_by: isSigned ? (currentUsername || 'unknown') : null,
      created_by: currentUsername || 'unknown',
    } as any);

    if (error) {
      console.error('Error saving contract:', error);
      toast({ title: 'Warning', description: 'Contract generated but failed to save to database.', variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: 'Contract saved to database.' });
    }
  };

  const runGeneration = async () => {
    if (!validate()) return;
    setDone(false);
    const id = generateContractId(fields.companyAbv || 'XXX');
    setGeneratedId(id);
    for (let i = 0; i < STEPS.length; i++) { setStep(i); await new Promise(r => setTimeout(r, 800)); }
    addContractLog({ timestamp: new Date().toISOString(), companyAbv: fields.companyAbv || '', contractId: id, fields: { ...fields } });
    await saveToDatabase(id);
    setDone(true);
  };

  // Single source of truth for the field bag — used by both the live preview
  // and the PDF download so the two never drift.
  // Live contract ID — the value that appears in the preview / on the
  // downloaded PDF. Resolution order: explicit user override (when set)
  // → the most recently committed `generatedId` (post-download) →
  // `peekContractId` based on the current company abbreviation. The peek
  // path is side-effect-free so re-renders don't burn through counter
  // numbers.
  const liveContractId = useMemo(() => {
    if (contractIdOverride && contractIdOverride.trim()) return contractIdOverride.trim();
    if (generatedId) return generatedId;
    return peekContractId(fields.companyAbv || 'XXX');
  }, [contractIdOverride, generatedId, fields.companyAbv, peekContractId]);

  const contractFieldBag: ContractFields = useMemo(() => {
    // Handle multiple selections
    const selectedBanks = bankSlots.filter(s => selectedBankSlots.includes(s.slot));
    if (selectedBanks.length === 1) {
      const bank = selectedBanks[0];
      return {
        contract_id: liveContractId,
        effective_date: fields.effectiveDate || getTodayISO(),
        customer_name: fields.clientCompanyName || '',
        customer_name_nepali: fields.clientCompanyNameNepali || '',
        customer_address: fields.clientLocation || '',
        customer_address_nepali: fields.clientLocationNepali || '',
        customer_attn: fields.clientCoordinator || '',
        product: selectedProduct || 'Google Workspace — Business Starter',
        service_term: fields.contractPeriod || `${fields.contractPeriodNum || ''} months`,
        num_users: fields.numUsers || '',
        amount: fields.paymentAmount || '',
        amount_words: fields.paymentWords || '',
        advance_percent: fields.advancePercent || '100',
        uptime_pct: fields.uptimePct || '99.9%',
        bank_name: bank.bankName || fields.bankName || '',
        payee_name: bank.accountName || fields.payeeName || '',
        bank_account: bank.accountNumber || fields.bankAccount || '',
        bank_branch: bank.branch || '',
        include_qr_code: bank.includeQrCode || false,
        signatory_name: fields.signatoryName || '',
        signatory_title: fields.signatoryTitle || '',
        witness_name: fields.witnessName || '',
        witness_designation: fields.witnessDesignation || '',
        sp_signatory_name: fields.spSignatoryName || '',
        sp_signatory_title: fields.spSignatoryTitle || '',
        sp_witness_name: fields.spWitnessName || '',
        sp_witness_designation: fields.spWitnessDesignation || '',
        cost_items: costItems,
      };
    }
    // Multiple selections - combine all
    return {
      contract_id: liveContractId,
      effective_date: fields.effectiveDate || getTodayISO(),
      customer_name: fields.clientCompanyName || '',
      customer_name_nepali: fields.clientCompanyNameNepali || '',
      customer_address: fields.clientLocation || '',
      customer_address_nepali: fields.clientLocationNepali || '',
      customer_attn: fields.clientCoordinator || '',
      product: selectedProduct || 'Google Workspace — Business Starter',
      service_term: fields.contractPeriod || `${fields.contractPeriodNum || ''} months`,
      num_users: fields.numUsers || '',
      amount: fields.paymentAmount || '',
      amount_words: fields.paymentWords || '',
      advance_percent: fields.advancePercent || '100',
      uptime_pct: fields.uptimePct || '99.9%',
      bank_name: selectedBanks.map(b => b.bankName).join(', '),
      payee_name: selectedBanks.map(b => b.accountName).join(', '),
      bank_account: selectedBanks.map(b => b.accountNumber).join(', '),
      bank_branch: selectedBanks.map(b => b.branch).filter(Boolean).join(', '),
      include_qr_code: selectedBanks.some(b => b.includeQrCode),
      signatory_name: fields.signatoryName || '',
      signatory_title: fields.signatoryTitle || '',
      witness_name: fields.witnessName || '',
      witness_designation: fields.witnessDesignation || '',
      sp_signatory_name: fields.spSignatoryName || '',
      sp_signatory_title: fields.spSignatoryTitle || '',
      sp_witness_name: fields.spWitnessName || '',
      sp_witness_designation: fields.spWitnessDesignation || '',
      cost_items: costItems,
    };
  }, [fields, selectedProduct, liveContractId, costItems, selectedBankSlots, bankSlots]);

  /** Programmatic .docx download — uses our built-in Nest Nepal contract
   *  layout via the `docx` library. No template upload required; the
   *  formatting is encoded in `contractDocxBuilder`. Lazy-imports the
   *  builder so the ~200 KB `docx` dependency only loads on click. */
  /** Resolve the ID to stamp on a generated document. If the user has
   *  set an override, use that as-is (no counter bump). Otherwise reuse
   *  the previously-committed `generatedId`, or claim a fresh one. */
  const resolveDocumentId = (): string => {
    if (contractIdOverride && contractIdOverride.trim()) return contractIdOverride.trim();
    if (generatedId) return generatedId;
    const fresh = generateContractId(fields.companyAbv || 'XXX');
    setGeneratedId(fresh);
    return fresh;
  };

  /** Upload an exported file blob to the user's contracts bucket in
   *  Supabase. Returns the storage path on success, null on failure.
   *  Shared by every export path (PDF download, 1:1 preview download,
   *  .docx download, Print → Save) so every artifact the user produces
   *  ends up archived without needing a separate "save to database" click. */
  const saveExportToDatabase = async (blob: Blob, filename: string, contentType: string): Promise<string | null> => {
    if (!currentUsername) return null;
    try {
      const path = `${currentUsername}/${filename}`;
      const { data, error } = await supabase.storage
        .from('contracts')
        .upload(path, blob, { upsert: true, contentType });
      if (error) {
        console.error('Database save failed:', error);
        toast({ title: 'Saved locally — database upload failed', description: error.message, variant: 'destructive' });
        return null;
      }
      return data?.path ?? path;
    } catch (err) {
      console.error('Database save failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: 'Saved locally — database upload failed', description: msg, variant: 'destructive' });
      return null;
    }
  };

  const downloadDocx = async () => {
    const id = resolveDocumentId();
    try {
      const [{ buildContractDocx }, { saveAs }] = await Promise.all([
        import('@/utils/contractDocxBuilder'),
        import('file-saver'),
      ]);
      const blob = await buildContractDocx({ ...contractFieldBag, contract_id: id }, 'filled');
      const filename = `${id || 'contract'}.docx`;
      saveAs(blob, filename);
      const savedPath = await saveExportToDatabase(blob, filename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      logActivity({
        kind: 'pdf', // closest existing ActivityKind
        module: 'CGAP/Contract',
        action: 'Contract .docx generated',
        meta: { filename, contract_id: id, client: fields.clientCompanyName, product: selectedProduct, archived_path: savedPath },
      });
      toast({
        title: savedPath ? '.docx downloaded and archived' : '.docx downloaded',
        description: savedPath ? `${filename} · saved to database` : filename,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to build .docx';
      toast({ title: 'Failed', description: msg, variant: 'destructive' });
    }
  };

  /** Build the PDF from the editable section structure. Shared between
   *  the "Download" path (writes a file) and the "Preview PDF" path
   *  (drops the blob into an iframe). */
  const buildPdf = async (id: string, usePlaceholderQr = false) => {
    let letterheadDataUrl: string | undefined;
    if (useLetterhead) {
      try {
        const lh = await resolveLetterhead('contract');
        if (lh?.imageUrl) {
          const url = await letterheadToDataUrl(lh.imageUrl);
          if (url) letterheadDataUrl = url;
        }
      } catch { /* no-op */ }
    }
    
    // Generate QR code with contract metadata (unless using placeholder QR)
    let qrCodeDataUrlToUse: string | undefined;
    if (!usePlaceholderQr) {
      try {
        const metadata: ContractQRMetadata = {
          contractId: id,
          username: currentUsername || 'unknown',
          createdAt: new Date().toISOString(),
          product: selectedProduct || 'unknown',
          clientName: fields.clientCompanyName || '',
          clientLocation: fields.clientLocation || '',
          amount: fields.paymentAmount || '',
          bankSlots: selectedBankSlots,
        };
        storeContractMetadata(metadata);
        qrCodeDataUrlToUse = await generateContractQR(metadata);
        setQrCodeDataUrl(qrCodeDataUrlToUse);
      } catch { /* no-op */ }
    } else {
      qrCodeDataUrlToUse = qrCodeDataUrl; // Use placeholder QR from state (nestnepal.com)
    }
    
    return generateContractPdfFromStructure(
      { ...contractFieldBag, contract_id: id },
      sections,
      { letterheadDataUrl, qrCodeDataUrl: showQrCode ? qrCodeDataUrlToUse : undefined },
    );
  };

  /** Build a 1:1 PDF by rasterising the live preview pages with
   *  html2canvas and stitching them into A4 pages via jsPDF. Output is
   *  visually identical to what the user sees in the preview at the
   *  cost of producing a raster (non-searchable) PDF. */
  /** Render the effective HTML template into an off-screen host with
   *  all form-field tokens substituted, then capture each
   *  `.contract-page` div via html2canvas → assemble into an A4 PDF.
   *  Used by the "Use HTML template" toggle on the Contract tab. */
  const downloadPdfFromHtmlTemplate = async (id: string) => {
    toast({ title: 'Building PDF…', description: 'Rendering uploaded HTML template' });
    const filled = fillContractHtmlTemplate(
      getEffectiveContractHtmlTemplateForLength(contractLength),
      { ...contractFieldBag, contract_id: id, qr_data_url: showQrCode ? (qrCodeDataUrl || '') : '', page_num: '1', total_pages: String(contractLength) } as unknown as Record<string, string>,
    );
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;top:-99999px;left:-99999px;width:794px;background:#fff;pointer-events:none;z-index:-1';
    host.innerHTML = filled;
    document.body.appendChild(host);
    await new Promise((r) => requestAnimationFrame(r));
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { default: JsPDF } = await import('jspdf');
      const pages = Array.from(host.querySelectorAll<HTMLElement>('.contract-page'));
      if (pages.length === 0) throw new Error('Template produced no .contract-page elements.');
      const pdf = new JsPDF('p', 'mm', 'a4');
      for (let i = 0; i < pages.length; i++) {
        // Re-stamp the page-N-of-M footer per page (template literal had "1").
        const pageNumEl = pages[i].querySelectorAll('div');
        pageNumEl.forEach((el) => {
          if (el.textContent && /^Page \d+ of \d+$/.test(el.textContent.trim())) {
            el.textContent = `Page ${i + 1} of ${pages.length}`;
          }
        });
        const canvas = await html2canvas(pages[i], {
          scale: 2, useCORS: true, allowTaint: false, backgroundColor: '#ffffff',
          width: 794, height: 1123, windowWidth: 794, windowHeight: 1123, logging: false,
        });
        if (i > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');
      }
      const filename = `${id || 'contract'}.pdf`;
      const pdfBlob = pdf.output('blob');
      pdf.save(filename);
      const savedPath = await saveExportToDatabase(pdfBlob, filename, 'application/pdf');
      logActivity({
        kind: 'pdf', module: 'CGAP/Contract',
        action: 'Contract PDF generated (HTML template)',
        meta: { filename, contract_id: id, client: fields.clientCompanyName, product: selectedProduct, pages: pages.length, archived_path: savedPath },
      });
      toast({
        title: savedPath ? 'Contract PDF downloaded and archived' : 'Contract PDF downloaded',
        description: savedPath ? `${filename} · saved to database` : filename,
      });
    } catch (err) {
      console.error('HTML template capture failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: 'Template render failed', description: msg.slice(0, 180), variant: 'destructive' });
    } finally {
      host.remove();
    }
  };

  const downloadPdf = async () => {
    const id = resolveDocumentId();
    // HTML-template path — render the effective template (filled with
    // current form values) into an off-screen host and capture each
    // `.contract-page` div. Mirrors what the live iframe is showing,
    // so the download matches the preview exactly.
    if (useHtmlTemplate) {
      await downloadPdfFromHtmlTemplate(id);
      return;
    }
    const pages = Array.from(document.querySelectorAll<HTMLElement>('.contract-page-surface'));
    if (pages.length === 0) {
      toast({ title: 'No preview pages found', description: 'Falling back to the structured PDF.', variant: 'destructive' });
      const pdf = await buildPdf(id);
      pdf.save(`${id || 'contract'}.pdf`);
      return;
    }
    toast({ title: 'Building PDF…', description: `Capturing ${pages.length} page${pages.length === 1 ? '' : 's'} from the preview` });

    // Pre-resolve the letterhead background to a same-origin data URL.
    // CSS background-image with a cross-origin URL taints the
    // html2canvas canvas — and unlike <img> elements, CSS backgrounds
    // can't be tagged with `crossOrigin = 'anonymous'`, so `useCORS`
    // doesn't help. letterheadToDataUrl pipes through Image+canvas to
    // get a data URL we can swap in safely.
    const bgUrlMatch = pages[0]?.style.backgroundImage?.match(/url\(["']?(.+?)["']?\)/);
    const bgUrl = bgUrlMatch?.[1];
    let inlineBgUrl: string | null = null;
    if (bgUrl && !bgUrl.startsWith('data:')) {
      try {
        inlineBgUrl = await letterheadToDataUrl(bgUrl);
      } catch (err) {
        console.warn('Letterhead inline failed (will capture without bg):', err);
      }
    } else if (bgUrl?.startsWith('data:')) {
      inlineBgUrl = bgUrl;
    }

    // Build an off-screen capture host directly under document.body.
    // The original preview pages live deep inside react-tree containers
    // that may be position:fixed (fullscreen mode), absolutely
    // positioned, or transform-scaled — all of which trigger the
    // html2canvas "unable to find element in cloned iframe" error. By
    // cloning each page into a clean host at native A4 pixel size with
    // no transforms or scroll ancestors, we sidestep that entirely.
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;top:-99999px;left:-99999px;width:794px;background:#fff;pointer-events:none;z-index:-1';
    document.body.appendChild(host);

    try {
      const html2canvas = (await import('html2canvas')).default;
      const { default: JsPDF } = await import('jspdf');
      const pdf = new JsPDF('p', 'mm', 'a4');
      for (let i = 0; i < pages.length; i++) {
        // deep-clone the source page → re-stamp at native size in the host
        const clone = pages[i].cloneNode(true) as HTMLElement;
        clone.style.transform = 'none';
        clone.style.position = 'relative';
        clone.style.top = '0';
        clone.style.left = '0';
        clone.style.width = '794px';
        clone.style.height = '1123px';
        clone.style.boxShadow = 'none';
        if (inlineBgUrl) clone.style.backgroundImage = `url("${inlineBgUrl}")`;
        host.replaceChildren(clone);
        // Let layout settle (fonts, images).
        await new Promise((r) => requestAnimationFrame(r));
        const canvas = await html2canvas(clone, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: '#ffffff',
          width: 794,
          height: 1123,
          windowWidth: 794,
          windowHeight: 1123,
          logging: false,
        });
        const imgData = canvas.toDataURL('image/png');
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
      }
      const filename = `${id || 'contract'}.pdf`;
      const pdfBlob = pdf.output('blob');
      pdf.save(filename);
      const savedPath = await saveExportToDatabase(pdfBlob, filename, 'application/pdf');
      logActivity({
        kind: 'pdf',
        module: 'CGAP/Contract',
        action: 'Contract PDF generated (1:1 from preview)',
        meta: { filename, contract_id: id, client: fields.clientCompanyName, product: selectedProduct, category: categoryKey, pages: pages.length, archived_path: savedPath },
      });
      toast({
        title: savedPath ? 'Contract PDF downloaded and archived' : 'Contract PDF downloaded',
        description: savedPath ? `${filename} · saved to database` : filename,
      });
    } catch (err) {
      console.error('Preview capture failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: 'Preview capture failed',
        description: `${msg.slice(0, 180)} · Falling back to structured PDF.`,
        variant: 'destructive',
      });
      const pdf = await buildPdf(id);
      const fallbackFilename = `${id || 'contract'}.pdf`;
      const fallbackBlob = pdf.output('blob');
      pdf.save(fallbackFilename);
      await saveExportToDatabase(fallbackBlob, fallbackFilename, 'application/pdf');
    } finally {
      host.remove();
    }
  };

  const downloadPdfAndSaveToDatabase = async () => {
    const id = resolveDocumentId();
    const pdf = await buildPdf(id);
    const filename = `${id || 'contract'}.pdf`;
    const pdfBlob = pdf.output('blob');
    pdf.save(filename);
    const savedPath = await saveExportToDatabase(pdfBlob, filename, 'application/pdf');
    if (savedPath) {
      logActivity({
        kind: 'pdf',
        module: 'CGAP/Contract',
        action: 'Contract PDF downloaded and saved to database',
        meta: { filename, contract_id: id, client: fields.clientCompanyName, product: selectedProduct, category: categoryKey, path: savedPath },
      });
      toast({ title: 'Contract PDF downloaded and saved', description: `Saved to database as ${filename}` });
    }
  };

  // Mirror the field bag to localStorage so the standalone editor tab can
  // re-render a fresh template baseline on demand (e.g. after "Reset to
  // template"). Cheap — the snapshot is small and the editor reads it
  // lazily.
  useEffect(() => {
    try { localStorage.setItem(FIELDS_SNAPSHOT_KEY, JSON.stringify(contractFieldBag)); }
    catch { /* localStorage full / blocked — ignore */ }
  }, [contractFieldBag]);

  // Generate placeholder QR code for nestnepal.com for preview display
  useEffect(() => {
    const generatePlaceholderQR = async () => {
      try {
        const qrUrl = await generateContractQR({ contractId: 'nestnepal.com', username: 'preview', createdAt: new Date().toISOString(), product: 'placeholder', clientName: '', clientLocation: '', amount: '', bankSlots: [] });
        setQrCodeDataUrl(qrUrl);
      } catch { /* no-op */ }
    };
    generatePlaceholderQR();
  }, []);

  // Listen for edits coming from the standalone editor in another tab.
  // The `storage` event only fires in *other* tabs (the writer doesn't
  // hear its own write), which is exactly what we want here.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== EDITED_HTML_KEY) return;
      setEditedHtml(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const openEditor = () => {
    // Pre-seed the snapshot so the editor renders correctly even if this
    // is the first session (the effect above writes asynchronously).
    try { localStorage.setItem(FIELDS_SNAPSHOT_KEY, JSON.stringify(contractFieldBag)); }
    catch { /* ignore */ }
    window.open('/cgap/contract-editor', '_blank', 'noopener,noreferrer');
  };

  const clearEdits = () => {
    if (!editedHtml) return;
    if (!confirm('Discard editor changes? The preview will snap back to the structured template.')) return;
    localStorage.removeItem(EDITED_HTML_KEY);
    setEditedHtml(null);
  };

  const addCostRow = () => setCostItems((prev) => [...prev, { description: '', qty: '1', unitPrice: '' }]);
  const removeCostRow = (i: number) => setCostItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateCostRow = (i: number, patch: Partial<CostLineItem>) =>
    setCostItems((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const fillTest = () => {
    setFields(TEST_DATA);
    setErrors({});
  };

  const dm = darkMode;
  const card = `glass-card rounded-2xl p-5`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = (hasError: boolean, isAuto?: boolean) =>
    `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border ${hasError ? '!border-red-500' : ''} ${isAuto ? 'opacity-75 cursor-not-allowed' : ''}`;

  const companyFields = fieldMappings.filter(f => ['companyAbv', 'clientCompanyName', 'clientLocation', 'clientCoordinator'].includes(f.id));
  const contractFields = fieldMappings.filter(f => ['contractPeriodNum', 'contractPeriod', 'numUsers'].includes(f.id));
  const paymentFields = fieldMappings.filter(f => ['paymentAmount', 'paymentWords', 'advancePercent'].includes(f.id));
  const clientSignatoryFields = fieldMappings.filter(f => ['signatoryName', 'signatoryTitle', 'witnessName', 'witnessDesignation'].includes(f.id));
  const spSignatoryFields = fieldMappings.filter(f => ['spSignatoryName', 'spSignatoryTitle', 'spWitnessName', 'spWitnessDesignation'].includes(f.id));

  const renderField = (f: typeof fieldMappings[0]) => {
    const isAuto = AUTO_FIELDS.has(f.id);
    const isNumber = ['contractPeriodNum', 'numUsers', 'advancePercent'].includes(f.id);
    const isAmount = f.id === 'paymentAmount';

    return (
      <div key={f.id} className={f.id === 'clientCompanyName' ? 'md:col-span-2' : ''}>
        <Label className={`${labelCls} flex items-center gap-1.5`}>
          {f.label} {f.required && <span className="text-red-500">*</span>}
          {isAuto && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${ACCENT}22`, color: ACCENT }}>
              <Wand2 className="w-2.5 h-2.5" /> AUTO
            </span>
          )}
        </Label>
        <div className="relative">
          <Input
            value={fields[f.id] || ''}
            onChange={e => set(f.id, e.target.value)}
            placeholder={isAuto ? 'Auto-generated' : ''}
            readOnly={isAuto}
            type={isNumber || isAmount ? 'number' : 'text'}
            min={isNumber || isAmount ? 0 : undefined}
            className={inputCls(!!errors[f.id], isAuto)}
          />
          {isAuto && <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40" />}
        </div>
        {isAmount && fields.paymentAmount && !isNaN(parseFloat(fields.paymentAmount)) && (
          <p className={`text-xs mt-1 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
            Formatted: NRs. {formatNepaliNumber(parseFloat(fields.paymentAmount))}/-
          </p>
        )}
        {errors[f.id] && <p className="text-xs mt-1 flex items-center gap-1 text-red-500"><AlertCircle className="w-3 h-3" /> Required</p>}
      </div>
    );
  };

  const sectionHeader = (title: string, subtitle: string) => (
    <div className={`flex items-center gap-2 pt-2 pb-1 ${dm ? 'border-gray-800' : 'border-gray-200'}`}>
      <div className="w-1 h-5 rounded-full" style={{ background: ACCENT }} />
      <div>
        <h3 className={`text-sm font-semibold ${dm ? 'text-gray-200' : 'text-gray-700'}`}>{title}</h3>
        <p className={`text-[10px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>{subtitle}</p>
      </div>
    </div>
  );

  const autoPlaceholders = [
    { label: 'Contract ID', tag: '<<CONTRACTID>>', desc: 'ABV-NNBS-DD-MM-YY-N' },
    { label: 'Date (ordinal)', tag: '<<DATE>>', desc: 'e.g. "22nd"' },
    { label: 'Day/Date (DD)', tag: '<<DAYDATE>>', desc: 'e.g. "22"' },
    { label: 'Month Name', tag: '<<MONTH>>', desc: 'e.g. "February"' },
    { label: 'Year', tag: '<<YEAR>>', desc: 'e.g. "2026"' },
    { label: 'DD', tag: '<<DD>>', desc: '2-digit day' },
    { label: 'MM', tag: '<<MM>>', desc: '2-digit month' },
    { label: 'YY', tag: '<<YY>>', desc: '2-digit year' },
    { label: 'Version', tag: '<<VERSION>>', desc: 'Contract sequence number' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>New Contract</h2>
          <p className={`text-xs mt-0.5 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
            Google Workspace Business Starter Services Agreement
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fillTest} className="gap-1.5" style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>
          <Sparkles className="w-3 h-3" /> Test Data
        </Button>
      </div>


      {/* Quick fill from customer's reply — paste a WhatsApp / email
          message, parser extracts company / contact person / address /
          email / phone and writes them into the Client Details form
          below. Complements the PAN/VAT lookup: PAN gives you the legal
          name + registered address, this gives you the human contact
          (coordinator name, phone, email). */}
      <QuickFillFromReply
        darkMode={dm}
        accentColor={ACCENT}
        onApply={(out) => {
          if (out.companyName) set('clientCompanyName', out.companyName);
          if (out.fullName) set('clientCoordinator', out.fullName);
          if (out.address) set('clientLocation', out.address);
          // Handle PAN details if present
          if (out.panDetails) {
            if (out.panDetails.nameEng && !out.companyName) set('clientCompanyName', out.panDetails.nameEng);
            if (out.panDetails.nameNep) set('clientCompanyNameNepali', out.panDetails.nameNep);
            if (out.panDetails.address && !out.address) {
              set('clientLocation', out.panDetails.address);
              set('clientLocationNepali', out.panDetails.address);
            }
          }
          // Email / phone don't map to existing ContractTab fields, but
          // the parser still shows them in the "Extracted" preview so the
          // user can copy them somewhere manually if needed.
        }}
      />

      {/* Contract-length slider — sits below QuickFillFromReply so it's
          right next to the "what kind of customer is this" inputs. Each
          step (1 / 3 / 5 / 7 / 9 pages) maps to its own uploaded HTML
          template via the storage cascade in `contractHtmlTemplate.ts`.
          The chip shows whether a custom template is loaded for the
          active length or whether it's falling back to the bundled
          default. */}
      <div className={cn(
        'mb-3 rounded-xl border p-3 flex items-center gap-3 flex-wrap',
        dm ? 'border-gray-800 bg-gray-900/40' : 'border-gray-200 bg-white',
      )}>
        <div className={`text-xs font-medium ${dm ? 'text-gray-200' : 'text-gray-700'}`}>Contract length</div>
        <div
          className="flex-1 min-w-[260px]"
          // Stretches wider when uploads have pushed the slider past
          // 9 ticks so the labels stay legible.
          style={{ maxWidth: `${Math.max(420, lengthOptions.length * 32)}px` }}
        >
          <Slider
            min={0}
            max={lengthOptions.length - 1}
            step={1}
            value={[Math.max(0, lengthOptions.indexOf(contractLength))]}
            onValueChange={([idx]) => setContractLength(lengthOptions[idx] ?? DEFAULT_CONTRACT_LENGTH)}
          />
          <div className={`flex justify-between text-[10px] mt-1 tabular-nums ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
            {lengthOptions.map(n => (
              <span key={n} className={n === contractLength ? (dm ? 'text-teal-300 font-semibold' : 'text-teal-600 font-semibold') : ''}>{n}</span>
            ))}
          </div>
        </div>
        <span className={cn(
          'inline-flex items-center px-2 h-6 rounded-full text-[10px] font-medium border tabular-nums',
          lengthTemplateUploaded
            ? (dm ? 'bg-teal-900/40 text-teal-300 border-teal-700' : 'bg-teal-50 text-teal-700 border-teal-300')
            : (dm ? 'bg-gray-900 text-gray-400 border-gray-700' : 'bg-gray-50 text-gray-500 border-gray-300'),
        )}>
          {contractLength}p · {lengthTemplateUploaded ? 'custom template' : 'bundled default'}
        </span>
        <input
          ref={templateFileInputRef}
          type="file"
          accept=".html,.htm,text/html"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUploadLengthTemplate(f);
            if (templateFileInputRef.current) templateFileInputRef.current.value = '';
          }}
        />
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => templateFileInputRef.current?.click()}
          className="h-8 gap-1.5"
          title={`Upload an HTML template for the ${contractLength}-page length`}
        >
          <Upload className="w-3.5 h-3.5" /> Upload
        </Button>
        {lengthTemplateUploaded && (
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={handleClearLengthTemplate}
            className="h-8 gap-1.5"
            title={`Remove the custom template for ${contractLength}-page contracts (falls back to bundled default)`}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </Button>
        )}
      </div>

      {/* Product & Contract Terms Section */}
      {sectionHeader('Product & Contract Terms', 'Select a product from UCAP plans; Section 2A — Period text auto-fills from months')}

      {/* Product Selector */}
      <div className="mb-3">
        <Label className={`${labelCls} flex items-center gap-1.5 mb-1`}>
          <Package className="w-3 h-3" /> Product / Service <span className="text-red-500">*</span>
        </Label>
        <Popover open={productOpen} onOpenChange={setProductOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={productOpen}
              className={cn(
                'w-full justify-between text-sm font-normal',
                dm ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-750' : 'bg-white border-gray-300 text-gray-900',
                !selectedProduct && (dm ? 'text-gray-500' : 'text-gray-400')
              )}
            >
              {selectedProduct || 'Select a product...'}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search products..." />
              <CommandList>
                <CommandEmpty>No product found.</CommandEmpty>
                {productGroups.map((group) => (
                  <CommandGroup key={group.heading} heading={group.heading}>
                    {group.options.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        onSelect={() => {
                          setSelectedProduct(option.value);
                          setProductOpen(false);
                        }}
                      >
                        <Check className={cn('mr-2 h-4 w-4', selectedProduct === option.value ? 'opacity-100' : 'opacity-0')} />
                        {option.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedProduct && (
          <p className={`text-xs mt-1 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
            Selected: {selectedProduct}
          </p>
        )}
      </div>

      {/* Product-specific details - only show when product is selected */}
      {selectedProduct && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {contractFields.map(renderField)}
          <div>
            <Label className={labelCls}>Effective Date</Label>
            <Input
              type="date"
              value={fields.effectiveDate || ''}
              onChange={(e) => set('effectiveDate', e.target.value)}
              className={inputCls(false)}
            />
          </div>
        </div>
      )}

      {/* Company & Client Section */}
      {sectionHeader('Client Details', 'Client company and coordinator from Section 4A of the contract')}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {companyFields.map(renderField)}
      </div>

      {/* Nepali (Devanagari) variants — populated by the PAN/VAT lookup
          when IRD has them. Editable so users can fix anything the parser
          mis-split. Tucked behind a disclosure so it doesn't crowd the
          main form when not needed. */}
      <details className={`rounded-lg border ${dm ? 'border-gray-800 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
        <summary className={`cursor-pointer px-3 py-2 text-xs ${dm ? 'text-gray-400' : 'text-gray-600'}`}>
          Nepali (Devanagari) details <span className={`ml-2 normal-case ${dm ? 'text-gray-600' : 'text-gray-500'}`}>· auto-filled by PAN/VAT lookup when available</span>
        </summary>
        <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className={labelCls}>Company details (नेपाली)</Label>
            <Input
              lang="ne"
              value={fields.clientCompanyNameNepali || ''}
              onChange={(e) => set('clientCompanyNameNepali', e.target.value)}
              placeholder="यति डिस्टिलरी प्रा. लि."
              className={inputCls(false)}
            />
          </div>
          <div>
            <Label className={labelCls}>Address (नेपाली)</Label>
            <Input
              lang="ne"
              value={fields.clientLocationNepali || ''}
              onChange={(e) => set('clientLocationNepali', e.target.value)}
              placeholder="भरतपुर, महानगरपालिका"
              className={inputCls(false)}
            />
          </div>
        </div>
      </details>

      {/* Payment Section */}
      {sectionHeader('Payment', 'Section 3A — Ceiling amount; words auto-fill from numerals')}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {paymentFields.map(renderField)}
      </div>

      {sectionHeader('Bank Details', 'Section 3C — where the Client pays')}
      <div className="mb-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {BANK_SLOTS.map((s) => {
            const c = bankSlots.find((x) => x.slot === s);
            const isActive = selectedBankSlots.includes(s);
            const hasBankDetails = Boolean(c?.bankName && c?.accountNumber);
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSelectedBankSlots(prev => {
                    if (prev.includes(s)) {
                      // If deselecting and it's the only one, default to A
                      const newSelection = prev.filter(x => x !== s);
                      return newSelection.length === 0 ? ['A'] : newSelection;
                    }
                    // If selecting, add the slot
                    return [...prev, s];
                  });
                }}
                className={cn(
                  'text-left rounded-xl p-3 border transition-colors',
                  isActive
                    ? (dm ? 'bg-teal-900/30 border-teal-500' : 'bg-teal-50 border-teal-400')
                    : (dm ? 'bg-gray-800/40 border-gray-700 hover:bg-gray-800' : 'bg-white/60 border-gray-200 hover:bg-gray-50'),
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="font-mono text-[10px]" style={{ borderColor: ACCENT, color: ACCENT }}>{s}</Badge>
                  <span className={`text-sm font-medium ${dm ? 'text-gray-100' : 'text-gray-800'}`}>{c?.label || `Bank ${s}`}</span>
                </div>
                <div className={`text-[10px] ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
                  {hasBankDetails ? '✓ bank details' : '— no details'} · {c?.includeQrCode ? '✓ QR' : '— no QR'}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      {selectedBankSlots.includes('C') && selectedBankSlots.length === 1 ? (
        <div className={`p-1 rounded border ${dm ? 'bg-gray-800/40 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          <Label className={`text-[7px] ${dm ? 'text-gray-400' : 'text-gray-500'}`}>FonePay QR</Label>
          <div className={`mt-0.5 p-0.5 rounded border ${dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            {selectedBankConfigs.find(c => c.slot === 'C')?.qrImage ? (
              <img src={selectedBankConfigs.find(c => c.slot === 'C')?.qrImage} alt="FonePay QR" className="max-w-[50px] h-auto" />
            ) : (
              <p className={`text-[8px] ${dm ? 'text-gray-500' : 'text-gray-500'}`}>No QR code uploaded</p>
            )}
          </div>
        </div>
      ) : (
        <>
          {selectedBankConfigs.map((config) => (
            <div key={config.slot} className={`mb-2 pb-2 border-b ${dm ? 'border-gray-800' : 'border-gray-200'}`}>
              <div className={`text-[8px] font-medium mb-1 ${dm ? 'text-gray-400' : 'text-gray-600'}`}>{config.label}</div>
              {config.slot === 'C' && config.includeQrCode ? (
                <div className={`p-1 rounded border ${dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  {config.qrImage ? (
                    <img src={config.qrImage} alt="FonePay QR" className="max-w-[50px] h-auto" />
                  ) : (
                    <p className={`text-[8px] ${dm ? 'text-gray-500' : 'text-gray-500'}`}>No QR code uploaded</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-0.5">
                  <div>
                    <Label className={`text-[7px] ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Bank</Label>
                    <Input
                      value={config.bankName || ''}
                      disabled
                      className={`mt-0 text-[9px] h-5 ${inputCls(false)}`}
                      placeholder="Bank name"
                    />
                  </div>
                  <div>
                    <Label className={`text-[7px] ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Account Name</Label>
                    <Input
                      value={config.accountName || ''}
                      disabled
                      className={`mt-0 text-[9px] h-5 ${inputCls(false)}`}
                      placeholder="Account name"
                    />
                  </div>
                  <div>
                    <Label className={`text-[7px] ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Account Number</Label>
                    <Input
                      value={config.accountNumber || ''}
                      disabled
                      className={`mt-0 text-[9px] h-5 ${inputCls(false)}`}
                      placeholder="Account number"
                    />
                  </div>
                </div>
              )}
              {config.slot !== 'C' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-0.5 mt-0.5">
                  <div>
                    <Label className={`text-[7px] ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Branch</Label>
                    <Input
                      value={config.branch || ''}
                      disabled
                      className={`mt-0 text-[9px] h-5 ${inputCls(false)}`}
                      placeholder="Branch"
                    />
                  </div>
                  <div className="flex items-center gap-1 pt-1.5">
                    <Checkbox
                      id={`include-qr-${config.slot}`}
                      checked={config.includeQrCode || false}
                      disabled
                      className="w-2 h-2"
                    />
                    <label htmlFor={`include-qr-${config.slot}`} className={`text-[7px] ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
                      Include FonePay QR
                    </label>
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Client Signatory Section */}
      {sectionHeader('For the Client', 'Signing party and witness (Page 7)')}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {clientSignatoryFields.map(renderField)}
      </div>

      {/* Service Provider Signatory Section */}
      {sectionHeader('For the Service Provider', 'Nest Nepal signing party and witness (Page 7)')}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {spSignatoryFields.map(renderField)}
      </div>

      {/* Annex B — cost line items */}
      {sectionHeader('Annex B: Cost of Services', 'Line items that print in the contract\'s cost table')}
      <div className={card}>
        <div className="space-y-2">
          {costItems.map((row, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-6">
                <Label className={`${labelCls} ${i > 0 ? 'sr-only' : ''}`}>Description</Label>
                <Input
                  value={row.description}
                  onChange={(e) => updateCostRow(i, { description: e.target.value })}
                  placeholder={`e.g. Google Workspace Business Starter — Annual (${fields.numUsers || '25'} users)`}
                  className={inputCls(false)}
                />
              </div>
              <div className="col-span-2">
                <Label className={`${labelCls} ${i > 0 ? 'sr-only' : ''}`}>Qty</Label>
                <Input type="number" min={0} value={row.qty} onChange={(e) => updateCostRow(i, { qty: e.target.value })} className={inputCls(false)} />
              </div>
              <div className="col-span-3">
                <Label className={`${labelCls} ${i > 0 ? 'sr-only' : ''}`}>Unit Price (NRs.)</Label>
                <Input type="number" min={0} value={row.unitPrice} onChange={(e) => updateCostRow(i, { unitPrice: e.target.value })} className={inputCls(false)} />
              </div>
              <div className="col-span-1 flex justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => removeCostRow(i)} disabled={costItems.length === 1} className="h-9 w-9 p-0">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addCostRow} className="mt-3 gap-1.5">
          <Plus className="w-3 h-3" /> Add Line Item
        </Button>
        <p className={`text-[11px] mt-2 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
          Empty rows are skipped in the PDF. Grand total is calculated automatically.
        </p>
      </div>

      {/* Live preview — mirrors RfP's preview chrome (letterhead bg, zoom,
          fullscreen) but renders the flowing contract template. */}
      {sectionHeader('Preview', 'Live render of the contract on the configured letterhead')}
      <div className={`${card} py-3 flex items-center gap-4 flex-wrap`}>
        <label htmlFor="contract-use-letterhead" className={`flex items-center gap-2 text-xs cursor-pointer ${dm ? 'text-gray-300' : 'text-gray-700'}`} title="Off = plain white A4 (for printing on pre-printed letterhead paper or clean exports). On = stamps the configured letterhead image on every page.">
          <Switch
            id="contract-use-letterhead"
            checked={useLetterhead}
            onCheckedChange={setUseLetterhead}
          />
          <span>Use letterhead{!useLetterhead && <span className={`ml-2 italic ${dm ? 'text-amber-400' : 'text-amber-600'}`}>· blank page</span>}</span>
        </label>
        <label htmlFor="contract-show-qr" className={`flex items-center gap-2 text-xs cursor-pointer ${dm ? 'text-gray-300' : 'text-gray-700'}`} title="Off = no QR stamped on the preview or the downloaded PDF. On = QR appears at every per-page position (anchor coords).">
          <Switch
            id="contract-show-qr"
            checked={showQrCode}
            onCheckedChange={setShowQrCode}
          />
          <span>Show QR{!showQrCode && <span className={`ml-2 italic ${dm ? 'text-amber-400' : 'text-amber-600'}`}>· hidden</span>}</span>
        </label>
        {/* HTML template is now the only render path — toggle removed
            so the user can't accidentally switch back to the React
            ContractPreview. The state stays in this component (locked
            to `true`) so the rest of the render branches don't need
            to change. */}
        {/* Contract-length slider lives in its own card under
            QuickFillFromReply now — see the JSX block below the
            QuickFillFromReply component. */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // Snapshot: sections (per category) + QR anchors + toggle prefs.
            saveUserDefaultStructure(categoryKey, sections);
            saveUserDefaultContractAnchors(loadContractAnchors());
            saveUserDefaultToggles({ useLetterhead, showQrCode, useHtmlTemplate });
            toast({
              title: 'Saved as default',
              description: `Pages & Sections (${CONTRACT_CATEGORY_LABELS[categoryKey] ?? categoryKey}) · QR layout · toggles. Future contracts in this category will start from this state.`,
            });
          }}
          className="gap-1.5 h-8"
          title="Snapshot current Pages & Sections (this category), QR layout, and toolbar toggles as the new defaults. Used by 'Reset to default' and applied on next page load."
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Save as default
        </Button>
        <Button
          variant={designerMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => setDesignerMode(!designerMode)}
          className="gap-1.5 h-8"
          style={designerMode ? { backgroundColor: '#0F766E', color: 'white' } : {}}
          title="Toggle designer mode to drag and position QR codes"
        >
          <Move className="w-3.5 h-3.5" /> {designerMode ? 'Exit designer' : 'Edit layout'}
        </Button>
        {designerMode && (
          <>
            <Input
              type="number"
              min="1"
              max="20"
              value={newQrPage}
              onChange={(e) => setNewQrPage(e.target.value)}
              className="w-16 h-8 text-xs"
              placeholder="Page"
              title="Page number to add QR code"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const anchors = loadContractAnchors();
                const pageNum = parseInt(newQrPage) || 1;
                const newId = `qr_code_${Date.now()}`;
                const newAnchor = { id: newId, kind: 'qr' as const, x: 50, y: 50, width: 30, height: 30, page: pageNum };
                saveContractAnchors([...anchors, newAnchor]);
                // Trigger re-render by dispatching custom event
                window.dispatchEvent(new Event('contract-anchors-update'));
              }}
              className="gap-1.5 h-8"
              title={`Add new QR code to page ${newQrPage}`}
            >
              <QrCode className="w-3.5 h-3.5" /> Add QR
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm('Remove all QR codes?')) {
                  saveContractAnchors([]);
                  window.dispatchEvent(new Event('contract-anchors-update'));
                }
              }}
              className="gap-1.5 h-8"
              title="Remove all QR codes"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear all
            </Button>
            <Input
              type="number"
              min="1"
              max="20"
              placeholder="To page"
              className="w-16 h-8 text-xs"
              title="Target page to copy the selected QR's coordinates onto"
              id="copy-qr-target-page"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const targetPageInput = document.getElementById('copy-qr-target-page') as HTMLInputElement;
                const targetPage = parseInt(targetPageInput?.value || '0') || 0;
                if (targetPage < 1) {
                  toast({ title: 'Pick a target page', description: 'Enter a page number (1+) to copy the QR onto.' });
                  return;
                }
                const anchors = loadContractAnchors();
                // Source: the QR the user last clicked in the preview.
                // Fall back to the universal `qr_code` anchor if nothing
                // is selected (first-time use, or after deletion).
                const src = (selectedQrAnchorId && anchors.find(a => a.id === selectedQrAnchorId && a.kind === 'qr'))
                  || anchors.find(a => a.id === 'qr_code' && a.kind === 'qr')
                  || anchors.find(a => a.kind === 'qr');
                if (!src) {
                  toast({ title: 'No QR to copy', description: 'No QR anchor is configured yet. Drag the QR somewhere first.' });
                  return;
                }
                // Match the drag-fork id convention so subsequent drags on
                // the target page mutate the same anchor (no duplicates).
                const targetId = `qr_code__p${targetPage}`;
                const existingIdx = anchors.findIndex(a => a.id === targetId);
                const newAnchor: ContractAnchor = {
                  id: targetId,
                  kind: 'qr',
                  x: src.x,
                  y: src.y,
                  width: src.width,
                  height: src.height,
                  page: targetPage,
                };
                const next = [...anchors];
                if (existingIdx >= 0) next[existingIdx] = newAnchor;
                else next.push(newAnchor);
                saveContractAnchors(next);
                window.dispatchEvent(new Event('contract-anchors-update'));
                const sourceLabel = src.page === 0 ? 'default' : `page ${src.page}`;
                toast({
                  title: existingIdx >= 0 ? 'QR updated' : 'QR copied',
                  description: `Coordinates from ${sourceLabel} → page ${targetPage} (x=${src.x.toFixed(1)} mm, y=${src.y.toFixed(1)} mm).`,
                });
              }}
              className="gap-1.5 h-8"
              title="Copy the selected QR's coordinates to the target page (overwrites any existing QR on that page)"
            >
              Copy to page
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Open the PDF in a hidden iframe and fire the browser's
                // print dialog from there. Avoids two failure modes of
                // the previous `window.open` approach: (1) Brave/Chrome
                // route blob:application/pdf URLs to download instead of
                // inline preview, so a new tab just downloaded the file;
                // (2) `printWindow.onload` fires before the PDF viewer
                // plugin finishes parsing, so `.print()` runs against
                // an empty document. Iframes render PDFs reliably with
                // the built-in viewer in the current tab.
                const id = resolveDocumentId();
                buildPdf(id).then(pdf => {
                  const pdfBlob = pdf.output('blob');
                  const pdfUrl = URL.createObjectURL(pdfBlob);
                  const iframe = document.createElement('iframe');
                  iframe.style.position = 'fixed';
                  iframe.style.right = '0';
                  iframe.style.bottom = '0';
                  iframe.style.width = '0';
                  iframe.style.height = '0';
                  iframe.style.border = '0';
                  iframe.src = pdfUrl;
                  iframe.onload = () => {
                    try {
                      iframe.contentWindow?.focus();
                      iframe.contentWindow?.print();
                    } catch (err) {
                      console.error('Print dialog failed:', err);
                      toast({
                        title: 'Print failed',
                        description: 'Browser blocked the print dialog. Use "Download & Save" instead.',
                        variant: 'destructive',
                      });
                    }
                  };
                  document.body.appendChild(iframe);
                  // Clean up after a generous delay so the print dialog
                  // and any user "Save as PDF" flow finish reading the
                  // blob before it's revoked.
                  setTimeout(() => {
                    URL.revokeObjectURL(pdfUrl);
                    iframe.remove();
                  }, 60_000);
                }).catch((err) => {
                  console.error('PDF build failed for print:', err);
                  toast({ title: 'Print failed', description: 'Could not build the PDF.', variant: 'destructive' });
                });
              }}
              className="gap-1.5 h-8"
              title="Open the system print dialog with the current contract PDF"
            >
              <Printer className="w-3.5 h-3.5" /> Print to PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadPdfAndSaveToDatabase}
              className="gap-1.5 h-8"
              title="Download PDF and save to database"
            >
              <Download className="w-3.5 h-3.5" /> Download & Save
            </Button>
          </>
        )}
        <span className="flex-1" />
        {editedHtml ? (
          <>
            <Badge variant="outline" className="gap-1.5 text-[10px]" style={{ borderColor: '#0F766E', color: '#0F766E' }}>
              <PenLine className="w-3 h-3" /> Editor changes applied
            </Badge>
            <Button variant="outline" size="sm" onClick={clearEdits} className="gap-1.5 h-8">
              Reset to template
            </Button>
            <Button variant="outline" size="sm" onClick={openEditor} className="gap-1.5 h-8">
              <ExternalLink className="w-3.5 h-3.5" /> Reopen editor
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={openEditor} className="gap-1.5 h-8" title="Open the contract in a Word-style editor in a new tab. Edits sync back here automatically.">
            <PenLine className="w-3.5 h-3.5" /> Open in editor
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Button>
        )}
      </div>
      {useHtmlTemplate ? (
        // HTML-template preview path — render the effective template
        // (from Settings → Format Templates, override-aware) with all
        // current form-field tokens substituted, in a sandboxed
        // iframe. The Downloads code path mirrors this rendering off-
        // screen so the captured PDF matches what's shown here.
        <div className={cn('rounded-xl border overflow-hidden', dm ? 'bg-gray-950 border-gray-800' : 'bg-white border-gray-200')}>
          <iframe
            title="Contract HTML template preview"
            sandbox="allow-same-origin"
            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:16px 0;background:#f3f4f6}.contract-page{margin:0 auto 16px;box-shadow:0 2px 10px rgba(0,0,0,0.10)}</style></head><body>${fillContractHtmlTemplate(getEffectiveContractHtmlTemplateForLength(contractLength), { ...contractFieldBag, qr_data_url: showQrCode ? (qrCodeDataUrl || '') : '', page_num: '1', total_pages: String(contractLength) } as unknown as Record<string, string>)}</body></html>`}
            key={`${contractLength}-${templateBump}`}
            className="block bg-transparent"
            style={{ width: '100%', height: 900, border: 0 }}
          />
        </div>
      ) : (
        <ContractPreview fields={contractFieldBag} sections={sections} darkMode={dm} useLetterhead={useLetterhead} editedHtml={editedHtml} qrCodeDataUrl={showQrCode ? qrCodeDataUrl : null} designerMode={designerMode} onAnchorsChange={(anchors) => saveContractAnchors(anchors)} onSelectedAnchorChange={setSelectedQrAnchorId} />
      )}

      {/* PDF Tools — embed DCAP's PdfToolsPanel so admins can
          post-process the downloaded contract (merge with cover letter,
          reorder pages, rotate, etc.) without leaving the tab. */}
      <Collapsible open={showPdfTools} onOpenChange={setShowPdfTools}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className={`${card} w-full justify-start gap-2`}>
            <FileText className="w-4 h-4" />
            PDF Tools (merge / split / rotate / reorder)
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showPdfTools ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <PdfToolsPanel darkMode={dm} defaultDownloadName={liveContractId || 'contract-edited'} />
        </CollapsibleContent>
      </Collapsible>

      {/* Contract ID - inconspicuous label at bottom */}
      <div className={`flex items-center justify-between px-2 py-1 ${dm ? 'text-gray-600' : 'text-gray-400'}`}>
        <span className="text-[10px]">Contract ID: <code className="font-mono">{liveContractId}</code></span>
        {contractIdOverride !== null ? (
          <Button variant="ghost" size="sm" onClick={() => setContractIdOverride(null)} className="h-6 text-[10px]">
            Use auto
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setContractIdOverride(liveContractId)} className="h-6 text-[10px]">
            Edit
          </Button>
        )}
      </div>

      {/* Pages & Sections (admin only) — port of SLA's section manager.
          Admins reorder/add/delete/page-break clauses; bodies edit via
          the same TipTap SectionEditor SLA uses. Persists per category
          to localStorage. */}
      {isAdmin && (
        <div className={card}>
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="w-full flex items-center justify-between group">
              <div className="flex items-center gap-2 flex-wrap">
                <Label className={labelCls}>Pages &amp; Sections (admin)</Label>
                <Badge variant="outline" className="text-[9px] h-4">{sections.length} sections</Badge>
                <Badge variant="outline" className="text-[9px] h-4">{CONTRACT_CATEGORY_LABELS[categoryKey] ?? categoryKey}</Badge>
              </div>
              <ChevronDown className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Label className={`${labelCls} normal-case font-normal`}>Editing</Label>
                  <Select value={categoryKey} onValueChange={handleCategoryChange}>
                    <SelectTrigger className="h-8 text-xs w-[200px]">
                      <SelectValue placeholder="Pick a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTRACT_CATEGORY_KEYS.map((k) => (
                        <SelectItem key={k} value={k} className="text-xs">{CONTRACT_CATEGORY_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className={`text-[11px] ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
                    Edits are saved to this browser per category. <code>{'{customer_name}'}</code>, <code>{'{product}'}</code>, <code>{'{amount}'}</code> etc. substitute at PDF time.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={addSection} className="h-7 text-xs gap-1.5">
                    <Plus className="w-3 h-3" /> Add section
                  </Button>
                  <Button variant="outline" size="sm" onClick={resetSections} className="h-7 text-xs gap-1.5">
                    <RotateCcw className="w-3 h-3" /> Reset to default
                  </Button>
                </div>
              </div>

              {sections.map((sec, idx) => (
                <div
                  key={sec.id}
                  onDragOver={(e) => {
                    if (!dragSrcSection || dragSrcSection === sec.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverSection !== sec.id) setDragOverSection(sec.id);
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    if (dragOverSection === sec.id) setDragOverSection(null);
                  }}
                  onDrop={(e) => {
                    if (!dragSrcSection) return;
                    e.preventDefault();
                    reorderSections(dragSrcSection, sec.id);
                    setDragSrcSection(null);
                    setDragOverSection(null);
                  }}
                  className={cn(
                    'p-3 rounded-xl border transition-colors',
                    dm ? 'bg-gray-900/40 border-gray-700' : 'bg-white/70 border-gray-200',
                    sec.forcePageBreakBefore && (dm ? 'border-l-4 border-l-teal-500' : 'border-l-4 border-l-teal-400'),
                    sec.special && (dm ? 'bg-amber-950/20' : 'bg-amber-50/60'),
                    dragSrcSection === sec.id && 'opacity-50',
                    dragOverSection === sec.id && dragSrcSection !== sec.id && (dm ? 'ring-2 ring-teal-500' : 'ring-2 ring-teal-400'),
                  )}
                >
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', sec.id);
                        setDragSrcSection(sec.id);
                      }}
                      onDragEnd={() => {
                        setDragSrcSection(null);
                        setDragOverSection(null);
                      }}
                      className={cn(
                        'inline-flex items-center justify-center h-7 w-5 rounded cursor-grab active:cursor-grabbing',
                        dm ? 'text-gray-500 hover:bg-gray-800 hover:text-gray-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600',
                      )}
                      title="Drag to reorder section"
                    >
                      <GripVertical className="w-4 h-4" />
                    </span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${dm ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <Input
                      value={sec.heading}
                      onChange={(e) => updateSection(sec.id, { heading: e.target.value })}
                      placeholder="Section heading"
                      className="h-8 text-sm font-semibold flex-1 min-w-[200px]"
                    />
                    <Input
                      value={sec.numeral ?? ''}
                      onChange={(e) => updateSection(sec.id, { numeral: e.target.value })}
                      placeholder="No."
                      className="h-8 text-xs w-16 text-center"
                      title="Optional manual numeral (e.g. 7.). Leave blank to omit numbering."
                    />
                    <label className={`inline-flex items-center gap-1.5 px-2 h-8 rounded border text-[11px] cursor-pointer ${sec.forcePageBreakBefore ? (dm ? 'bg-teal-900/30 border-teal-700 text-teal-200' : 'bg-teal-50 border-teal-300 text-teal-700') : (dm ? 'border-gray-700' : 'border-gray-300')}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(sec.forcePageBreakBefore)}
                        onChange={(e) => updateSection(sec.id, { forcePageBreakBefore: e.target.checked })}
                        className="w-3 h-3"
                      />
                      <ScissorsSquareDashedBottom className="w-3 h-3" /> Start on new page
                    </label>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="sm" onClick={() => moveSection(idx, -1)} disabled={idx === 0} className="h-7 w-7 p-0" title="Move up">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => moveSection(idx, 1)} disabled={idx === sections.length - 1} className="h-7 w-7 p-0" title="Move down">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteSection(sec.id)} className="h-7 w-7 p-0 text-red-500 hover:text-red-600" title="Delete section">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  {sec.special ? (
                    <p className={`text-xs italic px-2 py-2 rounded ${dm ? 'text-amber-300 bg-amber-950/30' : 'text-amber-700 bg-amber-100/60'}`}>
                      Auto-rendered section ({sec.special === 'signature_page' ? 'signature table' : 'cost-of-services table'}) — body text is ignored at render time. Use the form above to drive the content.
                    </p>
                  ) : (
                    <>
                      <SectionBodyEditor
                        value={sec.body_html}
                        onChange={(html) => updateSection(sec.id, { body_html: html })}
                        darkMode={dm}
                        miniPreviewHeading={sec.numeral ? `${sec.numeral} ${sec.heading}` : sec.heading}
                      />
                      {/* Sub-sections */}
                      {sec.subSections && sec.subSections.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <Label className={`${labelCls} normal-case font-normal`}>Sub-sections</Label>
                          {sec.subSections.map((subSec, subIdx) => (
                            <div
                              key={subSec.id}
                              onDragOver={(e) => {
                                if (!dragSrcSubSection || dragSrcSubSection.sectionId !== sec.id || dragSrcSubSection.subId === subSec.id) return;
                                e.preventDefault();
                                e.stopPropagation();
                                e.dataTransfer.dropEffect = 'move';
                                if (!dragOverSubSection || dragOverSubSection.subId !== subSec.id) {
                                  setDragOverSubSection({ sectionId: sec.id, subId: subSec.id });
                                }
                              }}
                              onDragLeave={(e) => {
                                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                                if (dragOverSubSection?.subId === subSec.id) setDragOverSubSection(null);
                              }}
                              onDrop={(e) => {
                                if (!dragSrcSubSection || dragSrcSubSection.sectionId !== sec.id) return;
                                e.preventDefault();
                                e.stopPropagation();
                                reorderSubSections(sec.id, dragSrcSubSection.subId, subSec.id);
                                setDragSrcSubSection(null);
                                setDragOverSubSection(null);
                              }}
                              className={cn(
                                'p-2 rounded-lg border transition-colors',
                                dm ? 'bg-gray-900/40 border-gray-700' : 'bg-white/70 border-gray-200',
                                subSec.forcePageBreakBefore && (dm ? 'border-l-4 border-l-teal-500' : 'border-l-4 border-l-teal-400'),
                                dragSrcSubSection?.subId === subSec.id && 'opacity-50',
                                dragOverSubSection?.subId === subSec.id && dragSrcSubSection?.subId !== subSec.id && (dm ? 'ring-2 ring-teal-500' : 'ring-2 ring-teal-400'),
                              )}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('text/plain', subSec.id);
                                    setDragSrcSubSection({ sectionId: sec.id, subId: subSec.id });
                                  }}
                                  onDragEnd={() => {
                                    setDragSrcSubSection(null);
                                    setDragOverSubSection(null);
                                  }}
                                  className={cn(
                                    'inline-flex items-center justify-center h-6 w-4 rounded cursor-grab active:cursor-grabbing',
                                    dm ? 'text-gray-500 hover:bg-gray-800 hover:text-gray-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600',
                                  )}
                                  title="Drag to reorder sub-section"
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                </span>
                                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${dm ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                                  {String(subIdx + 1).padStart(2, '0')}
                                </span>
                                <Input
                                  value={subSec.heading}
                                  onChange={(e) => updateSubSection(sec.id, subSec.id, { heading: e.target.value })}
                                  placeholder="Sub-section heading"
                                  className="h-7 text-xs font-semibold flex-1"
                                />
                                <label className={`inline-flex items-center gap-1.5 px-2 h-7 rounded border text-[11px] cursor-pointer whitespace-nowrap ${subSec.forcePageBreakBefore ? (dm ? 'bg-teal-900/30 border-teal-700 text-teal-200' : 'bg-teal-50 border-teal-300 text-teal-700') : (dm ? 'border-gray-700' : 'border-gray-300')}`}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(subSec.forcePageBreakBefore)}
                                    onChange={(e) => updateSubSection(sec.id, subSec.id, { forcePageBreakBefore: e.target.checked })}
                                    className="w-3 h-3"
                                  />
                                  <ScissorsSquareDashedBottom className="w-3 h-3" /> Start on new page
                                </label>
                                <div className="flex items-center gap-0.5">
                                  <Button variant="ghost" size="sm" onClick={() => moveSubSection(sec.id, subIdx, -1)} disabled={subIdx === 0} className="h-6 w-6 p-0" title="Move up">
                                    <ArrowUp className="w-3 h-3" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => moveSubSection(sec.id, subIdx, 1)} disabled={subIdx === (sec.subSections?.length ?? 0) - 1} className="h-6 w-6 p-0" title="Move down">
                                    <ArrowDown className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deleteSubSection(sec.id, subSec.id)}
                                    className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                                    title="Delete sub-section"
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                              <SectionBodyEditor
                                value={subSec.body_html}
                                onChange={(html) => updateSubSection(sec.id, subSec.id, { body_html: html })}
                                darkMode={dm}
                                miniPreviewHeading={subSec.heading}
                              />
                            </div>
                          ))}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addSubSection(sec.id)}
                            className="h-7 text-xs gap-1.5"
                          >
                            <Plus className="w-3 h-3" /> Add sub-section
                          </Button>
                        </div>
                      )}
                      {(!sec.subSections || sec.subSections.length === 0) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addSubSection(sec.id)}
                          className="mt-2 h-7 text-xs gap-1.5"
                        >
                          <Plus className="w-3 h-3" /> Add sub-section
                        </Button>
                      )}
                    </>
                  )}
                </div>
              ))}

              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={addSection} className="gap-1.5">
                  <Plus className="w-3 h-3" /> Add another section
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Custom .docx template — upload once, fill from the form, download. */}
      <Collapsible open={showCustomTemplate} onOpenChange={setShowCustomTemplate}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className={`${card} w-full justify-start gap-2`}>
            <FileText className="w-4 h-4" />
            Your own .docx template
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showCustomTemplate ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <div className={`${card} p-4`}>
            <p className={`text-[11px] mb-3 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
              Upload a Word file with placeholder markers — the form above fills them, your formatting is preserved
            </p>
            <ContractCustomTemplate fields={contractFieldBag} darkMode={dm} contractId={generatedId || fields.companyAbv ? generatedId : undefined} />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Invoice Upload — Annex C */}
      <div className={card}>
        <h3 className={`text-sm font-medium mb-1 ${dm ? 'text-gray-300' : 'text-gray-700'}`}>Annex C: Proforma Invoice</h3>
        <p className={`text-xs mb-3 ${dm ? 'text-gray-600' : 'text-gray-400'}`}>Duly attached with the agreement (optional)</p>
        <div
          onDragOver={e => e.preventDefault()} onDrop={handleFileDrop}
          onClick={() => fileRef.current?.click()}
          className={`flex flex-col items-center justify-center py-6 rounded-lg cursor-pointer transition-all hover:opacity-80 border-2 border-dashed ${dm ? 'border-gray-700 bg-gray-800/50' : 'border-gray-300 bg-gray-100'}`}
        >
          <Upload className={`w-7 h-7 mb-2 ${dm ? 'text-gray-600' : 'text-gray-400'}`} />
          <p className={`text-sm ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
            {invoiceFile ? invoiceFile.name : 'Drop PDF here or click to browse'}
          </p>
          <p className={`text-xs mt-1 ${dm ? 'text-gray-600' : 'text-gray-400'}`}>Max 2MB, PDF only</p>
        </div>
        <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
        {invoiceFile && (
          <div className="mt-3 flex items-center gap-3">
            <FileText className="w-4 h-4" style={{ color: ACCENT }} />
            <span className={`text-sm ${dm ? 'text-gray-300' : 'text-gray-700'}`}>{invoiceFile.name}</span>
            <Input type="number" min={1} placeholder="Insert at page #" value={invoicePage}
              onChange={e => setInvoicePage(e.target.value)}
              className={`ml-auto w-36 ${dm ? 'bg-gray-800 border-gray-700 text-white' : ''}`} />
          </div>
        )}
      </div>


      {/* Placeholder Mapping */}
      <Collapsible open={showMapping} onOpenChange={setShowMapping}>
        <CollapsibleTrigger asChild>
          <button className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium ${dm ? 'bg-gray-900 border-gray-800 text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-500'} border`}>
            <span>Full Placeholder Mapping</span>
            {showMapping ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className={`mt-1 rounded-xl px-4 pb-3 pt-2 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border`}>
          <div className="space-y-1">
            <p className={`text-[10px] uppercase tracking-wider font-semibold pb-1 ${dm ? 'text-gray-600' : 'text-gray-400'}`}>User-Entered Fields</p>
            {fieldMappings.map(f => (
              <div key={f.id} className={`flex justify-between text-xs py-1 ${dm ? 'border-gray-800' : 'border-gray-200'} border-b`}>
                <span className={`${dm ? 'text-gray-400' : 'text-gray-500'} flex items-center gap-1`}>
                  {f.label}
                  {AUTO_FIELDS.has(f.id) && <Wand2 className="w-2.5 h-2.5" style={{ color: ACCENT }} />}
                </span>
                <Badge variant="secondary" className="font-mono text-xs" style={{ color: ACCENT }}>{f.placeholder.replace(/<<|>>/g, '')}</Badge>
              </div>
            ))}
            <p className={`text-[10px] uppercase tracking-wider font-semibold pt-3 pb-1 ${dm ? 'text-gray-600' : 'text-gray-400'}`}>System-Generated Fields</p>
            {autoPlaceholders.map(p => (
              <div key={p.tag} className={`flex justify-between text-xs py-1 ${dm ? 'border-gray-800' : 'border-gray-200'} border-b`}>
                <span className={`${dm ? 'text-gray-400' : 'text-gray-500'} flex items-center gap-1`}>
                  {p.label}
                  <Wand2 className="w-2.5 h-2.5" style={{ color: ACCENT }} />
                </span>
                <Badge variant="secondary" className="font-mono text-xs" style={{ color: ACCENT }}>{p.tag.replace(/<<|>>/g, '')}</Badge>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Progress Bar */}
      {step >= 0 && (
        <div className={card}>
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-1.5 text-xs" style={{ color: i <= step ? ACCENT : dm ? '#555' : '#aaa' }}>
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : i === step && !done ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="w-4 h-4 rounded-full" style={{ border: `2px solid ${i <= step ? ACCENT : dm ? '#444' : '#ccc'}` }} />}
                <span className="hidden sm:inline">{s}</span>
              </div>
            ))}
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${dm ? 'bg-gray-800' : 'bg-gray-200'}`}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: ACCENT }} />
          </div>
        </div>
      )}

      {/* Result */}
      {done && (
        <div className="rounded-xl p-6 text-center" style={{ background: `${ACCENT}11`, border: `1px solid ${ACCENT}33` }}>
          <CheckCircle2 className="w-9 h-9 mx-auto mb-2" style={{ color: ACCENT }} />
          <p className={`text-lg font-semibold mb-1 ${dm ? 'text-white' : 'text-gray-900'}`}>Contract Generated!</p>
          <p className={`text-sm mb-4 ${dm ? 'text-gray-400' : 'text-gray-500'}`}>ID: <code style={{ color: ACCENT }}>{generatedId}</code></p>
          <Button onClick={downloadPdf} style={{ background: ACCENT }} className="text-white gap-2">
            <Download className="w-4 h-4" /> Download PDF
          </Button>
        </div>
      )}

      {!done && (
        <div className="space-y-3">
          <div className={`flex items-center gap-3 rounded-lg px-4 py-3 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border`}>
            <Checkbox checked={isSigned} onCheckedChange={(val) => setIsSigned(!!val)} id="signed-check" />
            <Label htmlFor="signed-check" className={`text-sm cursor-pointer ${dm ? 'text-gray-300' : 'text-gray-700'}`}>
              Generate Signed
            </Label>
            {isSigned ? (
              <Badge variant="secondary" className="ml-auto text-xs" style={{ color: '#22c55e', background: '#22c55e22' }}>
                Digital signature will be added
              </Badge>
            ) : (
              <span className={`ml-auto text-xs ${dm ? 'text-gray-600' : 'text-gray-400'}`}>Unsigned</span>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={runGeneration} disabled={step >= 0 && !done} className="flex-1 text-white" style={{ background: ACCENT }}>
              {isSigned ? 'Generate Signed Contract' : 'Generate Unsigned Contract'}
            </Button>
            <Button onClick={downloadDocx} variant="outline" className="gap-1.5 sm:w-auto" title="Download as Word (.docx) — uses the built-in formatted template, no upload needed">
              <Download className="w-4 h-4" /> Download .docx
            </Button>
            <Button onClick={downloadPdf} variant="outline" className="gap-1.5 sm:w-auto">
              <Download className="w-4 h-4" /> Download PDF
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContractTab;
