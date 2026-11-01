const assert = require('assert');
const db = require('../database');
const contador = require('./index');
const backup = require('../backup');

const DE = '2099-02-01';
const ATE = '2099-02-28';
const MARK = 'CNT-XML-TESTE';

function nomesZip(buf) {
  const files = backup.unzipBuffers
    ? backup.unzipBuffers(buf)
    : (() => {
      const out = {};
      let i = 0;
      const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
      while (i + 30 <= data.length) {
        if (data.readUInt32LE(i) !== 0x04034b50) break;
        const nlen = data.readUInt16LE(i + 26);
        const elen = data.readUInt16LE(i + 28);
        const comp = data.readUInt32LE(i + 18);
        const name = data.slice(i + 30, i + 30 + nlen).toString('utf8');
        const start = i + 30 + nlen + elen;
        out[name] = data.slice(start, start + comp);
        i = start + comp;
      }
      return out;
    })();
  return Object.keys(files);
}

const tx = db.transaction(() => {
  const venda = db.prepare(`
    INSERT INTO vendas (cliente_id, total, desconto, forma_pagamento, status, criado_em)
    VALUES (NULL, 50, 0, 'Dinheiro', 'Concluída', ?)
  `).run(`${DE} 10:00:00`).lastInsertRowid;

  db.prepare(`
    INSERT INTO nfce (venda_id, chave, numero, serie, ambiente, status, xml, dh_emi, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(venda, '24123456780001996500100000000112345678901234', 1, 1, 'homologacao', 'autorizada',
    `<?xml version="1.0"?><NFe><infNFe Id="${MARK}-nfce"/></NFe>`, `${DE} 10:00:00`, `${DE} 10:00:00`);

  db.prepare(`
    INSERT INTO notas_fiscais (modelo, numero, serie, natureza, destinatario_nome, destinatario_doc, total, status, chave, xml, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run('55', 10, 1, 'Venda', `${MARK} Cliente`, '12345678000199', 80, 'Autorizada',
    '24123456780001995500100000001012345678901234',
    `<?xml version="1.0"?><NFe><infNFe Id="${MARK}-nfe"/></NFe>`, `${DE} 11:00:00`);

  db.prepare(`
    INSERT INTO notas_fiscais (modelo, numero, serie, natureza, destinatario_nome, destinatario_doc, total, status, chave, xml, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run('NFS-e', 20, 1, 'Servico', `${MARK} Tomador`, '12345678901', 200, 'Autorizada',
    'NFSE-2099-20',
    `<?xml version="1.0"?><NFSe><InfNfse Id="${MARK}-nfse"/></NFSe>`, `${DE} 12:00:00`);

  db.prepare(`
    INSERT INTO nfe_entrada (chave, numero, serie, modelo, emit_nome, emit_cnpj, valor, xml, status, data_emissao, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run('24112223330001815500100000007712345678901234', 77, 1, '55', `${MARK} Dist`,
    '11222333000181', 122.4,
    `<?xml version="1.0"?><NFe><infNFe Id="${MARK}-entrada"/></NFe>`,
    'Importada', DE, `${DE} 13:00:00`);

  const resumo = contador.resumoXmlFiscal({ de: DE, ate: ATE });
  assert.strictEqual(resumo.resumo.nfce, 1, '1 NFC-e');
  assert.strictEqual(resumo.resumo.nfe, 1, '1 NF-e 55');
  assert.strictEqual(resumo.resumo.nfse, 1, '1 NFS-e');
  assert.strictEqual(resumo.resumo.entradas, 1, '1 entrada');
  assert.strictEqual(resumo.resumo.total, 4);

  const z = contador.zipXmlFiscal({ de: DE, ate: ATE });
  assert.ok(z.buf && z.buf.length > 100, 'ZIP gerado');
  assert.ok(/^XML-fiscal-20990201-20990228\.zip$/.test(z.nome), z.nome);
  assert.strictEqual(z.qtd, 4);
  assert.deepStrictEqual(z.resumo, { nfce: 1, nfe: 1, nfse: 1, entradas: 1 });

  const nomes = nomesZip(z.buf);
  assert.ok(nomes.includes('MANIFESTO.txt'), 'manifesto');
  assert.ok(nomes.some(n => n.startsWith('NFCe/') && n.endsWith('.xml')), 'pasta NFCe');
  assert.ok(nomes.some(n => n.startsWith('NFe/') && n.endsWith('.xml')), 'pasta NFe');
  assert.ok(nomes.some(n => n.startsWith('NFSe/') && n.endsWith('.xml')), 'pasta NFSe');
  assert.ok(nomes.some(n => n.startsWith('Entradas/') && n.endsWith('.xml')), 'pasta Entradas');
  assert.strictEqual(nomes.filter(n => n.endsWith('.xml')).length, 4);

  const soNfce = contador.zipXmlNfe({ de: DE, ate: ATE });
  const nomesNfce = nomesZip(soNfce.buf);
  assert.ok(nomesNfce.every(n => n.startsWith('NFCe/')), nomesNfce.join(','));
  assert.strictEqual(nomesNfce.length, 1);

  try {
    contador.zipXmlFiscal({ de: '2098-01-01', ate: '2098-01-31' });
    assert.fail('periodo vazio deveria 404');
  } catch (e) {
    assert.strictEqual(e.status, 404);
  }

  console.log('Contador XML fiscal OK:', z.nome, nomes.join(', '));
  throw new Error('__ROLLBACK__');
});

let ok = false;
try { tx(); }
catch (e) {
  if (e.message === '__ROLLBACK__') ok = true;
  else throw e;
}
assert.ok(ok, 'transacao deveria ter feito rollback');
console.log('Todos os testes do Contador XML fiscal passaram (rollback aplicado, banco intacto).');
