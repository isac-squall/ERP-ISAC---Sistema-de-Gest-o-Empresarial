function fail(msg, status) {
  const err = new Error(msg);
  err.status = status || 400;
  throw err;
}

const TIPOS_CONTA = ['Corrente', 'Poupanca', 'Caixa', 'Digital'];
const STATUS_EXTRATO = ['Aberto', 'Conciliado', 'Ignorado'];
const PAGINAS = ['financeiro'];

function arredMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizarTipoConta(tipo) {
  const s = String(tipo || '').trim();
  if (TIPOS_CONTA.includes(s)) return s;
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t.includes('poup')) return 'Poupanca';
  if (t.includes('caixa')) return 'Caixa';
  if (t.includes('digit') || t.includes('pix')) return 'Digital';
  return 'Corrente';
}

function normalizarStatusExtrato(status) {
  const s = String(status || '').trim();
  if (STATUS_EXTRATO.includes(s)) return s;
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t.includes('concili')) return 'Conciliado';
  if (t.includes('ignor')) return 'Ignorado';
  return 'Aberto';
}

function payloadConta(body) {
  const nome = String(body.nome || '').trim();
  if (!nome) fail('Nome da conta obrigatorio');
  return {
    nome: nome.slice(0, 80),
    banco: String(body.banco || '').trim().slice(0, 60),
    agencia: String(body.agencia || '').trim().slice(0, 20),
    conta: String(body.conta || '').trim().slice(0, 30),
    tipo: normalizarTipoConta(body.tipo),
    saldo_inicial: arredMoney(body.saldo_inicial),
    ativo: body.ativo === 0 || body.ativo === '0' || body.ativo === false ? 0 : 1
  };
}

function parseDataBr(v) {
  const raw = String(v || '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  fail('Data do extrato invalida');
}

function parseValor(v) {
  if (typeof v === 'number') return arredMoney(v);
  let s = String(v || '').trim();
  if (!s) fail('Valor do extrato invalido');
  s = s.replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) fail('Valor do extrato invalido');
  return arredMoney(n);
}

function linhaExtrato(row) {
  const valor = parseValor(row.valor);
  return {
    data: parseDataBr(row.data),
    descricao: String(row.descricao || row.historico || 'Lancamento').trim().slice(0, 160) || 'Lancamento',
    valor,
    tipo: valor >= 0 ? 'Credito' : 'Debito',
    documento: String(row.documento || row.doc || '').trim().slice(0, 40)
  };
}

