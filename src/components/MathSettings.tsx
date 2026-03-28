import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Save, RotateCcw, Calculator, Code, Edit3, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FormulaBuilder from "./FormulaBuilder";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface MathSettingsData {
  roundingMethod: 'ceil' | 'floor' | 'round';
  minimumUpgradeAmount: number;
  usageCalculationMethod: 'days' | 'percentage';
  allowNegativeUpgrades: boolean;
  customFormula: string;
  useCustomFormula: boolean;
  taxCalculationOrder: 'before-discount' | 'after-discount';
  customSteps: {
    dailyCostFormula: string;
    usedMoneyFormula: string;
    remainingAmountFormula: string;
    upgradeAmountFormula: string;
    useCustomSteps: boolean;
  };
  variables: {
    defaultCurrentPrice: number;
    defaultTargetPrice: number;
    defaultUsedDays: number;
    defaultTotalDays: number;
    multiplierFactor: number;
    taxRate: number;
    discountRate: number;
  };
}

const defaultSettings: MathSettingsData = {
  roundingMethod: 'ceil',
  minimumUpgradeAmount: 0,
  usageCalculationMethod: 'days',
  allowNegativeUpgrades: false,
  customFormula: '',
  useCustomFormula: false,
  taxCalculationOrder: 'after-discount',
  customSteps: {
    dailyCostFormula: 'currentPrice / totalDays',
    usedMoneyFormula: 'usedDays * dailyCost',
    remainingAmountFormula: 'currentPrice - usedMoney',
    upgradeAmountFormula: 'targetPrice - remainingAmount',
    useCustomSteps: false
  },
  variables: {
    defaultCurrentPrice: 1000,
    defaultTargetPrice: 2000,
    defaultUsedDays: 15,
    defaultTotalDays: 30,
    multiplierFactor: 1,
    taxRate: 0,
    discountRate: 0,
  }
};

interface MathSettingsProps {
  darkMode: boolean;
}

