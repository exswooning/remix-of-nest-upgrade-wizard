import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Calendar, Plus, Trash2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { parseDate, formatDate } from "./dateUtils";

interface LedgerEvent {
  id: string;
  date: Date | undefined;
  dateText: string;
  description: string;
  type: "service-change" | "one-time-fee" | "discount";
  monthlyEffect: string;
  oneTimeAdjustment: string;
}

interface BillingLedgerProps {
  darkMode: boolean;
}

const eventTypeLabels: Record<string, string> = {
  "service-change": "Service Change",
  "one-time-fee": "One-Time Fee",
  "discount": "Discount",
};

const BillingLedger: React.FC<BillingLedgerProps> = ({ darkMode }) => {
  const [renewalDate, setRenewalDate] = useState<Date | undefined>();
  const [renewalDateText, setRenewalDateText] = useState("");
  const [events, setEvents] = useState<LedgerEvent[]>([]);

  const handleRenewalDateChange = (text: string) => {
    setRenewalDateText(text);
    const parsed = parseDate(text);
    if (parsed) setRenewalDate(parsed);
  };

  const addEvent = () => {
    setEvents(prev => [...prev, {
      id: crypto.randomUUID(),
      date: undefined,
      dateText: "",
      description: "",
      type: "service-change",
      monthlyEffect: "",
      oneTimeAdjustment: "",
    }]);
  };

  const removeEvent = (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  const updateEvent = (id: string, field: keyof LedgerEvent, value: any) => {
    setEvents(prev => prev.map(e => {
      if (e.id !== id) return e;
      const updated = { ...e, [field]: value };
      if (field === "dateText") {
        const parsed = parseDate(value as string);
        if (parsed) updated.date = parsed;
        else updated.date = undefined;
      }
      return updated;
    }));
  };

  const calcMonthsRemaining = (eventDate: Date | undefined): number | null => {
    if (!eventDate || !renewalDate) return null;
    if (eventDate >= renewalDate) return 0;
    return ((renewalDate.getFullYear() - eventDate.getFullYear()) * 12)
      + (renewalDate.getMonth() - eventDate.getMonth()) + 1;
  };

  const calcLineTotal = (event: LedgerEvent): number | null => {
    const months = calcMonthsRemaining(event.date);
    if (months === null) return null;
    const monthly = parseFloat(event.monthlyEffect) || 0;
    const oneTime = parseFloat(event.oneTimeAdjustment) || 0;
    return (monthly * months) + oneTime;
  };

  const grandTotal = useMemo(() => {
    return events.reduce((sum, e) => {
      const lt = calcLineTotal(e);
      return sum + (lt ?? 0);
    }, 0);
  }, [events, renewalDate]);

  const formatCurrency = (val: number) => {
    const prefix = val < 0 ? "-" : "";
    return `${prefix}NPR ${Math.abs(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6">
      {/* Renewal Date Setting */}
      <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className={`text-lg ${darkMode ? "text-white" : ""}`}>
            <FileText className="w-5 h-5 inline mr-2" />
            Billing Ledger
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 space-y-2">
              <Label className={darkMode ? "text-gray-200" : ""}>
                Contract Renewal Date (DD/MM/YYYY)
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="DD/MM/YYYY"
                  value={renewalDateText}
                  onChange={e => handleRenewalDateChange(e.target.value)}
                  className={darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className={darkMode ? "border-gray-600" : ""}>
                      <Calendar className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={renewalDate}
                      onSelect={d => { if (d) { setRenewalDate(d); setRenewalDateText(formatDate(d)); } }}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              {renewalDate && (
                <p className={`text-sm ${darkMode ? "text-green-400" : "text-green-600"}`}>
                  Renewal: {formatDate(renewalDate)}
                </p>
              )}
            </div>
            <Button onClick={addEvent} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-1" /> Add Event
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Ledger Table */}
      {events.length > 0 && (
        <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
          <CardContent className="p-0 sm:p-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className={darkMode ? "border-gray-700" : ""}>
                    <TableHead className={`min-w-[130px] ${darkMode ? "text-gray-300" : ""}`}>Date</TableHead>
                    <TableHead className={`min-w-[150px] ${darkMode ? "text-gray-300" : ""}`}>Description</TableHead>
                    <TableHead className={`min-w-[140px] ${darkMode ? "text-gray-300" : ""}`}>Type</TableHead>
                    <TableHead className={`min-w-[110px] ${darkMode ? "text-gray-300" : ""}`}>Monthly Effect</TableHead>
                    <TableHead className={`min-w-[100px] ${darkMode ? "text-gray-300" : ""}`}>One-Time Adj.</TableHead>
                    <TableHead className={`min-w-[80px] text-center ${darkMode ? "text-gray-300" : ""}`}>Months Left</TableHead>
                    <TableHead className={`min-w-[120px] text-right ${darkMode ? "text-gray-300" : ""}`}>Line Total</TableHead>
                    <TableHead className={`w-[50px] ${darkMode ? "text-gray-300" : ""}`}></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map(event => {
                    const monthsLeft = calcMonthsRemaining(event.date);
                    const lineTotal = calcLineTotal(event);
                    return (
                      <TableRow key={event.id} className={darkMode ? "border-gray-700 hover:bg-gray-700/50" : ""}>
                        <TableCell className="p-2">
                          <div className="flex gap-1">
                            <Input
                              placeholder="DD/MM/YYYY"
                              value={event.dateText}
                              onChange={e => updateEvent(event.id, "dateText", e.target.value)}
                              className={`h-8 text-xs ${darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}`}
                            />
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" size="icon" className={`h-8 w-8 shrink-0 ${darkMode ? "border-gray-600" : ""}`}>
                                  <Calendar className="h-3 w-3" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <CalendarComponent
                                  mode="single"
                                  selected={event.date}
                                  onSelect={d => { if (d) { updateEvent(event.id, "dateText", formatDate(d)); updateEvent(event.id, "date", d); } }}
                                  className={cn("p-3 pointer-events-auto")}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </TableCell>
                        <TableCell className="p-2">
                          <Input
                            placeholder="e.g. Upgrade to Gold"
                            value={event.description}
                            onChange={e => updateEvent(event.id, "description", e.target.value)}
                            className={`h-8 text-xs ${darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}`}
                          />
                        </TableCell>
                        <TableCell className="p-2">
                          <Select value={event.type} onValueChange={v => updateEvent(event.id, "type", v)}>
                            <SelectTrigger className={`h-8 text-xs ${darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="service-change">Service Change</SelectItem>
                              <SelectItem value="one-time-fee">One-Time Fee</SelectItem>
                              <SelectItem value="discount">Discount</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="p-2">
                          <Input
                            type="number"
                            placeholder="0"
                            value={event.monthlyEffect}
                            onChange={e => updateEvent(event.id, "monthlyEffect", e.target.value)}
                            className={`h-8 text-xs ${darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}`}
                          />
                        </TableCell>
                        <TableCell className="p-2">
                          <Input
                            type="number"
                            placeholder="0"
                            value={event.oneTimeAdjustment}
                            onChange={e => updateEvent(event.id, "oneTimeAdjustment", e.target.value)}
                            className={`h-8 text-xs ${darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}`}
                          />
                        </TableCell>
                        <TableCell className={`p-2 text-center font-mono font-semibold ${darkMode ? "text-blue-400" : "text-blue-600"}`}>
                          {monthsLeft !== null ? monthsLeft : "—"}
                        </TableCell>
                        <TableCell className={`p-2 text-right font-mono font-semibold ${
                          lineTotal !== null
                            ? lineTotal < 0
                              ? (darkMode ? "text-red-400" : "text-red-600")
                              : (darkMode ? "text-green-400" : "text-green-600")
                            : (darkMode ? "text-gray-500" : "text-gray-400")
                        }`}>
                          {lineTotal !== null ? formatCurrency(lineTotal) : "—"}
                        </TableCell>
                        <TableCell className="p-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeEvent(event.id)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter className={darkMode ? "bg-gray-700 border-gray-600" : ""}>
                  <TableRow className={darkMode ? "border-gray-600" : ""}>
                    <TableCell colSpan={6} className={`text-right font-bold text-base ${darkMode ? "text-white" : ""}`}>
                      Grand Total:
                    </TableCell>
                    <TableCell className={`text-right font-bold text-base font-mono ${
                      grandTotal < 0
                        ? (darkMode ? "text-red-400" : "text-red-600")
                        : (darkMode ? "text-green-400" : "text-green-600")
                    }`}>
                      {formatCurrency(grandTotal)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {events.length === 0 && (
        <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
          <CardContent className="py-12 text-center">
            <FileText className={`w-12 h-12 mx-auto mb-3 ${darkMode ? "text-gray-600" : "text-gray-300"}`} />
            <p className={`text-lg font-medium ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
              No events yet
            </p>
            <p className={`text-sm ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
              Set a renewal date and click "Add Event" to start building your billing ledger.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BillingLedger;
