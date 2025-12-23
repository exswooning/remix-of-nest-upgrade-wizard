import React, { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Users, Plus, Trash2, Key, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface UserManagementProps {
  darkMode: boolean;
}

const UserManagement: React.FC<UserManagementProps> = ({ darkMode }) => {
  const { addUser, getUsers, deleteUser, updateUserPassword } = useAuth();
  const { toast } = useToast();
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [changePasswordUser, setChangePasswordUser] = useState<string | null>(null);
  const [newPasswordForUser, setNewPasswordForUser] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const handleAddUser = () => {
    if (!newUsername.trim() || !newPassword.trim() || !newName.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    const success = addUser(newUsername.trim(), newPassword, newName.trim());
    if (success) {
      toast({
        title: "User added",
        description: `User ${newName} has been created successfully`,
      });
      setNewUsername('');
      setNewPassword('');
      setNewName('');
    } else {
      toast({
        title: "Error",
        description: "Username already exists",
        variant: "destructive"
      });
    }
  };

  const handleDeleteUser = (username: string) => {
    const success = deleteUser(username);
    if (success) {
      toast({
        title: "User deleted",
        description: `User has been removed successfully`,
      });
    } else {
      toast({
        title: "Error",
        description: "Cannot delete admin users",
        variant: "destructive"
      });
    }
  };

  const handleChangePassword = () => {
    if (!changePasswordUser || !newPasswordForUser.trim()) {
      toast({
        title: "Error",
        description: "Please enter a new password",
        variant: "destructive"
      });
      return;
    }

    const success = updateUserPassword(changePasswordUser, newPasswordForUser);
    if (success) {
      toast({
        title: "Password updated",
        description: "User password has been changed successfully",
      });
      setChangePasswordUser(null);
      setNewPasswordForUser('');
    } else {
      toast({
        title: "Error",
        description: "Failed to update password",
        variant: "destructive"
      });
    }
  };

  const users = getUsers();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button 
          variant="outline" 
          className={`${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700/50' : 'border-gray-300'}`}
        >
          <Users className="w-4 h-4 mr-2" />
          Manage Users
        </Button>
      </SheetTrigger>
      <SheetContent className={`w-[500px] sm:max-w-[500px] ${darkMode ? 'bg-gray-950 border-gray-800' : 'bg-white'}`}>
        <SheetHeader>
          <SheetTitle className={darkMode ? 'text-white' : 'text-gray-800'}>
            User Management
          </SheetTitle>
          <SheetDescription className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
            Add new users and manage existing ones
          </SheetDescription>
        </SheetHeader>
        
        <div className="h-[calc(100vh-120px)] overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="mt-6 space-y-6 pr-4">
              {/* Add New User Form */}
              <Card className={`${darkMode ? 'bg-gray-900/50 border-gray-800' : 'bg-gray-50'}`}>
                <CardHeader>
                  <CardTitle className={`text-sm ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                    Add New User
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="newUsername" className={darkMode ? 'text-gray-300' : ''}>
                      Username
                    </Label>
                    <Input
                      id="newUsername"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="Enter username"
                      className={darkMode ? 'bg-gray-800 border-gray-700 text-white placeholder:text-gray-500' : ''}
                    />
                  </div>
                  <div>
                    <Label htmlFor="newPassword" className={darkMode ? 'text-gray-300' : ''}>
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter password"
                        className={`pr-10 ${darkMode ? 'bg-gray-800 border-gray-700 text-white placeholder:text-gray-500' : ''}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? (
                          <EyeOff className={`h-4 w-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                        ) : (
                          <Eye className={`h-4 w-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="newName" className={darkMode ? 'text-gray-300' : ''}>
                      Display Name
                    </Label>
                    <Input
                      id="newName"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Enter display name"
                      className={darkMode ? 'bg-gray-800 border-gray-700 text-white placeholder:text-gray-500' : ''}
                    />
                  </div>
                  <Button onClick={handleAddUser} className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Add User
                  </Button>
                </CardContent>
              </Card>

              {/* Users List */}
              <div className="space-y-3">
                <h3 className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  Existing Users ({users.length})
                </h3>
                <div className="space-y-2">
                  {users.map((user) => (
                    <Card key={user.username} className={`${darkMode ? 'bg-gray-900/50 border-gray-800' : 'bg-white'}`}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={`font-medium ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                              {user.name}
                            </div>
                            <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              @{user.username} {user.isAdmin && '(Admin)'}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setChangePasswordUser(user.username)}
                                  className={`${darkMode ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : ''}`}
                                >
                                  <Key className="w-3 h-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className={darkMode ? 'bg-gray-950 border-gray-800' : ''}>
                                <AlertDialogHeader>
                                  <AlertDialogTitle className={darkMode ? 'text-white' : ''}>
                                    Change Password for {user.name}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className={darkMode ? 'text-gray-400' : ''}>
                                    Enter a new password for this user.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className="my-4">
                                  <div className="relative">
                                    <Input
                                      type={showChangePassword ? "text" : "password"}
                                      placeholder="Enter new password"
                                      value={newPasswordForUser}
                                      onChange={(e) => setNewPasswordForUser(e.target.value)}
                                      className={`pr-10 ${darkMode ? 'bg-gray-800 border-gray-700 text-white placeholder:text-gray-500' : ''}`}
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                      onClick={() => setShowChangePassword(!showChangePassword)}
                                    >
                                      {showChangePassword ? (
                                        <EyeOff className={`h-4 w-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                                      ) : (
                                        <Eye className={`h-4 w-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                                <AlertDialogFooter>
                                  <AlertDialogCancel 
                                    onClick={() => {
                                      setChangePasswordUser(null);
                                      setNewPasswordForUser('');
                                      setShowChangePassword(false);
                                    }}
                                    className={darkMode ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : ''}
                                  >
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction onClick={handleChangePassword}>
                                    Update Password
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            {user.username !== 'aryan' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteUser(user.username)}
                                className={`${darkMode ? 'border-gray-700 text-red-400 hover:bg-red-900/20 hover:border-red-700' : 'border-red-300 text-red-600 hover:bg-red-50'}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default UserManagement;
