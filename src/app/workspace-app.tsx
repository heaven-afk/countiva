"use client";
import { useEffect, useRef, useState } from "react";
import ProductPicker from "./product-picker";
import BusinessInsights from "./business-insights";
import RecordImports from "./record-imports";
import Notifications from "./notifications";
import ReceiptDocument from "./receipt-document";
import ReceiptEditor from "./receipt-editor";
import useEntitlements from "./use-entitlements";
import SubscriptionPlans from "./subscription-plans";
import { decimalInput } from "../lib/input-format";
import WorkspaceMenu from "./workspace-menu";
import WorkspaceHeader from "./workspace-header";
import BusinessOverview from "./business-overview";
import SalesTable from "./sales-table";
import WorkspaceNavigator from "./workspace-navigator";
import CountivaMark from "./countiva-mark";
import Skeleton from "./skeleton";
import InstallPrompt from "./install-prompt";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  Check,
  ChevronRight,
  Download,
  Package,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  emptyState,
  money,
  paidFor,
  recordPayment,
  recordSale,
  toKobo,
  type Product,
  type Sale,
  type State,
} from "../lib/domain";
import {
  readState,
  writeState,
  readPhoto,
  writePhoto,
  readSaveStatus,
  deviceId,
  type SaveStatus,
} from "../lib/storage";
import { getSupabase } from "../lib/supabase";
import CloudSettings, { type Workspace } from "./cloud-settings";
import AccessGate from "./access-gate";
import { MobileProducts } from "./mobile-records";
import DataProtection from "./data-protection";
import { mergeBackup } from "../lib/backup";
import { reconcileUpload } from "../lib/reconcile";

type ScanRow = {
  name: string;
  quantity: number;
  unit: string;
  productId: string;
  cost?: string;
  price?: string;
};
const date = (value: string) =>
  new Date(value).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
    timeStyle: "short",
  });
