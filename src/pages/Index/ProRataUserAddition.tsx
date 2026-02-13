import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, UserPlus, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { parseDate, formatDate } from "./dateUtils";
import { useToast } from "@/hooks/use-toast";
import { exportToPDF } from "@/utils/exportCalculation";

interface ProRataUserAdditionProps {
  darkMode: boolean;
}

const productOptions = [
  { value: "custom", label: "Custom", price: 0 },
  { value: "google", label: "Google Workspace", price: 599 },
  { value: "zoho", label: "Zoho", price: 2020 }
];

const ProRataUserAddition: React.FC<ProRataUserAdditionProps> = ({ darkMode }) => {
  const [selectedProduct, setSelectedProduct] = useState<string>("custom");
  const [userCount, setUserCount] = useState<string>("");
  const [pricePerUser, setPricePerUser] = useState<number>(0);
  const [subscriptionStartDate, setSubscriptionStartDate] = useState<Date>();
  const [subscriptionStartText, setSubscriptionStartText] = useState("");
  const [userAdditionDate, setUserAdditionDate] = useState<Date>();
  const [userAdditionText, setUserAdditionText] = useState("");
  const [elapsedDays, setElapsedDays] = useState<number>(0);
  const [elapsedMonths, setElapsedMonths] = useState<number>(0);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const handleProductChange = (value: string) => {
    setSelectedProduct(value);
    const product = productOptions.find(p => p.value === value);
    if (product && product.price > 0) {
      setPricePerUser(product.price);
    }
  };

  const handleStartDateChange = (value: string) => {
    setSubscriptionStartText(value);
    const parsed = parseDate(value);
    if (parsed) setSubscriptionStartDate(parsed);
  };

  const handleUserAdditionDateChange = (value: string) => {
    setUserAdditionText(value);
    const parsed = parseDate(value);
    if (parsed) setUserAdditionDate(parsed);
  };

  const setTodayAsStartDate = () => {
    const today = new Date();
    setSubscriptionStartDate(today);
    setSubscriptionStartText(formatDate(today));
  };

  const setTodayAsUserAdditionDate = () => {
    const today = new Date();
    setUserAdditionDate(today);
    setUserAdditionText(formatDate(today));
  };

  useEffect(() => {
    if (subscriptionStartDate && (!subscriptionStartText || parseDate(subscriptionStartText)?.getTime() !== subscriptionStartDate.getTime())) {
      setSubscriptionStartText(formatDate(subscriptionStartDate));
    }
  }, [subscriptionStartDate]);

  useEffect(() => {
    if (userAdditionDate && (!userAdditionText || parseDate(userAdditionText)?.getTime() !== userAdditionDate.getTime())) {
      setUserAdditionText(formatDate(userAdditionDate));
    }
  }, [userAdditionDate]);

  // Calculate remaining months using forward-looking logic
  // Renewal Date = Start Date + 1 Year
  // TotalMonths = ((RenewalYear - AdditionYear) * 12) + (RenewalMonth - AdditionMonth) + 1
  useEffect(() => {
    if (subscriptionStartDate && userAdditionDate) {
      const addition = new Date(userAdditionDate);
      
      // Derive renewal date as Start Date + 1 Year
      const renewalDate = new Date(subscriptionStartDate);
      renewalDate.setFullYear(renewalDate.getFullYear() + 1);
      
      if (renewalDate > addition) {
        const totalMonths = ((renewalDate.getFullYear() - addition.getFullYear()) * 12) + (renewalDate.getMonth() - addition.getMonth()) + 1;
        setElapsedMonths(totalMonths);
        
        const diffTime = renewalDate.getTime() - addition.getTime();
        setElapsedDays(Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      } else {
        setElapsedDays(0);
        setElapsedMonths(0);
      }
    } else {
      setElapsedDays(0);
      setElapsedMonths(0);
    }
  }, [subscriptionStartDate, userAdditionDate]);

  useEffect(() => {
    setResult(null);
  }, [userCount, pricePerUser, subscriptionStartDate, userAdditionDate, selectedProduct]);

  const calculateProRata = () => {
    const userCountNum = parseInt(userCount) || 0;
    if (!subscriptionStartDate || !userAdditionDate || userCountNum <= 0 || pricePerUser <= 0) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields correctly.",
        variant: "destructive"
      });
      return;
    }

    // Use inclusive calendar month count directly
    const totalMonths = elapsedMonths;
    
    // Total Pro Rata Cost = Price per User × Months × Number of Users
    const totalProRataCost = pricePerUser * totalMonths * userCountNum;
    
    // VAT calculation (13%)
    const vatAmount = totalProRataCost * 0.13;
    const totalWithVat = totalProRataCost + vatAmount;

    setResult({
      userCount: userCountNum,
      pricePerUser,
      elapsedDays,
      totalMonths,
      totalProRataCost,
      vatAmount,
      totalWithVat
    });

    toast({
      title: "Calculation completed",
      description: `Pro rata cost for ${userCount} user(s): NPR ${totalProRataCost.toFixed(2)}`
    });
  };

  const formatCurrency = (amount: number) => {
    return `NPR ${amount.toLocaleString('en-NP', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
          Product
        </Label>
        <Select value={selectedProduct} onValueChange={handleProductChange}>
          <SelectTrigger className={darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
            {productOptions.map((product) => (
              <SelectItem key={product.value} value={product.value} className={darkMode ? 'text-white hover:bg-gray-700' : ''}>
                {product.label} {product.price > 0 && `(NPR ${product.price}/user/month)`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
            Number of Users to Add
          </Label>
          <Input
            type="text"
            inputMode="numeric"
            value={userCount}
            onChange={(e) => setUserCount(e.target.value.replace(/[^0-9]/g, ''))}
            className={darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}
            placeholder="Enter number of users"
          />
        </div>

        <div className="space-y-2">
          <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
            Price per User (Full Cycle)
          </Label>
          <Input
            type="text"
            inputMode="decimal"
            value={pricePerUser}
            onChange={(e) => {
              setPricePerUser(parseFloat(e.target.value) || 0);
              setSelectedProduct("custom");
            }}
            className={darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}
            placeholder="NPR"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
            Subscription Start Date <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>(DD/MM/YYYY)</span>
          </Label>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="DD/MM/YYYY"
              value={subscriptionStartText}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className={`flex-1 ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
            />
            <Button
              variant="outline"
              onClick={setTodayAsStartDate}
              className={cn(
                "px-3",
                darkMode ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700' : ''
              )}
            >
              Today
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "px-3",
                    darkMode ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700' : ''
                  )}
                >
                  <Calendar className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className={`w-auto p-0 ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`} align="end">
                <CalendarComponent
                  mode="single"
                  selected={subscriptionStartDate}
                  onSelect={setSubscriptionStartDate}
                  initialFocus
                  className={cn("pointer-events-auto", darkMode ? 'bg-gray-800 text-white' : '')}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="space-y-2">
          <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
            User Addition Date <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>(DD/MM/YYYY)</span>
          </Label>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="DD/MM/YYYY"
              value={userAdditionText}
              onChange={(e) => handleUserAdditionDateChange(e.target.value)}
              className={`flex-1 ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
            />
            <Button
              variant="outline"
              onClick={setTodayAsUserAdditionDate}
              className={cn(
                "px-3",
                darkMode ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700' : ''
              )}
            >
              Today
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "px-3",
                    darkMode ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700' : ''
                  )}
                >
                  <Calendar className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className={`w-auto p-0 ${darkMode ? 'bg-gray-800 border-gray-700' : ''}`} align="end">
                <CalendarComponent
                  mode="single"
                  selected={userAdditionDate}
                  onSelect={setUserAdditionDate}
                  initialFocus
                  className={cn("pointer-events-auto", darkMode ? 'bg-gray-800 text-white' : '')}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Elapsed Time Display */}
      {subscriptionStartDate && userAdditionDate && elapsedDays > 0 && (
        <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700 border border-gray-600' : 'bg-blue-50 border border-blue-200'}`}>
          <div className="flex justify-between items-center">
            <span className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
              Renewal Date (Start + 1 Year):
            </span>
            <span className={`font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
              {formatDate(new Date(new Date(subscriptionStartDate).setFullYear(subscriptionStartDate.getFullYear() + 1)))}
            </span>
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
              Days Remaining until Renewal:
            </span>
            <span className={`font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
              {elapsedDays} days
            </span>
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
              Months Remaining (Inclusive):
            </span>
            <span className={`font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
              {elapsedMonths} month{elapsedMonths !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      <Button
        onClick={calculateProRata}
        className="w-full bg-green-600 hover:bg-green-700 text-white py-3 text-lg font-semibold"
        size="lg"
      >
        <UserPlus className="w-5 h-5 mr-2" />
        Calculate Pro Rata Cost
      </Button>

      {result && result.totalMonths !== undefined && (
        <Card className={`mt-6 ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-green-50 border-green-200'}`}>
          <CardHeader>
            <CardTitle className={`text-lg ${darkMode ? 'text-white' : 'text-green-800'}`}>
              Pro Rata User Addition Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
                Days Remaining until Renewal:
              </span>
              <span className={`font-semibold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                {result.elapsedDays} days
              </span>
            </div>
            <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
                Months Remaining (Inclusive):
              </span>
              <span className={`font-semibold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                {result.totalMonths} month{result.totalMonths !== 1 ? 's' : ''}
              </span>
            </div>
            <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
                Price per User:
              </span>
              <span className={`font-semibold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                {formatCurrency(result.pricePerUser)}
              </span>
            </div>
            <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
                Number of Users:
              </span>
              <span className={`font-semibold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                {result.userCount}
              </span>
            </div>
            <div className={`p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
              <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Calculation: {formatCurrency(result.pricePerUser)} × {result.totalMonths} months × {result.userCount} user{result.userCount !== 1 ? 's' : ''}
              </span>
            </div>
            <div className={`flex justify-between items-center p-4 rounded font-bold text-lg ${darkMode ? 'bg-gray-600 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
              <span>Subtotal (Before VAT):</span>
              <span>{formatCurrency(result.totalProRataCost)}</span>
            </div>
            <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
                VAT (13%):
              </span>
              <span className={`font-semibold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                {formatCurrency(result.vatAmount)}
              </span>
            </div>
            <div className={`flex justify-between items-center p-4 rounded font-bold text-lg ${darkMode ? 'bg-emerald-900 text-emerald-300' : 'bg-emerald-200 text-emerald-800'}`}>
              <span>Total with VAT:</span>
              <span>{formatCurrency(result.totalWithVat)}</span>
            </div>
            <Button
              onClick={() => exportToPDF({
                type: 'prorata',
                userCount: result.userCount,
                pricePerUser: result.pricePerUser,
                elapsedDays: result.elapsedDays,
                totalMonths: result.totalMonths,
                totalProRataCost: result.totalProRataCost,
                vatAmount: result.vatAmount,
                totalWithVat: result.totalWithVat,
                subscriptionStartDate: subscriptionStartText,
                userAdditionDate: userAdditionText,
                product: selectedProduct !== 'custom' ? productOptions.find(p => p.value === selectedProduct)?.label : undefined
              })}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download className="w-4 h-4 mr-2" />
              Export as PDF
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ProRataUserAddition;
