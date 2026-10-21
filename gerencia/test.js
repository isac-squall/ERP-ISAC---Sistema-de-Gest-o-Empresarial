const assert = require('assert');
const db = require('../database');
const gerencia = require('./index');

assert.strictEqual(gerencia.normalizarStatusOrc('aberto'), 'Aberto');
assert.strictEqual(gerencia.normalizarStatusOrc('Aprovado'), 'Aprovado');
assert.strictEqual(gerencia.normalizarStatusOrc('cancelada'), 'Recusado');
assert.strictEqual(gerencia.transicaoOrc('Aberto', 'Aprovado'), 'Aprovado');
assert.strictEqual(gerencia.transicaoOrc('Aprovado', 'Convertido'), 'Convertido');
try {
  gerencia.transicaoOrc('Recusado', 'Aprovado');
  assert.fail('transicao invalida deveria falhar');
} catch (e) {
  assert.ok(/Nao e possivel/i.test(e.message));
}
try {
  gerencia.transicaoOrc('Convertido', 'Convertido');
  assert.fail('convertido nao pode repetir');
} catch (e) {
  assert.ok(/ja convertido/i.test(e.message));
}

const resumo = gerencia.resumirOrcamentos([
  { status: 'Aberto', total: 10 },
  { status: 'Aprovado', total: 20 },
  { status: 'Recusado', total: 5 },
  { status: 'Convertido', total: 40 }
]);
assert.strictEqual(resumo.total, 4);
assert.strictEqual(resumo.abertos, 1);
assert.strictEqual(resumo.aprovados, 1);
assert.strictEqual(resumo.valor, 30);

const itens = gerencia.itensParaVenda([
  { produto_id: 1, descricao: 'Camisa', quantidade: 2, preco_unitario: 15.5 }
]);
assert.strictEqual(itens[0].quantidade, 2);
assert.strictEqual(itens[0].preco_unitario, 15.5);

const fech = gerencia.calcularFechamento({ abertura: 100, entradas: 20, vendas: 50, saidas: 10 });
assert.strictEqual(fech.saldo, 160);
assert.strictEqual(gerencia.deltaInventario(10, 8), -2);
assert.strictEqual(gerencia.validarContagem(0), 0);
try {
  gerencia.validarContagem(-1);
  assert.fail('contagem negativa deveria falhar');
} catch (e) {
  assert.ok(/invalida/i.test(e.message));
}

const MARK = 'GERENCIA-TESTE';
const tx = db.transaction(() => {
  const orcId = db.prepare(`INSERT INTO orcamentos
    (cliente_nome, itens, subtotal, desconto, total, status, observacao)
    VALUES (?,?,?,?,?,?,?)`).run(
    `${MARK} Cliente`,
    JSON.stringify([{ produto_id: 1, descricao: 'Item', quantidade: 1, preco_unitario: 10 }]),
    10, 0, 10, 'Aberto', MARK
  ).lastInsertRowid;
  const row = db.prepare('SELECT * FROM orcamentos WHERE id=?').get(orcId);
  assert.strictEqual(gerencia.normalizarStatusOrc(row.status), 'Aberto');
  gerencia.transicaoOrc(row.status, 'Aprovado');
  db.prepare("UPDATE orcamentos SET status='Aprovado' WHERE id=?").run(orcId);
  const ok = db.prepare('SELECT status FROM orcamentos WHERE id=?').get(orcId);
  assert.strictEqual(ok.status, 'Aprovado');

  const fechId = db.prepare(`INSERT INTO caixa_fechamentos
    (aberto_em, fechado_em, valor_inicial, total_vendas, entradas, saidas, saldo, conferido)
    VALUES (?,?,?,?,?,?,?,0)`).run(
    '2026-10-20 08:00:00', '2026-10-20 18:00:00', 100, 50, 20, 10, 160
  ).lastInsertRowid;
  db.prepare('UPDATE caixa_fechamentos SET conferido=1, conferido_em=datetime(\'now\',\'localtime\') WHERE id=?').run(fechId);
  const conf = db.prepare('SELECT conferido FROM caixa_fechamentos WHERE id=?').get(fechId);
  assert.strictEqual(conf.conferido, 1);

  console.log('GERENCIA OK: orcamento, fechamento, inventario');
  throw new Error('__ROLLBACK__');
});

let ok = false;
try { tx(); }
catch (e) {
  if (e.message === '__ROLLBACK__') ok = true;
  else throw e;
}
assert.ok(ok, 'transacao deveria ter feito rollback');
console.log('Todos os testes de gerencia passaram (rollback aplicado, banco intacto).');
