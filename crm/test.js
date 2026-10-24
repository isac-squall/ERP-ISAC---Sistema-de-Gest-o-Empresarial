const assert = require('assert');
const db = require('../database');
const crm = require('./index');

assert.strictEqual(crm.normalizarEtapa('qualificado'), 'Qualificacao');
assert.strictEqual(crm.normalizarEtapa('fechado'), 'Ganho');
assert.strictEqual(crm.normalizarOrigem('whats'), 'WhatsApp');
assert.strictEqual(crm.probabilidadeDaEtapa('Proposta'), 50);
assert.strictEqual(crm.transicaoEtapa('Lead', 'Proposta'), 'Proposta');
try {
  crm.transicaoEtapa('Ganho', 'Lead');
  assert.fail('ganho nao reabre');
} catch (e) {
  assert.ok(/nao muda/i.test(e.message));
}

const p = crm.payloadOportunidade({ titulo: 'Kit festa', valor: 1200.5, etapa: 'Lead', origem: 'WhatsApp' });
assert.strictEqual(p.titulo, 'Kit festa');
assert.strictEqual(p.valor, 1200.5);
assert.strictEqual(p.probabilidade, 10);

try {
  crm.payloadOportunidade({ titulo: '' });
  assert.fail('titulo obrigatorio');
} catch (e) {
  assert.ok(/obrigatorio/i.test(e.message));
}

const MARK = 'CRM-TESTE';
const tx = db.transaction(() => {
  const cli = db.prepare('INSERT INTO clientes (nome, telefone) VALUES (?,?)').run(`${MARK} Ana`, '84999990000');
  const id = db.prepare(`INSERT INTO crm_oportunidades
    (titulo, cliente_id, cliente_nome, valor, etapa, probabilidade, origem, observacao)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    `${MARK} Festa`, cli.lastInsertRowid, `${MARK} Ana`, 1500, 'Lead', 10, 'WhatsApp', MARK
  ).lastInsertRowid;
  db.prepare(`INSERT INTO crm_oportunidades
    (titulo, cliente_nome, valor, etapa, probabilidade, origem, observacao)
    VALUES (?,?,?,?,?,?,?)`).run(`${MARK} Perdida`, 'Joao', 800, 'Perdido', 0, 'Loja', MARK);
  db.prepare(`INSERT INTO crm_oportunidades
    (titulo, cliente_nome, valor, etapa, probabilidade, origem, observacao)
    VALUES (?,?,?,?,?,?,?)`).run(`${MARK} Ganha`, 'Maria', 2000, 'Ganho', 100, 'Indicacao', MARK);

  const rows = db.prepare('SELECT * FROM crm_oportunidades WHERE observacao=?').all(MARK);
  const resumo = crm.resumirFunil(rows);
  assert.strictEqual(resumo.total, 3);
  assert.strictEqual(resumo.abertas, 1);
  assert.strictEqual(resumo.ganhas, 1);
  assert.strictEqual(resumo.perdidas, 1);
  assert.strictEqual(resumo.valor_aberto, 1500);
  assert.strictEqual(resumo.valor_ganho, 2000);
  assert.strictEqual(resumo.ponderado, 150);

  const kanban = crm.agruparKanban(rows);
  assert.strictEqual(kanban.Lead.length, 1);
  assert.strictEqual(kanban.Ganho.length, 1);

  const row = db.prepare('SELECT * FROM crm_oportunidades WHERE id=?').get(id);
  const nova = crm.transicaoEtapa(row.etapa, 'Negociacao');
  db.prepare('UPDATE crm_oportunidades SET etapa=?, probabilidade=? WHERE id=?')
    .run(nova, crm.probabilidadeDaEtapa(nova), id);
  const after = db.prepare('SELECT etapa, probabilidade FROM crm_oportunidades WHERE id=?').get(id);
  assert.strictEqual(after.etapa, 'Negociacao');
  assert.strictEqual(after.probabilidade, 70);

  console.log('CRM OK: funil, kanban e transicao');
  throw new Error('__ROLLBACK__');
});

let ok = false;
try { tx(); }
catch (e) {
  if (e.message === '__ROLLBACK__') ok = true;
  else throw e;
}
assert.ok(ok, 'transacao deveria ter feito rollback');
console.log('Todos os testes de CRM passaram (rollback aplicado, banco intacto).');
