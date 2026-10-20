const assert = require('assert');
const crypto = require('crypto');
const db = require('../database');
const ecom = require('./index');

assert.strictEqual(ecom.normalizarPlataforma('Woo'), 'woocommerce');
assert.strictEqual(ecom.normalizarPlataforma('Shopify'), 'shopify');
assert.strictEqual(ecom.normalizarForma('pix'), 'PIX');
assert.strictEqual(ecom.normalizarForma('credit card'), 'Cartão Crédito');
assert.strictEqual(ecom.normalizarEvento('completed'), 'pago');
assert.strictEqual(ecom.normalizarEvento('refunded'), 'cancelado');

const parsed = ecom.parsePedidoGenerico({
  external_id: 'PED-1',
  status: 'paid',
  forma_pagamento: 'PIX',
  cliente: { nome: 'Maria', email: 'maria@teste.com', telefone: '84999990000' },
  itens: [{ codigo: '789', quantidade: 2, preco_unitario: 10 }]
});
assert.strictEqual(parsed.external_id, 'PED-1');
assert.strictEqual(parsed.itens[0].quantidade, 2);
ecom.validarPedido(parsed);

try {
  ecom.validarPedido({ external_id: '', itens: [] });
  assert.fail('pedido vazio deveria falhar');
} catch (e) {
  assert.ok(/obrigatorio|itens/i.test(e.message));
}

const secret = 'segredo-woo';
const raw = Buffer.from('{"id":99}', 'utf8');
const sig = crypto.createHmac('sha256', secret).update(raw).digest('base64');
assert.ok(ecom.verificarAssinatura({
  plataforma: 'woocommerce',
  secret,
  rawBody: raw,
  headers: { 'x-wc-webhook-signature': sig }
}));
try {
  ecom.verificarAssinatura({
    plataforma: 'woocommerce',
    secret,
    rawBody: raw,
    headers: { 'x-wc-webhook-signature': 'errado' }
  });
  assert.fail('assinatura invalida deveria falhar');
} catch (e) {
  assert.strictEqual(e.status, 401);
}

assert.strictEqual(ecom.normalizarPlataforma('ml'), 'mercadolivre');
assert.strictEqual(ecom.normalizarPlataforma('Mercado Livre'), 'mercadolivre');
assert.strictEqual(ecom.normalizarPlataforma('meli'), 'mercadolivre');

const mlOrder = ecom.parseMercadoLivre({
  id: 2001,
  status: 'paid',
  buyer: {
    first_name: 'Joao',
    last_name: 'Silva',
    email: 'joao@teste.com',
    phone: { area_code: '11', number: '999998888' },
    billing_info: { doc_number: '12345678901' }
  },
  payments: [{ status: 'approved', payment_type: 'credit_card' }],
  order_items: [{ item: { seller_sku: 'SKU-ML-1', title: 'Camisa ML' }, quantity: 2, unit_price: 40 }]
});
assert.strictEqual(mlOrder.external_id, '2001');
assert.strictEqual(mlOrder.status, 'pago');
assert.strictEqual(mlOrder.cliente.nome, 'Joao Silva');
assert.strictEqual(mlOrder.cliente.telefone, '11999998888');
assert.strictEqual(mlOrder.itens[0].codigo, 'SKU-ML-1');
assert.strictEqual(mlOrder.itens[0].quantidade, 2);
ecom.validarPedido(mlOrder);

assert.strictEqual(ecom.notificacaoMercadoLivre({ resource: '/orders/2001', topic: 'orders_v2' }), '2001');
assert.strictEqual(ecom.notificacaoMercadoLivre({ topic: 'orders_v2', resource: 'orders/77' }), '77');

const mlSecret = 'ml-app-secret';
const mlReqId = 'req-ml-1';
const mlTs = '1710000000';
const mlManifest = `id:${mlReqId};request-id:${mlReqId};ts:${mlTs};`;
const mlV1 = crypto.createHmac('sha256', mlSecret).update(mlManifest).digest('hex');
assert.ok(ecom.verificarAssinatura({
  plataforma: 'mercadolivre',
  secret: mlSecret,
  rawBody: Buffer.from('{}'),
  headers: { 'x-signature': `ts=${mlTs},v1=${mlV1}`, 'x-request-id': mlReqId }
}));
assert.ok(ecom.verificarAssinatura({
  plataforma: 'mercadolivre',
  secret: mlSecret,
  rawBody: Buffer.from('{}'),
  headers: { authorization: `Bearer ${mlSecret}` }
}));
try {
  ecom.verificarAssinatura({
    plataforma: 'mercadolivre',
    secret: mlSecret,
    rawBody: Buffer.from('{}'),
    headers: { 'x-signature': `ts=${mlTs},v1=deadbeef`, 'x-request-id': mlReqId }
  });
  assert.fail('hmac ml invalido deveria falhar');
} catch (e) {
  assert.strictEqual(e.status, 401);
}

const tok = ecom.gerarToken();
assert.ok(tok.token.startsWith('erp_live_'));
assert.ok(tok.hash.length === 64);

const MARK = 'ECOM-TESTE';
const tx = db.transaction(() => {
  const clienteId = ecom.upsertCliente(db, {
    nome: `${MARK} Ana`,
    email: 'ana-ecom@teste.com',
    telefone: '84988887777',
    cpf_cnpj: '12345678901'
  });
  const mesmo = ecom.upsertCliente(db, {
    nome: `${MARK} Ana Silva`,
    email: 'ana-ecom@teste.com',
    telefone: '84988887777'
  });
  assert.strictEqual(Number(mesmo), Number(clienteId));
  const row = db.prepare('SELECT * FROM clientes WHERE id=?').get(clienteId);
  assert.ok(row.nome.includes('Ana'));

  const prodId = db.prepare(`INSERT INTO produtos
    (nome, codigo, descricao, preco, preco_custo, estoque, estoque_minimo, categoria, tipo, controla_estoque, ativo)
    VALUES (?,?,?,?,?,?,?,?,?,?,1)`).run(
    `${MARK} Camisa`, 'SKU-ECOM-1', 'Camisa teste', 50, 20, 10, 1, 'Roupas', 'produto', 1
  ).lastInsertRowid;

  const itens = ecom.resolverItens(db, [{ codigo: 'SKU-ECOM-1', quantidade: 2, preco_unitario: 50 }]);
  assert.strictEqual(itens[0].produto_id, prodId);
  assert.strictEqual(itens[0].quantidade, 2);

  const pedidoId = db.prepare(`INSERT INTO ecommerce_pedidos
    (plataforma, external_id, status, payload_json)
    VALUES (?,?,?,?)`).run('generico', `${MARK}-99`, 'pago', '{}').lastInsertRowid;
  const dup = db.prepare('SELECT id FROM ecommerce_pedidos WHERE plataforma=? AND external_id=?')
    .get('generico', `${MARK}-99`);
  assert.strictEqual(dup.id, pedidoId);

  console.log('ECOMMERCE OK: parse, hmac, upsert cliente, sku');
  throw new Error('__ROLLBACK__');
});

let ok = false;
try { tx(); }
catch (e) {
  if (e.message === '__ROLLBACK__') ok = true;
  else throw e;
}
assert.ok(ok, 'transacao deveria ter feito rollback');
console.log('Todos os testes de ecommerce passaram (rollback aplicado, banco intacto).');
