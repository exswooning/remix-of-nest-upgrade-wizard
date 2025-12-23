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

export const getMathSettings = (): MathSettingsData => {
  const savedSettings = localStorage.getItem('calculator-math-settings');
  if (savedSettings) {
    try {
      const parsed = JSON.parse(savedSettings);
      return { ...defaultSettings, ...parsed };
    } catch (error) {
      console.error('Error loading math settings:', error);
    }
  }
  return defaultSettings;
};

export const applyRounding = (value: number, method: 'ceil' | 'floor' | 'round'): number => {
  switch (method) {
    case 'ceil':
      return Math.ceil(value);
    case 'floor':
      return Math.floor(value);
    case 'round':
      return Math.round(value);
    default:
      return Math.ceil(value);
  }
};

const evaluateFormula = (formula: string, variables: Record<string, number>): number => {
  try {
    // Replace variables in the formula
    let evaluatedFormula = formula;
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\b${key}\\b`, 'g');
      evaluatedFormula = evaluatedFormula.replace(regex, value.toString());
    });
    
    // Simple formula evaluation (for security, this is basic)
    // In production, you'd want a proper formula parser
    return eval(evaluatedFormula);
  } catch (error) {
    console.error('Error evaluating formula:', error, 'Formula:', formula);
    return 0;
  }
};

export const calculateUpgradeWithSettings = (
  currentPrice: number,
  targetPrice: number,
  usedDays: number,
  totalDays: number
) => {
  const settings = getMathSettings();
  
  // Use default values if inputs are 0 or undefined
  const actualCurrentPrice = currentPrice || settings.variables.defaultCurrentPrice;
  const actualTargetPrice = targetPrice || settings.variables.defaultTargetPrice;
  const actualUsedDays = usedDays || settings.variables.defaultUsedDays;
  const actualTotalDays = totalDays || settings.variables.defaultTotalDays;
  
  let dailyCost: number;
  let usedMoney: number;
  let remainingAmount: number;
  let upgradeAmount: number;

  if (settings.customSteps.useCustomSteps) {
    // Use custom step-by-step calculations
    const variables = {
      currentPrice: actualCurrentPrice,
      targetPrice: actualTargetPrice,
      usedDays: actualUsedDays,
      totalDays: actualTotalDays,
      multiplierFactor: settings.variables.multiplierFactor,
      taxRate: settings.variables.taxRate,
      discountRate: settings.variables.discountRate,
      dailyCost: 0,
      usedMoney: 0,
      remainingAmount: 0
    };

    // Step 1: Calculate daily cost
    dailyCost = evaluateFormula(settings.customSteps.dailyCostFormula, variables);
    variables.dailyCost = dailyCost;

    // Step 2: Calculate used money
    usedMoney = evaluateFormula(settings.customSteps.usedMoneyFormula, variables);
    variables.usedMoney = usedMoney;

    // Step 3: Calculate remaining amount
    remainingAmount = evaluateFormula(settings.customSteps.remainingAmountFormula, variables);
    variables.remainingAmount = remainingAmount;

    // Step 4: Calculate upgrade amount
    upgradeAmount = evaluateFormula(settings.customSteps.upgradeAmountFormula, variables);
  } else if (settings.useCustomFormula && settings.customFormula.trim()) {
    // Use overall custom formula
    dailyCost = actualCurrentPrice / actualTotalDays;
    usedMoney = actualUsedDays * dailyCost;
    remainingAmount = actualCurrentPrice - usedMoney;
    
    try {
      const evalContext = {
        currentPrice: actualCurrentPrice,
        targetPrice: actualTargetPrice,
        usedDays: actualUsedDays,
        totalDays: actualTotalDays,
        usedMoney,
        remainingAmount,
        dailyCost,
        multiplierFactor: settings.variables.multiplierFactor,
        taxRate: settings.variables.taxRate,
        discountRate: settings.variables.discountRate
      };
      
      upgradeAmount = evaluateFormula(settings.customFormula, evalContext);
    } catch (error) {
      console.error('Error evaluating custom formula:', error);
      upgradeAmount = actualTargetPrice - remainingAmount;
    }
  } else {
    // Use default calculations
    dailyCost = actualCurrentPrice / actualTotalDays;
    usedMoney = actualUsedDays * dailyCost;
    remainingAmount = actualCurrentPrice - usedMoney;
    upgradeAmount = actualTargetPrice - remainingAmount;
  }
  
  // Apply modifier variables
  upgradeAmount = upgradeAmount * settings.variables.multiplierFactor;
  
  // Apply discount before tax if configured
  if (settings.taxCalculationOrder === 'before-discount' && settings.variables.discountRate > 0) {
    upgradeAmount = upgradeAmount * (1 - settings.variables.discountRate / 100);
  }
  
  // Apply tax
  if (settings.variables.taxRate > 0) {
    upgradeAmount = upgradeAmount * (1 + settings.variables.taxRate / 100);
  }
  
  // Apply discount after tax if configured
  if (settings.taxCalculationOrder === 'after-discount' && settings.variables.discountRate > 0) {
    upgradeAmount = upgradeAmount * (1 - settings.variables.discountRate / 100);
  }
  
  // Apply minimum upgrade amount
  if (upgradeAmount < settings.minimumUpgradeAmount) {
    upgradeAmount = settings.minimumUpgradeAmount;
  }
  
  // Handle negative upgrades
  if (!settings.allowNegativeUpgrades && upgradeAmount < 0) {
    upgradeAmount = 0;
  }
  
  // Apply rounding
  const roundedUpgradeAmount = applyRounding(upgradeAmount, settings.roundingMethod);
  
  return {
    fullAmount: actualCurrentPrice,
    newPackageFullAmount: actualTargetPrice,
    moneyPerDay: dailyCost,
    usedDays: actualUsedDays,
    usedMoney,
    remainingAmount,
    upgradeAmount: roundedUpgradeAmount,
    settings
  };
};
