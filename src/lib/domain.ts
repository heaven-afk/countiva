import type { ReceiptDetails } from "./receipt-details";
export type Product = {
  id: string;
  name: string;
  category: string;
  unit: string;
  stock: number;
  cost: number;
  price: number;
  threshold: number;
  revision?: number;
  archivedAt?: string | null;
};
export type Line = {
  originalPrice?: number | null;
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
  cost: number;
};
export type Sale = {
  dueDate?: string | null;
  recordedBy?: string;
  recordedByName?: string;
  receiptDetails?: ReceiptDetails;
  receiptRevision?: number;
  receiptUpdatedAt?: string | null;
  id: string;
  createdAt: string;
  lines: Line[];
  total: number;
  paid: number;
  method: string;
  customer: string;
  sync: "pending" | "synced" | "attention";
  error?: string;
  branding?: {
    template?: "classic" | "minimal" | "ledger" | "bold";
    name?: string;
    phone?: string;
    address?: string;
    footer?: string;
    width?: 58 | 80;
    logoUrl?: string;
  };
};
export type Movement = {
  id: string;
  productId: string;
  quantity: number;
  reason: string;
  createdAt: string;
};
export type Payment = {
  id: string;
  saleId: string;
  amount: number;
  method: string;
  createdAt: string;
};
export type State = {
  products: Product[];
  sales: Sale[];
  movements: Movement[];
  payments: Payment[];
};
// Missing original prices mean an older/imported transaction with unknown discount history.
export function discountFor(sale: Sale): number {
  const value = sale.lines.reduce(
    (sum, line) =>
      sum +
      (line.originalPrice == null
        ? 0
        : Math.max(0, line.originalPrice - line.price) * line.quantity),
    0,
  );
  if (!Number.isSafeInteger(value))
    throw new Error("Discount total exceeds the supported amount range.");
  return value;
}
export function validateSaleTerms(sale: Sale) {
  for (const line of sale.lines)
    if (
      !Number.isSafeInteger(line.price) ||
      line.price < 0 ||
      !Number.isSafeInteger(line.cost) ||
      line.cost < 0 ||
      (line.originalPrice != null &&
        (!Number.isSafeInteger(line.originalPrice) || line.originalPrice < 0))
    )
      throw new Error("Enter valid non-negative transaction prices.");
  discountFor(sale);
  if (sale.dueDate) {
    const parsed = new Date(`${sale.dueDate}T00:00:00Z`);
    const saleDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
    }).format(new Date(sale.createdAt));
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(sale.dueDate) ||
      !Number.isFinite(+parsed) ||
      parsed.toISOString().slice(0, 10) !== sale.dueDate ||
      sale.dueDate < saleDay
    )
      throw new Error(
        "Payment due date must be a valid date on or after the sale date.",
      );
  }
}
export const emptyState: State = {
  products: [],
  sales: [],
  movements: [],
  payments: [],
};
export const paidFor = (state: State, sale: Sale) =>
  sale.paid +
  state.payments
    .filter((p) => p.saleId === sale.id)
    .reduce((sum, p) => sum + p.amount, 0);
export function recordPayment(state: State, payment: Payment): State {
  if (state.payments.some((p) => p.id === payment.id)) return state;
  const sale = state.sales.find((s) => s.id === payment.saleId);
  if (!sale) throw new Error("Sale was not found.");
  if (
    !Number.isSafeInteger(payment.amount) ||
    payment.amount <= 0 ||
    payment.amount > sale.total - paidFor(state, sale)
  )
    throw new Error(
      "Payment must be positive and cannot exceed the outstanding balance.",
    );
  return { ...state, payments: [payment, ...state.payments] };
}
export const money = (kobo: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(kobo / 100);
export function toKobo(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Enter a valid amount with at most two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw new Error("Amount is too large.");
  return result;
}
export function recordSale(state: State, sale: Sale): State {
  if (state.sales.some((s) => s.id === sale.id)) return state;
  if (!sale.lines.length) throw new Error("Add at least one product.");
  validateSaleTerms(sale);
  const totals = new Map<string, number>();
  for (const line of sale.lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0)
      throw new Error("Quantities must be positive whole numbers.");
    const product = state.products.find((p) => p.id === line.productId);
    if (
      !product ||
      product.archivedAt ||
      (line.originalPrice ?? line.price) !== product.price ||
      line.cost !== product.cost
    )
      throw new Error("Product pricing changed. Please rebuild this sale.");
    totals.set(
      line.productId,
      (totals.get(line.productId) || 0) + line.quantity,
    );
  }
  for (const [id, qty] of totals) {
    if ((state.products.find((p) => p.id === id)?.stock ?? 0) < qty)
      throw new Error("Insufficient stock on this device.");
  }
  if (
    sale.total !==
      sale.lines.reduce((sum, line) => sum + line.price * line.quantity, 0) ||
    !Number.isSafeInteger(sale.total) ||
    !Number.isSafeInteger(sale.paid) ||
    sale.paid < 0 ||
    sale.paid > sale.total
  )
    throw new Error("Invalid sale amount.");
  if (sale.paid < sale.total && !sale.customer.trim())
    throw new Error("Identify the customer for a credit sale.");
  return {
    ...state,
    products: state.products.map((p) => ({
      ...p,
      stock: p.stock - (totals.get(p.id) || 0),
    })),
    sales: [sale, ...state.sales],
  };
}
