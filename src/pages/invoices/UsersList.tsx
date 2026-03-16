import { useMemo } from "react";
import { useQuery } from "convex/react";
import { AlertCircle, DollarSign, FileText, Loader2, Package, Search } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { Badge } from "../../components/ui/Badge";
import { Card, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import type { UserBillingOverview } from "./types";

interface UsersListProps {
  token: string;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  onSelectUser: (id: Id<"profiles">) => void;
}

export function UsersList({ token, searchTerm, setSearchTerm, onSelectUser }: UsersListProps) {
  const users = useQuery(api.invoices.getAllUsersBillingOverview, {
    token,
  }) as UserBillingOverview[] | undefined;

  const filteredUsers = useMemo(() => {
    if (!users) return [] as UserBillingOverview[];
    const search = searchTerm.toLowerCase();
    return users
      .filter((user) => !user.isAdmin)
      .filter(
        (user) =>
          user.email.toLowerCase().includes(search) ||
          user.name?.toLowerCase().includes(search)
      );
  }, [users, searchTerm]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <FileText className="h-7 w-7 text-emerald-600" />
            Facturare
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Seteaza tarife si calculeaza facturi pentru fiecare utilizator
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {filteredUsers.length} utilizatori
        </Badge>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cauta utilizator dupa email sau nume..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {!users ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ) : filteredUsers.length > 0 ? (
        <div className="space-y-3">
          {filteredUsers.map((user) => (
            <Card
              key={user._id}
              className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onSelectUser(user._id as Id<"profiles">)}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg">
                      {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold">{user.name || "Fara nume"}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {user.pricePerOrder !== null ? (
                      <Badge variant="success" className="gap-1">
                        <DollarSign className="h-3 w-3" />
                        {user.pricePerOrder} lei/comanda
                      </Badge>
                    ) : (
                      <Badge variant="warning" className="gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Pret nesetat
                      </Badge>
                    )}
                    {user.packagingRulesCount > 0 && (
                      <Badge variant="info" className="gap-1">
                        <Package className="h-3 w-3" />
                        {user.packagingRulesCount} reguli ambalare
                      </Badge>
                    )}
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
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-medium text-lg mb-2">Niciun utilizator gasit</h3>
              <p className="text-muted-foreground">
                {searchTerm
                  ? "Niciun utilizator nu corespunde cautarii."
                  : "Nu exista utilizatori inregistrati."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
