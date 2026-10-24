function fail(msg, status) {
  const err = new Error(msg);
  err.status = status || 400;
  throw err;
}

const STATUS = ['Ativo', 'Pausado', 'Encerrado'];
const PERIODICIDADES = ['Mensal', 'Trimestral', 'Semestral', 'Anual'];
const PAGINAS = ['contratos'];

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
    itens
  };
}

function podeFaturar(contrato, hoje) {
  const s = normalizarStatus(contrato.status);
  if (s !== 'Ativo') fail('So contrato ativo fatura');
  const dia = String(hoje || '').slice(0, 10);
  const prox = String(contrato.proximo_faturamento || '').slice(0, 10);
  if (contrato.fim && dia > String(contrato.fim).slice(0, 10)) fail('Contrato ja encerrou');
  if (prox && dia < prox) fail('Ainda nao chegou a data de faturamento');
  return true;
}

function aposFaturar(contrato, dataFat) {
  const prox = addMesesIso(dataFat || contrato.proximo_faturamento, mesesDaPeriodicidade(contrato.periodicidade));
  let status = normalizarStatus(contrato.status);
  if (contrato.fim && prox > String(contrato.fim).slice(0, 10)) status = 'Encerrado';
  return { proximo_faturamento: prox, ultimo_faturamento: dataFat, status };
}

function resumirContratos(rows) {
  const r = { total: 0, ativos: 0, pausados: 0, encerrados: 0, mrr: 0, a_faturar: 0 };
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
  }
  return r;
}

module.exports = {
  PAGINAS,
  STATUS,
  PERIODICIDADES,
  fail,
  arredMoney,
  normalizarStatus,
  normalizarPeriodicidade,
  mesesDaPeriodicidade,
  addMesesIso,
  proximoFaturamento,
  transicaoStatus,
  classeStatus,
  validarItens,
  payloadContrato,
  podeFaturar,
  aposFaturar,
  resumirContratos
};
