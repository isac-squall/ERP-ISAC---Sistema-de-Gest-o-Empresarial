const zlib = require('zlib');

const COLUNAS = [
  { key: 'nome', aliases: ['nome', 'name', 'descricao_produto', 'produto_nome'] },
  { key: 'codigo', aliases: ['codigo', 'codigo_barras', 'codigobarras', 'ean', 'gtin', 'sku', 'barcode', 'cod'] },
  { key: 'descricao', aliases: ['descricao', 'description', 'obs', 'observacao'] },
  { key: 'preco', aliases: ['preco', 'preco_venda', 'venda', 'valor', 'price'] },
  { key: 'preco_custo', aliases: ['preco_custo', 'custo', 'cost'] },
  { key: 'estoque', aliases: ['estoque', 'qtd', 'quantidade', 'stock', 'saldo'] },
  { key: 'estoque_minimo', aliases: ['estoque_minimo', 'minimo', 'estoque_min'] },
  { key: 'categoria', aliases: ['categoria', 'category', 'grupo'] },
  { key: 'ncm', aliases: ['ncm'] },
  { key: 'cfop', aliases: ['cfop'] },
  { key: 'unidade', aliases: ['unidade', 'un', 'und'] },
  { key: 'origem', aliases: ['origem', 'origem_icms'] }
];

const FORMATOS = [
  { id: 'xlsx', label: 'Excel (.xlsx)', ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { id: 'xls', label: 'Excel XML (.xls)', ext: 'xls', mime: 'application/vnd.ms-excel' },
  { id: 'csv', label: 'CSV (.csv)', ext: 'csv', mime: 'text/csv; charset=utf-8' },
  { id: 'tsv', label: 'TSV (.tsv)', ext: 'tsv', mime: 'text/tab-separated-values; charset=utf-8' },
  { id: 'txt', label: 'Texto (.txt)', ext: 'txt', mime: 'text/plain; charset=utf-8' },
  { id: 'json', label: 'JSON (.json)', ext: 'json', mime: 'application/json; charset=utf-8' },
  { id: 'xml', label: 'XML (.xml)', ext: 'xml', mime: 'application/xml; charset=utf-8' },
  { id: 'sql', label: 'SQL (.sql)', ext: 'sql', mime: 'application/sql; charset=utf-8' },
  { id: 'html', label: 'HTML (.html)', ext: 'html', mime: 'text/html; charset=utf-8' },
  { id: 'md', label: 'Markdown (.md)', ext: 'md', mime: 'text/markdown; charset=utf-8' }
];

function headers() {
  return COLUNAS.map(c => c.key);
}

function normKey(v) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function mapHeader(name) {
  const n = normKey(name);
  for (const col of COLUNAS) {
    if (col.aliases.includes(n)) return col.key;
  }
  return null;
}

function xmlEscape(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sqlEscape(v) {
  if (v == null || v === '') return 'NULL';
  if (typeof v === 'number') return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",;\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function rowValues(p) {
  return headers().map(k => p[k] == null ? '' : p[k]);
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell); cell = '';
    } else if (ch === '\n') {
      row.push(cell); rows.push(row); row = []; cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

function detectDelimiter(text) {
  const first = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).find(l => l.trim()) || '';
  const counts = {
    '\t': (first.match(/\t/g) || []).length,
    ';': (first.match(/;/g) || []).length,
    ',': (first.match(/,/g) || []).length,
    '|': (first.match(/\|/g) || []).length
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ',';
}

function rowsToProdutos(table) {
  if (!table.length) return [];
  const map = table[0].map(mapHeader);
  const out = [];
  for (let i = 1; i < table.length; i++) {
    const item = {};
    table[0].forEach((_, idx) => {
      const key = map[idx];
      if (key) item[key] = table[i][idx] == null ? '' : String(table[i][idx]).trim();
    });
    if (Object.values(item).some(v => v !== '')) out.push(item);
  }
  return out;
}

function parseJson(text) {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : (data.produtos || data.data || data.items || []);
  if (!Array.isArray(arr)) throw new Error('JSON deve ser uma lista de produtos');
  return arr.map(obj => {
    const item = {};
    for (const [k, v] of Object.entries(obj || {})) {
      const key = mapHeader(k);
      if (key) item[key] = v == null ? '' : String(v).trim();
    }
    return item;
  }).filter(p => Object.values(p).some(v => v !== ''));
}

function parseXml(text) {
  const src = String(text);
  const blocos = src.match(/<(produto|item)[\s\S]*?<\/\1>/gi) || [];
  if (blocos.length) {
    const out = blocos.map(b => {
      const item = {};
      for (const col of COLUNAS) {
        const re = new RegExp(`<(${col.aliases.join('|')})[^>]*>([\\s\\S]*?)</\\1>`, 'i');
        const m = b.match(re);
        if (m) item[col.key] = m[2].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      }
      return item;
    }).filter(p => p.nome || p.codigo);
    if (out.length) return out;
  }
  const table = [];
  const rows = src.match(/<Row[\s\S]*?<\/Row>/gi) || [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<Cell[\s\S]*?<Data[^>]*>([\s\S]*?)<\/Data>/gi)].map(m => m[1].trim());
    if (cells.length) table.push(cells);
  }
  if (table.length >= 2) return rowsToProdutos(table);
  throw new Error('XML sem produtos reconheciveis');
}

