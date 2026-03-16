export type DeliveryStatusClass =
  | "delivered"
  | "returned"
  | "in_transit"
  | "pending";

export function classifyDeliveryStatus(
  rawStatus?: string
): DeliveryStatusClass {
  const status = (rawStatus || "").toLowerCase();
  if (!status) return "pending";

  if (
    status.includes("livrat cu succes") ||
    status.includes("delivered") ||
    status.includes("livrare reusita")
  ) {
    return "delivered";
  }

  if (
    status.includes("retur") ||
    status.includes("return") ||
    status.includes("returned") ||
    status.includes("refuz") ||
    status.includes("refused")
  ) {
    return "returned";
  }

  if (
    status.includes("tranzit") ||
    status.includes("transit") ||
    status.includes("curier") ||
    status.includes("depozit") ||
    status.includes("livrare")
  ) {
    return "in_transit";
  }

  return "pending";
}

export function getDeliveryStatusColor(status?: string): string {
  if (!status) return "bg-gray-100 text-gray-700";
  const s = status.toLowerCase();
  if (s.includes("livrat cu succes") || s.includes("delivered"))
    return "bg-green-100 text-green-700";
  if (
    s.includes("tranzit") ||
    s.includes("transit") ||
    s.includes("curier") ||
    s.includes("depozit")
  )
    return "bg-blue-100 text-blue-700";
  if (s.includes("livrare") || s.includes("curs"))
    return "bg-indigo-100 text-indigo-700";
  if (
    s.includes("retur") ||
    s.includes("return") ||
    s.includes("refuzat")
  )
    return "bg-red-100 text-red-700";
  if (s.includes("anulat") || s.includes("cancel"))
    return "bg-red-100 text-red-700";
  if (s.includes("ridicat") || s.includes("preluat"))
    return "bg-cyan-100 text-cyan-700";
  return "bg-yellow-100 text-yellow-700";
}
