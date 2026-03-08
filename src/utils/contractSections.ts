// Contract sections extracted from the PDF template
export interface ContractSection {
  id: string;       // e.g. "1", "2A", "3C"
  label: string;    // Short display label
  title: string;    // Full section title
  page: number;     // Page in the contract PDF
  clauseText: string; // The existing clause text from the contract
}

export const CONTRACT_SECTIONS: ContractSection[] = [
  { id: '1', label: '1', title: 'Services', page: 1, clauseText: 'The Service Provider shall provide the services specified in Annex A, "Terms of Reference," which is made an integral part of this Contract ("the Services").' },
  { id: '2A', label: '2A', title: 'Terms — Subscription Period', page: 1, clauseText: 'This Contract shall be effective for a period of <<CONTRACTPERIOD>> (<<CONTRACTPERIODNUM>> months) from the date of signing ("the Subscription Period").' },
  { id: '3A', label: '3A', title: 'Payment — Ceiling', page: 2, clauseText: 'For Services rendered pursuant to Annex A, the Client shall pay the Service Provider an amount not to exceed NRs. <<PAYMENTAMOUNT>>/- (<<PAYMENTWORDS>>).' },
  { id: '3B', label: '3B', title: 'Payment — Cost', page: 2, clauseText: 'The breakdown of cost is provided in Annex B, "Cost of Services."' },
  { id: '3C', label: '3C', title: 'Payment — Payment Conditions', page: 2, clauseText: 'Payment shall be made within 30 days of receipt of invoice and the necessary supporting documents. <<ADVANCEPERCENT>>% advance payment is required upon signing.' },
  { id: '4A', label: '4A', title: 'Project Administration — Coordinator', page: 2, clauseText: 'The Coordinator designated by the Client is <<CLIENTCOORDINATOR>>. The Coordinator will be responsible for the coordination of activities under this Contract.' },
  { id: '4B', label: '4B', title: 'Project Administration — Records and Accounts', page: 3, clauseText: 'The Service Provider shall keep accurate and systematic records and accounts in respect of the Services.' },
  { id: '5', label: '5', title: 'Performance Standard', page: 3, clauseText: 'The Service Provider undertakes to perform the Services with the highest standards of professional and ethical competence and integrity.' },
  { id: '6', label: '6', title: 'Confidentiality', page: 3, clauseText: 'The Service Provider shall not, during the term of this Contract and within two years after its expiration, disclose any proprietary or confidential information.' },
  { id: '7', label: '7', title: 'Ownership of Material', page: 3, clauseText: 'Any studies, reports or other material, graphic, software or otherwise, prepared by the Service Provider shall belong to and remain the property of the Client.' },
  { id: '8', label: '8', title: 'Not to be Engaged in Certain Activities', page: 3, clauseText: 'The Service Provider agrees that, during the term of this Contract, the Service Provider and its affiliates shall be disqualified from providing goods, works or services resulting from or directly related to the Services.' },
  { id: '9', label: '9', title: 'Assignment', page: 3, clauseText: 'The Service Provider shall not assign, in whole or in part, its obligations to perform under this Contract, except with the Client\'s prior written approval.' },
  { id: '10', label: '10', title: 'Law Governing Contract and Language', page: 3, clauseText: 'This Contract, its meaning and interpretation, and the relation between the Parties shall be governed by the Applicable Law of Nepal. This Contract has been executed in English.' },
  { id: '11', label: '11', title: 'Fraud and Corruption', page: 4, clauseText: 'The Service Provider shall comply with the applicable laws and regulations regarding fraud and corruption and shall not engage in any corrupt, fraudulent, coercive, or collusive practices.' },
  { id: '12', label: '12', title: 'Termination Before Expiry — Refund', page: 4, clauseText: 'In the event of early termination by the Client, the Service Provider shall refund any prepaid fees on a pro-rata basis for the remaining unused subscription period.' },
  { id: '13', label: '13', title: 'Data Corruption', page: 4, clauseText: 'The Service Provider shall not be held liable for any data loss or corruption arising from causes beyond the Service Provider\'s reasonable control, including force majeure events.' },
  { id: '14', label: '14', title: 'Dispute Resolution', page: 5, clauseText: 'Any dispute arising out of or in connection with this Contract shall be settled amicably by negotiation between the Parties. Failing such settlement, the dispute shall be referred to arbitration under the prevailing laws of Nepal.' },
  { id: '15', label: '15', title: 'Termination', page: 5, clauseText: 'Either Party may terminate this Contract under the conditions specified in sub-clauses 15(a) through 15(h) below.' },
  { id: '15a', label: '15(a)', title: 'Termination — Failure to Perform', page: 5, clauseText: 'The Client may terminate this Contract if the Service Provider fails to perform its obligations under this Contract.' },
  { id: '15b', label: '15(b)', title: 'Termination — Insolvency', page: 5, clauseText: 'Either Party may terminate this Contract if the other Party becomes insolvent or bankrupt.' },
  { id: '15c', label: '15(c)', title: 'Termination — Fraud (SP)', page: 5, clauseText: 'The Client may terminate this Contract if the Service Provider is found to have engaged in fraud, corruption, or misrepresentation.' },
  { id: '15d', label: '15(d)', title: 'Termination — At Will', page: 5, clauseText: 'Either Party may terminate this Contract at will by providing 30 days\' written notice to the other Party.' },
  { id: '15e', label: '15(e)', title: 'Termination — Non-Payment', page: 5, clauseText: 'The Service Provider may terminate this Contract if the Client fails to make payment within 60 days of the due date.' },
  { id: '15f', label: '15(f)', title: 'Termination — Fraud (Client)', page: 5, clauseText: 'The Service Provider may terminate this Contract if the Client is found to have engaged in fraud or corruption.' },
  { id: '15g', label: '15(g)', title: 'Termination — Transition Support', page: 6, clauseText: 'Upon termination, the Service Provider shall provide transition support for a period not exceeding 30 days to ensure continuity of services.' },
  { id: '15h', label: '15(h)', title: 'Termination — SP Right', page: 6, clauseText: 'The Service Provider reserves the right to terminate this Contract if continued performance would be unlawful or impossible due to regulatory changes.' },
  { id: 'AnnexA', label: 'Annex A', title: 'Terms of Reference', page: 8, clauseText: 'The Service Provider shall provide Google Workspace Business Starter services including email, cloud storage, video conferencing, and collaboration tools for <<NUMUSERS>> users.' },
  { id: 'AnnexB', label: 'Annex B', title: 'Cost of Services', page: 9, clauseText: 'Total cost for <<NUMUSERS>> users for <<CONTRACTPERIOD>>: NRs. <<PAYMENTAMOUNT>>/- (<<PAYMENTWORDS>>).' },
  { id: 'AnnexC', label: 'Annex C', title: 'Relevant Documents (Invoice)', page: 10, clauseText: 'Proforma Invoice and relevant billing documents are attached herewith.' },
  { id: 'Sig', label: 'Signatures', title: 'Signature Page (Page 7)', page: 7, clauseText: 'IN WITNESS WHEREOF, the Parties hereto have caused this Contract to be signed in their respective names as of the day and year first above written.' },
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

export function getSectionById(id: string): ContractSection | undefined {
  return CONTRACT_SECTIONS.find(s => s.id === id);
}
