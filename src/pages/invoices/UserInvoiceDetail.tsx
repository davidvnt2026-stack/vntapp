import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { ChevronLeft, FileText, Loader2, Store } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { BillingRateCard } from "./BillingRateCard";
import { InvoiceResultSection, type InvoiceResult } from "./InvoiceResultSection";
import { PackagingRatesCard } from "./PackagingRatesCard";
import { PeriodSelectorCard } from "./PeriodSelectorCard";
import type { InvoicePeriod, PackagingRate } from "./types";
import { formatMonth, getHalfMonthPeriod } from "./utils";

interface UserInvoiceDetailProps {
  token: string;
  userId: Id<"profiles">;
  period: InvoicePeriod;
  setPeriod: (period: InvoicePeriod) => void;
  onBack: () => void;
}

interface BillingRateRecord {
  pricePerOrder: number;
  notes?: string;
}

export function UserInvoiceDetail({
  token,
  userId,
  period,
  setPeriod,
  onBack,
}: UserInvoiceDetailProps) {
  const apiAny = api as any;
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState("");
  const [rateNotes, setRateNotes] = useState("");
  const [showAddPackaging, setShowAddPackaging] = useState(false);
  const [newPkgSku, setNewPkgSku] = useState("");
  const [newPkgType, setNewPkgType] = useState("");
  const [newPkgCost, setNewPkgCost] = useState("");
  const [newPkgNotes, setNewPkgNotes] = useState("");
  const [savingRate, setSavingRate] = useState(false);
  const [savingPkg, setSavingPkg] = useState(false);
  const [billingRate, setBillingRateState] = useState<BillingRateRecord | null | undefined>(undefined);
  const [packagingRates, setPackagingRatesState] = useState<PackagingRate[] | undefined>(undefined);
  const [invoiceData, setInvoiceData] = useState<InvoiceResult | undefined>(undefined);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const calculateInvoiceSnapshot = useAction(apiAny.invoiceSnapshots.calculateInvoiceSnapshot);
  const getInvoiceRatesSnapshot = useAction(apiAny.invoiceSnapshots.getInvoiceRatesSnapshot);
  const calculateInvoiceSnapshotRef = useRef(calculateInvoiceSnapshot);
  const getInvoiceRatesSnapshotRef = useRef(getInvoiceRatesSnapshot);
  useEffect(() => {
    calculateInvoiceSnapshotRef.current = calculateInvoiceSnapshot;
  }, [calculateInvoiceSnapshot]);
  useEffect(() => {
    getInvoiceRatesSnapshotRef.current = getInvoiceRatesSnapshot;
  }, [getInvoiceRatesSnapshot]);

  const setBillingRate = useMutation(apiAny.invoices.setBillingRate);
  const setPackagingRate = useMutation(apiAny.invoices.setPackagingRate);
  const deletePackagingRate = useMutation(apiAny.invoices.deletePackagingRate);

  const refreshInvoiceData = async (forceRefresh = false) => {
    setInvoiceLoading(true);
    try {
      const [invoiceResult, ratesResult] = await Promise.all([
        calculateInvoiceSnapshotRef.current({
          token,
          userId,
          startDate: period.startDate,
          endDate: period.endDate,
          forceRefresh,
        }),
        getInvoiceRatesSnapshotRef.current({
          token,
          userId,
          forceRefresh,
        }),
      ]);
      setInvoiceData(invoiceResult as InvoiceResult);
      setBillingRateState((ratesResult as { billingRate?: BillingRateRecord | null }).billingRate ?? null);
      setPackagingRatesState(
        (ratesResult as { packagingRates?: PackagingRate[] }).packagingRates ?? []
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Eroare la calculul facturii.";
      toast.error(message);
    } finally {
      setInvoiceLoading(false);
    }
  };

  useEffect(() => {
    void refreshInvoiceData();
  }, [token, userId, period.startDate, period.endDate]);

  const rateLoaded = billingRate !== undefined;
  if (rateLoaded && !editingRate && rateInput === "" && billingRate) {
    setTimeout(() => {
      setRateInput(String(billingRate.pricePerOrder));
      setRateNotes(billingRate.notes || "");
    }, 0);
  }

  const handleSaveRate = async () => {
    const price = parseFloat(rateInput);
    if (isNaN(price) || price < 0) {
      toast.error("Introdu un pret valid.");
      return;
    }
    setSavingRate(true);
    try {
      await setBillingRate({
        token,
        userId,
        pricePerOrder: price,
        notes: rateNotes,
      });
      await refreshInvoiceData(true);
      toast.success("Tarif salvat cu succes!");
      setEditingRate(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Eroare la salvarea tarifului.";
      toast.error(message);
    } finally {
      setSavingRate(false);
    }
  };

  const handleAddPackaging = async () => {
    if (!newPkgSku.trim()) {
      toast.error("Introdu un SKU.");
      return;
    }
    if (!newPkgType.trim()) {
      toast.error("Introdu tipul de ambalare.");
      return;
    }
    const cost = parseFloat(newPkgCost);
    if (isNaN(cost) || cost < 0) {
      toast.error("Introdu un cost valid.");
      return;
    }
    setSavingPkg(true);
    try {
      await setPackagingRate({
        token,
        userId,
        sku: newPkgSku.trim(),
        packagingType: newPkgType.trim(),
        packagingCost: cost,
        notes: newPkgNotes || undefined,
      });
      await refreshInvoiceData(true);
      toast.success("Regula ambalare adaugata!");
      setNewPkgSku("");
      setNewPkgType("");
      setNewPkgCost("");
      setNewPkgNotes("");
      setShowAddPackaging(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Eroare la adaugarea regulii.";
      toast.error(message);
    } finally {
      setSavingPkg(false);
    }
  };

  const handleDeletePackaging = async (rateId: Id<"userPackagingRates">) => {
    try {
      await deletePackagingRate({ token, rateId });
      await refreshInvoiceData(true);
      toast.success("Regula stearsa.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Eroare la stergere.";
      toast.error(message);
    }
  };

  const now = new Date();
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const currentMonthLabel = formatMonth(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const previousMonthLabel = formatMonth(
    `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(
      2,
      "0"
    )}`
  );
  const currentFirstHalf = getHalfMonthPeriod(now, 1);
  const currentSecondHalf = getHalfMonthPeriod(now, 2);
  const previousFirstHalf = getHalfMonthPeriod(previousMonthDate, 1);
  const previousSecondHalf = getHalfMonthPeriod(previousMonthDate, 2);

  const loading =
    billingRate === undefined ||
    packagingRates === undefined ||
    invoiceData === undefined ||
    invoiceLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" />
          Inapoi
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <FileText className="h-7 w-7 text-emerald-600" />
            {invoiceData?.userName || "Se incarca..."}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-muted-foreground text-sm">{invoiceData?.userEmail}</p>
            {invoiceData?.stores && invoiceData.stores.length > 0 && (
              <div className="flex items-center gap-1">
                <Store className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{invoiceData.stores.join(", ")}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Se calculeaza factura...</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <BillingRateCard
            billingRate={billingRate}
            rateInput={rateInput}
            rateNotes={rateNotes}
            savingRate={savingRate}
            onRateInputChange={(value) => {
              setRateInput(value);
              setEditingRate(true);
            }}
            onRateNotesChange={(value) => {
              setRateNotes(value);
              setEditingRate(true);
            }}
            onSave={handleSaveRate}
          />

          <PackagingRatesCard
            packagingRates={packagingRates}
            showAddPackaging={showAddPackaging}
            onToggleAddPackaging={() => setShowAddPackaging(!showAddPackaging)}
            newPkgSku={newPkgSku}
            newPkgType={newPkgType}
            newPkgCost={newPkgCost}
            newPkgNotes={newPkgNotes}
            onNewPkgSkuChange={setNewPkgSku}
            onNewPkgTypeChange={setNewPkgType}
            onNewPkgCostChange={setNewPkgCost}
            onNewPkgNotesChange={setNewPkgNotes}
            savingPkg={savingPkg}
            onAddPackaging={handleAddPackaging}
            onCancelAddPackaging={() => setShowAddPackaging(false)}
            onDeletePackaging={handleDeletePackaging}
          />

          <PeriodSelectorCard
            period={period}
            currentMonthLabel={currentMonthLabel}
            previousMonthLabel={previousMonthLabel}
            currentFirstHalf={currentFirstHalf}
            currentSecondHalf={currentSecondHalf}
            previousFirstHalf={previousFirstHalf}
            previousSecondHalf={previousSecondHalf}
            onPeriodChange={setPeriod}
          />

          {invoiceData && <InvoiceResultSection invoiceData={invoiceData} period={period} />}
        </>
      )}
    </div>
  );
}
