const TIPOS = ['comercial', 'flexivel'];
const STATUS = ['ativo', 'inativo'];
const BATIDAS = ['entrada', 'saida', 'intervalo_inicio', 'intervalo_fim'];

function flagOn(v, padrao) {
  if (v === undefined || v === null || v === '') return padrao ? 1 : 0;
  const s = String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (s === 'sim' || s === '1' || s === 'true' || s === 'ativo' || s === 'yes') return 1;
  return 0;
}

function normalizarTipo(tipo) {
  const t = String(tipo || 'comercial')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
  if (t === 'flexivel' || t === 'flex') return 'flexivel';
  return 'comercial';
}

function normalizarStatus(status) {
  const s = String(status || 'ativo').toLowerCase().trim();
  return s === 'inativo' ? 'inativo' : 'ativo';
}

function normalizarBatida(tipo) {
  const t = String(tipo || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
  if (t === 'saida' || t === 'fim') return 'saida';
  if (t === 'intervalo_inicio' || t === 'intervalo inicio' || t === 'almoco' || t === 'pausa') return 'intervalo_inicio';
  if (t === 'intervalo_fim' || t === 'intervalo fim' || t === 'retorno') return 'intervalo_fim';
  return 'entrada';
}

function parseHora(v, padrao) {
  const raw = String(v == null || v === '' ? (padrao || '00:00') : v).trim();
  const m = raw.match(/^(\d{1,3}):(\d{2})$/);
  if (!m) {
    const err = new Error('Hora invalida. Use HH:MM');
    err.status = 400;
    throw err;
  }
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || min > 59 || h < 0) {
    const err = new Error('Hora invalida. Use HH:MM');
    err.status = 400;
    throw err;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function horaParaMinutos(v) {
  const [h, m] = parseHora(v).split(':').map(Number);
  return h * 60 + m;
}

function minutosParaHora(n) {
  const t = Math.max(0, Math.round(Number(n) || 0));
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function simNao(v) {
  return flagOn(v, false) ? 'Sim' : 'Nao';
}

function minutosTrabalhados(batidas) {
  const entrada = new Set(['entrada', 'intervalo_fim']);
  const saida = new Set(['saida', 'intervalo_inicio']);
  let aberto = null;
  let total = 0;
  const ordered = [...(batidas || [])].sort((a, b) => String(a.horario || '').localeCompare(String(b.horario || '')));
  for (const b of ordered) {
    let min;
    try { min = horaParaMinutos(b.horario); }
    catch { continue; }
    const tipo = normalizarBatida(b.tipo);
    if (entrada.has(tipo)) aberto = min;
    else if (saida.has(tipo) && aberto != null) {
      total += Math.max(0, min - aberto);
      aberto = null;
    }
  }
  return total;
}

function agruparPorData(batidas) {
  const map = {};
  for (const b of batidas || []) {
    const d = String(b.data || '').slice(0, 10);
    if (!d) continue;
    if (!map[d]) map[d] = [];
    map[d].push(b);
  }
  return map;
}

function calcularFolha({ batidas, grade }) {
  const porDia = agruparPorData(batidas);
  let trabalhados = 0;
  const dias = [];
  for (const [data, lista] of Object.entries(porDia).sort()) {
    const min = minutosTrabalhados(lista);
    trabalhados += min;
    dias.push({ data, minutos: min, horas: minutosParaHora(min), batidas: lista.length });
  }
  const previsto = grade ? horaParaMinutos(grade.horas_mes || '220:00') : 0;
  const previstoDia = grade ? horaParaMinutos(grade.horas_dia || '08:00') : 8 * 60;
  let extras = 0;
  for (const d of dias) {
    extras += Math.max(0, d.minutos - previstoDia);
  }
  const saldo = trabalhados - previsto;
  const banco = grade && Number(grade.banco_horas) === 1 ? Math.max(0, saldo) : 0;
  return {
    previsto,
    previsto_hora: minutosParaHora(previsto),
    trabalhados,
    trabalhados_hora: minutosParaHora(trabalhados),
    extras,
    extras_hora: minutosParaHora(extras),
    saldo,
    saldo_hora: (saldo < 0 ? '-' : '') + minutosParaHora(Math.abs(saldo)),
    banco,
    banco_hora: minutosParaHora(banco),
    dias
  };
}

function payloadGrade(body) {
  const nome = String(body.nome || '').trim();
  if (!nome) {
    const err = new Error('Nome da grade e obrigatorio');
    err.status = 400;
    throw err;
  }
  const tipo = normalizarTipo(body.tipo);
  return {
    nome: nome.slice(0, 80),
    status: normalizarStatus(body.status),
    tipo,
    horas_dia: parseHora(body.horas_dia, '08:00'),
    horas_semana: parseHora(body.horas_semana, '44:00'),
    horas_mes: parseHora(body.horas_mes, '220:00'),
    limite_dia: parseHora(body.limite_dia, '10:00'),
    intervalo_minimo: parseHora(body.intervalo_minimo, '01:00'),
    banco_horas: flagOn(body.banco_horas, false),
    flexivel: tipo === 'flexivel' ? 1 : flagOn(body.flexivel, false),
    exigir_localizacao: flagOn(body.exigir_localizacao, false),
    exigir_perto: flagOn(body.exigir_perto, false)
  };
}

module.exports = {
  TIPOS,
  STATUS,
  BATIDAS,
  flagOn,
  normalizarTipo,
  normalizarStatus,
  normalizarBatida,
  parseHora,
  horaParaMinutos,
  minutosParaHora,
  simNao,
  minutosTrabalhados,
  agruparPorData,
  calcularFolha,
  payloadGrade
};
