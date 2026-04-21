import React from 'react';
import ContractTab from '@/pages/CGAP/ContractTab';
import AddendumTab from '@/pages/CGAP/AddendumTab';
import QuickAmendmentTab from '@/pages/CGAP/QuickAmendmentTab';
import RequestForPaymentTab from '@/pages/CGAP/RequestForPaymentTab';
import SettingsTab from '@/pages/CGAP/SettingsTab';
import ContractsDatabase from '@/pages/CGAP/ContractsDatabase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, FilePlus, Zap, Settings, Database, Receipt } from 'lucide-react';

interface CGAPEmbeddedProps {
  darkMode: boolean;
}

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
        </TabsContent>
        <TabsContent value="addendum" className="mt-4">
          <AddendumTab darkMode={darkMode} />
        </TabsContent>
        <TabsContent value="amendment" className="mt-4">
          <QuickAmendmentTab darkMode={darkMode} />
        </TabsContent>
        <TabsContent value="rfp" className="mt-4">
          <RequestForPaymentTab darkMode={darkMode} />
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
