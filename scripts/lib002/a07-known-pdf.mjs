// Independent source-of-truth fixture. Six physical pages, two root bookmarks,
// unique ASCII text on every page except the deliberately blank review page.
export const titleFor = n => n <= 3 ? 'First unit' : 'Second unit'
export const textFor = (tag,n) => n === 5 ? '' : `A07 ${tag} page ${n}`
export function knownPdf(tag) {
  if (!/^[a-z]+$/.test(tag)) throw Error('fixture tag must be lowercase ASCII')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /Outlines 4 0 R >>',
    '<< /Type /Pages /Count 6 /Kids [7 0 R 9 0 R 11 0 R 13 0 R 15 0 R 17 0 R] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Outlines /First 5 0 R /Last 6 0 R /Count 2 >>',
    '<< /Title (First unit) /Parent 4 0 R /Next 6 0 R /Dest [7 0 R /Fit] >>',
    '<< /Title (Second unit) /Parent 4 0 R /Prev 5 0 R /Dest [13 0 R /Fit] >>',
  ]
  for(let n=1;n<=6;n++){
    const stream=n===5?'q Q':`BT /F1 14 Tf 24 96 Td (${textFor(tag,n)}) Tj ET`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 450 300] /Resources << /Font << /F1 3 0 R >> >> /Contents ${6+2*n} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  }
  let body='%PDF-1.4\n'; const xref=['0000000000 65535 f ']
  for(const [i,o] of objects.entries()){xref.push(String(body.length).padStart(10,'0')+' 00000 n ');body+=`${i+1} 0 obj\n${o}\nendobj\n`}
  return Buffer.from(body+`xref\n0 ${xref.length}\n${xref.join('\n')}\ntrailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF\n`,'ascii')
}
