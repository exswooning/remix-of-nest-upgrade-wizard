
import React, { useState, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, X, Divide, Calculator, Trash2, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FormulaBlock {
  id: string;
  type: 'variable' | 'operator' | 'number' | 'function';
  value: string;
  displayName?: string;
}

interface FormulaBuilderProps {
  initialFormula?: string;
  onFormulaChange: (formula: string) => void;
  darkMode: boolean;
}

const FormulaBuilder: React.FC<FormulaBuilderProps> = ({ 
  initialFormula = '', 
  onFormulaChange, 
  darkMode 
}) => {
  const [blocks, setBlocks] = useState<FormulaBlock[]>([]);
  const [customNumber, setCustomNumber] = useState('');
  const { toast } = useToast();

  // Available variables in the calculation
  const variables = [
    { value: 'currentPrice', name: 'Current Price' },
    { value: 'targetPrice', name: 'Target Price' },
    { value: 'usedDays', name: 'Used Days' },
    { value: 'totalDays', name: 'Total Days' },
    { value: 'usedMoney', name: 'Used Money' },
    { value: 'remainingAmount', name: 'Remaining Amount' },
  ];

  const operators = [
    { value: '+', name: 'Add', icon: Plus },
    { value: '-', name: 'Subtract', icon: Minus },
    { value: '*', name: 'Multiply', icon: X },
    { value: '/', name: 'Divide', icon: Divide },
  ];

  const mathFunctions = [
    { value: 'Math.max', name: 'Maximum' },
    { value: 'Math.min', name: 'Minimum' },
    { value: 'Math.abs', name: 'Absolute Value' },
    { value: 'Math.round', name: 'Round' },
    { value: 'Math.ceil', name: 'Round Up' },
    { value: 'Math.floor', name: 'Round Down' },
  ];

  const addBlock = (type: FormulaBlock['type'], value: string, displayName?: string) => {
    const newBlock: FormulaBlock = {
      id: `${type}-${Date.now()}-${Math.random()}`,
      type,
      value,
      displayName: displayName || value,
    };
    
    setBlocks(prev => [...prev, newBlock]);
    updateFormula([...blocks, newBlock]);
  };

  const removeBlock = (id: string) => {
    const newBlocks = blocks.filter(block => block.id !== id);
    setBlocks(newBlocks);
    updateFormula(newBlocks);
  };

  const updateFormula = (currentBlocks: FormulaBlock[]) => {
    const formula = currentBlocks.map(block => {
      if (block.type === 'function') {
        return `${block.value}(`;
      }
      return block.value;
    }).join(' ');
    
    onFormulaChange(formula);
  };

  const addCustomNumber = () => {
    if (customNumber && !isNaN(Number(customNumber))) {
      addBlock('number', customNumber);
      setCustomNumber('');
    }
  };

  const clearFormula = () => {
    setBlocks([]);
    onFormulaChange('');
    toast({
      title: "Formula cleared",
      description: "All blocks have been removed."
    });
  };

  const loadPresetFormula = (preset: string) => {
    let newBlocks: FormulaBlock[] = [];
    
    switch (preset) {
      case 'default':
        newBlocks = [
          { id: '1', type: 'variable', value: 'targetPrice', displayName: 'Target Price' },
          { id: '2', type: 'operator', value: '-', displayName: '-' },
          { id: '3', type: 'variable', value: 'remainingAmount', displayName: 'Remaining Amount' },
        ];
        break;
      case 'withBonus':
        newBlocks = [
          { id: '1', type: 'variable', value: 'targetPrice', displayName: 'Target Price' },
          { id: '2', type: 'operator', value: '-', displayName: '-' },
          { id: '3', type: 'variable', value: 'remainingAmount', displayName: 'Remaining Amount' },
          { id: '4', type: 'operator', value: '+', displayName: '+' },
          { id: '5', type: 'number', value: '100', displayName: '100' },
        ];
        break;
      case 'percentage':
        newBlocks = [
          { id: '1', type: 'variable', value: 'targetPrice', displayName: 'Target Price' },
          { id: '2', type: 'operator', value: '*', displayName: '*' },
          { id: '3', type: 'number', value: '0.8', displayName: '0.8' },
        ];
        break;
    }
    
    setBlocks(newBlocks);
    updateFormula(newBlocks);
  };

  const getBlockColor = (type: FormulaBlock['type']) => {
    switch (type) {
      case 'variable': return darkMode ? 'bg-blue-800 border-blue-600' : 'bg-blue-100 border-blue-300';
      case 'operator': return darkMode ? 'bg-green-800 border-green-600' : 'bg-green-100 border-green-300';
      case 'number': return darkMode ? 'bg-purple-800 border-purple-600' : 'bg-purple-100 border-purple-300';
      case 'function': return darkMode ? 'bg-orange-800 border-orange-600' : 'bg-orange-100 border-orange-300';
      default: return darkMode ? 'bg-gray-800 border-gray-600' : 'bg-gray-100 border-gray-300';
    }
  };

  return (
    <Card className={darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white'}>
      <CardHeader>
        <CardTitle className={darkMode ? 'text-white' : 'text-gray-800'}>
          Visual Formula Builder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Formula Display */}
        <div className="space-y-2">
          <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
            Current Formula
          </Label>
          <div className={`p-3 rounded border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
            <code className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {blocks.length > 0 ? blocks.map(b => b.value).join(' ') : 'No formula built yet'}
            </code>
          </div>
        </div>

        {/* Formula Blocks Display */}
        <div className="space-y-2">
          <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
            Formula Blocks
          </Label>
          <div className={`min-h-20 p-4 rounded border-2 border-dashed ${darkMode ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-gray-50'}`}>
            <div className="flex flex-wrap gap-2">
              {blocks.map((block) => (
                <div
                  key={block.id}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded border ${getBlockColor(block.type)} cursor-move`}
                >
                  <span className="text-sm font-medium">{block.displayName}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeBlock(block.id)}
                    className="h-4 w-4 p-0 hover:bg-red-500 hover:text-white"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              {blocks.length === 0 && (
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Drag blocks here to build your formula
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Block Palette */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Variables */}
          <div className="space-y-2">
            <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Variables</Label>
            <div className="space-y-1">
              {variables.map((variable) => (
                <Button
                  key={variable.value}
                  variant="outline"
                  size="sm"
                  onClick={() => addBlock('variable', variable.value, variable.name)}
                  className={`w-full justify-start ${darkMode ? 'border-blue-600 hover:bg-blue-800' : 'border-blue-300 hover:bg-blue-100'}`}
                >
                  {variable.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Operators */}
          <div className="space-y-2">
            <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Operators</Label>
            <div className="space-y-1">
              {operators.map((operator) => (
                <Button
                  key={operator.value}
                  variant="outline"
                  size="sm"
                  onClick={() => addBlock('operator', operator.value, operator.name)}
                  className={`w-full justify-start ${darkMode ? 'border-green-600 hover:bg-green-800' : 'border-green-300 hover:bg-green-100'}`}
                >
                  <operator.icon className="w-4 h-4 mr-2" />
                  {operator.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Math Functions */}
          <div className="space-y-2">
            <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Math Functions</Label>
            <div className="space-y-1">
              {mathFunctions.map((func) => (
                <Button
                  key={func.value}
                  variant="outline"
                  size="sm"
                  onClick={() => addBlock('function', func.value, func.name)}
                  className={`w-full justify-start ${darkMode ? 'border-orange-600 hover:bg-orange-800' : 'border-orange-300 hover:bg-orange-100'}`}
                >
                  {func.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Numbers */}
          <div className="space-y-2">
            <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Numbers</Label>
            <div className="space-y-1">
              {/* Custom Number Input */}
              <div className="flex gap-1">
                <Input
                  type="number"
                  placeholder="Number"
                  value={customNumber}
                  onChange={(e) => setCustomNumber(e.target.value)}
                  className={`flex-1 ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`}
                />
                <Button
                  size="sm"
                  onClick={addCustomNumber}
                  className={darkMode ? 'border-purple-600 hover:bg-purple-800' : 'border-purple-300 hover:bg-purple-100'}
                  variant="outline"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Preset Formulas */}
        <div className="space-y-2">
          <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Quick Presets</Label>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadPresetFormula('default')}
            >
              Default Formula
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadPresetFormula('withBonus')}
            >
              With Bonus (+100)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadPresetFormula('percentage')}
            >
              80% of Target
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={clearFormula}
            className={darkMode ? 'border-gray-700 hover:bg-gray-800' : ''}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear All
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default FormulaBuilder;
