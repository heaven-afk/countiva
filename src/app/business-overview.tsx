import {
  ArrowDownLeft,
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  Package,
  Plus,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";
import { money, paidFor, type Sale, type State } from "../lib/domain";
import CountivaMark from "./countiva-mark";
import MobileDashboard from "./mobile-dashboard";
import SalesTable from "./sales-table";
const today = (value: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
    new Date(value),
  );
export default function BusinessOverview({
  state,
  ownerName,
  online,
  syncing,
  canManageStock,
  onNavigate,
  onStock,
  onReceipt,
}: {
  state: State;
  ownerName: string;
  online: boolean;
  syncing: boolean;
  canManageStock: boolean;
  onNavigate: (page: string) => void;
  onStock: (mode: "product" | "receive" | "scan") => void;
  onReceipt: (sale: Sale) => void;
}) {
  const salesToday = state.sales.filter(
    (s) => today(s.createdAt) === today(new Date().toISOString()),
  );
  const revenue = salesToday.reduce((sum, s) => sum + s.total, 0);
  const collected =
    salesToday.reduce((sum, s) => sum + s.paid, 0) +
    state.payments
      .filter((p) => today(p.createdAt) === today(new Date().toISOString()))
      .reduce((sum, p) => sum + p.amount, 0);
  const debt = state.sales.reduce(
    (sum, s) => sum + s.total - paidFor(state, s),
    0,
  );
  const awaitingPayment = state.sales.filter(
    (s) => paidFor(state, s) < s.total,
  ).length;
  const low = state.products.filter((p) => p.stock <= p.threshold);
  return (
    <>
      <MobileDashboard
        state={state}
        ownerName={ownerName}
        online={online}
        syncing={syncing}
        onNavigate={onNavigate}
        onScan={() => onStock("scan")}
        onReceive={() => onStock("receive")}
        onProduct={() => onStock("product")}
        onReceipt={onReceipt}
        canManageStock={canManageStock}
      />
      <div className="desktop-overview">
        {!state.products.length && (
          <section className="workspace-start">
            <div className="start-mark">
              <CountivaMark size={38} />
            </div>
            <div>
              <span className="eyebrow">LET’S GET YOU STARTED</span>
              <h2>Your first product starts the picture.</h2>
              <p>
                Add your opening stock, then record your first sale. Your
                overview will take shape as you go.
              </p>
            </div>
            <button
              className="button primary"
              disabled={!canManageStock}
              onClick={() => onStock("product")}
            >
              <Plus size={18} />
              Add first product
            </button>
          </section>
        )}
        <div className="period-row">
          <span>
            <span className="live-dot" /> Today’s overview
          </span>
          <span>
            {new Date().toLocaleDateString("en-NG", {
              timeZone: "Africa/Lagos",
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>
        <div className="stats">
          {[
            {
              label: "Sales today",
              value: money(revenue),
              note: `${salesToday.length} recorded transactions`,
              icon: ShoppingCart,
            },
            {
              label: "Money collected today",
              value: money(collected),
              note: "Includes customer debt repayments",
              icon: ArrowDownLeft,
            },
            {
              label: "Inventory value",
              value: money(
                state.products.reduce((s, p) => s + p.stock * p.cost, 0),
              ),
              note: `${state.products.length} products in your catalogue`,
              icon: Package,
            },
            {
              label: "Outstanding credit",
              value: money(debt),
              note: `${awaitingPayment} ${awaitingPayment === 1 ? "sale" : "sales"} awaiting payment`,
              icon: Users,
            },
          ].map(({ label, value, note, icon: Icon }) => (
            <section className="stat" key={label}>
              <div className="stat-label">
                {label}
                <span>
                  <Icon size={17} />
                </span>
              </div>
              <div className="stat-value">{value}</div>
              <small>{note}</small>
            </section>
          ))}
        </div>
        <div className="overview-grid">
          <section className="panel sales-panel">
            <div className="panel-heading">
              <div>
                <h2>Sales at a glance</h2>
                <p>Your last 7 days of recorded sales</p>
              </div>
              <span className="subtle-label">Sales value · ₦</span>
            </div>
            {state.sales.length ? (
              <div className="chart">
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() - 6 + i);
                  const key = today(d.toISOString()),
                    value = state.sales
                      .filter((s) => today(s.createdAt) === key)
                      .reduce((sum, s) => sum + s.total, 0),
                    max = Math.max(
                      1,
                      ...Array.from({ length: 7 }, (_, j) => {
                        const x = new Date();
                        x.setDate(x.getDate() - 6 + j);
                        return state.sales
                          .filter(
                            (s) =>
                              today(s.createdAt) === today(x.toISOString()),
                          )
                          .reduce((sum, s) => sum + s.total, 0);
                      }),
                    );
                  return (
                    <div className="chart-column" key={i}>
                      <span>{value ? money(value) : ""}</span>
                      <div className="chart-track">
                        <div
                          style={{
                            height: `${Math.max((value / max) * 100, 1)}%`,
                          }}
                        />
                      </div>
                      <small>
                        {d.toLocaleDateString("en-NG", {
                          weekday: "short",
                        })}
                      </small>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="chart-empty">
                <div className="chart-grid" />
                <span className="empty-icon">
                  <TrendingUp size={29} />
                </span>
                <h3>Good records lead to good decisions.</h3>
                <p>Your sales trend will appear after your first sale.</p>
                <button
                  className="text-button"
                  onClick={() => onNavigate("Record sale")}
                >
                  Record your first sale <ArrowUpRight size={15} />
                </button>
              </div>
            )}
            <div className="panel-footer">
              <span>Gross profit today</span>
              <strong>
                {money(
                  salesToday.reduce(
                    (sum, s) =>
                      sum +
                      s.lines.reduce(
                        (a, l) => a + (l.price - l.cost) * l.quantity,
                        0,
                      ),
                    0,
                  ),
                )}
              </strong>
              <small>Before business expenses</small>
            </div>
          </section>
          <section className="insight-card">
            <span className="insight-kicker">
              <TrendingUp size={16} /> COUNTIVA INSIGHTS
            </span>
            <h2>
              A small step.
              <br />A smarter business.
            </h2>
            <p>
              {state.products.length
                ? low.length
                  ? `${low.length} product${low.length === 1 ? " is" : "s are"} at or below the low-stock threshold. Check what needs replenishing.`
                  : "Your stock is above its alert levels. Keep recording sales to uncover more useful patterns."
                : "Add your products and opening stock. We’ll help you spot what sells, what’s running low, and where to grow."}
            </p>
            <button
              onClick={() =>
                state.products.length
                  ? onNavigate("Business insights")
                  : onStock("product")
              }
            >
              {state.products.length
                ? "View business insights"
                : "Add your first product"}
              <ArrowUpRight size={18} />
            </button>
            <CountivaMark size={110} className="insight-brand-mark" />
            <div className="insight-art">
              <div />
              <div />
              <div />
              <TrendingUp size={58} />
            </div>
            <span className="insight-foot">
              Built on your data. Reviewed by you.
            </span>
          </section>
        </div>
        <div className="overview-bottom">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Recent transactions</h2>
                <p>A quick look at your latest sales</p>
              </div>
              <button
                className="text-button"
                onClick={() => onNavigate("Sales history")}
              >
                View all <ArrowUpRight size={15} />
              </button>
            </div>
            <SalesTable
              sales={state.sales.slice(0, 4)}
              state={state}
              onReceipt={onReceipt}
            />
          </section>
          <section className="panel stock-alerts">
            <div className="panel-heading">
              <div>
                <h2>Stock watch</h2>
                <p>A little attention goes a long way</p>
              </div>
              <span className="badge amber">{low.length} low</span>
            </div>
            {low.length ? (
              low.slice(0, 4).map((p) => (
                <div className="stock-watch-row" key={p.id}>
                  <span className="product-icon">
                    <Box size={19} />
                  </span>
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      {p.stock} {p.unit} left · alert at {p.threshold}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <div className="stock-clear">
                <Check size={23} />
                <strong>
                  {state.products.length
                    ? "Stock levels look good"
                    : "A fresh start for your stock"}
                </strong>
                <p>
                  {state.products.length
                    ? "No products below their alert threshold."
                    : "Add products to keep an eye on your inventory."}
                </p>
              </div>
            )}
            <button
              className="stock-link"
              onClick={() => onNavigate("Inventory")}
            >
              Open inventory <ChevronRight size={16} />
            </button>
          </section>
        </div>
      </div>
    </>
  );
}
