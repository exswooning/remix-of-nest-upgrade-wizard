import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface FieldMapping {
  id: string;
  label: string;
  placeholder: string;
  required: boolean;
}

interface ContractLog {
  timestamp: string;
  companyAbv: string;
  contractId: string;
  fields: Record<string, string>;
}

interface AddendumLog {
  timestamp: string;
  companyAbv: string;
  addendumId: string;
  originalContractId: string;
  fields: Record<string, string>;
}

interface CGAPContextType {
  isLoggedIn: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  fieldMappings: FieldMapping[];
  setFieldMappings: React.Dispatch<React.SetStateAction<FieldMapping[]>>;
  addendumTemplateId: string;
  setAddendumTemplateId: (id: string) => void;
  contractCounts: Record<string, number>;
  generateContractId: (abv: string) => string;
  generateAddendumId: (contractId: string) => string;
  addendumCounts: Record<string, number>;
  contractLogs: ContractLog[];
  addContractLog: (log: ContractLog) => void;
  addendumLogs: AddendumLog[];
  addAddendumLog: (log: AddendumLog) => void;
}

const CGAPContext = createContext<CGAPContextType | undefined>(undefined);

const DEFAULT_FIELD_MAPPINGS: FieldMapping[] = [
  { id: 'companyAbv', label: 'Company Abbreviation', placeholder: '<<COMPANYABV>>', required: true },
  { id: 'prevContractId', label: 'Previous Contract ID', placeholder: '<<PREVCONTRACTID>>', required: false },
  { id: 'clientCompany', label: 'Client Company Name', placeholder: '<<CLIENTCOMPANY>>', required: true },
  { id: 'clientLocation', label: 'Client Location', placeholder: '<<CLIENTLOCATION>>', required: true },
  { id: 'clientCoordinator', label: 'Client Coordinator', placeholder: '<<CLIENTCOORDINATOR>>', required: true },
  { id: 'contractPeriodText', label: 'Contract Period (text)', placeholder: '<<CONTRACTPERIODTEXT>>', required: true },
  { id: 'contractPeriodNum', label: 'Contract Period (number)', placeholder: '<<CONTRACTPERIODNUM>>', required: true },
  { id: 'numUsers', label: 'Number of Users', placeholder: '<<NUMUSERS>>', required: true },
  { id: 'paymentAmount', label: 'Payment Amount (numerals)', placeholder: '<<PAYMENTAMOUNT>>', required: true },
  { id: 'paymentWords', label: 'Payment Amount (in words)', placeholder: '<<PAYMENTWORDS>>', required: true },
  { id: 'advancePercent', label: 'Advance Payment %', placeholder: '<<ADVANCEPERCENT>>', required: false },
  { id: 'signatoryName', label: 'Client Signatory Name', placeholder: '<<SIGNATORYNAME>>', required: true },
  { id: 'signatoryTitle', label: 'Client Signatory Title', placeholder: '<<SIGNATORYTITLE>>', required: true },
  { id: 'witnessName', label: 'Witness Name', placeholder: '<<WITNESSNAME>>', required: false },
  { id: 'witnessTitle', label: 'Witness Title', placeholder: '<<WITNESSTITLE>>', required: false },
];

export const CGAPProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>(DEFAULT_FIELD_MAPPINGS);
  const [addendumTemplateId, setAddendumTemplateIdState] = useState('');
  const [contractCounts, setContractCounts] = useState<Record<string, number>>({});
  const [addendumCounts, setAddendumCounts] = useState<Record<string, number>>({});
  const [contractLogs, setContractLogs] = useState<ContractLog[]>([]);
  const [addendumLogs, setAddendumLogs] = useState<AddendumLog[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('cgap-auth');
    if (saved === 'true') setIsLoggedIn(true);
    
    const mappings = localStorage.getItem('cgap-field-mappings');
    if (mappings) try { setFieldMappings(JSON.parse(mappings)); } catch {}
    
    const templateId = localStorage.getItem('cgap-addendum-template-id');
    if (templateId) setAddendumTemplateIdState(templateId);
    
    const counts = localStorage.getItem('cgap-contract-counts');
    if (counts) try { setContractCounts(JSON.parse(counts)); } catch {}
    
    const aCounts = localStorage.getItem('cgap-addendum-counts');
    if (aCounts) try { setAddendumCounts(JSON.parse(aCounts)); } catch {}
    
    const cLogs = localStorage.getItem('cgap-contract-logs');
    if (cLogs) try { setContractLogs(JSON.parse(cLogs)); } catch {}
    
    const aLogs = localStorage.getItem('cgap-addendum-logs');
    if (aLogs) try { setAddendumLogs(JSON.parse(aLogs)); } catch {}
  }, []);

  useEffect(() => { localStorage.setItem('cgap-field-mappings', JSON.stringify(fieldMappings)); }, [fieldMappings]);
  useEffect(() => { localStorage.setItem('cgap-contract-counts', JSON.stringify(contractCounts)); }, [contractCounts]);
  useEffect(() => { localStorage.setItem('cgap-addendum-counts', JSON.stringify(addendumCounts)); }, [addendumCounts]);
  useEffect(() => { localStorage.setItem('cgap-contract-logs', JSON.stringify(contractLogs)); }, [contractLogs]);
  useEffect(() => { localStorage.setItem('cgap-addendum-logs', JSON.stringify(addendumLogs)); }, [addendumLogs]);

  const login = (username: string, password: string): boolean => {
    if (username === 'aryan' && password === 'aryan123') {
      setIsLoggedIn(true);
      localStorage.setItem('cgap-auth', 'true');
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('cgap-auth');
  };

  const setAddendumTemplateId = (id: string) => {
    setAddendumTemplateIdState(id);
    localStorage.setItem('cgap-addendum-template-id', id);
  };

  const generateContractId = useCallback((abv: string) => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const key = abv.toUpperCase();
    const count = (contractCounts[key] || 0) + 1;
    setContractCounts(prev => {
      const updated = { ...prev, [key]: count };
      return updated;
    });
    return `${key}-NNBS-${dd}-${mm}-${yy}-${count}`;
  }, [contractCounts]);

  const generateAddendumId = useCallback((contractId: string) => {
    const key = contractId;
    const count = (addendumCounts[key] || 0) + 1;
    setAddendumCounts(prev => ({ ...prev, [key]: count }));
    return `${contractId}#A${count}`;
  }, [addendumCounts]);

  const addContractLog = (log: ContractLog) => {
    setContractLogs(prev => [...prev, log]);
  };

  const addAddendumLog = (log: AddendumLog) => {
    setAddendumLogs(prev => [...prev, log]);
  };

  return (
    <CGAPContext.Provider value={{
      isLoggedIn, login, logout,
      fieldMappings, setFieldMappings,
      addendumTemplateId, setAddendumTemplateId,
      contractCounts, generateContractId,
      addendumCounts, generateAddendumId,
      contractLogs, addContractLog,
      addendumLogs, addAddendumLog,
    }}>
      {children}
    </CGAPContext.Provider>
  );
};

export const useCGAP = () => {
  const context = useContext(CGAPContext);
  if (!context) throw new Error('useCGAP must be used within CGAPProvider');
  return context;
};
