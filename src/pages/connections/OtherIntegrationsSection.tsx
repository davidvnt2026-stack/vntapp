import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Check } from "lucide-react";
import { connectionConfigs } from "./connectionConfigs";
import { SamedayConnectionForm } from "./SamedayConnectionForm";
import { GenericConnectionForm } from "./GenericConnectionForm";
import type { ConnectionConfig } from "./types";

interface OtherIntegrationsSectionProps {
  getConnectionStatus: (type: import("./types").ConnectionType) => unknown;
  editingConnection: import("./types").ConnectionType | null;
  formData: Record<string, string>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  showPasswords: Record<string, boolean>;
  saving: boolean;
  samedayPickupPoints: import("./types").PickupPointData[];
  samedayFetching: boolean;
  samedayFetched: boolean;
  selectedPickupPointId: string;
  setSelectedPickupPointId: (v: string) => void;
  selectedContactPersonId: string;
  setSelectedContactPersonId: (v: string) => void;
  availableContactPersons: import("./types").PickupPointData["contactPersons"];
  togglePasswordVisibility: (fieldName: string) => void;
  handleEdit: (config: ConnectionConfig) => void;
  handleSamedayFetchPickupPoints: () => void;
  handleSamedaySave: () => void;
  handleSave: (config: ConnectionConfig) => void;
  resetSamedayEdit: () => void;
  resetSamedayCredentials: () => void;
  setEditingConnection: (v: import("./types").ConnectionType | null) => void;
}

export function OtherIntegrationsSection({
  getConnectionStatus,
  editingConnection,
  formData,
  setFormData,
  showPasswords,
  saving,
  samedayPickupPoints,
  samedayFetching,
  samedayFetched,
  selectedPickupPointId,
  setSelectedPickupPointId,
  selectedContactPersonId,
  setSelectedContactPersonId,
  availableContactPersons,
  togglePasswordVisibility,
  handleEdit,
  handleSamedayFetchPickupPoints,
  handleSamedaySave,
  handleSave,
  resetSamedayEdit,
  resetSamedayCredentials,
  setEditingConnection,
}: OtherIntegrationsSectionProps) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Other Integrations</h2>
      <div className="grid gap-6 md:grid-cols-2">
        {connectionConfigs.map((config) => {
          const status = getConnectionStatus(config.type);
          const isEditing = editingConnection === config.type;
          const statusObj = status as { isActive?: boolean } | undefined;

          return (
            <Card
              key={config.type}
              className={`transition-all ${isEditing ? "ring-2 ring-primary shadow-lg" : ""}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-muted ${config.color}`}>
                      <config.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{config.name}</CardTitle>
                      {statusObj?.isActive ? (
                        <Badge variant="success" className="mt-1">
                          <Check className="h-3 w-3 mr-1" />
                          Connected
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="mt-1">
                          Not Connected
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <CardDescription>{config.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {isEditing && config.type === "sameday" ? (
                  <SamedayConnectionForm
                    config={config}
                    formData={formData}
                    setFormData={setFormData}
                    showPasswords={showPasswords}
                    samedayPickupPoints={samedayPickupPoints}
                    samedayFetching={samedayFetching}
                    samedayFetched={samedayFetched}
                    selectedPickupPointId={selectedPickupPointId}
                    setSelectedPickupPointId={setSelectedPickupPointId}
                    selectedContactPersonId={selectedContactPersonId}
                    setSelectedContactPersonId={setSelectedContactPersonId}
                    availableContactPersons={availableContactPersons}
                    saving={saving}
                    togglePasswordVisibility={togglePasswordVisibility}
                    onFetchPickupPoints={handleSamedayFetchPickupPoints}
                    onSave={handleSamedaySave}
                    onCancel={resetSamedayEdit}
                    onResetCredentials={resetSamedayCredentials}
                  />
                ) : isEditing ? (
                  <GenericConnectionForm
                    config={config}
                    formData={formData}
                    setFormData={setFormData}
                    showPasswords={showPasswords}
                    saving={saving}
                    togglePasswordVisibility={togglePasswordVisibility}
                    onSave={() => handleSave(config)}
                    onCancel={() => {
                      setEditingConnection(null);
                      setFormData({});
                    }}
                  />
                ) : (
                  <Button
                    variant={statusObj?.isActive ? "outline" : "default"}
                    className="w-full"
                    onClick={() => handleEdit(config)}
                  >
                    {statusObj?.isActive ? "Update Connection" : "Connect"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
