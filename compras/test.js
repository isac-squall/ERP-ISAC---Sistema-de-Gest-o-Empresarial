const assert = require('assert');
const db = require('../database');
const compras = require('./index');
const tipos = require('../produtos/tipos');

function perto(a, b, msg) {
  assert.ok(Math.abs(Number(a) - Number(b)) < 0.005, `${msg}: esperado ${b}, obtido ${a}`);
}

assert.strictEqual(compras.normalizarStatus('aguardando'), 'Aguardando');
assert.strictEqual(compras.normalizarStatus('APROVADO'), 'Aprovado');
assert.strictEqual(compras.normalizarStatus('recusada'), 'Recusado');
assert.strictEqual(compras.normalizarStatus('Recebido'), 'Recebido');
assert.strictEqual(compras.normalizarForma('pix'), 'PIX');
assert.strictEqual(compras.normalizarForma(''), 'Boleto');
assert.strictEqual(compras.classeStatus('Aprovado'), 'compra-aprovado');
assert.ok(compras.podeEditar('Aguardando'));
assert.ok(!compras.podeEditar('Aprovado'));
assert.ok(compras.podeExcluir('Recusado'));
assert.ok(!compras.podeExcluir('Recebido'));
assert.strictEqual(compras.transicao('Aguardando', 'Aprovado'), 'Aprovado');
assert.strictEqual(compras.transicao('Aprovado', 'Recebido'), 'Recebido');
try {
  compras.transicao('Recebido', 'Aguardando');
  assert.fail('transicao invalida deveria falhar');
} catch (e) {
  assert.ok(e.message.includes('Nao e possivel'));
}

const itens = compras.validarItens([
  { produto_id: 1, descricao: 'Item A', quantidade: 2, preco_unitario: 10 },
  { produto_id: 2, descricao: 'Item B', quantidade: 1, preco_unitario: 5.5 }
]);
perto(compras.totalizar(itens), 25.5, 'total itens');
perto(itens[0].subtotal, 20, 'subtotal A');