function download(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Page() {
  return (
    <AccessGate>
      {(access, onExit) => (
        <Home
          key={access.workspace.id}
          initialWorkspace={access.workspace}
          ownerName={access.ownerName}
          onExit={onExit}
        />
      )}
    </AccessGate>
  );
}
function Home({
  initialWorkspace,
  ownerName,
  onExit,
}: {
  initialWorkspace: Workspace;
  ownerName: string;
  onExit: () => Promise<void>;
}) {
  const [state, setState] = useState<State>(emptyState),
    [ready, setReady] = useState(false),
    [online, setOnline] = useState(true),
    [offlineReady, setOfflineReady] = useState(false),
    [page, setPage] = useState("Overview"),
    [modal, setModal] = useState<
      "product" | "receive" | "scan" | "payment" | null
    >(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [receipt, setReceipt] = useState<Sale | null>(null),
    [receiptEditing, setReceiptEditing] = useState(false),
    [busy, setBusy] = useState(false);
  const current = useRef(state),
    lock = useRef(false),
    channel = useRef<BroadcastChannel | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({}),
    [customer, setCustomer] = useState(""),
    [paid, setPaid] = useState(""),
    [method, setMethod] = useState("Cash");
  const [image, setImage] = useState<string | null>(null),
    [scan, setScan] = useState<ScanRow[]>([]),
    [scanning, setScanning] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(
      initialWorkspace,
    ),
    [syncing, setSyncing] = useState(false);
  const workspaceRef = useRef<Workspace | null>(initialWorkspace);
  const syncInFlight = useRef(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null),
    [platformAccess, setPlatformAccess] = useState(false);
  const { entitlements, reload: reloadEntitlements } = useEntitlements(
    initialWorkspace.id,
  );
  const subscriptionRouted = useRef(false);
  useEffect(() => {
    if (entitlements?.status === "inactive" && !subscriptionRouted.current) {
      subscriptionRouted.current = true;
      setPage("Subscription");
    }
  }, [entitlements?.status]);
  const [scanTicket, setScanTicket] = useState<string | null>(null);
  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get("view");
    if (new URLSearchParams(window.location.search).has("plan"))
      setPage("Subscription");
    else if (
      ["Subscription", "Notifications", "Business insights"].includes(
        selected || "",
      )
    )
      setPage(selected!);
    const visit = () => {
      if (navigator.onLine)
        void getSupabase()?.rpc("visit_workspace", {
          bid: initialWorkspace.id,
        });
    };
    visit();
    window.addEventListener("focus", visit);
    return () => window.removeEventListener("focus", visit);
  }, [initialWorkspace.id]);
  const canManageStock =
    workspace?.role === "owner" || workspace?.role === "manager";
  function openStock(mode: "product" | "scan" | "receive") {
    if (!entitlements?.hasAccess) {
      setError("Choose or renew a subscription to update stock.");
      setPage("Subscription");
      return;
    }
    if (!canManageStock) {
      setError(
        "Your role can record sales and repayments. Ask your owner or manager to update inventory.",
      );
      return;
    }
    setModal(mode);
  }
  useEffect(() => {
    setWorkspace(initialWorkspace);
    workspaceRef.current = initialWorkspace;
  }, [initialWorkspace]);
  useEffect(() => {
    getSupabase()
      ?.rpc("platform_access")
      .then(({ data }) => setPlatformAccess(Boolean(data)));
  }, []);
  useEffect(() => {
    const update = () =>
      readSaveStatus(initialWorkspace.id)
        .then(setSaveStatus)
        .catch(() => {});
    update();
    window.addEventListener("shopilot-save-status", update);
    const leaving = (event: BeforeUnloadEvent) => {
      if (saveStatus?.pendingIds.length) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leaving);
    return () => {
      window.removeEventListener("shopilot-save-status", update);
      window.removeEventListener("beforeunload", leaving);
    };
  }, [saveStatus?.pendingIds.length]);
  const [mobileMore, setMobileMore] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");
  function navigateWorkspace(next: string) {
    setPage(next);
    setSearch("");
    setError("");
    setMobileMore(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  useEffect(() => {
    const query = window.matchMedia("(min-width: 761px)");
    const close = () => {
      if (query.matches) setMobileMore(false);
    };
    query.addEventListener("change", close);
    return () => query.removeEventListener("change", close);
  }, []);
  useEffect(() => {
    if (!modal && !receipt && !mobileMore) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
        ) || [],
      );
    (
      dialog?.querySelector<HTMLElement>("#menu-search") || focusable()[0]
    )?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal(null);
        setReceipt(null);
        setMobileMore(false);
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      if (event.shiftKey && document.activeElement === elements[0]) {
        event.preventDefault();
        elements.at(-1)?.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === elements.at(-1)
      ) {
        event.preventDefault();
        elements[0].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [modal, receipt, mobileMore]);
  useEffect(() => {
    if (!ready) return;
    readPhoto(initialWorkspace.id)
      .then(setImage)
      .catch(() => {});
    setScan([]);
  }, [ready, workspace]);
  async function switchWorkspace(value: Workspace | null) {
    if (!value) {
      await onExit();
      return;
    }
    window.location.assign("/workspace?choose=business");
  }
  async function syncCloud() {
    const client = getSupabase(),
      ws = workspaceRef.current;
    if (!client || !ws || !navigator.onLine || syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncing(true);
    let again = false;
    try {
      await navigator.locks.request(
        `shopilot-cloud-sync:${ws.id}`,
        async () => {
          const latest = await navigator.locks.request("shopilot-write", () =>
            readState(ws.id),
          );
          const { data, error } = await client
            .rpc("sync_workspace", {
              bid: ws.id,
              payload: { ...latest, deviceId: deviceId() },
            })
            .abortSignal(AbortSignal.timeout(20000));
          if (error) throw error;
          await navigator.locks.request("shopilot-write", async () => {
            const remote = data as State;
            remote.sales = remote.sales.map((s) => ({
              ...s,
              branding:
                s.branding ?? latest.sales.find((x) => x.id === s.id)?.branding,
            }));
            const merged = reconcileUpload(
              remote,
              await readState(ws.id),
              latest,
            );
            await writeState(merged, {
              synced: true,
              acknowledged: remote,
              businessId: ws.id,
            });
            current.current = merged;
            setState(merged);
            again = (await readSaveStatus(ws.id)).pendingIds.length > 0;
            channel.current?.postMessage("changed");
            const conflicts = merged.products.filter((p) => p.stock < 0);
            setNotice(
              conflicts.length
                ? `Your records are saved. Please check stock for ${conflicts.length} ${conflicts.length === 1 ? "product" : "products"} after sales made offline.`
                : again
                  ? "Recent records saved. Saving your newest changes next…"
                  : "All up to date. Your latest business records are saved to your Countiva account.",
            );
          });
        },
      );
    } catch (e) {
      const reason = (e as Error).message;
      const friendly = /owner or manager|access denied|JWT|expired/i.test(
        reason,
      )
        ? "Your access needs checking before these changes can be saved. Your pending records remain on this device. Sign in again or ask the business owner for help."
        : /Repayment exceeds/.test(reason)
          ? "A repayment needs review against payments from other devices. Your pending records remain here. Review the customer balance before trying again."
          : "We couldn’t save your latest changes to your account right now. Your records remain on this device. Check your connection and try again.";
      setError(friendly);
      throw new Error(friendly);
    } finally {
      syncInFlight.current = false;
      setSyncing(false);
    }
    if (again && navigator.onLine)
      setTimeout(() => syncCloud().catch(() => {}), 0);
  }
  useEffect(() => {
    if (!workspace || !ready) return;
    const run = () => {
      syncCloud().catch(() => {});
    };
    run();
    const timer = setInterval(run, 60000);
    window.addEventListener("online", run);
    window.addEventListener("focus", run);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", run);
      window.removeEventListener("focus", run);
    };
  }, [workspace, ready]);
  useEffect(() => {
    readState(initialWorkspace.id)
      .then((value) => {
        current.current = value;
        setState(value);
        setReady(true);
      })
      .catch(() =>
        setError(
          "Device storage is unavailable. Sales are disabled until storage is available.",
        ),
      );
    setOnline(navigator.onLine);
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    channel.current = new BroadcastChannel("shopilot");
    channel.current.onmessage = () =>
      readState(initialWorkspace.id).then((value) => {
        current.current = value;
        setState(value);
      });
    const workerMessage = (event: MessageEvent) => {
      if (event.data?.type === "OFFLINE_READY") setOfflineReady(true);
      if (event.data?.type === "OFFLINE_FAILED")
        setNotice(
          "Offline preparation failed. Keep this page open and reconnect before relying on offline reload.",
        );
    };
    navigator.serviceWorker?.addEventListener("message", workerMessage);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => reg.active?.postMessage("CACHE_SHELL"))
        .catch(() => setNotice("Offline page caching could not be prepared."));
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      navigator.serviceWorker?.removeEventListener("message", workerMessage);
      channel.current?.close();
    };
  }, []);
  async function mutate(change: (previous: State) => State | Promise<State>) {
    if (
      !entitlements?.hasAccess ||
      (entitlements.expiresAt &&
        Date.parse(entitlements.expiresAt) <= Date.now())
    )
      throw new Error(
        "An active subscription is needed to add records. Open Subscription to choose or renew a plan.",
      );
    if (lock.current)
      throw new Error("Another save or sync is in progress. Try again.");
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await navigator.locks.request("shopilot-write", async () => {
        const latest = await readState(initialWorkspace.id);
        const next = await change(latest);
        await writeState(next, { businessId: initialWorkspace.id });
        current.current = next;
        setState(next);
        channel.current?.postMessage("changed");
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save. Your previous records remain unchanged.",
      );
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
    if (navigator.onLine) setTimeout(() => syncCloud().catch(() => {}), 0);
  }
  const debt = state.sales.reduce((s, x) => s + x.total - paidFor(state, x), 0),
    low = state.products.filter((p) => p.stock <= p.threshold),
    total = Object.entries(cart).reduce(
      (sum, [id, qty]) =>
        sum + (state.products.find((p) => p.id === id)?.price ?? 0) * qty,
      0,
    );
  const filtered = state.products.filter((p) =>
    `${p.name} ${p.category}`.toLowerCase().includes(search.toLowerCase()),
  );
  const movementHistory = [
    ...state.movements,
    ...state.sales.flatMap((s) =>
      s.lines.map((line, index) => ({
        id: `${s.id}:${index}`,
        productId: line.productId,
        quantity: -line.quantity,
        reason: `Sale SP-${s.id.slice(0, 8).toUpperCase()}`,
        createdAt: s.createdAt,
      })),
    ),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  async function addProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      if (!canManageStock)
        throw new Error("Only an owner or manager can add products.");
      const stock = Number(form.get("stock")),
        threshold = Number(form.get("threshold"));
      if (
        !Number.isSafeInteger(stock) ||
        stock < 0 ||
        !Number.isSafeInteger(threshold) ||
        threshold < 0
      )
        throw new Error(
          "Stock and threshold must be nonnegative whole numbers.",
        );
      const product: Product = {
        id: crypto.randomUUID(),
        name: String(form.get("name")).trim(),
        category: String(form.get("category")).trim() || "General",
        unit: String(form.get("unit")).trim(),
        stock,
        cost: toKobo(String(form.get("cost"))),
        price: toKobo(String(form.get("price"))),
        threshold,
      };
      if (!product.name || !product.unit)
        throw new Error("Enter a product name and stock unit.");
      await mutate((s) => ({
        ...s,
        products: [...s.products, product],
        movements: [
          {
            id: crypto.randomUUID(),
            productId: product.id,
            quantity: stock,
            reason: "Opening stock",
            createdAt: new Date().toISOString(),
          },
          ...s.movements,
        ],
      }));
      setModal(null);
      setNotice("Product saved on this device.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function receive(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      if (!canManageStock)
        throw new Error("Only an owner or manager can change stock.");
      const id = String(form.get("product")),
        qty = Number(form.get("quantity")),
        reason = String(form.get("reason"));
      if (!Number.isSafeInteger(qty) || qty === 0)
        throw new Error("Enter a nonzero whole quantity.");
      await mutate((s) => {
        const product = s.products.find((p) => p.id === id);
        if (!product) throw new Error("Choose a product.");
        if (product.stock + qty < 0)
          throw new Error("Adjustment would create negative stock.");
        return {
          ...s,
          products: s.products.map((p) =>
            p.id === id ? { ...p, stock: p.stock + qty } : p,
          ),
          movements: [
            {
              id: crypto.randomUUID(),
              productId: id,
              quantity: qty,
              reason,
              createdAt: new Date().toISOString(),
            },
            ...s.movements,
          ],
        };
      });
      setModal(null);
      setNotice("Inventory updated.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function confirmSale() {
    try {
      const sale: Sale = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        branding: {
          name: workspace?.name,
          phone: workspace?.phone,
          address: workspace?.address,
          footer:
            workspace?.receipt_footer || "Thank you for shopping with us.",
          width: workspace?.receipt_width || 80,
          logoUrl: workspace?.logo_url || "",
          template: entitlements?.receiptTemplates.includes(
            workspace?.receipt_template || "classic",
          )
            ? workspace?.receipt_template || "classic"
            : "classic",
        },
        lines: Object.entries(cart)
          .filter(([, qty]) => qty > 0)
          .map(([id, quantity]) => {
            const p = state.products.find((p) => p.id === id)!;
            return {
              productId: id,
              name: p.name,
              quantity,
              unit: p.unit,
              price: p.price,
              cost: p.cost,
            };
          }),
        total,
        paid: paid === "" ? total : toKobo(paid),
        method,
        customer,
        sync: "pending",
      };
      await mutate((s) => recordSale(s, sale));
      setCart({});
      setCustomer("");
      setPaid("");
      setReceipt(sale);
      setNotice(
        workspace
          ? "Sale saved on this device. It will sync when connected."
          : "Sale saved locally. Connect a cloud workspace in Settings to enable sync.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function scanPhoto(file: File) {
    setError("");
    if (file.size > 3 * 1024 * 1024) {
      setError("Choose a photo smaller than 3 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      writePhoto(String(reader.result), initialWorkspace.id)
        .then(() => {
          setImage(String(reader.result));
          setScan([]);
          setScanTicket(null);
        })
        .catch(() =>
          setError(
            "Could not save the photo draft. Check available device storage.",
          ),
        );
    };
    reader.readAsDataURL(file);
  }
  async function analyse() {
    if (!image) return;
    setScanning(true);
    setScanTicket(null);
    setError("");
    try {
      const session = await getSupabase()?.auth.getSession();
      const response = await fetch("/api/recognize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.data.session
            ? { Authorization: "Bearer " + session.data.session.access_token }
            : {}),
        },
        body: JSON.stringify({ image, businessId: initialWorkspace.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Recognition failed.");
      setScanTicket(data.ticketId);
      void reloadEntitlements();
      setScan(
        data.items.map(
          (row: { name: string; quantity: number; unit: string }) => ({
            ...row,
            productId: "",
          }),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }
  async function confirmScan() {
    if (busy || syncInFlight.current) {
      setError("Wait for the current save to finish, then confirm again.");
      return;
    }
    setBusy(true);
    try {
      if (!canManageStock)
        throw new Error("Only an owner or manager can receive stock.");
      if (
        !scan.length ||
        scan.some(
          (row) =>
            !row.productId ||
            !Number.isSafeInteger(row.quantity) ||
            row.quantity <= 0,
        )
      )
        throw new Error(
          "Match every row to a product and confirm positive whole quantities.",
        );
      if (!scanTicket || !navigator.onLine)
        throw new Error(
          "Analyse a photo online before confirming. For manual stock entry, use Receive stock.",
        );
      await syncCloud();
      const rows = scan.map((row) =>
        row.productId === "__new__"
          ? {
              name: row.name,
              unit: row.unit,
              quantity: row.quantity,
              cost: toKobo(row.cost || ""),
              price: toKobo(row.price || ""),
              category: "Imported stock",
            }
          : { productId: row.productId, quantity: row.quantity },
      );
      const result = await getSupabase()!.rpc("apply_stock_scan", {
        bid: initialWorkspace.id,
        ticket_id: scanTicket,
        rows,
      });
      if (result.error) throw result.error;
      await syncCloud();
      setScanTicket(null);
      setModal(null);
      setScan([]);
      setImage(null);
      await writePhoto(null, initialWorkspace.id);
      setNotice("Reviewed stock received.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function exportCSV() {
    const cell = (value: unknown) =>
      '"' +
      String(value)
        .replace(/"/g, '""')
        .replace(/^[=+@-]/, "'$&") +
      '"';
    download(
      "shopilot-sales.csv",
      [
        [
          "Reference",
          "Date",
          "Customer",
          "Total NGN",
          "Paid NGN",
          "Balance NGN",
          "Payment method",
        ],
        ...state.sales.map((s) => [
          s.id,
          s.createdAt,
          s.customer,
          s.total / 100,
          paidFor(state, s) / 100,
          (s.total - paidFor(state, s)) / 100,
          s.method,
        ]),
      ]
        .map((row) => row.map(cell).join(","))
        .join("\r\n"),
      "text/csv",
    );
  }
  async function repay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const payment = {
        id: crypto.randomUUID(),
        saleId: String(form.get("sale")),
        amount: toKobo(String(form.get("amount"))),
        method: String(form.get("method")),
        createdAt: new Date().toISOString(),
      };
      await mutate((s) => recordPayment(s, payment));
      setModal(null);
      setNotice("Repayment saved separately. Sales revenue is unchanged.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const saleTable = (sales: Sale[]) => (
    <SalesTable sales={sales} state={state} onReceipt={setReceipt} />
  );

  return (
    <div className={`shell ${page === "Overview" ? "is-overview" : ""}`}>
      <div className="main-shell">
        <WorkspaceHeader
          notificationsOpen={page === "Notifications"}
          onNotifications={() => navigateWorkspace("Notifications")}
          businessName={initialWorkspace.name}
          role={workspace?.role}
          ownerName={ownerName}
          online={online}
          syncing={syncing}
          menuOpen={mobileMore}
          onMenu={() => {
            setMenuSearch("");
            setMobileMore(true);
          }}
        />
        <main>
          {page !== "Notifications" && <InstallPrompt dismissible />}
          <div className="page-heading">
            <div>
              <div className="eyebrow">{initialWorkspace.name}</div>
              <h1>{page === "Overview" ? "Business overview" : page}</h1>
              <p>
                {page === "Overview"
                  ? "Your sales, stock and customer balances. All in view."
                  : page === "Inventory"
                    ? "Every product. Every movement. All accounted for."
                    : page === "Record sale"
                      ? "Record the goods sold and how your customer paid."
                      : page === "Business insights"
                        ? "Practical next steps, grounded in your records."
                        : "Your business records, organised."}
              </p>
            </div>
            <div className="heading-actions">
              {page === "Overview" ? (
                <>
                  <button
                    className="button secondary"
                    onClick={() => openStock("scan")}
                  >
                    <Camera size={17} /> Scan stock
                  </button>
                  <button
                    className="button primary"
                    onClick={() => setPage("Record sale")}
                  >
                    <Plus size={18} /> Record sale
                  </button>
                </>
              ) : page === "Inventory" ? (
                <>
                  <button
                    className="button secondary"
                    onClick={() => openStock("receive")}
                  >
                    <ArrowDownLeft size={17} /> Receive stock
                  </button>
                  <button
                    className="button primary"
                    onClick={() => openStock("product")}
                  >
                    <Plus size={17} /> Add product
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {!ready && <Skeleton label="Preparing your business records" />}
          {page === "Record sale" && Object.keys(cart).length > 0 && (
            <button
              className="mobile-cart-summary"
              onClick={() =>
                document
                  .getElementById("sale-checkout")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              <ShoppingCart size={19} />
              <span>
                {Object.keys(cart).length} products · {money(total)}
              </span>
              <strong>
                Review sale <ChevronRight size={16} />
              </strong>
            </button>
          )}
          {error && (
            <div className="banner error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="banner" role="status">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {ready && page === "Overview" && (
            <BusinessOverview
              state={state}
              ownerName={ownerName}
              online={online}
              syncing={syncing}
              canManageStock={canManageStock}
              onNavigate={navigateWorkspace}
              onStock={openStock}
              onReceipt={setReceipt}
            />
          )}
          {page === "Inventory" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    Product catalogue{" "}
                    <span className="count">{state.products.length}</span>
                  </h2>
                  <p>Stock is shown in each product’s configured unit.</p>
                </div>
                <div className="search-field">
                  <label htmlFor="inventory-search">Search products</label>
                  <div className="search">
                    <Search size={17} />
                    <input
                      id="inventory-search"
                      type="search"
                      placeholder="Search products…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <MobileProducts
                products={filtered}
                onAdd={() => openStock("product")}
              />
              <div className="table-wrap inventory-desktop-table">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>In stock</th>
                      <th>Cost / unit</th>
                      <th>Selling price</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <small>{p.unit}</small>
                        </td>
                        <td>{p.category}</td>
                        <td>
                          {p.stock} {p.unit}
                        </td>
                        <td>{money(p.cost)}</td>
                        <td>{money(p.price)}</td>
                        <td>
                          <span
                            className={
                              "badge " +
                              (p.stock <= p.threshold ? "amber" : "green")
                            }
                          >
                            {p.stock <= p.threshold ? "Low stock" : "In stock"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!filtered.length && (
                      <tr>
                        <td colSpan={6}>
                          <div className="empty">
                            No products yet.
                            <small>
                              Add your first product to start tracking stock.
                            </small>
                            <button
                              className="button primary"
                              onClick={() => openStock("product")}
                            >
                              <Plus size={16} /> Add product
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="panel-heading">
                <h2>Stock movement history</h2>
                <button
                  className="text-button"
                  onClick={() => openStock("scan")}
                >
                  <Camera size={16} /> Receive from photo
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Change</th>
                      <th>Reason</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movementHistory.slice(0, 30).map((m) => (
                      <tr key={m.id}>
                        <td>
                          {
                            state.products.find((p) => p.id === m.productId)
                              ?.name
                          }
                        </td>
                        <td>
                          {m.quantity > 0 ? "+" : ""}
                          {m.quantity}
                        </td>
                        <td>{m.reason}</td>
                        <td>{date(m.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {page === "Record sale" && (
            <div className="checkout-grid">
              <section className="panel">
                <div className="panel-heading">
                  <h2>Select products</h2>
                  <div className="search-field">
                    <label htmlFor="sale-search">Search products</label>
                    <div className="search">
                      <Search size={17} />
                      <input
                        id="sale-search"
                        type="search"
                        placeholder="Find a product…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div className="product-grid">
                  {filtered.map((p) => (
                    <button
                      disabled={!p.stock}
                      className="product-tile"
                      key={p.id}
                      onClick={() =>
                        setCart({
                          ...cart,
                          [p.id]: Math.min(p.stock, (cart[p.id] || 0) + 1),
                        })
                      }
                    >
                      <span className="product-icon">
                        <Package size={24} />
                      </span>
                      <small>{p.category}</small>
                      <strong>{p.name}</strong>
                      <span>{money(p.price)}</span>
                      <small>
                        {p.stock} {p.unit} available
                      </small>
                      <Plus className="tile-plus" size={17} />
                    </button>
                  ))}
                </div>
                {!state.products.length && (
                  <div className="empty">
                    Add products before recording a sale.
                    <button
                      className="button primary"
                      onClick={() => openStock("product")}
                    >
                      Add product
                    </button>
                  </div>
                )}
              </section>
              <section className="panel checkout" id="sale-checkout">
                <div className="panel-heading">
                  <h2>Current sale</h2>
                  <span className="badge">
                    {Object.keys(cart).length} products
                  </span>
                </div>
                <div className="checkout-body">
                  {Object.entries(cart).map(([id, qty]) => {
                    const p = state.products.find((p) => p.id === id)!;
                    return (
                      <div className="cart-row" key={id}>
                        <div>
                          <strong>{p.name}</strong>
                          <small>
                            {money(p.price)} / {p.unit}
                          </small>
                        </div>
                        <input
                          type="number"
                          aria-label={`Quantity of ${p.name}`}
                          min="1"
                          max={p.stock}
                          value={qty}
                          onChange={(e) =>
                            setCart({ ...cart, [id]: Number(e.target.value) })
                          }
                        />
                        <button
                          className="icon-btn"
                          aria-label={`Remove ${p.name}`}
                          onClick={() => {
                            const next = { ...cart };
                            delete next[id];
                            setCart(next);
                          }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })}
                  {!Object.keys(cart).length && (
                    <p className="muted">Select products to begin.</p>
                  )}
                  <div className="checkout-total">
                    <span>Total</span>
                    <strong>{money(total)}</strong>
                  </div>
                  <label>
                    Customer{" "}
                    <span className="muted">(required for credit)</span>
                    <input
                      value={customer}
                      onChange={(e) => setCustomer(e.target.value)}
                      placeholder="Name / phone or customer reference"
                    />
                  </label>
                  <label>
                    Payment method
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                    >
                      {[
                        "Cash",
                        "Card (external terminal)",
                        "Bank transfer",
                        "Credit",
                      ].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Amount received (₦)
                    <input
                      inputMode="decimal"
                      onInput={(e) => {
                        e.currentTarget.value = decimalInput(
                          e.currentTarget.value,
                        );
                      }}
                      value={paid}
                      onChange={(e) => setPaid(decimalInput(e.target.value))}
                      placeholder="0.00"
                      aria-describedby="amount-guidance"
                    />
                  </label>
                  <p className="form-note" id="amount-guidance">
                    NGN · up to 2 decimal places. Leave blank for full payment (
                    {money(total)}); enter 0 for credit.
                  </p>
                  {method !== "Cash" && (
                    <p className="form-note">
                      This records your entry. It does not verify an external
                      payment.
                    </p>
                  )}
                  <button
                    disabled={!ready || busy || !Object.keys(cart).length}
                    className="button primary full"
                    onClick={confirmSale}
                  >
                    <Check size={17} />{" "}
                    {busy ? "Saving…" : "Confirm & save sale"}
                  </button>
                  <p className="form-note">
                    {workspace
                      ? "Saved locally first. Sync runs when connected; external payments are not automatically verified."
                      : "Saved on this device. Connect a cloud workspace in Settings to enable sync."}
                  </p>
                </div>
              </section>
            </div>
          )}
          {page === "Sales history" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>All recorded sales</h2>
                  <p>
                    {state.sales.length} transactions ·{" "}
                    {money(state.sales.reduce((s, x) => s + x.total, 0))} in
                    sales
                  </p>
                </div>
                <button className="button secondary" onClick={exportCSV}>
                  <Download size={16} /> Export CSV
                </button>
              </div>
              {saleTable(state.sales)}
            </section>
          )}
          {page === "Customers & credit" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Outstanding balances</h2>
                  <p>{money(debt)} across unpaid and partially paid sales</p>
                </div>
              </div>
              {saleTable(
                state.sales.filter((s) => paidFor(state, s) < s.total),
              )}
              <div className="panel-heading">
                <button
                  className="button primary"
                  onClick={() => setModal("payment")}
                >
                  <Plus size={16} /> Record debt repayment
                </button>
              </div>
              <div className="panel-heading">
                <h2>Repayment history</h2>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Sale</th>
                      <th>Amount</th>
                      <th>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.payments.map((p) => (
                      <tr key={p.id}>
                        <td>{date(p.createdAt)}</td>
                        <td>SP-{p.saleId.slice(0, 8).toUpperCase()}</td>
                        <td>{money(p.amount)}</td>
                        <td>{p.method}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {page === "Business insights" && (
            <BusinessInsights
              state={state}
              businessId={initialWorkspace.id}
              role={workspace?.role}
              onNavigate={navigateWorkspace}
            />
          )}
          {page === "Import & export" && (
            <RecordImports
              businessId={initialWorkspace.id}
              state={state}
              canImport={canManageStock && !!entitlements?.hasAccess}
              onImport={mutate}
              onPhoto={() => openStock("scan")}
            />
          )}
          {page === "Notifications" && (
            <Notifications
              businessId={initialWorkspace.id}
              ownerName={ownerName}
              state={state}
              onNavigate={navigateWorkspace}
            />
          )}
          {entitlements &&
            !entitlements.hasAccess &&
            page !== "Subscription" && (
              <div className="banner" role="status">
                {entitlements.status === "paused" ? (
                  "Your subscription is paused. Contact Countiva support to resume access. Your records remain available to view and export."
                ) : (
                  <>
                    Your records are available to view and export.{" "}
                    <button
                      className="text-button"
                      onClick={() => navigateWorkspace("Subscription")}
                    >
                      Choose or renew a subscription
                    </button>{" "}
                    to add records.
                  </>
                )}
              </div>
            )}
          {page === "Subscription" && (
            <SubscriptionPlans
              businessId={initialWorkspace.id}
              canChoose={workspace?.role === "owner"}
            />
          )}
          {page === "Settings" && (
            <section className="panel settings-panel">
              <h2>Your data & setup</h2>
              <CloudSettings
                workspace={workspace}
                onWorkspace={switchWorkspace}
                onSync={syncCloud}
                disabled={busy || syncing || !online}
                onSaved={(value) => {
                  setWorkspace(value);
                  workspaceRef.current = value;
                  const saved = JSON.parse(
                    localStorage.getItem("shopilot-authorised-business-v1") ||
                      "null",
                  );
                  if (saved?.workspace?.id === value.id)
                    localStorage.setItem(
                      "shopilot-authorised-business-v1",
                      JSON.stringify({ ...saved, workspace: value }),
                    );
                }}
              />
              <hr />
              <p>
                Countiva saves your changes on this device first, then to your
                account when you’re online. Records marked pending sync have not
                been backed up to the cloud. Export a backup regularly; clearing
                browser data can remove local records.
              </p>
              <DataProtection
                businessId={initialWorkspace.id}
                state={state}
                canRestore={canManageStock}
                onRestore={(backup) => mutate((s) => mergeBackup(s, backup))}
              />
              <a className="button secondary" href="/workspace?choose=business">
                Switch business / accept invitations
              </a>
              {platformAccess && (
                <a className="button secondary" href="/admin">
                  Countiva platform dashboard
                </a>
              )}
              <hr />
              <h3>Your records, wherever you work</h3>
              <p>
                Sign in to your Countiva account to access your saved business
                records on another device. Before switching devices, check that
                your latest changes have finished saving. You can use Sync now
                to save any pending updates while you’re online.
              </p>
              <div className="setup-list">
                <span>
                  Currency<strong>NGN · Nigerian naira</strong>
                </span>
                <span>
                  Business timezone<strong>Africa/Lagos</strong>
                </span>
                <span>
                  Cloud sync
                  <strong>
                    {workspace
                      ? "Configured — see transaction sync status"
                      : "Not connected"}
                  </strong>
                </span>
                <span>
                  Photo stock entry
                  <strong>
                    Owner or manager · internet connection required
                  </strong>
                </span>
              </div>
            </section>
          )}
          {page === "Help" && (
            <section className="panel settings-panel">
              <h2>Start with your products</h2>
              <p>
                Add each product and its opening stock. Choose one explicit
                stock unit, such as “bottle” or “carton of 24”. This first
                version does not automatically convert between units.
              </p>
              <h3>Receiving stock</h3>
              <p>
                Use Receive stock to add a delivery. A negative quantity records
                a correction; always explain the reason. For photo receiving,
                upload an image, request suggestions, map each row to an
                existing product, check quantities in that product’s unit, and
                confirm.
              </p>
              <h3>Recording sales offline</h3>
              <p>
                Open the production app online once to prepare the offline page.
                Add your catalogue before disconnecting. Sales save to this
                browser’s device storage. Keep this device secure and export
                backups. Offline reload must be verified on your target device
                before relying on it.
              </p>
              <h3>What “device only” means</h3>
              <p>
                Records have not reached a cloud database. Connected cloud
                workspaces synchronise while online. Simultaneous offline sales
                can create stock conflicts; reconcile them against a physical
                count. Card and transfer entries record what staff entered, not
                confirmation from a payment provider.
              </p>
              <h3>Features in progress</h3>
              <p>
                Returns, split payments, and automatic stock-unit conversions
                are not available yet. View Subscription for proposed plans and
                pricing. Payment processing is not enabled yet.
              </p>
            </section>
          )}
          <footer className="main-footer">
            <span>
              Countiva · A little more control. A lot more possibility.
            </span>
            <span>
              <span className="live-dot" /> Device storage{" "}
              {ready ? "ready" : "loading"}
              {offlineReady ? " · Offline page ready" : ""}
            </span>
          </footer>
          {ready && (
            <div
              className={`account-save-status ${saveStatus?.pendingIds.length ? "pending" : ""}`}
              role="status"
            >
              {syncing
                ? "Saving your latest changes…"
                : saveStatus?.pendingIds.length
                  ? `${saveStatus.pendingIds.length} changes waiting to save to your account. Keep this device available.`
                  : saveStatus?.lastSyncedAt
                    ? "Your latest records are saved to your Countiva account."
                    : "Preparing your account records…"}
              <button
                className="text-button"
                onClick={() => setPage("Settings")}
              >
                Data & recovery
              </button>
            </div>
          )}
        </main>
      </div>
      <WorkspaceNavigator
        page={page}
        menuOpen={mobileMore}
        onNavigate={navigateWorkspace}
        onMore={() => {
          setMenuSearch("");
          setMobileMore(true);
        }}
      />
      {mobileMore && (
        <WorkspaceMenu
          businessName={initialWorkspace.name}
          query={menuSearch}
          onSearch={setMenuSearch}
          onClose={() => setMobileMore(false)}
          onNavigate={navigateWorkspace}
          busy={busy}
          syncing={syncing}
          onSignOut={() => {
            onExit().catch((e) => setError(e.message));
          }}
        />
      )}
      {modal && (
        <div className="modal-overlay">
          <section
            className={"modal " + (modal === "scan" ? "wide" : "")}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "product"
                ? "Add product"
                : modal === "receive"
                  ? "Receive stock"
                  : modal === "payment"
                    ? "Record debt repayment"
                    : "Scan stock"
            }
          >
            <div className="modal-heading">
              <div>
                <h2>
                  {modal === "product"
                    ? "Add a product"
                    : modal === "receive"
                      ? "Receive or adjust stock"
                      : modal === "payment"
                        ? "Record debt repayment"
                        : "From photo to stock"}
                </h2>
                <p>
                  {modal === "scan"
                    ? "Suggestions first. Your confirmation always."
                    : "Make your inventory a little clearer."}
                </p>
              </div>
              <button
                className="icon-btn"
                aria-label="Close dialog"
                onClick={() => {
                  setModal(null);
                  setError("");
                }}
              >
                <X size={20} />
              </button>
            </div>
            {error && (
              <div className="banner error" role="alert">
                {error}
              </div>
            )}
            {modal === "product" && (
              <form onSubmit={addProduct}>
                <label>
                  Product name
                  <input
                    name="name"
                    required
                    placeholder="e.g. Coca-Cola 50cl"
                    maxLength={120}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Category
                    <input name="category" placeholder="e.g. Drinks" />
                  </label>
                  <label>
                    Stock unit
                    <input
                      name="unit"
                      required
                      placeholder="e.g. carton of 24"
                    />
                  </label>
                  <label>
                    Cost per unit (₦)
                    <input
                      name="cost"
                      inputMode="decimal"
                      onInput={(e) => {
                        e.currentTarget.value = decimalInput(
                          e.currentTarget.value,
                        );
                      }}
                      required
                      defaultValue="0"
                    />
                  </label>
                  <label>
                    Selling price per unit (₦)
                    <input
                      name="price"
                      inputMode="decimal"
                      onInput={(e) => {
                        e.currentTarget.value = decimalInput(
                          e.currentTarget.value,
                        );
                      }}
                      required
                    />
                  </label>
                  <label>
                    Opening stock
                    <input
                      name="stock"
                      type="number"
                      min="0"
                      step="1"
                      required
                      defaultValue="0"
                    />
                  </label>
                  <label>
                    Low-stock threshold
                    <input
                      name="threshold"
                      type="number"
                      min="0"
                      step="1"
                      required
                      defaultValue="5"
                    />
                  </label>
                </div>
                <p className="form-note">
                  Quantities refer to the stock unit above. Pack conversions are
                  not automatic in this version.
                </p>
                <button
                  className="button primary full"
                  disabled={busy || !ready}
                >
                  Save product
                </button>
              </form>
            )}
            {modal === "receive" && (
              <form onSubmit={receive}>
                <ProductPicker
                  products={state.products}
                  name="product"
                  required
                />
                <label>
                  Quantity change
                  <input
                    name="quantity"
                    type="number"
                    step="1"
                    required
                    placeholder="e.g. 10 (or -2 for damage)"
                  />
                </label>
                <label>
                  Reason / supplier reference
                  <input
                    name="reason"
                    required
                    placeholder="e.g. Delivery from supplier / damaged goods"
                  />
                </label>
                <button
                  className="button primary full"
                  disabled={busy || !ready}
                >
                  Confirm stock change
                </button>
              </form>
            )}
            {modal === "payment" && (
              <form onSubmit={repay}>
                <label>
                  Outstanding sale
                  <select name="sale" required>
                    <option value="">Select customer and sale</option>
                    {state.sales
                      .filter((s) => paidFor(state, s) < s.total)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.customer} — SP-{s.id.slice(0, 8).toUpperCase()} —{" "}
                          {money(s.total - paidFor(state, s))}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Amount received (₦)
                  <input
                    name="amount"
                    required
                    inputMode="decimal"
                    onInput={(e) => {
                      e.currentTarget.value = decimalInput(
                        e.currentTarget.value,
                      );
                    }}
                  />
                </label>
                <label>
                  Payment method
                  <select name="method">
                    <option>Cash</option>
                    <option>Card (external terminal)</option>
                    <option>Bank transfer</option>
                  </select>
                </label>
                <p className="form-note">
                  This creates a separate payment record. It does not count as a
                  new sale or verify a bank payment.
                </p>
                <button className="button primary full" disabled={busy}>
                  Save repayment
                </button>
              </form>
            )}
            {modal === "scan" && (
              <>
                <div className="scan-layout">
                  <div>
                    <label className="upload-box">
                      <Camera size={32} />
                      <strong>Take or upload a stock photo</strong>
                      <span>JPEG, PNG or WebP · maximum 3 MB</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        onChange={(e) =>
                          e.target.files?.[0] && scanPhoto(e.target.files[0])
                        }
                      />
                    </label>
                    {image && (
                      <img
                        className="stock-photo"
                        src={image}
                        alt="Stock photo to review"
                      />
                    )}
                    <button
                      className="button secondary full"
                      disabled={!image || scanning || !online}
                      onClick={analyse}
                    >
                      <Camera size={16} />
                      {scanning
                        ? "Reading your photo…"
                        : "Suggest stock from photo"}
                    </button>
                    <p className="form-note">
                      Online connection and server-side Gemini configuration
                      required. Hidden stock and pack sizes may be
                      misidentified.
                    </p>
                  </div>
                  <div>
                    <h3>Review suggested items</h3>
                    <p className="scan-plan-context">
                      {entitlements?.scansUsed || 0} /{" "}
                      {entitlements?.scanLimit || 0} scans used this calendar
                      month. Review up to {entitlements?.scanItems || 0}{" "}
                      products per photo. Match existing products or create new
                      ones with your confirmed cost and selling price.
                    </p>
                    <p className="muted">
                      Match products and enter quantities in their configured
                      stock unit.
                    </p>
                    {scanning && (
                      <Skeleton
                        compact
                        label="Reading stock suggestions from your photo"
                      />
                    )}
                    {scan.map((row, i) => (
                      <div className="scan-row" key={i}>
                        <div>
                          <strong>{row.name}</strong>
                          <button
                            className="icon-btn"
                            aria-label="Remove suggested row"
                            onClick={() =>
                              setScan(scan.filter((_, j) => j !== i))
                            }
                          >
                            <X size={14} />
                          </button>
                        </div>
                        {row.unit && (
                          <small>
                            Detected package: {row.unit}. Check this matches the
                            selected product unit.
                          </small>
                        )}
                        <label>
                          Match product
                          <select
                            aria-label={`Match ${row.name}`}
                            value={row.productId}
                            onChange={(e) =>
                              setScan(
                                scan.map((r, j) =>
                                  j === i
                                    ? { ...r, productId: e.target.value }
                                    : r,
                                ),
                              )
                            }
                          >
                            <option value="">Choose matching product</option>
                            <option value="__new__">
                              Create a new product
                            </option>
                            {state.products.map((p) => (
                              <option value={p.id} key={p.id}>
                                {p.name} ({p.unit})
                              </option>
                            ))}
                          </select>
                        </label>
                        {row.productId === "__new__" && (
                          <div className="form-grid">
                            {(["name", "unit", "cost", "price"] as const).map(
                              (field) => (
                                <label key={field}>
                                  {
                                    {
                                      name: "Product name",
                                      unit: "Stock unit",
                                      cost: "Unit cost (₦)",
                                      price: "Selling price (₦)",
                                    }[field]
                                  }
                                  <input
                                    value={row[field] || ""}
                                    inputMode={
                                      field === "cost" || field === "price"
                                        ? "decimal"
                                        : "text"
                                    }
                                    maxLength={field === "name" ? 150 : 80}
                                    onChange={(e) =>
                                      setScan(
                                        scan.map((r, j) =>
                                          j === i
                                            ? {
                                                ...r,
                                                [field]:
                                                  field === "cost" ||
                                                  field === "price"
                                                    ? decimalInput(
                                                        e.target.value,
                                                      )
                                                    : e.target.value,
                                              }
                                            : r,
                                        ),
                                      )
                                    }
                                  />
                                </label>
                              ),
                            )}
                          </div>
                        )}
                        <label>
                          Quantity in{" "}
                          {state.products.find((p) => p.id === row.productId)
                            ?.unit || "selected product units"}
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={row.quantity}
                            onChange={(e) =>
                              setScan(
                                scan.map((r, j) =>
                                  j === i
                                    ? { ...r, quantity: Number(e.target.value) }
                                    : r,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                    ))}
                    <button
                      className="text-button"
                      disabled={
                        !scanTicket ||
                        scan.length >= (entitlements?.scanItems || 0)
                      }
                      onClick={() =>
                        setScan([
                          ...scan,
                          {
                            name: "Manual entry",
                            quantity: 1,
                            unit: "",
                            productId: "",
                          },
                        ])
                      }
                    >
                      <Plus size={16} /> Add review row manually
                    </button>
                  </div>
                </div>
                <button
                  className="button primary full"
                  disabled={!scan.length || busy || !scanTicket || !online}
                  onClick={confirmScan}
                >
                  <Check size={17} /> Confirm reviewed stock
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {receipt && (
        <div className="modal-overlay receipt-overlay">
          <section
            className={`modal receipt ${receiptEditing ? "is-editing" : ""}`}
            style={
              {
                "--receipt-width": `${receipt.branding?.width || workspace?.receipt_width || 80}mm`,
              } as React.CSSProperties
            }
            role="dialog"
            aria-modal="true"
            aria-label="Sale receipt"
          >
            <ReceiptDocument
              sale={receipt}
              state={state}
              workspace={workspace || initialWorkspace}
            />
            <ReceiptEditor
              key={receipt.id}
              businessId={initialWorkspace.id}
              sale={receipt}
              onEditingChange={setReceiptEditing}
              onPrepare={async () => {
                if (syncInFlight.current)
                  throw new Error(
                    "Your sale is still being saved. Wait a moment, then reload the receipt.",
                  );
                await syncCloud();
              }}
              onSaved={(updated) => {
                setReceipt(updated);
                void syncCloud().catch(() => {});
              }}
            />
            <div className="receipt-actions">
              <button
                className="button secondary"
                onClick={() => setReceipt(null)}
              >
                Close
              </button>
              <button
                className="button primary"
                disabled={receiptEditing}
                onClick={() => window.print()}
              >
                Print / Save PDF
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
