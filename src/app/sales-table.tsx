import { ChevronRight } from "lucide-react";
import { MobileSales } from "./mobile-records";
import { money, paidFor, type Sale, type State } from "../lib/domain";
const date = (value: string) =>
  new Date(value).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
    timeStyle: "short",
  });

export default function SalesTable({
  sales,
  state,
  onReceipt,
}: {
  sales: Sale[];
  state: State;
  onReceipt: (sale: Sale) => void;
}) {
  return (
    <div className="responsive-sales">
      <MobileSales sales={sales} state={state} onReceipt={onReceipt} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Transaction / customer</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sales.length ? (
              sales.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>SP-{s.id.slice(0, 8).toUpperCase()}</strong>
                    <small>
                      {s.customer || "Walk-in customer"} · {s.lines.length} item
                      {s.lines.length === 1 ? "" : "s"}
                    </small>
                  </td>
                  <td>{date(s.createdAt)}</td>
                  <td>
                    <strong>{money(s.total)}</strong>
                  </td>
                  <td>{s.method}</td>
                  <td>
                    <span
                      className={
                        "badge " +
                        (paidFor(state, s) === s.total ? "green" : "amber")
                      }
                    >
                      {paidFor(state, s) === s.total
                        ? "Paid"
                        : paidFor(state, s)
                          ? "Part paid"
                          : "Unpaid"}
                    </span>
                    <small>
                      {s.sync === "synced" ? "Synced" : "Pending sync"}
                    </small>
                  </td>
                  <td>
                    <button
                      className="icon-btn"
                      aria-label="View receipt"
                      onClick={() => onReceipt(s)}
                    >
                      <ChevronRight size={17} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>
                  <div className="empty">
                    Your first sale starts the story.
                    <small>Record a sale to see transactions here.</small>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
