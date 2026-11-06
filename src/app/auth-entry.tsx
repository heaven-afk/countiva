"use client";
import { useEffect, useState } from "react";
import { isLegacyRecovery, recoveryRedirect } from "../lib/auth-recovery";
import AccessGate from "./access-gate";
import Skeleton from "./skeleton";
function OpenWorkspace() {
  useEffect(() => {
    window.location.replace(`/workspace${window.location.search}`);
  }, []);
  return (
    <main className="route-loading">
      <Skeleton label="Opening your workspace" />
    </main>
  );
}
export default function AuthEntry() {
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (isLegacyRecovery(url)) {
      window.location.replace(recoveryRedirect(url));
      return;
    }
    setChecked(true);
  }, []);
  if (!checked)
    return (
      <main className="route-loading">
        <Skeleton label="Opening your account" />
      </main>
    );
  return <AccessGate>{() => <OpenWorkspace />}</AccessGate>;
}
