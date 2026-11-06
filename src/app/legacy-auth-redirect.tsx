"use client";
import { useEffect } from "react";
import { isLegacyRecovery, recoveryRedirect } from "../lib/auth-recovery";
export default function LegacyAuthRedirect() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (isLegacyRecovery(url)) {
      window.location.replace(recoveryRedirect(url));
      return;
    }
    const query = new URLSearchParams(window.location.search);
    if (
      ["invite", "choose", "next", "code"].some((key) => query.has(key)) ||
      /(?:access_token|type=recovery|error_description)=/.test(
        window.location.hash,
      )
    ) {
      window.location.replace(
        `/login${window.location.search}${window.location.hash}`,
      );
    }
  }, []);
  return null;
}
