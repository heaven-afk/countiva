import { CircleAlert, Check } from "lucide-react";
export default function AuthNotice({
  children,
  tone = "error",
}: {
  children: React.ReactNode;
  tone?: "error" | "info";
}) {
  return (
    <div
      className={"banner auth-notice auth-notice-" + tone}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "error" ? <CircleAlert size={18} /> : <Check size={18} />}
      <span>{children}</span>
    </div>
  );
}
