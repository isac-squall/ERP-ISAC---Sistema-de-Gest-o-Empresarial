function fail(msg, status) {
  const err = new Error(msg);
  err.status = status || 400;
  throw err;
}

const STATUS_ORC = ['Aberto', 'Aprovado', 'Recusado', 'Convertido'];
const PAGINAS = [
  'gerencia-aprovacao-vendas',
  'gerencia-compras',
  'gerencia-fechamento-caixas',
  'gerencia-inventario',
  'gerencia-consulta-estoque'
];

function arredMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizarStatusOrc(status) {
  const s = String(status || '').trim();
  if (STATUS_ORC.includes(s)) return s;
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t === 'aberto' || t === 'pendente' || t === 'aguardando') return 'Aberto';
  if (t === 'aprovado' || t === 'aprovada') return 'Aprovado';
  if (t === 'recusado' || t === 'recusada' || t === 'cancelado' || t === 'cancelada') return 'Recusado';
  if (t === 'convertido' || t === 'convertida' || t === 'venda') return 'Convertido';
  return 'Aberto';
}

function transicaoOrc(de, para) {
  const d = normalizarStatusOrc(de);
  const p = normalizarStatusOrc(para);
  if (d === 'Convertido') fail('Orcamento ja convertido');
  if (d === p) return p;
  if (d === 'Aberto' && (p === 'Aprovado' || p === 'Recusado')) return p;
  if (d === 'Aprovado' && (p === 'Convertido' || p === 'Recusado')) return p;
  fail(`Nao e possivel ir de ${d} para ${p}`);
}

function classeStatusOrc(status) {
  const s = normalizarStatusOrc(status);
  if (s === 'Aprovado') return 'compra-aprovado';
  if (s === 'Recusado') return 'compra-recusado';
  if (s === 'Convertido') return 'compra-recebido';
  return 'compra-aguardando';
}

function resumirOrcamentos(rows) {
  const r = { total: 0, abertos: 0, aprovados: 0, recusados: 0, convertidos: 0, valor: 0 };
  for (const o of rows || []) {
    r.total += 1;
    const s = normalizarStatusOrc(o.status);
    if (s === 'Aberto') r.abertos += 1;
    else if (s === 'Aprovado') r.aprovados += 1;
    else if (s === 'Recusado') r.recusados += 1;
    else if (s === 'Convertido') r.convertidos += 1;
    if (s === 'Aberto' || s === 'Aprovado') r.valor = arredMoney(r.valor + (Number(o.total) || 0));
  }
  return r;
}

function parseItensOrc(itens) {
  if (Array.isArray(itens)) return itens;
  if (typeof itens === 'string') {
    try {
      const parsed = JSON.parse(itens);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function itensParaVenda(itens) {
  const out = [];
  for (const it of parseItensOrc(itens)) {
    const qtd = Number(it.quantidade) || 0;
    const preco = Number(it.preco_unitario != null ? it.preco_unitario : it.preco) || 0;
    if (qtd <= 0) fail('Item do orcamento com quantidade invalida');
    out.push({
      produto_id: it.produto_id ? Number(it.produto_id) : null,
      descricao: String(it.descricao || it.nome || '').trim() || 'Item',
      quantidade: qtd,
      preco_unitario: arredMoney(preco)
    });
  }
  if (!out.length) fail('Orcamento sem itens');
  return out;
}

function calcularFechamento({ abertura, entradas, vendas, saidas }) {
  const a = arredMoney(abertura);
  const e = arredMoney(entradas);
  const v = arredMoney(vendas);
  const s = arredMoney(saidas);
  return { abertura: a, entradas: e, vendas: v, saidas: s, saldo: arredMoney(a + e + v - s) };
}

function deltaInventario(atual, contado) {
  return Math.round(((Number(contado) || 0) - (Number(atual) || 0)) * 10000) / 10000;
}

function validarContagem(contado) {
  const n = Number(contado);
  if (!Number.isFinite(n) || n < 0) fail('Quantidade contada invalida');
  return n;
}

module.exports = {
  PAGINAS,
  STATUS_ORC,
  fail,
  arredMoney,
  normalizarStatusOrc,
  transicaoOrc,
  classeStatusOrc,
  resumirOrcamentos,
  parseItensOrc,
  itensParaVenda,
  calcularFechamento,
  deltaInventario,
  validarContagem
};
