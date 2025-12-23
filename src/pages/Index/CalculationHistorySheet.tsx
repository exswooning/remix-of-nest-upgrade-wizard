
import React from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { History, Download, Trash2 } from "lucide-react";
import { formatDate } from "./dateUtils";

interface CalculationResult {
  id: string;
  timestamp: Date;
  currentPlan: string;
  targetPlan: string;
  currentCategory: string;
  targetCategory: string;
  billingCycle: string;
  targetBillingCycle: string;
  fullAmount: number;
  newPackageFullAmount: number;
  moneyPerDay: number;
  usedDays: number;
  usedMoney: number;
  remainingAmount: number;
  upgradeAmount: number;
  daysRemaining: number;
  totalDays: number;
  userDisplayName?: string;
  username?: string;
}

interface CalculationHistorySheetProps {
  darkMode: boolean;
  formatCurrency: (amount: number) => string;
  calculationHistory: CalculationResult[];
  clearHistory: () => void;
  exportHistory: () => void;
  isAdmin: boolean;
}

const CalculationHistorySheet: React.FC<CalculationHistorySheetProps> = ({
  darkMode,
  formatCurrency,
  calculationHistory,
  clearHistory,
  exportHistory,
  isAdmin
}) => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button 
          variant="outline" 
          className={`${darkMode ? 'bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:text-white hover:border-gray-700' : 'border-gray-300'}`}
        >
          <History className="w-4 h-4 mr-2" />
          Calculation History ({calculationHistory.length})
        </Button>
      </SheetTrigger>
      <SheetContent className={`w-[600px] sm:max-w-[600px] ${darkMode ? 'bg-gray-950 border-gray-800' : 'bg-white'}`}>
        <SheetHeader>
          <SheetTitle className={darkMode ? 'text-white' : 'text-gray-800'}>
            Calculation History
          </SheetTitle>
          <SheetDescription className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
            View and manage your calculation history
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-6 space-y-4">
          {isAdmin && (
            <div className="flex gap-2">
              <Button 
                onClick={exportHistory} 
                variant="outline" 
                size="sm"
                disabled={calculationHistory.length === 0}
                className={darkMode ? 'bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:text-white hover:border-gray-700' : ''}
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button 
                onClick={clearHistory} 
                variant="outline" 
                size="sm"
                disabled={calculationHistory.length === 0}
                className={darkMode ? 'bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:text-white hover:border-gray-700' : ''}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear History
              </Button>
            </div>
          )}

          <div className="max-h-[500px] overflow-y-auto space-y-3">
            {calculationHistory.length === 0 ? (
              <div className={`text-center py-8 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                No calculations yet. Run a calculation to see it here.
              </div>
            ) : (
              calculationHistory.map((calc) => (
                <Card key={calc.id} className={`${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-50'}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className={`text-sm ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                      {calc.currentPlan} → {calc.targetPlan}
                    </CardTitle>
                    <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      {formatDate(calc.timestamp)} • {calc.currentCategory} to {calc.targetCategory}
                      {calc.userDisplayName && (
                        <span> • Calculated by {calc.userDisplayName}</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                        Current Plan: {formatCurrency(calc.fullAmount)}
                      </div>
                      <div className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                        Target Plan: {formatCurrency(calc.newPackageFullAmount)}
                      </div>
                      <div className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                        Used: {calc.usedDays}/{calc.totalDays} days
                      </div>
                      <div className={`font-semibold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                        Upgrade Cost: {formatCurrency(calc.upgradeAmount)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default CalculationHistorySheet;
