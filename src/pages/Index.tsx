import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calculator, Moon, Sun, Calendar, UserPlus, ArrowUpCircle, FileText, Server, FileCheck, History, FileSpreadsheet, Settings, Database, Sparkles } from "lucide-react";
import QuotationTab from "./CGAP/QuotationTab";
import VrapTab from "./CGAP/VrapTab";
import VpsPricingCalculator from "./Index/VpsPricingCalculator";
import SettingsTab from "./CGAP/SettingsTab";
import DatabasePage from "./DatabasePage";
import TTAPTab from "./TTAPTab";
import DCAPTab from "./DCAPTab";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import CalculatorHeader from "./Index/CalculatorHeader";
import PlanSelectorSection from "./Index/PlanSelectorSection";
import DateRangeSelector from "./Index/DateRangeSelector";
import UpgradeResult from "./Index/UpgradeResult";
import FooterSection from "./Index/FooterSection";
import UsageDurationInfo from "./Index/UsageDurationInfo";
import CalculationHistorySheet from "./Index/CalculationHistorySheet";
import ProRataUserAddition from "./Index/ProRataUserAddition";
import BillingLedger from "./Index/BillingLedger";
import { parseDate, formatDate } from "./Index/dateUtils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { calculateUpgradeWithSettings } from "@/utils/calculationEngine";
import { logActivity } from "@/utils/activityLog";
import CGAPEmbedded from "./Index/CGAPEmbedded";

