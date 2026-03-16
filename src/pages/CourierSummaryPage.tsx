import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../contexts/AuthContext";
import { useImpersonation } from "../contexts/ImpersonationContext";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import {
  Upload,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Download,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Banknote,
  User,
  Users,
  XCircle,
  History,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// ============================================
// TYPES
// ============================================

interface CourierRow {
  awbNumber: string;
  status: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  pickupAddress: string;
  serviceType: string;
  codAmount: number;
  weight: string;
  date: string;
  notes: string;
}

interface AddressGroup {
  address: string;
  total: number;
  rows: CourierRow[];
  matchedUser?: string | null;
}

interface SaveResult {
  address: string;
  matchedUser: string | null;
  total: number;
  orderCount: number;
  updated: boolean;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const parseNumericValue = (value: any): number => {
  if (value === null || value === undefined || value === "") return 0;

  let stringValue = String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(/RON/gi, "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");

  return parseFloat(stringValue) || 0;
};

const normalizeAddress = (value: any): string => {
  if (!value) return "";
  return String(value).trim();
};

const normalizeAddressForMatch = (value: string): string => {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
};

const formatCurrency = (value: number, currency: string = "RON"): string => {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
};

const processSheet = (
  worksheet: XLSX.WorkSheet
): { groups: AddressGroup[]; grandTotal: number; totalRows: number } => {
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:Z1000");
  const groups = new Map<string, { total: number; rows: CourierRow[] }>();
  let grandTotal = 0;
  let totalRows = 0;

  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const columnCells: any[] = [];
    for (let col = 0; col <= 10; col++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
      columnCells.push(cell ? cell.v : "");
    }

    const pickupAddress = normalizeAddress(columnCells[5]);
    if (!pickupAddress) continue;

    const codAmount = parseNumericValue(columnCells[7]);
    grandTotal += codAmount;
    totalRows++;

    const courierRow: CourierRow = {
      awbNumber: String(columnCells[0] || ""),
      status: String(columnCells[1] || ""),
      recipientName: String(columnCells[2] || ""),
      recipientPhone: String(columnCells[3] || ""),
      recipientAddress: String(columnCells[4] || ""),
      pickupAddress,
      serviceType: String(columnCells[6] || ""),
      codAmount,
      weight: String(columnCells[8] || ""),
      date: String(columnCells[9] || ""),
      notes: String(columnCells[10] || ""),
    };

    if (!groups.has(pickupAddress)) {
      groups.set(pickupAddress, { total: 0, rows: [] });
    }
    const group = groups.get(pickupAddress)!;
    group.total += codAmount;
    group.rows.push(courierRow);
  }

  const sortedGroups = Array.from(groups.entries())
    .map(([address, data]) => ({
      address,
      total: data.total,
      rows: data.rows,
    }))
    .sort((a, b) => b.total - a.total);

  return { groups: sortedGroups, grandTotal, totalRows };
};

// ============================================
// COMPONENT
// ============================================

export function CourierSummaryPage() {
  const { token, user } = useAuth();
  const { realUser } = useImpersonation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use realUser.isAdmin (works even when impersonating)
  const isAdmin = realUser?.isAdmin || false;

  // State
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [addressGroups, setAddressGroups] = useState<AddressGroup[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [expandedAddresses, setExpandedAddresses] = useState<Set<string>>(new Set());
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveResults, setSaveResults] = useState<SaveResult[] | null>(null);

  // Sheet selection
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [showSheetSelector, setShowSheetSelector] = useState(false);

  // Queries
  const usersWithAddresses = useQuery(
    api.courierRevenue.getAllUsersWithPickupAddress,
    token && isAdmin ? { token } : "skip" // Only admins need this
  );
  
  // Get current user's settings (for non-admins to see their pickup address)
  const userSettings = useQuery(
    api.settings.get,
    token ? { token } : "skip"
  );
  const userPickupAddress = userSettings?.courierPickupAddress;

  // Get saved revenue history (so users can see data uploaded by admin or webhook)
  const savedRevenue = useQuery(
    api.courierRevenue.getRecentForDashboard,
    token ? { token, days: 90 } : "skip"
  );

  // Mutations
  const adminSaveRevenue = useMutation(api.courierRevenue.adminSaveRevenueForUsers);
  const userSaveRevenue = useMutation(api.courierRevenue.saveDailyRevenue);

  // Build address to user map for display
  const addressToUserMap = new Map<string, { email: string; name?: string }>();
  if (usersWithAddresses) {
    for (const u of usersWithAddresses) {
      addressToUserMap.set(normalizeAddressForMatch(u.pickupAddress), { email: u.email, name: u.name });
    }
  }

  // Auto-save processed groups to matched users
  const autoSaveGroups = async (groups: AddressGroup[]) => {
    if (!token || groups.length === 0) return;

    setIsSaving(true);
    try {
      const today = new Date().toISOString().split("T")[0];

      if (isAdmin) {
        const result = await adminSaveRevenue({
          token,
          date: today,
          groups: groups.map((g) => ({
            address: g.address,
            total: g.total,
            orderCount: g.rows.length,
          })),
        });

        setSaveResults(result.results);

        const total = (result.newCount || 0) + (result.updatedCount || 0);
        if (total > 0) {
          toast.success(
            `Auto-saved: ${result.newCount || 0} new, ${result.updatedCount || 0} updated. ${result.unmatchedCount} unmatched.`
          );
        } else {
          toast.warning("No addresses matched to any users.");
        }
      } else {
        const result = await userSaveRevenue({
          token,
          date: today,
          groups: groups.map((g) => ({
            address: g.address,
            total: g.total,
            orderCount: g.rows.length,
          })),
        });

        if (result.recordsInserted > 0) {
          toast.success(`Auto-saved ${result.recordsInserted} record(s) to your account.`);
        } else {
          toast.warning("No data was saved.");
        }
      }
    } catch (err) {
      console.error("Failed to auto-save:", err);
      toast.error("Failed to auto-save revenue data");
    } finally {
      setIsSaving(false);
    }
  };

  // Process selected sheet
  const processSelectedSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const worksheet = wb.Sheets[sheetName];
    if (!worksheet) {
      setError("Sheet not found");
      return;
    }

    const result = processSheet(worksheet);
    
    // For non-admins: filter to only their pickup address
    let filteredGroups = result.groups;
    let filteredTotal = result.grandTotal;
    let filteredRows = result.totalRows;
    
    if (!isAdmin && userPickupAddress) {
      const normalizedUserAddress = userPickupAddress.toLowerCase().trim();
      filteredGroups = result.groups.filter((g) => 
        g.address.toLowerCase().trim() === normalizedUserAddress
      );
      filteredTotal = filteredGroups.reduce((sum, g) => sum + g.total, 0);
      filteredRows = filteredGroups.reduce((sum, g) => sum + g.rows.length, 0);
    }
    
    // Add matched user info to groups
    const groupsWithUsers = filteredGroups.map((g) => ({
      ...g,
      matchedUser: isAdmin
        ? (addressToUserMap.get(normalizeAddressForMatch(g.address))?.email || null)
        : userPickupAddress && normalizeAddressForMatch(g.address) === normalizeAddressForMatch(userPickupAddress)
          ? (user?.email || "You")
          : null,
    }));

    setAddressGroups(groupsWithUsers);
    setGrandTotal(filteredTotal);
    setTotalRows(filteredRows);
    setShowSheetSelector(false);
    setError(null);
    setSaveResults(null);

    // Auto-save immediately after processing
    autoSaveGroups(groupsWithUsers);
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      toast.error("Please upload an Excel file (.xlsx or .xls)");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setCurrentFileName(file.name);
    setSaveResults(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      setWorkbook(wb);
      setAvailableSheets(wb.SheetNames);

      const expeditiiSheet = wb.SheetNames.find(
        (name) => name.toLowerCase().includes("expeditii") || name.toLowerCase().includes("expeditie")
      );

      if (expeditiiSheet) {
        setSelectedSheet(expeditiiSheet);
        processSelectedSheet(wb, expeditiiSheet);
        toast.success(`Processed sheet "${expeditiiSheet}"`);
      } else if (wb.SheetNames.length === 1) {
        setSelectedSheet(wb.SheetNames[0]);
        processSelectedSheet(wb, wb.SheetNames[0]);
        toast.success(`Processed sheet "${wb.SheetNames[0]}"`);
      } else {
        setShowSheetSelector(true);
        toast.info("Multiple sheets found. Please select one.");
      }
    } catch (err) {
      console.error("Error processing file:", err);
      setError("Failed to process Excel file. Please check the format.");
      toast.error("Failed to process file");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Save revenue data
  const handleSaveToUsers = async () => {
    if (!token || addressGroups.length === 0) return;

    setIsSaving(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      
      if (isAdmin) {
        // Admin: save to matched users
        const result = await adminSaveRevenue({
          token,
          date: today,
          groups: addressGroups.map((g) => ({
            address: g.address,
            total: g.total,
            orderCount: g.rows.length,
          })),
        });

        setSaveResults(result.results);
        
        const total = (result.newCount || 0) + (result.updatedCount || 0);
        if (total > 0) {
          toast.success(
            `Saved ${result.newCount || 0} new, updated ${result.updatedCount || 0}. ${result.unmatchedCount} unmatched.`
          );
        } else {
          toast.warning("No addresses matched to any users.");
        }
      } else {
        // Non-admin: save to own account
        const result = await userSaveRevenue({
          token,
          date: today,
          groups: addressGroups.map((g) => ({
            address: g.address,
            total: g.total,
            orderCount: g.rows.length,
          })),
        });

        if (result.recordsInserted > 0) {
          toast.success(`Saved ${result.recordsInserted} record(s) to your account.`);
        } else {
          toast.warning("No data was saved.");
        }
      }
    } catch (err) {
      console.error("Failed to save:", err);
      toast.error("Failed to save revenue data");
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle address expansion
  const toggleAddress = (address: string) => {
    const newExpanded = new Set(expandedAddresses);
    if (newExpanded.has(address)) {
      newExpanded.delete(address);
    } else {
      newExpanded.add(address);
    }
    setExpandedAddresses(newExpanded);
  };

  // Export to CSV
  const exportTotalsCSV = () => {
    if (addressGroups.length === 0) return;

    const headers = ["Pickup Address", "Matched User", "Total COD (RON)", "Order Count"];
    const rows = addressGroups.map((g) => [
      `"${g.address}"`,
      g.matchedUser || "No match",
      g.total.toFixed(2),
      g.rows.length,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
      "",
      `Grand Total,,${grandTotal.toFixed(2)},${totalRows}`,
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `courier_summary_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  // Clear data
  const clearData = () => {
    setAddressGroups([]);
    setGrandTotal(0);
    setTotalRows(0);
    setCurrentFileName(null);
    setWorkbook(null);
    setSelectedSheet("");
    setShowSheetSelector(false);
    setExpandedAddresses(new Set());
    setSaveResults(null);
  };

  const matchedCount = addressGroups.filter((g) => g.matchedUser).length;
  const unmatchedCount = addressGroups.filter((g) => !g.matchedUser).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Banknote className="h-7 w-7 text-green-600" />
            Courier COD Summary
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Upload Sameday export and distribute COD data to users
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="gap-2"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload XLSX
          </Button>
          {addressGroups.length > 0 && (
            <>
              {saveResults ? (
                <Button
                  onClick={handleSaveToUsers}
                  disabled={isSaving || (isAdmin ? matchedCount === 0 : addressGroups.length === 0)}
                  variant="outline"
                  className="gap-2 border-green-300 text-green-700 hover:bg-green-50"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {isAdmin ? `Re-save to Users (${matchedCount})` : "Re-save My Data"}
                </Button>
              ) : (
                <Button
                  onClick={handleSaveToUsers}
                  disabled={isSaving || (isAdmin ? matchedCount === 0 : addressGroups.length === 0)}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                  {isAdmin ? `Save to Users (${matchedCount})` : "Save My Data"}
                </Button>
              )}
              <Button variant="outline" onClick={exportTotalsCSV} className="gap-2">
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={clearData} className="gap-2 text-muted-foreground">
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Info Card */}
      <Card className={isAdmin ? "border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50"}>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Users className={`h-5 w-5 mt-0.5 ${isAdmin ? "text-blue-600" : "text-amber-600"}`} />
            <div className="flex-1">
              {isAdmin ? (
                <>
                  <p className="font-medium text-blue-800">Admin Mode - User Matching</p>
                  <p className="text-sm text-blue-700 mt-1">
                    Upload a Sameday export file. Addresses will be matched to users who have configured that pickup address in Settings.
                  </p>
                </>
              ) : userPickupAddress ? (
                <>
                  <p className="font-medium text-amber-800">Your Pickup Address</p>
                  <p className="text-sm text-amber-700 mt-1">
                    Showing data for: <strong>{userPickupAddress}</strong>
                  </p>
                  <p className="text-sm text-amber-600 mt-1">
                    Only orders from your configured pickup address will be displayed and saved.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-amber-800">Setup Required</p>
                  <p className="text-sm text-amber-700 mt-1">
                    Please configure your "Punct de Ridicare" (Pickup Address) in Settings to filter your orders.
                  </p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users with Pickup Addresses (Admin only) */}
      {isAdmin && usersWithAddresses && usersWithAddresses.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              Configured Pickup Addresses
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {usersWithAddresses.map((u) => (
                <div
                  key={u.userId}
                  className="px-3 py-1.5 bg-muted rounded-lg text-sm flex items-center gap-2"
                >
                  <span className="font-medium">{u.name || u.email}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {u.pickupAddress}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current File Info */}
      {currentFileName && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <p className="font-medium text-green-800">{currentFileName}</p>
                <p className="text-sm text-green-700">
                  Sheet: {selectedSheet} • {totalRows} rows • {addressGroups.length} addresses
                </p>
              </div>
              <div className="flex gap-2">
                <Badge variant="default" className="bg-green-600">
                  {matchedCount} matched
                </Badge>
                {unmatchedCount > 0 && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                    {unmatchedCount} unmatched
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Results */}
      {saveResults && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              Save Results
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1">
              {saveResults.map((r, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between px-3 py-2 rounded text-sm ${
                    r.matchedUser 
                      ? r.updated 
                        ? "bg-blue-100" 
                        : "bg-green-100"
                      : "bg-amber-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {r.matchedUser ? (
                      <CheckCircle2 className={`h-4 w-4 ${r.updated ? "text-blue-600" : "text-green-600"}`} />
                    ) : (
                      <XCircle className="h-4 w-4 text-amber-500" />
                    )}
                    <span className="max-w-[300px] truncate">{r.address}</span>
                    {r.updated && (
                      <span className="text-xs bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded">
                        Updated
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">
                      {r.matchedUser || "No user match"}
                    </span>
                    <span className="font-medium text-green-700">
                      {formatCurrency(r.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sheet Selector */}
      {showSheetSelector && workbook && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Select Sheet</CardTitle>
            <CardDescription>Multiple sheets found. Choose one to process:</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {availableSheets.map((sheetName) => (
                <Button
                  key={sheetName}
                  variant={selectedSheet === sheetName ? "default" : "outline"}
                  onClick={() => {
                    setSelectedSheet(sheetName);
                    processSelectedSheet(workbook, sheetName);
                  }}
                >
                  {sheetName}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <p className="text-red-800">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grand Total */}
      {addressGroups.length > 0 && (
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700 mb-1">Grand Total COD</p>
                <p className="text-4xl font-bold text-green-800">{formatCurrency(grandTotal)}</p>
                <p className="text-sm text-green-600 mt-1">
                  {matchedCount} matched • {unmatchedCount} unmatched • {totalRows} orders
                </p>
              </div>
              <div className="p-4 rounded-full bg-green-100">
                <Banknote className="h-10 w-10 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Address Groups */}
      {addressGroups.length > 0 ? (
        <div className="space-y-3">
          {addressGroups.map((group) => (
            <Card
              key={group.address}
              className={`overflow-hidden ${
                group.matchedUser
                  ? "border-l-4 border-l-green-500"
                  : "border-l-4 border-l-amber-400"
              }`}
            >
              <button
                onClick={() => toggleAddress(group.address)}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className={`p-2 rounded-lg ${
                      group.matchedUser ? "bg-green-100" : "bg-amber-100"
                    }`}
                  >
                    <MapPin
                      className={`h-4 w-4 ${
                        group.matchedUser ? "text-green-600" : "text-amber-600"
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{group.address}</p>
                    <p className="text-sm text-muted-foreground">
                      {group.rows.length} orders •{" "}
                      {group.matchedUser ? (
                        <span className="text-green-600 font-medium">
                          → {group.matchedUser}
                        </span>
                      ) : (
                        <span className="text-amber-600">No user match</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-bold text-lg">{formatCurrency(group.total)}</p>
                  {expandedAddresses.has(group.address) ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Expanded Details */}
              {expandedAddresses.has(group.address) && (
                <div className="border-t bg-muted/20">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left py-2.5 px-4 font-medium">AWB</th>
                          <th className="text-left py-2.5 px-4 font-medium">Status</th>
                          <th className="text-left py-2.5 px-4 font-medium">Recipient</th>
                          <th className="text-left py-2.5 px-4 font-medium">Phone</th>
                          <th className="text-right py-2.5 px-4 font-medium">COD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row, idx) => (
                          <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2.5 px-4 font-mono text-xs">{row.awbNumber}</td>
                            <td className="py-2.5 px-4">
                              <Badge variant="secondary" className="text-xs">
                                {row.status || "N/A"}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-4">{row.recipientName}</td>
                            <td className="py-2.5 px-4 text-muted-foreground">
                              {row.recipientPhone}
                            </td>
                            <td className="py-2.5 px-4 text-right font-medium">
                              {formatCurrency(row.codAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/40 font-medium">
                          <td colSpan={4} className="py-2.5 px-4">
                            Total
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold">
                            {formatCurrency(group.total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : !savedRevenue || savedRevenue.history.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-medium text-lg mb-2">No Data Yet</h3>
              <p className="text-muted-foreground mb-4">
                Upload a Sameday XLSX export to process COD data and distribute to users.
              </p>
              <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
                <Upload className="h-4 w-4" />
                Upload XLSX File
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ============================================ */}
      {/* SAVED REVENUE HISTORY                        */}
      {/* ============================================ */}
      {savedRevenue && savedRevenue.history.length > 0 && (
        <div className="space-y-4">
          {/* History Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <History className="h-5 w-5 text-green-600" />
              Your Saved COD Revenue
            </h2>
            <Badge variant="secondary" className="text-sm">
              {savedRevenue.history.length} {savedRevenue.history.length === 1 ? "day" : "days"}
            </Badge>
          </div>

          {/* Grand Total Card */}
          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
            <CardContent className="py-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-700 mb-1">Total COD Revenue (Last 90 days)</p>
              <p className="text-3xl font-bold text-green-800">{formatCurrency(savedRevenue.grandTotal, "RON")}</p>
              {!!savedRevenue.grandTotalsByCurrency && (
                <div className="mt-2 text-xs text-green-700 space-y-0.5">
                  {Object.entries(savedRevenue.grandTotalsByCurrency).map(([currency, amount]) => (
                    <div key={currency}>
                      {currency}: {formatCurrency(amount as number, currency)}
                    </div>
                  ))}
                </div>
              )}
                </div>
                <div className="p-3 rounded-full bg-green-100">
                  <Banknote className="h-8 w-8 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Revenue by Date */}
          <div className="space-y-3">
            {savedRevenue.history.map((day) => (
              <Card key={day.date} className="overflow-hidden">
                <button
                  onClick={() => toggleAddress(`history-${day.date}`)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-100">
                      <Calendar className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {new Date(day.date + "T00:00:00").toLocaleDateString("ro-RO", {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {day.items.length} {day.items.length === 1 ? "address" : "addresses"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-bold text-lg text-green-700">{formatCurrency(day.totalCod, "RON")}</p>
                      {!!day.totalsByCurrency && (
                        <div className="text-[11px] text-muted-foreground">
                          {Object.entries(day.totalsByCurrency)
                            .map(([currency, amount]) => `${currency}: ${formatCurrency(amount as number, currency)}`)
                            .join(" · ")}
                        </div>
                      )}
                    </div>
                    {expandedAddresses.has(`history-${day.date}`) ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {expandedAddresses.has(`history-${day.date}`) && (
                  <div className="border-t bg-muted/20">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left py-2.5 px-4 font-medium">Address</th>
                            <th className="text-left py-2.5 px-4 font-medium">Notes</th>
                            <th className="text-right py-2.5 px-4 font-medium">COD Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {day.items.map((item, idx) => (
                            <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="py-2.5 px-4">
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                  <span className="truncate max-w-[300px]">{item.address}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-muted-foreground text-xs">
                                {item.notes || "—"}
                              </td>
                              <td className="py-2.5 px-4 text-right font-medium text-green-700">
                                {formatCurrency(item.totalCodAmount, item.currency || "RON")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-muted/40 font-medium">
                            <td colSpan={2} className="py-2.5 px-4">
                              Day Total
                            </td>
                            <td className="py-2.5 px-4 text-right font-bold text-green-700">
                              {formatCurrency(day.totalCod, "RON")}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
