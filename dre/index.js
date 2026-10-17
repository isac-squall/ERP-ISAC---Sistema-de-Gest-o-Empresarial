const db = require('../database');
const contador = require('../contador');

function cfgMap() {
  return Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor]));
}

function normalize(v) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function round(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

// Classificacao gerencial de cada lancamento do Financeiro.
// Buckets: cmv | imposto | comercial | administrativa | financeira |
//          estorno_venda | estorno_taxa | ignorar
function classificar({ tipo, categoria, descricao, origem }) {
  const org = normalize(origem);
  const cat = normalize(categoria);
  // Classifica pela categoria; usa a descricao apenas quando nao houver categoria.
  const texto = cat || normalize(descricao);

  if (org === 'suprimento' || cat === 'suprimento') return 'ignorar';
  if (org === 'sangria' || cat === 'sangria') return 'administrativa';
  if (org === 'taxa-operadora' || cat === 'taxa operadora') return 'comercial';
  if (cat.startsWith('estorno venda') || cat.startsWith('estorno da venda')) return 'estorno_venda';
  if (cat.startsWith('estorno taxa') || cat.startsWith('estorno da taxa')) return 'estorno_taxa';

  if (/imposto|\bdas\b|icms|\biss\b|\bipi\b|\bpis\b|cofins|simples|tributo|inss|fgts|irpj|csll|governo/.test(texto)) return 'imposto';
  if (/juros|multa|\biof\b|tarifa banc|financeir|emprestimo|financiamento|\bbanco\b/.test(texto)) return 'financeira';
  if (/\bcmv\b|custo da mercadoria|custo das mercadorias|custo de mercadoria/.test(texto)) return 'cmv';
  if (/estoque|mercadoria|mercadorias|\bcompra|compras|\bpeca|pecas|insumo|materia/.test(texto)) return 'ignorar';
  if (/taxa|marketing|publicidade|anuncio|comissao|frete|entrega|venda|producao|propaganda/.test(texto)) return 'comercial';
  if (/aluguel|energia|\bagua\b|internet|telefone|celular|salario|folha|contador|contabilidade|software|sistema|manutencao|material|limpeza|seguro|iptu|condominio|administrativ|\badmin\b/.test(texto)) return 'administrativa';

  return tipo === 'Despesa' ? 'administrativa' : 'receita';
}

function gerarDre(query) {
  const { from, to, periodo } = contador.parsePeriodo(query);
  const cfg = cfgMap();
  const empresa = cfg.empresa_nome || cfg.nfce_nome_fantasia || cfg.cupom_titulo || 'ERP ISAC';

  // ---- Faturamento (regime de competencia: data da venda) ----
  const vendas = db.prepare(`
    SELECT id, total, desconto FROM vendas
    WHERE status != 'Cancelada' AND date(criado_em) >= date(?) AND date(criado_em) <= date(?)
  `).all(from, to);
  const descontos = vendas.reduce((s, v) => s + Number(v.desconto || 0), 0);
  const receitaVendas = vendas.reduce((s, v) => s + Number(v.total || 0), 0);

  const itens = db.prepare(`
    SELECT vi.subtotal, vi.quantidade, vi.preco_custo,
      CASE WHEN vi.os_id IS NULL THEN 0 ELSE 1 END AS servico
    FROM venda_itens vi
    JOIN vendas v ON v.id = vi.venda_id
    WHERE v.status != 'Cancelada' AND date(v.criado_em) >= date(?) AND date(v.criado_em) <= date(?)
  `).all(from, to);

  let receitaProdutos = 0;
  let receitaServicos = 0;
  let cmvItens = 0;
  for (const it of itens) {
    const sub = Number(it.subtotal || 0);
    if (it.servico) receitaServicos += sub;
    else {
      receitaProdutos += sub;
      cmvItens += Number(it.quantidade || 0) * Number(it.preco_custo || 0);
    }
  }

  // ---- Financeiro por competencia (vencimento > pagamento > cadastro) ----
  const fin = db.prepare(`
    SELECT f.*, c.nome AS cliente_nome, fo.nome AS fornecedor_nome
    FROM financeiro f
    LEFT JOIN clientes c ON c.id = f.cliente_id
    LEFT JOIN fornecedores fo ON fo.id = f.fornecedor_id
    WHERE f.status != 'Cancelado'
      AND date(COALESCE(f.data_vencimento, f.data_pagamento, f.criado_em)) >= date(?)
      AND date(COALESCE(f.data_vencimento, f.data_pagamento, f.criado_em)) <= date(?)
  `).all(from, to);

  const detalhes = [];
  const ignorados = [];
  const receitas = { outras: 0, financeiras: 0 };
  const deducoes = { descontos: round(descontos), impostos: 0, estornos: 0 };
  const despesas = { administrativas: 0, comerciais: 0 };
  const financeirasDesp = { despesas: 0 };

  for (const f of fin) {
    const bucket = classificar(f);
    const valor = Number(f.valor || 0);
    const linha = {
      id: f.id,
      tipo: f.tipo,
      categoria: f.categoria || '',
      descricao: f.descricao || '',
      pessoa: f.tipo === 'Despesa' ? (f.fornecedor_nome || '') : (f.cliente_nome || ''),
      valor: round(valor),
      bucket,
      data: f.data_vencimento || f.data_pagamento || f.criado_em
    };

    if (f.tipo === 'Despesa') {
      if (bucket === 'ignorar') { ignorados.push(linha); continue; }
      detalhes.push(linha);
      if (bucket === 'imposto') deducoes.impostos += valor;
      else if (bucket === 'estorno_venda') deducoes.estornos += valor;
      else if (bucket === 'comercial') despesas.comerciais += valor;
      else if (bucket === 'administrativa') despesas.administrativas += valor;
      else if (bucket === 'financeira') financeirasDesp.despesas += valor;
      else if (bucket === 'cmv') cmvItens += valor;
      continue;
    }

    // Receita
    if (f.venda_id) {
      // Ja contabilizada pela tabela de vendas (regime de competencia da venda)
      if (bucket === 'ignorar') ignorados.push(linha);
      continue;
    }
    if (bucket === 'estorno_taxa') { despesas.comerciais -= valor; detalhes.push(linha); continue; }
    if (bucket === 'ignorar') { ignorados.push(linha); continue; }
    if (bucket === 'financeira') { receitas.financeiras += valor; detalhes.push(linha); continue; }
    receitas.outras += valor;
    detalhes.push(linha);
  }

  const receitaBruta = round(receitaProdutos + receitaServicos + receitas.outras);
  const deducoesTotal = round(deducoes.descontos + deducoes.impostos + deducoes.estornos);
  const receitaLiquida = round(receitaBruta - deducoesTotal);
  const cmv = round(cmvItens);
  const lucroBruto = round(receitaLiquida - cmv);
  const despesasAdministrativas = round(despesas.administrativas);
  const despesasComerciais = round(despesas.comerciais);
  const despesasOperacionais = round(despesasAdministrativas + despesasComerciais);
  const resultadoOperacional = round(lucroBruto - despesasOperacionais);
  const resultadoFinanceiro = round(receitas.financeiras - financeirasDesp.despesas);
  const lucroLiquido = round(resultadoOperacional + resultadoFinanceiro);

  return {
    empresa,
    de: from,
    ate: to,
    periodo,
    regime: 'competencia',
    linhas: [
      { grupo: 'Receita Bruta', label: 'Vendas de produtos', valor: round(receitaProdutos) },
      { grupo: 'Receita Bruta', label: 'Servicos prestados (OS)', valor: round(receitaServicos) },
      { grupo: 'Receita Bruta', label: 'Outras receitas operacionais', valor: round(receitas.outras) },
      { grupo: 'Receita Bruta', label: '(=) Receita Bruta', valor: receitaBruta, total: true },
      { grupo: 'Deducoes', label: '(-) Descontos concedidos', valor: round(deducoes.descontos) },
      { grupo: 'Deducoes', label: '(-) Impostos sobre vendas', valor: round(deducoes.impostos) },
      { grupo: 'Deducoes', label: '(-) Estornos e devolucoes', valor: round(deducoes.estornos) },
      { grupo: 'Deducoes', label: '(=) Receita Liquida', valor: receitaLiquida, total: true },
      { grupo: 'Custos', label: '(-) CMV / Custos das mercadorias vendidas', valor: cmv },
      { grupo: 'Custos', label: '(=) Lucro Bruto', valor: lucroBruto, total: true },
      { grupo: 'Despesas', label: '(-) Despesas administrativas', valor: despesasAdministrativas },
      { grupo: 'Despesas', label: '(-) Despesas comerciais', valor: despesasComerciais },
      { grupo: 'Despesas', label: '(=) Resultado Operacional (LAJIR)', valor: resultadoOperacional, total: true },
      { grupo: 'Financeiro', label: '(+) Receitas financeiras', valor: round(receitas.financeiras) },
      { grupo: 'Financeiro', label: '(-) Despesas financeiras', valor: round(financeirasDesp.despesas) },
      { grupo: 'Financeiro', label: '(=) Resultado Financeiro', valor: resultadoFinanceiro, total: true },
      { grupo: 'Final', label: '(=) Lucro / Prejuizo Liquido', valor: lucroLiquido, total: true }
    ],
    resumo: {
      receita_bruta: receitaBruta,
      receita_produtos: round(receitaProdutos),
      receita_servicos: round(receitaServicos),
      outras_receitas: round(receitas.outras),
      deducoes: deducoesTotal,
      descontos: round(deducoes.descontos),
      impostos: round(deducoes.impostos),
      estornos: round(deducoes.estornos),
      receita_liquida: receitaLiquida,
      cmv,
      lucro_bruto: lucroBruto,
      despesas_administrativas: despesasAdministrativas,
      despesas_comerciais: despesasComerciais,
      despesas_operacionais: despesasOperacionais,
      resultado_operacional: resultadoOperacional,
      receitas_financeiras: round(receitas.financeiras),
      despesas_financeiras: round(financeirasDesp.despesas),
      resultado_financeiro: resultadoFinanceiro,
      lucro_liquido: lucroLiquido,
      margem_liquida: receitaBruta > 0 ? round((lucroLiquido / receitaBruta) * 100) : 0,
      margem_bruta: receitaLiquida > 0 ? round((lucroBruto / receitaLiquida) * 100) : 0,
      vendas_qtd: vendas.length,
      receita_vendas: round(receitaVendas)
    },
    detalhes,
    ignorados
  };
}

function moneyBr(v) {
  return Number(v || 0).toFixed(2).replace('.', ',');
}

function dreTxt(query) {
  const d = gerarDre(query);
  const L = [];
  L.push('DEMONSTRACAO DO RESULTADO DO EXERCICIO (DRE) - ERP ISAC');
  L.push(`Empresa: ${d.empresa}`);
  L.push(`Periodo: ${d.de} a ${d.ate}  (regime de competencia)`);
  L.push(''.padEnd(72, '='));
  for (const l of d.linhas) {
    if (l.total) {
      L.push(''.padEnd(72, '-'));
      L.push(`${l.label.padEnd(52)} ${moneyBr(l.valor).padStart(14)}`);
    } else {
      L.push(`${l.label.padEnd(52)} ${moneyBr(l.valor).padStart(14)}`);
    }
  }
  L.push(''.padEnd(72, '='));
  L.push(`Margem bruta: ${moneyBr(d.resumo.margem_bruta)}%   Margem liquida: ${moneyBr(d.resumo.margem_liquida)}%`);
  L.push('');
  L.push('Detalhamento por categoria:');
  for (const f of d.detalhes) {
    L.push(`  ${f.tipo}  ${f.bucket.padEnd(16)} ${String(f.descricao).slice(0, 26).padEnd(28)} ${moneyBr(f.valor).padStart(12)}`);
  }
  if (d.ignorados.length) {
    L.push('');
    L.push('Fora do DRE (estoque/transitorio):');
    for (const f of d.ignorados) {
      L.push(`  ${f.tipo}  ${bucketLabel(f.bucket).padEnd(16)} ${String(f.descricao).slice(0, 26).padEnd(28)} ${moneyBr(f.valor).padStart(12)}`);
    }
  }
  const nome = `DRE-${String(d.de).replace(/-/g, '')}-${String(d.ate).replace(/-/g, '')}.txt`;
  return { texto: L.join('\r\n'), nome, de: d.de, ate: d.ate, extra: d };
}

function dreCsv(query) {
  const d = gerarDre(query);
  const sep = ';';
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['Secao;Linha;Valor'];
  for (const l of d.linhas) {
    lines.push([esc(l.grupo), esc(l.label), moneyBr(l.valor)].join(sep));
  }
  lines.push('');
  lines.push(['Detalhe', 'Tipo', 'Categoria', 'Classificacao', 'Pessoa', 'Valor', 'Data'].map(esc).join(sep));
  for (const f of d.detalhes) {
    lines.push([esc('Analitico'), esc(f.tipo), esc(f.descricao), esc(bucketLabel(f.bucket)), esc(f.pessoa), moneyBr(f.valor), esc(f.data)].join(sep));
  }
  const nome = `DRE-${String(d.de).replace(/-/g, '')}-${String(d.ate).replace(/-/g, '')}.csv`;
  return { texto: '\ufeff' + lines.join('\r\n'), nome, de: d.de, ate: d.ate, extra: d };
}

const BUCKETS = {
  cmv: 'CMV / Custo',
  imposto: 'Imposto s/ venda',
  comercial: 'Despesa comercial',
  administrativa: 'Despesa administrativa',
  financeira: 'Resultado financeiro',
  estorno_venda: 'Estorno de venda',
  estorno_taxa: 'Estorno de taxa',
  ignorar: 'Fora do DRE'
};

function bucketLabel(b) {
  return BUCKETS[b] || b;
}

module.exports = { gerarDre, dreTxt, dreCsv, classificar, bucketLabel };
