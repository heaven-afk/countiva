"use client";
import { useEffect } from "react";
export default function LegacyAuthRedirect() {
  useEffect(() => {
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
