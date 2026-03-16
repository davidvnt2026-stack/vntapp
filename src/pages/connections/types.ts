export type ConnectionType = "sameday" | "fgo";

export interface ConnectionConfig {
  type: ConnectionType;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  fields: Array<{
    name: string;
    label: string;
    type: "text" | "password" | "url";
    placeholder: string;
    required?: boolean;
  }>;
}

export interface PickupPointData {
  id: number;
  name: string;
  address: string;
  isDefault: boolean;
  contactPersons: Array<{
    id: number;
    name: string;
    phone: string;
    isDefault: boolean;
  }>;
}
