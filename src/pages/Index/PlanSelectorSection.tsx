import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Edit, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface PlanSelectorSectionProps {
  category: string;
  setCategory: (value: string) => void;
  currentPlan: string;
  setCurrentPlan: (value: string) => void;
  billingCycle: string;
  setBillingCycle: (value: string) => void;
  darkMode: boolean;
  targetCategory: string;
  setTargetCategory: (value: string) => void;
  targetPlan: string;
  setTargetPlan: (value: string) => void;
  targetBillingCycle: string;
  setTargetBillingCycle: (value: string) => void;
  currentPlanPriceOverride?: number;
  setCurrentPlanPriceOverride?: (price: number | undefined) => void;
  targetPlanPriceOverride?: number;
  setTargetPlanPriceOverride?: (price: number | undefined) => void;
  currentPlanTaxEnabled: boolean;
  setCurrentPlanTaxEnabled: (enabled: boolean) => void;
  currentPlanTaxRate: number;
  setCurrentPlanTaxRate: (rate: number) => void;
  targetPlanTaxEnabled: boolean;
  setTargetPlanTaxEnabled: (enabled: boolean) => void;
  targetPlanTaxRate: number;
  setTargetPlanTaxRate: (rate: number) => void;
  currentPlanDiscountEnabled: boolean;
  setCurrentPlanDiscountEnabled: (enabled: boolean) => void;
  currentPlanDiscountRate: number;
  setCurrentPlanDiscountRate: (rate: number) => void;
  targetPlanDiscountEnabled: boolean;
  setTargetPlanDiscountEnabled: (enabled: boolean) => void;
  targetPlanDiscountRate: number;
  setTargetPlanDiscountRate: (rate: number) => void;
}

