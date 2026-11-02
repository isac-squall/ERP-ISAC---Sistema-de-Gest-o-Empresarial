const db = require('../database');

function fail(msg, status) {
  const err = new Error(msg);
  err.status = status || 400;
  throw err;
}

const ETAPAS = ['Lead', 'Qualificacao', 'Proposta', 'Negociacao', 'Ganho', 'Perdido'];
const ABERTAS = ['Lead', 'Qualificacao', 'Proposta', 'Negociacao'];
const ORIGENS = ['Indicacao', 'WhatsApp', 'Loja', 'Telefone', 'Site', 'Marketplace', 'Visita', 'Outro'];
const INTERACOES = ['Ligacao', 'Reuniao', 'Email', 'WhatsApp', 'Nota', 'Proximo'];
const PAGINAS = ['crm'];
const PROB_PADRAO = { Lead: 10, Qualificacao: 30, Proposta: 50, Negociacao: 80, Ganho: 100, Perdido: 0 };
const PROB_CHAVES = {
  Lead: 'crm_prob_lead',
  Qualificacao: 'crm_prob_qualificacao',
  Proposta: 'crm_prob_proposta',
  Negociacao: 'crm_prob_negociacao'
};

function arredMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function clampProb(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
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

function normalizarInteracao(tipo) {
  const s = String(tipo || '').trim();
  if (INTERACOES.includes(s)) return s;
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t.includes('lig')) return 'Ligacao';
  if (t.includes('reun') || t.includes('meet')) return 'Reuniao';
  if (t.includes('mail')) return 'Email';
  if (t.includes('whats')) return 'WhatsApp';
  if (t.includes('prox')) return 'Proximo';
  return 'Nota';
}

