import { FileText, Truck } from "lucide-react";
import type { ConnectionConfig } from "./types";

export const connectionConfigs: ConnectionConfig[] = [
  {
    type: "sameday",
    name: "Sameday Courier",
    description: "Generate AWBs and track shipments with Sameday",
    icon: Truck,
    color: "text-orange-600",
    fields: [
      { name: "username", label: "Username", type: "text", placeholder: "Your Sameday username", required: true },
      { name: "password", label: "Password", type: "password", placeholder: "Your Sameday password", required: true },
      { name: "api_url", label: "API URL", type: "url", placeholder: "https://api.sameday.ro" },
    ],
  },
  {
    type: "fgo",
    name: "FGO Invoicing",
    description: "Generate invoices automatically with FacturaGO",
    icon: FileText,
    color: "text-blue-600",
    fields: [
      { name: "vatNumber", label: "CUI (Cod Unic)", type: "text", placeholder: "12345678", required: true },
      { name: "apiKey", label: "API Key (Cheie Privată)", type: "password", placeholder: "Your FGO API key", required: true },
      { name: "platformUrl", label: "Platform URL", type: "url", placeholder: "https://api.fgo.ro" },
      { name: "invoiceSeries", label: "Invoice Series", type: "text", placeholder: "FV" },
      { name: "vatTaxPercentage", label: "VAT %", type: "text", placeholder: "19" },
    ],
  },
];