function parseSql(text) {
  const out = [];
  const re = /INSERT\s+INTO\s+\w*produtos\w*\s*\(([^)]+)\)\s*VALUES\s*\(([\s\S]*?)\)\s*;/gi;
  let m;
  while ((m = re.exec(text))) {
    const cols = m[1].split(',').map(c => mapHeader(c.trim().replace(/[`"'[\]]/g, '')));
    const vals = [];
    let cur = '';
    let q = null;
    const raw = m[2];
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (q) {
        if (ch === q && raw[i + 1] === q) { cur += q; i++; }
        else if (ch === q) q = null;
        else cur += ch;
      } else if (ch === "'" || ch === '"') {
        q = ch;
      } else if (ch === ',') {
        vals.push(cur.trim()); cur = '';
      } else cur += ch;
    }
    vals.push(cur.trim());
    const item = {};
    cols.forEach((key, i) => {
      if (!key) return;
      let v = vals[i] || '';
      if (/^null$/i.test(v)) v = '';
      item[key] = v;
    });
    if (item.nome || item.codigo) out.push(item);
  }
  if (!out.length) throw new Error('SQL sem INSERT de produtos');
  return out;
}

function parseHtml(text) {
  const rows = [...String(text).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m =>
    [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(c => c[1].replace(/<[^>]+>/g, '').trim())
  ).filter(r => r.length);
  if (rows.length < 2) throw new Error('HTML sem tabela de produtos');
  return rowsToProdutos(rows);
}

function parseMd(text) {
  const lines = String(text).split(/\r?\n/).filter(l => /^\s*\|/.test(l) && !/^\s*\|?\s*-/.test(l));
  const rows = lines.map(l => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim()));
  if (rows.length < 2) throw new Error('Markdown sem tabela de produtos');
  return rowsToProdutos(rows);
}

function crc32(buf) {
  let c = 0xffffffff;
  const t = crc32.table || (crc32.table = (() => {
    const tab = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let x = n;
      for (let k = 0; k < 8; k++) x = (x & 1) ? (0xedb88320 ^ (x >>> 1)) : (x >>> 1);
      tab[n] = x >>> 0;
    }
    return tab;
  })());
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const crc = crc32(data);
    const localHead = Buffer.alloc(30);
    localHead.writeUInt32LE(0x04034b50, 0);
    localHead.writeUInt16LE(20, 4);
    localHead.writeUInt16LE(0, 6);
    localHead.writeUInt16LE(0, 8);
    localHead.writeUInt16LE(0, 10);
    localHead.writeUInt16LE(0, 12);
    localHead.writeUInt32LE(crc, 14);
    localHead.writeUInt32LE(data.length, 18);
    localHead.writeUInt32LE(data.length, 22);
    localHead.writeUInt16LE(name.length, 26);
    localHead.writeUInt16LE(0, 28);
    const localBuf = Buffer.concat([localHead, name, data]);
    local.push(localBuf);
    const cent = Buffer.alloc(46);
    cent.writeUInt32LE(0x02014b50, 0);
    cent.writeUInt16LE(20, 4);
    cent.writeUInt16LE(20, 6);
    cent.writeUInt16LE(0, 8);
    cent.writeUInt16LE(0, 10);
    cent.writeUInt16LE(0, 12);
    cent.writeUInt16LE(0, 14);
    cent.writeUInt32LE(crc, 16);
    cent.writeUInt32LE(data.length, 20);
    cent.writeUInt32LE(data.length, 24);
    cent.writeUInt16LE(name.length, 28);
    cent.writeUInt16LE(0, 30);
    cent.writeUInt16LE(0, 32);
    cent.writeUInt16LE(0, 34);
    cent.writeUInt16LE(0, 36);
    cent.writeUInt32LE(0, 38);
    cent.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cent, name]));
    offset += localBuf.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...local, centralBuf, end]);
}

function unzip(buf) {
  const files = {};
  let i = 0;
  while (i + 30 <= buf.length) {
    const sig = buf.readUInt32LE(i);
    if (sig !== 0x04034b50) break;
    const method = buf.readUInt16LE(i + 8);
    const comp = buf.readUInt32LE(i + 18);
    const uncomp = buf.readUInt32LE(i + 22);
    const nlen = buf.readUInt16LE(i + 26);
    const elen = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nlen).toString('utf8');
    const start = i + 30 + nlen + elen;
    const packed = buf.slice(start, start + comp);
    let data = packed;
    if (method === 8) data = zlib.inflateRawSync(packed);
    files[name] = data.toString('utf8');
    i = start + comp;
  }
  return files;
}

function colLetter(n) {
  let s = '';
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function toXlsx(produtos) {
  const cols = headers();
  const rows = [cols, ...produtos.map(rowValues)];
  const sheetRows = rows.map((r, ri) => {
    const cells = r.map((v, ci) => {
      const ref = colLetter(ci + 1) + (ri + 1);
      const num = ri > 0 && ['preco', 'preco_custo', 'estoque', 'estoque_minimo', 'origem'].includes(cols[ci]) && v !== '' && !Number.isNaN(Number(v));
      if (num) return `<c r="${ref}"><v>${Number(v)}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(v)}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
  const sheet =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${sheetRows}</sheetData></worksheet>`;
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Produtos" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';
  const wbRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>';
  const types =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>';
  return zipStore([
    { name: '[Content_Types].xml', data: types },
    { name: '_rels/.rels', data: rels },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: wbRels },
    { name: 'xl/worksheets/sheet1.xml', data: sheet }
  ]);
}

function parseXlsx(buf) {
  const files = unzip(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
  const sheet = files['xl/worksheets/sheet1.xml'] || Object.values(files).find(v => /<sheetData/i.test(v));
  if (!sheet) throw new Error('Planilha Excel sem dados');
  const shared = files['xl/sharedStrings.xml'] || '';
  const strings = [...shared.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]);
  const table = [];
  const rowXml = [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)];
  for (const row of rowXml) {
    const cells = [];
    for (const c of row[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const t = /t="s"/.test(c[1]) ? 's' : (/t="inlineStr"/.test(c[1]) ? 'i' : 'n');
      let val = '';
      if (t === 's') {
        const v = (c[2].match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        val = strings[Number(v)] || '';
      } else if (t === 'i') {
        val = (c[2].match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '';
      } else {
        val = (c[2].match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '';
      }
      cells.push(String(val).trim());
    }
    if (cells.some(Boolean)) table.push(cells);
  }
  if (table.length < 2) throw new Error('Excel sem linhas de produto');
  return rowsToProdutos(table);
}

function toCsv(produtos, delimiter = ',') {
  const cols = headers();
  const lines = [cols.join(delimiter)];
  for (const p of produtos) lines.push(rowValues(p).map(csvEscape).join(delimiter));
  return '\uFEFF' + lines.join('\r\n');
}

function toJson(produtos) {
  return JSON.stringify(produtos.map(p => {
    const o = {};
    for (const k of headers()) o[k] = p[k] == null ? '' : p[k];
    return o;
  }), null, 2);
}

function toXml(produtos) {
  const inner = produtos.map(p => {
    const tags = headers().map(k => `    <${k}>${xmlEscape(p[k])}</${k}>`).join('\n');
    return `  <produto>\n${tags}\n  </produto>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<produtos>\n${inner}\n</produtos>\n`;
}

function toSql(produtos) {
  const cols = headers().join(', ');
  const lines = ['-- ERP ISAC produtos', 'BEGIN;'];
  for (const p of produtos) {
    const vals = headers().map(k => {
      if (['preco', 'preco_custo', 'estoque', 'estoque_minimo', 'origem'].includes(k)) {
        const n = Number(p[k]);
        return Number.isFinite(n) ? String(n) : '0';
      }
      return sqlEscape(p[k]);
    }).join(', ');
    lines.push(`INSERT INTO produtos (${cols}) VALUES (${vals});`);
  }
  lines.push('COMMIT;');
  return lines.join('\n') + '\n';
}

function toHtml(produtos) {
  const cols = headers();
  const head = cols.map(c => `<th>${xmlEscape(c)}</th>`).join('');
  const body = produtos.map(p => `<tr>${rowValues(p).map(v => `<td>${xmlEscape(v)}</td>`).join('')}</tr>`).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Produtos</title></head><body><table><thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table></body></html>`;
}

function toMd(produtos) {
  const cols = headers();
  const head = '| ' + cols.join(' | ') + ' |';
  const sep = '| ' + cols.map(() => '---').join(' | ') + ' |';
  const body = produtos.map(p => '| ' + rowValues(p).map(v => String(v).replace(/\|/g, '\\|')).join(' | ') + ' |').join('\n');
  return head + '\n' + sep + '\n' + body + '\n';
}

function toXls(produtos) {
  const cols = headers();
  const header = cols.map(c => `<Cell><Data ss:Type="String">${xmlEscape(c)}</Data></Cell>`).join('');
  const body = produtos.map(p => {
    const cells = headers().map(k => {
      const v = p[k];
      const num = ['preco', 'preco_custo', 'estoque', 'estoque_minimo', 'origem'].includes(k) && v !== '' && !Number.isNaN(Number(v));
      return num
        ? `<Cell><Data ss:Type="Number">${Number(v)}</Data></Cell>`
        : `<Cell><Data ss:Type="String">${xmlEscape(v)}</Data></Cell>`;
    }).join('');
    return `<Row>${cells}</Row>`;
  }).join('\n');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Produtos"><Table>
<Row>${header}</Row>
${body}
</Table></Worksheet></Workbook>`;
}

function exportar(produtos, formato) {
  const id = String(formato || 'csv').toLowerCase();
  const meta = FORMATOS.find(f => f.id === id) || FORMATOS.find(f => f.id === 'csv');
  let body;
  if (id === 'xlsx') body = toXlsx(produtos);
  else if (id === 'xls') body = toXls(produtos);
  else if (id === 'tsv') body = toCsv(produtos, '\t');
  else if (id === 'txt') body = toCsv(produtos, ';');
  else if (id === 'json') body = toJson(produtos);
  else if (id === 'xml') body = toXml(produtos);
  else if (id === 'sql') body = toSql(produtos);
  else if (id === 'html') body = toHtml(produtos);
  else if (id === 'md') body = toMd(produtos);
  else body = toCsv(produtos, ',');
  return { ...meta, body };
}

function detectFormat(nome, texto, isBinary) {
  const ext = String(nome || '').toLowerCase().split('.').pop();
  if (FORMATOS.some(f => f.ext === ext)) return ext === 'txt' ? 'txt' : ext;
  if (isBinary) return 'xlsx';
  const t = String(texto || '').trim();
  if (t.startsWith('{') || t.startsWith('[')) return 'json';
  if (/INSERT\s+INTO/i.test(t)) return 'sql';
  if (/<Workbook|<produtos|<produto/i.test(t)) return 'xml';
  if (/<html|<table/i.test(t)) return 'html';
  if (/^\s*\|/.test(t)) return 'md';
  return 'csv';
}

function parse(conteudo, { formato, nomeArquivo } = {}) {
  const buf = Buffer.isBuffer(conteudo) ? conteudo : null;
  const isZip = buf && buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
  const texto = buf && !isZip ? buf.toString('utf8') : (typeof conteudo === 'string' ? conteudo : '');
  const tipo = formato || detectFormat(nomeArquivo, texto, isZip);
  if (tipo === 'xlsx' || isZip) return parseXlsx(buf || Buffer.from(conteudo, 'base64'));
  if (tipo === 'json') return parseJson(texto);
  if (tipo === 'sql') return parseSql(texto);
  if (tipo === 'xml' || tipo === 'xls') return parseXml(texto);
  if (tipo === 'html') return parseHtml(texto);
  if (tipo === 'md') return parseMd(texto);
  const delim = tipo === 'tsv' ? '\t' : tipo === 'txt' ? detectDelimiter(texto) : detectDelimiter(texto);
  return rowsToProdutos(parseDelimited(texto, delim));
}

function normalizar(item) {
  const nome = String(item.nome || '').trim();
  const codigo = String(item.codigo || '').trim();
  const preco = Number(String(item.preco || '0').replace(',', '.')) || 0;
  const estoque = parseInt(String(item.estoque || '0').replace(',', '.'), 10);
  const erros = [];
  if (!nome) erros.push('nome obrigatorio');
  if (!codigo) erros.push('codigo de barras obrigatorio');
  if (item.preco === '' || item.preco == null || Number.isNaN(Number(String(item.preco).replace(',', '.')))) erros.push('preco obrigatorio');
  if (item.estoque === '' || item.estoque == null || Number.isNaN(estoque)) erros.push('estoque obrigatorio');
  return {
    nome,
    codigo,
    descricao: String(item.descricao || '').trim(),
    preco,
    preco_custo: Number(String(item.preco_custo || '0').replace(',', '.')) || 0,
    estoque: Number.isFinite(estoque) ? estoque : 0,
    estoque_minimo: parseInt(item.estoque_minimo || '0', 10) || 0,
    categoria: String(item.categoria || '').trim(),
    ncm: String(item.ncm || '00000000').trim() || '00000000',
    cfop: String(item.cfop || '5102').trim() || '5102',
    unidade: String(item.unidade || 'UN').trim() || 'UN',
    origem: String(item.origem || '0').trim() || '0',
    erros
  };
}

function modelo(formato) {
  return exportar([{
    nome: 'COCA-COLA 2L',
    codigo: '7894900011517',
    descricao: 'Refrigerante 2L',
    preco: 8,
    preco_custo: 5,
    estoque: 20,
    estoque_minimo: 5,
    categoria: 'Bebidas',
    ncm: '22021000',
    cfop: '5102',
    unidade: 'UN',
    origem: '0'
  }], formato);
}

module.exports = { FORMATOS, headers, exportar, parse, normalizar, modelo };
