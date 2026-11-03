// Keep editable values compatible with the existing decimal-to-kobo parser.
export function decimalInput(value: string): string {
  const clean = value.replace(/[^\d.]/g, "");
  const [whole, ...fraction] = clean.split(".");
  return fraction.length ? `${whole}.${fraction.join("").slice(0, 2)}` : whole;
}

export function phoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 15);
  const prefix = value.trimStart().startsWith("+") ? "+" : "";
  // Nigerian local numbers: 0801 234 5678. International numbers retain +.
  return (
    prefix +
    (prefix
      ? digits.startsWith("234")
        ? [
            digits.slice(0, 3),
            digits.slice(3, 6),
            digits.slice(6, 9),
            digits.slice(9),
          ]
            .filter(Boolean)
            .join(" ")
        : digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim()
      : [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7)]
          .filter(Boolean)
          .join(" "))
  );
}
