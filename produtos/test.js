const assert = require('assert');
const db = require('../database');
const tipos = require('./tipos');

function perto(a, b, msg) {
  assert.ok(Math.abs(Number(a) - Number(b)) < 0.005, `${msg}: esperado ${b}, obtido ${a}`);
}

assert.strictEqual(tipos.normalizarTipo('Serviço'), 'servico');
assert.strictEqual(tipos.normalizarTipo('PESAVEL'), 'pesavel');
assert.strictEqual(tipos.normalizarTipo('kit'), 'kit');
assert.strictEqual(tipos.normalizarTipo(''), 'produto');
assert.strictEqual(tipos.controlaEstoque({ tipo: 'servico' }), false);
assert.strictEqual(tipos.controlaEstoque({ tipo: 'produto', controla_estoque: 1 }), true);
assert.strictEqual(tipos.ehFracionado({ tipo: 'pesavel' }), true);
assert.strictEqual(tipos.ehFracionado({ tipo: 'produto', fracionado: 1 }), true);
assert.strictEqual(tipos.calcularEstoqueDisponivel({ tipo: 'servico' }), null);
perto(tipos.calcularEstoqueDisponivel({ tipo: 'pesavel', estoque: 1.25, controla_estoque: 1 }), 1.25, 'pesavel');

const MARK = 'TIPO-TESTE';
const tx = db.transaction(() => {
  const ins = db.prepare(`INSERT INTO produtos (nome, codigo, descricao, preco, preco_custo, estoque, estoque_minimo, categoria, tipo, controla_estoque, fracionado, unidade, ativo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`);
  const garrafa = ins.run(`${MARK} Garrafa`, 'TIPO-GARRAFA', '', 80, 40, 2, 0, 'Teste', 'produto', 1, 0, 'UN').lastInsertRowid;
  const pecaA = ins.run(`${MARK} Peca A`, 'TIPO-PECA-A', '', 10, 4, 5, 0, 'Teste', 'produto', 1, 0, 'UN').lastInsertRowid;
  const pecaB = ins.run(`${MARK} Peca B`, 'TIPO-PECA-B', '', 15, 6, 3, 0, 'Teste', 'produto', 1, 0, 'UN').lastInsertRowid;
  const servico = ins.run(`${MARK} Formatacao`, 'TIPO-SERV', '', 80, 0, 0, 0, 'Teste', 'servico', 0, 0, 'UN').lastInsertRowid;
  const pesavel = ins.run(`${MARK} Queijo`, 'TIPO-KG', '', 40, 20, 1.5, 0, 'Teste', 'pesavel', 1, 1, 'KG').lastInsertRowid;
  const kit = ins.run(`${MARK} Combo`, 'TIPO-KIT', '', 30, 10, 0, 0, 'Teste', 'kit', 1, 0, 'UN').lastInsertRowid;
  db.prepare('INSERT INTO produto_composicao (produto_id, item_id, quantidade) VALUES (?,?,?)').run(kit, pecaA, 2);
  db.prepare('INSERT INTO produto_composicao (produto_id, item_id, quantidade) VALUES (?,?,?)').run(kit, pecaB, 1);

  const kitRow = {
    id: kit, tipo: 'kit', controla_estoque: 1,
    composicao: [
      { quantidade: 2, produto: { tipo: 'produto', estoque: 5, controla_estoque: 1 } },
      { quantidade: 1, produto: { tipo: 'produto', estoque: 3, controla_estoque: 1 } }
    ]
  };
  assert.strictEqual(tipos.calcularEstoqueDisponivel(kitRow, {
    itensKit: kitRow.composicao
  }), 2, 'kit limitado pelo item A (5/2=2)');

  function estoqueDe(id) {
    return Number(db.prepare('SELECT estoque FROM produtos WHERE id = ?').get(id).estoque);
  }

  function baixarUnidade(prod, quantidade) {
    const consumo = Number(prod.estoque_consumo) || 0;
    const origemId = prod.estoque_origem_id && consumo > 0 ? prod.estoque_origem_id : null;
    const alvoId = origemId || prod.id;
    const qtdBaixa = tipos.arred(origemId ? quantidade * consumo : quantidade);
    const alvo = db.prepare('SELECT estoque FROM produtos WHERE id = ?').get(alvoId);
    const anterior = Number(alvo?.estoque) || 0;
    if (anterior + 1e-9 < qtdBaixa) throw new Error('Estoque insuficiente');
    const novo = tipos.arred(anterior - qtdBaixa);
    db.prepare('UPDATE produtos SET estoque = ? WHERE id = ?').run(novo, alvoId);
    return novo;
  }

  baixarUnidade({ id: pecaA }, 2);
  baixarUnidade({ id: pecaB }, 1);
  perto(estoqueDe(pecaA), 3, 'kit baixa peca A');
  perto(estoqueDe(pecaB), 2, 'kit baixa peca B');

  baixarUnidade({ id: pesavel }, 0.25);
  perto(estoqueDe(pesavel), 1.25, 'pesavel baixa 0,25');

  const estServ = estoqueDe(servico);
  perto(estServ, 0, 'servico sem estoque');

  perto(estoqueDe(garrafa), 2, 'garrafa intacta no teste de kit');

  console.log('TIPOS OK: servico/kit/pesavel');
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
console.log('Todos os testes de tipos de produto passaram (rollback aplicado, banco intacto).');
