"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Compass } from "lucide-react";
import "./workspace-tour.css";

export const workspaceTourSteps = [
  { page: "Overview", target: "menu", title: "Find your way around" },
  { page: "Inventory", target: "product", title: "Add your first product" },
  { page: "Record sale", target: "sale", title: "Record a sale" },
  {
    page: "Customers & credit",
    target: "credit",
    title: "Track customer credit",
  },
  {
    page: "Sales history",
    target: "history",
    title: "Find receipts and get help",
  },
] as const;

export function WorkspaceTourWelcome({
  onStart,
  onSkip,
}: {
  onStart: () => void;
  onSkip: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="workspace-tour-welcome"
      aria-labelledby="tour-welcome-title"
      aria-describedby="tour-welcome-description"
      onCancel={(event) => {
        event.preventDefault();
        onSkip();
      }}
    >
      <Compass size={28} aria-hidden="true" />
      <h2 id="tour-welcome-title">Welcome to Countiva</h2>
      <p id="tour-welcome-description">
        Take a five-step tour of your workspace. You’ll see where to add
        products, record sales and track what customers owe. You can follow
        along or just look around.
      </p>
      <div className="workspace-tour-actions">
        <button className="button primary" autoFocus onClick={onStart}>
          Start guided tour <ArrowRight size={16} />
        </button>
        <button className="button secondary" onClick={onSkip}>
          Skip for now
        </button>
      </div>
      <p>You can replay it anytime from Help &amp; Documentation.</p>
    </dialog>
  );
}

export function WorkspaceTour({
  index,
  page,
  hidden,
  canManageStock,
  onStep,
  onExit,
  onHelp,
}: {
  index: number;
  page: string;
  hidden: boolean;
  canManageStock: boolean;
  onStep: (step: number) => void;
  onExit: () => void;
  onHelp: () => void;
}) {
  const step = workspaceTourSteps[index];
  const onStepPage = page === step.page;
  const targetName =
    step.target === "product" && !canManageStock ? "catalogue" : step.target;
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const lastAnnounced = useRef(-1);

  useEffect(() => {
    if (hidden || !onStepPage || lastAnnounced.current === index) return;
    lastAnnounced.current = index;
    heading.current?.focus({ preventScroll: true });
    document
      .querySelector(`[data-tour-target="${targetName}"]`)
      ?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [index, hidden, onStepPage, targetName]);

  useEffect(() => {
    if (hidden || !panel.current) return;
    const element = panel.current;
    const shell = element.closest<HTMLElement>(".shell");
    const resize = new ResizeObserver(() => {
      shell?.style.setProperty(
        "--workspace-tour-height",
        `${element.offsetHeight}px`,
      );
    });
    resize.observe(element);
    return () => {
      resize.disconnect();
      shell?.style.removeProperty("--workspace-tour-height");
    };
  }, [hidden]);

  if (hidden) return null;
  const descriptions = [
    "Overview shows sales, stock and customer balances. Use the bottom navigator to switch tasks, or open the menu for all workspace pages.",
    canManageStock
      ? "Choose Add product. Enter its name, stock type, cost, selling price and opening stock. For later deliveries of the same product, use Receive stock."
      : "Inventory shows products, prices and stock counts. Ask a business owner or manager to add products and receive deliveries.",
    "Select an in-stock product and check the quantity under Current sale. Enter the payment details before saving. Countiva reduces stock when you save the sale.",
    "Unpaid and partly paid sales appear here. When money arrives, choose Record debt repayment and apply it to the original sale.",
    "Sales history lists past sales. Open a receipt from a sale to view or download it. To find this tour again, open More → Help & Documentation.",
  ];
  const last = index === workspaceTourSteps.length - 1;
  return (
    <aside
      ref={panel}
      className="workspace-tour-card"
      aria-labelledby="workspace-tour-title"
    >
      <div className="workspace-tour-top">
        <span className="eyebrow">
          Guide · {index + 1} of {workspaceTourSteps.length}
        </span>
        <button type="button" className="text-button" onClick={onExit}>
          {last ? "Finish tour" : "Exit tour"}
        </button>
      </div>
      <h2 id="workspace-tour-title" tabIndex={-1} ref={heading}>
        {step.title}
      </h2>
      <p>
        {onStepPage
          ? descriptions[index]
          : `Return to ${step.page} to follow this step on the workspace screen.`}
      </p>
      <div className="workspace-tour-actions">
        {index > 0 && (
          <button
            className="button secondary"
            onClick={() => onStep(index - 1)}
          >
            Back
          </button>
        )}
        {!onStepPage ? (
          <button className="button primary" onClick={() => onStep(index)}>
            Open {step.page}
          </button>
        ) : last ? (
          <button className="button primary" onClick={onHelp}>
            Open Help &amp; Documentation
          </button>
        ) : (
          <button className="button primary" onClick={() => onStep(index + 1)}>
            Next <ArrowRight size={16} />
          </button>
        )}
      </div>
    </aside>
  );
}
