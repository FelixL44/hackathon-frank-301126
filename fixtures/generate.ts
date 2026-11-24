// Writes the synthetic evidence files under fixtures/files/ from fixtures/cases.ts. Run: npm run fixtures:generate
// Everything here is fictitious: workshop, customer, plate and policy number. Photos are added by hand (PHOTOS.md).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { FIXTURE_CASES } from "./cases.ts";

async function estimatePdf(repairLines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = (lines: string[]) => {
    const p = doc.addPage([595, 842]); // A4
    lines.forEach((line, i) => p.drawText(line, { x: 56, y: 780 - i * 22, size: 11, font }));
  };
  page([
    "Oficina Exemplo, Lda. (fictícia, apenas para demonstração)",
    "Orçamento n.º ORC-2026-0457    Data: 20/11/2026",
    "Matrícula: AA-12-BC",
    "",
    ...repairLines.map((line, i) => `${i + 1}. ${line} ........ 240,00 EUR`),
    `${repairLines.length + 1}. Mão de obra (3 h) ........ 135,00 EUR`,
  ]);
  page(["Condições gerais", "Validade do orçamento: 30 dias.", "Peças sujeitas a disponibilidade."]);
  return doc.save();
}

const files: Record<string, string | Uint8Array> = {
  // F5: the corrected estimate that replaces the F3 one (used from HAC-13 on)
  "fixtures/F5/estimate-1.v2.pdf": await estimatePdf(["Reparação e pintura do para-choques dianteiro (corrigido)"]),
};
for (const fixture of Object.values(FIXTURE_CASES)) {
  for (const a of fixture.artifacts) {
    if (a.kind === "message") files[a.objectKey] = fixture.message;
    if (a.kind === "estimate") files[a.objectKey] = await estimatePdf(fixture.estimateLines);
  }
}

for (const [key, content] of Object.entries(files)) {
  const target = `fixtures/files/${key.slice("fixtures/".length)}`;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  console.log(`wrote ${target}`);
}
