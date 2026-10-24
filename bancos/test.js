const assert = require('assert');
const db = require('../database');
const bancos = require('./index');

assert.strictEqual(bancos.normalizarTipoConta('digital'), 'Digital');
assert.strictEqual(bancos.parseDataBr('22/10/2026'), '2026-10-22');
assert.strictEqual(bancos.parseValor('1.234,56'), 1234.56);
assert.strictEqual(bancos.parseValor('-50,00'), -50);
assert.strictEqual(bancos.aplicarMovimentoSaldo(100, -30), 70);

const csv = `data;historico;valor
22/10/2026;PIX recebido;150,00
22/10/2026;Tarifa;-3,50
21/10/2026;Boleto pago;-80,00`;
const linhas = bancos.parseCsvExtrato(csv);
assert.strictEqual(linhas.length, 3);
assert.strictEqual(linhas[0].valor, 150);
assert.strictEqual(linhas[1].tipo, 'Debito');

const score = bancos.scoreMatch(
  { data: '2026-10-22', valor: 150 },
  { tipo: 'Receita', valor: 150, data_vencimento: '2026-10-22', status: 'Pendente' }
);
assert.strictEqual(score, 100);

const pares = bancos.sugerirMatches(
  [{ id: 1, data: '2026-10-22', valor: 150, status: 'Aberto' }],
  [{ id: 9, tipo: 'Receita', valor: 150, data_vencimento: '2026-10-22', status: 'Pendente' }]
);
assert.strictEqual(pares.length, 1);
assert.strictEqual(pares[0].financeiro_id, 9);

const fluxo = bancos.montarFluxo({
  saldoInicial: 100,
  de: '2026-10-22',
  dias: 3,
  lancamentos: [
    { tipo: 'Receita', valor: 50, data_vencimento: '2026-10-22' },
    { tipo: 'Despesa', valor: 20, data_vencimento: '2026-10-23' }
  ]
});
assert.strictEqual(fluxo.dias[0].saldo, 150);
assert.strictEqual(fluxo.dias[1].saldo, 130);

const MARK = 'BCO-TESTE';
const tx = db.transaction(() => {
  const contaId = db.prepare(`INSERT INTO contas_bancarias
    (nome, banco, agencia, conta, tipo, saldo_inicial, saldo_atual, ativo)
    VALUES (?,?,?,?,?,?,?,1)`).run(`${MARK} BB`, 'Banco do Brasil', '1234', '99999-0', 'Corrente', 200, 200).lastInsertRowid;
  const finId = db.prepare(`INSERT INTO financeiro
    (tipo, categoria, descricao, valor, data_vencimento, status, origem)
    VALUES (?,?,?,?,?,?,?)`).run('Receita', 'Venda', `${MARK} PIX`, 150, '2026-10-22', 'Pago', MARK).lastInsertRowid;
  const extId = db.prepare(`INSERT INTO extrato_bancario
    (conta_id, data, descricao, valor, tipo, status, observacao)
    VALUES (?,?,?,?,?,?,?)`).run(contaId, '2026-10-22', 'PIX recebido', 150, 'Credito', 'Aberto', MARK).lastInsertRowid;
  const ext = db.prepare('SELECT * FROM extrato_bancario WHERE id=?').get(extId);
  const fin = db.prepare('SELECT * FROM financeiro WHERE id=?').get(finId);
  assert.ok(bancos.scoreMatch(ext, fin) >= 80);
  db.prepare('UPDATE extrato_bancario SET status=?, financeiro_id=? WHERE id=?').run('Conciliado', finId, extId);
  const novoSaldo = bancos.aplicarMovimentoSaldo(200, 150);
  db.prepare('UPDATE contas_bancarias SET saldo_atual=? WHERE id=?').run(novoSaldo, contaId);
  const after = db.prepare('SELECT saldo_atual FROM contas_bancarias WHERE id=?').get(contaId);
  assert.strictEqual(after.saldo_atual, 350);
  console.log('Bancos OK: extrato CSV, match e saldo');
  throw new Error('__ROLLBACK__');
});

let ok = false;
try { tx(); }
catch (e) {
  if (e.message === '__ROLLBACK__') ok = true;
  else throw e;
}
assert.ok(ok, 'transacao deveria ter feito rollback');
console.log('Todos os testes de bancos passaram (rollback aplicado, banco intacto).');
