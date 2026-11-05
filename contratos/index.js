function fail(msg, status) {
  const err = new Error(msg);
  err.status = status || 400;
  throw err;
}

const STATUS = ['Ativo', 'Pausado', 'Encerrado'];
const PERIODICIDADES = ['Mensal', 'Trimestral', 'Semestral', 'Anual'];
const INDICES = ['Nenhum', 'IGP-M', 'IPCA', 'Manual'];
const PAGINAS = ['contratos'];
const DIAS_ANTECIPAR_FATURA = 5;
const DIAS_ALERTA_FIM = 30;

function arredMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizarStatus(status) {
  const s = String(status || '').trim();
  if (STATUS.includes(s)) return s;
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t === 'pausado' || t === 'suspenso') return 'Pausado';
  if (t === 'encerrado' || t === 'cancelado' || t === 'inativo') return 'Encerrado';
  return 'Ativo';
}

function normalizarPeriodicidade(p) {
  const s = String(p || '').trim();
  if (PERIODICIDADES.includes(s)) return s;
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t.includes('trim')) return 'Trimestral';
  if (t.includes('semestr')) return 'Semestral';
  if (t.includes('anual') || t === 'ano') return 'Anual';
  return 'Mensal';
}

function mesesDaPeriodicidade(p) {
  const s = normalizarPeriodicidade(p);
  if (s === 'Trimestral') return 3;
  if (s === 'Semestral') return 6;
  if (s === 'Anual') return 12;
  return 1;
}

function addMesesIso(iso, meses) {
  const raw = String(iso || '').slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) fail('Data invalida');
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const dia = d.getDate();
  d.setMonth(d.getMonth() + Number(meses));
  if (d.getDate() !== dia) d.setDate(0);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function proximoFaturamento(inicio, periodicidade, ultimo) {
  const base = ultimo || inicio;
  return addMesesIso(base, mesesDaPeriodicidade(periodicidade));
}

function transicaoStatus(de, para) {
  const d = normalizarStatus(de);
  const p = normalizarStatus(para);
  if (d === p) return p;
  if (d === 'Encerrado') fail('Contrato encerrado nao reabre');
  return p;
}

function classeStatus(status) {
  const s = normalizarStatus(status);
  if (s === 'Ativo') return 'compra-recebido';
  if (s === 'Pausado') return 'compra-aguardando';
  return 'compra-recusado';
}

function validarItens(itens) {
  if (!Array.isArray(itens) || !itens.length) fail('Informe ao menos um item');
  const out = [];
  for (const it of itens) {
    const qtd = Number(it.quantidade);
    const preco = Number(it.preco_unitario != null ? it.preco_unitario : it.preco);
    if (!Number.isFinite(qtd) || qtd <= 0) fail('Quantidade invalida');
    if (!Number.isFinite(preco) || preco < 0) fail('Preco invalido');
    out.push({
      produto_id: it.produto_id ? Number(it.produto_id) : null,
      descricao: String(it.descricao || it.nome || '').trim() || 'Servico',
      quantidade: qtd,
      preco_unitario: arredMoney(preco),
      subtotal: arredMoney(qtd * preco)
    });
  }
  return out;
}

function payloadContrato(body) {
  const descricao = String(body.descricao || '').trim();
  if (!descricao) fail('Descricao obrigatoria');
  const clienteId = Number(body.cliente_id);
  if (!Number.isInteger(clienteId) || clienteId <= 0) fail('Cliente obrigatorio');
  const itens = body.itens ? validarItens(body.itens) : null;
  const valor = itens
    ? arredMoney(itens.reduce((s, i) => s + i.subtotal, 0))
    : arredMoney(body.valor);
  if (valor < 0) fail('Valor invalido');
  const periodicidade = normalizarPeriodicidade(body.periodicidade);
  const inicio = String(body.inicio || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) fail('Data de inicio invalida');
  let dia = Number(body.dia_vencimento);
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) dia = Number(inicio.slice(8, 10)) || 1;
  const fim = body.fim ? String(body.fim).slice(0, 10) : null;
  if (fim && !/^\d{4}-\d{2}-\d{2}$/.test(fim)) fail('Data de fim invalida');
  if (fim && fim < inicio) fail('Fim nao pode ser anterior ao inicio');
  const anexo = validarAnexo(body.anexo, body.anexo_nome);
  const indice = normalizarIndice(body.indice_reajuste);
  let dataBase = body.data_base_reajuste ? String(body.data_base_reajuste).slice(0, 10) : inicio;
  if (dataBase && !/^\d{4}-\d{2}-\d{2}$/.test(dataBase)) dataBase = inicio;
  const auto = body.auto_faturar === true || body.auto_faturar === 1 || body.auto_faturar === '1' || body.auto_faturar === 'on';
  return {
    cliente_id: clienteId,
    descricao: descricao.slice(0, 160),
    valor,
    periodicidade,
    dia_vencimento: dia,
    inicio,
    fim,
    status: normalizarStatus(body.status || 'Ativo'),
    proximo_faturamento: body.proximo_faturamento
      ? String(body.proximo_faturamento).slice(0, 10)
      : inicio,
    observacao: String(body.observacao || '').trim().slice(0, 500),
    indice_reajuste: indice,
    data_base_reajuste: dataBase,
    ultimo_reajuste: body.ultimo_reajuste ? String(body.ultimo_reajuste).slice(0, 10) : null,
    auto_faturar: auto ? 1 : 0,
    anexo: anexo.anexo,
    anexo_nome: anexo.anexo_nome,
    itens
  };
}