function normalizarTags(raw) {
  const parts = String(raw || '').split(/[,;#]+/).map(s => s.trim()).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p.slice(0, 24));
    if (out.length >= 8) break;
  }
  return out.join(', ');
}

function listaTags(raw) {
  return String(raw || '').split(/[,;#]+/).map(s => s.trim()).filter(Boolean);
}

function probsFromConfig(cfg) {
  const c = cfg || {};
  const out = { ...PROB_PADRAO };
  for (const etapa of ABERTAS) {
    const key = PROB_CHAVES[etapa];
    if (c[etapa] != null && c[etapa] !== '') out[etapa] = clampProb(c[etapa], out[etapa]);
    else if (c[key] != null && c[key] !== '') out[etapa] = clampProb(c[key], out[etapa]);
  }
  out.Ganho = 100;
  out.Perdido = 0;
  return out;
}

function lerProbs() {
  const rows = db.prepare("SELECT chave, valor FROM config WHERE chave LIKE 'crm_prob_%'").all();
  return probsFromConfig(Object.fromEntries(rows.map(r => [r.chave, r.valor])));
}

function salvarProbs(body) {
  const probs = probsFromConfig(body || {});
  const up = db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor');
  for (const etapa of ABERTAS) up.run(PROB_CHAVES[etapa], String(probs[etapa]));
  return probs;
}

function probabilidadeDaEtapa(etapa, cfg) {
  const s = normalizarEtapa(etapa);
  const probs = cfg && typeof cfg === 'object' ? (cfg.Lead != null ? cfg : probsFromConfig(cfg)) : PROB_PADRAO;
  return probs[s] ?? PROB_PADRAO[s] ?? 10;
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

function payloadOportunidade(body, cfg) {
  const titulo = String(body.titulo || '').trim();
  if (!titulo) fail('Titulo obrigatorio');
  const etapa = normalizarEtapa(body.etapa);
  const valor = arredMoney(body.valor);
  if (valor < 0) fail('Valor invalido');
  let probabilidade = body.probabilidade;
  if (probabilidade === undefined || probabilidade === null || probabilidade === '') {
    probabilidade = probabilidadeDaEtapa(etapa, cfg);
  } else {
    probabilidade = clampProb(probabilidade, probabilidadeDaEtapa(etapa, cfg));
  }
  const clienteId = body.cliente_id ? Number(body.cliente_id) : null;
  const vendedorId = body.vendedor_id ? Number(body.vendedor_id) : null;
  const orcamentoId = body.orcamento_id ? Number(body.orcamento_id) : null;
  const vendaId = body.venda_id ? Number(body.venda_id) : null;
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
    observacao: String(body.observacao || '').trim().slice(0, 500),
    tags: normalizarTags(body.tags),
    orcamento_id: Number.isInteger(orcamentoId) && orcamentoId > 0 ? orcamentoId : null,
    venda_id: Number.isInteger(vendaId) && vendaId > 0 ? vendaId : null
  };
}

function payloadInteracao(body) {
  const tipo = normalizarInteracao(body.tipo);
  let descricao = String(body.descricao || '').trim().slice(0, 500);
  if (!descricao) {
    if (tipo === 'WhatsApp' || tipo === 'Email' || tipo === 'Ligacao') descricao = `Contato via ${tipo}`;
    else fail('Descricao obrigatoria');
  }
  return {
    tipo,
    descricao,
    proximo_passo: String(body.proximo_passo || '').trim().slice(0, 200)
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

function etapaPorEventoOrcamento(evento) {
  const t = String(evento || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t === 'criar' || t === 'proposta' || t === 'orcamento') return 'Proposta';
  if (t === 'aprovar' || t === 'aprovado') return 'Negociacao';
  if (t === 'converter' || t === 'convertido' || t === 'venda' || t === 'ganhar') return 'Ganho';
  if (t === 'recusar' || t === 'recusado') return 'Perdido';
  return null;
}

function listarInteracoes(oportunidadeId) {
  return db.prepare(`
    SELECT i.*, u.nome as usuario_nome
    FROM crm_interacoes i
    LEFT JOIN usuarios u ON i.usuario_id = u.id
    WHERE i.oportunidade_id=?
    ORDER BY i.id DESC
  `).all(oportunidadeId);
}

function registrarInteracao(oportunidadeId, body, usuarioId) {
  const d = payloadInteracao(body || {});
  const r = db.prepare(`INSERT INTO crm_interacoes (oportunidade_id, tipo, descricao, proximo_passo, usuario_id)
    VALUES (?,?,?,?,?)`).run(oportunidadeId, d.tipo, d.descricao, d.proximo_passo || null, usuarioId || null);
  return { id: r.lastInsertRowid, ...d };
}

function localizarOportunidadeDoOrcamento(orc) {
  if (orc.oportunidade_id) {
    const row = db.prepare('SELECT * FROM crm_oportunidades WHERE id=?').get(orc.oportunidade_id);
    if (row) return row;
  }
  if (orc.id) {
    const byOrc = db.prepare('SELECT * FROM crm_oportunidades WHERE orcamento_id=?').get(orc.id);
    if (byOrc) return byOrc;
  }
  if (orc.cliente_id) {
    return db.prepare(`SELECT * FROM crm_oportunidades
      WHERE cliente_id=? AND etapa IN ('Lead','Qualificacao','Proposta','Negociacao')
      ORDER BY id DESC LIMIT 1`).get(orc.cliente_id) || null;
  }
  return null;
}

function avancarPorOrcamento(orc, evento, opts) {
  const etapaAlvo = etapaPorEventoOrcamento(evento);
  if (!etapaAlvo || !orc) return null;
  const probs = (opts && opts.probs) || lerProbs();
  const usuarioId = opts?.usuario_id || orc.usuario_id || null;
  let opp = localizarOportunidadeDoOrcamento(orc);
  if (!opp) {
    if (etapaAlvo === 'Perdido') return null;
    const nome = String(orc.cliente_nome || '').trim();
    const titulo = (`Orcamento #${orc.id}${nome ? ` - ${nome}` : ''}`).slice(0, 120);
    const r = db.prepare(`INSERT INTO crm_oportunidades
      (titulo, cliente_id, cliente_nome, valor, etapa, probabilidade, origem, vendedor_id, orcamento_id, venda_id, observacao, tags)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      titulo,
      orc.cliente_id || null,
      nome.slice(0, 120),
      arredMoney(orc.total),
      etapaAlvo,
      probabilidadeDaEtapa(etapaAlvo, probs),
      'Loja',
      usuarioId,
      orc.id || null,
      opts?.venda_id || null,
      `Gerado pelo orcamento #${orc.id}`,
      ''
    );
    opp = db.prepare('SELECT * FROM crm_oportunidades WHERE id=?').get(r.lastInsertRowid);
    if (orc.id) db.prepare('UPDATE orcamentos SET oportunidade_id=? WHERE id=?').run(opp.id, orc.id);
    registrarInteracao(opp.id, { tipo: 'Nota', descricao: `Oportunidade criada a partir do orcamento #${orc.id} (${etapaAlvo})` }, usuarioId);
    return opp;
  }
  try {
    const rank = (e) => ETAPAS.indexOf(normalizarEtapa(e));
    if (etapaAlvo !== 'Perdido' && rank(opp.etapa) > rank(etapaAlvo)) {
      if (orc.id) {
        db.prepare('UPDATE crm_oportunidades SET orcamento_id=COALESCE(orcamento_id, ?) WHERE id=?').run(orc.id, opp.id);
        db.prepare('UPDATE orcamentos SET oportunidade_id=COALESCE(oportunidade_id, ?) WHERE id=?').run(opp.id, orc.id);
      }
      return opp;
    }
    const nova = transicaoEtapa(opp.etapa, etapaAlvo);
    const probabilidade = probabilidadeDaEtapa(nova, probs);
    const sets = ['etapa=?', 'probabilidade=?', 'orcamento_id=COALESCE(orcamento_id, ?)'];
    const params = [nova, probabilidade, orc.id || opp.orcamento_id];
    if (opts?.venda_id) { sets.push('venda_id=?'); params.push(opts.venda_id); }
    if (Number(orc.total) > 0) { sets.push('valor=?'); params.push(arredMoney(orc.total)); }
    params.push(opp.id);
    db.prepare(`UPDATE crm_oportunidades SET ${sets.join(', ')} WHERE id=?`).run(...params);
    if (orc.id) db.prepare('UPDATE orcamentos SET oportunidade_id=? WHERE id=?').run(opp.id, orc.id);
    registrarInteracao(opp.id, { tipo: 'Nota', descricao: `Etapa ${nova} pelo orcamento #${orc.id}` }, usuarioId);
  } catch {
    if (orc.id) {
      db.prepare('UPDATE crm_oportunidades SET orcamento_id=COALESCE(orcamento_id, ?) WHERE id=?').run(orc.id, opp.id);
      db.prepare('UPDATE orcamentos SET oportunidade_id=COALESCE(oportunidade_id, ?) WHERE id=?').run(opp.id, orc.id);
    }
  }
  return db.prepare('SELECT * FROM crm_oportunidades WHERE id=?').get(opp.id);
}

module.exports = {
  PAGINAS,
  ETAPAS,
  ABERTAS,
  ORIGENS,
  INTERACOES,
  PROB_PADRAO,
  PROB_CHAVES,
  fail,
  arredMoney,
  normalizarEtapa,
  normalizarOrigem,
  normalizarInteracao,
  normalizarTags,
  listaTags,
  probsFromConfig,
  lerProbs,
  salvarProbs,
  probabilidadeDaEtapa,
  transicaoEtapa,
  classeEtapa,
  payloadOportunidade,
  payloadInteracao,
  resumirFunil,
  agruparKanban,
  etapaPorEventoOrcamento,
  listarInteracoes,
  registrarInteracao,
  localizarOportunidadeDoOrcamento,
  avancarPorOrcamento
};
