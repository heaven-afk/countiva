import CountivaMark from "./countiva-mark";
export default function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <a
      className={`brand countiva-brand ${inverse ? "brand-inverse" : ""}`}
      href="/"
      aria-label="Countiva home"
    >
      <CountivaMark size={38} inverse={inverse} />
      <span>Countiva</span>
    </a>
  );
}
