import React from "react";
import ContractsDatabase from "@/pages/CGAP/ContractsDatabase";
import ActivityLogPanel from "@/components/ActivityLogPanel";

interface Props { darkMode?: boolean }

/**
 * Top-level Database page — sibling of Settings. Stacks the
 * Supabase-backed contracts table on top of the per-browser activity
 * log (PDFs, calculations, admin actions).
 */
const DatabasePage: React.FC<Props> = ({ darkMode = false }) => {
  return (
    <div className="space-y-6">
      <ContractsDatabase darkMode={darkMode} />
      <ActivityLogPanel darkMode={darkMode} />
    </div>
  );
};

export default DatabasePage;
