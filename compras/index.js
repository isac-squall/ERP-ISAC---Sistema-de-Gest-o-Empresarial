const produtosTipos = require('../produtos/tipos');
const xmlNfe = require('./xml');

const STATUS = ['Aguardando', 'Aprovado', 'Recusado', 'Recebido'];
const FORMAS = ['Boleto', 'Dinheiro', 'PIX', 'Cartao Debito', 'Cartao Credito', 'Prazo', 'Transferencia'];

function normalizarStatus(status) {
  const s = String(status || '').trim();
  if (STATUS.includes(s)) return s;
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t === 'aguardando' || t === 'pendente' || t === 'aberto') return 'Aguardando';
  if (t === 'aprovado' || t === 'aprovada') return 'Aprovado';
  if (t === 'recusado' || t === 'recusada' || t === 'cancelado' || t === 'cancelada') return 'Recusado';
  if (t === 'recebido' || t === 'recebida') return 'Recebido';
  return 'Aguardando';
}

function rotuloStatus(status) {
  return normalizarStatus(status);
}

function classeStatus(status) {
  const s = normalizarStatus(status);
  if (s === 'Aprovado') return 'compra-aprovado';
  if (s === 'Recusado') return 'compra-recusado';
  if (s === 'Recebido') return 'compra-recebido';
  return 'compra-aguardando';
}

function normalizarForma(forma) {
  const s = String(forma || '').trim();
  if (!s) return 'Boleto';
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t.includes('pix')) return 'PIX';
  if (t.includes('dinheir')) return 'Dinheiro';
  if (t.includes('debit')) return 'Cartao Debito';
  if (t.includes('credit')) return 'Cartao Credito';
  if (t.includes('prazo') || t.includes('fiado')) return 'Prazo';
  if (t.includes('transf')) return 'Transferencia';
  if (t.includes('boleto')) return 'Boleto';
  return s.slice(0, 40);
}

function arredMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function validarItens(itens) {
  if (!Array.isArray(itens) || !itens.length) {
    const err = new Error('Informe ao menos um item');
    err.status = 400;
    throw err;
  }
  const out = [];
  for (const it of itens) {
    const produtoId = it.produto_id ? Number(it.produto_id) : null;
    const qtd = Number(it.quantidade);
    const preco = Number(it.preco_unitario);
    if (!Number.isFinite(qtd) || qtd <= 0) {
      const err = new Error('Quantidade invalida');
      err.status = 400;
      throw err;
    }
    if (!Number.isFinite(preco) || preco < 0) {
      const err = new Error('Preco unitario invalido');
      err.status = 400;
      throw err;
    }
    const descricao = String(it.descricao || it.nome || '').trim().slice(0, 200);
    out.push({
      produto_id: Number.isInteger(produtoId) && produtoId > 0 ? produtoId : null,
      descricao,
      quantidade: produtosTipos.arred(qtd),
      preco_unitario: arredMoney(preco),
      subtotal: arredMoney(qtd * preco)
    });
  }
  return out;
}

function totalizar(itens) {
  return arredMoney((itens || []).reduce((s, it) => s + (Number(it.subtotal) || 0), 0));
}

function podeEditar(status) {
  return normalizarStatus(status) === 'Aguardando';
}

function podeExcluir(status) {
  const s = normalizarStatus(status);
  return s === 'Aguardando' || s === 'Recusado';
}

function transicao(atual, destino) {
  const de = normalizarStatus(atual);
  const para = normalizarStatus(destino);
  if (de === para) return de;
  if (de === 'Aguardando' && (para === 'Aprovado' || para === 'Recusado')) return para;
  if (de === 'Aprovado' && para === 'Recebido') return para;
  if (de === 'Aprovado' && para === 'Recusado') return para;
  const err = new Error(`Nao e possivel alterar de ${de} para ${para}`);
  err.status = 400;
  throw err;
}

function resumir(rows) {
  const r = { total: 0, aguardando: 0, aprovados: 0, recusados: 0, recebidos: 0, valor: 0 };
  for (const row of rows || []) {
    r.total += 1;
    const s = normalizarStatus(row.status);
    if (s === 'Aguardando') r.aguardando += 1;
    else if (s === 'Aprovado') r.aprovados += 1;
    else if (s === 'Recusado') r.recusados += 1;
    else if (s === 'Recebido') r.recebidos += 1;
    if (s !== 'Recusado') r.valor = arredMoney(r.valor + (Number(row.valor) || 0));
  }
  return r;
}

module.exports = {
  STATUS,
  FORMAS,
  normalizarStatus,
  rotuloStatus,
  classeStatus,
  normalizarForma,
  arredMoney,
  validarItens,
  totalizar,
  podeEditar,
  podeExcluir,
  transicao,
  resumir,
  xml: xmlNfe
};
