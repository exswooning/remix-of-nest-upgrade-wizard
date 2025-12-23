import React, { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Settings, DollarSign, Plus, Trash, Edit, Check, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface PriceManagementProps {
  darkMode: boolean;
}

const PriceManagement: React.FC<PriceManagementProps> = ({ darkMode }) => {
  const { getPlanData, updatePlanPrice, addPlan, deletePlan, addCategory, deleteCategory } = useAuth();
  const { toast } = useToast();
  
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [selectedCycle, setSelectedCycle] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanPrices, setNewPlanPrices] = useState<{ [key: number]: string }>({});
  const [isAddingPlan, setIsAddingPlan] = useState(false);
  
  // New category states
  const [newCategoryKey, setNewCategoryKey] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedCycles, setSelectedCycles] = useState<number[]>([]);
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  // Editing price states
  const [editingPrice, setEditingPrice] = useState<{
    categoryKey: string;
    planName: string;
    cycle?: number;
  } | null>(null);
  const [editPrice, setEditPrice] = useState("");

  const planData = getPlanData();

  const availableCycles = [1, 6, 12, 36];

  const handleUpdatePrice = () => {
    if (!selectedCategory || !selectedPlan || !selectedCycle || !newPrice) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields to update price.",
        variant: "destructive"
      });
      return;
    }

    const success = updatePlanPrice(selectedCategory, selectedPlan, parseInt(selectedCycle), parseFloat(newPrice));
    
    if (success) {
      toast({
        title: "Price Updated",
        description: `Successfully updated ${selectedPlan} price for ${selectedCycle} month(s).`,
      });
      setNewPrice("");
    } else {
      toast({
        title: "Update Failed",
        description: "Failed to update price. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleAddPlan = () => {
    if (!selectedCategory || !newPlanName) {
      toast({
        title: "Missing Information",
        description: "Please select a category and enter a plan name.",
        variant: "destructive"
      });
      return;
    }

    const categoryData = planData[selectedCategory];
    const pricing: { [key: number]: number } = {};
    
    // Use custom prices if provided, otherwise use defaults
    categoryData.cycles.forEach(cycle => {
      const customPrice = newPlanPrices[cycle];
      if (customPrice && !isNaN(parseFloat(customPrice))) {
        pricing[cycle] = parseFloat(customPrice);
      } else {
        pricing[cycle] = 100; // Default price
      }
    });

    const success = addPlan(selectedCategory, newPlanName, pricing);
    
    if (success) {
      toast({
        title: "Plan Added",
        description: `Successfully added ${newPlanName} to ${categoryData.name}.`,
      });
      setNewPlanName("");
      setNewPlanPrices({});
      setIsAddingPlan(false);
    } else {
      toast({
        title: "Add Failed",
        description: "Plan already exists or failed to add. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleDeletePlan = (category: string, planName: string) => {
    const success = deletePlan(category, planName);
    
    if (success) {
      toast({
        title: "Plan Deleted",
        description: `Successfully deleted ${planName}.`,
      });
    } else {
      toast({
        title: "Delete Failed",
        description: "Failed to delete plan. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleDeleteCategory = (categoryKey: string, categoryName: string) => {
    const success = deleteCategory(categoryKey);
    
    if (success) {
      toast({
        title: "Category Deleted",
        description: `Successfully deleted ${categoryName} category.`,
      });
      // Reset selection if deleted category was selected
      if (selectedCategory === categoryKey) {
        setSelectedCategory("");
        setSelectedPlan("");
        setSelectedCycle("");
      }
    } else {
      toast({
        title: "Delete Failed",
        description: "Failed to delete category. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleAddCategory = () => {
    if (!newCategoryKey || !newCategoryName || selectedCycles.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please fill in category key, name, and select at least one billing cycle.",
        variant: "destructive"
      });
      return;
    }

    // Check if category key already exists
    if (planData[newCategoryKey]) {
      toast({
        title: "Category Exists",
        description: "A category with this key already exists.",
        variant: "destructive"
      });
      return;
    }

    const success = addCategory(newCategoryKey, newCategoryName, selectedCycles);
    
    if (success) {
      toast({
        title: "Category Added",
        description: `Successfully added ${newCategoryName} category.`,
      });
      setNewCategoryKey("");
      setNewCategoryName("");
      setSelectedCycles([]);
      setIsAddingCategory(false);
    } else {
      toast({
        title: "Add Failed",
        description: "Failed to add category. Please try again.",
        variant: "destructive"
      });
    }
  };

  const startEditingPrice = (categoryKey: string, planName: string, cycle?: number) => {
    setEditingPrice({ categoryKey, planName, cycle });
    
    const plan = planData[categoryKey].options.find(p => p.name === planName);
    if (plan) {
      let currentPrice;
      if (cycle !== undefined && plan.pricing) {
        currentPrice = plan.pricing[cycle];
      } else {
        currentPrice = plan.price;
      }
      setEditPrice(currentPrice?.toString() || "");
    }
  };

  const saveEditedPrice = () => {
    if (!editingPrice || !editPrice) return;

    const newPriceValue = parseFloat(editPrice);
    if (isNaN(newPriceValue) || newPriceValue <= 0) {
      toast({
        title: "Invalid Price",
        description: "Please enter a valid price.",
        variant: "destructive"
      });
      return;
    }

    const cycle = editingPrice.cycle || 36; // Default to 36 for WordPress plans
    const success = updatePlanPrice(editingPrice.categoryKey, editingPrice.planName, cycle, newPriceValue);
    
    if (success) {
      toast({
        title: "Price Updated",
        description: `Successfully updated ${editingPrice.planName} price.`,
      });
      setEditingPrice(null);
      setEditPrice("");
    } else {
      toast({
        title: "Update Failed",
        description: "Failed to update price. Please try again.",
        variant: "destructive"
      });
    }
  };

  const cancelEditingPrice = () => {
    setEditingPrice(null);
    setEditPrice("");
  };

  const formatCurrency = (amount: number) => {
    return `NPR ${amount.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getCurrentPrice = () => {
    if (!selectedCategory || !selectedPlan || !selectedCycle) return "";
    
    const plan = planData[selectedCategory].options.find(p => p.name === selectedPlan);
    if (!plan) return "";
    
    if (plan.pricing) {
      return plan.pricing[parseInt(selectedCycle)] || "";
    }
    return plan.price || "";
  };

  const handleNewPlanPriceChange = (cycle: number, price: string) => {
    setNewPlanPrices(prev => ({
      ...prev,
      [cycle]: price
    }));
  };

  const toggleCycle = (cycle: number) => {
    setSelectedCycles(prev => 
      prev.includes(cycle) 
        ? prev.filter(c => c !== cycle)
        : [...prev, cycle]
    );
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className={darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : ''}
        >
          <Settings className="w-4 h-4 mr-2" />
          Manage Prices
        </Button>
      </SheetTrigger>
      <SheetContent className={`w-[600px] sm:max-w-[600px] ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
        <SheetHeader>
          <SheetTitle className={darkMode ? 'text-white' : 'text-gray-800'}>
            Price Management
          </SheetTitle>
          <SheetDescription className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
            Update pricing for existing plans and add new plans
          </SheetDescription>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(100vh-120px)] pr-4">
          <div className="mt-6 space-y-6">
            {/* Update Existing Prices */}
            <Card className={darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50'}>
              <CardHeader>
                <CardTitle className={`text-lg ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  Update Existing Prices
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Category</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className={darkMode ? 'bg-gray-600 border-gray-500' : ''}>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(planData).map(([key, value]) => (
                          <SelectItem key={key} value={key}>
                            {value.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Plan</Label>
                    <Select value={selectedPlan} onValueChange={setSelectedPlan} disabled={!selectedCategory}>
                      <SelectTrigger className={darkMode ? 'bg-gray-600 border-gray-500' : ''}>
                        <SelectValue placeholder="Select plan" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedCategory && planData[selectedCategory].options.map((plan) => (
                          <SelectItem key={plan.name} value={plan.name}>
                            {plan.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Billing Cycle</Label>
                    <Select value={selectedCycle} onValueChange={setSelectedCycle} disabled={!selectedCategory}>
                      <SelectTrigger className={darkMode ? 'bg-gray-600 border-gray-500' : ''}>
                        <SelectValue placeholder="Select cycle" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedCategory && planData[selectedCategory].cycles.map((cycle) => (
                          <SelectItem key={cycle} value={cycle.toString()}>
                            {cycle === 1 ? "Monthly" : cycle === 12 ? "Annual" : cycle === 36 ? "3 Years" : `${cycle} months`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>New Price (NPR)</Label>
                    <Input
                      type="number"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      placeholder={`Current: ${getCurrentPrice()}`}
                      className={darkMode ? 'bg-gray-600 border-gray-500' : ''}
                    />
                  </div>
                </div>

                <Button onClick={handleUpdatePrice} className="w-full">
                  <Edit className="w-4 h-4 mr-2" />
                  Update Price
                </Button>
              </CardContent>
            </Card>

            {/* Add New Category */}
            <Card className={darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50'}>
              <CardHeader>
                <CardTitle className={`text-lg ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  Add New Category
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Category Key</Label>
                    <Input
                      value={newCategoryKey}
                      onChange={(e) => setNewCategoryKey(e.target.value)}
                      placeholder="e.g., new-hosting"
                      className={darkMode ? 'bg-gray-600 border-gray-500' : ''}
                    />
                  </div>

                  <div>
                    <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Category Name</Label>
                    <Input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="e.g., New Hosting"
                      className={darkMode ? 'bg-gray-600 border-gray-500' : ''}
                    />
                  </div>
                </div>

                <div>
                  <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Available Billing Cycles</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {availableCycles.map((cycle) => (
                      <Button
                        key={cycle}
                        variant={selectedCycles.includes(cycle) ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleCycle(cycle)}
                        className={darkMode && !selectedCycles.includes(cycle) ? 'border-gray-500 text-gray-300 hover:bg-gray-600' : ''}
                      >
                        {cycle === 1 ? "Monthly" : cycle === 12 ? "Annual" : cycle === 36 ? "3 Years" : `${cycle} months`}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button onClick={handleAddCategory} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Category
                </Button>
              </CardContent>
            </Card>

            {/* Add New Plan */}
            <Card className={darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50'}>
              <CardHeader>
                <CardTitle className={`text-lg ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  Add New Plan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Category</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className={darkMode ? 'bg-gray-600 border-gray-500' : ''}>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(planData).map(([key, value]) => (
                          <SelectItem key={key} value={key}>
                            {value.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>Plan Name</Label>
                    <Input
                      value={newPlanName}
                      onChange={(e) => setNewPlanName(e.target.value)}
                      placeholder="Enter new plan name"
                      className={darkMode ? 'bg-gray-600 border-gray-500' : ''}
                    />
                  </div>
                </div>

                {/* Custom Pricing Section */}
                {selectedCategory && (
                  <div className="space-y-3">
                    <Label className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                      Plan Prices (NPR) - Leave empty for default price of 100
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                      {planData[selectedCategory].cycles.map((cycle) => (
                        <div key={cycle}>
                          <Label className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                            {cycle === 1 ? "Monthly" : cycle === 12 ? "Annual" : cycle === 36 ? "3 Years" : `${cycle} months`}
                          </Label>
                          <Input
                            type="number"
                            value={newPlanPrices[cycle] || ''}
                            onChange={(e) => handleNewPlanPriceChange(cycle, e.target.value)}
                            placeholder="100"
                            className={darkMode ? 'bg-gray-600 border-gray-500' : ''}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button onClick={handleAddPlan} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Plan with Custom Prices
                </Button>
              </CardContent>
            </Card>

            {/* Current Plans Overview */}
            <Card className={darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50'}>
              <CardHeader>
                <CardTitle className={`text-lg ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  Current Plans & Categories
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(planData).map(([categoryKey, category]) => (
                    <div key={categoryKey} className={`p-3 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
                      <div className="flex justify-between items-center mb-2">
                        <h4 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                          {category.name}
                        </h4>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className={`h-7 w-7 p-0 ${darkMode ? 'border-gray-500 hover:bg-gray-600' : ''}`}
                            >
                              <Trash className="w-3 h-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Category</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete the "{category.name}" category? This will permanently remove all plans in this category and cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteCategory(categoryKey, category.name)}>
                                Delete Category
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                      <div className="space-y-1">
                        {category.options.map((plan) => (
                          <div key={plan.name} className="flex justify-between items-center">
                            <span className={`text-sm ${darkMode ? 'text-gray-200' : 'text-gray-600'}`}>
                              {plan.name}
                            </span>
                            <div className="flex items-center gap-2">
                              <div className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                                {plan.pricing ? (
                                  <div className="space-y-1">
                                    {Object.entries(plan.pricing).map(([cycle, price]) => (
                                      <div key={cycle} className="flex items-center gap-1">
                                        {editingPrice?.categoryKey === categoryKey && 
                                         editingPrice?.planName === plan.name && 
                                         editingPrice?.cycle === parseInt(cycle) ? (
                                          <div className="flex items-center gap-1">
                                            <Input
                                              type="number"
                                              value={editPrice}
                                              onChange={(e) => setEditPrice(e.target.value)}
                                              className={`h-5 w-20 text-xs ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white'}`}
                                            />
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={saveEditedPrice}
                                              className="h-5 w-5 p-0"
                                            >
                                              <Check className="w-3 h-3 text-green-600" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={cancelEditingPrice}
                                              className="h-5 w-5 p-0"
                                            >
                                              <X className="w-3 h-3 text-red-600" />
                                            </Button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            <span>
                                              {cycle}m: {formatCurrency(price)}
                                            </span>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => startEditingPrice(categoryKey, plan.name, parseInt(cycle))}
                                              className="h-4 w-4 p-0"
                                            >
                                              <Edit className="w-2 h-2" />
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    {editingPrice?.categoryKey === categoryKey && 
                                     editingPrice?.planName === plan.name ? (
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          value={editPrice}
                                          onChange={(e) => setEditPrice(e.target.value)}
                                          className={`h-5 w-20 text-xs ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white'}`}
                                        />
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={saveEditedPrice}
                                          className="h-5 w-5 p-0"
                                        >
                                          <Check className="w-3 h-3 text-green-600" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={cancelEditingPrice}
                                          className="h-5 w-5 p-0"
                                        >
                                          <X className="w-3 h-3 text-red-600" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <span>{formatCurrency(plan.price || 0)}</span>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => startEditingPrice(categoryKey, plan.name)}
                                          className="h-4 w-4 p-0"
                                        >
                                          <Edit className="w-2 h-2" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeletePlan(categoryKey, plan.name)}
                                className={`h-6 w-6 p-0 ${darkMode ? 'border-gray-500 hover:bg-gray-600' : ''}`}
                              >
                                <Trash className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default PriceManagement;
