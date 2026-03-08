// Contract sections extracted from the PDF template
export interface ContractSection {
  id: string;       // e.g. "1", "2A", "3C"
  label: string;    // Short display label
  title: string;    // Full section title
  page: number;     // Page in the contract PDF
}

export const CONTRACT_SECTIONS: ContractSection[] = [
  { id: '1', label: '1', title: 'Services', page: 1 },
  { id: '2A', label: '2A', title: 'Terms — Subscription Period', page: 1 },
  { id: '3A', label: '3A', title: 'Payment — Ceiling', page: 2 },
  { id: '3B', label: '3B', title: 'Payment — Cost', page: 2 },
  { id: '3C', label: '3C', title: 'Payment — Payment Conditions', page: 2 },
  { id: '4A', label: '4A', title: 'Project Administration — Coordinator', page: 2 },
  { id: '4B', label: '4B', title: 'Project Administration — Records and Accounts', page: 3 },
  { id: '5', label: '5', title: 'Performance Standard', page: 3 },
  { id: '6', label: '6', title: 'Confidentiality', page: 3 },
  { id: '7', label: '7', title: 'Ownership of Material', page: 3 },
  { id: '8', label: '8', title: 'Not to be Engaged in Certain Activities', page: 3 },
  { id: '9', label: '9', title: 'Assignment', page: 3 },
  { id: '10', label: '10', title: 'Law Governing Contract and Language', page: 3 },
  { id: '11', label: '11', title: 'Fraud and Corruption', page: 4 },
  { id: '12', label: '12', title: 'Termination Before Expiry — Refund', page: 4 },
  { id: '13', label: '13', title: 'Data Corruption', page: 4 },
  { id: '14', label: '14', title: 'Dispute Resolution', page: 5 },
  { id: '15', label: '15', title: 'Termination', page: 5 },
  { id: '15a', label: '15(a)', title: 'Termination — Failure to Perform', page: 5 },
  { id: '15b', label: '15(b)', title: 'Termination — Insolvency', page: 5 },
  { id: '15c', label: '15(c)', title: 'Termination — Fraud (SP)', page: 5 },
  { id: '15d', label: '15(d)', title: 'Termination — At Will', page: 5 },
  { id: '15e', label: '15(e)', title: 'Termination — Non-Payment', page: 5 },
  { id: '15f', label: '15(f)', title: 'Termination — Fraud (Client)', page: 5 },
  { id: '15g', label: '15(g)', title: 'Termination — Transition Support', page: 6 },
  { id: '15h', label: '15(h)', title: 'Termination — SP Right', page: 6 },
  { id: 'AnnexA', label: 'Annex A', title: 'Terms of Reference', page: 8 },
  { id: 'AnnexB', label: 'Annex B', title: 'Cost of Services', page: 9 },
  { id: 'AnnexC', label: 'Annex C', title: 'Relevant Documents (Invoice)', page: 10 },
  { id: 'Sig', label: 'Signatures', title: 'Signature Page (Page 7)', page: 7 },
];

export function searchSections(query: string): ContractSection[] {
  if (!query.trim()) return CONTRACT_SECTIONS;
  const q = query.toLowerCase();
  return CONTRACT_SECTIONS.filter(
    s => s.id.toLowerCase().includes(q) ||
         s.label.toLowerCase().includes(q) ||
         s.title.toLowerCase().includes(q)
  );
}
