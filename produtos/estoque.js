const tipos = require('./tipos');

function situacaoDe(p) {
  const tipo = tipos.normalizarTipo(p?.tipo);
  if (!tipos.controlaEstoque(p, tipo)) return 'nao_controla';
  let disp = p.estoque_disponivel;
  if (disp == null) disp = tipos.calcularEstoqueDisponivel(p, {
    origemEstoque: p.estoque_origem_qtd
  });
  if (disp == null || !Number.isFinite(Number(disp))) return 'nao_controla';
  const n = Number(disp);
  const min = Number(p.estoque_minimo) || 0;
  if (n <= 1e-9) return 'zerado';
  if (n <= min) return 'baixo';
  return 'ok';
}

function valorEstoque(p) {
  const tipo = tipos.normalizarTipo(p?.tipo);
  if (tipo === 'servico' || tipo === 'kit') return 0;
  if (p?.estoque_origem_id) return 0;
  const qtd = Number(p?.estoque) || 0;
  const custo = Number(p?.preco_custo) || 0;
  return tipos.arred(qtd * custo);
}

function rotuloSituacao(s) {
  if (s === 'zerado') return 'Sem estoque';
  if (s === 'baixo') return 'Estoque baixo';
  if (s === 'nao_controla') return 'Nao controla';
  return 'Em estoque';
}

function resumir(itens) {
  const resumo = { itens: itens.length, valor: 0, ok: 0, baixo: 0, zerado: 0, nao_controla: 0 };
  for (const p of itens) {
    const sit = p.situacao || situacaoDe(p);
    resumo.valor = tipos.arred(resumo.valor + (p.valor_estoque != null ? Number(p.valor_estoque) : valorEstoque(p)));
    if (sit === 'baixo') resumo.baixo += 1;
    else if (sit === 'zerado') resumo.zerado += 1;
    else if (sit === 'nao_controla') resumo.nao_controla += 1;
    else resumo.ok += 1;
  }
  return resumo;
}

module.exports = {
  situacaoDe,
  valorEstoque,
  rotuloSituacao,
  resumir
};
