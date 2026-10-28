const assert = require('assert');
const db = require('../database');
const xml = require('./xml');
const tipos = require('../produtos/tipos');

function perto(a, b, msg) {
  assert.ok(Math.abs(Number(a) - Number(b)) < 0.02, `${msg}: esperado ${b}, obtido ${a}`);
}

const chave = xml.chaveDemo(77);
assert.strictEqual(chave.length, 44);

const raw = xml.xmlDemoSefaz({
  cnpjDest: '12345678000199',
  razaoDest: 'ERP ISAC TESTE',
  emitCnpj: '11222333000181',
  emitNome: 'Dist XML LTDA',
  chaveBase: chave
});
const nota = xml.parseXml(raw);
assert.strictEqual(nota.chave, chave);
assert.strictEqual(nota.itens.length, 2);
assert.strictEqual(nota.emit_cnpj, '11222333000181');
assert.strictEqual(nota.itens[0].ean, '7894900011517');
assert.strictEqual(nota.itens[0].unidade, 'CX');
perto(nota.itens[0].quantidade, 2, 'qtd caixa');
perto(nota.valor, 122.4, 'total NF');
assert.strictEqual(nota.itens[0].cfop_entrada, '1102');
assert.strictEqual(xml.cfopEntrada('5102', true), '1102');
assert.strictEqual(xml.cfopEntrada('6102', false), '2102');

const conv = xml.aplicarFator(nota.itens[0], 12);
perto(conv.quantidade_estoque, 24, '2 caixas x 12');
perto(conv.preco_custo, 4, '96 / 24');
perto(xml.precoComMargem(4, 50), 6, 'margem 50%');

try {
  xml.parseXml('<xml>nao e nfe</xml>');
  assert.fail('xml invalido deveria falhar');
} catch (e) {
  assert.ok(/NF-e|invalido/i.test(e.message));
}

