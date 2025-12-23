
import React from "react";
import { Button } from "@/components/ui/button";
import { Calculator, Moon, Sun } from "lucide-react";

interface CalculatorHeaderProps {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const CalculatorHeader: React.FC<CalculatorHeaderProps> = ({ darkMode, toggleDarkMode }) => (
  <div className="relative mb-8">
    <div className="absolute top-0 right-0">
      <Button
        variant="outline"
        size="sm"
        onClick={toggleDarkMode}
        className={`${darkMode ? 'bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:text-white hover:border-gray-700' : ''}`}
      >
        {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        {darkMode ? ' Light Mode' : ' Dark Mode'}
      </Button>
    </div>
    <div className="text-center">
      <div className="flex justify-center items-center gap-2">
        <Calculator className={`w-6 h-6 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
        <h1 className={`text-2xl font-light tracking-wider ${darkMode ? 'text-white' : 'text-gray-800'}`}>UCAP</h1>
      </div>
    </div>
  </div>
);

export default CalculatorHeader;
