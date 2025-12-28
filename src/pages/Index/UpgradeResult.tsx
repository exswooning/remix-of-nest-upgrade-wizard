import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { exportToPDF } from "@/utils/exportCalculation";

interface UpgradeResultProps {
  result: any;
  darkMode: boolean;
  formatCurrency: (amount: number) => string;
  currentPlan?: string;
  targetPlan?: string;
  startDate?: string;
  endDate?: string;
}

const UpgradeResult: React.FC<UpgradeResultProps> = ({ 
  result, 
  darkMode, 
  formatCurrency,
  currentPlan = '',
  targetPlan = '',
  startDate = '',
  endDate = ''
}) => {
  if (!result) return null;
  
  const handleExportPDF = () => {
    exportToPDF({
      type: 'upgrade',
      currentPlan,
      targetPlan,
      startDate,
      endDate,
      usedDays: result.usedDays,
      totalDays: result.totalDays,
      moneyPerDay: result.moneyPerDay,
      usedMoney: result.usedMoney,
      remainingAmount: result.remainingAmount,
      newPackageFullAmount: result.newPackageFullAmount,
      upgradeAmount: result.upgradeAmount,
    });
  };

  return (
    <Card className={`mt-6 ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-blue-50 border-blue-200'}`}>
      <CardHeader>
        <CardTitle className={`text-lg ${darkMode ? 'text-white' : 'text-blue-800'}`}>
          Upgrade Cost Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
          <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
            Usage Duration ({result.usedDays} of {result.totalDays} days):
          </span>
          <span className={`font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
            {((result.usedDays / result.totalDays) * 100).toFixed(1)}%
          </span>
        </div>
        <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
          <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
            Current Plan Daily Cost:
          </span>
          <span className={`font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
            {formatCurrency(result.moneyPerDay)}
          </span>
        </div>
        <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
          <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
            Used Money:
          </span>
          <span className={`font-semibold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
            {formatCurrency(result.usedMoney)}
          </span>
        </div>
        <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
          <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
            Remaining Amount (unused portion):
          </span>
          <span className={`font-semibold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
            {formatCurrency(result.remainingAmount)}
          </span>
        </div>
        <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
          <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
            New Package Full Amount:
          </span>
          <span className={`font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
            {formatCurrency(result.newPackageFullAmount)}
          </span>
        </div>
        <div className={`flex justify-between items-center p-4 rounded font-bold text-lg ${darkMode ? 'bg-gray-600 text-orange-400' : 'bg-orange-100 text-orange-700'}`}>
          <span>Final Upgrade Cost:</span>
          <span>{formatCurrency(result.upgradeAmount)}</span>
        </div>
        <Button
          onClick={handleExportPDF}
          className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Download className="w-4 h-4 mr-2" />
          Export as PDF
        </Button>
      </CardContent>
    </Card>
  );
};

export default UpgradeResult;
