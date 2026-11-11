const assert = require('assert');
const db = require('../database');
const osMod = require('./index');

assert.strictEqual(osMod.normalizarPlaca('abc-1d23'), 'ABC1D23');
assert.strictEqual(osMod.normalizarPlaca('abc 1234'), 'ABC1234');
assert.strictEqual(osMod.normalizarStatus('pronta'), 'Pronta para entrega');
assert.strictEqual(osMod.osFechada('Entregue'), true);
assert.strictEqual(osMod.osFechada('Aberta'), false);
assert.strictEqual(osMod.normalizarTipoItem('', 'servico'), 'servico');
assert.strictEqual(osMod.normalizarTipoItem('peca', 'produto'), 'peca');

const item = osMod.validarItem({
  descricao: 'Oleo 20W50',
  quantidade: 2,
  preco_unitario: 35.5,
  preco_custo: 20
}, { id: 9, nome: 'Oleo', tipo: 'produto', preco: 40, preco_custo: 18 });
assert.strictEqual(item.produto_id, 9);
assert.strictEqual(item.tipo, 'peca');
assert.strictEqual(item.subtotal, 71);
assert.strictEqual(item.preco_custo, 20);

try {
  osMod.validarItem({ quantidade: 0, descricao: 'x', preco_unitario: 1 });
  assert.fail('qtd zero');
} catch (e) {
  assert.ok(/Quantidade/.test(e.message));
}

const t = osMod.totais([
  { quantidade: 1, preco_unitario: 100, preco_custo: 40 },
  { quantidade: 2, preco_unitario: 50, preco_custo: 10 }
]);
assert.strictEqual(t.valor_venda, 200);
assert.strictEqual(t.valor_custo, 60);
assert.strictEqual(t.valor_lucro, 140);
assert.strictEqual(t.valor_previsto, 200);

const payload = osMod.payloadOS({
  cliente_id: 1,
  placa: 'xyz-1a23',
  km: 12000,
  modelo: 'Honda CG 160',
  solicitacao: 'Revisao',
  status: 'aberta'
});
assert.strictEqual(payload.placa, 'XYZ1A23');
assert.strictEqual(payload.km, 12000);
assert.strictEqual(payload.tipo_aparelho, 'Veiculo');
assert.strictEqual(payload.equipamento, 'Honda CG 160');
assert.strictEqual(payload.status, 'Aberta');

const cel = osMod.payloadOS({
  tipo_aparelho: 'celular',
  marca: 'Samsung',
  modelo: 'Galaxy S21',
  imei: '123456789012345',
  senha: '1234',
  cor: 'Preto'
});
assert.strictEqual(cel.tipo_aparelho, 'Celular');
assert.strictEqual(cel.imei, '123456789012345');
assert.strictEqual(cel.placa, null);
assert.strictEqual(cel.equipamento, 'Samsung Galaxy S21');
assert.strictEqual(osMod.rotuloAparelho(cel), 'Samsung Galaxy S21 · IMEI 123456789012345');
assert.strictEqual(osMod.inferirTipoAparelho({ equipamento: 'Notebook Dell' }), 'Notebook');
assert.strictEqual(osMod.inferirTipoAparelho({ tipo_aparelho: 'Outro', placa: 'ABC1D23' }), 'Veiculo');

try {
  osMod.payloadOS({ tipo_aparelho: 'Veiculo', km: -1 });
  assert.fail('km negativo');
} catch (e) {
  assert.ok(/KM/.test(e.message));
}

const msg = osMod.mensagemWhatsApp({ id: 12, placa: 'ABC1D23', valor_venda: 350 });
assert.ok(msg.includes('#12'));
assert.ok(msg.includes('ABC1D23'));
assert.ok(msg.includes('350,00'));

const pdvLegacy = osMod.itensParaPdv({ id: 3, equipamento: 'Notebook', valor_previsto: 180 }, []);
assert.strictEqual(pdvLegacy.length, 1);
assert.strictEqual(pdvLegacy[0].produto_id, null);
assert.strictEqual(pdvLegacy[0].os_id, 3);
assert.strictEqual(pdvLegacy[0].preco_unitario, 180);

