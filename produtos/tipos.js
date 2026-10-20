const TIPOS = ['produto', 'servico', 'kit', 'pesavel'];

function normalizarTipo(tipo) {
  const t = String(tipo || 'produto')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
  if (t === 'servico' || t === 'service') return 'servico';
  if (t === 'kit') return 'kit';
  if (t === 'pesavel' || t === 'peso' || t === 'kg') return 'pesavel';
  return 'produto';
}

function flagOn(v, padrao) {
  if (v === undefined || v === null || v === '') return padrao ? 1 : 0;
  if (v === true || v === 1 || v === '1') return 1;
  return 0;
}

function controlaEstoque(p, tipo) {
  const t = tipo || normalizarTipo(p?.tipo);
  if (t === 'servico') return false;
  return flagOn(p?.controla_estoque, true) === 1;
}

function ehFracionado(p, tipo) {
  const t = tipo || normalizarTipo(p?.tipo);
  if (t === 'pesavel') return true;
  return flagOn(p?.fracionado, false) === 1;
}

function arred(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function calcularEstoqueDisponivel(p, opts = {}) {
  const tipo = normalizarTipo(p?.tipo);
  if (!controlaEstoque(p, tipo)) return null;
  if (tipo === 'kit') {
    const itens = opts.itensKit || p.composicao || [];
    if (!itens.length) return 0;
    let min = null;
    for (const it of itens) {
      const q = Number(it.quantidade) || 0;
      if (q <= 0) continue;
      const prod = it.produto || it;
      const disp = calcularEstoqueDisponivel(prod, { origemEstoque: prod.estoque_origem_qtd });
      if (disp == null) continue;
      const kits = disp / q;
      min = min == null ? kits : Math.min(min, kits);
    }
    if (min == null) return null;
    return Math.floor(min + 1e-9);
  }
  const consumo = Number(p?.estoque_consumo) || 0;
  let saldo;
  if (p?.estoque_origem_id && consumo > 0) {
    saldo = Number(opts.origemEstoque != null ? opts.origemEstoque : p.estoque_origem_qtd) || 0;
    saldo = (saldo + 1e-9) / consumo;
  } else {
    saldo = Number(p?.estoque) || 0;
  }
  if (ehFracionado(p, tipo)) return arred(saldo);
  return Math.floor(saldo + 1e-9);
}

function rotuloTipo(tipo) {
  const t = normalizarTipo(tipo);
  if (t === 'servico') return 'Serviço';
  if (t === 'kit') return 'Kit';
  if (t === 'pesavel') return 'Pesável';
  return 'Produto';
}

module.exports = {
  TIPOS,
  normalizarTipo,
  flagOn,
  controlaEstoque,
  ehFracionado,
  arred,
  calcularEstoqueDisponivel,
  rotuloTipo
};
