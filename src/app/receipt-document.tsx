import { money, paidFor, type Sale, type State } from "../lib/domain";
import type { Workspace } from "../lib/contracts";
import type { ReceiptTemplate } from "../lib/plans";
import CountivaMark from "./countiva-mark";
export default function ReceiptDocument({
  sale,
  state,
  workspace,
  template,
  preview = false,
}: {
  sale: Sale;
  state: State;
  workspace?: Workspace | null;
  template?: ReceiptTemplate;
  preview?: boolean;
}) {
  const branding = sale.branding,
    style =
      template ||
      branding?.template ||
      (branding ? "classic" : workspace?.receipt_template) ||
      "classic";
  const paid = paidFor(state, sale),
    balance = sale.total - paid;
  const itemDetails = new Map(
    (sale.receiptDetails?.items || []).map(
      (item) => [item.lineIndex, item] as const,
    ),
  );
  return (
    <article className={`receipt-document template-${style}`}>
      <header className="receipt-document-header">
        {(branding?.logoUrl ?? workspace?.logo_url) && (
          <img
            className="receipt-logo"
            src={branding?.logoUrl ?? workspace?.logo_url}
            alt="Business logo"
          />
        )}
        <div className="receipt-merchant">
          {branding?.name || workspace?.name || "Your business"}
        </div>
        <p>
          {branding?.address ?? workspace?.address}
          {(branding?.address || workspace?.address) && <br />}
          {branding?.phone ?? workspace?.phone}
        </p>
        <span className="receipt-document-label">
          {preview ? "TEMPLATE PREVIEW" : "SALE RECEIPT"}
        </span>
      </header>
      <div className="receipt-meta">
        <span>
          Receipt<strong>{sale.id.slice(0, 8).toUpperCase()}</strong>
        </span>
        <span>
          Date
          <strong>
            {new Date(sale.createdAt).toLocaleString("en-NG", {
              timeZone: "Africa/Lagos",
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </strong>
        </span>
        <span>
          Customer
          <strong>
            {sale.receiptDetails?.customerName ||
              sale.customer ||
              "Walk-in customer"}
          </strong>
        </span>
        <span>
          Payment method<strong>{sale.method}</strong>
        </span>
        {sale.receiptDetails?.customerPhone && (
          <span>
            Customer phone<strong>{sale.receiptDetails.customerPhone}</strong>
          </span>
        )}
        {sale.receiptDetails?.reference && (
          <span>
            Order / job reference
            <strong>{sale.receiptDetails.reference}</strong>
          </span>
        )}
      </div>
      {sale.receiptDetails?.description && (
        <div className="receipt-description">
          <strong>Description</strong>
          <p>{sale.receiptDetails.description}</p>
        </div>
      )}
      <div className="receipt-items">
        {sale.lines.map((line, index) => {
          const candidate = itemDetails.get(index);
          const detail =
            candidate?.productId === line.productId ? candidate : undefined;
          return (
            <div className="receipt-item" key={index}>
              <div>
                <strong>{line.name}</strong>
                {detail?.description && (
                  <small className="receipt-item-description">
                    {detail.description}
                  </small>
                )}
                <small>
                  {line.quantity} {line.unit} × {money(line.price)}
                </small>
                {detail?.identifiers.map((value, number) => (
                  <small className="receipt-item-identifier" key={number}>
                    {detail.identifierType === "imei"
                      ? "IMEI"
                      : "Serial number"}
                    : {value}
                  </small>
                ))}
              </div>
              <strong>{money(line.quantity * line.price)}</strong>
            </div>
          );
        })}
      </div>
      <div className="receipt-totals">
        <div className="receipt-grand-total">
          <span>Total</span>
          <strong>{money(sale.total)}</strong>
        </div>
        <div>
          <span>Payment recorded</span>
          <strong>{money(paid)}</strong>
        </div>
        <div>
          <span>Balance</span>
          <strong>{money(balance)}</strong>
        </div>
      </div>
      <div className="receipt-document-footer">
        <p>
          {branding?.footer ??
            workspace?.receipt_footer ??
            "Thank you for shopping with us."}
        </p>
        <span className="receipt-powered">
          <CountivaMark size={16} />
          Powered by Countiva
        </span>
        {!preview && (
          <small>
            {sale.sync === "synced"
              ? "Cloud synced"
              : "Device copy · online save pending"}
            <br />
            Full reference: {sale.id}
            {!!sale.receiptRevision && (
              <>
                <br />
                Receipt revision {sale.receiptRevision}
                {sale.receiptUpdatedAt && (
                  <>
                    {" "}
                    ·{" "}
                    {new Date(sale.receiptUpdatedAt).toLocaleString("en-NG", {
                      timeZone: "Africa/Lagos",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </>
                )}
              </>
            )}
          </small>
        )}
      </div>
    </article>
  );
}
