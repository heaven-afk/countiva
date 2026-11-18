function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error("Couldn’t prepare the receipt image."));
    reader.readAsDataURL(blob);
  });
}

export async function downloadReceipt(
  element: HTMLElement,
  reference: string,
): Promise<void> {
  const [{ toCanvas, getFontEmbedCSS }, { jsPDF }] = await Promise.all([
    import("html-to-image"),
    import("jspdf"),
  ]);
  await document.fonts.ready;
  const paperWidth = element.dataset.paperWidth === "58" ? 58 : 80;
  const pixelsPerMm = 96 / 25.4;
  const width = paperWidth * pixelsPerMm;
  const host = document.createElement("div");
  host.className = "receipt-export-host";
  const viewport = document.createElement("div");
  viewport.className = "receipt";
  viewport.style.cssText = `width:${width}px;position:relative;overflow:hidden;padding:0;margin:0;border:0;border-radius:0;box-shadow:none;background:#fafbf9;`;
  const receipt = element.cloneNode(true) as HTMLElement;
  receipt.style.width = `${width}px`;
  receipt.style.maxWidth = "none";
  receipt.style.margin = "0";
  viewport.append(receipt);
  host.append(viewport);
  document.body.append(host);

  try {
    for (const image of Array.from(receipt.querySelectorAll("img"))) {
      const source = image.getAttribute("src");
      if (!source) continue;
      if (!source.startsWith("data:")) {
        try {
          const result = await fetch(source, {
            signal: AbortSignal.timeout(15000),
          });
          if (!result.ok) throw new Error();
          image.src = await dataUrl(await result.blob());
        } catch {
          throw new Error(
            "Couldn’t include the business logo. Check your connection, or upload the logo in Settings instead of using an external image URL.",
          );
        }
      }
      await image.decode();
    }

    const fontEmbedCSS = await getFontEmbedCSS(receipt);
    const totalHeight = Math.ceil(receipt.getBoundingClientRect().height);
    // Export bounded slices so long receipts do not exceed mobile canvas limits.
    const maxHeight = 280 * pixelsPerMm;
    const rect = receipt.getBoundingClientRect();
    const boundaries = Array.from(
      receipt.querySelectorAll(
        ".receipt-item, .receipt-meta, .receipt-totals, .receipt-document-footer",
      ),
    )
      .map((node) => Math.ceil(node.getBoundingClientRect().bottom - rect.top))
      .filter((position) => position > 0);
    let offset = 0;
    let pdf: InstanceType<typeof jsPDF> | undefined;
    while (offset < totalHeight) {
      const limit = Math.min(totalHeight, Math.floor(offset + maxHeight));
      const safeBoundary = boundaries
        .filter((position) => position > offset + 100 && position <= limit)
        .at(-1);
      const end = limit === totalHeight ? totalHeight : safeBoundary || limit;
      const height = end - offset;
      viewport.style.height = `${height}px`;
      receipt.style.transform = `translateY(-${offset}px)`;
      receipt.style.transformOrigin = "top left";
      const canvas = await toCanvas(viewport, {
        width,
        height,
        pixelRatio: 3,
        fontEmbedCSS,
        backgroundColor: "#fafbf9",
      });
      const pageHeight = height / pixelsPerMm;
      const orientation = paperWidth > pageHeight ? "landscape" : "portrait";
      if (!pdf)
        pdf = new jsPDF({
          unit: "mm",
          format: [paperWidth, pageHeight],
          orientation,
          compress: true,
        });
      else pdf.addPage([paperWidth, pageHeight], orientation);
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        0,
        0,
        paperWidth,
        pageHeight,
      );
      offset = end;
    }
    if (!pdf) throw new Error("This receipt is empty.");
    pdf.setProperties({ title: `Receipt ${reference}`, creator: "Countiva" });
    await pdf.save(
      `Countiva-receipt-${reference.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 60)}.pdf`,
      { returnPromise: true },
    );
  } finally {
    host.remove();
  }
}
