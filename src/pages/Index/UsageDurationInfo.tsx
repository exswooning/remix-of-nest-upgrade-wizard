
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface UsageDurationInfoProps {
  darkMode: boolean;
  calculateDaysFromDates: () => { daysRemaining: number; totalDays: number; usedDays: number };
  startDate?: Date;
  endDate?: Date;
  billingCycle: string;
  cycleLabels: Record<number, string>;
}

const UsageDurationInfo: React.FC<UsageDurationInfoProps> = ({ 
  darkMode, 
  calculateDaysFromDates, 
  startDate, 
  endDate,
  billingCycle,
  cycleLabels
}) => {
  if (!startDate || !endDate) return null;

  const { usedDays, totalDays } = calculateDaysFromDates();
  const today = new Date();
  const cycle = parseInt(billingCycle);

  return (
    <Card className={`${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-green-50 border-green-200'}`}>
      <CardHeader>
        <CardTitle className={`text-lg ${darkMode ? 'text-white' : 'text-green-800'}`}>
          Usage Duration Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
          <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
            Start Date:
          </span>
          <span className={`font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
            {startDate.toLocaleDateString()}
          </span>
        </div>
        <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
          <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
            Date Today:
          </span>
          <span className={`font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
            {today.toLocaleDateString()}
          </span>
        </div>
        <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
          <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
            Billing Cycle:
          </span>
          <span className={`font-semibold ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>
            {cycleLabels[cycle]}
          </span>
        </div>
        <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
          <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
            Total Days in Plan:
          </span>
          <span className={`font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
            {totalDays} days
          </span>
        </div>
        <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
          <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
            Used Days (Start Date to Today):
          </span>
          <span className={`font-semibold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
            {usedDays} days
          </span>
        </div>
        <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
          <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
            Usage Percentage:
          </span>
          <span className={`font-semibold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
            {((usedDays / totalDays) * 100).toFixed(1)}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default UsageDurationInfo;
