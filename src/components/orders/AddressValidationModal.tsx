import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Card, CardContent } from "../ui/Card";
import { X, MapPin, Loader2, AlertCircle, CheckCircle2, ChevronDown, Check } from "lucide-react";
import { cn } from "../../lib/utils";

export interface InvalidAddress {
  orderId: string;
  orderNumber: string;
  customerName: string;
  country: string;
  county: string;
  city: string;
  postalCode: string;
  error: string;
}

interface AddressValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: (skippedOrderIds: string[]) => void;
  invalidAddresses: InvalidAddress[];
  token: string;
}

export function AddressValidationModal({
  isOpen,
  onClose,
  onContinue,
  invalidAddresses,
  token,
}: AddressValidationModalProps) {
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [searchResults, setSearchResults] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const [isSearching, setIsSearching] = useState<Record<string, boolean>>({});
  const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>({});

  // Refs for calculating fixed dropdown positions
  const inputWrapperRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [dropdownPositions, setDropdownPositions] = useState<Record<string, { top: number; left: number; width: number }>>({});

  const searchSamedayCity = useAction(api.sameday.searchSamedayCity as any) as (args: {
    token: string;
    county: string;
    countryCode?: string;
    name: string;
    postalCode?: string;
  }) => Promise<Array<{ id: string; name: string }>>;
  const updateOrderCity = useMutation(api.orders.updateShippingCity);

  // Calculate dropdown position from the input wrapper ref
  const updateDropdownPosition = useCallback((orderId: string) => {
    const el = inputWrapperRefs.current[orderId];
    if (el) {
      const rect = el.getBoundingClientRect();
      setDropdownPositions((prev) => ({
        ...prev,
        [orderId]: {
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
        },
      }));
    }
  }, []);

  // Trigger a search without updating the query text (used for auto-search on open)
  const triggerSearch = useCallback(
    async (orderId: string, query: string, county: string, countryCode: string, postalCode?: string) => {
      if (query.length < 2) {
        setSearchResults((prev) => ({ ...prev, [orderId]: [] }));
        return;
      }
      setIsSearching((prev) => ({ ...prev, [orderId]: true }));
      try {
        const results = await searchSamedayCity({ token, name: query, county, countryCode, postalCode });
        setSearchResults((prev) => ({ ...prev, [orderId]: results }));
      } catch (error) {
        console.error("Error searching city:", error);
      } finally {
        setIsSearching((prev) => ({ ...prev, [orderId]: false }));
      }
    },
    [searchSamedayCity, token]
  );

  useEffect(() => {
    if (isOpen) {
      setResolutions({});
      setSearchQueries({});
      setSearchResults({});
      setOpenDropdowns({});

      const initialQueries: Record<string, string> = {};
      invalidAddresses.forEach((addr) => {
        initialQueries[addr.orderId] = addr.city || "";
      });
      setSearchQueries(initialQueries);

      // Auto-trigger search for each address on open
      const timer = setTimeout(() => {
        invalidAddresses.forEach((addr) => {
          if (addr.city && addr.city.length >= 2) {
            triggerSearch(addr.orderId, addr.city, addr.county, addr.country, addr.postalCode);
          }
        });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, invalidAddresses, triggerSearch]);

  const handleSearch = async (
    orderId: string,
    query: string,
    county: string,
    countryCode: string,
    postalCode?: string
  ) => {
    setSearchQueries((prev) => ({ ...prev, [orderId]: query }));

    if (query.length < 2) {
      setSearchResults((prev) => ({ ...prev, [orderId]: [] }));
      setOpenDropdowns((prev) => ({ ...prev, [orderId]: false }));
      return;
    }

    setIsSearching((prev) => ({ ...prev, [orderId]: true }));
    try {
      const results = await searchSamedayCity({
        token,
        name: query,
        county,
        countryCode,
        postalCode,
      });
      setSearchResults((prev) => ({ ...prev, [orderId]: results }));
      setOpenDropdowns((prev) => ({ ...prev, [orderId]: true }));
      updateDropdownPosition(orderId);
    } catch (error) {
      console.error("Error searching city:", error);
    } finally {
      setIsSearching((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const handleSelectCity = (orderId: string, cityName: string) => {
    setResolutions((prev) => ({ ...prev, [orderId]: cityName }));
    setSearchQueries((prev) => ({ ...prev, [orderId]: cityName }));
    setOpenDropdowns((prev) => ({ ...prev, [orderId]: false }));
  };

  const handleToggleDropdown = (
    orderId: string,
    county: string,
    countryCode: string,
    postalCode?: string
  ) => {
    const isCurrentlyOpen = openDropdowns[orderId];
    if (isCurrentlyOpen) {
      setOpenDropdowns((prev) => ({ ...prev, [orderId]: false }));
    } else {
      // If we already have results, just open the dropdown
      if (searchResults[orderId]?.length > 0) {
        updateDropdownPosition(orderId);
        setOpenDropdowns((prev) => ({ ...prev, [orderId]: true }));
      } else {
        // Trigger a search with current query
        const query = searchQueries[orderId] || "";
        if (query.length >= 2) {
          handleSearch(orderId, query, county, countryCode, postalCode);
        }
      }
    }
  };

  const handleSaveAndContinue = async () => {
    setIsSaving(true);
    try {
      for (const orderId of Object.keys(resolutions)) {
        const newCity = resolutions[orderId];
        if (newCity) {
          await updateOrderCity({
            token,
            orderId: orderId as Id<"shopifyOrders">,
            city: newCity,
          });
        }
      }
      const skippedOrderIds = invalidAddresses
        .filter((addr) => !resolutions[addr.orderId])
        .map((addr) => addr.orderId);
      onContinue(skippedOrderIds);
    } catch (error) {
      console.error("Error updating cities:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const isAllResolved = invalidAddresses.every((addr) => !!resolutions[addr.orderId]);
  const unresolvedCount = invalidAddresses.length - Object.keys(resolutions).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-amber-500 text-white px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MapPin className="h-6 w-6" />
              <h2 className="text-lg font-semibold">
                Validare Adrese Sameday ({invalidAddresses.length} probleme)
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
              disabled={isSaving}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-amber-50 text-sm mt-1">
            Următoarele comenzi au localități care nu se găsesc automat în nomenclatorul Sameday.
            Le poți corecta acum sau poți continua și să sari peste cele rămase necorectate.
          </p>
        </div>

        {/* Content */}
        <CardContent className="p-0 overflow-y-auto flex-grow bg-slate-50">
          <div className="divide-y divide-slate-100">
            {invalidAddresses.map((addr) => {
              const isResolved = !!resolutions[addr.orderId];
              return (
                <div key={addr.orderId} className={cn("p-4 transition-colors", isResolved ? "bg-emerald-50/50" : "bg-white")}>
                  <div className="flex flex-col md:flex-row md:items-start gap-4 justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-slate-900">#{addr.orderNumber}</span>
                        <span className="text-slate-500">•</span>
                        <span className="text-sm font-medium text-slate-700">{addr.customerName}</span>
                        {isResolved ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-2" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-amber-500 ml-2" />
                        )}
                      </div>
                      <div className="text-sm text-slate-500 mb-2">
                        {addr.county && <span>Jud: <strong>{addr.county}</strong> </span>}
                        {addr.city && <span>• Oraș inițial: <strong>{addr.city}</strong> </span>}
                        {addr.postalCode && <span>• CP: <strong>{addr.postalCode}</strong></span>}
                      </div>
                      <p className="text-xs text-amber-600 mb-3">{addr.error}</p>

                      <div className="relative max-w-sm">
                        <div
                          ref={(el) => { inputWrapperRefs.current[addr.orderId] = el; }}
                          className="flex items-center border border-slate-300 rounded-md overflow-hidden bg-white focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500"
                        >
                          <Input
                            placeholder="Caută oraș în Sameday..."
                            value={searchQueries[addr.orderId] || ""}
                            onChange={(e) =>
                              handleSearch(addr.orderId, e.target.value, addr.county, addr.country, addr.postalCode)
                            }
                            onFocus={() => {
                              if (searchResults[addr.orderId]?.length > 0) {
                                updateDropdownPosition(addr.orderId);
                                setOpenDropdowns((prev) => ({ ...prev, [addr.orderId]: true }));
                              }
                            }}
                            className="border-0 focus:ring-0 shadow-none h-9 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleDropdown(addr.orderId, addr.county, addr.country, addr.postalCode)
                            }
                            className="px-3 flex items-center justify-center text-slate-400 bg-slate-50 border-l border-slate-200 h-9 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            {isSearching[addr.orderId] ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ChevronDown className={cn("h-4 w-4 transition-transform", openDropdowns[addr.orderId] && "rotate-180")} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dropdown rendered via portal to avoid overflow clipping */}
                  {openDropdowns[addr.orderId] &&
                    createPortal(
                      <>
                        {/* Backdrop to close dropdown on outside click */}
                        <div
                          className="fixed inset-0"
                          style={{ zIndex: 9998 }}
                          onClick={() => setOpenDropdowns((prev) => ({ ...prev, [addr.orderId]: false }))}
                        />
                        {/* Dropdown menu */}
                        <div
                          className="fixed bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto"
                          style={{
                            zIndex: 9999,
                            top: dropdownPositions[addr.orderId]?.top ?? 0,
                            left: dropdownPositions[addr.orderId]?.left ?? 0,
                            width: dropdownPositions[addr.orderId]?.width ?? 300,
                          }}
                        >
                          {searchResults[addr.orderId]?.length > 0 ? (
                            searchResults[addr.orderId].map((city) => (
                              <button
                                key={city.id}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center justify-between"
                                onClick={() => handleSelectCity(addr.orderId, city.name)}
                              >
                                <span>{city.name}</span>
                                {resolutions[addr.orderId] === city.name && (
                                  <Check className="h-4 w-4 text-emerald-500" />
                                )}
                              </button>
                            ))
                          ) : (
                            <div className="p-2">
                              <div className="px-2 py-1 text-xs text-slate-500">
                                Nu am găsit rezultate exacte în Sameday.
                              </div>
                              {(searchQueries[addr.orderId] || "").trim().length >= 2 && (
                                <button
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 hover:text-amber-700 transition-colors rounded"
                                  onClick={() =>
                                    handleSelectCity(addr.orderId, (searchQueries[addr.orderId] || "").trim())
                                  }
                                >
                                  Folosește: {(searchQueries[addr.orderId] || "").trim()}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </>,
                      document.body
                    )
                  }
                </div>
              );
            })}
          </div>
        </CardContent>

        {/* Footer */}
        <div className="bg-white border-t border-slate-100 px-6 py-4 flex-shrink-0 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            {Object.keys(resolutions).length} din {invalidAddresses.length} rezolvate
            {unresolvedCount > 0 ? ` • ${unresolvedCount} vor fi sărite` : ""}
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Anulează
            </Button>
            <Button
              className={cn(
                "min-w-[140px]",
                isAllResolved ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-500 hover:bg-amber-600"
              )}
              onClick={handleSaveAndContinue}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Se salvează...
                </>
              ) : (
                isAllResolved ? "Continuă Generarea" : "Continuă (sari peste nevalidate)"
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
