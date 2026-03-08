import React, { useState } from 'react';
import { useCGAP } from '@/contexts/CGAPContext';
import CGAPLogin from '@/pages/CGAP/CGAPLogin';
import ContractTab from '@/pages/CGAP/ContractTab';
import AddendumTab from '@/pages/CGAP/AddendumTab';
import QuickAmendmentTab from '@/pages/CGAP/QuickAmendmentTab';
import SettingsTab from '@/pages/CGAP/SettingsTab';
import { FileText, FilePlus, Zap, Settings } from 'lucide-react';

type Tab = 'contract' | 'addendum' | 'amendment' | 'settings';

const TABS: { id: Tab; label: string; icon: React.ReactNode; accent: string; adminOnly?: boolean }[] = [
  { id: 'contract', label: 'Contract', icon: <FileText className="w-3.5 h-3.5" />, accent: '#4F7FFF' },
  { id: 'addendum', label: 'Addendum', icon: <FilePlus className="w-3.5 h-3.5" />, accent: '#F59E0B' },
  { id: 'amendment', label: 'Amendment', icon: <Zap className="w-3.5 h-3.5" />, accent: '#A78BFA' },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-3.5 h-3.5" />, accent: '#888', adminOnly: true },
];

interface CGAPEmbeddedProps {
  darkMode: boolean;
}

const CGAPEmbedded: React.FC<CGAPEmbeddedProps> = ({ darkMode }) => {
  const { isLoggedIn } = useCGAP();
  const [activeTab, setActiveTab] = useState<Tab>('contract');

  if (!isLoggedIn) return <CGAPLogin />;

  const isAdmin = true;
  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="flex gap-1 overflow-x-auto">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-all"
            style={{
              color: activeTab === tab.id ? '#fff' : darkMode ? '#888' : '#666',
              background: activeTab === tab.id ? tab.accent : darkMode ? '#1C1C1C' : '#f3f4f6',
              border: `1px solid ${activeTab === tab.id ? tab.accent : darkMode ? '#2A2A2A' : '#e5e7eb'}`,
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="rounded-xl p-4" style={{ 
        background: darkMode ? '#161616' : '#fafafa', 
        border: `1px solid ${darkMode ? '#2A2A2A' : '#e5e7eb'}` 
      }}>
        {activeTab === 'contract' && <ContractTab />}
        {activeTab === 'addendum' && <AddendumTab />}
        {activeTab === 'amendment' && <QuickAmendmentTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
};

export default CGAPEmbedded;