const MathSettings: React.FC<MathSettingsProps> = ({ darkMode }) => {
  const [settings, setSettings] = useState<MathSettingsData>(defaultSettings);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('calculator-math-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...defaultSettings, ...parsed });
      } catch (error) {
        console.error('Error loading math settings:', error);
      }
    }
  }, []);

  const saveSettings = () => {
    localStorage.setItem('calculator-math-settings', JSON.stringify(settings));
    toast({
      title: "Math settings saved",
      description: "Calculation formula has been updated."
    });
    setIsOpen(false);
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
    localStorage.removeItem('calculator-math-settings');
    toast({
      title: "Settings reset",
      description: "Math settings have been restored to defaults."
    });
  };

  const updateSetting = <K extends keyof MathSettingsData>(key: K, value: MathSettingsData[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const updateCustomStep = <K extends keyof MathSettingsData['customSteps']>(stepKey: K, value: MathSettingsData['customSteps'][K]) => {
    setSettings(prev => ({
      ...prev,
      customSteps: {
        ...prev.customSteps,
        [stepKey]: value
      }
    }));
  };

  const handleFormulaChange = (formula: string) => {
    setSettings(prev => ({ ...prev, customFormula: formula }));
  };

  const updateVariable = (key: keyof MathSettingsData['variables'], value: number) => {
    setSettings(prev => ({
      ...prev,
      variables: {
        ...prev.variables,
        [key]: value
      }
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={darkMode ? 'bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:text-white hover:border-gray-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}
        >
          <Settings className="w-4 h-4 mr-2" />
          Math Settings
        </Button>
      </DialogTrigger>
      
      <DialogContent className={`max-w-4xl max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white'}`}>
        <DialogHeader>
          <DialogTitle className={darkMode ? 'text-white' : 'text-gray-800'}>
            Math Calculation Settings
          </DialogTitle>
          <DialogDescription className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
            Modify how upgrade calculations are performed
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="mt-4">
          <TabsList className={`grid w-full grid-cols-5 ${darkMode ? 'bg-gray-800' : ''}`}>
            <TabsTrigger value="basic">Basic Settings</TabsTrigger>
            <TabsTrigger value="variables">Variables</TabsTrigger>
            <TabsTrigger value="steps">Calculation Steps</TabsTrigger>
            <TabsTrigger value="formula">Formula Builder</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-6">
            {/* Current Math Process Explanation */}
            <Card className={darkMode ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-blue-200'}>
              <CardHeader>
                <CardTitle className={`text-lg ${darkMode ? 'text-white' : 'text-blue-800'}`}>
                  <Calculator className="w-5 h-5 mr-2 inline" />
                  How the Math Works
                </CardTitle>
              </CardHeader>
              <CardContent className={`text-sm space-y-2 ${darkMode ? 'text-gray-300' : 'text-blue-700'}`}>
                <div className="font-mono bg-gray-100 dark:bg-gray-700 p-3 rounded">
                  <div>1. <strong>Daily Cost</strong> = Current Price ÷ Total Days</div>
                  <div>2. <strong>Used Money</strong> = Used Days × Daily Cost</div>
                  <div>3. <strong>Remaining Amount</strong> = Current Price - Used Money</div>
                  <div>4. <strong>Upgrade Amount</strong> = Target Price - Remaining Amount</div>
                  <div>5. Apply minimum amount, negative handling, and rounding</div>
                </div>
              </CardContent>
            </Card>

            {/* Rounding Method */}
            <div className="space-y-2">
              <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                Rounding Method
              </Label>
              <Select 
                value={settings.roundingMethod} 
                onValueChange={(value: 'ceil' | 'floor' | 'round') => updateSetting('roundingMethod', value)}
              >
                <SelectTrigger className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ceil">Round Up (Ceiling)</SelectItem>
                  <SelectItem value="floor">Round Down (Floor)</SelectItem>
                  <SelectItem value="round">Round to Nearest</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Minimum Upgrade Amount */}
            <div className="space-y-2">
              <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                Minimum Upgrade Amount (NPR)
              </Label>
              <Input
                type="number"
                value={settings.minimumUpgradeAmount}
                onChange={(e) => updateSetting('minimumUpgradeAmount', parseFloat(e.target.value) || 0)}
                className={darkMode ? 'bg-gray-800 border-gray-700' : ''}
                min="0"
              />
            </div>

            {/* Allow Negative Upgrades */}
            <div className="flex items-center space-x-2">
              <Switch
                id="negative-upgrades"
                checked={settings.allowNegativeUpgrades}
                onCheckedChange={(checked) => updateSetting('allowNegativeUpgrades', checked)}
              />
              <Label htmlFor="negative-upgrades" className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                Allow negative upgrade amounts (downgrades)
              </Label>
            </div>
          </TabsContent>

          <TabsContent value="variables" className="space-y-6">
            {/* Variables Overview */}
            <Card className={darkMode ? 'bg-gray-800 border-gray-700' : 'bg-green-50 border-green-200'}>
              <CardHeader>
                <CardTitle className={`text-lg ${darkMode ? 'text-white' : 'text-green-800'}`}>
                  <Database className="w-5 h-5 mr-2 inline" />
                  Calculation Variables
                </CardTitle>
              </CardHeader>
              <CardContent className={`text-sm space-y-2 ${darkMode ? 'text-gray-300' : 'text-green-700'}`}>
                <div className="font-mono bg-gray-100 dark:bg-gray-700 p-3 rounded space-y-1">
                  <div><strong>Input Variables:</strong> currentPrice, targetPrice, usedDays, totalDays</div>
                  <div><strong>Calculated Variables:</strong> dailyCost, usedMoney, remainingAmount, upgradeAmount</div>
                  <div><strong>Modifier Variables:</strong> multiplierFactor, taxRate, discountRate</div>
                </div>
              </CardContent>
            </Card>

            {/* Default Input Values */}
            <Card className={darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}>
              <CardHeader>
                <CardTitle className={`text-md ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  Default Input Values
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                      Default Current Price (NPR)
                    </Label>
                    <Input
                      type="number"
                      value={settings.variables.defaultCurrentPrice}
                      onChange={(e) => updateVariable('defaultCurrentPrice', parseFloat(e.target.value) || 0)}
                      className={darkMode ? 'bg-gray-800 border-gray-700' : ''}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                      Default Target Price (NPR)
                    </Label>
                    <Input
                      type="number"
                      value={settings.variables.defaultTargetPrice}
                      onChange={(e) => updateVariable('defaultTargetPrice', parseFloat(e.target.value) || 0)}
                      className={darkMode ? 'bg-gray-800 border-gray-700' : ''}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                      Default Used Days
                    </Label>
                    <Input
                      type="number"
                      value={settings.variables.defaultUsedDays}
                      onChange={(e) => updateVariable('defaultUsedDays', parseFloat(e.target.value) || 0)}
                      className={darkMode ? 'bg-gray-800 border-gray-700' : ''}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                      Default Total Days
                    </Label>
                    <Input
                      type="number"
                      value={settings.variables.defaultTotalDays}
                      onChange={(e) => updateVariable('defaultTotalDays', parseFloat(e.target.value) || 0)}
                      className={darkMode ? 'bg-gray-800 border-gray-700' : ''}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Modifier Variables */}
            <Card className={darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}>
              <CardHeader>
                <CardTitle className={`text-md ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  Modifier Variables
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                      Multiplier Factor
                    </Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={settings.variables.multiplierFactor}
                      onChange={(e) => updateVariable('multiplierFactor', parseFloat(e.target.value) || 1)}
                      className={darkMode ? 'bg-gray-800 border-gray-700' : ''}
                    />
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Multiplies the final result
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                      Tax Rate (%)
                    </Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={settings.variables.taxRate}
                      onChange={(e) => updateVariable('taxRate', parseFloat(e.target.value) || 0)}
                      className={darkMode ? 'bg-gray-800 border-gray-700' : ''}
                    />
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Tax percentage to apply
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                      Discount Rate (%)
                    </Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={settings.variables.discountRate}
                      onChange={(e) => updateVariable('discountRate', parseFloat(e.target.value) || 0)}
                      className={darkMode ? 'bg-gray-800 border-gray-700' : ''}
                    />
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Discount percentage to apply
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Variable Usage Info */}
            <Card className={darkMode ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-blue-200'}>
              <CardContent className="pt-4">
                <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-blue-700'}`}>
                  <strong>How variables are used:</strong><br/>
                  • Default values are used when no input is provided<br/>
                  • Modifier variables can be used in custom formulas<br/>
                  • All variables are available in the Formula Builder
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="steps" className="space-y-6">
            {/* Use Custom Steps Toggle */}
            <div className="flex items-center space-x-2">
              <Switch
                id="custom-steps"
                checked={settings.customSteps.useCustomSteps}
                onCheckedChange={(checked) => updateCustomStep('useCustomSteps', checked)}
              />
              <Label htmlFor="custom-steps" className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                Use custom calculation steps
              </Label>
            </div>

            {settings.customSteps.useCustomSteps && (
              <div className="space-y-4">
                <Card className={darkMode ? 'bg-gray-800 border-gray-700' : 'bg-yellow-50 border-yellow-200'}>
                  <CardContent className="pt-4">
                    <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-yellow-700'}`}>
                      <strong>Available variables:</strong> currentPrice, targetPrice, usedDays, totalDays, dailyCost, usedMoney, remainingAmount
                    </p>
                  </CardContent>
                </Card>

                {/* Daily Cost Formula */}
                <div className="space-y-2">
                  <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                    <Edit3 className="w-4 h-4 mr-2 inline" />
                    Step 1: Daily Cost Calculation
                  </Label>
                  <Input
                    value={settings.customSteps.dailyCostFormula}
                    onChange={(e) => updateCustomStep('dailyCostFormula', e.target.value)}
                    placeholder="currentPrice / totalDays"
                    className={darkMode ? 'bg-gray-800 border-gray-700' : ''}
                  />
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Default: currentPrice / totalDays
                  </p>
                </div>

                {/* Used Money Formula */}
                <div className="space-y-2">
                  <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                    <Edit3 className="w-4 h-4 mr-2 inline" />
                    Step 2: Used Money Calculation
                  </Label>
                  <Input
                    value={settings.customSteps.usedMoneyFormula}
                    onChange={(e) => updateCustomStep('usedMoneyFormula', e.target.value)}
                    placeholder="usedDays * dailyCost"
                    className={darkMode ? 'bg-gray-800 border-gray-700' : ''}
                  />
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Default: usedDays * dailyCost
                  </p>
                </div>

                {/* Remaining Amount Formula */}
                <div className="space-y-2">
                  <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                    <Edit3 className="w-4 h-4 mr-2 inline" />
                    Step 3: Remaining Amount Calculation
                  </Label>
                  <Input
                    value={settings.customSteps.remainingAmountFormula}
                    onChange={(e) => updateCustomStep('remainingAmountFormula', e.target.value)}
                    placeholder="currentPrice - usedMoney"
                    className={darkMode ? 'bg-gray-800 border-gray-700' : ''}
                  />
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Default: currentPrice - usedMoney
                  </p>
                </div>

                {/* Upgrade Amount Formula */}
                <div className="space-y-2">
                  <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                    <Edit3 className="w-4 h-4 mr-2 inline" />
                    Step 4: Upgrade Amount Calculation
                  </Label>
                  <Input
                    value={settings.customSteps.upgradeAmountFormula}
                    onChange={(e) => updateCustomStep('upgradeAmountFormula', e.target.value)}
                    placeholder="targetPrice - remainingAmount"
                    className={darkMode ? 'bg-gray-800 border-gray-700' : ''}
                  />
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Default: targetPrice - remainingAmount
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="formula" className="space-y-6">
            {/* Use Custom Formula Toggle */}
            <div className="flex items-center space-x-2">
              <Switch
                id="custom-formula"
                checked={settings.useCustomFormula}
                onCheckedChange={(checked) => updateSetting('useCustomFormula', checked)}
              />
              <Label htmlFor="custom-formula" className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                Use custom calculation formula
              </Label>
            </div>

            {settings.useCustomFormula && (
              <>
                <FormulaBuilder
                  initialFormula={settings.customFormula}
                  onFormulaChange={handleFormulaChange}
                  darkMode={darkMode}
                />
                
                {/* Manual Formula Input */}
                <div className="space-y-2">
                  <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                    <Code className="w-4 h-4 mr-2 inline" />
                    Manual Formula (Advanced)
                  </Label>
                  <Textarea
                    value={settings.customFormula}
                    onChange={(e) => updateSetting('customFormula', e.target.value)}
                    placeholder="Enter custom JavaScript formula. Available variables: currentPrice, targetPrice, usedDays, totalDays, usedMoney, remainingAmount"
                    className={`h-24 ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}
                  />
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Example: targetPrice - remainingAmount + (usedDays * 5)
                  </p>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="advanced" className="space-y-6">
            {/* Usage Calculation Method */}
            <div className="space-y-2">
              <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                Usage Calculation Method
              </Label>
              <Select 
                value={settings.usageCalculationMethod} 
                onValueChange={(value: 'days' | 'percentage') => updateSetting('usageCalculationMethod', value)}
              >
                <SelectTrigger className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="days">Days-based calculation</SelectItem>
                  <SelectItem value="percentage">Percentage-based calculation</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tax Calculation Order */}
            <div className="space-y-2">
              <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                Tax Calculation Order
              </Label>
              <Select 
                value={settings.taxCalculationOrder} 
                onValueChange={(value: 'before-discount' | 'after-discount') => updateSetting('taxCalculationOrder', value)}
              >
                <SelectTrigger className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="after-discount">Apply tax after discount</SelectItem>
                  <SelectItem value="before-discount">Apply tax before discount</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="outline"
            onClick={resetSettings}
            className={darkMode ? 'border-gray-700 hover:bg-gray-800' : ''}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to Defaults
          </Button>
          
          <Button onClick={saveSettings}>
            <Save className="w-4 h-4 mr-2" />
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MathSettings;
