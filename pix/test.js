const assert = require('assert');
const emv = require('./emv');
const qr = require('./qr');
const pix = require('./index');

assert.strictEqual(emv.crc16('123456789'), '29B1');
const bacen = emv.montarPayload({
  chave: '123e4567-e89b-12d3-a456-426655440000',
  nome: 'Fulano de Tal',
  cidade: 'BRASILIA',
  txid: '***'
});
assert.strictEqual(bacen.slice(-4), emv.crc16(bacen.slice(0, -4)));
assert.ok(bacen.includes('0014br.gov.bcb.pix'));
assert.ok(bacen.includes('0136123e4567-e89b-12d3-a456-426655440000'));

assert.strictEqual(emv.normalizarChave('529.982.247-25'), '52998224725');
assert.strictEqual(emv.normalizarChave('12.345.678/0001-95'), '12345678000195');
assert.strictEqual(emv.normalizarChave('loja@EXEMPLO.com'), 'loja@exemplo.com');
assert.strictEqual(emv.normalizarChave('(84) 99871-3472'), '+5584998713472');
assert.strictEqual(emv.detectarTipo('52998224725'), 'CPF');
assert.strictEqual(emv.detectarTipo('12345678000195'), 'CNPJ');
assert.strictEqual(emv.detectarTipo('a@b.com'), 'E-mail');
assert.strictEqual(emv.detectarTipo('123e4567-e89b-12d3-a456-426655440000'), 'Aleatoria');

const payload = emv.montarPayload({
  chave: '123e4567-e89b-12d3-a456-426655440000',
  nome: 'Fulano de Tal',
  cidade: 'Brasilia',
  valor: 10.5,
  txid: '***'
});
assert.ok(payload.startsWith('000201'));
assert.ok(payload.includes('br.gov.bcb.pix'));
assert.ok(payload.includes('011236e4567-e89b-12d3-a456-426655440000') || payload.includes('123e4567-e89b-12d3-a456-426655440000'));
assert.ok(payload.includes('540510.50'));
assert.ok(payload.includes('5802BR'));
assert.ok(payload.includes('5913FULANO DE TAL'));
assert.ok(payload.includes('6008BRASILIA'));
assert.strictEqual(payload.slice(-8, -4), '6304');
assert.strictEqual(payload.slice(-4), emv.crc16(payload.slice(0, -4)));

const cob = pix.gerar({
  pix_chave: 'loja@erpisac.com',
  pix_nome: 'ERP ISAC',
  pix_cidade: 'Serrinha'
}, { valor: 25, txid: 'V99' });
assert.ok(cob.payload.includes('loja@erpisac.com'));
assert.ok(cob.svg.startsWith('<svg'));
assert.ok(cob.svg.includes('rect'));
assert.strictEqual(cob.tipo, 'E-mail');
assert.strictEqual(cob.valor, 25);

try {
  pix.gerar({ pix_chave: '' }, { valor: 1 });
  assert.fail('sem chave deveria falhar');
} catch (e) {
  assert.ok(/chave PIX/i.test(e.message));
}

const svg = qr.qrSvg('HELLO');
assert.ok(svg.includes('<svg'));
assert.ok(svg.includes('pix-qr'));
assert.ok(/<path |<rect /.test(svg));

const p2 = emv.montarPayload({ chave: '52998224725', nome: 'Loja', cidade: 'Natal', valor: 1 });
const svg2 = qr.qrSvg(p2);
assert.ok(svg2.includes('<svg'));

console.log('ok pix');
