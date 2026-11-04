"use client";
import { useEffect } from "react";
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
  return <AccessGate>{() => <OpenWorkspace />}</AccessGate>;
}