function dataVencimento(contrato, competencia) {
  const raw = String(competencia || contrato.proximo_faturamento || '').slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw;
  let dia = Number(contrato.dia_vencimento);
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) dia = Number(m[3]) || 1;
  return `${m[1]}-${m[2]}-${String(dia).padStart(2, '0')}`;
}

function addDiasIso(iso, dias) {
  const raw = String(iso || '').slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) fail('Data invalida');
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + Number(dias || 0));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function podeFaturar(contrato, hoje, anteciparDias) {
  const s = normalizarStatus(contrato.status);
  if (s !== 'Ativo') fail('So contrato ativo fatura');
  const dia = String(hoje || '').slice(0, 10);
  const prox = String(contrato.proximo_faturamento || '').slice(0, 10);
  if (contrato.fim && dia > String(contrato.fim).slice(0, 10)) fail('Contrato ja encerrou');
  const janela = Number.isFinite(Number(anteciparDias)) ? Number(anteciparDias) : 0;
  if (prox) {
    const inicioJanela = janela > 0 ? addDiasIso(prox, -janela) : prox;
    if (dia < inicioJanela) fail('Ainda nao chegou a data de faturamento');
  }
  return true;
}

function aposFaturar(contrato, dataFat) {
  const base = contrato.proximo_faturamento || dataFat;
  const prox = addMesesIso(base, mesesDaPeriodicidade(contrato.periodicidade));
  let status = normalizarStatus(contrato.status);
  if (contrato.fim && prox > String(contrato.fim).slice(0, 10)) status = 'Encerrado';
  return { proximo_faturamento: prox, ultimo_faturamento: dataFat, status };
}

function normalizarIndice(indice) {
  const s = String(indice || '').trim();
  if (INDICES.includes(s)) return s;
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t.includes('igp')) return 'IGP-M';
  if (t.includes('ipca')) return 'IPCA';
  if (t.includes('manual')) return 'Manual';
  return 'Nenhum';
}

function dataReajusteDevida(contrato) {
  const indice = normalizarIndice(contrato.indice_reajuste);
  if (indice === 'Nenhum') return null;
  const base = contrato.ultimo_reajuste || contrato.data_base_reajuste || contrato.inicio;
  if (!base) return null;
  return addMesesIso(String(base).slice(0, 10), 12);
}

function precisaReajuste(contrato, hoje) {
  const devida = dataReajusteDevida(contrato);
  if (!devida) return false;
  return String(hoje || '').slice(0, 10) >= devida;
}

function aplicarReajuste(contrato, percentual, hoje) {
  const pct = Number(percentual);
  if (!Number.isFinite(pct)) fail('Percentual de reajuste invalido');
  if (pct < -50 || pct > 100) fail('Percentual de reajuste fora da faixa');
  const valor = arredMoney((Number(contrato.valor) || 0) * (1 + pct / 100));
  if (valor < 0) fail('Valor invalido');
  return {
    valor,
    percentual: arredMoney(pct),
    ultimo_reajuste: String(hoje || '').slice(0, 10),
    indice_reajuste: normalizarIndice(contrato.indice_reajuste)
  };
}

function vigenciaProxima(contrato, hoje, dias) {
  if (!contrato.fim) return false;
  if (normalizarStatus(contrato.status) === 'Encerrado') return false;
  const fim = String(contrato.fim).slice(0, 10);
  const dia = String(hoje || '').slice(0, 10);
  if (!fim || dia > fim) return dia > fim;
  const limite = addDiasIso(dia, Number.isFinite(Number(dias)) ? Number(dias) : DIAS_ALERTA_FIM);
  return fim <= limite;
}

