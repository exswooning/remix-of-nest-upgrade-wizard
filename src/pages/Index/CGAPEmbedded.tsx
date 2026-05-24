import React from 'react';
import ContractTab from '@/pages/CGAP/ContractTab';
import AddendumTab from '@/pages/CGAP/AddendumTab';
import QuickAmendmentTab from '@/pages/CGAP/QuickAmendmentTab';
import SLATab from '@/pages/CGAP/SLATab';
import ServiceOrderTab from '@/pages/CGAP/ServiceOrderTab';
import RequestForPaymentTab from '@/pages/CGAP/RequestForPaymentTab';
import RichDocumentEditor from '@/components/RichDocumentEditor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FileText, FilePlus, Zap, Receipt, ChevronDown, PenLine, ShieldCheck, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CGAPEmbeddedProps {
  darkMode: boolean;
}

const EditorSection: React.FC<{ storageKey: string; title: string; darkMode: boolean; templateType?: 'contract' | 'addendum' | 'rfp' }> = ({ storageKey, title, darkMode, templateType }) => (
  <Collapsible className="mt-4">
    <CollapsibleTrigger className={cn(
      'w-full flex items-center justify-between px-4 py-2.5 rounded-lg border transition-colors',
      darkMode ? 'bg-gray-800 border-gray-700 hover:bg-gray-750 text-gray-100' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-800'
    )}>
      <div className="flex items-center gap-2">
        <PenLine className={cn('w-4 h-4', darkMode ? 'text-blue-300' : 'text-blue-600')} />
        <span className="text-sm font-semibold">Document Editor — {title}</span>
        <span className={cn('text-xs', darkMode ? 'text-gray-400' : 'text-gray-500')}>(Word-style editor, autosaves)</span>
      </div>
      <ChevronDown className="w-4 h-4 transition-transform data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
    <CollapsibleContent className="mt-3">
      <RichDocumentEditor storageKey={storageKey} title={title} darkMode={darkMode} templateType={templateType} />
    </CollapsibleContent>
  </Collapsible>
);

/**
 * CGAP nav — single flat strip with every document type as a sibling.
 * Database lives at the top level alongside Settings, not here.
 */
const CGAPEmbedded: React.FC<CGAPEmbeddedProps> = ({ darkMode }) => {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="contract" className="w-full">
        <TabsList className="glass-tabs-sm grid w-full grid-cols-6 mb-3">
          <TabsTrigger value="contract" className="glass-tab flex items-center gap-1 text-xs py-2">
            <FileText className="w-3 h-3" /> Contract
          </TabsTrigger>
          <TabsTrigger value="addendum" className="glass-tab flex items-center gap-1 text-xs py-2">
            <FilePlus className="w-3 h-3" /> Addendum
          </TabsTrigger>
          <TabsTrigger value="amendment" className="glass-tab flex items-center gap-1 text-xs py-2">
            <Zap className="w-3 h-3" /> Amendment
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
        </TabsList>
        <TabsContent value="contract">
          <ContractTab darkMode={darkMode} />
          <EditorSection storageKey="cgap-editor-contract" title="Contract" darkMode={darkMode} templateType="contract" />
        </TabsContent>
        <TabsContent value="addendum">
          <AddendumTab darkMode={darkMode} />
          <EditorSection storageKey="cgap-editor-addendum" title="Addendum" darkMode={darkMode} templateType="addendum" />
        </TabsContent>
        <TabsContent value="amendment">
          <QuickAmendmentTab darkMode={darkMode} />
          <EditorSection storageKey="cgap-editor-amendment" title="Amendment" darkMode={darkMode} />
        </TabsContent>
        <TabsContent value="sla">
          <SLATab darkMode={darkMode} />
        </TabsContent>
        <TabsContent value="serviceorder">
          <ServiceOrderTab darkMode={darkMode} />
        </TabsContent>
        <TabsContent value="rfp">
          <RequestForPaymentTab darkMode={darkMode} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CGAPEmbedded;
