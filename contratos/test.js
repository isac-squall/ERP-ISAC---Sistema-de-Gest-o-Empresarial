const assert = require('assert');
const db = require('../database');
const contratos = require('./index');

assert.strictEqual(contratos.normalizarPeriodicidade('mensal'), 'Mensal');
assert.strictEqual(contratos.mesesDaPeriodicidade('Trimestral'), 3);
assert.strictEqual(contratos.addMesesIso('2026-01-31', 1), '2026-02-28');
assert.strictEqual(contratos.proximoFaturamento('2026-01-10', 'Mensal', null), '2026-02-10');
assert.strictEqual(contratos.transicaoStatus('Ativo', 'Pausado'), 'Pausado');
try {
  contratos.transicaoStatus('Encerrado', 'Ativo');
  assert.fail('encerrado nao reabre');
} catch (e) {
  assert.ok(/nao reabre/i.test(e.message));
}

const MARK = 'CTR-TESTE';
const tx = db.transaction(() => {
  const cli = db.prepare('INSERT INTO clientes (nome, telefone) VALUES (?,?)').run(`${MARK} Empresa`, '84988880000');
  const payload = contratos.payloadContrato({
    cliente_id: cli.lastInsertRowid,
    descricao: `${MARK} Manutencao`,
    valor: 300,
    periodicidade: 'Mensal',
    inicio: '2026-01-10',
    dia_vencimento: 10,
    status: 'Ativo'
  });
  assert.strictEqual(payload.proximo_faturamento, '2026-01-10');
  const id = db.prepare(`INSERT INTO contratos
    (cliente_id, descricao, valor, periodicidade, dia_vencimento, inicio, status, proximo_faturamento, observacao)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    payload.cliente_id, payload.descricao, payload.valor, payload.periodicidade,
    payload.dia_vencimento, payload.inicio, payload.status, payload.proximo_faturamento, MARK
  ).lastInsertRowid;

  const c = db.prepare('SELECT * FROM contratos WHERE id=?').get(id);
  contratos.podeFaturar(c, '2026-01-10');
  try {
    contratos.podeFaturar(c, '2026-01-09');
    assert.fail('cedo demais');
  } catch (e) {
    assert.ok(/ainda nao chegou/i.test(e.message));
  }
  const apos = contratos.aposFaturar(c, '2026-01-10');
  assert.strictEqual(apos.proximo_faturamento, '2026-02-10');
  assert.strictEqual(apos.status, 'Ativo');

  db.prepare(`INSERT INTO financeiro
    (tipo, categoria, descricao, valor, data_vencimento, status, cliente_id, origem)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    'Receita', 'Contrato', `${MARK} fatura`, 300, '2026-01-10', 'Pendente', cli.lastInsertRowid, 'contrato'
  );

  const rows = db.prepare('SELECT * FROM contratos WHERE observacao=?').all(MARK);
  const resumo = contratos.resumirContratos(rows);
  assert.strictEqual(resumo.ativos, 1);
  assert.strictEqual(resumo.mrr, 300);

  console.log('Contratos OK: periodicidade, faturamento e MRR');
  throw new Error('__ROLLBACK__');
});

let ok = false;
try { tx(); }
catch (e) {
  if (e.message === '__ROLLBACK__') ok = true;
  else throw e;
}
assert.ok(ok, 'transacao deveria ter feito rollback');
console.log('Todos os testes de contratos passaram (rollback aplicado, banco intacto).');
