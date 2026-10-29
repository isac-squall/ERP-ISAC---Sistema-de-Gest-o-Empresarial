const emv = require('./emv');
const qr = require('./qr');

function gerar(cfg, { valor, txid, descricao } = {}) {
  const chave = String(cfg.pix_chave || '').trim();
  if (!chave) {
    const err = new Error('Cadastre a chave PIX em Configuracoes');
    err.code = 'PIX_SEM_CHAVE';
    throw err;
  }
  const nome = cfg.pix_nome || cfg.empresa_nome || cfg.nfce_nome_fantasia || cfg.cupom_titulo || 'LOJA';
  const cidade = cfg.pix_cidade || cfg.empresa_cidade || cfg.nfce_municipio || 'CIDADE';
  const payload = emv.montarPayload({ chave, nome, cidade, valor, txid, descricao });
  return {
    payload,
    svg: qr.qrSvg(payload),
    chave_mascarada: emv.mascarar(emv.normalizarChave(chave)),
    tipo: emv.detectarTipo(chave),
    valor: valor != null && valor !== '' ? Math.round(Number(valor) * 100) / 100 : null,
    nome: emv.semAcento(nome).slice(0, 25),
    cidade: emv.semAcento(cidade).slice(0, 15)
  };
}

module.exports = {
  gerar,
  montarPayload: emv.montarPayload,
  normalizarChave: emv.normalizarChave,
  detectarTipo: emv.detectarTipo,
  mascarar: emv.mascarar,
  crc16: emv.crc16,
  qrSvg: qr.qrSvg
};
