import type { Metadata } from "next";

// Match the final HTTPS host currently selected in Vercel.
export const SEO_ORIGIN = "https://www.countiva.shop";
export const SITE_DESCRIPTION =
  "Countiva helps small businesses track inventory, record sales, manage customer credit and create receipts. Built for shops, retailers and wholesalers in Nigeria.";

export function publicMetadata(
  title: string,
  description: string,
  path: string,
): Metadata {
  const url = new URL(path, SEO_ORIGIN).href;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: "Countiva",
      locale: "en_NG",
      title,
      description,
      url,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "Countiva inventory, sales and receipts for small businesses",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/opengraph-image"],
    },
  };
}

export const featurePages = [
  {
    slug: "inventory-management",
    title: "Inventory Management for Small Businesses | Countiva",
    description:
      "Track products, deliveries and stock adjustments with Countiva. Inventory management for shops, retailers and wholesalers in Nigeria.",
    heading: "Inventory management that keeps your shop in view",
    introduction:
      "Know which products you have, what has arrived and what needs restocking. Countiva keeps stock quantities and product details together with the sales that change them.",
    sections: [
      {
        heading: "Build your product catalogue",
        text: "Add a product name, category and stock unit, then enter its cost, selling price, opening quantity and low-stock threshold. Import existing inventory from CSV or Excel, or review products suggested from a stock photo before receiving them.",
      },
      {
        heading: "Follow stock movements",
        text: "Record deliveries and adjustments with a reason or supplier reference. Recording a sale reduces the quantity for each item sold. Low-stock alerts help you decide which products to check before your next order.",
      },
      {
        heading: "Keep your team accountable",
        text: "Team members can edit existing products. Store owners control deletion and can inspect stock activity logs showing who made each change. Deleted products leave active inventory while past sales and receipts retain their records.",
      },
      {
        heading: "Work with your stock units",
        text: "Track stock in the unit your business uses, such as a carton, pack or piece. Quantities use whole units. Choose a consistent unit when receiving and selling a product.",
      },
    ],
    related: ["sales-tracking", "receipts"],
  },
  {
    slug: "sales-tracking",
    title: "Sales & Customer Credit Tracking for Shops | Countiva",
    description:
      "Record cash and credit sales, follow customer balances and review daily business activity with Countiva sales tracking for small businesses.",
    heading: "Sales and customer balances in one place",
    introduction:
      "Record what you sold, how your customer paid and what they still owe. Countiva connects each sale with your inventory, receipts and business overview.",
    sections: [
      {
        heading: "Record cash and part-paid sales",
        text: "Choose products and quantities, identify the customer for a credit sale, and enter the amount received. Countiva supports recording cash, bank transfer and external card payments. Confirm payment through your payment channel before recording it.",
      },
      {
        heading: "Follow repayments",
        text: "Review unpaid and part-paid sales in Customers & credit. Record each repayment against its original sale so you can follow the outstanding balance and keep collections distinct from new sales revenue.",
      },
      {
        heading: "Review daily business activity",
        text: "See sales today, money collected, inventory value and outstanding customer credit. Business insights use your recorded activity to help you identify practical next steps. Detailed analysis reports are available as a separate purchase.",
      },
      {
        heading: "Keep working through interruptions",
        text: "A device prepared online can save sales locally during a weak connection. Reconnect to upload pending changes and check the save status before changing devices or clearing browser data.",
      },
    ],
    related: ["inventory-management", "receipts"],
  },
  {
    slug: "receipts",
    title: "Business Receipts & Receipt Templates | Countiva",
    description:
      "Create receipts from recorded sales with Countiva. Add business details, customer information, item descriptions, IMEI or serial numbers and print your receipt.",
    heading: "Clear receipts for the goods you sell",
    introduction:
      "Create a receipt from a recorded sale and give customers a clear account of their purchase. Countiva supports receipt templates, business branding and optional item details.",
    sections: [
      {
        heading: "Choose a receipt template",
        text: "Starter includes two receipt templates and Growth includes four. Add your business name, contact details and footer, then choose a 58 mm or 80 mm receipt width for your workflow.",
      },
      {
        heading: "Include the details your customer needs",
        text: "Add customer details, a reference and a description. For numbered goods such as phones and electronics, enter an optional IMEI or serial number on each receipt item.",
      },
      {
        heading: "Make corrections with a record",
        text: "Authorised users can edit receipt descriptions and optional identifiers online. Financial sale amounts and repayments retain their original records. Countiva tracks receipt revisions to prevent one device overwriting a newer edit.",
      },
      {
        heading: "Print or save a copy",
        text: "Open a sale from sales history to view its receipt. Use the browser’s print options to send it to a compatible printer or save a PDF, and check the selected paper width before printing.",
      },
    ],
    related: ["inventory-management", "sales-tracking"],
  },
] as const;
