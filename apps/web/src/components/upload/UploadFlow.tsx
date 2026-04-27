import { useState } from 'react';
import { DeGiroUpload } from './DeGiroUpload.js';
import { MSHoldingsUpload } from './MSHoldingsUpload.js';
import { RSUGrantUpload } from './RSUGrantUpload.js';
import { TransactionUpload } from './TransactionUpload.js';

type UploadTab = 'degiro' | 'ms-holdings' | 'rsu-grant' | 'transactions';

const TABS: { id: UploadTab; label: string; description: string }[] = [
  {
    id: 'degiro',
    label: 'DeGIRO',
    description: 'Upload a screenshot of your DeGiro portfolio overview',
  },
  {
    id: 'ms-holdings',
    label: 'Uber Position (Morgan Stanley)',
    description: 'Upload a screenshot of your Morgan Stanley holdings',
  },
  {
    id: 'rsu-grant',
    label: 'Uber RSU Vesting',
    description: 'Upload your RSU grant document (PDF or image)',
  },
  {
    id: 'transactions',
    label: 'Transaction History',
    description: 'Import a DeGiro transaction export (.xlsx or .csv)',
  },
];

type Props = { onSaved?: () => void };

export function UploadFlow({ onSaved }: Props) {
  const [activeTab, setActiveTab] = useState<UploadTab>('degiro');

  const currentTab = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Upload Data</h2>
        <p className="text-slate-400 text-sm">
          Claude will parse your screenshots and documents. Review the extracted data before
          confirming.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-800 rounded-xl p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Description */}
      <p className="text-slate-500 text-xs">{currentTab.description}</p>

      {/* Panel */}
      <div className="bg-slate-800 rounded-xl p-6">
        {activeTab === 'degiro' && <DeGiroUpload {...(onSaved ? { onSaved } : {})} />}
        {activeTab === 'ms-holdings' && <MSHoldingsUpload {...(onSaved ? { onSaved } : {})} />}
        {activeTab === 'rsu-grant' && <RSUGrantUpload {...(onSaved ? { onSaved } : {})} />}
        {activeTab === 'transactions' && <TransactionUpload {...(onSaved ? { onSaved } : {})} />}
      </div>
    </div>
  );
}
