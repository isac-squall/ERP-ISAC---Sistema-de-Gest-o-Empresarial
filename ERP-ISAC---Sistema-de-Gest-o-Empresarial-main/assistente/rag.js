const conhecimento = require('./conhecimento');

const STOP = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na',
  'nos', 'nas', 'para', 'por', 'com', 'que', 'se', 'ao', 'aos', 'ou', 'como', 'qual', 'quais',
  'meu', 'minha', 'me', 'eu', 'voce', 'sua', 'seu', 'tem', 'ter', 'fazer', 'faz', 'esta',
  'este', 'isso', 'isto', 'the', 'to', 'of', 'in', 'on'
]);

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(texto) {
  return normalizar(texto).split(' ').filter(t => t.length > 1 && !STOP.has(t));
}

const INDICE = conhecimento.map(doc => ({
  ...doc,
  bag: tokens([doc.modulo, doc.sessao, doc.titulo, doc.keywords, doc.conteudo, ...(doc.passos || [])].join(' '))
}));

function pontuar(queryTokens, doc, paginaAtual) {
  if (!queryTokens.length) return 0;
  let score = 0;
  const bag = new Set(doc.bag);
  for (const t of queryTokens) {
    if (bag.has(t)) score += 2;
    if (normalizar(doc.modulo).includes(t)) score += 4;
    if (normalizar(doc.sessao).includes(t)) score += 3;
    if (normalizar(doc.titulo).includes(t)) score += 3;
    if (normalizar(doc.keywords).split(' ').includes(t)) score += 5;
  }
  if (paginaAtual && doc.pagina === paginaAtual) score += 3;
  const frase = queryTokens.join(' ');
  const bloco = normalizar(doc.conteudo + ' ' + doc.titulo);
  if (frase.length > 8 && bloco.includes(frase)) score += 8;
  return score;
}

function recuperar(pergunta, paginaAtual, k = 4) {
  const q = tokens(pergunta);
  const ranqueados = INDICE
    .map(doc => ({ doc, score: pontuar(q, doc, paginaAtual) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const top = ranqueados.slice(0, k);
  if (!top.length) {
    const fallback = INDICE.filter(d => d.pagina === paginaAtual).slice(0, 2);
    return fallback.length ? fallback.map(doc => ({ doc, score: 1 })) : INDICE.slice(0, 3).map(doc => ({ doc, score: 0 }));
  }
  return top;
}

function responderLocal(pergunta, hits) {
  const melhor = hits[0]?.doc;
  if (!melhor || (hits[0].score || 0) < 2) {
    return {
      texto: 'Nao encontrei essa duvida com precisao. Tente citar o modulo, por exemplo: caixa, vendas, ordem de servico, financeiro ou usuarios.',
      modulo: null,
      sessao: null
    };
  }
  const passos = (melhor.passos || []).map((p, i) => `${i + 1}. ${p}`).join('\n');
  const extras = hits.slice(1, 3)
    .filter(h => h.doc.id !== melhor.id && h.score >= 6)
    .map(h => `Tambem relacionado: ${h.doc.modulo} / ${h.doc.sessao}.`);
  const texto = [
    `${melhor.modulo} > ${melhor.sessao}`,
    melhor.conteudo,
    passos ? `Passo a passo:\n${passos}` : '',
    extras.join('\n')
  ].filter(Boolean).join('\n\n');
  return { texto, modulo: melhor.modulo, sessao: melhor.sessao };
}

async function responderComLlm(pergunta, hits, paginaAtual) {
  const apiKey = process.env.USER_LLM_API_KEY;
  const baseUrl = (process.env.USER_LLM_BASE_URL || '').replace(/\/$/, '');
  const model = process.env.USER_LLM_MODEL || 'deepseek-chat';
  if (!apiKey || !baseUrl) return null;

  const contexto = hits.map((h, i) =>
    `[${i + 1}] Modulo: ${h.doc.modulo} | Sessao: ${h.doc.sessao}\n${h.doc.conteudo}\nPassos: ${(h.doc.passos || []).join(' | ')}`
  ).join('\n\n');

  const body = {
    model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: 'Voce e o assistente do ERP ISAC. Responda so com base no contexto recuperado. Identifique o modulo e a sessao. Seja direto, em portugues, com passos curtos. Se o contexto nao cobrir a pergunta, diga que nao encontrou e peca o nome do modulo.'
      },
      {
        role: 'user',
        content: `Tela atual do usuario: ${paginaAtual || 'desconhecida'}\nPergunta: ${pergunta}\n\nContexto:\n${contexto}`
      }
    ]
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) return null;
  const data = await res.json();
  const texto = data?.choices?.[0]?.message?.content?.trim();
  if (!texto) return null;
  return {
    texto,
    modulo: hits[0]?.doc?.modulo || null,
    sessao: hits[0]?.doc?.sessao || null
  };
}

async function perguntar(pergunta, paginaAtual) {
  const q = String(pergunta || '').trim();
  if (!q) {
    return { texto: 'Escreva sua duvida sobre o sistema.', modulo: null, sessao: null, fontes: [] };
  }
  const hits = recuperar(q, paginaAtual);
  let resposta = null;
  try {
    resposta = await responderComLlm(q, hits, paginaAtual);
  } catch {}
  if (!resposta) resposta = responderLocal(q, hits);
  return {
    ...resposta,
    fontes: hits.slice(0, 3).map(h => ({
      modulo: h.doc.modulo,
      sessao: h.doc.sessao,
      titulo: h.doc.titulo,
      pagina: h.doc.pagina,
      score: h.score
    }))
  };
}

function listarModulos() {
  const map = new Map();
  for (const doc of conhecimento) {
    if (!map.has(doc.modulo)) map.set(doc.modulo, { modulo: doc.modulo, pagina: doc.pagina, sessoes: [] });
    map.get(doc.modulo).sessoes.push({ id: doc.id, sessao: doc.sessao, titulo: doc.titulo });
  }
  return [...map.values()];
}

module.exports = { perguntar, listarModulos, recuperar };