const PlanSelectorSection: React.FC<PlanSelectorSectionProps> = ({
  category,
  setCategory,
  currentPlan,
  setCurrentPlan,
  billingCycle,
  setBillingCycle,
  darkMode,
  targetCategory,
  setTargetCategory,
  targetPlan,
  setTargetPlan,
  targetBillingCycle,
  setTargetBillingCycle,
  currentPlanPriceOverride,
  setCurrentPlanPriceOverride,
  targetPlanPriceOverride,
  setTargetPlanPriceOverride,
  currentPlanTaxEnabled,
  setCurrentPlanTaxEnabled,
  currentPlanTaxRate,
  setCurrentPlanTaxRate,
  targetPlanTaxEnabled,
  setTargetPlanTaxEnabled,
  targetPlanTaxRate,
  setTargetPlanTaxRate,
  currentPlanDiscountEnabled,
  setCurrentPlanDiscountEnabled,
  currentPlanDiscountRate,
  setCurrentPlanDiscountRate,
  targetPlanDiscountEnabled,
  setTargetPlanDiscountEnabled,
  targetPlanDiscountRate,
  setTargetPlanDiscountRate,
}) => {
  const { getPlanData } = useAuth();
  const planData = getPlanData();
  const [isOverriding, setIsOverriding] = useState(false);
  const [overrideValue, setOverrideValue] = useState("");
  const [isTargetOverriding, setIsTargetOverriding] = useState(false);
  const [targetOverrideValue, setTargetOverrideValue] = useState("");

  const cycleLabels: { [key: number]: string } = {
    1: "Monthly",
    12: "Annually", 
    36: "3 Years"
  };

  const formatCurrency = (amount: number) => {
    return `NPR ${amount.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getAllPlansForCategory = () => {
    if (!category || !planData[category]) return [];
    return planData[category].options;
  };

  const getAvailableCycles = () => {
    if (!category || !planData[category]) return [];
    return planData[category].cycles;
  };

  const getPlanDisplayPrice = (plan: any) => {
    if (!plan || !billingCycle) return null;
    
    if (plan.pricing) {
      return plan.pricing[parseInt(billingCycle)];
    }
    return plan.price;
  };

  const getAllPlansForAnyCategory = (cat: string) => {
    if (!cat || !planData[cat]) return [];
    return planData[cat].options;
  };

  const getAvailableCyclesForAnyCategory = (cat: string) => {
    if (!cat || !planData[cat]) return [];
    return planData[cat].cycles;
  };

  const getPlanDisplayPriceForCategory = (plan: any, cat: string, cycle: string) => {
    if (!plan || !cycle) return null;
    
    if (plan.pricing) {
      return plan.pricing[parseInt(cycle)];
    }
    return plan.price;
  };

  const getCurrentPlanPrice = () => {
    // If there's a price override, use that instead
    if (currentPlanPriceOverride !== undefined) {
      return currentPlanPriceOverride;
    }

    if (!category || !currentPlan || !billingCycle) return null;
    
    const plan = getAllPlansForCategory().find(p => p.name === currentPlan);
    if (!plan) return null;
    
    return getPlanDisplayPrice(plan);
  };

  const getTargetPlanPrice = () => {
    // If there's a price override, use that instead
    if (targetPlanPriceOverride !== undefined) {
      return targetPlanPriceOverride;
    }

    if (!targetCategory || !targetPlan || !targetBillingCycle) return null;
    
    const plan = getAllPlansForAnyCategory(targetCategory).find(p => p.name === targetPlan);
    if (!plan) return null;
    
    return getPlanDisplayPriceForCategory(plan, targetCategory, targetBillingCycle);
  };

  const getCurrentPlanFinalPrice = () => {
    let basePrice = getCurrentPlanPrice();
    if (!basePrice) return null;
    
    // Apply discount first if enabled
    if (currentPlanDiscountEnabled) {
      basePrice = basePrice * (1 - currentPlanDiscountRate / 100);
    }
    
    // Apply tax exclusion if enabled (subtract tax from price)
    if (currentPlanTaxEnabled) {
      basePrice = basePrice * (1 - currentPlanTaxRate / 100);
    }
    
    return basePrice;
  };

  const getTargetPlanFinalPrice = () => {
    let basePrice = getTargetPlanPrice();
    if (!basePrice) return null;
    
    // Apply discount first if enabled
    if (targetPlanDiscountEnabled) {
      basePrice = basePrice * (1 - targetPlanDiscountRate / 100);
    }
    
    // Apply tax exclusion if enabled (subtract tax from price)
    if (targetPlanTaxEnabled) {
      basePrice = basePrice * (1 - targetPlanTaxRate / 100);
    }
    
    return basePrice;
  };

  const handlePriceOverride = () => {
    const originalPrice = getCurrentPlanPriceWithoutOverride();
    setOverrideValue(originalPrice?.toString() || "");
    setIsOverriding(true);
  };

  const applyPriceOverride = () => {
    const newPrice = parseFloat(overrideValue);
    if (!isNaN(newPrice) && newPrice > 0 && setCurrentPlanPriceOverride) {
      setCurrentPlanPriceOverride(newPrice);
      setIsOverriding(false);
    }
  };

  const cancelPriceOverride = () => {
    setIsOverriding(false);
    setOverrideValue("");
    if (setCurrentPlanPriceOverride) {
      setCurrentPlanPriceOverride(undefined);
    }
  };

  const handleTargetPriceOverride = () => {
    const originalPrice = getTargetPlanPriceWithoutOverride();
    setTargetOverrideValue(originalPrice?.toString() || "");
    setIsTargetOverriding(true);
  };

  const applyTargetPriceOverride = () => {
    const newPrice = parseFloat(targetOverrideValue);
    if (!isNaN(newPrice) && newPrice > 0 && setTargetPlanPriceOverride) {
      setTargetPlanPriceOverride(newPrice);
      setIsTargetOverriding(false);
    }
  };

  const cancelTargetPriceOverride = () => {
    setIsTargetOverriding(false);
    setTargetOverrideValue("");
    if (setTargetPlanPriceOverride) {
      setTargetPlanPriceOverride(undefined);
    }
  };

  const getCurrentPlanPriceWithoutOverride = () => {
    if (!category || !currentPlan || !billingCycle) return null;
    
    const plan = getAllPlansForCategory().find(p => p.name === currentPlan);
    if (!plan) return null;
    
    return getPlanDisplayPrice(plan);
  };

  const getTargetPlanPriceWithoutOverride = () => {
    if (!targetCategory || !targetPlan || !targetBillingCycle) return null;
    
    const plan = getAllPlansForAnyCategory(targetCategory).find(p => p.name === targetPlan);
    if (!plan) return null;
    
    return getPlanDisplayPriceForCategory(plan, targetCategory, targetBillingCycle);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Current Plan Section */}
      <Card className={darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50'}>
        <CardHeader>
          <CardTitle className={`text-lg ${darkMode ? 'text-white' : 'text-gray-800'}`}>
            Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className={darkMode ? 'bg-gray-600 border-gray-500' : ''}>
                <SelectValue placeholder="Select hosting category" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(planData).map(([key, value]: [string, any]) => (
                  <SelectItem key={key} value={key}>
                    {value.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Plan</Label>
            <Select value={currentPlan} onValueChange={setCurrentPlan} disabled={!category}>
              <SelectTrigger className={darkMode ? 'bg-gray-600 border-gray-500' : ''}>
                <SelectValue placeholder="Select your current plan" />
              </SelectTrigger>
              <SelectContent>
                {getAllPlansForCategory().map((plan) => (
                  <SelectItem key={plan.name} value={plan.name}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Billing Cycle</Label>
            <Select value={billingCycle} onValueChange={setBillingCycle} disabled={!category}>
              <SelectTrigger className={darkMode ? 'bg-gray-600 border-gray-500' : ''}>
                <SelectValue placeholder="Select billing cycle" />
              </SelectTrigger>
              <SelectContent>
                {getAvailableCycles().map((cycle) => (
                  <SelectItem key={cycle} value={cycle.toString()}>
                    {cycleLabels[cycle] || `${cycle} months`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Current Plan Price Display with Override Option */}
          {getCurrentPlanPrice() && (
            <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-600' : 'bg-blue-50'} border ${darkMode ? 'border-gray-500' : 'border-blue-200'}`}>
              <div className="flex justify-between items-start mb-2">
                <Label className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  Current Plan Price {currentPlanPriceOverride !== undefined && "(Override Active)"}
                </Label>
                <div className="flex gap-1">
                  {currentPlanPriceOverride === undefined ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePriceOverride}
                      className={`h-6 w-6 p-0 ${darkMode ? 'hover:bg-gray-500' : 'hover:bg-blue-100'}`}
                    >
                      <Edit className="w-3 h-3" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={cancelPriceOverride}
                      className={`h-6 w-6 p-0 ${darkMode ? 'hover:bg-gray-500' : 'hover:bg-blue-100'}`}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>

              {isOverriding ? (
                <div className="space-y-2">
                  <Input
                    type="number"
                    value={overrideValue}
                    onChange={(e) => setOverrideValue(e.target.value)}
                    placeholder="Enter custom price"
                    className={`h-8 ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white'}`}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={applyPriceOverride}
                      className="h-6 px-2 text-xs"
                    >
                      Apply
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsOverriding(false)}
                      className={`h-6 px-2 text-xs ${darkMode ? 'border-gray-600 hover:bg-gray-600' : ''}`}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                    {formatCurrency(getCurrentPlanFinalPrice())}
                    <span className={`text-sm font-normal ml-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      / {cycleLabels[parseInt(billingCycle)] || `${billingCycle} months`}
                    </span>
                    {currentPlanPriceOverride !== undefined && (
                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                        Original: {formatCurrency(getCurrentPlanPriceWithoutOverride() || 0)}
                      </div>
                    )}
                  </div>
                  
                  {/* Tax Exclusion Controls */}
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="current-plan-tax"
                        checked={currentPlanTaxEnabled}
                        onCheckedChange={setCurrentPlanTaxEnabled}
                      />
                      <Label htmlFor="current-plan-tax" className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        Exclude Tax
                      </Label>
                    </div>
                    {currentPlanTaxEnabled && (
                      <div className="flex items-center space-x-2">
                        <Label className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Tax Rate:
                        </Label>
                        <Input
                          type="number"
                          value={currentPlanTaxRate}
                          onChange={(e) => setCurrentPlanTaxRate(parseFloat(e.target.value) || 0)}
                          className={`h-6 w-16 text-xs ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white'}`}
                          min="0"
                          max="100"
                          step="0.1"
                        />
                        <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>%</span>
                      </div>
                    )}
                  </div>

                  {/* Discount Controls */}
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="current-plan-discount"
                        checked={currentPlanDiscountEnabled}
                        onCheckedChange={setCurrentPlanDiscountEnabled}
                      />
                      <Label htmlFor="current-plan-discount" className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        Apply Discount
                      </Label>
                    </div>
                    {currentPlanDiscountEnabled && (
                      <div className="flex items-center space-x-2">
                        <Label className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Discount Rate:
                        </Label>
                        <Input
                          type="number"
                          value={currentPlanDiscountRate}
                          onChange={(e) => setCurrentPlanDiscountRate(parseFloat(e.target.value) || 0)}
                          className={`h-6 w-16 text-xs ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white'}`}
                          min="0"
                          max="100"
                          step="0.1"
                        />
                        <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>%</span>
                      </div>
                    )}
                  </div>

                  {(currentPlanTaxEnabled || currentPlanDiscountEnabled) && (
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-2`}>
                      Base Price: {formatCurrency(getCurrentPlanPrice())}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Target Plan Section */}
      <Card className={darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50'}>
        <CardHeader>
          <CardTitle className={`text-lg ${darkMode ? 'text-white' : 'text-gray-800'}`}>
            Target Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Category</Label>
            <Select value={targetCategory} onValueChange={setTargetCategory}>
              <SelectTrigger className={darkMode ? 'bg-gray-600 border-gray-500' : ''}>
                <SelectValue placeholder="Select target category" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(planData).map(([key, value]: [string, any]) => (
                  <SelectItem key={key} value={key}>
                    {value.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Plan</Label>
            <Select value={targetPlan} onValueChange={setTargetPlan} disabled={!targetCategory}>
              <SelectTrigger className={darkMode ? 'bg-gray-600 border-gray-500' : ''}>
                <SelectValue placeholder="Select target plan" />
              </SelectTrigger>
              <SelectContent>
                {getAllPlansForAnyCategory(targetCategory).map((plan) => (
                  <SelectItem key={plan.name} value={plan.name}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Billing Cycle</Label>
            <Select value={targetBillingCycle} onValueChange={setTargetBillingCycle} disabled={!targetCategory}>
              <SelectTrigger className={darkMode ? 'bg-gray-600 border-gray-500' : ''}>
                <SelectValue placeholder="Select billing cycle" />
              </SelectTrigger>
              <SelectContent>
                {getAvailableCyclesForAnyCategory(targetCategory).map((cycle) => (
                  <SelectItem key={cycle} value={cycle.toString()}>
                    {cycleLabels[cycle] || `${cycle} months`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target Plan Price Display with Override Option */}
          {getTargetPlanPrice() && (
            <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-600' : 'bg-green-50'} border ${darkMode ? 'border-gray-500' : 'border-green-200'}`}>
              <div className="flex justify-between items-start mb-2">
                <Label className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  Target Plan Price {targetPlanPriceOverride !== undefined && "(Override Active)"}
                </Label>
                <div className="flex gap-1">
                  {targetPlanPriceOverride === undefined ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleTargetPriceOverride}
                      className={`h-6 w-6 p-0 ${darkMode ? 'hover:bg-gray-500' : 'hover:bg-green-100'}`}
                    >
                      <Edit className="w-3 h-3" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={cancelTargetPriceOverride}
                      className={`h-6 w-6 p-0 ${darkMode ? 'hover:bg-gray-500' : 'hover:bg-green-100'}`}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>

              {isTargetOverriding ? (
                <div className="space-y-2">
                  <Input
                    type="number"
                    value={targetOverrideValue}
                    onChange={(e) => setTargetOverrideValue(e.target.value)}
                    placeholder="Enter custom price"
                    className={`h-8 ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white'}`}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={applyTargetPriceOverride}
                      className="h-6 px-2 text-xs"
                    >
                      Apply
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsTargetOverriding(false)}
                      className={`h-6 px-2 text-xs ${darkMode ? 'border-gray-600 hover:bg-gray-600' : ''}`}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                    {formatCurrency(getTargetPlanFinalPrice())}
                    <span className={`text-sm font-normal ml-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      / {cycleLabels[parseInt(targetBillingCycle)] || `${targetBillingCycle} months`}
                    </span>
                    {targetPlanPriceOverride !== undefined && (
                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                        Original: {formatCurrency(getTargetPlanPriceWithoutOverride() || 0)}
                      </div>
                    )}
                  </div>
                  
                  {/* Tax Exclusion Controls */}
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="target-plan-tax"
                        checked={targetPlanTaxEnabled}
                        onCheckedChange={setTargetPlanTaxEnabled}
                      />
                      <Label htmlFor="target-plan-tax" className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        Exclude Tax
                      </Label>
                    </div>
                    {targetPlanTaxEnabled && (
                      <div className="flex items-center space-x-2">
                        <Label className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Tax Rate:
                        </Label>
                        <Input
                          type="number"
                          value={targetPlanTaxRate}
                          onChange={(e) => setTargetPlanTaxRate(parseFloat(e.target.value) || 0)}
                          className={`h-6 w-16 text-xs ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white'}`}
                          min="0"
                          max="100"
                          step="0.1"
                        />
                        <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>%</span>
                      </div>
                    )}
                  </div>

                  {/* Discount Controls */}
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="target-plan-discount"
                        checked={targetPlanDiscountEnabled}
                        onCheckedChange={setTargetPlanDiscountEnabled}
                      />
                      <Label htmlFor="target-plan-discount" className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        Apply Discount
                      </Label>
                    </div>
                    {targetPlanDiscountEnabled && (
                      <div className="flex items-center space-x-2">
                        <Label className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Discount Rate:
                        </Label>
                        <Input
                          type="number"
                          value={targetPlanDiscountRate}
                          onChange={(e) => setTargetPlanDiscountRate(parseFloat(e.target.value) || 0)}
                          className={`h-6 w-16 text-xs ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white'}`}
                          min="0"
                          max="100"
                          step="0.1"
                        />
                        <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>%</span>
                      </div>
                    )}
                  </div>

                  {(targetPlanTaxEnabled || targetPlanDiscountEnabled) && (
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-2`}>
                      Base Price: {formatCurrency(getTargetPlanPrice())}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PlanSelectorSection;