function resumoAdimplencia(lancamentos, hoje) {
  const dia = String(hoje || '').slice(0, 10);
  const r = { pago: 0, atrasado: 0, aberto: 0, qtd_pago: 0, qtd_atrasado: 0, qtd_aberto: 0 };
  for (const f of lancamentos || []) {
    const valor = arredMoney(f.valor);
    if (String(f.status) === 'Pago') {
      r.pago = arredMoney(r.pago + valor);
      r.qtd_pago += 1;
    } else if (f.data_vencimento && String(f.data_vencimento).slice(0, 10) < dia) {
      r.atrasado = arredMoney(r.atrasado + valor);
      r.qtd_atrasado += 1;
    } else {
      r.aberto = arredMoney(r.aberto + valor);
      r.qtd_aberto += 1;
    }
  }
  let situacao = 'Sem faturas';
  if (r.qtd_atrasado) situacao = 'Inadimplente';
  else if (r.qtd_aberto) situacao = 'Em aberto';
  else if (r.qtd_pago) situacao = 'Adimplente';
  return { ...r, situacao };
}

function validarAnexo(dataUrl, nome) {
  const raw = String(dataUrl || '');
  if (!raw) return { anexo: '', anexo_nome: '' };
  if (!/^data:(application\/pdf|image\/(png|jpe?g|webp));base64,/i.test(raw)) {
    fail('Anexo deve ser PDF ou imagem');
  }
  if (raw.length > 7 * 1024 * 1024) fail('Anexo deve ter no maximo 5MB');
  return { anexo: raw, anexo_nome: String(nome || 'contrato.pdf').slice(0, 120) };
}

function resumirContratos(rows) {
  const r = {
    total: 0, ativos: 0, pausados: 0, encerrados: 0, mrr: 0, a_faturar: 0,
    alerta_vigencia: 0, precisa_reajuste: 0, inadimplentes: 0
  };
  for (const c of rows || []) {
    r.total += 1;
    const s = normalizarStatus(c.status);
    if (s === 'Ativo') {
      r.ativos += 1;
      const meses = mesesDaPeriodicidade(c.periodicidade);
      r.mrr = arredMoney(r.mrr + (Number(c.valor) || 0) / meses);
      r.a_faturar = arredMoney(r.a_faturar + (Number(c.valor) || 0));
    } else if (s === 'Pausado') r.pausados += 1;
    else r.encerrados += 1;
    if (c.alerta_vigencia) r.alerta_vigencia += 1;
    if (c.precisa_reajuste) r.precisa_reajuste += 1;
    if (c.adimplencia && c.adimplencia.situacao === 'Inadimplente') r.inadimplentes += 1;
  }
  return r;
}

function lancamentoFatura(contrato, hoje) {
  const competencia = String(contrato.proximo_faturamento || hoje || '').slice(0, 10);
  return {
    tipo: 'Receita',
    categoria: 'Contrato',
    descricao: `Contrato #${contrato.id} ${contrato.descricao} (${competencia})`,
    valor: arredMoney(contrato.valor),
    data_vencimento: dataVencimento(contrato, competencia),
    status: 'Pendente',
    cliente_id: contrato.cliente_id,
    origem: 'contrato'
  };
}

function deveAutoFaturar(contrato, hoje) {
  if (!contrato.auto_faturar) return false;
  try {
    podeFaturar(contrato, hoje, DIAS_ANTECIPAR_FATURA);
    return true;
  } catch (_) {
    return false;
  }
}

function enriquecerContrato(contrato, hoje, lancamentos) {
  const dia = String(hoje || '').slice(0, 10);
  const adimplencia = resumoAdimplencia(lancamentos, dia);
  return {
    ...contrato,
    precisa_reajuste: precisaReajuste(contrato, dia),
    alerta_vigencia: vigenciaProxima(contrato, dia, DIAS_ALERTA_FIM),
    adimplencia,
    data_reajuste: dataReajusteDevida(contrato)
  };
}

module.exports = {
  PAGINAS,
  STATUS,
  PERIODICIDADES,
  INDICES,
  DIAS_ANTECIPAR_FATURA,
  DIAS_ALERTA_FIM,
  fail,
  arredMoney,
  normalizarStatus,
  normalizarPeriodicidade,
  mesesDaPeriodicidade,
  addMesesIso,
  addDiasIso,
  proximoFaturamento,
  transicaoStatus,
  classeStatus,
  validarItens,
  payloadContrato,
  podeFaturar,
  aposFaturar,
  dataVencimento,
  normalizarIndice,
  dataReajusteDevida,
  precisaReajuste,
  aplicarReajuste,
  vigenciaProxima,
  resumoAdimplencia,
  validarAnexo,
  resumirContratos,
  lancamentoFatura,
  deveAutoFaturar,
  enriquecerContrato
};