const MARK = 'COMPRA-TESTE';
const tx = db.transaction(() => {
  const forn = db.prepare('INSERT INTO fornecedores (nome, ativo) VALUES (?,1)').run(`${MARK} Dist`).lastInsertRowid;
  const insP = db.prepare(`INSERT INTO produtos (nome, codigo, descricao, preco, preco_custo, estoque, estoque_minimo, categoria, tipo, controla_estoque, fracionado, unidade, ativo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`);
  const prod = insP.run(`${MARK} Prod`, 'CMP-P1', '', 20, 8, 4, 1, 'Teste', 'produto', 1, 0, 'UN').lastInsertRowid;
  const serv = insP.run(`${MARK} Serv`, 'CMP-S1', '', 50, 0, 0, 0, 'Teste', 'servico', 0, 0, 'UN').lastInsertRowid;

  const pedidoItens = compras.validarItens([
    { produto_id: prod, descricao: `${MARK} Prod`, quantidade: 3, preco_unitario: 8 },
    { produto_id: serv, descricao: `${MARK} Serv`, quantidade: 1, preco_unitario: 50 }
  ]);
  const valor = compras.totalizar(pedidoItens);
  perto(valor, 74, 'valor pedido');

  const pedidoId = db.prepare(`INSERT INTO compras
    (fornecedor_id, status, data_pedido, valor, forma_pagamento, observacao, usuario_id)
    VALUES (?,?,date('now','localtime'),?,?,?,NULL)`).run(
    forn, 'Aguardando', valor, 'Boleto', MARK
  ).lastInsertRowid;
  const insItem = db.prepare(`INSERT INTO compra_itens (compra_id, produto_id, descricao, quantidade, preco_unitario, subtotal)
    VALUES (?,?,?,?,?,?)`);
  for (const it of pedidoItens) {
    insItem.run(pedidoId, it.produto_id, it.descricao, it.quantidade, it.preco_unitario, it.subtotal);
  }

  const row = db.prepare('SELECT * FROM compras WHERE id = ?').get(pedidoId);
  assert.strictEqual(row.status, 'Aguardando');
  perto(row.valor, 74, 'valor salvo');

  const prox = compras.transicao(row.status, 'Aprovado');
  db.prepare('UPDATE compras SET status=? WHERE id=?').run(prox, pedidoId);
  assert.strictEqual(db.prepare('SELECT status FROM compras WHERE id=?').get(pedidoId).status, 'Aprovado');

  const estoqueAntes = Number(db.prepare('SELECT estoque FROM produtos WHERE id=?').get(prod).estoque);
  const itensPedido = db.prepare('SELECT * FROM compra_itens WHERE compra_id=?').all(pedidoId);
  for (const it of itensPedido) {
    if (!it.produto_id) continue;
    const p = db.prepare('SELECT * FROM produtos WHERE id=?').get(it.produto_id);
    const tipo = tipos.normalizarTipo(p.tipo);
    if (tipo === 'servico' || tipo === 'kit' || !tipos.controlaEstoque(p, tipo)) continue;
    const anterior = Number(p.estoque) || 0;
    const novo = tipos.arred(anterior + Number(it.quantidade));
    db.prepare('UPDATE produtos SET estoque=?, preco_custo=? WHERE id=?').run(novo, it.preco_unitario, p.id);
    db.prepare(`INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, estoque_anterior, estoque_novo, observacao)
      VALUES (?,?,?,?,?,?)`).run(p.id, 'entrada', it.quantidade, anterior, novo, `Compra #${pedidoId}`);
  }
  db.prepare(`INSERT INTO financeiro (tipo, categoria, descricao, valor, data_vencimento, status, fornecedor_id, origem)
    VALUES ('Despesa','Estoque',?,?,date('now','localtime'),'Pendente',?,'compra')`).run(
    `Compra #${pedidoId}`, valor, forn
  );
  db.prepare('UPDATE compras SET status=?, financeiro_id=(SELECT id FROM financeiro WHERE origem=? ORDER BY id DESC LIMIT 1) WHERE id=?')
    .run('Recebido', 'compra', pedidoId);

  const estoqueDepois = Number(db.prepare('SELECT estoque FROM produtos WHERE id=?').get(prod).estoque);
  perto(estoqueDepois, estoqueAntes + 3, 'entrada estoque na recepcao');
  const custo = Number(db.prepare('SELECT preco_custo FROM produtos WHERE id=?').get(prod).preco_custo);
  perto(custo, 8, 'custo atualizado');
  const estServ = Number(db.prepare('SELECT estoque FROM produtos WHERE id=?').get(serv).estoque);
  perto(estServ, 0, 'servico nao entra estoque');
  const fin = db.prepare("SELECT * FROM financeiro WHERE origem='compra' AND descricao=?").get(`Compra #${pedidoId}`);
  assert.ok(fin, 'conta a pagar gerada');
  perto(fin.valor, 74, 'valor a pagar');
  assert.strictEqual(fin.status, 'Pendente');
  assert.strictEqual(fin.tipo, 'Despesa');
  assert.strictEqual(fin.categoria, 'Estoque');

  const rec = db.prepare('SELECT status FROM compras WHERE id=?').get(pedidoId);
  assert.strictEqual(rec.status, 'Recebido');
  assert.ok(!compras.podeEditar(rec.status));
  assert.ok(!compras.podeExcluir(rec.status));

  const pedido2 = db.prepare(`INSERT INTO compras (fornecedor_id, status, data_pedido, valor, forma_pagamento)
    VALUES (?, 'Aguardando', date('now','localtime'), 10, 'PIX')`).run(forn).lastInsertRowid;
  db.prepare('UPDATE compras SET status=? WHERE id=?').run(compras.transicao('Aguardando', 'Recusado'), pedido2);
  assert.strictEqual(db.prepare('SELECT status FROM compras WHERE id=?').get(pedido2).status, 'Recusado');
  const estoqueAposRecusa = Number(db.prepare('SELECT estoque FROM produtos WHERE id=?').get(prod).estoque);
  perto(estoqueAposRecusa, estoqueDepois, 'recusa nao mexe estoque');

  const lista = db.prepare('SELECT * FROM compras WHERE observacao=? OR id=?').all(MARK, pedido2);
  const resumo = compras.resumir([
    { status: 'Aguardando', valor: 10 },
    { status: 'Aprovado', valor: 20 },
    { status: 'Recusado', valor: 99 },
    { status: 'Recebido', valor: 74 }
  ]);
  assert.strictEqual(resumo.total, 4);
  assert.strictEqual(resumo.aguardando, 1);
  assert.strictEqual(resumo.aprovados, 1);
  assert.strictEqual(resumo.recusados, 1);
  assert.strictEqual(resumo.recebidos, 1);
  perto(resumo.valor, 104, 'resumo ignora recusado');
  assert.ok(lista.length >= 1);

  console.log('COMPRAS OK: criar, aprovar, recusar, receber (estoque + a pagar)');
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
console.log('Todos os testes de compras passaram (rollback aplicado, banco intacto).');
