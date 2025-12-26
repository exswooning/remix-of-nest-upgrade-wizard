import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { parseDate, formatDate } from "./dateUtils";
import { useToast } from "@/hooks/use-toast";

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
  const [userCount, setUserCount] = useState<number>(1);
  const [pricePerUser, setPricePerUser] = useState<number>(0);
  const [billingCycle, setBillingCycle] = useState<string>("12");
  const [subscriptionStartDate, setSubscriptionStartDate] = useState<Date>();
  const [subscriptionStartText, setSubscriptionStartText] = useState("");
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const handleProductChange = (value: string) => {
    setSelectedProduct(value);
    const product = productOptions.find(p => p.value === value);
    if (product && product.price > 0) {
      setPricePerUser(product.price);
    }
  };

  const cycleLabels: Record<string, string> = {
    "1": "Monthly",
    "12": "Annual",
    "36": "3 Years"
  };

  const cycleDays: Record<string, number> = {
    "1": 30,
    "12": 365,
    "36": 1095
  };

  const handleStartDateChange = (value: string) => {
    setSubscriptionStartText(value);
    const parsed = parseDate(value);
    if (parsed) setSubscriptionStartDate(parsed);
  };

  useEffect(() => {
    if (subscriptionStartDate && (!subscriptionStartText || parseDate(subscriptionStartText)?.getTime() !== subscriptionStartDate.getTime())) {
      setSubscriptionStartText(formatDate(subscriptionStartDate));
    }
  }, [subscriptionStartDate]);

  useEffect(() => {
    setResult(null);
  }, [userCount, pricePerUser, billingCycle, subscriptionStartDate, selectedProduct]);

  const calculateProRata = () => {
    if (!subscriptionStartDate || userCount <= 0 || pricePerUser <= 0) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields correctly.",
        variant: "destructive"
      });
      return;
    }

    const today = new Date();
    const start = new Date(subscriptionStartDate);
    const totalDays = cycleDays[billingCycle];

    // Calculate days used since subscription start
    let usedDays = 0;
    if (today > start) {
      usedDays = Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      usedDays = Math.min(usedDays, totalDays);
    }

    const daysRemaining = totalDays - usedDays;
    const totalCostPerUser = pricePerUser;
    const dailyRate = totalCostPerUser / totalDays;
    const proRataCostPerUser = dailyRate * daysRemaining;
    const totalProRataCost = proRataCostPerUser * userCount;

    setResult({
      userCount,
      pricePerUser: totalCostPerUser,
      dailyRate,
      daysRemaining,
      totalDays,
      usedDays,
      proRataCostPerUser,
      totalProRataCost
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
            type="number"
            min={1}
            value={userCount}
            onChange={(e) => setUserCount(parseInt(e.target.value) || 1)}
            className={darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}
          />
        </div>

        <div className="space-y-2">
          <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
            Price per User (Full Cycle)
          </Label>
          <Input
            type="number"
            min={0}
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
            Billing Cycle
          </Label>
          <Select value={billingCycle} onValueChange={setBillingCycle}>
            <SelectTrigger className={darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
              {Object.entries(cycleLabels).map(([value, label]) => (
                <SelectItem key={value} value={value} className={darkMode ? 'text-white hover:bg-gray-700' : ''}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
            Subscription Start Date
          </Label>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="YYYY-MM-DD"
              value={subscriptionStartText}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className={`flex-1 ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
            />
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
                  className={darkMode ? 'bg-gray-800 text-white' : ''}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      <Button
        onClick={calculateProRata}
        className="w-full bg-green-600 hover:bg-green-700 text-white py-3 text-lg font-semibold"
        size="lg"
      >
        <UserPlus className="w-5 h-5 mr-2" />
        Calculate Pro Rata Cost
      </Button>

      {result && (
        <Card className={`mt-6 ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-green-50 border-green-200'}`}>
          <CardHeader>
            <CardTitle className={`text-lg ${darkMode ? 'text-white' : 'text-green-800'}`}>
              Pro Rata User Addition Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
                Days Remaining ({result.daysRemaining} of {result.totalDays} days):
              </span>
              <span className={`font-semibold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                {((result.daysRemaining / result.totalDays) * 100).toFixed(1)}%
              </span>
            </div>
            <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
                Daily Rate per User:
              </span>
              <span className={`font-semibold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                {formatCurrency(result.dailyRate)}
              </span>
            </div>
            <div className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-600'}>
                Pro Rata Cost per User:
              </span>
              <span className={`font-semibold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                {formatCurrency(result.proRataCostPerUser)}
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
            <div className={`flex justify-between items-center p-4 rounded font-bold text-lg ${darkMode ? 'bg-gray-600 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
              <span>Total Pro Rata Cost:</span>
              <span>{formatCurrency(result.totalProRataCost)}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ProRataUserAddition;
