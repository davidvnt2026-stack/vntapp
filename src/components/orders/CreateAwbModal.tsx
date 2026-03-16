import { useState, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { 
  X, 
  Truck, 
  Loader2, 
  PackageCheck,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface SamedayService {
  id: number;
  name: string;
  code: string;
  isCrossborder?: boolean;
  deliveryType?: string;
  serviceOptionalTaxes?: Array<{
    id: number;
    name: string;
    code: string;
    packageType?: number;
  }>;
}

interface AwbOptions {
  serviceId: number;
  openPackage: boolean;
  serviceTaxIds: number[]; // Legacy
  serviceTaxes: Array<{ id: number; code: string }>; // Tax with code for proper formatting
}

interface CreateAwbModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (options: AwbOptions) => void;
  orderCount: number;
  isProcessing?: boolean;
  token: string;
  // Auto-enable open package if customer requested it (from Shopify note_attributes)
  defaultOpenPackage?: boolean;
  openPackageRequestedCount?: number; // How many orders requested open package
}

export function CreateAwbModal({
  isOpen,
  onClose,
  onConfirm,
  orderCount,
  isProcessing = false,
  token,
  defaultOpenPackage = false,
  openPackageRequestedCount = 0,
}: CreateAwbModalProps) {
  const [services, setServices] = useState<SamedayService[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  
  // Form state
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [openPackage, setOpenPackage] = useState(defaultOpenPackage);
  
  const getServices = useAction(api.sameday.getServices);

  // Reset openPackage when defaultOpenPackage changes (e.g., when modal opens with new order)
  useEffect(() => {
    if (isOpen) {
      setOpenPackage(defaultOpenPackage);
    }
  }, [isOpen, defaultOpenPackage]);

  // Fetch services when modal opens
  useEffect(() => {
    if (isOpen && services.length === 0 && !isLoadingServices) {
      fetchServices();
    }
  }, [isOpen]);

  const fetchServices = async () => {
    setIsLoadingServices(true);
    setServiceError(null);
    try {
      const result = await getServices({ token });
      setServices(result);
      // Auto-select first service if available
      if (result.length > 0 && !selectedServiceId) {
        setSelectedServiceId(result[0].id);
      }
    } catch (error) {
      setServiceError(error instanceof Error ? error.message : "Eroare la încărcarea serviciilor");
    } finally {
      setIsLoadingServices(false);
    }
  };

  const handleConfirm = () => {
    if (!selectedServiceId) return;
    
    // Find the selected service to get OD tax ID if openPackage is selected
    const selectedService = services.find(s => s.id === selectedServiceId);
    const serviceTaxIds: number[] = [];
    const serviceTaxes: Array<{ id: number; code: string }> = [];
    
    if (openPackage && selectedService?.serviceOptionalTaxes) {
      // Find OPCG/OD (Deschidere colet / Open Package) tax option
      // Check multiple possible codes and name patterns, and be flexible with packageType
      const opcgTax = selectedService.serviceOptionalTaxes.find(
        t => {
          const code = t.code?.toUpperCase() || "";
          const name = t.name?.toLowerCase() || "";
          // Match by code: OPCG, OD, OPEN
          const codeMatch = code === "OPCG" || code === "OD" || code.includes("OPEN");
          // Match by name: deschidere, verificare, open
          const nameMatch = name.includes("deschidere") || name.includes("verificare") || name.includes("open");
          // packageType should be 0 (parcel) or undefined/null (not envelope which is usually 1)
          const packageTypeOk = t.packageType === undefined || t.packageType === null || t.packageType === 0;
          return (codeMatch || nameMatch) && packageTypeOk;
        }
      );
      if (opcgTax) {
        serviceTaxIds.push(opcgTax.id);
        // Use the tax code returned by Sameday (e.g., "OPCG" or "OD").
        // Sending a mismatched code can trigger "Valoarea selectată este invalidă."
        serviceTaxes.push({ id: opcgTax.id, code: opcgTax.code || "OD" });
      }
    }
    
    onConfirm({
      serviceId: selectedServiceId,
      openPackage,
      serviceTaxIds,
      serviceTaxes,
    });
  };

  const selectedService = services.find(s => s.id === selectedServiceId);
  
  // Debug: log available taxes for the selected service
  if (selectedService?.serviceOptionalTaxes && selectedService.serviceOptionalTaxes.length > 0) {
    console.log(`Service ${selectedService.id} (${selectedService.name}) has taxes:`, selectedService.serviceOptionalTaxes);
  }
  
  // Check if OPCG/OD (Open Package) option is available for selected service
  const opcgTaxOption = selectedService?.serviceOptionalTaxes?.find(
    t => {
      const code = t.code?.toUpperCase() || "";
      const name = t.name?.toLowerCase() || "";
      const codeMatch = code === "OPCG" || code === "OD" || code.includes("OPEN");
      const nameMatch = name.includes("deschidere") || name.includes("verificare") || name.includes("open");
      const packageTypeOk = t.packageType === undefined || t.packageType === null || t.packageType === 0;
      return (codeMatch || nameMatch) && packageTypeOk;
    }
  );
  const hasOdTaxId = !!opcgTaxOption;

  // UX: If OD/OPCG isn't available for the selected service, don't allow enabling it
  const canOpenPackage = hasOdTaxId;

  useEffect(() => {
    if (!isOpen) return;
    if (openPackage && !canOpenPackage) {
      setOpenPackage(false);
    }
  }, [isOpen, selectedServiceId, canOpenPackage, openPackage]);
  
  // Debug: log if we found the OPCG tax
  if (selectedService && !hasOdTaxId && selectedService.serviceOptionalTaxes?.length) {
    console.warn("OPCG tax not found. Available taxes:", selectedService.serviceOptionalTaxes.map(t => ({ id: t.id, code: t.code, name: t.name, packageType: t.packageType })));
  }

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && !isProcessing && onClose()}
    >
      <Card 
        className="w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-emerald-500 text-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Truck className="h-6 w-6" />
              <h2 className="text-lg font-semibold">
                Generare AWB
                {orderCount > 1 && (
                  <span className="ml-2 text-sm font-normal opacity-90">
                    ({orderCount} comenzi)
                  </span>
                )}
              </h2>
            </div>
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="text-white/80 hover:text-white transition-colors disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {/* Steps indicator */}
          <div className="flex items-center gap-2 mt-4">
            <div className="flex items-center gap-2 bg-white/20 rounded-full px-4 py-1.5 text-sm font-medium">
              <span className="bg-white text-emerald-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                1
              </span>
              Courier
            </div>
          </div>
        </div>

        <CardContent className="p-6">
          {/* Service Type Selection */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Service Type
              </label>
              {isLoadingServices ? (
                <div className="flex items-center gap-2 text-gray-500 py-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Se încarcă serviciile...
                </div>
              ) : serviceError ? (
                <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-2 text-red-600 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    {serviceError}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={fetchServices}
                    className="text-red-600 hover:text-red-700"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <select
                  value={selectedServiceId || ""}
                  onChange={(e) => setSelectedServiceId(Number(e.target.value))}
                  disabled={isProcessing}
                  className={cn(
                    "w-full px-3 py-2.5 border border-gray-300 rounded-lg",
                    "focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500",
                    "disabled:bg-gray-100 disabled:cursor-not-allowed",
                    "text-gray-900"
                  )}
                >
                  {services.length === 0 ? (
                    <option value="">Niciun serviciu disponibil</option>
                  ) : (
                    services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                        {service.isCrossborder && " (Crossborder)"}
                      </option>
                    ))
                  )}
                </select>
              )}
              <p className="mt-1.5 text-xs text-gray-500">
                Alege tipul de serviciu pentru livrare
              </p>
            </div>

            {/* Checkboxes */}
            <div className="space-y-3 pt-2">
              {/* Open Package Option */}
              <label 
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  openPackage 
                    ? "border-emerald-500 bg-emerald-50" 
                    : "border-gray-200 hover:border-gray-300",
                  !canOpenPackage && "opacity-60 cursor-not-allowed",
                  isProcessing && "opacity-50 cursor-not-allowed"
                )}
              >
                <input
                  type="checkbox"
                  checked={openPackage}
                  onChange={(e) => setOpenPackage(e.target.checked)}
                  disabled={isProcessing || !canOpenPackage}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-gray-600" />
                    <span className="font-medium text-gray-900">
                      Customer can check products upon delivery
                    </span>
                    {openPackageRequestedCount > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        {openPackageRequestedCount === 1 
                          ? "Solicitat de client" 
                          : `${openPackageRequestedCount} comenzi au solicitat`}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Clientul poate verifica produsele la livrare înainte de a semna
                  </p>
                  {!canOpenPackage && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Opțiunea nu este disponibilă pentru serviciul selectat.
                    </p>
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isProcessing}
            >
              Anulează
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!selectedServiceId || isProcessing || isLoadingServices}
              className="bg-emerald-500 hover:bg-emerald-600 text-white min-w-[140px]"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Se generează...
                </>
              ) : (
                <>
                  <Truck className="h-4 w-4 mr-2" />
                  Generare AWB
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
