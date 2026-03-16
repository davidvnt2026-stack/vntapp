import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
} from "lucide-react";
import type { ConnectionConfig, PickupPointData } from "./types";

interface SamedayConnectionFormProps {
  config: ConnectionConfig;
  formData: Record<string, string>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  showPasswords: Record<string, boolean>;
  samedayPickupPoints: PickupPointData[];
  samedayFetching: boolean;
  samedayFetched: boolean;
  selectedPickupPointId: string;
  setSelectedPickupPointId: (v: string) => void;
  selectedContactPersonId: string;
  setSelectedContactPersonId: (v: string) => void;
  availableContactPersons: PickupPointData["contactPersons"];
  saving: boolean;
  togglePasswordVisibility: (fieldName: string) => void;
  onFetchPickupPoints: () => void;
  onSave: () => void;
  onCancel: () => void;
  onResetCredentials: () => void;
}

export function SamedayConnectionForm({
  config,
  formData,
  setFormData,
  showPasswords,
  samedayPickupPoints,
  samedayFetching,
  samedayFetched,
  selectedPickupPointId,
  setSelectedPickupPointId,
  selectedContactPersonId,
  setSelectedContactPersonId,
  availableContactPersons,
  saving,
  togglePasswordVisibility,
  onFetchPickupPoints,
  onSave,
  onCancel,
  onResetCredentials,
}: SamedayConnectionFormProps) {
  return (
    <div className="space-y-4">
      {config.fields.map((field) => (
        <div key={field.name} className="space-y-2">
          <label className="text-sm font-medium">
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </label>
          <div className="relative">
            <Input
              type={field.type === "password" && !showPasswords[field.name] ? "password" : "text"}
              placeholder={field.placeholder}
              value={formData[field.name] || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  [field.name]: e.target.value,
                }))
              }
              disabled={samedayFetched}
            />
            {field.type === "password" && (
              <button
                type="button"
                onClick={() => togglePasswordVisibility(field.name)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPasswords[field.name] ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </div>
      ))}

      {!samedayFetched && (
        <Button
          onClick={onFetchPickupPoints}
          disabled={samedayFetching || !formData.username || !formData.password}
          className="w-full"
        >
          {samedayFetching ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Se preiau punctele de ridicare...
            </>
          ) : (
            <>
              <MapPin className="h-4 w-4 mr-2" />
              Preia puncte de ridicare
            </>
          )}
        </Button>
      )}

      {samedayFetched && samedayPickupPoints.length > 0 && (
        <div className="space-y-4 p-4 border-2 border-orange-200 rounded-xl bg-gradient-to-br from-orange-50/50 to-amber-50/50">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-orange-600" />
            <span className="text-sm font-semibold text-orange-900">
              Punct de ridicare & Contact
            </span>
            <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-200">
              Auto-detectat
            </Badge>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Punct de ridicare <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <select
                value={selectedPickupPointId}
                onChange={(e) => {
                  setSelectedPickupPointId(e.target.value);
                  const pp = samedayPickupPoints.find((p) => String(p.id) === e.target.value);
                  if (pp && pp.contactPersons.length > 0) {
                    const defaultCP =
                      pp.contactPersons.find((cp) => cp.isDefault) || pp.contactPersons[0];
                    setSelectedContactPersonId(String(defaultCP.id));
                  } else {
                    setSelectedContactPersonId("");
                  }
                }}
                className="w-full h-10 px-3 pr-10 rounded-md border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
              >
                {samedayPickupPoints.map((pp) => (
                  <option key={pp.id} value={String(pp.id)}>
                    {pp.name}
                    {pp.address ? ` — ${pp.address}` : ""}
                    {pp.isDefault ? " (implicit)" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
            <p className="text-xs text-muted-foreground">ID: {selectedPickupPointId}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Persoana de contact <span className="text-destructive">*</span>
            </label>
            {availableContactPersons.length > 0 ? (
              <>
                <div className="relative">
                  <select
                    value={selectedContactPersonId}
                    onChange={(e) => setSelectedContactPersonId(e.target.value)}
                    className="w-full h-10 px-3 pr-10 rounded-md border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                  >
                    {availableContactPersons.map((cp) => (
                      <option key={cp.id} value={String(cp.id)}>
                        {cp.name}
                        {cp.phone ? ` (${cp.phone})` : ""}
                        {cp.isDefault ? " (implicit)" : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
                <p className="text-xs text-muted-foreground">ID: {selectedContactPersonId}</p>
              </>
            ) : (
              <p className="text-sm text-amber-600">
                Nu există persoane de contact pentru acest punct. Adaugă una în dashboard-ul Sameday.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onResetCredentials}
            className="text-xs text-orange-600 hover:text-orange-800 underline"
          >
            Modifică credențialele
          </button>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        {samedayFetched ? (
          <Button
            onClick={onSave}
            loading={saving}
            className="flex-1"
            disabled={!selectedPickupPointId || !selectedContactPersonId}
          >
            <Check className="h-4 w-4 mr-2" />
            Salvează conexiunea
          </Button>
        ) : null}
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
