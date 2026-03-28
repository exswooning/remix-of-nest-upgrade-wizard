import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FileText, Clock, User, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';

interface RFRData {
  id: string;
  clientName: string;
  contractNumber: string;
  refusalDate: string;
  refusalReason: string;
  alternativeSolutions: string;
  nextFollowUp: string;
  status: 'pending' | 'resolved' | 'escalated';
  assignedTo?: string;
  notes?: string;
}

const RFRTab: React.FC<{ darkMode: boolean }> = ({ darkMode }) => {
  const [rfrRequests, setRfrRequests] = useState<RFRData[]>([
    {
      id: '1',
      clientName: 'TechCorp Solutions',
      contractNumber: 'CGAP-2024-001',
      refusalDate: '2024-03-15',
      refusalReason: 'Budget constraints - client unable to meet payment terms',
      alternativeSolutions: 'Offered payment plan option, suggested reduced scope',
      nextFollowUp: '2024-03-22',
      status: 'pending',
      assignedTo: 'John Smith',
      notes: 'Client requested reconsideration after board meeting'
    },
    {
      id: '2',
      clientName: 'Digital Innovations Ltd',
      contractNumber: 'CGAP-2024-002',
      refusalDate: '2024-03-18',
      refusalReason: 'Technical requirements not met - insufficient infrastructure',
      alternativeSolutions: 'Provided alternative hosting solution, phased implementation',
      nextFollowUp: '2024-03-25',
      status: 'resolved',
      assignedTo: 'Sarah Johnson',
      notes: 'Client accepted alternative solution'
    }
  ]);

  const [newRFR, setNewRFR] = useState({
    clientName: '',
    contractNumber: '',
    refusalDate: format(new Date(), 'yyyy-MM-dd'),
    refusalReason: '',
    alternativeSolutions: '',
    nextFollowUp: '',
    status: 'pending' as const
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'escalated': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleAddRFR = () => {
    if (newRFR.clientName && newRFR.contractNumber && newRFR.refusalReason) {
      setRfrRequests([...rfrRequests, { ...newRFR, id: Date.now().toString() }]);
      setNewRFR({
        clientName: '',
        contractNumber: '',
        refusalDate: format(new Date(), 'yyyy-MM-dd'),
        refusalReason: '',
        alternativeSolutions: '',
        nextFollowUp: '',
        status: 'pending'
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Right of First Refusal (RFR) Management
        </h3>
        <Button onClick={handleAddRFR} className="bg-blue-600 hover:bg-blue-700">
          <FileText className="w-4 h-4 mr-2" />
          Add RFR
        </Button>
      </div>

      {/* Add New RFR Form */}
      <Card className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            New RFR Entry
          </CardTitle>
          <CardDescription>
            Record new Right of First Refusal cases and track resolution progress
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-4 gap-8">
            <div>
              <Label htmlFor="clientName">Client Name</Label>
              <Input
                id="clientName"
                value={newRFR.clientName}
                onChange={(e) => setNewRFR({...newRFR, clientName: e.target.value})}
                placeholder="Enter client name"
                className={darkMode ? 'bg-gray-700 border-gray-600' : ''}
              />
            </div>
            <div>
              <Label htmlFor="contractNumber">Contract Number</Label>
              <Input
                id="contractNumber"
                value={newRFR.contractNumber}
                onChange={(e) => setNewRFR({...newRFR, contractNumber: e.target.value})}
                placeholder="CGAP-2024-XXX"
                className={darkMode ? 'bg-gray-700 border-gray-600' : ''}
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={newRFR.status} onValueChange={(value) => setNewRFR({...newRFR, status: value as 'pending' | 'approved' | 'rejected' | 'under_review'})}>
                <SelectTrigger className={darkMode ? 'bg-gray-700 border-gray-600' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="escalated">Escalated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="assignedTo">Assigned To</Label>
              <Input
                id="assignedTo"
                value={newRFR.assignedTo || ''}
                onChange={(e) => setNewRFR({...newRFR, assignedTo: e.target.value})}
                placeholder="Assign to staff member"
                className={darkMode ? 'bg-gray-700 border-gray-600' : ''}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-8">
            <div>
              <Label htmlFor="refusalDate">Refusal Date</Label>
              <Input
                id="refusalDate"
                type="date"
                value={newRFR.refusalDate}
                onChange={(e) => setNewRFR({...newRFR, refusalDate: e.target.value})}
                className={darkMode ? 'bg-gray-700 border-gray-600' : ''}
              />
            </div>
            <div>
              <Label htmlFor="nextFollowUp">Next Follow-up</Label>
              <Input
                id="nextFollowUp"
                type="date"
                value={newRFR.nextFollowUp}
                onChange={(e) => setNewRFR({...newRFR, nextFollowUp: e.target.value})}
                className={darkMode ? 'bg-gray-700 border-gray-600' : ''}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="refusalReason">Refusal Reason</Label>
            <Textarea
              id="refusalReason"
              value={newRFR.refusalReason}
              onChange={(e) => setNewRFR({...newRFR, refusalReason: e.target.value})}
              placeholder="Detailed reason for refusal..."
              rows={5}
              className={darkMode ? 'bg-gray-700 border-gray-600' : ''}
            />
          </div>

          <div>
            <Label htmlFor="alternativeSolutions">Alternative Solutions</Label>
            <Textarea
              id="alternativeSolutions"
              value={newRFR.alternativeSolutions}
              onChange={(e) => setNewRFR({...newRFR, alternativeSolutions: e.target.value})}
              placeholder="Proposed alternatives and solutions..."
              rows={5}
              className={darkMode ? 'bg-gray-700 border-gray-600' : ''}
            />
          </div>
        </CardContent>
      </Card>

      {/* RFR List */}
      <div className="space-y-4">
        <h4 className={`text-md font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Recent RFR Cases
        </h4>
        {rfrRequests.map((rfr) => (
          <Card key={rfr.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4" />
                    <h5 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {rfr.clientName}
                    </h5>
                    <Badge className={getStatusColor(rfr.status)}>
                      {rfr.status}
                    </Badge>
                  </div>
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    Contract: {rfr.contractNumber}
                  </p>
                </div>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {format(new Date(rfr.refusalDate), 'MMM dd, yyyy')}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <Label className="text-xs font-medium">Refusal Reason</Label>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {rfr.refusalReason}
                  </p>
                </div>
                <div>
                  <Label className="text-xs font-medium">Alternative Solutions</Label>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {rfr.alternativeSolutions}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <div>
                    <Label className="text-xs font-medium">Follow-up</Label>
                    <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {format(new Date(rfr.nextFollowUp), 'MMM dd, yyyy')}
                    </p>
                  </div>
                </div>
                {rfr.assignedTo && (
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <div>
                      <Label className="text-xs font-medium">Assigned To</Label>
                      <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {rfr.assignedTo}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {rfr.notes && (
                <div className="mt-3">
                  <Label className="text-xs font-medium">Notes</Label>
                  <div className={`mt-1 p-2 rounded text-sm ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-50 text-gray-700'}`}>
                    {rfr.notes}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default RFRTab;