const pdvItens = osMod.itensParaPdv({ id: 4 }, [
  { descricao: 'Oleo', quantidade: 1, preco_unitario: 40, preco_custo: 20, tipo: 'peca', produto_id: 1, produto_tipo: 'produto' },
  { descricao: 'Mao de obra', quantidade: 1, preco_unitario: 80, preco_custo: 0, tipo: 'servico' }
]);
assert.strictEqual(pdvItens.length, 2);
assert.strictEqual(pdvItens[0].tipo, 'produto');
assert.strictEqual(pdvItens[1].tipo, 'servico');
assert.ok(pdvItens[0].descricao.includes('OS 4'));

const MARK = 'OS-TESTE';
const tx = db.transaction(() => {
  const cli = db.prepare('INSERT INTO clientes (nome, telefone) VALUES (?,?)').run(`${MARK} Joao`, '84999990000');
  const peca = db.prepare(`INSERT INTO produtos (nome, codigo, preco, preco_custo, estoque, tipo, controla_estoque, ativo)
    VALUES (?,?,?,?,?,?,?,1)`).run(`${MARK} Filtro`, 'OS-FILTRO', 45, 20, 5, 'produto', 1).lastInsertRowid;
  const serv = db.prepare(`INSERT INTO produtos (nome, codigo, preco, preco_custo, estoque, tipo, controla_estoque, ativo)
    VALUES (?,?,?,?,?,?,?,1)`).run(`${MARK} Mao de obra`, 'OS-MO', 90, 0, 0, 'servico', 0).lastInsertRowid;

  const osId = db.prepare(`INSERT INTO ordens_servico
    (status, cliente_id, equipamento, modelo, placa, km, solicitacao, valor_previsto)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    'Aberta', cli.lastInsertRowid, 'Honda CG 160', 'Honda CG 160', 'ABC1D23', 45000, `${MARK} revisao`, 0
  ).lastInsertRowid;

  const i1 = osMod.validarItem({ quantidade: 1, preco_unitario: 45 }, { id: peca, nome: `${MARK} Filtro`, tipo: 'produto', preco: 45, preco_custo: 20 });
  const i2 = osMod.validarItem({ quantidade: 1, preco_unitario: 90 }, { id: serv, nome: `${MARK} Mao de obra`, tipo: 'servico', preco: 90, preco_custo: 0 });
  db.prepare(`INSERT INTO ordem_servico_itens
    (os_id, produto_id, tipo, produto_tipo, descricao, quantidade, preco_unitario, preco_custo, subtotal)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(osId, i1.produto_id, i1.tipo, 'produto', i1.descricao, i1.quantidade, i1.preco_unitario, i1.preco_custo, i1.subtotal);
  db.prepare(`INSERT INTO ordem_servico_itens
    (os_id, produto_id, tipo, produto_tipo, descricao, quantidade, preco_unitario, preco_custo, subtotal)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(osId, i2.produto_id, i2.tipo, 'servico', i2.descricao, i2.quantidade, i2.preco_unitario, i2.preco_custo, i2.subtotal);

  const itens = db.prepare('SELECT * FROM ordem_servico_itens WHERE os_id=?').all(osId);
  const tot = osMod.totais(itens);
  assert.strictEqual(tot.valor_venda, 135);
  assert.strictEqual(tot.valor_custo, 20);
  assert.strictEqual(tot.valor_lucro, 115);
  db.prepare('UPDATE ordens_servico SET valor_previsto=?, valor_custo=?, valor_venda=?, valor_lucro=? WHERE id=?')
    .run(tot.valor_previsto, tot.valor_custo, tot.valor_venda, tot.valor_lucro, osId);
  const row = db.prepare('SELECT * FROM ordens_servico WHERE id=?').get(osId);
  const enr = osMod.enriquecer(row, itens);
  assert.strictEqual(enr.totais.valor_lucro, 115);
  assert.strictEqual(enr.itens.length, 2);
  const hist = db.prepare('SELECT id FROM ordens_servico WHERE placa=? AND id!=?').all('ABC1D23', osId);
  assert.ok(Array.isArray(hist));

  console.log('OS OK: placa, aparelho, itens, totais, lucro, PDV e WhatsApp');
  throw new Error('__ROLLBACK__');
});

let ok = false;
try { tx(); }
catch (e) {
  if (e.message === '__ROLLBACK__') ok = true;
  else throw e;
}
assert.ok(ok, 'transacao deveria ter feito rollback');
console.log('Todos os testes de OS passaram (rollback aplicado, banco intacto).');
