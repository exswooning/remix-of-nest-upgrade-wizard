import React from 'react';
import ContractTab from '@/pages/CGAP/ContractTab';
import OnePageContractTab from '@/pages/CGAP/OnePageContractTab';
import AddendumTab from '@/pages/CGAP/AddendumTab';
import QuickAmendmentTab from '@/pages/CGAP/QuickAmendmentTab';
import SLATab from '@/pages/CGAP/SLATab';
import ServiceOrderTab from '@/pages/CGAP/ServiceOrderTab';
import RequestForPaymentTab from '@/pages/CGAP/RequestForPaymentTab';
import MOUTab from '@/pages/CGAP/MOUTab';
import DocTemplateTab from '@/pages/CGAP/DocTemplateTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, FilePlus, Zap, Receipt, ShieldCheck, ClipboardList, Handshake, FileSpreadsheet, FileMinus } from 'lucide-react';

interface CGAPEmbeddedProps {
  darkMode: boolean;
}

/**
 * CGAP nav — single flat strip with every document type as a sibling.
 * Database lives at the top level alongside Settings, not here.
 *
 * The collapsible "Document Editor" panels (TipTap-based) that used to
 * hang off Contract/Addendum/Amendment/MOU were removed — each tab now
 * owns its own live preview (RfP-style: letterhead background, zoom,
 * fullscreen) and PDF generator.
 */
const CGAPEmbedded: React.FC<CGAPEmbeddedProps> = ({ darkMode }) => {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="contract" className="w-full">
        <TabsList className="glass-tabs-sm grid w-full grid-cols-9 mb-3">
          <TabsTrigger value="contract" className="glass-tab flex items-center gap-1 text-xs py-2">
            <FileText className="w-3 h-3" /> Contract
          </TabsTrigger>
          <TabsTrigger value="one-page" className="glass-tab flex items-center gap-1 text-xs py-2">
            <FileMinus className="w-3 h-3" /> One-page
          </TabsTrigger>
          <TabsTrigger value="addendum" className="glass-tab flex items-center gap-1 text-xs py-2">
            <FilePlus className="w-3 h-3" /> Addendum
          </TabsTrigger>
          <TabsTrigger value="amendment" className="glass-tab flex items-center gap-1 text-xs py-2">
            <Zap className="w-3 h-3" /> Amendment
          </TabsTrigger>
          <TabsTrigger value="mou" className="glass-tab flex items-center gap-1 text-xs py-2">
            <Handshake className="w-3 h-3" /> MOU
          </TabsTrigger>
          <TabsTrigger value="sla" className="glass-tab flex items-center gap-1 text-xs py-2">
            <ShieldCheck className="w-3 h-3" /> SLA
          </TabsTrigger>
          <TabsTrigger value="serviceorder" className="glass-tab flex items-center gap-1 text-xs py-2">
            <ClipboardList className="w-3 h-3" /> Service Order
          </TabsTrigger>
          <TabsTrigger value="rfp" className="glass-tab flex items-center gap-1 text-xs py-2">
            <Receipt className="w-3 h-3" /> RfP
          </TabsTrigger>
          <TabsTrigger value="doctemplate" className="glass-tab flex items-center gap-1 text-xs py-2">
            <FileSpreadsheet className="w-3 h-3" /> Doc Template
          </TabsTrigger>
        </TabsList>
        <TabsContent value="contract"><ContractTab darkMode={darkMode} /></TabsContent>
        <TabsContent value="one-page"><OnePageContractTab darkMode={darkMode} /></TabsContent>
        <TabsContent value="addendum"><AddendumTab darkMode={darkMode} /></TabsContent>
        <TabsContent value="amendment"><QuickAmendmentTab darkMode={darkMode} /></TabsContent>
        <TabsContent value="mou"><MOUTab darkMode={darkMode} /></TabsContent>
        <TabsContent value="sla"><SLATab darkMode={darkMode} /></TabsContent>
        <TabsContent value="serviceorder"><ServiceOrderTab darkMode={darkMode} /></TabsContent>
        <TabsContent value="rfp"><RequestForPaymentTab darkMode={darkMode} /></TabsContent>
        <TabsContent value="doctemplate"><DocTemplateTab darkMode={darkMode} /></TabsContent>
      </Tabs>
    </div>
  );
};

export default CGAPEmbedded;
