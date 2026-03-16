import { useState } from "react";
import { Navigate } from "react-router-dom";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "../../contexts/AuthContext";
import { useImpersonation } from "../../contexts/ImpersonationContext";
import type { InvoicePeriod } from "./types";
import { UserInvoiceDetail } from "./UserInvoiceDetail";
import { UsersList } from "./UsersList";
import { getDefaultBiMonthlyPeriod } from "./utils";

export function InvoicesPage() {
  const { token } = useAuth();
  const { realUser } = useImpersonation();
  const isAdmin = realUser?.isAdmin || false;

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<Id<"profiles"> | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<InvoicePeriod>(getDefaultBiMonthlyPeriod);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (selectedUserId) {
    return (
      <UserInvoiceDetail
        token={token}
        userId={selectedUserId}
        period={selectedPeriod}
        setPeriod={setSelectedPeriod}
        onBack={() => setSelectedUserId(null)}
      />
    );
  }

  return (
    <UsersList
      token={token}
      searchTerm={searchTerm}
      setSearchTerm={setSearchTerm}
      onSelectUser={(id) => setSelectedUserId(id)}
    />
  );
}
