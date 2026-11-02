const assert = require('assert');
const db = require('../database');
const crm = require('./index');

assert.strictEqual(crm.normalizarEtapa('qualificado'), 'Qualificacao');
assert.strictEqual(crm.normalizarEtapa('fechado'), 'Ganho');
assert.strictEqual(crm.normalizarOrigem('whats'), 'WhatsApp');
assert.strictEqual(crm.probabilidadeDaEtapa('Proposta'), 50);
assert.strictEqual(crm.probabilidadeDaEtapa('Negociacao'), 80);
assert.strictEqual(crm.transicaoEtapa('Lead', 'Proposta'), 'Proposta');
assert.strictEqual(crm.etapaPorEventoOrcamento('criar'), 'Proposta');
assert.strictEqual(crm.etapaPorEventoOrcamento('aprovar'), 'Negociacao');
assert.strictEqual(crm.etapaPorEventoOrcamento('converter'), 'Ganho');
assert.strictEqual(crm.normalizarTags('vip, vip, urgente'), 'vip, urgente');
assert.strictEqual(crm.normalizarInteracao('ligacao'), 'Ligacao');
try {
  crm.transicaoEtapa('Ganho', 'Lead');
  assert.fail('ganho nao reabre');
} catch (e) {
  assert.ok(/nao muda/i.test(e.message));
}

const p = crm.payloadOportunidade({ titulo: 'Kit festa', valor: 1200.5, etapa: 'Lead', origem: 'WhatsApp', tags: 'vip' });
assert.strictEqual(p.titulo, 'Kit festa');
assert.strictEqual(p.valor, 1200.5);
assert.strictEqual(p.probabilidade, 10);
assert.strictEqual(p.tags, 'vip');

const custom = crm.payloadOportunidade({ titulo: 'X', valor: 100, etapa: 'Lead', probabilidade: 25 });
assert.strictEqual(custom.probabilidade, 25);

const cfg = crm.probsFromConfig({ crm_prob_negociacao: '75', Lead: 12 });
assert.strictEqual(cfg.Negociacao, 75);
assert.strictEqual(cfg.Lead, 12);
assert.strictEqual(crm.probabilidadeDaEtapa('Negociacao', cfg), 75);

try {
  crm.payloadOportunidade({ titulo: '' });
  assert.fail('titulo obrigatorio');
} catch (e) {
  assert.ok(/obrigatorio/i.test(e.message));
}

const MARK = 'CRM-TESTE';
const tx = db.transaction(() => {
  const cli = db.prepare('INSERT INTO clientes (nome, telefone, email) VALUES (?,?,?)')
    .run(`${MARK} Ana`, '84999990000', 'ana@teste.com');
  const id = db.prepare(`INSERT INTO crm_oportunidades
    (titulo, cliente_id, cliente_nome, valor, etapa, probabilidade, origem, observacao, tags)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    `${MARK} Festa`, cli.lastInsertRowid, `${MARK} Ana`, 1500, 'Lead', 10, 'WhatsApp', MARK, 'vip'
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
  assert.strictEqual(after.probabilidade, 80);

  crm.registrarInteracao(id, { tipo: 'Ligacao', descricao: 'Falou com a Ana', proximo_passo: 'Enviar proposta' }, null);
  const hist = crm.listarInteracoes(id);
  assert.ok(hist.length >= 1);
  assert.strictEqual(hist[0].tipo, 'Ligacao');

  const cli2 = db.prepare('INSERT INTO clientes (nome, telefone) VALUES (?,?)')
    .run(`${MARK} Bruno`, '84988880000').lastInsertRowid;
  const orc = db.prepare(`INSERT INTO orcamentos (cliente_id, cliente_nome, itens, subtotal, desconto, total, status, usuario_id)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    cli2, `${MARK} Bruno`, '[]', 900, 0, 900, 'Aberto', null
  );
  const criado = crm.avancarPorOrcamento({
    id: orc.lastInsertRowid, cliente_id: cli2, cliente_nome: `${MARK} Bruno`, total: 900
  }, 'criar');
  assert.ok(criado && criado.id);
  assert.strictEqual(criado.etapa, 'Proposta');
  assert.strictEqual(criado.probabilidade, 50);

  const aprovado = crm.avancarPorOrcamento({
    id: orc.lastInsertRowid, cliente_id: cli2, cliente_nome: `${MARK} Bruno`, total: 900,
    oportunidade_id: criado.id
  }, 'aprovar');
  assert.strictEqual(aprovado.etapa, 'Negociacao');
  assert.strictEqual(aprovado.probabilidade, 80);
  const naoVolta = crm.avancarPorOrcamento({
    id: orc.lastInsertRowid, cliente_id: cli2, oportunidade_id: criado.id, total: 900
  }, 'criar');
  assert.strictEqual(naoVolta.etapa, 'Negociacao');

  const ganho = crm.avancarPorOrcamento({
    id: orc.lastInsertRowid, cliente_id: cli2, total: 900, oportunidade_id: criado.id
  }, 'converter');
  assert.strictEqual(ganho.etapa, 'Ganho');

  const probs = crm.salvarProbs({ Lead: 15, Qualificacao: 30, Proposta: 50, Negociacao: 80 });
  assert.strictEqual(probs.Lead, 15);
  assert.strictEqual(crm.lerProbs().Lead, 15);
  crm.salvarProbs({ Lead: 10, Qualificacao: 30, Proposta: 50, Negociacao: 80 });

  console.log('CRM OK: funil, kanban, timeline, orcamento e probabilidade');
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
