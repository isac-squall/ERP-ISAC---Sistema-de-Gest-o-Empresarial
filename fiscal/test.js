const assert = require('assert');
const db = require('../database');
const fiscal = require('./index');

assert.strictEqual(fiscal.normalizarModelo('nfe'), '55');
assert.strictEqual(fiscal.normalizarModelo('nfs-e'), 'NFS-e');
assert.strictEqual(fiscal.cfopPadrao('RN', 'SP', 'produto'), '6102');
assert.strictEqual(fiscal.cfopPadrao('RN', 'RN', 'produto'), '5102');

const calc = fiscal.calcularImpostos({
  itens: [{ descricao: 'Peca', quantidade: 2, preco_unitario: 50, ncm: '1234' }],
  crt: 1,
  ufEmit: 'RN',
  ufDest: 'RN',
  modelo: '55'
});
assert.strictEqual(calc.total_nota, 100);
assert.strictEqual(calc.itens[0].ncm, '00001234');
assert.strictEqual(calc.itens[0].cfop, '5102');

const payload = fiscal.payloadNota({
  modelo: '55',
  destinatario_nome: 'Cliente SA',
  destinatario_doc: '12345678000199',
  destinatario_uf: 'RN',
  crt: 1,
  uf_emit: 'RN',
  itens: [{ descricao: 'Peca', quantidade: 1, preco_unitario: 80 }]
});
assert.strictEqual(payload.total, 80);

try {
  fiscal.payloadNota({ modelo: '55', destinatario_nome: 'X', destinatario_doc: '1', itens: [{ quantidade: 1, preco: 1 }] });
  assert.fail('cpf/cnpj obrigatorio');
} catch (e) {
  assert.ok(/CPF ou CNPJ/i.test(e.message));
}

const chave = fiscal.chaveAcesso({
  cuf: '24', aamm: '2610', cnpj: '12345678000199', modelo: '55', serie: 1, numero: 1, cnf: '12345678'
});
assert.strictEqual(chave.length, 44);

const sim = fiscal.simularAutorizacao({
  modelo: '55', serie: 1, numero: 12, natureza: 'Venda', destinatario_nome: 'A', destinatario_doc: '12345678901',
  total: 80, calc
}, { cnpj: '12345678000199', razao: 'ERP ISAC', ie: '123', cuf: '24', ambiente: 'homologacao' });
assert.strictEqual(sim.status, 'Autorizada');
assert.ok(sim.xml.includes('infNFe'));

assert.strictEqual(fiscal.transicaoStatus('Rascunho', 'Autorizada'), 'Autorizada');
try {
  fiscal.transicaoStatus('Autorizada', 'Rascunho');
  assert.fail('autorizada so cancela');
} catch (e) {
  assert.ok(/cancela/i.test(e.message));
}

const MARK = 'FIS-TESTE';
const tx = db.transaction(() => {
  const cli = db.prepare('INSERT INTO clientes (nome, cpf_cnpj) VALUES (?,?)').run(`${MARK} SA`, '12345678000199');
  const nfeId = db.prepare(`INSERT INTO notas_fiscais
    (modelo, numero, serie, natureza, cliente_id, destinatario_nome, destinatario_doc, total, status, observacao)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    '55', 1, 1, 'Venda', cli.lastInsertRowid, `${MARK} SA`, '12345678000199', 80, 'Rascunho', MARK
  ).lastInsertRowid;
  db.prepare(`INSERT INTO nota_itens (nota_id, descricao, quantidade, preco_unitario, subtotal, ncm, cfop)
    VALUES (?,?,?,?,?,?,?)`).run(nfeId, 'Peca', 1, 80, 80, '00000000', '5102');
  const auth = fiscal.simularAutorizacao({
    modelo: '55', serie: 1, numero: 1, natureza: 'Venda',
    destinatario_nome: `${MARK} SA`, destinatario_doc: '12345678000199', total: 80,
    calc: { itens: [{ descricao: 'Peca', ncm: '00000000', cfop: '5102', quantidade: 1, preco_unitario: 80, subtotal: 80 }] }
  }, { cnpj: '12345678000199', razao: 'ERP', cuf: '24' });
  db.prepare('UPDATE notas_fiscais SET status=?, chave=?, protocolo=?, xml=? WHERE id=?')
    .run(auth.status, auth.chave, auth.protocolo, auth.xml, nfeId);
  const row = db.prepare('SELECT * FROM notas_fiscais WHERE id=?').get(nfeId);
  assert.strictEqual(row.status, 'Autorizada');
  assert.ok(row.chave);

  const nfseId = db.prepare(`INSERT INTO notas_fiscais
    (modelo, numero, serie, natureza, destinatario_nome, destinatario_doc, total, status, observacao)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    'NFS-e', 1, 1, 'Servico', 'Tomador', '12345678901', 200, 'Autorizada', MARK
  ).lastInsertRowid;
  assert.ok(nfseId);
  const rows = db.prepare('SELECT * FROM notas_fiscais WHERE observacao=?').all(MARK);
  const resumo = fiscal.resumirNotas(rows);
  assert.strictEqual(resumo.autorizadas, 2);
  console.log('Fiscal OK: NF-e, NFS-e e simulacao');
  throw new Error('__ROLLBACK__');
});

let ok = false;
try { tx(); }
catch (e) {
  if (e.message === '__ROLLBACK__') ok = true;
  else throw e;
}
assert.ok(ok, 'transacao deveria ter feito rollback');
console.log('Todos os testes fiscais passaram (rollback aplicado, banco intacto).');
