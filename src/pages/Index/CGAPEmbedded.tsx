import React from 'react';
import ContractTab from '@/pages/CGAP/ContractTab';
import AddendumTab from '@/pages/CGAP/AddendumTab';
import QuickAmendmentTab from '@/pages/CGAP/QuickAmendmentTab';
import RequestForPaymentTab from '@/pages/CGAP/RequestForPaymentTab';
import SettingsTab from '@/pages/CGAP/SettingsTab';
import ContractsDatabase from '@/pages/CGAP/ContractsDatabase';
import RichDocumentEditor from '@/components/RichDocumentEditor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FileText, FilePlus, Zap, Settings, Database, Receipt, ChevronDown, PenLine } from 'lucide-react';
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

const CGAPEmbedded: React.FC<CGAPEmbeddedProps> = ({ darkMode }) => {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="contract" className="w-full">
        <TabsList className={`grid w-full grid-cols-6 ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
          <TabsTrigger value="contract" className={`flex items-center gap-1 text-xs ${darkMode ? 'data-[state=active]:bg-blue-900/50 data-[state=active]:text-blue-300' : 'data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700'}`}>
            <FileText className="w-3.5 h-3.5" /> Contract
          </TabsTrigger>
          <TabsTrigger value="addendum" className={`flex items-center gap-1 text-xs ${darkMode ? 'data-[state=active]:bg-amber-900/50 data-[state=active]:text-amber-300' : 'data-[state=active]:bg-amber-100 data-[state=active]:text-amber-700'}`}>
            <FilePlus className="w-3.5 h-3.5" /> Addendum
          </TabsTrigger>
          <TabsTrigger value="amendment" className={`flex items-center gap-1 text-xs ${darkMode ? 'data-[state=active]:bg-purple-900/50 data-[state=active]:text-purple-300' : 'data-[state=active]:bg-purple-100 data-[state=active]:text-purple-700'}`}>
            <Zap className="w-3.5 h-3.5" /> Amendment
          </TabsTrigger>
          <TabsTrigger value="rfp" className={`flex items-center gap-1 text-xs ${darkMode ? 'data-[state=active]:bg-emerald-900/50 data-[state=active]:text-emerald-300' : 'data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-700'}`}>
            <Receipt className="w-3.5 h-3.5" /> RfP
          </TabsTrigger>
          <TabsTrigger value="database" className={`flex items-center gap-1 text-xs ${darkMode ? 'data-[state=active]:bg-green-900/50 data-[state=active]:text-green-300' : 'data-[state=active]:bg-green-100 data-[state=active]:text-green-700'}`}>
            <Database className="w-3.5 h-3.5" /> Database
          </TabsTrigger>
          <TabsTrigger value="settings" className={`flex items-center gap-1 text-xs ${darkMode ? 'data-[state=active]:bg-gray-700 data-[state=active]:text-white' : ''}`}>
            <Settings className="w-3.5 h-3.5" /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contract" className="mt-4">
          <ContractTab darkMode={darkMode} />
          <EditorSection storageKey="cgap-editor-contract" title="Contract" darkMode={darkMode} templateType="contract" />
        </TabsContent>
        <TabsContent value="addendum" className="mt-4">
          <AddendumTab darkMode={darkMode} />
          <EditorSection storageKey="cgap-editor-addendum" title="Addendum" darkMode={darkMode} templateType="addendum" />
        </TabsContent>
        <TabsContent value="amendment" className="mt-4">
          <QuickAmendmentTab darkMode={darkMode} />
          <EditorSection storageKey="cgap-editor-amendment" title="Amendment" darkMode={darkMode} />
        </TabsContent>
        <TabsContent value="rfp" className="mt-4">
          <RequestForPaymentTab darkMode={darkMode} />
          <EditorSection storageKey="cgap-editor-rfp" title="Request for Payment" darkMode={darkMode} templateType="rfp" />
        </TabsContent>
        <TabsContent value="database" className="mt-4">
          <ContractsDatabase darkMode={darkMode} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsTab darkMode={darkMode} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CGAPEmbedded;
