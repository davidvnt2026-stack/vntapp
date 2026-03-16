import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Eye, EyeOff } from "lucide-react";
import type { ConnectionConfig } from "./types";

interface GenericConnectionFormProps {
  config: ConnectionConfig;
  formData: Record<string, string>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  showPasswords: Record<string, boolean>;
  saving: boolean;
  togglePasswordVisibility: (fieldName: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function GenericConnectionForm({
  config,
  formData,
  setFormData,
  showPasswords,
  saving,
  togglePasswordVisibility,
  onSave,
  onCancel,
}: GenericConnectionFormProps) {
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
      <div className="flex gap-2 pt-2">
        <Button onClick={onSave} loading={saving} className="flex-1">
          Save
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
