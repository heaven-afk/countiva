import type { Product } from "./domain";

export type StockProductDetails = Pick<
  Product,
  "name" | "category" | "unit" | "cost" | "price" | "threshold"
> & {
  stock?: number;
  expectedStock?: number;
};

type AuditDetails = Partial<
  StockProductDetails & { quantity: number; reason: string }
>;
export type StockAuditEntry = {
  id: number;
  product_name: string;
  actor_email: string | null;
  action: "created" | "edited" | "deleted" | "adjusted";
  before_details: AuditDetails | null;
  after_details: AuditDetails | null;
  created_at: string;
};