function parseCsvExtrato(texto) {
  const raw = String(texto || '').replace(/^\uFEFF/, '');
  const linhas = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!linhas.length) fail('Arquivo vazio');
  const sep = linhas[0].includes(';') ? ';' : linhas[0].includes('\t') ? '\t' : ',';
  const cells = (line) => line.split(sep).map(c => c.replace(/^["']|["']$/g, '').trim());
  const head = cells(linhas[0]).map(h => h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
  let start = 0;
  let idxData = 0;
  let idxDesc = 1;
  let idxValor = 2;
  let idxDoc = -1;
  const looksHeader = head.some(h => /data|descr|histor|valor|credit|debit/.test(h));
  if (looksHeader) {
    start = 1;
    idxData = head.findIndex(h => h.includes('data'));
    idxDesc = head.findIndex(h => /descr|histor|memo|nome/.test(h));
    idxValor = head.findIndex(h => h.includes('valor') || h === 'vlr');
    if (idxValor < 0) {
      const iC = head.findIndex(h => h.includes('credit'));
      const iD = head.findIndex(h => h.includes('debit'));
      if (iC >= 0 || iD >= 0) idxValor = -2;
    }
    idxDoc = head.findIndex(h => /doc|id|nro|numero/.test(h));
    if (idxData < 0) idxData = 0;
    if (idxDesc < 0) idxDesc = 1;
    if (idxValor === -1) idxValor = 2;
  }
  const out = [];
  for (let i = start; i < linhas.length; i++) {
    const c = cells(linhas[i]);
    if (!c.length) continue;
    try {
      let valor;
      if (idxValor === -2) {
        const cred = Number(String(c[head.findIndex(h => h.includes('credit'))] || '0').replace(',', '.')) || 0;
        const deb = Number(String(c[head.findIndex(h => h.includes('debit'))] || '0').replace(',', '.')) || 0;
        valor = arredMoney(cred - deb);
        if (!valor) continue;
      } else {
        valor = parseValor(c[idxValor]);
      }
      out.push(linhaExtrato({
        data: c[idxData],
        descricao: c[idxDesc],
        valor,
        documento: idxDoc >= 0 ? c[idxDoc] : ''
      }));
    } catch {
      continue;
    }
  }
  if (!out.length) fail('Nenhuma linha valida no extrato');
  return out;
}

function scoreMatch(extrato, lanc) {
  const vE = arredMoney(Math.abs(Number(extrato.valor) || 0));
  const tipoFin = Number(extrato.valor) >= 0 ? 'Receita' : 'Despesa';
  if (String(lanc.tipo) !== tipoFin) return 0;
  const vF = arredMoney(Math.abs(Number(lanc.valor) || 0));
  if (vE !== vF) return 0;
  const dE = String(extrato.data || '').slice(0, 10);
  const dF = String(lanc.data_pagamento || lanc.data_vencimento || '').slice(0, 10);
  if (!dE || !dF) return 40;
  const a = new Date(dE + 'T00:00:00');
  const b = new Date(dF + 'T00:00:00');
  const diff = Math.abs(a - b) / 86400000;
  if (diff === 0) return 100;
  if (diff <= 2) return 80;
  if (diff <= 5) return 50;
  return 0;
}

function sugerirMatches(extratos, lancamentos) {
  const usados = new Set();
  const pares = [];
  for (const e of extratos || []) {
    if (normalizarStatusExtrato(e.status) !== 'Aberto') continue;
    let best = null;
    let bestScore = 0;
    for (const l of lancamentos || []) {
      if (usados.has(l.id)) continue;
      if (String(l.status) === 'Conciliado') continue;
      const s = scoreMatch(e, l);
      if (s > bestScore) {
        bestScore = s;
        best = l;
      }
    }
    if (best && bestScore >= 50) {
      usados.add(best.id);
      pares.push({ extrato_id: e.id, financeiro_id: best.id, score: bestScore });
    }
  }
  return pares;
}

function aplicarMovimentoSaldo(saldo, valor) {
  return arredMoney((Number(saldo) || 0) + (Number(valor) || 0));
}

function montarFluxo({ saldoInicial, lancamentos, de, dias }) {
  const nDias = Math.max(1, Math.min(Number(dias) || 30, 90));
  const start = String(de || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) fail('Data inicial invalida');
  const [y, m, d] = start.split('-').map(Number);
  const out = [];
  let saldo = arredMoney(saldoInicial);
  for (let i = 0; i < nDias; i++) {
    const dt = new Date(y, m - 1, d + i);
    const p = (n) => String(n).padStart(2, '0');
    const iso = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
    let entradas = 0;
    let saidas = 0;
    for (const l of lancamentos || []) {
      const dia = String(l.data_vencimento || l.data || '').slice(0, 10);
      if (dia !== iso) continue;
      const v = arredMoney(l.valor);
      if (String(l.tipo) === 'Receita') entradas = arredMoney(entradas + v);
      else saidas = arredMoney(saidas + v);
    }
    saldo = arredMoney(saldo + entradas - saidas);
    out.push({ data: iso, entradas, saidas, saldo });
  }
  return { saldo_inicial: arredMoney(saldoInicial), dias: out };
}

module.exports = {
  PAGINAS,
  TIPOS_CONTA,
  STATUS_EXTRATO,
  fail,
  arredMoney,
  normalizarTipoConta,
  normalizarStatusExtrato,
  payloadConta,
  parseDataBr,
  parseValor,
  linhaExtrato,
  parseCsvExtrato,
  scoreMatch,
  sugerirMatches,
  aplicarMovimentoSaldo,
  montarFluxo
};
