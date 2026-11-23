import type { Metadata } from "next";

// Match the final HTTPS host currently selected in Vercel.
export const SEO_ORIGIN = "https://www.countiva.shop";
export const SITE_DESCRIPTION =
  "Countiva is inventory and sales software for Nigerian small businesses. Track stock, customer credit and receipts, with business insights on Growth and Business.";

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
        text: "Add a product name, category and stock type, then enter its cost, selling price, opening quantity and low-stock threshold. Import existing inventory from CSV or Excel, or review products suggested from a stock photo before receiving them.",
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
        heading: "Work with your stock types",
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
        text: "See sales today, money collected, inventory value and outstanding customer credit. Business insights are included in Growth, and Business adds advanced analysis and detailed reports, helping you review margins, stock efficiency and practical next steps.",
      },
      {
        heading: "Keep working through interruptions",
        text: "A device prepared online can save sales locally during a weak connection. Reconnect to upload pending changes and check the save status before changing devices or clearing browser data.",
      },
    ],
    related: ["inventory-management", "receipts", "business-insights"],
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
        text: "Starter includes two receipt templates and Growth and Business include four. Add your business name, contact details and footer, then choose a 58 mm or 80 mm receipt width for your workflow.",
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
  {
    slug: "business-insights",
    title: "Business Insights & Sales Analytics for Shops | Countiva",
    description:
      "Understand sales, recorded gross profit, collections and stock performance. Compare Countiva Growth insights with advanced Business analytics for Nigerian shops.",
    heading: "Turn your business records into clearer decisions",
    introduction:
      "Countiva connects recorded sales, product costs, stock movements and customer credit to help owners understand their business. Business insights are included in Growth and Business subscriptions, with no separate report purchase. Starter users can upgrade to access insights.",
    sections: [
      {
        heading: "Understand how much your business made",
        text: "Review recorded sales revenue, estimated gross profit, money collected and outstanding customer balances. Collections include repayments, so they are different from new sales. Gross profit uses recorded product costs; it is not net profit after business expenses. Countiva does not treat collections as an available bank or cash balance.",
      },
      {
        heading: "Growth: a practical overview of recent trading",
        text: "Growth includes business summaries and reports for periods of up to 30 days. Review sales, margins and stock patterns, then use the suggested next steps to decide what to investigate. The 30-day free Growth trial includes this level of insight.",
      },
      {
        heading: "Business: a deeper view of performance",
        text: "Business adds reports covering up to 90 days, product-level margins, stock coverage, slow-moving inventory, payment mix and customer credit aging. Use the fuller action plan to identify products to review, stock tied up without recent sales and balances to follow up.",
      },
      {
        heading: "Use analysis grounded in your own records",
        text: "Reports use the business records saved online for the selected period. Upload pending device changes before generating a report. Missing costs, incomplete stock entries or unrecorded repayments can affect the results. AI commentary helps explain patterns; check its recommendations against your records and trading conditions before acting.",
      },
      {
        heading: "Move from a report to a business decision",
        text: "For example, compare a fast-selling product's margin with the stock you have left before placing another order. Review slow-moving products before buying more, and follow up overdue customer balances. These are starting points for an owner's decisions, rather than a promise of increased profit.",
      },
    ],
    related: ["inventory-management", "sales-tracking", "receipts"],
  },
] as const;
