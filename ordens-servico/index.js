function fail(msg, status) {
  const err = new Error(msg);
  err.status = status || 400;
  throw err;
}

const STATUS = ['Aberta', 'Em andamento', 'Pronta para entrega', 'Entregue', 'Cancelada'];
const TIPOS_ITEM = ['peca', 'servico'];
const TIPOS_APARELHO = ['Veiculo', 'Celular', 'Notebook', 'Tablet', 'TV', 'Console', 'Outro'];

function arredMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizarStatus(status) {
  const s = String(status || '').trim();
  if (STATUS.includes(s)) return s;
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t.includes('andamento')) return 'Em andamento';
  if (t.includes('pronta')) return 'Pronta para entrega';
  if (t.includes('entreg')) return 'Entregue';
  if (t.includes('cancel')) return 'Cancelada';
  return 'Aberta';
}

function osFechada(status) {
  const s = normalizarStatus(status);
  return s === 'Entregue' || s === 'Cancelada';
}

function normalizarPlaca(p) {
  return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function normalizarImei(v) {
  return String(v || '').replace(/\D/g, '').slice(0, 15);
}

function normalizarSerial(v) {
  return String(v || '').trim().toUpperCase().slice(0, 40);
}

function inferirTipoAparelho(os) {
  const raw = String(os?.tipo_aparelho || '').trim();
  if (raw && raw !== 'Outro') return normalizarTipoAparelho(raw);
  if (os?.placa) return 'Veiculo';
  const t = `${os?.modelo || ''} ${os?.equipamento || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t.includes('celular') || t.includes('smartphone') || t.includes('iphone')) return 'Celular';
  if (t.includes('notebook') || t.includes('laptop') || t.includes('netbook')) return 'Notebook';
  if (t.includes('tablet') || t.includes('ipad')) return 'Tablet';
  if (/\btv\b/.test(t) || t.includes('televis')) return 'TV';
  if (t.includes('playstation') || t.includes('xbox') || t.includes('nintendo') || t.includes('console')) return 'Console';
  if (raw) return normalizarTipoAparelho(raw);
  return 'Outro';
}

function normalizarTipoAparelho(tipo) {
  const s = String(tipo || '').trim();
  if (TIPOS_APARELHO.includes(s)) return s;
  const t = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t.includes('veic') || t.includes('moto') || t.includes('carro') || t === 'placa') return 'Veiculo';
  if (t.includes('cel') || t.includes('smart') || t.includes('fone')) return 'Celular';
  if (t.includes('note') || t.includes('laptop') || t.includes('pc')) return 'Notebook';
  if (t.includes('tablet') || t.includes('ipad')) return 'Tablet';
  if (t === 'tv' || t.includes('televis')) return 'TV';
  if (t.includes('console') || t.includes('game')) return 'Console';
  return 'Outro';
}

function rotuloAparelho(os) {
  const tipo = inferirTipoAparelho(os);
  const modelo = String(os?.modelo || os?.equipamento || '').trim();
  const marca = String(os?.marca || '').trim();
  const nome = [marca, modelo].filter(Boolean).join(' ') || modelo;
  if (tipo === 'Veiculo') {
    const placa = os?.placa ? String(os.placa) : '';
    if (placa && nome) return `${placa} · ${nome}`;
    return placa || nome || 'Veiculo';
  }
  if (tipo === 'Celular' && os?.imei) return `${nome || 'Celular'} · IMEI ${os.imei}`;
  if (os?.serial && nome) return `${nome} · ${os.serial}`;
  return nome || tipo;
}

function normalizarTipoItem(tipo, produtoTipo) {
  const t = String(tipo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (t === 'servico' || t === 'service') return 'servico';
  if (t === 'peca' || t === 'produto' || t === 'kit' || t === 'pesavel') return 'peca';
  const pt = String(produtoTipo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (pt === 'servico' || pt === 'service') return 'servico';
  return 'peca';
}

function validarItem(body, produto) {
  const quantidade = Number(body.quantidade);
  if (!Number.isFinite(quantidade) || quantidade <= 0) fail('Quantidade invalida');
  const tipo = normalizarTipoItem(body.tipo, produto?.tipo);
  const descricao = String(body.descricao || body.nome || produto?.nome || '').trim();
  if (!descricao) fail('Informe a descricao do item');
  let preco = Number(body.preco_unitario != null ? body.preco_unitario : (body.preco != null ? body.preco : produto?.preco));
  if (!Number.isFinite(preco) || preco < 0) fail('Preco invalido');
  let custo = Number(body.preco_custo != null ? body.preco_custo : produto?.preco_custo);
  if (!Number.isFinite(custo) || custo < 0) custo = 0;
  const rawId = body.produto_id != null ? body.produto_id : produto?.id;
  const produto_id = rawId ? Number(rawId) : null;
  return {
    produto_id: produto_id && Number.isFinite(produto_id) ? produto_id : null,
    tipo,
    descricao,
    quantidade,
    preco_unitario: arredMoney(preco),
    preco_custo: arredMoney(custo),
    subtotal: arredMoney(quantidade * preco)
  };
}

function totais(itens) {
  let valor_custo = 0;
  let valor_venda = 0;
  for (const it of itens || []) {
    const q = Number(it.quantidade) || 0;
    valor_venda += q * (Number(it.preco_unitario) || 0);
    valor_custo += q * (Number(it.preco_custo) || 0);
  }
  valor_custo = arredMoney(valor_custo);
  valor_venda = arredMoney(valor_venda);
  return {
    valor_custo,
    valor_venda,
    valor_lucro: arredMoney(valor_venda - valor_custo),
    valor_previsto: valor_venda
  };
}

function payloadOS(body) {
  const tipo_aparelho = inferirTipoAparelho(body);
  const placa = tipo_aparelho === 'Veiculo' ? normalizarPlaca(body.placa) : '';
  let km = null;
  if (tipo_aparelho === 'Veiculo' && body.km !== undefined && body.km !== null && String(body.km).trim() !== '') {
    km = parseInt(body.km, 10);
    if (!Number.isFinite(km) || km < 0) fail('KM invalido');
  }
  const marca = String(body.marca || '').trim().slice(0, 60);
  const modelo = String(body.modelo || body.equipamento || '').trim();
  const equipamento = [marca, modelo].filter(Boolean).join(' ') || modelo || tipo_aparelho;
  return {
    status: normalizarStatus(body.status),
    cliente_id: body.cliente_id ? Number(body.cliente_id) : null,
    tipo_aparelho,
    equipamento,
    modelo: modelo || null,
    marca: marca || null,
    placa: placa || null,
    km,
    imei: (tipo_aparelho === 'Celular' || tipo_aparelho === 'Tablet') ? (normalizarImei(body.imei) || null) : null,
    serial: normalizarSerial(body.serial) || null,
    senha: String(body.senha || '').trim().slice(0, 80) || null,
    cor: String(body.cor || '').trim().slice(0, 40) || null,
    acessorios: String(body.acessorios || '').trim().slice(0, 200) || null,
    solicitacao: String(body.solicitacao || '').trim() || null,
    valor_previsto: arredMoney(body.valor_previsto),
    data_prevista: body.data_prevista || null,
    data_final: body.data_final || null,
    data_entrega: body.data_entrega || null,
    observacoes: String(body.observacoes || '').trim() || null
  };
}

function mensagemWhatsApp(os) {
  const aparelho = rotuloAparelho(os);
  const extra = aparelho && aparelho !== 'Outro' ? ` (${aparelho})` : '';
  const total = arredMoney(Number(os.valor_venda) > 0 ? os.valor_venda : os.valor_previsto);
  const fmt = total.toFixed(2).replace('.', ',');
  return `Ola! Sua ordem de servico #${os.id}${extra} esta pronta para entrega. Total: R$ ${fmt}.`;
}

function itensParaPdv(os, itens) {
  const lista = Array.isArray(itens) ? itens : [];
  if (!lista.length) {
    return [{
      produto_id: null,
      descricao: `OS ${os.id} · ${rotuloAparelho(os) || os.equipamento || os.modelo || 'Servico'}`,
      quantidade: 1,
      preco_unitario: arredMoney(os.valor_previsto),
      preco_custo: 0,
      tipo: 'servico',
      os_id: os.id
    }];
  }
  return lista.map((it) => ({
    produto_id: it.produto_id || null,
    descricao: `OS ${os.id} · ${it.descricao}`,
    quantidade: Number(it.quantidade) || 1,
    preco_unitario: arredMoney(it.preco_unitario),
    preco_custo: arredMoney(it.preco_custo),
    tipo: it.tipo === 'servico' ? 'servico' : (it.produto_tipo || 'produto'),
    os_id: os.id
  }));
}

function enriquecer(os, itens) {
  const lista = itens || [];
  const t = totais(lista);
  const venda = lista.length ? t.valor_venda : arredMoney(os.valor_previsto);
  const custo = lista.length ? t.valor_custo : arredMoney(os.valor_custo);
  return {
    ...os,
    itens: lista,
    totais: {
      valor_custo: custo,
      valor_venda: venda,
      valor_lucro: arredMoney(venda - custo),
      valor_previsto: venda
    }
  };
}

function itemParaEstorno(item) {
  return {
    produto_id: item.produto_id,
    tipo: item.produto_tipo,
    quantidade: item.quantidade,
    composicao: item.composicao,
    estoque_origem_id: item.estoque_origem_id,
    estoque_consumo: item.estoque_consumo
  };
}

module.exports = {
  STATUS,
  TIPOS_ITEM,
  TIPOS_APARELHO,
  fail,
  arredMoney,
  normalizarStatus,
  osFechada,
  normalizarPlaca,
  normalizarImei,
  normalizarSerial,
  inferirTipoAparelho,
  normalizarTipoAparelho,
  rotuloAparelho,
  normalizarTipoItem,
  validarItem,
  totais,
  payloadOS,
  mensagemWhatsApp,
  itensParaPdv,
  enriquecer,
  itemParaEstorno
};
