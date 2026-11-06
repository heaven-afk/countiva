import type { Metadata } from "next";
import PasswordRecovery from "./recovery";
export const metadata: Metadata = {
  title: "Reset your password · Countiva",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default function ResetPasswordPage() {
  return <PasswordRecovery />;
}
