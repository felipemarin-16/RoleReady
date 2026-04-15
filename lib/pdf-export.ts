import { jsPDF } from "jspdf";

export function downloadCoverLetterPdf(candidateName: string, coverLetterText: string) {
  const doc = new jsPDF({
    unit: "pt",
    format: "letter",
  });

  doc.setFillColor(244, 246, 251);
  doc.rect(0, 0, 612, 792, "F");

  doc.setTextColor(14, 23, 38);
  doc.setFont("times", "bold");
  doc.setFontSize(22);
  doc.text("RoleReady Cover Letter", 54, 64);

  doc.setFont("times", "normal");
  doc.setFontSize(12);
  const lines = doc.splitTextToSize(coverLetterText, 500);
  doc.text(lines, 54, 108, { lineHeightFactor: 1.5 });

  const safeName = candidateName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  doc.save(`${safeName || "candidate"}-cover-letter.pdf`);
}
