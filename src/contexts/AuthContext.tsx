import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  username: string;
  password: string;
  name: string;
  isAdmin?: boolean;
}

interface PlanOption {
  name: string;
  pricing?: { [key: number]: number };
  price?: number;
}

interface PlanCategory {
  name: string;
  options: PlanOption[];
  cycles: number[];
  unit: { [key: number]: string };
}

interface AuthContextType {
  isAuthenticated: boolean;
  currentUser: string | null;
  currentUsername: string | null;
  isAdmin: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  addUser: (username: string, password: string, name: string) => boolean;
  getUsers: () => User[];
  deleteUser: (username: string) => boolean;
  updateUserPassword: (username: string, newPassword: string) => boolean;
  getPlanData: () => { [key: string]: PlanCategory };
  updatePlanPrice: (category: string, planName: string, cycle: number, price: number) => boolean;
  addPlan: (category: string, planName: string, pricing: { [key: number]: number }) => boolean;
  deletePlan: (category: string, planName: string) => boolean;
  addCategory: (categoryKey: string, categoryName: string, cycles: number[]) => boolean;
  deleteCategory: (categoryKey: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Initial hardcoded users - only aryan account
const INITIAL_USERS: User[] = [
  { username: 'aryan', password: 'nestnepal2024', name: 'Aryan', isAdmin: true },
];

// Default plan data
const DEFAULT_PLAN_DATA = {
  "shared-hosting": {
    name: "Web Hosting",
    options: [
      { 
        name: "Web Essential", 
        pricing: { 1: 339, 12: 2034, 36: 3661 }
      },
      { 
        name: "Web Plus", 
        pricing: { 1: 565, 12: 3390, 36: 6102 }
      },
      { 
        name: "Web Pro", 
        pricing: { 1: 1017, 12: 6102, 36: 10984 }
      },
      { 
        name: "Web Ultimate", 
        pricing: { 1: 1356, 12: 8136, 36: 14643 }
      }
    ],
    cycles: [1, 12, 36],
    unit: { 1: "monthly", 12: "annually", 36: "triennial" }
  },
  cloud: {
    name: "Cloud Hosting",
    options: [
      { 
        name: "Cloud Thikka", 
        pricing: { 1: 565, 12: 3390, 36: 6102 }
      },
      { 
        name: "Cloud Ramro", 
        pricing: { 1: 791, 12: 4746, 36: 8543 }
      },
      { 
        name: "Cloud Babaal", 
        pricing: { 1: 1469, 12: 8814, 36: 15865 }
      },
      { 
        name: "Cloud Mazzako", 
        pricing: { 1: 2712, 12: 16272, 36: 29290 }
      }
    ],
    cycles: [1, 12, 36],
    unit: { 1: "monthly", 12: "annually", 36: "triennial" }
  },
  wordpress: {
    name: "WordPress Hosting",
    options: [
      { name: "Basic", price: 400 },
      { name: "Regular", price: 800 },
      { name: "Ideal", price: 1200 },
      { name: "Ultimate", price: 2400 }
    ],
    cycles: [36],
    unit: { 36: "triennial (3-year term only)" }
  },
  "vps-nepal": {
    name: "VPS Nepal",
    options: [
      { 
        name: "1C/2G", 
        pricing: { 1: 1260, 12: 15120, 36: 45360 }
      },
      { 
        name: "2C/4G", 
        pricing: { 1: 2520, 12: 30240, 36: 90720 }
      },
      { 
        name: "3C/6G", 
        pricing: { 1: 3780, 12: 45360, 36: 136080 }
      },
      { 
        name: "4C/8G", 
        pricing: { 1: 5050, 12: 60600, 36: 181800 }
      }
    ],
    cycles: [1, 12, 36],
    unit: { 1: "monthly", 12: "annually", 36: "triennial" }
  },
  "vps-international": {
    name: "VPS International",
    options: [
      { 
        name: "2C/4G", 
        pricing: { 1: 1000, 12: 12000, 36: 36000 }
      },
      { 
        name: "4C/8G", 
        pricing: { 1: 2000, 12: 24000, 36: 72000 }
      },
      { 
        name: "8C/16G", 
        pricing: { 1: 4000, 12: 48000, 36: 144000 }
      },
      { 
        name: "16C/32G", 
        pricing: { 1: 8000, 12: 96000, 36: 288000 }
      }
    ],
    cycles: [1, 12, 36],
    unit: { 1: "monthly", 12: "annually", 36: "triennial" }
  },
  "vps-windows": {
    name: "Windows VPS",
    options: [
      { 
        name: "1C/2G", 
        pricing: { 1: 1260, 12: 15120, 36: 45360 }
      },
      { 
        name: "2C/4G", 
        pricing: { 1: 2520, 12: 30240, 36: 90720 }
      },
      { 
        name: "3C/6G", 
        pricing: { 1: 3780, 12: 45360, 36: 136080 }
      },
      { 
        name: "4C/8G", 
        pricing: { 1: 5050, 12: 60600, 36: 181800 }
      }
    ],
    cycles: [1, 12, 36],
    unit: { 1: "monthly", 12: "annually", 36: "triennial" }
  },
  reseller: {
    name: "Reseller Hosting",
    options: [
      { 
        name: "Rh-10", 
        pricing: { 1: 959, 12: 11512 }
      },
      { 
        name: "Rh-15", 
        pricing: { 1: 1355, 12: 16258 }
      },
      { 
        name: "Rh-30", 
        pricing: { 1: 2259, 12: 27106 }
      },
      { 
        name: "Rh-50", 
        pricing: { 1: 3389, 12: 40666 }
      },
      { 
        name: "Rh-100", 
        pricing: { 1: 5197, 12: 62362 }
      }
    ],
    cycles: [1, 12],
    unit: { 1: "monthly", 12: "annually" }
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [planData, setPlanData] = useState(DEFAULT_PLAN_DATA);

  // Load users from localStorage on mount
  useEffect(() => {
    const savedUsers = localStorage.getItem('calculator-users');
    if (savedUsers) {
      try {
        setUsers(JSON.parse(savedUsers));
      } catch (error) {
        console.error('Error loading users:', error);
        setUsers(INITIAL_USERS);
      }
    }
  }, []);

  // Save users to localStorage whenever users change
  useEffect(() => {
    localStorage.setItem('calculator-users', JSON.stringify(users));
  }, [users]);

  // Check for saved authentication state on mount
  useEffect(() => {
    const savedAuth = localStorage.getItem('calculator-auth');
    const savedUser = localStorage.getItem('calculator-user');
    const savedUsername = localStorage.getItem('calculator-username');
    if (savedAuth === 'true' && savedUser && savedUsername) {
      const user = users.find(u => u.username === savedUsername);
      if (user) {
        setIsAuthenticated(true);
        setCurrentUser(savedUser);
        setCurrentUsername(savedUsername);
        setIsAdmin(user.isAdmin || false);
      }
    }
  }, [users]);

  const login = (username: string, password: string): boolean => {
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
      setIsAuthenticated(true);
      setCurrentUser(user.name);
      setCurrentUsername(user.username);
      setIsAdmin(user.isAdmin || false);
      localStorage.setItem('calculator-auth', 'true');
      localStorage.setItem('calculator-user', user.name);
      localStorage.setItem('calculator-username', user.username);
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentUsername(null);
    setIsAdmin(false);
    localStorage.removeItem('calculator-auth');
    localStorage.removeItem('calculator-user');
    localStorage.removeItem('calculator-username');
  };

  const addUser = (username: string, password: string, name: string): boolean => {
    if (users.find(u => u.username === username)) {
      return false; // User already exists
    }
    
    const newUser: User = { username, password, name };
    setUsers(prev => [...prev, newUser]);
    return true;
  };

  const getUsers = (): User[] => {
    return users;
  };

  const deleteUser = (username: string): boolean => {
    if (username === 'aryan') {
      return false; // Cannot delete the aryan admin user
    }
    
    setUsers(prev => prev.filter(u => u.username !== username));
    return true;
  };

  const updateUserPassword = (username: string, newPassword: string): boolean => {
    const userIndex = users.findIndex(u => u.username === username);
    if (userIndex === -1) {
      return false; // User not found
    }
    
    setUsers(prev => {
      const updatedUsers = [...prev];
      updatedUsers[userIndex] = { ...updatedUsers[userIndex], password: newPassword };
      return updatedUsers;
    });
    return true;
  };

  const updatePlanPrice = (category: string, planName: string, cycle: number, price: number): boolean => {
    if (!planData[category]) return false;
    
    setPlanData(prev => {
      const newData = { ...prev };
      const categoryData = { ...newData[category] };
      const planIndex = categoryData.options.findIndex(plan => plan.name === planName);
      
      if (planIndex === -1) return prev;
      
      const updatedOptions = [...categoryData.options];
      const updatedPlan = { ...updatedOptions[planIndex] };
      
      if (updatedPlan.pricing) {
        updatedPlan.pricing = { ...updatedPlan.pricing, [cycle]: price };
      } else if (updatedPlan.price !== undefined) {
        updatedPlan.price = price;
      }
      
      updatedOptions[planIndex] = updatedPlan;
      categoryData.options = updatedOptions;
      newData[category] = categoryData;
      
      return newData;
    });
    
    return true;
  };

  const addPlan = (category: string, planName: string, pricing: { [key: number]: number }): boolean => {
    if (!planData[category]) return false;
    
    setPlanData(prev => {
      const newData = { ...prev };
      const categoryData = { ...newData[category] };
      
      // Check if plan already exists
      if (categoryData.options.find(plan => plan.name === planName)) {
        return prev;
      }
      
      const newPlan = { name: planName, pricing };
      categoryData.options = [...categoryData.options, newPlan];
      newData[category] = categoryData;
      
      return newData;
    });
    
    return true;
  };

  const deletePlan = (category: string, planName: string): boolean => {
    if (!planData[category]) return false;
    
    setPlanData(prev => {
      const newData = { ...prev };
      const categoryData = { ...newData[category] };
      
      categoryData.options = categoryData.options.filter(plan => plan.name !== planName);
      newData[category] = categoryData;
      
      return newData;
    });
    
    return true;
  };

  const addCategory = (categoryKey: string, categoryName: string, cycles: number[]): boolean => {
    if (planData[categoryKey]) {
      return false; // Category already exists
    }
    
    const unit: { [key: number]: string } = {};
    cycles.forEach(cycle => {
      if (cycle === 1) unit[cycle] = "monthly";
      else if (cycle === 12) unit[cycle] = "annually";
      else if (cycle === 36) unit[cycle] = "triennial";
      else unit[cycle] = `${cycle} months`;
    });
    
    const newCategory: PlanCategory = {
      name: categoryName,
      options: [],
      cycles: cycles,
      unit: unit
    };
    
    setPlanData(prev => ({
      ...prev,
      [categoryKey]: newCategory
    }));
    
    return true;
  };

  const deleteCategory = (categoryKey: string): boolean => {
    if (!planData[categoryKey]) {
      return false; // Category doesn't exist
    }
    
    setPlanData(prev => {
      const newData = { ...prev };
      delete newData[categoryKey];
      return newData;
    });
    
    return true;
  };

  const getPlanData = () => planData;

  // Save plan data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('calculator-plan-data', JSON.stringify(planData));
  }, [planData]);

  // Load plan data from localStorage on mount
  useEffect(() => {
    const savedPlanData = localStorage.getItem('calculator-plan-data');
    if (savedPlanData) {
      try {
        setPlanData(JSON.parse(savedPlanData));
      } catch (error) {
        console.error('Error loading plan data:', error);
        setPlanData(DEFAULT_PLAN_DATA);
      }
    }
  }, []);

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      currentUser, 
      currentUsername,
      isAdmin, 
      login, 
      logout, 
      addUser, 
      getUsers, 
      deleteUser,
      updateUserPassword,
      getPlanData,
      updatePlanPrice,
      addPlan,
      deletePlan,
      addCategory,
      deleteCategory
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