const MARK = 'XML-ENTRADA';
const tx = db.transaction(() => {
  db.prepare("INSERT OR REPLACE INTO config (chave, valor) VALUES ('empresa_cnpj', ?)").run('12345678000199');
  const forn = db.prepare('INSERT INTO fornecedores (nome, cnpj, ativo) VALUES (?,?,1)')
    .run(`${MARK} Dist`, '11222333000181').lastInsertRowid;
  const insP = db.prepare(`INSERT INTO produtos (nome, codigo, descricao, preco, preco_custo, estoque, estoque_minimo, categoria, tipo, controla_estoque, fracionado, unidade, ncm, ativo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)`);
  const prodCoca = insP.run(`${MARK} Coca`, '7894900011517', '', 8, 5, 10, 1, 'Bebidas', 'produto', 1, 0, 'UN', '22021000').lastInsertRowid;

  const existente = db.prepare('SELECT id FROM nfe_entrada WHERE chave=?').get(nota.chave);
  if (existente) db.prepare('DELETE FROM nfe_entrada WHERE id=?').run(existente.id);

  const insE = db.prepare(`INSERT INTO nfe_entrada
    (chave, numero, serie, modelo, natureza, data_emissao, emit_cnpj, emit_nome, valor, xml, status, origem, fornecedor_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const entradaId = insE.run(
    nota.chave, nota.numero, nota.serie, nota.modelo, nota.natureza, nota.data_emissao,
    nota.emit_cnpj, nota.emit_nome, nota.valor, nota.xml, 'Pendente', 'arquivo', forn
  ).lastInsertRowid;

  const mapas = {
    depara: {},
    porEan: { '7894900011517': { id: prodCoca } },
    porCodigo: {},
    porNome: {}
  };
  const preview = xml.montarItensPreview(nota, mapas);
  assert.strictEqual(preview[0].produto_id, prodCoca);
  assert.strictEqual(preview[0].origem_match, 'ean');
  assert.strictEqual(preview[1].criar_produto, 1);

  const insItem = db.prepare(`INSERT INTO nfe_entrada_itens
    (entrada_id, n_item, codigo_fornecedor, ean, descricao, ncm, cfop, cfop_entrada, unidade, quantidade, preco_unitario, subtotal,
     produto_id, fator, quantidade_estoque, preco_custo, margem, preco_venda, criar_produto, origem_match)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const i0 = xml.aplicarFator(preview[0], 12);
  insItem.run(
    entradaId, 1, preview[0].codigo_fornecedor, preview[0].ean, preview[0].descricao, preview[0].ncm, preview[0].cfop, preview[0].cfop_entrada,
    preview[0].unidade, preview[0].quantidade, preview[0].preco_unitario, preview[0].subtotal,
    prodCoca, 12, i0.quantidade_estoque, i0.preco_custo, 50, xml.precoComMargem(i0.preco_custo, 50), 0, 'ean'
  );
  const i1 = xml.aplicarFator(preview[1], 1);
  insItem.run(
    entradaId, 2, preview[1].codigo_fornecedor, preview[1].ean, preview[1].descricao, preview[1].ncm, preview[1].cfop, preview[1].cfop_entrada,
    preview[1].unidade, preview[1].quantidade, preview[1].preco_unitario, preview[1].subtotal,
    null, 1, i1.quantidade_estoque, i1.preco_custo, 0, i1.preco_custo, 1, 'novo'
  );

  const itens = db.prepare('SELECT * FROM nfe_entrada_itens WHERE entrada_id=? ORDER BY n_item').all(entradaId);
  const compraItens = [];
  for (const it of itens) {
    let produtoId = it.produto_id;
    if (!produtoId && it.criar_produto) {
      const codigo = xml.eanValido(it.ean) || it.codigo_fornecedor;
      produtoId = db.prepare(`INSERT INTO produtos (nome, codigo, descricao, preco, preco_custo, estoque, estoque_minimo, categoria, ncm, unidade, tipo, controla_estoque, ativo)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(
        it.descricao, codigo, it.descricao, it.preco_venda, it.preco_custo, 0, 0, 'NF-e', it.ncm, it.unidade, 'produto', 1
      ).lastInsertRowid;
    }
    db.prepare(`INSERT INTO produto_fornecedor_depara (fornecedor_id, codigo_fornecedor, ean, produto_id, fator, unidade_fornecedor)
      VALUES (?,?,?,?,?,?)`).run(forn, it.codigo_fornecedor, it.ean, produtoId, it.fator, it.unidade);
    if (Number(it.preco_venda) > 0) db.prepare('UPDATE produtos SET preco=? WHERE id=?').run(it.preco_venda, produtoId);
    const qtd = Number(it.quantidade_estoque) || 0;
    const custo = Number(it.preco_custo) || 0;
    compraItens.push({ produto_id: produtoId, quantidade: qtd, preco_unitario: custo, subtotal: xml.arredMoney(qtd * custo) });
  }

  const estoqueAntes = Number(db.prepare('SELECT estoque FROM produtos WHERE id=?').get(prodCoca).estoque);
  for (const it of compraItens) {
    const p = db.prepare('SELECT * FROM produtos WHERE id=?').get(it.produto_id);
    const tipo = tipos.normalizarTipo(p.tipo);
    if (!tipos.controlaEstoque(p, tipo)) continue;
    const anterior = Number(p.estoque) || 0;
    const novo = tipos.arred(anterior + Number(it.quantidade));
    db.prepare('UPDATE produtos SET estoque=?, preco_custo=? WHERE id=?').run(novo, it.preco_unitario, p.id);
  }
  const estoqueDepois = Number(db.prepare('SELECT estoque FROM produtos WHERE id=?').get(prodCoca).estoque);
  perto(estoqueDepois, estoqueAntes + 24, 'entrada 2 CX x fator 12');
  const custoCoca = Number(db.prepare('SELECT preco_custo FROM produtos WHERE id=?').get(prodCoca).preco_custo);
  perto(custoCoca, 4, 'custo unitario apos fator');
  const precoCoca = Number(db.prepare('SELECT preco FROM produtos WHERE id=?').get(prodCoca).preco);
  perto(precoCoca, 6, 'preco venda com margem 50');

  const agua = db.prepare("SELECT * FROM produtos WHERE codigo='7891000100103'").get();
  assert.ok(agua, 'produto novo criado pelo XML');
  perto(agua.estoque, 24, 'agua 24 UN');
  perto(agua.preco_custo, 1.1, 'custo agua');

  const depara = db.prepare('SELECT * FROM produto_fornecedor_depara WHERE fornecedor_id=? AND codigo_fornecedor=?')
    .get(forn, 'CX-COCA-12');
  assert.ok(depara, 'de/para memorizado');
  assert.strictEqual(depara.produto_id, prodCoca);
  perto(depara.fator, 12, 'fator memorizado');

  const sug = xml.sugerirMatch(nota.itens[0], {
    depara: { 'CX-COCA-12': { produto_id: prodCoca, fator: 12 } },
    porEan: {},
    porCodigo: {},
    porNome: {}
  });
  assert.strictEqual(sug.origem, 'depara');
  assert.strictEqual(sug.produto_id, prodCoca);
  perto(sug.fator, 12, 'fator do de/para');

  db.prepare("UPDATE nfe_entrada SET status='Entrada' WHERE id=?").run(entradaId);
  const dup = db.prepare('SELECT id, status FROM nfe_entrada WHERE chave=?').get(nota.chave);
  assert.strictEqual(dup.status, 'Entrada');

  console.log('XML ENTRADA OK: parse, fator CX->UN, de/para, produto novo, estoque e preco');
  throw new Error('__ROLLBACK__');
});

let ok = false;
try { tx(); } catch (e) {
  if (e.message === '__ROLLBACK__') ok = true;
  else throw e;
}
assert.ok(ok, 'rollback xml');
console.log('Todos os testes de XML de entrada passaram (rollback aplicado, banco intacto).');
