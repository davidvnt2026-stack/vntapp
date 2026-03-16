import { useRef, useEffect, useState } from "react";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card, CardContent } from "../../components/ui/Card";
import { Search, Filter, Columns, Check } from "lucide-react";
import { cn } from "../../lib/utils";
import { ColumnVisibility, COLUMN_LABELS } from "../../components/orders/types";

interface PickingListFiltersProps {
  search: string;
  onSearchChange: (search: string) => void;
  deliveryStatusFilter: string;
  onDeliveryStatusFilterChange: (status: string) => void;
  docFilters: string[];
  onToggleDocFilter: (filter: string) => void;
  onClearDocFilters: () => void;
  sortBy: "order_number" | "printed_time" | "awb_created_time" | "invoice_created_time";
  onSortByChange: (sortBy: "order_number" | "printed_time" | "awb_created_time" | "invoice_created_time") => void;
  workedCount: number;
  visibleColumns: ColumnVisibility;
  onVisibleColumnsChange: (columns: ColumnVisibility) => void;
  displayedCount: number;
  totalCount: number;
  onResetFilters: () => void;
  hasActiveFilters: boolean;
}

export function PickingListFilters({
  search,
  onSearchChange,
  deliveryStatusFilter,
  onDeliveryStatusFilterChange,
  docFilters,
  onToggleDocFilter,
  onClearDocFilters,
  sortBy,
  onSortByChange,
  workedCount,
  visibleColumns,
  onVisibleColumnsChange,
  displayedCount,
  totalCount,
  onResetFilters,
  hasActiveFilters,
}: PickingListFiltersProps) {
  const docFilterRef = useRef<HTMLDivElement>(null);
  const columnDropdownRef = useRef<HTMLDivElement>(null);
  const [showDocFilterDropdown, setShowDocFilterDropdown] = useState(false);
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (docFilterRef.current && !docFilterRef.current.contains(e.target as Node)) {
        setShowDocFilterDropdown(false);
      }
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(e.target as Node)) {
        setShowColumnDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const docFilterItems = [
    { value: "worked", label: "✅ Lucrate" },
    { value: "not_worked", label: "⏳ Nelucrate" },
    { value: "fulfilled", label: "📦 Fulfilled" },
    { value: "unfulfilled", label: "📭 Unfulfilled" },
    { value: "printed", label: "🖨️ Printed" },
    { value: "not_printed", label: "❌ Not Printed" },
    { value: "has_awb", label: "AWB existent" },
    { value: "no_awb", label: "Fără AWB" },
    { value: "has_invoice", label: "Factură existentă" },
    { value: "no_invoice", label: "Fără factură" },
    { value: "awb_only", label: "AWB Only" },
    { value: "invoice_only", label: "Invoice Only" },
    { value: "awb_and_invoice", label: "AWB + Invoice" },
    { value: "no_documents", label: "No Documents" },
  ] as const;

  const getDocFilterLabel = () => {
    if (docFilters.length === 0) return "All Orders";
    if (docFilters.length <= 2) {
      const labels = docFilterItems
        .filter((item) => docFilters.includes(item.value))
        .map((item) => item.label);
      return labels.join(" + ");
    }
    return `Filters (${docFilters.length})`;
  };

  return (
    <Card className="sticky top-0 z-30 bg-background shadow-sm">
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Caută comenzi, clienți, SKU-uri..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Delivery status filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Delivery Status</span>
            <select
              value={deliveryStatusFilter}
              onChange={(e) => onDeliveryStatusFilterChange(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[180px]"
            >
              <option value="">All Statuses</option>
              <option value="in_transit">În tranzit / Curier</option>
              <option value="delivered">Livrat cu succes</option>
              <option value="pending">Preluat / În așteptare</option>
              <option value="returned">Retur / Refuzat</option>
            </select>
          </div>

          {/* Sort order */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Sort By</span>
            <select
              value={sortBy}
              onChange={(e) =>
                onSortByChange(
                  e.target.value as "order_number" | "printed_time" | "awb_created_time" | "invoice_created_time"
                )
              }
              className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[220px]"
            >
              <option value="order_number">Order Number</option>
              <option value="printed_time">Printing Time (latest first)</option>
              <option value="awb_created_time">AWB Created Time (latest first)</option>
              <option value="invoice_created_time">Invoice Created Time (latest first)</option>
            </select>
          </div>

          {/* Document/Worked Filter Dropdown */}
          <div className="relative" ref={docFilterRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDocFilterDropdown(!showDocFilterDropdown)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              {getDocFilterLabel()}
            </Button>

            {showDocFilterDropdown && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-background border rounded-md shadow-lg z-50">
                <div className="p-1">
                  {docFilterItems.map((item) => (
                    <button
                      key={item.value}
                      onClick={() => onToggleDocFilter(item.value)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex items-center gap-2",
                        docFilters.includes(item.value) && "bg-muted"
                      )}
                    >
                      {docFilters.includes(item.value) && <Check className="h-4 w-4" />}
                      {item.label}
                    </button>
                  ))}
                  <hr className="my-1" />
                  <button
                    onClick={() => {
                      onClearDocFilters();
                      setShowDocFilterDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted"
                  >
                    Clear document filters
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Worked Counter Badge */}
          <Badge variant="outline" className="gap-1 text-green-600 border-green-300 bg-green-50">
            <Check className="h-3 w-3" />
            {workedCount} lucrate
          </Badge>

          {/* Column Toggle Dropdown */}
          <div className="relative" ref={columnDropdownRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowColumnDropdown(!showColumnDropdown)}
              className="gap-2"
            >
              <Columns className="h-4 w-4" />
              Columns
            </Button>

            {showColumnDropdown && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-background border rounded-md shadow-lg z-50 max-h-96 overflow-y-auto">
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">Toggle Columns</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          const allTrue: ColumnVisibility = {
                            worked: true, stockDeducted: true, fulfilled: true, docs: true, actions: true, orderNumber: true,
                            note: true, customer: true, phone: true, shippingAddress: true,
                            products: true, status: true, pickingList: true, openPackage: true, awbNumber: true, invoiceNumber: true,
                            placedOn: true, totalPrice: true, paymentMethod: true,
                          };
                          onVisibleColumnsChange(allTrue);
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        All
                      </button>
                      <button
                        onClick={() => {
                          const allFalse: ColumnVisibility = {
                            worked: false, stockDeducted: false, fulfilled: false, docs: false, actions: false, orderNumber: false,
                            note: false, customer: false, phone: false, shippingAddress: false,
                            products: false, status: false, pickingList: false, openPackage: false, awbNumber: false, invoiceNumber: false,
                            placedOn: false, totalPrice: false, paymentMethod: false,
                          };
                          onVisibleColumnsChange(allFalse);
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {COLUMN_LABELS.map(col => (
                      <label key={col.key} className="flex items-center gap-2 cursor-pointer py-1 px-2 rounded hover:bg-muted">
                        <input
                          type="checkbox"
                          checked={visibleColumns[col.key]}
                          onChange={(e) => onVisibleColumnsChange({ ...visibleColumns, [col.key]: e.target.checked })}
                          className="rounded border-input h-4 w-4"
                        />
                        <span className="text-sm">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={onResetFilters}>
              Resetează filtrele
            </Button>
          )}
        </div>

        {/* Results count */}
        <div className="text-sm text-muted-foreground mt-4">
          <strong>Orders:</strong> {displayedCount} of {totalCount}
          {docFilters.length > 0 && ` (filtered)`}
        </div>
      </CardContent>
    </Card>
  );
}
