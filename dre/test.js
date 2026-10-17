// Teste do DRE. Roda dentro de uma transacao e faz rollback no final,
// sem alterar o erp.db.
const assert = require('assert');
const db = require('../database');
const dre = require('./');

// Periodo isolado (sem dados reais) para o teste ser deterministico.
const DE = '2099-01-01';
const ATE = '2099-01-31';
const MARK = 'DRE-TESTE';

function insertVenda(total, desconto) {
  return db.prepare(`
    INSERT INTO vendas (cliente_id, total, desconto, forma_pagamento, status, criado_em)
    VALUES (NULL, ?, ?, 'Dinheiro', 'Concluída', ?)
  `).run(total, desconto || 0, `${DE} 10:00:00`).lastInsertRowid;
}

function insertItem(vendaId, { subtotal, quantidade = 1, custo = 0, osId = null, descricao = MARK }) {
  return db.prepare(`
    INSERT INTO venda_itens (venda_id, produto_id, descricao, quantidade, preco_unitario, subtotal, os_id, preco_custo)
    VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
  `).run(vendaId, descricao, quantidade, subtotal / quantidade, subtotal, osId, custo).lastInsertRowid;
}

function insertFin({ tipo, categoria, descricao, valor, origem = null, vendaId = null, status = 'Pago' }) {
  return db.prepare(`
    INSERT INTO financeiro (tipo, categoria, descricao, valor, data_vencimento, data_pagamento, status, venda_id, origem)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tipo, categoria, descricao, valor, DE, DE, status, vendaId, origem).lastInsertRowid;
}

function perto(a, b, msg) {
  assert.ok(Math.abs(Number(a) - Number(b)) < 0.005, `${msg}: esperado ${b}, obtido ${a}`);
}

const tx = db.transaction(() => {
  // ---- Vendas ----
  const vA = insertVenda(90, 10);
  insertItem(vA, { subtotal: 100, quantidade: 2, custo: 30 }); // produto: CMV 60
  const vB = insertVenda(30, 0);
  insertItem(vB, { subtotal: 30, quantidade: 1, custo: 10 }); // produto: CMV 10
  const vC = insertVenda(200, 0);
  insertItem(vC, { subtotal: 200, quantidade: 1, custo: 999, osId: 999999 }); // servico: sem CMV

  // ---- Receitas manuais (servicos) ----
  insertFin({ tipo: 'Receita', categoria: 'Servico', descricao: `${MARK} Reparo de placa-mae`, valor: 680 });
  insertFin({ tipo: 'Receita', categoria: 'Servico', descricao: `${MARK} Fornecimento de pecas`, valor: 1890 });

  // ---- Despesas ----
  insertFin({ tipo: 'Despesa', categoria: 'Compra de estoque', descricao: `${MARK} Pecas e acessorios para estoque`, valor: 1250 });
  insertFin({ tipo: 'Despesa', categoria: 'Taxa operadora', descricao: `${MARK} Taxa PIX venda`, valor: 0.25, origem: 'taxa-operadora' });
  insertFin({ tipo: 'Despesa', categoria: 'Taxa operadora', descricao: `${MARK} Taxa credito venda`, valor: 0.88, origem: 'taxa-operadora' });
  insertFin({ tipo: 'Despesa', categoria: 'Sangria', descricao: `${MARK} Sangria`, valor: 10, origem: 'sangria' });
  insertFin({ tipo: 'Despesa', categoria: 'DAS Simples', descricao: `${MARK} Imposto DAS`, valor: 50 });

  const r = dre.gerarDre({ de: DE, ate: ATE });
  const s = r.resumo;

  perto(s.receita_produtos, 130, 'receita produtos');
  perto(s.receita_servicos, 200, 'receita servicos');
  perto(s.outras_receitas, 2570, 'outras receitas');
  perto(s.receita_bruta, 2900, 'receita bruta');
  perto(s.descontos, 10, 'descontos');
  perto(s.impostos, 50, 'impostos');
  perto(s.deducoes, 60, 'deducoes totais');
  perto(s.receita_liquida, 2840, 'receita liquida');
  perto(s.cmv, 70, 'cmv');
  perto(s.lucro_bruto, 2770, 'lucro bruto');
  perto(s.despesas_comerciais, 1.13, 'despesas comerciais');
  perto(s.despesas_administrativas, 10, 'despesas administrativas');
  perto(s.despesas_operacionais, 11.13, 'despesas operacionais');
  perto(s.resultado_operacional, 2758.87, 'resultado operacional');
  perto(s.resultado_financeiro, 0, 'resultado financeiro');
  perto(s.lucro_liquido, 2758.87, 'lucro liquido');

  // Estoque fora do DRE
  assert.ok(r.ignorados.some(x => /estoque/i.test(x.descricao)), 'compra de estoque deve ficar fora do DRE');

  // ---- Cancelamento nao entra no faturamento ----
  const vD = insertVenda(500, 0);
  insertItem(vD, { subtotal: 500, quantidade: 1, custo: 0 });
  db.prepare("UPDATE vendas SET status='Cancelada' WHERE id=?").run(vD);
  const r2 = dre.gerarDre({ de: DE, ate: ATE });
  perto(r2.resumo.receita_bruta, 2900, 'venda cancelada nao soma');

  // ---- Classificacao ----
  assert.strictEqual(dre.classificar({ tipo: 'Despesa', categoria: 'Taxa operadora' }), 'comercial');
  assert.strictEqual(dre.classificar({ tipo: 'Despesa', categoria: 'Aluguel' }), 'administrativa');
  assert.strictEqual(dre.classificar({ tipo: 'Despesa', categoria: 'DAS Simples' }), 'imposto');
  assert.strictEqual(dre.classificar({ tipo: 'Despesa', categoria: 'Juros' }), 'financeira');
  assert.strictEqual(dre.classificar({ tipo: 'Despesa', categoria: 'Compra de estoque' }), 'ignorar');
  assert.strictEqual(dre.classificar({ tipo: 'Receita', categoria: 'Suprimento', origem: 'suprimento' }), 'ignorar');

  console.log('DRE OK: receita bruta', s.receita_bruta, '| lucro liquido', s.lucro_liquido);
  throw new Error('__ROLLBACK__');
});

let ok = false;
try {
  tx();
} catch (e) {
  if (e.message === '__ROLLBACK__') ok = true;
  else throw e;
}
assert.ok(ok, 'transacao deveria ter feito rollback');
console.log('Todos os testes do DRE passaram (rollback aplicado, banco intacto).');
