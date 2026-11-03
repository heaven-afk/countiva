import Brand from "./brand";
import Skeleton from "./skeleton";

export default function Loading() {
  return (
    <main className="route-loading">
      <Brand />
      <Skeleton label="Opening Countiva" />
    </main>
  );
}
