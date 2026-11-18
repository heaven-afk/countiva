import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt =
  "Countiva — inventory, sales and receipts for small businesses";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logo = await readFile(
    join(process.cwd(), "public/brand/countiva-192.png"),
  );
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#f1f0ec",
        color: "#252525",
        padding: 64,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 42 }}
      >
        <img
          src={`data:image/png;base64,${logo.toString("base64")}`}
          width={64}
          height={64}
          alt=""
        />
        <span>Countiva</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            display: "flex",
            fontSize: 72,
            lineHeight: 1.15,
            maxWidth: 1030,
          }}
        >
          Your stock. Your sales. Your business, in view.
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#62625d" }}>
          Inventory · Sales · Receipts · Customer credit
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 26 }}>countiva.shop</div>
    </div>,
    size,
  );
}
