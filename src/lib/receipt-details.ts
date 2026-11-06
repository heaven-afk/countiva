import { z } from "zod";
import type { Sale } from "./domain.ts";
export const receiptItemDetailsSchema = z
  .object({
    lineIndex: z.number().int().min(0).max(499),
    productId: z.uuid(),
    description: z.string().trim().max(500).default(""),
    identifierType: z.enum(["none", "imei", "serial"]).default("none"),
    identifiers: z
      .array(z.string().trim().min(1).max(100))
      .max(100)
      .default([]),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.identifierType === "none" && item.identifiers.length)
      context.addIssue({
        code: "custom",
        message: "Choose IMEI or serial number before entering identifiers.",
      });
    if (
      item.identifierType === "imei" &&
      item.identifiers.some((value) => !/^\d{15}$/.test(value))
    )
      context.addIssue({
        code: "custom",
        message: "Each IMEI must contain exactly 15 digits.",
      });
    if (new Set(item.identifiers).size !== item.identifiers.length)
      context.addIssue({
        code: "custom",
        message: "Remove duplicate identifiers for this item.",
      });
    if (item.identifiers.some((value) => /[\u0000-\u001f]/.test(value)))
      context.addIssue({
        code: "custom",
        message: "Put each identifier on its own line.",
      });
  });
export const receiptDetailsSchema = z
  .object({
    customerName: z.string().trim().max(300).default(""),
    customerPhone: z
      .string()
      .trim()
      .max(40)
      .regex(
        /^\+?[0-9 ()-]*$/,
        "Enter a phone number, with an optional leading +.",
      )
      .default(""),
    reference: z.string().trim().max(80).default(""),
    description: z.string().trim().max(1000).default(""),
    items: z.array(receiptItemDetailsSchema).max(500).default([]),
  })
  .strict()
  .superRefine((details, context) => {
    if (
      new Set(details.items.map((item) => item.lineIndex)).size !==
      details.items.length
    )
      context.addIssue({
        code: "custom",
        message: "Each receipt item can have only one details entry.",
      });
    if (new TextEncoder().encode(JSON.stringify(details)).byteLength > 32000)
      context.addIssue({
        code: "custom",
        message:
          "Receipt details must be under 32 KB. Shorten descriptions or use fewer identifiers.",
      });
  });
export type ReceiptDetails = z.infer<typeof receiptDetailsSchema>;
export type SavedReceiptDetails = {
  details: ReceiptDetails;
  revision: number;
  updatedAt: string | null;
  canEdit: boolean;
  history: { revision: number; editedAt: string; editorName: string }[];
};
export function parseReceiptDetails(
  input: unknown,
  sale?: Sale,
): ReceiptDetails {
  const result = receiptDetailsSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      result.error.issues[0]?.message || "Check the receipt details.",
    );
  if (
    sale &&
    result.data.items.some(
      (item) => sale.lines[item.lineIndex]?.productId !== item.productId,
    )
  )
    throw new Error("Receipt item details do not match the original sale.");
  return result.data;
}
