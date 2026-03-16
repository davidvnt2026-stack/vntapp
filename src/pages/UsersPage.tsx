import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../contexts/AuthContext";
import { useImpersonation } from "../contexts/ImpersonationContext";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Input } from "../components/ui/Input";
import {
  Users,
  Search,
  Shield,
  ShieldOff,
  Eye,
  Mail,
  Calendar,
  Loader2,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import type { Id } from "../../convex/_generated/dataModel";

export function UsersPage() {
  const { token } = useAuth();
  const { startImpersonation, isImpersonating, realUser } = useImpersonation();
  const [searchTerm, setSearchTerm] = useState("");
  const [togglingAdmin, setTogglingAdmin] = useState<string | null>(null);

  // Use realUser.isAdmin (works even when impersonating)
  const isAdmin = realUser?.isAdmin || false;

  // Redirect non-admins
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  // Queries
  const users = useQuery(api.auth.listUsers, token ? { token } : "skip");

  // Mutations
  const setAdminStatus = useMutation(api.auth.setAdminStatus);

  // Filter users by search
  const filteredUsers = users?.filter((user) => {
    const search = searchTerm.toLowerCase();
    return (
      user.email.toLowerCase().includes(search) ||
      user.name?.toLowerCase().includes(search)
    );
  });

  const handleToggleAdmin = async (userId: Id<"profiles">, currentIsAdmin: boolean) => {
    if (!token) return;
    
    setTogglingAdmin(userId);
    try {
      await setAdminStatus({
        token,
        userId,
        isAdmin: !currentIsAdmin,
      });
      toast.success(currentIsAdmin ? "Admin removed" : "Admin granted");
    } catch (err: any) {
      toast.error(err.message || "Failed to update admin status");
    } finally {
      setTogglingAdmin(null);
    }
  };

  const handleManageUser = async (user: { _id: string; email: string; name?: string }) => {
    try {
      await startImpersonation(user._id as Id<"profiles">);
      toast.success(`Now viewing as ${user.name || user.email}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to start impersonation");
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("ro-RO", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Users className="h-7 w-7 text-blue-600" />
            User Management
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage users and provide support
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-sm">
            {users?.length || 0} users
          </Badge>
        </div>
      </div>

      {/* Impersonation Warning */}
      {isImpersonating && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3">
            <p className="text-amber-800 text-sm">
              ⚠️ You are currently viewing as another user. Changes will affect their account.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <Card>
        <CardContent className="py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users by email or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Users List */}
      {!users ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ) : filteredUsers && filteredUsers.length > 0 ? (
        <div className="space-y-3">
          {filteredUsers.map((user) => (
            <Card
              key={user._id}
              className={`overflow-hidden ${
                user.isAdmin ? "border-l-4 border-l-purple-500" : ""
              }`}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                      {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                    </div>
                    
                    {/* Info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{user.name || "No name"}</p>
                        {user.isAdmin && (
                          <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" />
                          {user.email}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(user.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleManageUser(user)}
                      className="gap-1.5"
                    >
                      <Eye className="h-4 w-4" />
                      View As
                    </Button>
                    <Button
                      variant={user.isAdmin ? "ghost" : "outline"}
                      size="sm"
                      onClick={() => handleToggleAdmin(user._id as Id<"profiles">, user.isAdmin)}
                      disabled={togglingAdmin === user._id}
                      className={`gap-1.5 ${
                        user.isAdmin 
                          ? "text-red-600 hover:text-red-700 hover:bg-red-50" 
                          : ""
                      }`}
                    >
                      {togglingAdmin === user._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : user.isAdmin ? (
                        <ShieldOff className="h-4 w-4" />
                      ) : (
                        <Shield className="h-4 w-4" />
                      )}
                      {user.isAdmin ? "Remove Admin" : "Make Admin"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <UserCog className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-medium text-lg mb-2">No Users Found</h3>
              <p className="text-muted-foreground">
                {searchTerm
                  ? "No users match your search criteria."
                  : "No users registered yet."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
