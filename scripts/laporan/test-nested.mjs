import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>obj={dibuat} | a={dibuat.nama} | b={dibuat[nama]} | flat={dibuatNama}</w:t></w:r></w:p>
</w:body></w:document>`;

const zip = new PizZip();
zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
zip.file('word/document.xml', xml);

const doc = new Docxtemplater(zip, { paragraphLoop: true });
doc.render({ dibuat: { nama: 'Satria', jabatan: 'Programmer' }, tanggal: '5 Nov', project: 'X' });
const out = doc.getZip().file('word/document.xml').asText();
console.log(out.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g));
