import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, Calendar, Clock, CheckCircle, AlertCircle, FileText, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

interface RFPData {
  id: string;
  clientName: string;
  contractNumber: string;
  requestTitle: string;
  amount: number;
  currency: string;
  requestDate: string;
  dueDate: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  paymentTerms: string;
  requestedBy: string;
  approvedBy?: string;
  rejectionReason?: string;
  paymentMethod?: string;
  invoiceNumber?: string;
}

const RFPTab: React.FC<{ darkMode: boolean }> = ({ darkMode }) => {
  const [rfpRequests, setRfpRequests] = useState<RFPData[]>([
    {
      id: '1',
      clientName: 'Global Systems Inc',
      contractNumber: 'CGAP-2024-003',
      requestTitle: 'Q2 2024 Hosting Renewal Payment',
      amount: 2500.00,
      currency: 'USD',
      requestDate: '2024-03-20',
      dueDate: '2024-04-15',
      status: 'pending',
      urgency: 'high',
      description: 'Annual hosting renewal for enterprise cloud infrastructure',
      paymentTerms: 'Net 30 days',
      requestedBy: 'Michael Chen',
      paymentMethod: 'Wire Transfer'
    },
    {
      id: '2',
      clientName: 'Nepal Digital Agency',
      contractNumber: 'CGAP-2024-004',
      requestTitle: 'Additional Storage Capacity Payment',
      amount: 850.00,
      currency: 'USD',
      requestDate: '2024-03-18',
      dueDate: '2024-03-25',
      status: 'approved',
      urgency: 'medium',
      description: 'Upgrade from 100GB to 500GB storage capacity',
      paymentTerms: 'Immediate',
      requestedBy: 'Rina Sharma',
      approvedBy: 'John Manager',
      paymentMethod: 'PayPal',
      invoiceNumber: 'INV-2024-042'
    },
    {
      id: '3',
      clientName: 'Tech Solutions Nepal',
      contractNumber: 'CGAP-2024-005',
      requestTitle: 'Emergency Server Migration Payment',
      amount: 1200.00,
      currency: 'USD',
      requestDate: '2024-03-22',
      dueDate: '2024-03-25',
      status: 'rejected',
      urgency: 'critical',
      description: 'Urgent server migration due to hardware failure',
      paymentTerms: 'Immediate',
      requestedBy: 'David Kumar',
      rejectionReason: 'Budget exceeded for current quarter',
      requestedBy: 'David Kumar'
    }
  ]);

  const [newRFP, setNewRFP] = useState({
    clientName: '',
    contractNumber: '',
    requestTitle: '',
    amount: 0,
    currency: 'USD',
    requestDate: format(new Date(), 'yyyy-MM-dd'),
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    status: 'pending' as const,
    urgency: 'medium' as const,
    description: '',
    paymentTerms: 'Net 30',
    requestedBy: '',
    paymentMethod: 'Wire Transfer'
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'paid': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'low': return 'bg-gray-100 text-gray-800';
      case 'medium': return 'bg-blue-100 text-blue-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'critical': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleAddRFP = () => {
    if (newRFP.clientName && newRFP.requestTitle && newRFP.amount > 0) {
      setRfpRequests([...rfpRequests, { ...newRFP, id: Date.now().toString() }]);
      setNewRFP({
        clientName: '',
        contractNumber: '',
        requestTitle: '',
        amount: 0,
        currency: 'USD',
        requestDate: format(new Date(), 'yyyy-MM-dd'),
        dueDate: format(new Date(), 'yyyy-MM-dd'),
        status: 'pending',
        urgency: 'medium',
        description: '',
        paymentTerms: 'Net 30',
        requestedBy: '',
        paymentMethod: 'Wire Transfer'
      });
    }
  };

  const totalPending = rfpRequests.filter(rfp => rfp.status === 'pending').reduce((sum, rfp) => sum + rfp.amount, 0);
  const totalApproved = rfpRequests.filter(rfp => rfp.status === 'approved').reduce((sum, rfp) => sum + rfp.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Request for Payment (RFP) Management
        </h3>
        <Button onClick={handleAddRFP} className="bg-green-600 hover:bg-green-700">
          <DollarSign className="w-4 h-4 mr-2" />
          Add RFP
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              <div>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Pending Amount</p>
                <p className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  ${totalPending.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Approved Amount</p>
                <p className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  ${totalApproved.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add New RFP Form */}
      <Card className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            New Payment Request
          </CardTitle>
          <CardDescription>
            Create and track payment requests for contracts and services
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-4 gap-8">
            <div>
              <Label htmlFor="clientName">Client Name</Label>
              <Input
                id="clientName"
                value={newRFP.clientName}
                onChange={(e) => setNewRFP({...newRFP, clientName: e.target.value})}
                placeholder="Enter client name"
                className={darkMode ? 'bg-gray-700 border-gray-600' : ''}
              />
            </div>
            <div>
              <Label htmlFor="contractNumber">Contract Number</Label>
              <Input
                id="contractNumber"
                value={newRFP.contractNumber}
                onChange={(e) => setNewRFP({...newRFP, contractNumber: e.target.value})}
                placeholder="CGAP-2024-XXX"
                className={darkMode ? 'bg-gray-700 border-gray-600' : ''}
              />
            </div>
            <div>
              <Label htmlFor="urgency">Urgency</Label>
              <Select value={newRFP.urgency} onValueChange={(value) => setNewRFP({...newRFP, urgency: value as any})}>
                <SelectTrigger className={darkMode ? 'bg-gray-700 border-gray-600' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="requestedBy">Requested By</Label>
              <Input
                id="requestedBy"
                value={newRFP.requestedBy}
                onChange={(e) => setNewRFP({...newRFP, requestedBy: e.target.value})}
                placeholder="Person requesting payment"
                className={darkMode ? 'bg-gray-700 border-gray-600' : ''}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="requestTitle">Request Title</Label>
            <Input
              id="requestTitle"
              value={newRFP.requestTitle}
              onChange={(e) => setNewRFP({...newRFP, requestTitle: e.target.value})}
              placeholder="Brief description of payment request..."
              className={darkMode ? 'bg-gray-700 border-gray-600' : ''}
            />
          </div>

          <div className="grid grid-cols-4 gap-8">
            <div>
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                value={newRFP.amount}
                onChange={(e) => setNewRFP({...newRFP, amount: parseFloat(e.target.value) || 0})}
                placeholder="0.00"
                className={darkMode ? 'bg-gray-700 border-gray-600' : ''}
              />
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Select value={newRFP.currency} onValueChange={(value) => setNewRFP({...newRFP, currency: value})}>
                <SelectTrigger className={darkMode ? 'bg-gray-700 border-gray-600' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="NPR">NPR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="requestDate">Request Date</Label>
              <Input
                id="requestDate"
                type="date"
                value={newRFP.requestDate}
                onChange={(e) => setNewRFP({...newRFP, requestDate: e.target.value})}
                className={darkMode ? 'bg-gray-700 border-gray-600' : ''}
              />
            </div>
            <div>
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={newRFP.dueDate}
                onChange={(e) => setNewRFP({...newRFP, dueDate: e.target.value})}
                className={darkMode ? 'bg-gray-700 border-gray-600' : ''}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <Label htmlFor="paymentTerms">Payment Terms</Label>
              <Select value={newRFP.paymentTerms} onValueChange={(value) => setNewRFP({...newRFP, paymentTerms: value})}>
                <SelectTrigger className={darkMode ? 'bg-gray-700 border-gray-600' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Immediate">Immediate</SelectItem>
                  <SelectItem value="Net 15">Net 15 days</SelectItem>
                  <SelectItem value="Net 30">Net 30 days</SelectItem>
                  <SelectItem value="Net 60">Net 60 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select value={newRFP.paymentMethod} onValueChange={(value) => setNewRFP({...newRFP, paymentMethod: value})}>
                <SelectTrigger className={darkMode ? 'bg-gray-700 border-gray-600' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Wire Transfer">Wire Transfer</SelectItem>
                  <SelectItem value="PayPal">PayPal</SelectItem>
                  <SelectItem value="Credit Card">Credit Card</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Check">Check</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={newRFP.description}
              onChange={(e) => setNewRFP({...newRFP, description: e.target.value})}
              placeholder="Detailed description of payment request..."
              rows={6}
              className={darkMode ? 'bg-gray-700 border-gray-600' : ''}
            />
          </div>
        </CardContent>
      </Card>

      {/* RFP List */}
      <div className="space-y-4">
        <h4 className={`text-md font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Payment Requests
        </h4>
        {rfpRequests.map((rfp) => (
          <Card key={rfp.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4" />
                    <h5 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {rfp.requestTitle}
                    </h5>
                    <div className="flex gap-2">
                      <Badge className={getStatusColor(rfp.status)}>
                        {rfp.status}
                      </Badge>
                      <Badge className={getUrgencyColor(rfp.urgency)}>
                        {rfp.urgency}
                      </Badge>
                    </div>
                  </div>
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    {rfp.clientName} • {rfp.contractNumber}
                  </p>
                </div>
                <div className={`text-right ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  <p className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {rfp.currency} {rfp.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              <div className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-3`}>
                {rfp.description}
              </div>

              <div className="grid grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Requested</p>
                    <p className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                      {format(new Date(rfp.requestDate), 'MMM dd, yyyy')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Due</p>
                    <p className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                      {format(new Date(rfp.dueDate), 'MMM dd, yyyy')}
                    </p>
                  </div>
                </div>
                <div>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Terms</p>
                  <p className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                    {rfp.paymentTerms}
                  </p>
                </div>
                <div>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Method</p>
                  <p className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                    {rfp.paymentMethod}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-gray-200">
                <div>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Requested By</p>
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {rfp.requestedBy}
                  </p>
                </div>
                {rfp.approvedBy && (
                  <div>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Approved By</p>
                    <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {rfp.approvedBy}
                    </p>
                  </div>
                )}
                {rfp.invoiceNumber && (
                  <div>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Invoice</p>
                    <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {rfp.invoiceNumber}
                    </p>
                  </div>
                )}
                {rfp.rejectionReason && (
                  <div className="col-span-2">
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Rejection Reason</p>
                    <p className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
                      {rfp.rejectionReason}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default RFPTab;