const cycleLabels: Record<number, string> = {
  1: "Monthly",
  6: "6 Months",
  12: "Annual",
  36: "3 Years"
};
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
const Index = () => {
  const {
    currentUser,
    currentUsername,
    isAdmin,
    logout,
    getPlanData
  } = useAuth();
  const planData = getPlanData();
  const [category, setCategory] = useState("");
  const [currentPlan, setCurrentPlan] = useState("");
  const [targetCategory, setTargetCategory] = useState("");
  const [targetPlan, setTargetPlan] = useState("");
  const [billingCycle, setBillingCycle] = useState("12");
  const [targetBillingCycle, setTargetBillingCycle] = useState("12");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [startDateText, setStartDateText] = useState("");
  const [endDateText, setEndDateText] = useState("");
  const [result, setResult] = useState(null);
  const [darkMode, setDarkMode] = useState(true);
  const [calculationHistory, setCalculationHistory] = useState<CalculationResult[]>([]);
  const [currentPlanPriceOverride, setCurrentPlanPriceOverride] = useState<number | undefined>(undefined);
  const [targetPlanPriceOverride, setTargetPlanPriceOverride] = useState<number | undefined>(undefined);
  const [currentPlanTaxEnabled, setCurrentPlanTaxEnabled] = useState(false);
  const [currentPlanTaxRate, setCurrentPlanTaxRate] = useState(13);
  const [targetPlanTaxEnabled, setTargetPlanTaxEnabled] = useState(false);
  const [targetPlanTaxRate, setTargetPlanTaxRate] = useState(13);
  const [currentPlanDiscountEnabled, setCurrentPlanDiscountEnabled] = useState(false);
  const [currentPlanDiscountRate, setCurrentPlanDiscountRate] = useState(0);
  const [targetPlanDiscountEnabled, setTargetPlanDiscountEnabled] = useState(false);
  const [targetPlanDiscountRate, setTargetPlanDiscountRate] = useState(0);
  const {
    toast
  } = useToast();

  // Parse date from text input (supports various formats)
  // Replace inline parseDate/format with extracted utility usage
  const handleStartDateChange = (value: string) => {
    setStartDateText(value);
    const parsed = parseDate(value);
    if (parsed) setStartDate(parsed);
  };
  const handleEndDateChange = (value: string) => {
    setEndDateText(value);
    const parsed = parseDate(value);
    if (parsed) setEndDate(parsed);
  };

  // Update text inputs when calendar dates change
  useEffect(() => {
    if (startDate && (!startDateText || parseDate(startDateText)?.getTime() !== startDate.getTime())) {
      setStartDateText(formatDate(startDate));
    }
  }, [startDate]);
  useEffect(() => {
    if (endDate && (!endDateText || parseDate(endDateText)?.getTime() !== endDate.getTime())) {
      setEndDateText(formatDate(endDate));
    }
  }, [endDate]);

  // Calculate days remaining and total days based on billing cycle
  const calculateDaysFromDates = () => {
    if (!startDate || !endDate) return {
      daysRemaining: 0,
      totalDays: 0,
      usedDays: 0
    };
    const start = new Date(startDate);
    const end = new Date(endDate);
    const cycle = parseInt(billingCycle);

    // Calculate total days based on billing cycle
    let totalDays;
    switch (cycle) {
      case 1:
        totalDays = 30; // Monthly
        break;
      case 6:
        totalDays = 180; // 6 months (30 * 6)
        break;
      case 12:
        totalDays = 365; // Annual
        break;
      case 36:
        totalDays = 1095; // 3 years (365 * 3)
        break;
      default:
        totalDays = 30;
    }

    // Calculate used days from start date to end date (upgrade date)
    let usedDays;
    if (end <= start) {
      // If end date is before or on the start date, no days used yet
      usedDays = 0;
    } else {
      // Calculate days used from start to end date
      usedDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      // Cap used days at total days
      usedDays = Math.min(usedDays, totalDays);
    }

    // Days remaining = total days - used days
    const daysRemaining = totalDays - usedDays;
    return {
      daysRemaining: Math.max(0, daysRemaining),
      totalDays: Math.max(1, totalDays),
      usedDays: Math.max(0, usedDays)
    };
  };

  // Update targetCategory when category changes, and reset targetPlan 
  useEffect(() => {
    setCurrentPlan("");
    setTargetPlan("");
    setResult(null);
    setTargetCategory("");
    setCurrentPlanPriceOverride(undefined);
    setTargetPlanPriceOverride(undefined);
    setCurrentPlanTaxEnabled(false);
    setCurrentPlanTaxRate(13);
    setTargetPlanTaxEnabled(false);
    setTargetPlanTaxRate(13);
    setCurrentPlanDiscountEnabled(false);
    setCurrentPlanDiscountRate(0);
    setTargetPlanDiscountEnabled(false);
    setTargetPlanDiscountRate(0);

    // Auto-select appropriate billing cycle based on category
    if (category === "wordpress") {
      setBillingCycle("36");
    } else if (category === "vps-nepal") {
      setBillingCycle("12");
    } else if (category && !planData[category].cycles.includes(parseInt(billingCycle))) {
      setBillingCycle(planData[category].cycles[0].toString());
    }
  }, [category]);

  // Reset targetPlan when targetCategory changes
  useEffect(() => {
    setTargetPlan("");
    setTargetBillingCycle("12");
    setTargetPlanPriceOverride(undefined);
    setTargetPlanTaxEnabled(false);
    setTargetPlanTaxRate(13);
    setTargetPlanDiscountEnabled(false);
    setTargetPlanDiscountRate(0);

    // Auto-select appropriate billing cycle based on target category
    if (targetCategory === "wordpress") {
      setTargetBillingCycle("36");
    } else if (targetCategory === "vps-nepal") {
      setTargetBillingCycle("12");
    } else if (targetCategory && !planData[targetCategory].cycles.includes(parseInt(targetBillingCycle))) {
      setTargetBillingCycle(planData[targetCategory].cycles[0].toString());
    }
  }, [targetCategory]);

  // Clear result when any input changes
  useEffect(() => {
    setResult(null);
  }, [currentPlan, targetPlan, billingCycle, targetBillingCycle, startDate, endDate, category, targetCategory, currentPlanPriceOverride, targetPlanPriceOverride, currentPlanTaxEnabled, currentPlanTaxRate, targetPlanTaxEnabled, targetPlanTaxRate, currentPlanDiscountEnabled, currentPlanDiscountRate, targetPlanDiscountEnabled, targetPlanDiscountRate]);

  // Load calculation history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('calculationHistory');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        // Convert timestamp strings back to Date objects
        const historyWithDates = parsed.map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp)
        }));
        setCalculationHistory(historyWithDates);
      } catch (error) {
        console.error('Error loading calculation history:', error);
      }
    }
  }, []);

  // Save calculation history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('calculationHistory', JSON.stringify(calculationHistory));
  }, [calculationHistory]);
  const calculateUpgrade = () => {
    if (!category || !currentPlan || !targetPlan || !startDate || !endDate) {
      alert("Please fill in all fields including both dates");
      return;
    }
    const {
      daysRemaining,
      totalDays,
      usedDays
    } = calculateDaysFromDates();
    if (totalDays <= 0) {
      alert("Please select valid dates");
      return;
    }
    const cycle = parseInt(billingCycle);
    const targetCycle = parseInt(targetBillingCycle);
    const currentPlanData = planData[category].options.find(plan => plan.name === currentPlan);
    const targetPlanData = planData[targetCategory].options.find(plan => plan.name === targetPlan);
    if (!currentPlanData || !targetPlanData) {
      alert("Could not find plan details. Please re-select plans.");
      return;
    }

    // Use override price if available, otherwise get the plan price
    let currentPrice = currentPlanPriceOverride !== undefined ? currentPlanPriceOverride : getPlanPrice(currentPlanData, cycle);
    let targetPrice = targetPlanPriceOverride !== undefined ? targetPlanPriceOverride : getPlanPrice(targetPlanData, targetCycle);

    // Apply discount calculations first
    if (currentPlanDiscountEnabled) {
      currentPrice = currentPrice * (1 - currentPlanDiscountRate / 100);
    }
    if (targetPlanDiscountEnabled) {
      targetPrice = targetPrice * (1 - targetPlanDiscountRate / 100);
    }

    // Apply tax exclusion calculations (subtract tax from price)
    if (currentPlanTaxEnabled) {
      currentPrice = currentPrice * (1 - currentPlanTaxRate / 100);
    }
    if (targetPlanTaxEnabled) {
      targetPrice = targetPrice * (1 - targetPlanTaxRate / 100);
    }

    // Use the new calculation engine with admin settings
    const calculationResult = calculateUpgradeWithSettings(
      currentPrice,
      targetPrice,
      usedDays,
      totalDays
    );

    // Add daysRemaining to the result
    const finalResult = {
      ...calculationResult,
      daysRemaining,
      totalDays
    };

    setResult(finalResult);
    logActivity({
      kind: 'calculation',
      module: 'UCAP/Upgrade',
      action: 'Upgrade cost calculated',
      meta: { currentPlan, targetPlan, billingCycle, totalDays, upgradeAmount: finalResult.upgradeAmount },
    });

    // Add to calculation history with user information
    const historyEntry: CalculationResult = {
      id: Date.now().toString(),
      timestamp: new Date(),
      currentPlan,
      targetPlan,
      currentCategory: category,
      targetCategory,
      billingCycle,
      targetBillingCycle,
      userDisplayName: currentUser,
      username: currentUsername,
      ...finalResult
    };
    setCalculationHistory(prev => [historyEntry, ...prev]);
    toast({
      title: "Calculation completed",
      description: `Upgrade cost: ${formatCurrency(finalResult.upgradeAmount)}`
    });
  };

  // Helper function to get price based on plan and cycle
  const getPlanPrice = (plan, cycle) => {
    if (plan.pricing) {
      return plan.pricing[cycle] || plan.pricing[1];
    }
    return plan.price || 0;
  };
  const formatCurrency = amount => {
    return `NPR ${amount.toLocaleString('en-NP', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };
  const getAllPlansForCategory = () => {
    if (!category) return [];
    return planData[category].options;
  };

  // Filters plans for the "Target Plan" dropdown based on category rules
  const getSelectableTargetPlans = () => {
    if (!category) return [];
    if (category === "shared-hosting") {
      // Only allow upgrading to plans whose name does not contain 'Cloud'
      return planData[category].options.filter(plan => !plan.name.toLowerCase().includes("cloud"));
    }
    return planData[category].options;
  };
  const getAvailableCycles = () => {
    return category ? planData[category].cycles : [1, 6, 12, 36];
  };
  const getPlanDisplayPrice = plan => {
    const cycle = parseInt(billingCycle);
    return getPlanPrice(plan, cycle);
  };
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  // Helper to get plans for any category
  const getAllPlansForAnyCategory = _category => {
    if (!_category) return [];
    if (_category === "shared-hosting") {
      // Only show "Web" plans, not "Cloud", for both selects
      return planData[_category].options.filter(plan => !plan.name.toLowerCase().includes("cloud"));
    }
    return planData[_category]?.options || [];
  };

  // Helper to get available cycles for any category
  const getAvailableCyclesForAnyCategory = _category => {
    return _category ? planData[_category].cycles : [1, 6, 12, 36];
  };

  // Helper function to get display price for any category/cycle combination
  const getPlanDisplayPriceForCategory = (plan, _category, cycle) => {
    return getPlanPrice(plan, parseInt(cycle));
  };
  const clearCalculationHistory = () => {
    setCalculationHistory([]);
    toast({
      title: "History cleared",
      description: "All calculation history has been removed."
    });
  };
  const exportCalculationHistory = () => {
    if (calculationHistory.length === 0) {
      toast({
        title: "No data to export",
        description: "Calculate some upgrades first to export history.",
        variant: "destructive"
      });
      return;
    }
    const csvHeaders = ['Date', 'User', 'Current Plan', 'Target Plan', 'Current Category', 'Target Category', 'Current Billing Cycle', 'Target Billing Cycle', 'Current Plan Amount', 'Target Plan Amount', 'Used Days', 'Total Days', 'Upgrade Cost'];
    const csvData = calculationHistory.map(calc => [formatDate(calc.timestamp), calc.userDisplayName || 'Unknown', calc.currentPlan, calc.targetPlan, calc.currentCategory, calc.targetCategory, calc.billingCycle, calc.targetBillingCycle, calc.fullAmount, calc.newPackageFullAmount, calc.usedDays, calc.totalDays, calc.upgradeAmount]);
    const csvContent = [csvHeaders, ...csvData].map(row => row.map(field => `"${field}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;'
    });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `calculation-history-${formatDate(new Date())}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({
      title: "Export completed",
      description: "Calculation history has been downloaded as CSV."
    });
  };
  return <div
      className={`min-h-screen relative overflow-hidden transition-colors duration-300 antialiased ${darkMode ? 'dark text-slate-100 bg-slate-950' : 'text-slate-900 bg-slate-50'}`}
    >
      {/* Animated colour wash — drifting pastel blobs in our curated
          palette (coral, sky, mint, lavender, rose, jade). No yellow,
          no brown, no muddy navy. Sits behind all UI at z=0. */}
      <div aria-hidden className="bg-stage">
        <div className="bg-blob bg-blob-1" />
        <div className="bg-blob bg-blob-2" />
        <div className="bg-blob bg-blob-3" />
        <div className="bg-blob bg-blob-4" />
        <div className="bg-blob bg-blob-5" />
        <div className="bg-blob bg-blob-6" />
      </div>
      {/* Faint film grain over the gradient — keeps the wash from looking like
          a flat banner. Subtle enough that it reads as material, not noise. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'2\' stitchTiles=\'stitch\'/></filter><rect width=\'100%\' height=\'100%\' filter=\'url(%23n)\'/></svg>")',
        }}
      />
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <CalculatorHeader darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
          <div className="flex items-center gap-4">
            <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Welcome, {currentUser}
            </span>
            
            <Button variant="outline" size="sm" onClick={logout} className={darkMode ? 'bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:text-white hover:border-gray-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}>
              Logout
            </Button>
          </div>
        </div>
        
        <Card className="glass-card w-full rounded-[28px]">
          <CardContent className="pt-6 space-y-6">
            {/* Top-level toggle: UCAP vs CGAP — glass-tabs strip with
                glass-tab pills so the lava-lamp shows through. */}
            <Tabs defaultValue="ttap" className="w-full">
              <TabsList className={`glass-tabs grid w-full ${isAdmin ? 'grid-cols-8' : 'grid-cols-7'} mb-4`}>
                <TabsTrigger value="ttap" className="glass-tab flex items-center gap-2 text-base font-semibold py-3">
                  <Sparkles className="w-5 h-5" />
                  TTAP
                </TabsTrigger>
                <TabsTrigger value="ucap" className="glass-tab flex items-center gap-2 text-base font-semibold py-3">
                  <Calculator className="w-5 h-5" />
                  UCAP
                </TabsTrigger>
                <TabsTrigger value="cgap" className="glass-tab flex items-center gap-2 text-base font-semibold py-3">
                  <FileCheck className="w-5 h-5" />
                  CGAP
                </TabsTrigger>
                <TabsTrigger value="qgap" className="glass-tab flex items-center gap-2 text-base font-semibold py-3">
                  <FileSpreadsheet className="w-5 h-5" />
                  QGAP
                </TabsTrigger>
                <TabsTrigger value="vrap" className="glass-tab flex items-center gap-2 text-base font-semibold py-3">
                  <FileSpreadsheet className="w-5 h-5" />
                  VRAP
                </TabsTrigger>
                <TabsTrigger value="dcap" className="glass-tab flex items-center gap-2 text-base font-semibold py-3">
                  <FileText className="w-5 h-5" />
                  DCAP
                </TabsTrigger>
                <TabsTrigger value="database" className="glass-tab flex items-center gap-2 text-base font-semibold py-3">
                  <Database className="w-5 h-5" />
                  Database
                </TabsTrigger>
                {isAdmin && (
                  <TabsTrigger value="settings" className="glass-tab flex items-center gap-2 text-base font-semibold py-3">
                    <Settings className="w-5 h-5" />
                    Settings
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="ucap">
                <Tabs defaultValue="upgrade" className="w-full">
                  <TabsList className="glass-tabs-sm grid w-full grid-cols-5">
                    <TabsTrigger value="upgrade" className="glass-tab flex items-center gap-1 text-xs py-2">
                      <ArrowUpCircle className="w-3.5 h-3.5" /> Upgrade
                    </TabsTrigger>
                    <TabsTrigger value="prorata" className="glass-tab flex items-center gap-1 text-xs py-2">
                      <UserPlus className="w-3.5 h-3.5" /> Pro Rata
                    </TabsTrigger>
                    <TabsTrigger value="ledger" className="glass-tab flex items-center gap-1 text-xs py-2">
                      <FileText className="w-3.5 h-3.5" /> Ledger
                    </TabsTrigger>
                    <TabsTrigger value="vps" className="glass-tab flex items-center gap-1 text-xs py-2">
                      <Server className="w-3.5 h-3.5" /> VPS
                    </TabsTrigger>
                    <TabsTrigger value="history" className="glass-tab flex items-center gap-1 text-xs py-2">
                      <History className="w-3.5 h-3.5" /> History
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="upgrade" className="mt-6 space-y-6">
                    <PlanSelectorSection 
                      category={category} setCategory={setCategory}
                      currentPlan={currentPlan} setCurrentPlan={setCurrentPlan}
                      billingCycle={billingCycle} setBillingCycle={setBillingCycle}
                      darkMode={darkMode}
                      targetCategory={targetCategory} setTargetCategory={setTargetCategory}
                      targetPlan={targetPlan} setTargetPlan={setTargetPlan}
                      targetBillingCycle={targetBillingCycle} setTargetBillingCycle={setTargetBillingCycle}
                      currentPlanPriceOverride={currentPlanPriceOverride} setCurrentPlanPriceOverride={setCurrentPlanPriceOverride}
                      targetPlanPriceOverride={targetPlanPriceOverride} setTargetPlanPriceOverride={setTargetPlanPriceOverride}
                      currentPlanTaxEnabled={currentPlanTaxEnabled} setCurrentPlanTaxEnabled={setCurrentPlanTaxEnabled}
                      currentPlanTaxRate={currentPlanTaxRate} setCurrentPlanTaxRate={setCurrentPlanTaxRate}
                      targetPlanTaxEnabled={targetPlanTaxEnabled} setTargetPlanTaxEnabled={setTargetPlanTaxEnabled}
                      targetPlanTaxRate={targetPlanTaxRate} setTargetPlanTaxRate={setTargetPlanTaxRate}
                      currentPlanDiscountEnabled={currentPlanDiscountEnabled} setCurrentPlanDiscountEnabled={setCurrentPlanDiscountEnabled}
                      currentPlanDiscountRate={currentPlanDiscountRate} setCurrentPlanDiscountRate={setCurrentPlanDiscountRate}
                      targetPlanDiscountEnabled={targetPlanDiscountEnabled} setTargetPlanDiscountEnabled={setTargetPlanDiscountEnabled}
                      targetPlanDiscountRate={targetPlanDiscountRate} setTargetPlanDiscountRate={setTargetPlanDiscountRate}
                    />
                    <DateRangeSelector darkMode={darkMode} startDateText={startDateText} endDateText={endDateText} handleStartDateChange={handleStartDateChange} handleEndDateChange={handleEndDateChange} startDate={startDate} endDate={endDate} setStartDate={setStartDate} setEndDate={setEndDate} calculateDaysFromDates={calculateDaysFromDates} />
                    <UsageDurationInfo darkMode={darkMode} calculateDaysFromDates={calculateDaysFromDates} startDate={startDate} endDate={endDate} billingCycle={billingCycle} cycleLabels={cycleLabels} />
                    <Button onClick={calculateUpgrade} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-lg font-semibold" size="lg">
                      <Calculator className="w-5 h-5 mr-2" />
                      Calculate Upgrade Cost
                    </Button>
                    <UpgradeResult 
                      result={result} darkMode={darkMode} formatCurrency={formatCurrency}
                      currentPlan={currentPlan} targetPlan={targetPlan}
                      startDate={startDateText} endDate={endDateText}
                    />
                  </TabsContent>
                  
                  <TabsContent value="prorata" className="mt-6">
                    <ProRataUserAddition darkMode={darkMode} />
                  </TabsContent>
                  
                  <TabsContent value="ledger" className="mt-6">
                    <BillingLedger darkMode={darkMode} />
                  </TabsContent>
                  
                  <TabsContent value="vps" className="mt-6">
                    <VpsPricingCalculator darkMode={darkMode} />
                  </TabsContent>

                  <TabsContent value="history" className="mt-6">
                    <CalculationHistorySheet darkMode={darkMode} formatCurrency={formatCurrency} calculationHistory={calculationHistory} clearHistory={clearCalculationHistory} exportHistory={exportCalculationHistory} isAdmin={isAdmin} />
                  </TabsContent>
                </Tabs>
              </TabsContent>

              <TabsContent value="cgap">
                <CGAPEmbedded darkMode={darkMode} />
              </TabsContent>

              <TabsContent value="qgap">
                <QuotationTab darkMode={darkMode} />
              </TabsContent>

              <TabsContent value="vrap">
                <VrapTab darkMode={darkMode} />
              </TabsContent>

              <TabsContent value="ttap">
                <TTAPTab darkMode={darkMode} />
              </TabsContent>

              <TabsContent value="dcap">
                <DCAPTab darkMode={darkMode} />
              </TabsContent>

              <TabsContent value="database">
                <DatabasePage darkMode={darkMode} />
              </TabsContent>

              {isAdmin && (
                <TabsContent value="settings">
                  <SettingsTab darkMode={darkMode} />
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>

        <FooterSection darkMode={darkMode} />
      </div>
    </div>;
};
export default Index;
