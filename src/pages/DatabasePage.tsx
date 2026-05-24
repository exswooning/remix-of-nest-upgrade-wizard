import React from "react";
import ContractsDatabase from "@/pages/CGAP/ContractsDatabase";
import ActivityLogPanel from "@/components/ActivityLogPanel";
import ActivityFeed from "@/components/ActivityFeed";

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
      <ActivityFeed darkMode={darkMode} limit={25} />
      <ActivityLogPanel darkMode={darkMode} />
    </div>
  );
};

export default DatabasePage;
