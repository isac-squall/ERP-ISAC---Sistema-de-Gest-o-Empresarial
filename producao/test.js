const assert = require('assert');
const db = require('../database');
const producao = require('./index');

assert.strictEqual(producao.normalizarStatus('andamento'), 'Em producao');
assert.strictEqual(producao.transicaoStatus('Aberta', 'Em producao'), 'Em producao');
try {
  producao.transicaoStatus('Concluida', 'Aberta');
  assert.fail('concluida nao reabre');
} catch (e) {
  assert.ok(/nao muda/i.test(e.message));
}

const expl = producao.explodirBom([{ item_id: 1, quantidade: 2, descricao: 'Parafuso' }], 5);
assert.strictEqual(expl[0].quantidade, 10);

const faltas = producao.checarEstoque(expl, [{ id: 1, estoque: 3 }]);
assert.strictEqual(faltas.length, 1);
assert.strictEqual(faltas[0].falta, 7);

const abc = producao.curvaAbc([
  { produto_id: 1, nome: 'A', valor: 800 },
  { produto_id: 2, nome: 'B', valor: 150 },
  { produto_id: 3, nome: 'C', valor: 50 }
]);
assert.strictEqual(abc[0].classe, 'A');
assert.strictEqual(abc[2].classe, 'C');

const MARK = 'OP-TESTE';
const tx = db.transaction(() => {
  const mp = db.prepare(`INSERT INTO produtos (nome, codigo, preco, preco_custo, estoque, tipo)
    VALUES (?,?,?,?,?,?)`).run(`${MARK} MP`, 'MP1', 1, 1, 20, 'produto').lastInsertRowid;
  const acab = db.prepare(`INSERT INTO produtos (nome, codigo, preco, preco_custo, estoque, tipo)
    VALUES (?,?,?,?,?,?)`).run(`${MARK} Kit`, 'KIT1', 50, 10, 0, 'kit').lastInsertRowid;
  db.prepare('INSERT INTO produto_composicao (produto_id, item_id, quantidade) VALUES (?,?,?)')
    .run(acab, mp, 2);
  const bom = db.prepare('SELECT item_id, quantidade FROM produto_composicao WHERE produto_id=?').all(acab);
  const precisa = producao.explodirBom(bom, 3);
  assert.strictEqual(precisa[0].quantidade, 6);
  const falta = producao.checarEstoque(precisa, [{ id: mp, estoque: 20 }]);
  assert.strictEqual(falta.length, 0);

  const opId = db.prepare(`INSERT INTO ordens_producao (produto_id, quantidade, status, observacao)
    VALUES (?,?,?,?)`).run(acab, 3, 'Aberta', MARK).lastInsertRowid;
  db.prepare('INSERT INTO ordem_producao_itens (op_id, item_id, quantidade) VALUES (?,?,?)')
    .run(opId, mp, precisa[0].quantidade);
  db.prepare('UPDATE ordens_producao SET status=? WHERE id=?').run(
    producao.transicaoStatus('Aberta', 'Em producao'), opId
  );
  db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id=?').run(precisa[0].quantidade, mp);
  db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id=?').run(3, acab);
  db.prepare('UPDATE ordens_producao SET status=? WHERE id=?').run('Concluida', opId);
  const mpAfter = db.prepare('SELECT estoque FROM produtos WHERE id=?').get(mp);
  const acabAfter = db.prepare('SELECT estoque FROM produtos WHERE id=?').get(acab);
  assert.strictEqual(mpAfter.estoque, 14);
  assert.strictEqual(acabAfter.estoque, 3);
  const rows = db.prepare('SELECT * FROM ordens_producao WHERE observacao=?').all(MARK);
  assert.strictEqual(producao.resumirOps(rows).concluidas, 1);
  console.log('Producao OK: BOM, OP e curva ABC');
  throw new Error('__ROLLBACK__');
});

let ok = false;
try { tx(); }
catch (e) {
  if (e.message === '__ROLLBACK__') ok = true;
  else throw e;
}
assert.ok(ok, 'transacao deveria ter feito rollback');
console.log('Todos os testes de producao passaram (rollback aplicado, banco intacto).');
