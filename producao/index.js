function fail(msg, status) {
  const err = new Error(msg);
  err.status = status || 400;
  throw err;
}

const STATUS = ['Aberta', 'Em producao', 'Concluida', 'Cancelada'];
const PAGINAS = ['producao', 'estoque'];

function arredQtd(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function arredMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizarStatus(status) {
  const s = String(status || '').trim();
  if (STATUS.includes(s)) return s;
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t.includes('produc') || t === 'andamento') return 'Em producao';
  if (t.includes('conclu') || t === 'pronta' || t === 'finalizada') return 'Concluida';
  if (t.includes('cancel')) return 'Cancelada';
  return 'Aberta';
}

function transicaoStatus(de, para) {
  const d = normalizarStatus(de);
  const p = normalizarStatus(para);
  if (d === p) return p;
  if (d === 'Concluida') fail('OP concluida nao muda de status');
  if (d === 'Cancelada') fail('OP cancelada nao reabre');
  if (d === 'Aberta' && (p === 'Em producao' || p === 'Cancelada')) return p;
  if (d === 'Em producao' && (p === 'Concluida' || p === 'Cancelada')) return p;
  fail(`Nao e possivel ir de ${d} para ${p}`);
}

function classeStatus(status) {
  const s = normalizarStatus(status);
  if (s === 'Concluida') return 'compra-recebido';
  if (s === 'Cancelada') return 'compra-recusado';
  if (s === 'Em producao') return 'compra-aprovado';
  return 'compra-aguardando';
}

function validarItensBom(itens) {
  if (!Array.isArray(itens) || !itens.length) fail('Informe a composicao (BOM)');
  const out = [];
  for (const it of itens) {
    const itemId = Number(it.item_id || it.produto_id);
    const qtd = Number(it.quantidade);
    if (!Number.isInteger(itemId) || itemId <= 0) fail('Item da composicao invalido');
    if (!Number.isFinite(qtd) || qtd <= 0) fail('Quantidade da composicao invalida');
    out.push({
      item_id: itemId,
      descricao: String(it.descricao || it.nome || '').trim(),
      quantidade: arredQtd(qtd)
    });
  }
  return out;
}

function explodirBom(bom, quantidade) {
  const qtdOp = arredQtd(quantidade);
  if (qtdOp <= 0) fail('Quantidade da OP invalida');
  return validarItensBom(bom).map(it => ({
    ...it,
    quantidade: arredQtd(it.quantidade * qtdOp)
  }));
}

function checarEstoque(necessario, saldos) {
  const mapa = new Map((saldos || []).map(s => [Number(s.id || s.item_id), Number(s.estoque) || 0]));
  const faltas = [];
  for (const it of necessario) {
    const tem = mapa.get(it.item_id) || 0;
    if (tem + 1e-9 < it.quantidade) {
      faltas.push({
        item_id: it.item_id,
        descricao: it.descricao,
        precisa: it.quantidade,
        tem,
        falta: arredQtd(it.quantidade - tem)
      });
    }
  }
  return faltas;
}

function payloadOp(body) {
  const produtoId = Number(body.produto_id);
  if (!Number.isInteger(produtoId) || produtoId <= 0) fail('Produto acabado obrigatorio');
  const quantidade = arredQtd(body.quantidade);
  if (quantidade <= 0) fail('Quantidade da OP invalida');
  return {
    produto_id: produtoId,
    quantidade,
    status: normalizarStatus(body.status || 'Aberta'),
    observacao: String(body.observacao || '').trim().slice(0, 400)
  };
}

function curvaAbc(linhas) {
  const rows = (linhas || [])
    .map(l => ({
      produto_id: l.produto_id,
      nome: l.nome || l.descricao || '',
      quantidade: arredQtd(l.quantidade),
      valor: arredMoney(l.valor != null ? l.valor : (Number(l.quantidade) || 0) * (Number(l.preco) || 0))
    }))
    .filter(l => l.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  const total = arredMoney(rows.reduce((s, r) => s + r.valor, 0));
  let acum = 0;
  return rows.map((r, i) => {
    acum = arredMoney(acum + r.valor);
    const perc = total ? (acum / total) * 100 : 0;
    let classe = 'C';
    if (perc <= 80) classe = 'A';
    else if (perc <= 95) classe = 'B';
    return {
      ...r,
      posicao: i + 1,
      percentual: Math.round((r.valor / (total || 1)) * 10000) / 100,
      acumulado: Math.round(perc * 100) / 100,
      classe
    };
  });
}

function resumirOps(rows) {
  const r = { total: 0, abertas: 0, producao: 0, concluidas: 0, canceladas: 0 };
  for (const o of rows || []) {
    r.total += 1;
    const s = normalizarStatus(o.status);
    if (s === 'Aberta') r.abertas += 1;
    else if (s === 'Em producao') r.producao += 1;
    else if (s === 'Concluida') r.concluidas += 1;
    else r.canceladas += 1;
  }
  return r;
}

module.exports = {
  PAGINAS,
  STATUS,
  fail,
  arredQtd,
  arredMoney,
  normalizarStatus,
  transicaoStatus,
  classeStatus,
  validarItensBom,
  explodirBom,
  checarEstoque,
  payloadOp,
  curvaAbc,
  resumirOps
};
