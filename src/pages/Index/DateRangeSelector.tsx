import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
interface DateRangeSelectorProps {
  darkMode: boolean;
  startDateText: string;
  endDateText: string;
  handleStartDateChange: (v: string) => void;
  handleEndDateChange: (v: string) => void;
  startDate?: Date;
  endDate?: Date;
  setStartDate: (date?: Date) => void;
  setEndDate: (date?: Date) => void;
  calculateDaysFromDates: () => {
    daysRemaining: number;
    totalDays: number;
  };
}
const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({
  darkMode,
  startDateText,
  endDateText,
  handleStartDateChange,
  handleEndDateChange,
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  calculateDaysFromDates
}) => {
  const setEndDateToToday = () => {
    const today = new Date();
    setEndDate(today);
  };
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label className={darkMode ? "text-gray-200" : "text-gray-700"}>Billing Start Date (DD/MM/YYYY)</Label>
        <div className="flex gap-2">
          <Input type="text" placeholder="DD/MM/YYYY" value={startDateText} onChange={e => handleStartDateChange(e.target.value)} className={cn("flex-1", darkMode ? "bg-gray-700 border-gray-600 text-white" : "")} />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className={cn("shrink-0", darkMode ? "bg-gray-700 border-gray-600 text-white hover:bg-gray-600" : "")}>
                <CalendarIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent mode="single" selected={startDate} onSelect={setStartDate} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="space-y-2">
        <Label className={darkMode ? "text-gray-200" : "text-gray-700"}>Upgrade Date (DD/MM/YYYY)</Label>
        <div className="flex gap-2">
          <Input type="text" placeholder="DD/MM/YYYY" value={endDateText} onChange={e => handleEndDateChange(e.target.value)} className={cn("flex-1", darkMode ? "bg-gray-700 border-gray-600 text-white" : "")} />
          <Button variant="outline" size="sm" onClick={setEndDateToToday} className={cn("shrink-0 px-3", darkMode ? "bg-gray-700 border-gray-600 text-white hover:bg-gray-600" : "")}>
            Today
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className={cn("shrink-0", darkMode ? "bg-gray-700 border-gray-600 text-white hover:bg-gray-600" : "")}>
                <CalendarIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent mode="single" selected={endDate} onSelect={setEndDate} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {startDate && endDate && <div className={`p-3 rounded-lg col-span-1 md:col-span-2 ${darkMode ? 'bg-gray-700' : 'bg-blue-50'}`}>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>Total Days:</span>
              <span className={`font-semibold ml-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                {calculateDaysFromDates().totalDays}
              </span>
            </div>
            <div>
              <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
                Days Remaining:
              </span>
              <span className={`font-semibold ml-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                {calculateDaysFromDates().daysRemaining}
              </span>
            </div>
          </div>
        </div>}
    </div>;
};
export default DateRangeSelector;