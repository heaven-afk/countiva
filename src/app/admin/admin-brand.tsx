import CountivaMark from "../countiva-mark";
export default function AdminBrand() {
  return (
    <a className="admin-brand" href="/admin" aria-label="Countiva Admin home">
      <CountivaMark size={44} />
      <span>
        <strong>Countiva</strong>
        <small>ADMIN</small>
      </span>
    </a>
  );
}
