function fail(msg, status) {
  const err = new Error(msg);
  err.status = status || 400;
  throw err;
}

const ETAPAS = ['Lead', 'Qualificacao', 'Proposta', 'Negociacao', 'Ganho', 'Perdido'];
const ABERTAS = ['Lead', 'Qualificacao', 'Proposta', 'Negociacao'];
const ORIGENS = ['Indicacao', 'WhatsApp', 'Loja', 'Telefone', 'Site', 'Marketplace', 'Visita', 'Outro'];
const PAGINAS = ['crm'];

function arredMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizarEtapa(etapa) {
  const s = String(etapa || '').trim();
  if (ETAPAS.includes(s)) return s;
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t === 'lead' || t === 'novo' || t === 'contato') return 'Lead';
  if (t === 'qualificacao' || t === 'qualificado') return 'Qualificacao';
  if (t === 'proposta' || t === 'orcamento') return 'Proposta';
  if (t === 'negociacao' || t === 'negociando') return 'Negociacao';
  if (t === 'ganho' || t === 'ganha' || t === 'fechado' || t === 'venda') return 'Ganho';
  if (t === 'perdido' || t === 'perdida' || t === 'cancelado') return 'Perdido';
  return 'Lead';
}

function normalizarOrigem(origem) {
  const s = String(origem || '').trim();
  if (ORIGENS.includes(s)) return s;
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t.includes('whats')) return 'WhatsApp';
  if (t.includes('indic')) return 'Indicacao';
  if (t.includes('loja')) return 'Loja';
  if (t.includes('tel')) return 'Telefone';
  if (t.includes('site') || t.includes('web')) return 'Site';
  if (t.includes('market') || t.includes('ml')) return 'Marketplace';
  if (t.includes('visita')) return 'Visita';
  return s ? s.slice(0, 40) : 'Outro';
}

function probabilidadeDaEtapa(etapa) {
  const s = normalizarEtapa(etapa);
  if (s === 'Lead') return 10;
  if (s === 'Qualificacao') return 30;
  if (s === 'Proposta') return 50;
  if (s === 'Negociacao') return 70;
  if (s === 'Ganho') return 100;
  return 0;
}

function transicaoEtapa(de, para) {
  const d = normalizarEtapa(de);
  const p = normalizarEtapa(para);
  if (d === p) return p;
  if (d === 'Ganho' || d === 'Perdido') fail(`Oportunidade ${d.toLowerCase()} nao muda de etapa`);
  if (!ETAPAS.includes(p)) fail('Etapa invalida');
  return p;
}

function classeEtapa(etapa) {
  const s = normalizarEtapa(etapa);
  if (s === 'Ganho') return 'compra-recebido';
  if (s === 'Perdido') return 'compra-recusado';
  if (s === 'Negociacao') return 'compra-aprovado';
  if (s === 'Proposta') return 'pronta';
  return 'compra-aguardando';
}

function payloadOportunidade(body) {
  const titulo = String(body.titulo || '').trim();
  if (!titulo) fail('Titulo obrigatorio');
  const etapa = normalizarEtapa(body.etapa);
  const valor = arredMoney(body.valor);
  if (valor < 0) fail('Valor invalido');
  let probabilidade = body.probabilidade;
  if (probabilidade === undefined || probabilidade === null || probabilidade === '') {
    probabilidade = probabilidadeDaEtapa(etapa);
  } else {
    probabilidade = Math.max(0, Math.min(100, Math.round(Number(probabilidade) || 0)));
  }
  const clienteId = body.cliente_id ? Number(body.cliente_id) : null;
  const vendedorId = body.vendedor_id ? Number(body.vendedor_id) : null;
  return {
    titulo: titulo.slice(0, 120),
    cliente_id: Number.isInteger(clienteId) && clienteId > 0 ? clienteId : null,
    cliente_nome: String(body.cliente_nome || '').trim().slice(0, 120),
    valor,
    etapa,
    probabilidade,
    origem: normalizarOrigem(body.origem),
    vendedor_id: Number.isInteger(vendedorId) && vendedorId > 0 ? vendedorId : null,
    previsao_fechamento: body.previsao_fechamento ? String(body.previsao_fechamento).slice(0, 10) : null,
    observacao: String(body.observacao || '').trim().slice(0, 500)
  };
}

function resumirFunil(rows) {
  const r = {
    total: 0,
    abertas: 0,
    ganhas: 0,
    perdidas: 0,
    valor_aberto: 0,
    valor_ganho: 0,
    ponderado: 0,
    por_etapa: {}
  };
  for (const e of ETAPAS) r.por_etapa[e] = { qtd: 0, valor: 0 };
  for (const o of rows || []) {
    r.total += 1;
    const etapa = normalizarEtapa(o.etapa);
    const valor = arredMoney(o.valor);
    if (!r.por_etapa[etapa]) r.por_etapa[etapa] = { qtd: 0, valor: 0 };
    r.por_etapa[etapa].qtd += 1;
    r.por_etapa[etapa].valor = arredMoney(r.por_etapa[etapa].valor + valor);
    if (ABERTAS.includes(etapa)) {
      r.abertas += 1;
      r.valor_aberto = arredMoney(r.valor_aberto + valor);
      r.ponderado = arredMoney(r.ponderado + valor * ((Number(o.probabilidade) || 0) / 100));
    } else if (etapa === 'Ganho') {
      r.ganhas += 1;
      r.valor_ganho = arredMoney(r.valor_ganho + valor);
    } else {
      r.perdidas += 1;
    }
  }
  return r;
}

function agruparKanban(rows) {
  const colunas = {};
  for (const e of ETAPAS) colunas[e] = [];
  for (const o of rows || []) {
    const e = normalizarEtapa(o.etapa);
    if (!colunas[e]) colunas[e] = [];
    colunas[e].push(o);
  }
  return colunas;
}

module.exports = {
  PAGINAS,
  ETAPAS,
  ABERTAS,
  ORIGENS,
  fail,
  arredMoney,
  normalizarEtapa,
  normalizarOrigem,
  probabilidadeDaEtapa,
  transicaoEtapa,
  classeEtapa,
  payloadOportunidade,
  resumirFunil,
  agruparKanban
};
