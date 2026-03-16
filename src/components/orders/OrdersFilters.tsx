import { useRef, useEffect } from "react";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Card, CardContent } from "../ui/Card";
import { 
  Search, 
  AlertTriangle, 
  Filter, 
  Columns, 
  Check, 
  Hourglass, 
  Printer, 
  X,
  RotateCcw,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { ColumnVisibility, COLUMN_LABELS } from "./types";

interface OrdersFiltersProps {
  // Date filters
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onApplyDateFilter: () => void;
  onClearDateFilter: () => void;
  isDateFilterDirty: boolean;
  hasDateFilterApplied: boolean;
  
  // Status filters
  statusFilter: string;
  fulfillmentFilter: string;
  deliveryStatusFilter: string;
  onStatusFilterChange: (status: string) => void;
  onFulfillmentFilterChange: (status: string) => void;
  onDeliveryStatusFilterChange: (status: string) => void;
  
  // Spam filter
  spamOnly: boolean;
  spamCount: number;
  onSpamOnlyChange: (spamOnly: boolean) => void;
  
  // Search
  search: string;
  onSearchChange: (search: string) => void;
  
  // Document filter
  docFilter: string;
  onDocFilterChange: (filter: string) => void;
  
  // Worked count
  workedCount: number;
  
  // Column visibility
  visibleColumns: ColumnVisibility;
  onVisibleColumnsChange: (columns: ColumnVisibility) => void;
  
  // Results
  displayedCount: number;
  filteredCount: number;
  totalCount: number;
  canLoadMore?: boolean;
  
  // Reset
  onResetFilters: () => void;
  hasActiveFilters: boolean;
}

export function OrdersFilters({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApplyDateFilter,
  onClearDateFilter,
  isDateFilterDirty,
  hasDateFilterApplied,
  statusFilter,
  fulfillmentFilter,
  deliveryStatusFilter,
  onStatusFilterChange,
  onFulfillmentFilterChange,
  onDeliveryStatusFilterChange,
  spamOnly,
  spamCount,
  onSpamOnlyChange,
  search,
  onSearchChange,
  docFilter,
  onDocFilterChange,
  workedCount,
  visibleColumns,
  onVisibleColumnsChange,
  displayedCount,
  filteredCount,
  totalCount,
  canLoadMore,
  onResetFilters,
  hasActiveFilters,
}: OrdersFiltersProps) {
  const docFilterRef = useRef<HTMLDivElement>(null);
  const columnDropdownRef = useRef<HTMLDivElement>(null);
  
  const [showDocFilterDropdown, setShowDocFilterDropdown] = React.useState(false);
  const [showColumnDropdown, setShowColumnDropdown] = React.useState(false);
  
  // Close dropdowns on click outside
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
  
  const getDocFilterLabel = () => {
    switch (docFilter) {
      case "all": return "All Orders";
      case "worked": return "✅ Lucrate";
      case "not_worked": return "⏳ Nelucrate";
      case "fulfilled": return "📦 Fulfilled";
      case "unfulfilled": return "📭 Unfulfilled";
      case "returned": return "🔄 Returnate";
      case "not_returned": return "📦 Nereturnate";
      case "printed": return "🖨️ Printed";
      case "not_printed": return "❌ Not Printed";
      case "awb_only": return "AWB Only";
      case "invoice_only": return "Invoice Only";
      case "awb_and_invoice": return "AWB + Invoice";
      case "no_documents": return "No Documents";
      default: return "All Orders";
    }
  };
  const visibleColumnLabels = COLUMN_LABELS.filter((col) => col.key !== "worked");

  return (
    <Card className="sticky top-0 z-30 bg-background shadow-sm">
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4">
          {/* Date Range */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">📅 Date Range</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                className="w-40"
              />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                className="w-40"
              />
              <Button
                size="sm"
                onClick={onApplyDateFilter}
                disabled={!isDateFilterDirty}
              >
                Filtreaza
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onClearDateFilter}
                disabled={!hasDateFilterApplied && !startDate && !endDate}
              >
                Clear Date
              </Button>
            </div>
            
            {/* Spam Detection */}
            <label className="flex items-center gap-2 cursor-pointer ml-auto">
              <span className="text-sm font-medium flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Spam Detection
              </span>
              <input
                type="checkbox"
                checked={spamOnly}
                onChange={(e) => onSpamOnlyChange(e.target.checked)}
                className="rounded border-input h-4 w-4"
              />
              <span className="text-sm text-muted-foreground">
                Show only potential spam ({spamCount} orders)
              </span>
            </label>
          </div>
          
          {/* Status filters */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">🚚 Delivery Status</span>
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
            
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">📦 Fulfillment Status</span>
              <select
                value={fulfillmentFilter}
                onChange={(e) => onFulfillmentFilterChange(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[150px]"
              >
                <option value="">All Statuses</option>
                <option value="unfulfilled">Unfulfilled</option>
                <option value="fulfilled">Fulfilled</option>
                <option value="partial">Partial</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => onStatusFilterChange(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[120px]"
              >
                <option value="">All</option>
                <option value="ready">Ready</option>
                <option value="on_hold">On Hold</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          
          {/* Search + Doc Filter + Column Toggle */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Caută comenzi, clienți, SKU-uri, notițe..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9"
              />
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
                <div className="absolute right-0 top-full mt-1 w-56 bg-background border rounded-md shadow-lg z-50">
                  <div className="p-1">
                    {[
                      { value: "all", label: "All Orders", icon: null },
                      { value: "divider1", label: "", icon: null },
                      { value: "worked", label: "✅ Lucrate", icon: null },
                      { value: "not_worked", label: "Nelucrate", icon: <Hourglass className="h-4 w-4" /> },
                      { value: "divider1b", label: "", icon: null },
                      { value: "fulfilled", label: "📦 Fulfilled (Shopify)", icon: null, className: "text-green-600" },
                      { value: "unfulfilled", label: "📭 Unfulfilled", icon: null, className: "text-orange-600" },
                      { value: "divider1c", label: "", icon: null },
                      { value: "returned", label: "Returnate", icon: <RotateCcw className="h-4 w-4" />, className: "text-orange-600" },
                      { value: "not_returned", label: "Nereturnate", icon: null },
                      { value: "divider2", label: "", icon: null },
                      { value: "printed", label: "Printed (has docs)", icon: <Printer className="h-4 w-4" /> },
                      { value: "not_printed", label: "Not Printed", icon: <X className="h-4 w-4" />, className: "text-red-600" },
                      { value: "divider3", label: "", icon: null },
                      { value: "awb_only", label: "AWB Only", icon: null },
                      { value: "invoice_only", label: "Invoice Only", icon: null },
                      { value: "awb_and_invoice", label: "AWB + Invoice", icon: null },
                      { value: "no_documents", label: "No Documents", icon: null },
                    ].map((item, idx) => {
                      if (item.value.startsWith("divider")) {
                        return <hr key={idx} className="my-1" />;
                      }
                      return (
                        <button
                          key={item.value}
                          onClick={() => { onDocFilterChange(item.value); setShowDocFilterDropdown(false); }}
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex items-center gap-2",
                            docFilter === item.value && "bg-muted",
                            item.className
                          )}
                        >
                          {docFilter === item.value && <Check className="h-4 w-4" />}
                          {item.icon}
                          {item.label}
                        </button>
                      );
                    })}
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
                              worked: false, stockDeducted: true, fulfilled: true, docs: true, actions: true, orderNumber: true,
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
                      {visibleColumnLabels.map(col => (
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
          <div className="text-sm text-muted-foreground">
            <strong>Search Results:</strong> {displayedCount} of {filteredCount} orders
            {canLoadMore && ` (${totalCount} încărcate, mai multe disponibile)`}
            {!canLoadMore && totalCount !== filteredCount && ` (din ${totalCount} total)`}
            {docFilter !== "all" && ` • filtru activ`}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Need to import React for useState
import React from "react";
