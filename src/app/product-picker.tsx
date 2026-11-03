"use client";
import { useId, useState } from "react";
import type { Product } from "../lib/domain";

// A native list keeps keyboard selection and scrolling available beside search.
export default function ProductPicker({
  products,
  name,
  value,
  onChange,
  label = "Product",
  required = false,
}: {
  products: Product[];
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  required?: boolean;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState("");
  const selected = value ?? selection;
  const matches = products.filter((p) =>
    `${p.name} ${p.unit}`.toLowerCase().includes(search.toLowerCase()),
  );
  // Keep the selected option in the list so filtering never silently changes it.
  const options = products.filter(
    (p) => p.id === selected || matches.includes(p),
  );
  return (
    <fieldset className="product-picker">
      <legend>{label}</legend>
      <label htmlFor={`${id}-search`}>Find a product</label>
      <input
        id={`${id}-search`}
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-describedby={`${id}-hint`}
        placeholder="Type a name or stock unit"
      />
      <p id={`${id}-hint`} className="form-note">
        Type to filter, then select below. Scroll or use arrow keys to browse.
      </p>
      <label htmlFor={`${id}-list`}>
        Choose product{required ? " (required)" : ""}
      </label>
      <select
        id={`${id}-list`}
        name={name}
        size={5}
        required={required}
        value={selected}
        onChange={(event) => {
          setSelection(event.target.value);
          onChange?.(event.target.value);
        }}
      >
        <option value="">Select a product</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {p.unit}
            {p.id === selected ? " (selected)" : ""}
          </option>
        ))}
      </select>
      {!matches.length && (
        <p className="form-note" role="status">
          No matching products. Try another name.
        </p>
      )}
    </fieldset>
  );
}
