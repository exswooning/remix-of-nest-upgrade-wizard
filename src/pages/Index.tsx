import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calculator, Moon, Sun, Calendar, UserPlus, ArrowUpCircle, FileText, Server, FileCheck } from "lucide-react";
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
import VpsPricingCalculator from "./Index/VpsPricingCalculator";
import { parseDate, formatDate } from "./Index/dateUtils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import UserManagement from "@/components/UserManagement";
import PriceManagement from "@/components/PriceManagement";
import MathSettings from "@/components/MathSettings";
import { calculateUpgradeWithSettings } from "@/utils/calculationEngine";
import CGAPEmbedded from "./Index/CGAPEmbedded";
// Updated plan data structure with cycle-specific pricing
const planData = {
  "shared-hosting": {
    name: "Web Hosting",
    options: [{
      name: "Web Essential",
      pricing: {
        1: 339,
        12: 2034,
        36: 3661
      }
    }, {
      name: "Web Plus",
      pricing: {
        1: 565,
        12: 3390,
        36: 6102
      }
    }, {
      name: "Web Pro",
      pricing: {
        1: 1017,
        12: 6102,
        36: 10984
      }
    }, {
      name: "Web Ultimate",
      pricing: {
        1: 1356,
        12: 8136,
        36: 14643
      }
    }],
    cycles: [1, 12, 36],
    unit: {
      1: "monthly",
      12: "annually",
      36: "triennial"
    }
  },
  cloud: {
    name: "Cloud Hosting",
    options: [{
      name: "Cloud Thikka",
      pricing: {
        1: 565,
        12: 3390,
        36: 6102
      }
    }, {
      name: "Cloud Ramro",
      pricing: {
        1: 791,
        12: 4746,
        36: 8543
      }
    }, {
      name: "Cloud Babaal",
      pricing: {
        1: 1469,
        12: 8814,
        36: 15865
      }
    }, {
      name: "Cloud Mazzako",
      pricing: {
        1: 2712,
        12: 16272,
        36: 29290
      }
    }],
    cycles: [1, 12, 36],
    unit: {
      1: "monthly",
      12: "annually",
      36: "triennial"
    }
  },
  wordpress: {
    name: "WordPress Hosting",
    options: [{
      name: "Basic",
      price: 400
    }, {
      name: "Regular",
      price: 800
    }, {
      name: "Ideal",
      price: 1200
    }, {
      name: "Ultimate",
      price: 2400
    }],
    cycles: [36],
    unit: {
      36: "triennial (3-year term only)"
    }
  },
  "vps-nepal": {
    name: "VPS Nepal",
    options: [{
      name: "1C/2G",
      pricing: {
        1: 1260,
        12: 15120,
        36: 45360
      }
    }, {
      name: "2C/4G",
      pricing: {
        1: 2520,
        12: 30240,
        36: 90720
      }
    }, {
      name: "3C/6G",
      pricing: {
        1: 3780,
        12: 45360,
        36: 136080
      }
    }, {
      name: "4C/8G",
      pricing: {
        1: 5050,
        12: 60600,
        36: 181800
      }
    }],
    cycles: [1, 12, 36],
    unit: {
      1: "monthly",
      12: "annually",
      36: "triennial"
    }
  },
  "vps-international": {
    name: "VPS International",
    options: [{
      name: "2C/4G",
      pricing: {
        1: 1000,
        12: 12000,
        36: 36000
      }
    }, {
      name: "4C/8G",
      pricing: {
        1: 2000,
        12: 24000,
        36: 72000
      }
    }, {
      name: "8C/16G",
      pricing: {
        1: 4000,
        12: 48000,
        36: 144000
      }
    }, {
      name: "16C/32G",
      pricing: {
        1: 8000,
        12: 96000,
        36: 288000
      }
    }],
    cycles: [1, 12, 36],
    unit: {
      1: "monthly",
      12: "annually",
      36: "triennial"
    }
  },
  "vps-windows": {
    name: "Windows VPS",
    options: [{
      name: "1C/2G",
      pricing: {
        1: 1260,
        12: 15120,
        36: 45360
      }
    }, {
      name: "2C/4G",
      pricing: {
        1: 2520,
        12: 30240,
        36: 90720
      }
    }, {
      name: "3C/6G",
      pricing: {
        1: 3780,
        12: 45360,
        36: 136080
      }
    }, {
      name: "4C/8G",
      pricing: {
        1: 5050,
        12: 60600,
        36: 181800
      }
    }],
    cycles: [1, 12, 36],
    unit: {
      1: "monthly",
      12: "annually",
      36: "triennial"
    }
  },
  reseller: {
    name: "Reseller Hosting",
    options: [{
      name: "Rh-10",
      pricing: {
        1: 959,
        12: 11512
      }
    }, {
      name: "Rh-15",
      pricing: {
        1: 1355,
        12: 16258
      }
    }, {
      name: "Rh-30",
      pricing: {
        1: 2259,
        12: 27106
      }
    }, {
      name: "Rh-50",
      pricing: {
        1: 3389,
        12: 40666
      }
    }, {
      name: "Rh-100",
      pricing: {
        1: 5197,
        12: 62362
      }
    }],
    cycles: [1, 12],
    unit: {
      1: "monthly",
      12: "annually"
    }
  }
};
const cycleLabels = {
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
  const [darkMode, setDarkMode] = useState(false);
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
  return <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'dark bg-black' : 'bg-gradient-to-br from-blue-50 to-indigo-100'}`}>
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <CalculatorHeader darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
          <div className="flex items-center gap-4">
            <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Welcome, {currentUser}
            </span>
            
            {isAdmin && <>
                <UserManagement darkMode={darkMode} />
                <PriceManagement darkMode={darkMode} />
                <MathSettings darkMode={darkMode} />
              </>}
            <Button variant="outline" size="sm" onClick={logout} className={darkMode ? 'bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:text-white hover:border-gray-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}>
              Logout
            </Button>
          </div>
        </div>
        
        <Card className={`max-w-2xl mx-auto ${darkMode ? 'bg-gray-950 border-gray-800' : 'bg-white border-gray-200'} shadow-xl`}>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className={darkMode ? 'text-white' : 'text-gray-800'}>
                  UCAP
                </CardTitle>
              </div>
              <CalculationHistorySheet darkMode={darkMode} formatCurrency={formatCurrency} calculationHistory={calculationHistory} clearHistory={clearCalculationHistory} exportHistory={exportCalculationHistory} isAdmin={isAdmin} />
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <Tabs defaultValue="upgrade" className="w-full">
              <TabsList className={`grid w-full grid-cols-5 ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <TabsTrigger 
                  value="upgrade" 
                  className={`flex items-center gap-1 text-xs ${darkMode ? 'data-[state=active]:bg-gray-700 data-[state=active]:text-white' : ''}`}
                >
                  <ArrowUpCircle className="w-3.5 h-3.5" />
                  Upgrade
                </TabsTrigger>
                <TabsTrigger 
                  value="prorata" 
                  className={`flex items-center gap-1 text-xs ${darkMode ? 'data-[state=active]:bg-gray-700 data-[state=active]:text-white' : ''}`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Pro Rata
                </TabsTrigger>
                <TabsTrigger 
                  value="ledger" 
                  className={`flex items-center gap-1 text-xs ${darkMode ? 'data-[state=active]:bg-gray-700 data-[state=active]:text-white' : ''}`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Ledger
                </TabsTrigger>
                <TabsTrigger 
                  value="vps" 
                  className={`flex items-center gap-1 text-xs ${darkMode ? 'data-[state=active]:bg-gray-700 data-[state=active]:text-white' : ''}`}
                >
                  <Server className="w-3.5 h-3.5" />
                  VPS
                </TabsTrigger>
                <TabsTrigger 
                  value="cgap" 
                  className={`flex items-center gap-1 text-xs ${darkMode ? 'data-[state=active]:bg-blue-900 data-[state=active]:text-blue-300' : 'data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700'}`}
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  CGAP
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="upgrade" className="mt-6 space-y-6">
                <PlanSelectorSection 
                  category={category} 
                  setCategory={setCategory} 
                  currentPlan={currentPlan} 
                  setCurrentPlan={setCurrentPlan} 
                  billingCycle={billingCycle} 
                  setBillingCycle={setBillingCycle} 
                  darkMode={darkMode} 
                  targetCategory={targetCategory} 
                  setTargetCategory={setTargetCategory} 
                  targetPlan={targetPlan} 
                  setTargetPlan={setTargetPlan} 
                  targetBillingCycle={targetBillingCycle} 
                  setTargetBillingCycle={setTargetBillingCycle} 
                  currentPlanPriceOverride={currentPlanPriceOverride} 
                  setCurrentPlanPriceOverride={setCurrentPlanPriceOverride} 
                  targetPlanPriceOverride={targetPlanPriceOverride} 
                  setTargetPlanPriceOverride={setTargetPlanPriceOverride}
                  currentPlanTaxEnabled={currentPlanTaxEnabled}
                  setCurrentPlanTaxEnabled={setCurrentPlanTaxEnabled}
                  currentPlanTaxRate={currentPlanTaxRate}
                  setCurrentPlanTaxRate={setCurrentPlanTaxRate}
                  targetPlanTaxEnabled={targetPlanTaxEnabled}
                  setTargetPlanTaxEnabled={setTargetPlanTaxEnabled}
                  targetPlanTaxRate={targetPlanTaxRate}
                  setTargetPlanTaxRate={setTargetPlanTaxRate}
                  currentPlanDiscountEnabled={currentPlanDiscountEnabled}
                  setCurrentPlanDiscountEnabled={setCurrentPlanDiscountEnabled}
                  currentPlanDiscountRate={currentPlanDiscountRate}
                  setCurrentPlanDiscountRate={setCurrentPlanDiscountRate}
                  targetPlanDiscountEnabled={targetPlanDiscountEnabled}
                  setTargetPlanDiscountEnabled={setTargetPlanDiscountEnabled}
                  targetPlanDiscountRate={targetPlanDiscountRate}
                  setTargetPlanDiscountRate={setTargetPlanDiscountRate}
                />
                <DateRangeSelector darkMode={darkMode} startDateText={startDateText} endDateText={endDateText} handleStartDateChange={handleStartDateChange} handleEndDateChange={handleEndDateChange} startDate={startDate} endDate={endDate} setStartDate={setStartDate} setEndDate={setEndDate} calculateDaysFromDates={calculateDaysFromDates} />
                <UsageDurationInfo darkMode={darkMode} calculateDaysFromDates={calculateDaysFromDates} startDate={startDate} endDate={endDate} billingCycle={billingCycle} cycleLabels={cycleLabels} />
                <Button onClick={calculateUpgrade} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-lg font-semibold" size="lg">
                  <Calculator className="w-5 h-5 mr-2" />
                  Calculate Upgrade Cost
                </Button>
                <UpgradeResult 
                  result={result} 
                  darkMode={darkMode} 
                  formatCurrency={formatCurrency} 
                  currentPlan={currentPlan}
                  targetPlan={targetPlan}
                  startDate={startDateText}
                  endDate={endDateText}
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

              <TabsContent value="cgap" className="mt-6">
                <CGAPEmbedded darkMode={darkMode} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <FooterSection darkMode={darkMode} />
      </div>
    </div>;
};
export default Index;
