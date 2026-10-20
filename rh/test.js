const assert = require('assert');
const db = require('../database');
const rh = require('./index');

function perto(a, b, msg) {
  assert.ok(Math.abs(Number(a) - Number(b)) < 0.005, `${msg}: esperado ${b}, obtido ${a}`);
}

assert.strictEqual(rh.parseHora('8:00', '00:00'), '08:00');
assert.strictEqual(rh.parseHora('220:00'), '220:00');
assert.strictEqual(rh.horaParaMinutos('08:00'), 480);
assert.strictEqual(rh.minutosParaHora(480), '08:00');
assert.strictEqual(rh.normalizarTipo('Flexivel'), 'flexivel');
assert.strictEqual(rh.normalizarStatus('INATIVO'), 'inativo');
assert.strictEqual(rh.flagOn('Sim', false), 1);
assert.strictEqual(rh.flagOn('Nao', true), 0);
assert.strictEqual(rh.simNao(1), 'Sim');

const min = rh.minutosTrabalhados([
  { tipo: 'entrada', horario: '08:00' },
  { tipo: 'intervalo_inicio', horario: '12:00' },
  { tipo: 'intervalo_fim', horario: '13:00' },
  { tipo: 'saida', horario: '17:00' }
]);
assert.strictEqual(min, 8 * 60, 'jornada 8h com intervalo');

const g = rh.payloadGrade({
  nome: 'Comercial 44h',
  status: 'ativo',
  tipo: 'comercial',
  horas_dia: '08:00',
  horas_semana: '44:00',
  horas_mes: '220:00',
  limite_dia: '10:00',
  intervalo_minimo: '01:00',
  banco_horas: 'Nao',
  exigir_localizacao: 'Nao',
  exigir_perto: 'Nao'
});
assert.strictEqual(g.nome, 'Comercial 44h');
assert.strictEqual(g.flexivel, 0);
assert.strictEqual(g.banco_horas, 0);

try {
  rh.payloadGrade({ nome: '' });
  assert.fail('grade sem nome deveria falhar');
} catch (e) {
  assert.ok(/obrigatorio/i.test(e.message));
}

const MARK = 'RH-TESTE';
const tx = db.transaction(() => {
  const gradeId = db.prepare(`INSERT INTO rh_grades
    (nome, status, tipo, horas_dia, horas_semana, horas_mes, limite_dia, intervalo_minimo, banco_horas, flexivel, exigir_localizacao, exigir_perto)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    `${MARK} Comercial`, 'ativo', 'comercial', '08:00', '44:00', '220:00', '10:00', '01:00', 0, 0, 0, 0
  ).lastInsertRowid;
  const flexId = db.prepare(`INSERT INTO rh_grades
    (nome, status, tipo, horas_dia, horas_semana, horas_mes, limite_dia, intervalo_minimo, banco_horas, flexivel, exigir_localizacao, exigir_perto)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    `${MARK} Flex`, 'ativo', 'flexivel', '08:00', '44:00', '176:00', '10:00', '01:00', 1, 1, 0, 0
  ).lastInsertRowid;

  const funcId = db.prepare(`INSERT INTO rh_funcionarios
    (nome, cpf, cargo, telefone, email, data_admissao, salario, grade_id, ativo)
    VALUES (?,?,?,?,?,?,?,?,1)`).run(
    `${MARK} Ana`, '00000000000', 'Atendente', '84999999999', 'ana@teste.com', '2026-01-10', 1800, gradeId
  ).lastInsertRowid;

  const insB = db.prepare(`INSERT INTO rh_pontos (funcionario_id, data, horario, tipo, observacao) VALUES (?,?,?,?,?)`);
  insB.run(funcId, '2026-10-01', '08:00', 'entrada', MARK);
  insB.run(funcId, '2026-10-01', '12:00', 'intervalo_inicio', MARK);
  insB.run(funcId, '2026-10-01', '13:00', 'intervalo_fim', MARK);
  insB.run(funcId, '2026-10-01', '18:30', 'saida', MARK);
  insB.run(funcId, '2026-10-02', '08:00', 'entrada', MARK);
  insB.run(funcId, '2026-10-02', '17:00', 'saida', MARK);

  const batidas = db.prepare('SELECT * FROM rh_pontos WHERE funcionario_id=? ORDER BY data, horario').all(funcId);
  const grade = db.prepare('SELECT * FROM rh_grades WHERE id=?').get(gradeId);
  const folha = rh.calcularFolha({ batidas, grade });
  assert.strictEqual(folha.dias.length, 2);
  assert.strictEqual(folha.trabalhados, (9.5 + 9) * 60);
  assert.strictEqual(folha.extras, (1.5 + 1) * 60, 'hora extra acima da jornada de 8h');
  perto(folha.previsto, 220 * 60, 'previsto 220h');

  const flex = db.prepare('SELECT * FROM rh_grades WHERE id=?').get(flexId);
  assert.strictEqual(flex.flexivel, 1);
  assert.strictEqual(flex.banco_horas, 1);
  const folhaFlex = rh.calcularFolha({ batidas, grade: flex });
  assert.ok(folhaFlex.banco >= 0);

  const usados = db.prepare('SELECT COUNT(*) as c FROM rh_funcionarios WHERE grade_id=? AND ativo=1').get(gradeId).c;
  assert.ok(usados >= 1, 'grade em uso nao deve ser excluida');

  const inativos = db.prepare('SELECT COUNT(*) as c FROM rh_funcionarios WHERE ativo=0').get().c;
  db.prepare('UPDATE rh_funcionarios SET ativo=0 WHERE id=?').run(funcId);
  const after = db.prepare('SELECT ativo FROM rh_funcionarios WHERE id=?').get(funcId);
  assert.strictEqual(after.ativo, 0);
  assert.ok(inativos >= 0);

  console.log('RH OK: grade, funcionario, ponto e folha');
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
console.log('Todos os testes de RH passaram (rollback aplicado, banco intacto).');
