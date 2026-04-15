type PositionedTextItem = {
  str: string;
  x: number;
  y: number;
};

function extractOrderedLines(items: unknown[]) {
  const textItems = items
    .map((item) => {
      if (
        !item ||
        typeof item !== "object" ||
        !("str" in item) ||
        !("transform" in item) ||
        !Array.isArray(item.transform)
      ) {
        return null;
      }

      const str = typeof item.str === "string" ? item.str.trim() : "";
      const transform = item.transform as number[];

      if (!str || transform.length < 6) {
        return null;
      }

      return {
        str,
        x: transform[4] ?? 0,
        y: transform[5] ?? 0,
      } satisfies PositionedTextItem;
    })
    .filter((item): item is PositionedTextItem => Boolean(item))
    .sort((left, right) => {
      if (Math.abs(right.y - left.y) > 2) {
        return right.y - left.y;
      }

      return left.x - right.x;
    });

  const rows: Array<{ y: number; items: PositionedTextItem[] }> = [];

  for (const item of textItems) {
    const existingRow = rows.find((row) => Math.abs(row.y - item.y) <= 2.5);

    if (existingRow) {
      existingRow.items.push(item);
      continue;
    }

    rows.push({
      y: item.y,
      items: [item],
    });
  }

  return rows
    .sort((left, right) => right.y - left.y)
    .map((row) =>
      row.items
        .sort((left, right) => left.x - right.x)
        .map((item) => item.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

export async function extractTextFromPdf(file: File) {
  const pdfjsLib = await import("pdfjs-dist");
  const workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  if (pdfjsLib.GlobalWorkerOptions.workerSrc !== workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  }

  const arrayBuffer = await file.arrayBuffer();
  const document = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const chunks: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageLines = extractOrderedLines(content.items);
    const pageText = pageLines.join("\n").trim();

    if (pageText) {
      chunks.push(pageText);
    }
  }

  return chunks.join("\n\n");
}
