import React, { useState } from 'react';
import { useCGAP } from '@/contexts/CGAPContext';
import CGAPLogin from './CGAPLogin';
import ContractTab from './ContractTab';
import AddendumTab from './AddendumTab';
import QuickAmendmentTab from './QuickAmendmentTab';
import RequestForPaymentTab from './RequestForPaymentTab';
import SettingsTab from './SettingsTab';
import { LogOut, FileText, FilePlus, Zap, Settings, Receipt } from 'lucide-react';

type Tab = 'contract' | 'addendum' | 'amendment' | 'rfp' | 'settings';

const TABS: { id: Tab; label: string; icon: React.ReactNode; accent: string; adminOnly?: boolean }[] = [
  { id: 'contract', label: 'Contract', icon: <FileText className="w-4 h-4" />, accent: '#4F7FFF' },
  { id: 'addendum', label: 'Addendum', icon: <FilePlus className="w-4 h-4" />, accent: '#F59E0B' },
  { id: 'amendment', label: 'Quick Amendment', icon: <Zap className="w-4 h-4" />, accent: '#A78BFA' },
  { id: 'rfp', label: 'Request for Payment', icon: <Receipt className="w-4 h-4" />, accent: '#10B981' },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" />, accent: '#888', adminOnly: true },
];

const CGAPApp: React.FC = () => {
  const { isLoggedIn, logout } = useCGAP();
  const [activeTab, setActiveTab] = useState<Tab>('contract');

  if (!isLoggedIn) return <CGAPLogin />;

  const isAdmin = true; // aryan is the only user and is admin

  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);
  const currentAccent = TABS.find(t => t.id === activeTab)?.accent || '#4F7FFF';

  return (
    <div className="min-h-screen" style={{ background: '#0D0D0D', fontFamily: 'Inter, sans-serif' }}>
      {/* Custom scrollbar */}
      <style>{`
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0D0D0D; }
        ::-webkit-scrollbar-thumb { background: #2A2A2A; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #444; }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl" style={{ background: 'rgba(13,13,13,0.9)', borderBottom: '1px solid #1A1A1A' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Playfair Display, serif', color: '#fff' }}>
            CGAP
          </h1>
          <button onClick={logout} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-80"
            style={{ background: '#1C1C1C', color: '#888', border: '1px solid #2A2A2A' }}>
            <LogOut className="w-3 h-3" /> Sign Out
          </button>
        </div>

        {/* Tab Bar */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-1 overflow-x-auto pb-0">
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-all"
                style={{
                  color: activeTab === tab.id ? tab.accent : '#666',
                  background: activeTab === tab.id ? '#161616' : 'transparent',
                  borderBottom: activeTab === tab.id ? `2px solid ${tab.accent}` : '2px solid transparent',
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="rounded-2xl p-6 sm:p-8" style={{ background: '#161616', border: '1px solid #2A2A2A' }}>
          {activeTab === 'contract' && <ContractTab />}
          {activeTab === 'addendum' && <AddendumTab />}
          {activeTab === 'amendment' && <QuickAmendmentTab />}
          {activeTab === 'rfp' && <RequestForPaymentTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </main>
    </div>
  );
};

export default CGAPApp;
