import { Flame } from "lucide-react";
import CountivaMark from "./countiva-mark";

export default function HotPlanMark() {
  return (
    <span
      className="hot-plan-mark"
      role="img"
      aria-label="Countiva logo on fire"
    >
      <Flame className="hot-plan-flame" aria-hidden="true" />
      <CountivaMark size={18} className="hot-plan-countiva" />
    </span>
  );
}
