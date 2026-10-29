process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const db = require('./database');
const nfce = require('./nfce');
const produtosIo = require('./produtos/io');
const produtosTipos = require('./produtos/tipos');
const produtosEstoque = require('./produtos/estoque');
const comprasMod = require('./compras');
const comprasXml = require('./compras/xml');
const rhMod = require('./rh');
const ecomMod = require('./ecommerce');
const gerenciaMod = require('./gerencia');
const crmMod = require('./crm');
const contratosMod = require('./contratos');
const bancosMod = require('./bancos');
const fiscalMod = require('./fiscal');
const producaoMod = require('./producao');
const backupMod = require('./backup');
const contador = require('./contador');
const dre = require('./dre');
const licenca = require('./licenca');
const pixMod = require('./pix');
const { hashSenha, verificarSenha, precisaAtualizar } = require('./senha');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SESSAO_DIAS = 7;
const COOKIE_SESSAO = 'erp_sid';

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use(express.json({
  limit: '25mb',
  verify: (req, res, buf) => { req.rawBody = buf; }
}));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
}));

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function limparSessoesExpiradas() {
  db.prepare('DELETE FROM sessoes WHERE expira_em <= ?').run(new Date().toISOString());
}

function criarSessao(usuarioId) {
  limparSessoesExpiradas();
  const token = crypto.randomBytes(32).toString('base64url');
  const expira = new Date(Date.now() + SESSAO_DIAS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?,?,?)')
    .run(hashToken(token), usuarioId, expira);
  return { token, expira };
}

function lerCookie(req, nome) {
  const bruto = String(req.headers.cookie || '');
  for (const parte of bruto.split(';')) {
    const [chave, ...resto] = parte.trim().split('=');
    if (chave === nome) return decodeURIComponent(resto.join('='));
  }
  return '';
}

function tokenDaRequisicao(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return lerCookie(req, COOKIE_SESSAO);
}

function definirCookieSessao(req, res, token) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = proto === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE_SESSAO}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSAO_DIAS * 86400}${secure}`);
}

function limparCookieSessao(res) {
  res.setHeader('Set-Cookie', `${COOKIE_SESSAO}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function usuarioDaSessao(req) {
  const token = tokenDaRequisicao(req);
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.nome, u.email, u.cargo, s.expira_em
    FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ? AND u.ativo = 1
  `).get(hashToken(token));
  if (!row) return null;
  if (new Date(row.expira_em).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashToken(token));
    return null;
  }
  const { expira_em, ...usuario } = row;
  usuario.permissoes = permissoesDoCargo(usuario.cargo);
  return usuario;
}

function autenticar(email, senha) {
  const row = db.prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1').get(String(email || '').trim());
  if (!row || !verificarSenha(senha, row.senha)) return null;
  if (precisaAtualizar(row.senha)) {
    db.prepare('UPDATE usuarios SET senha = ? WHERE id = ?').run(hashSenha(senha), row.id);
  }
  const { senha: _ignorada, ...usuario } = row;
  usuario.permissoes = permissoesDoCargo(usuario.cargo);
  return usuario;
}

function criarLimitador({ janelaMs, max, mensagem }) {
  const tentativas = new Map();
  return (req, res, next) => {
    const agora = Date.now();
    const chave = req.ip || req.socket.remoteAddress || 'anon';
    let item = tentativas.get(chave);
    if (!item || item.reset <= agora) {
      item = { total: 0, reset: agora + janelaMs };
      tentativas.set(chave, item);
    }
    item.total += 1;
    if (tentativas.size > 2000) {
      for (const [k, v] of tentativas) if (v.reset <= agora) tentativas.delete(k);
    }
    if (item.total > max) {
      res.setHeader('Retry-After', String(Math.ceil((item.reset - agora) / 1000)));
      return res.status(429).json({ error: mensagem });
    }
    next();
  };
}

const limitarLogin = criarLimitador({
  janelaMs: 5 * 60 * 1000,
  max: 20,
  mensagem: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.'
});
const limitarLicenca = criarLimitador({
  janelaMs: 60 * 1000,
  max: 30,
  mensagem: 'Muitas tentativas. Aguarde um minuto e tente novamente.'
});
const limitarAcaoCritica = criarLimitador({
  janelaMs: 5 * 60 * 1000,
  max: 10,
  mensagem: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
});

function rotaPublica(req) {
  const p = req.path;
  const m = req.method;
  if (p === '/api/auth/login' && m === 'POST') return true;
  if (p === '/api/licenca' && m === 'GET') return true;
  if ((p === '/api/licenca/ativar' || p === '/api/licenca/validar') && m === 'POST') return true;
  if (p === '/api/empresa' && m === 'GET') return true;
  if (p.startsWith('/api/loja') && m === 'GET') return true;
  if (p.startsWith('/api/webhooks/') && m === 'POST') return true;
  return false;
}

function permissoesDaRota(req) {
  const p = req.path;
  const m = req.method;
  if (p === '/api/config') return m === 'GET' ? null : ['configuracoes'];
  if (p.startsWith('/api/pix')) return ['vendas', 'caixa', 'configuracoes'];
  if (p === '/api/empresa') return ['configuracoes'];
  if (p.startsWith('/api/config/apagar-banco')) return ['configuracoes'];
  if (p.startsWith('/api/usuarios') || p.startsWith('/api/perfis')) return ['usuarios'];
  if (p.startsWith('/api/caixa/status')) return null;
  if (p.startsWith('/api/caixa')) return ['caixa'];
  if (p.startsWith('/api/vendas') || p.startsWith('/api/orcamentos')) return ['vendas', 'historico-vendas'];
  if (p.startsWith('/api/financeiro/cliente/')) return ['financeiro', 'vendas', 'caixa'];
  if (p.startsWith('/api/financeiro')) return ['financeiro'];
  if (p.startsWith('/api/crm')) return ['crm', 'clientes', 'vendas'];
  if (p.startsWith('/api/contratos')) return ['contratos', 'ordens-servico'];
  if (p.startsWith('/api/bancos') || p.startsWith('/api/fluxo') || p.startsWith('/api/conciliacao')) return ['financeiro'];
  if (p.startsWith('/api/nfe')) return ['nfe', 'contador-nfe'];
  if (p.startsWith('/api/nfse')) return ['nfse', 'ordens-servico'];
  if (p.startsWith('/api/producao') || p.startsWith('/api/curva-abc')) return ['producao', 'estoque'];
  if (p.startsWith('/api/dre')) return ['financeiro'];
  if (p.startsWith('/api/relatorio')) return ['relatorio'];
  if (p.startsWith('/api/produtos/export') || p.startsWith('/api/produtos/modelo') || p.startsWith('/api/produtos/import')) {
    return ['produtos'];
  }
  if (p.startsWith('/api/estoque')) return ['estoque', 'produtos', 'vendas'];
  if (p.startsWith('/api/compras')) return ['compras'];
  if (p.startsWith('/api/ecommerce')) return ['ecommerce'];
  if (p.startsWith('/api/rh')) return ['rh-funcionarios', 'rh-pontos', 'rh-grades'];
  if (p.startsWith('/api/gerencia')) {
    return [
      'gerencia-aprovacao-vendas', 'gerencia-compras', 'gerencia-fechamento-caixas',
      'gerencia-inventario', 'gerencia-consulta-estoque'
    ];
  }
  if (p.startsWith('/api/produtos') || p.startsWith('/api/promocoes') || p.startsWith('/api/categorias')) {
    return m === 'GET' ? ['produtos', 'vendas'] : ['produtos'];
  }
  if (p.startsWith('/api/clientes')) return ['clientes', 'vendas', 'caixa'];
  if (p.startsWith('/api/fornecedores')) return ['fornecedores', 'produtos'];
  if (p.startsWith('/api/ordens-servico')) return ['ordens-servico'];
  if (p.startsWith('/api/impressoras')) return m === 'GET' ? null : ['impressoras'];
  if (p.startsWith('/api/backups')) return ['backup'];
  if (p.startsWith('/api/contador/nfe/xml.zip')) return ['contador-xml', 'contador-nfe'];
  if (p.startsWith('/api/contador/nfe')) return ['contador-nfe'];
  if (p.startsWith('/api/contador/compras')) return ['contador-compras'];
  if (p.startsWith('/api/contador/extrato')) return ['contador-extrato'];
  if (p.startsWith('/api/contador/sped')) return ['contador-sped'];
  if (p.startsWith('/api/contador')) return null;
  if (p.startsWith('/api/licenca')) return ['configuracoes'];
  return null;
}

function exigirAdmin(req, res, next) {
  if (req.usuario?.cargo !== 'Administrador') {
    return res.status(403).json({ error: 'Somente o administrador pode executar esta acao' });
  }
  next();
}

app.get('/api/licenca', (req, res) => {
  try { res.json(licenca.publico()); }
  catch (err) { res.status(500).json({ error: err.message || 'Falha ao ler licenca' }); }
});

app.post('/api/licenca/ativar', (req, res) => {
  try {
    const st = licenca.ativar(req.body?.chave);
    res.json({ message: 'Licenca ativada', ...st });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao ativar licenca' });
  }
});

app.post('/api/licenca/validar', (req, res) => {
  try {
    res.json(licenca.validar(req.body?.chave));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao validar chave' });
  }
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  if (licenca.rotaLivre(req)) return next();
  const st = licenca.publico();
  if (st.bloqueada) {
    return res.status(402).json({
      error: st.motivo || 'Sistema bloqueado. Ative a licenca da mensalidade.',
      licenca: st
    });
  }
  next();
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  if (rotaPublica(req)) return next();
  const usuario = usuarioDaSessao(req);
  if (!usuario) {
    return res.status(401).json({ error: 'Sessao expirada. Faca login novamente.' });
  }
  req.usuario = usuario;
  next();
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  if (rotaPublica(req)) return next();
  const exigidas = permissoesDaRota(req);
  if (!exigidas) return next();
  if (req.usuario?.cargo === 'Administrador') return next();
  const possui = new Set(req.usuario?.permissoes || []);
  if (exigidas.some(p => possui.has(p))) return next();
  return res.status(403).json({ error: 'Voce nao tem permissao para executar esta acao.' });
});

app.post('/api/licenca/gerar', exigirAdmin, limitarLicenca, (req, res) => {
  try {
    const r = licenca.gerar(req.body || {});
    res.json({ message: 'Chave gerada', ...r });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao gerar chave' });
  }
});

function paginate(query, params, page = 1, limit = 15, search = '') {
  const limite = Math.min(Math.max(Number(limit) || 15, 1), 200);
  const pagina = Math.max(Number(page) || 1, 1);
  const offset = (pagina - 1) * limite;
  const total = db.prepare(`SELECT COUNT(*) as total FROM (${query})`).get(...params)?.total || 0;
  const rows = db.prepare(`${query} LIMIT ? OFFSET ?`).all(...params, limite, offset);
  return { data: rows, total, page: pagina, limit: limite, totalPages: Math.ceil(total / limite) || 1 };
}

function safeParseJson(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ============ AUTH ============
function permissoesDoCargo(cargo) {
  const perfil = db.prepare('SELECT permissoes FROM perfis WHERE nome = ?').get(cargo || '');
  if (perfil?.permissoes) {
    try {
      const parsed = JSON.parse(perfil.permissoes);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {}
  }
  if (cargo === 'Administrador') {
    return [
      'dashboard', 'vendas', 'caixa', 'financeiro', 'clientes', 'produtos', 'categorias', 'estoque',
      'compras', 'ecommerce',
      'ordens-servico', 'usuarios', 'fornecedores', 'historico-vendas',
      'relatorio', 'contador-nfe', 'contador-compras', 'contador-xml',
      'contador-extrato', 'contador-sped',
      'rh-funcionarios', 'rh-pontos', 'rh-grades',
      'gerencia-aprovacao-vendas', 'gerencia-compras', 'gerencia-fechamento-caixas',
      'gerencia-inventario', 'gerencia-consulta-estoque',
      'crm', 'contratos', 'nfe', 'nfse', 'producao',
      'backup', 'impressoras', 'configuracoes', 'manual'
    ];
  }
  return ['dashboard', 'manual'];
}

app.post('/api/auth/login', limitarLogin, (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) return res.status(400).json({ error: 'Informe email e senha' });
  const user = autenticar(email, senha);
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
  const sessao = criarSessao(user.id);
  definirCookieSessao(req, res, sessao.token);
  res.json({ ...user, token: sessao.token, expira_em: sessao.expira });
});

app.get('/api/auth/me', (req, res) => {
  res.json(req.usuario);
});

app.post('/api/auth/logout', (req, res) => {
  const token = tokenDaRequisicao(req);
  if (token) db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashToken(token));
  limparCookieSessao(res);
  res.json({ message: 'Sessão encerrada' });
});

// ============ DASHBOARD ============
app.get('/api/dashboard', (req, res) => {
  const vendasHoje = db.prepare("SELECT COALESCE(SUM(total),0) as total FROM vendas WHERE date(criado_em) = date('now','localtime')").get();
  const vendasMes = db.prepare("SELECT COALESCE(SUM(total),0) as total FROM vendas WHERE strftime('%Y-%m', criado_em) = strftime('%Y-%m', 'now','localtime')").get();
  const totalClientes = db.prepare('SELECT COUNT(*) as total FROM clientes WHERE ativo = 1').get();
  const totalProdutos = db.prepare('SELECT COUNT(*) as total FROM produtos WHERE ativo = 1').get();
  const estoqueBaixo = db.prepare(`
    SELECT COUNT(*) as total FROM produtos p
    LEFT JOIN produtos o ON o.id = p.estoque_origem_id
    WHERE p.ativo = 1
      AND IFNULL(p.tipo,'produto') NOT IN ('servico','kit')
      AND IFNULL(p.controla_estoque,1) = 1
      AND (
      CASE WHEN p.estoque_origem_id IS NOT NULL AND IFNULL(p.estoque_consumo,0) > 0
        THEN CAST((IFNULL(o.estoque,0) / p.estoque_consumo) AS INTEGER)
        ELSE p.estoque END
    ) <= IFNULL(p.estoque_minimo,0)
  `).get();
  const ordensAbertas = db.prepare("SELECT COUNT(*) as total FROM ordens_servico WHERE status IN ('Aberta','Em andamento')").get();
  const ordensProntas = db.prepare("SELECT COUNT(*) as total FROM ordens_servico WHERE status = 'Pronta para entrega'").get();
  const valorPrevisto = db.prepare("SELECT COALESCE(SUM(valor_previsto),0) as total FROM ordens_servico WHERE status NOT IN ('Entregue','Cancelada')").get();
  const contasReceber = db.prepare("SELECT COALESCE(SUM(valor),0) as total FROM financeiro WHERE tipo = 'Receita' AND status = 'Pendente'").get();
  const contasPagar = db.prepare("SELECT COALESCE(SUM(valor),0) as total FROM financeiro WHERE tipo = 'Despesa' AND status = 'Pendente'").get();
  const vendasRecentes = db.prepare(`
    SELECT v.*, c.nome as cliente_nome FROM vendas v
    LEFT JOIN clientes c ON v.cliente_id = c.id
    ORDER BY v.criado_em DESC LIMIT 5
  `).all();
  const caixaStatus = db.prepare('SELECT * FROM caixa_status WHERE id = 1').get();
  res.json({
    vendasHoje: vendasHoje.total,
    vendasMes: vendasMes.total,
    totalClientes: totalClientes.total,
    totalProdutos: totalProdutos.total,
    estoqueBaixo: estoqueBaixo.total,
    ordensAbertas: ordensAbertas.total,
    ordensProntas: ordensProntas.total,
    valorPrevisto: valorPrevisto.total,
    contasReceber: contasReceber.total,
    contasPagar: contasPagar.total,
    vendasRecentes,
    caixaAberto: caixaStatus?.aberto === 1
  });
});

app.get('/api/dashboard/charts', (req, res) => {
  const periodo = req.query.periodo || 'semana';
  let receita = [];
  if (periodo === 'ano') {
    receita = db.prepare(`
      SELECT strftime('%Y-%m', criado_em) as label,
             COALESCE(SUM(total),0) as receita,
             COALESCE(SUM(total - desconto),0) as lucro
      FROM vendas WHERE criado_em >= datetime('now','localtime','-11 months','start of month')
      GROUP BY label ORDER BY label
    `).all();
  } else if (periodo === 'mes') {
    receita = db.prepare(`
      SELECT strftime('%d/%m', criado_em) as label,
             COALESCE(SUM(total),0) as receita,
             COALESCE(SUM(total - desconto),0) as lucro
      FROM vendas WHERE strftime('%Y-%m', criado_em) = strftime('%Y-%m','now','localtime')
      GROUP BY date(criado_em) ORDER BY date(criado_em)
    `).all();
  } else {
    receita = db.prepare(`
      SELECT CASE CAST(strftime('%w', criado_em) AS INTEGER)
        WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Segunda' WHEN 2 THEN 'Terça'
        WHEN 3 THEN 'Quarta' WHEN 4 THEN 'Quinta' WHEN 5 THEN 'Sexta' ELSE 'Sábado' END as label,
        CAST(strftime('%w', criado_em) AS INTEGER) as dow,
        COALESCE(SUM(total),0) as receita,
        COALESCE(SUM(total - desconto),0) as lucro
      FROM vendas WHERE date(criado_em) >= date('now','localtime','weekday 0','-6 days')
      GROUP BY dow ORDER BY CASE WHEN dow = 0 THEN 7 ELSE dow END
    `).all();
  }

  const contasClientes = {
    venceHoje: db.prepare(`SELECT COUNT(*) as qtd, COALESCE(SUM(valor),0) as total FROM financeiro
      WHERE tipo='Receita' AND status='Pendente' AND date(data_vencimento)=date('now','localtime')`).get(),
    atrasado: db.prepare(`SELECT COUNT(*) as qtd, COALESCE(SUM(valor),0) as total FROM financeiro
      WHERE tipo='Receita' AND status='Pendente' AND date(data_vencimento) < date('now','localtime')`).get(),
    pendente: db.prepare(`SELECT COUNT(*) as qtd, COALESCE(SUM(valor),0) as total FROM financeiro
      WHERE tipo='Receita' AND status='Pendente' AND (data_vencimento IS NULL OR date(data_vencimento) > date('now','localtime'))`).get()
  };
  res.json({ receita, contasClientes });
});

app.get('/api/notificacoes', (req, res) => {
  const estoque = db.prepare(`
    SELECT p.id, p.nome,
      CASE WHEN p.estoque_origem_id IS NOT NULL AND IFNULL(p.estoque_consumo,0) > 0
        THEN CAST((IFNULL(o.estoque,0) / p.estoque_consumo) AS INTEGER)
        ELSE p.estoque END as estoque,
      p.estoque_minimo
    FROM produtos p
    LEFT JOIN produtos o ON o.id = p.estoque_origem_id
    WHERE p.ativo=1
      AND IFNULL(p.tipo,'produto') NOT IN ('servico','kit')
      AND IFNULL(p.controla_estoque,1) = 1
      AND (
      CASE WHEN p.estoque_origem_id IS NOT NULL AND IFNULL(p.estoque_consumo,0) > 0
        THEN CAST((IFNULL(o.estoque,0) / p.estoque_consumo) AS INTEGER)
        ELSE p.estoque END
    ) <= IFNULL(p.estoque_minimo,0)
    LIMIT 10
  `).all();
  const osProntas = db.prepare("SELECT id, equipamento FROM ordens_servico WHERE status='Pronta para entrega' LIMIT 10").all();
  const atrasadas = db.prepare(`SELECT id, descricao, valor FROM financeiro WHERE status='Pendente' AND date(data_vencimento) < date('now','localtime') LIMIT 10`).all();
  const itens = [
    ...estoque.map(p => ({ tipo: 'estoque', texto: `${p.nome} com estoque baixo (${p.estoque})` })),
    ...osProntas.map(o => ({ tipo: 'os', texto: `OS #${o.id} pronta para entrega` })),
    ...atrasadas.map(f => ({ tipo: 'financeiro', texto: `Conta atrasada: ${f.descricao || '#' + f.id}` }))
  ];
  res.json({ count: itens.length, itens });
});

app.get('/api/config', (req, res) => {
  res.json(nfce.sanitizar(nfce.loadConfig()));
});

const CONFIG_PERMITIDAS = new Set([
  ...Object.keys(db.CONFIG_DEFAULTS || {}),
  'nfce_certificado_nome',
  'nfce_certificado_validade'
]);
const CONFIG_PROTEGIDAS = new Set(['nfce_numero_atual', 'app_versao_instalada']);

app.put('/api/config', (req, res) => {
  const body = req.body || {};
  const limpo = {};
  for (const [chave, valor] of Object.entries(body)) {
    if (!CONFIG_PERMITIDAS.has(chave) || CONFIG_PROTEGIDAS.has(chave)) continue;
    if (nfce.SECRET_KEYS.includes(chave) && (valor === '1' || valor === '' || valor == null)) continue;
    limpo[chave] = String(valor ?? '');
  }

  let infoCert = null;
  if (limpo.nfce_certificado_pfx && limpo.nfce_certificado_pfx !== '1' && limpo.nfce_certificado_senha) {
    try {
      infoCert = nfce.infoPfx(limpo.nfce_certificado_pfx, limpo.nfce_certificado_senha);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Certificado A1 invalido' });
    }
  }

  const stmt = db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor');
  const txn = db.transaction(() => {
    for (const [chave, valor] of Object.entries(limpo)) stmt.run(chave, valor);
    if (infoCert) {
      stmt.run('nfce_certificado_nome', infoCert.nome || '');
      stmt.run('nfce_certificado_validade', infoCert.validade || '');
    }
  });
  txn();
  res.json({ message: 'Configuração salva', ...nfce.sanitizar(nfce.loadConfig()) });
});

app.get('/api/pix/qr', (req, res) => {
  try {
    const cfg = nfce.loadConfig();
    const valorRaw = req.query.valor;
    const valor = valorRaw != null && String(valorRaw).trim() !== '' ? Number(valorRaw) : undefined;
    const cob = pixMod.gerar(cfg, {
      valor,
      txid: String(req.query.txid || '***').slice(0, 25),
      descricao: req.query.descricao
    });
    res.json(cob);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Nao foi possivel gerar o QR PIX' });
  }
});

function isLicencaKey(chave) {
  return /licen|serial/i.test(String(chave || ''));
}

function isPreservedConfigKey(chave) {
  const k = String(chave || '');
  return isLicencaKey(chave) || k.startsWith('empresa_') || k.startsWith('ecommerce_') || k.startsWith('pix_');
}

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function whatsappNumero(cfg) {
  const n = onlyDigits(cfg.empresa_whatsapp || cfg.empresa_telefone || cfg.nfce_telefone || '');
  if (!n) return '';
  if (n.startsWith('55') && n.length >= 12) return n;
  if (n.length >= 10 && n.length <= 11) return '55' + n;
  return n;
}

function empresaPublica(cfg) {
  const whatsapp = whatsappNumero(cfg);
  return {
    nome: cfg.empresa_nome || 'ERP ISAC',
    telefone: cfg.empresa_telefone || '',
    whatsapp,
    email: cfg.empresa_email || '',
    instagram: cfg.empresa_instagram || '',
    cidade: cfg.empresa_cidade || '',
    estado: cfg.empresa_estado || '',
    endereco: cfg.empresa_endereco || '',
    cnpj: cfg.empresa_cnpj || '',
    logo: cfg.empresa_logo || ''
  };
}

app.get('/api/empresa', (req, res) => {
  res.json(empresaPublica(nfce.loadConfig()));
});

app.put('/api/empresa', (req, res) => {
  const body = req.body || {};
  const logo = body.logo || body.empresa_logo || '';
  if (logo && Buffer.byteLength(String(logo), 'utf8') > 4 * 1024 * 1024) {
    return res.status(400).json({ error: 'Logo deve ter no maximo 2MB' });
  }
  const dados = {
    empresa_nome: String(body.nome || body.empresa_nome || '').trim() || 'ERP ISAC',
    empresa_telefone: String(body.telefone || body.empresa_telefone || '').trim(),
    empresa_whatsapp: String(body.whatsapp || body.empresa_whatsapp || '').trim(),
    empresa_email: String(body.email || body.empresa_email || '').trim(),
    empresa_instagram: String(body.instagram || body.empresa_instagram || '').trim(),
    empresa_cidade: String(body.cidade || body.empresa_cidade || '').trim(),
    empresa_estado: String(body.estado || body.empresa_estado || '').trim(),
    empresa_endereco: String(body.endereco || body.empresa_endereco || '').trim(),
    empresa_cnpj: String(body.cnpj || body.empresa_cnpj || '').trim()
  };
  if (logo !== undefined && logo !== null) dados.empresa_logo = String(logo);
  const stmt = db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor');
  const tx = db.transaction(() => {
    for (const [chave, valor] of Object.entries(dados)) stmt.run(chave, valor);
    stmt.run('cupom_titulo', dados.empresa_nome);
    const cab = [dados.empresa_endereco, [dados.empresa_cidade, dados.empresa_estado].filter(Boolean).join(' / '), dados.empresa_telefone].filter(Boolean).join('\n');
    if (cab) stmt.run('cupom_cabecalho', cab);
    const atual = nfce.loadConfig();
    if (!String(atual.nfce_cnpj || '').trim() && dados.empresa_cnpj) stmt.run('nfce_cnpj', dados.empresa_cnpj);
    if (!String(atual.nfce_nome_fantasia || '').trim()) stmt.run('nfce_nome_fantasia', dados.empresa_nome);
    if (!String(atual.nfce_telefone || '').trim() && dados.empresa_telefone) stmt.run('nfce_telefone', dados.empresa_telefone);
    if (!String(atual.nfce_municipio || '').trim() && dados.empresa_cidade) stmt.run('nfce_municipio', dados.empresa_cidade);
    if (!String(atual.nfce_logradouro || '').trim() && dados.empresa_endereco) stmt.run('nfce_logradouro', dados.empresa_endereco);
  });
  tx();
  res.json({ message: 'Empresa salva', ...empresaPublica(nfce.loadConfig()) });
});

function precoLoja(p) {
  const base = Number(p.preco) || 0;
  const promo = db.prepare(`
    SELECT tipo, valor FROM promocoes
    WHERE produto_id = ? AND ativo = 1
      AND (data_inicio IS NULL OR date(data_inicio) <= date('now','localtime'))
      AND (data_fim IS NULL OR date(data_fim) >= date('now','localtime'))
    ORDER BY id DESC LIMIT 1
  `).get(p.id);
  if (!promo) return { preco: base, preco_original: null, promocao: false };
  let final = base;
  if (promo.tipo === 'valor') final = Math.max(0, base - Number(promo.valor || 0));
  else final = Math.max(0, base * (1 - Number(promo.valor || 0) / 100));
  return { preco: Math.round(final * 100) / 100, preco_original: base, promocao: true };
}

function produtoLojaPublico(p) {
  const precos = precoLoja(p);
  return {
    id: p.id,
    nome: p.nome,
    codigo: p.codigo || '',
    descricao: p.descricao || '',
    categoria: p.categoria || '',
    foto: p.foto || '',
    unidade: p.unidade || 'UN',
    tipo: produtosTipos.normalizarTipo(p.tipo),
    preco: precos.preco,
    preco_original: precos.preco_original,
    promocao: precos.promocao,
    em_estoque: produtosTipos.normalizarTipo(p.tipo) === 'servico' ? true : Number(p.estoque) > 0 || Number(p.estoque_disponivel) > 0
  };
}

app.get('/api/loja', (req, res) => {
  const { search = '', categoria = '' } = req.query;
  const empresa = empresaPublica(nfce.loadConfig());
  let query = `SELECT p.id, p.nome, p.codigo, p.descricao, p.preco, p.foto, p.categoria, p.unidade, p.tipo, p.estoque
    FROM produtos p WHERE p.ativo = 1 AND IFNULL(p.tipo,'produto') != 'kit'`;
  const params = [];
  if (search) {
    query += ' AND (p.nome LIKE ? OR p.codigo LIKE ? OR IFNULL(p.descricao,\'\') LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (categoria) {
    query += ' AND lower(IFNULL(p.categoria,\'\')) = lower(?)';
    params.push(String(categoria).trim());
  }
  query += ' ORDER BY p.nome ASC LIMIT 200';
  const produtos = db.prepare(query).all(...params).map(produtoLojaPublico);
  const categorias = db.prepare(`
    SELECT c.nome FROM produto_categorias c WHERE c.ativo = 1
      AND EXISTS (SELECT 1 FROM produtos p WHERE p.ativo = 1 AND lower(IFNULL(p.categoria,'')) = lower(c.nome))
    ORDER BY c.nome
  `).all().map(r => r.nome);
  res.json({ empresa, produtos, categorias });
});

app.get('/api/loja/produto/:id', (req, res) => {
  const p = db.prepare('SELECT id, nome, codigo, descricao, preco, foto, categoria, unidade, tipo, estoque FROM produtos WHERE id = ? AND ativo = 1').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Produto nao encontrado' });
  res.json({ empresa: empresaPublica(nfce.loadConfig()), produto: produtoLojaPublico(p) });
});

app.post('/api/config/apagar-banco', limitarAcaoCritica, (req, res) => {
  const { confirmar, senha } = req.body || {};
  if (String(confirmar || '').trim().toUpperCase() !== 'APAGAR') {
    return res.status(400).json({ error: 'Digite APAGAR para confirmar' });
  }
  const admin = db.prepare('SELECT * FROM usuarios WHERE id = ? AND ativo = 1').get(req.usuario.id);
  if (!admin) return res.status(400).json({ error: 'Administrador nao encontrado' });
  if (admin.cargo !== 'Administrador') {
    return res.status(403).json({ error: 'Somente o administrador pode apagar o banco' });
  }
  if (!senha) return res.status(400).json({ error: 'Informe a senha do administrador' });
  if (!verificarSenha(senha, admin.senha)) return res.status(401).json({ error: 'Senha invalida' });

  const licencas = db.prepare('SELECT chave, valor FROM config').all().filter(r => isPreservedConfigKey(r.chave));
  const defaults = {
    cupom_titulo: 'Scrundai Software',
    cupom_cabecalho: 'Rua jose correia de andrade SERRINHA /RN\n(84) 99871-3472',
    cupom_rodape: 'Obrigado pela preferência\nSempre volte!',
    perguntar_quantidade: '1',
    taxa_credito: '0',
    taxa_debito: '0',
    taxa_pix: '0',
    pix_chave: '',
    pix_nome: '',
    pix_cidade: '',
    nfce_habilitada: '0',
    nfce_ambiente: 'homologacao',
    nfce_uf: 'RN',
    nfce_cnpj: '',
    nfce_ie: '',
    nfce_razao_social: '',
    nfce_nome_fantasia: 'Scrundai Software',
    nfce_logradouro: 'Rua jose correia de andrade',
    nfce_numero: 'S/N',
    nfce_bairro: 'Centro',
    nfce_municipio: 'Serrinha',
    nfce_codigo_municipio: '2410306',
    nfce_cep: '59374000',
    nfce_telefone: '84998713472',
    nfce_crt: '1',
    nfce_serie: '1',
    nfce_numero_atual: '0',
    nfce_csc_id: '',
    nfce_csc_token: '',
    nfce_certificado_pfx: '',
    nfce_certificado_senha: '',
    nfce_certificado_nome: '',
    nfce_certificado_validade: '',
      nfce_emitir_automatico: '1',
      nfce_simulacao: '1',
      empresa_nome: 'Sistema de gestão empresarial ERP ISAC',
      empresa_telefone: '',
      empresa_email: '',
      empresa_instagram: '',
      empresa_cidade: '',
      empresa_estado: '',
      empresa_endereco: '',
      empresa_cnpj: '',
      empresa_logo: ''
    };

  try {
    db.pragma('foreign_keys = OFF');
    const tx = db.transaction(() => {
      const tabelas = [
        'sessoes', 'venda_itens', 'nfce', 'vendas', 'orcamentos', 'estoque_movimentos',
        'promocoes', 'produto_composicao', 'produto_categorias', 'produtos', 'ordens_servico', 'financeiro', 'caixa',
        'caixa_fechamentos', 'clientes', 'fornecedores', 'usuarios', 'impressoras'
      ];
      for (const t of tabelas) db.exec(`DELETE FROM ${t}`);
      db.exec("UPDATE caixa_status SET aberto = 0, valor_inicial = 0, aberto_em = NULL, fechado_em = NULL, usuario_id = NULL WHERE id = 1");
      const configs = db.prepare('SELECT chave FROM config').all();
      const delCfg = db.prepare('DELETE FROM config WHERE chave = ?');
      for (const row of configs) {
        if (!isPreservedConfigKey(row.chave)) delCfg.run(row.chave);
      }
      try {
        db.exec("DELETE FROM sqlite_sequence WHERE name IN ('sessoes','venda_itens','nfce','vendas','orcamentos','estoque_movimentos','promocoes','produto_composicao','produto_categorias','produtos','ordens_servico','financeiro','caixa','caixa_fechamentos','clientes','fornecedores','usuarios','impressoras')");
      } catch {}
      db.prepare(`INSERT INTO usuarios (nome, email, senha, cargo, celular, data_nascimento, cpf, tipo_pessoa, ativo)
        VALUES (?,?,?,?,?,?,?,?,1)`).run(
        admin.nome || 'Administrador',
        admin.email || 'admin@erpisac.com',
        admin.senha || 'admin123',
        'Administrador',
        admin.celular || null,
        admin.data_nascimento || null,
        admin.cpf || null,
        admin.tipo_pessoa || 'PF'
      );
      const insCfg = db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor');
      for (const [chave, valor] of Object.entries(defaults)) insCfg.run(chave, valor);
      for (const row of licencas) insCfg.run(row.chave, row.valor);
    });
    tx();
    res.json({
      message: 'Banco de dados apagado',
      licenca_preservada: licencas.length > 0,
      admin: { email: admin.email }
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Falha ao apagar o banco' });
  } finally {
    db.pragma('foreign_keys = ON');
  }
});

app.get('/api/nfce/status', (req, res) => {
  const cfg = nfce.loadConfig();
  const check = nfce.pronta(cfg);
  res.json({
    habilitada: cfg.nfce_habilitada === '1',
    ambiente: cfg.nfce_ambiente || 'homologacao',
    simulacao: cfg.nfce_simulacao === '1',
    pronta: check.ok,
    erros: check.erros,
    certificado_nome: cfg.nfce_certificado_nome || '',
    certificado_validade: cfg.nfce_certificado_validade || ''
  });
});

app.post('/api/vendas/:id/nfce', async (req, res) => {
  try {
    const nota = await nfce.emitir(Number(req.params.id), { forcar: !!req.body?.forcar });
    res.json({ message: nota.status === 'autorizada' ? 'NFC-e autorizada' : 'NFC-e nao autorizada', nfce: nfce.resumoPublico(nota) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Falha ao emitir NFC-e' });
  }
});

app.get('/api/vendas/:id/nfce', (req, res) => {
  const nota = nfce.nfceDaVenda(Number(req.params.id));
  if (!nota) return res.status(404).json({ error: 'Venda sem NFC-e' });
  res.json(nfce.resumoPublico(nota));
});

app.get('/api/vendas/:id/nfce.xml', (req, res) => {
  const nota = nfce.nfceDaVenda(Number(req.params.id));
  if (!nota?.xml) return res.status(404).json({ error: 'XML nao encontrado' });
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="NFCe-${nota.chave || req.params.id}.xml"`);
  res.send(nota.xml);
});

app.post('/api/vendas/:id/nfce/cancelar', async (req, res) => {
  try {
    const nota = await nfce.cancelarNfce(Number(req.params.id), req.body?.justificativa);
    res.json({ message: 'NFC-e cancelada', nfce: nfce.resumoPublico(nota) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Falha ao cancelar NFC-e' });
  }
});

// ============ CLIENTES ============
app.get('/api/clientes', (req, res) => {
  const { search = '', page = 1, limit = 15 } = req.query;
  let query = 'SELECT * FROM clientes WHERE ativo = 1';
  const params = [];
  if (search) {
    query += ' AND (nome LIKE ? OR cpf_cnpj LIKE ? OR telefone LIKE ? OR email LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  query += ' ORDER BY nome ASC';
  const countQ = query.replace('SELECT *', 'SELECT COUNT(*) as total');
  const total = db.prepare(countQ).get(...params)?.total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare(`${query} LIMIT ? OFFSET ?`).all(...params, +limit, offset);
  res.json({ data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) || 1 });
});

app.get('/api/clientes/all', (req, res) => {
  res.json(db.prepare('SELECT id, nome, cpf_cnpj, telefone, estado, cidade FROM clientes WHERE ativo = 1 ORDER BY nome').all());
});

app.get('/api/clientes/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Cliente não encontrado' });
  res.json(row);
});

app.post('/api/clientes', (req, res) => {
  const { nome, cpf_cnpj, telefone, email, endereco, cidade, estado } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
  const result = db.prepare('INSERT INTO clientes (nome, cpf_cnpj, telefone, email, endereco, cidade, estado) VALUES (?,?,?,?,?,?,?)').run(nome, cpf_cnpj, telefone, email, endereco, cidade, estado);
  res.json({ id: result.lastInsertRowid, message: 'Cliente criado' });
});

app.put('/api/clientes/:id', (req, res) => {
  const { nome, cpf_cnpj, telefone, email, endereco, cidade, estado } = req.body;
  db.prepare('UPDATE clientes SET nome=?, cpf_cnpj=?, telefone=?, email=?, endereco=?, cidade=?, estado=? WHERE id=?').run(nome, cpf_cnpj, telefone, email, endereco, cidade, estado, req.params.id);
  res.json({ message: 'Cliente atualizado' });
});

app.delete('/api/clientes/:id', (req, res) => {
  db.prepare('UPDATE clientes SET ativo = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Cliente removido' });
});

// ============ FORNECEDORES ============
app.get('/api/fornecedores', (req, res) => {
  const { search = '', page = 1, limit = 15 } = req.query;
  let query = 'SELECT * FROM fornecedores WHERE ativo = 1';
  const params = [];
  if (search) {
    query += ' AND (nome LIKE ? OR cnpj LIKE ? OR telefone LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY nome ASC';
  const countQ = query.replace('SELECT *', 'SELECT COUNT(*) as total');
  const total = db.prepare(countQ).get(...params)?.total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare(`${query} LIMIT ? OFFSET ?`).all(...params, +limit, offset);
  res.json({ data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) || 1 });
});

app.get('/api/fornecedores/all', (req, res) => {
  res.json(db.prepare('SELECT id, nome FROM fornecedores WHERE ativo = 1 ORDER BY nome').all());
});

app.get('/api/fornecedores/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Fornecedor não encontrado' });
  res.json(row);
});

app.post('/api/fornecedores', (req, res) => {
  const { nome, cnpj, telefone, email, endereco } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
  const result = db.prepare('INSERT INTO fornecedores (nome, cnpj, telefone, email, endereco) VALUES (?,?,?,?,?)').run(nome, cnpj, telefone, email, endereco);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/fornecedores/:id', (req, res) => {
  const { nome, cnpj, telefone, email, endereco } = req.body;
  db.prepare('UPDATE fornecedores SET nome=?, cnpj=?, telefone=?, email=?, endereco=? WHERE id=?').run(nome, cnpj, telefone, email, endereco, req.params.id);
  res.json({ message: 'Fornecedor atualizado' });
});

app.delete('/api/fornecedores/:id', (req, res) => {
  db.prepare('UPDATE fornecedores SET ativo = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Fornecedor removido' });
});

function compraComItens(id) {
  const row = db.prepare(`
    SELECT c.*, f.nome as fornecedor_nome, u.nome as usuario_nome
    FROM compras c
    LEFT JOIN fornecedores f ON f.id = c.fornecedor_id
    LEFT JOIN usuarios u ON u.id = c.usuario_id
    WHERE c.id = ?
  `).get(id);
  if (!row) return null;
  row.itens = db.prepare(`
    SELECT i.*, p.nome as produto_nome, p.codigo as produto_codigo, p.unidade, p.tipo
    FROM compra_itens i
    LEFT JOIN produtos p ON p.id = i.produto_id
    WHERE i.compra_id = ?
    ORDER BY i.id
  `).all(id);
  return row;
}

function salvarItensCompra(compraId, itens) {
  db.prepare('DELETE FROM compra_itens WHERE compra_id = ?').run(compraId);
  const ins = db.prepare(`INSERT INTO compra_itens (compra_id, produto_id, descricao, quantidade, preco_unitario, subtotal)
    VALUES (?,?,?,?,?,?)`);
  for (const it of itens) {
    ins.run(compraId, it.produto_id, it.descricao || '', it.quantidade, it.preco_unitario, it.subtotal);
  }
}

function payloadCompra(body, opts = {}) {
  const fornecedorId = inteiroOuNulo(body.fornecedor_id);
  if (!fornecedorId) {
    const err = new Error('Fornecedor e obrigatorio');
    err.status = 400;
    throw err;
  }
  const forn = db.prepare('SELECT id FROM fornecedores WHERE id = ? AND ativo = 1').get(fornecedorId);
  if (!forn) {
    const err = new Error('Fornecedor nao encontrado');
    err.status = 400;
    throw err;
  }
  const itens = comprasMod.validarItens(body.itens || []);
  for (const it of itens) {
    if (!it.produto_id) continue;
    const p = db.prepare('SELECT id, nome, ativo FROM produtos WHERE id = ?').get(it.produto_id);
    if (!p || !p.ativo) {
      const err = new Error(`Produto nao encontrado: ${it.descricao || it.produto_id}`);
      err.status = 400;
      throw err;
    }
    if (!it.descricao) it.descricao = p.nome;
  }
  const dataPedido = dataValida(body.data_pedido) || hojeIso();
  return {
    fornecedor_id: fornecedorId,
    status: opts.status || comprasMod.normalizarStatus(body.status || 'Aguardando'),
    data_pedido: dataPedido,
    valor: comprasMod.totalizar(itens),
    forma_pagamento: comprasMod.normalizarForma(body.forma_pagamento),
    observacao: String(body.observacao || '').slice(0, 500),
    itens
  };
}

function receberCompra(compra, usuarioId) {
  const itens = db.prepare('SELECT * FROM compra_itens WHERE compra_id = ?').all(compra.id);
  if (!itens.length) {
    const err = new Error('Pedido sem itens');
    err.status = 400;
    throw err;
  }
  for (const it of itens) {
    if (!it.produto_id) continue;
    const p = db.prepare('SELECT * FROM produtos WHERE id = ?').get(it.produto_id);
    if (!p) continue;
    const tipo = produtosTipos.normalizarTipo(p.tipo);
    if (tipo === 'servico' || tipo === 'kit' || p.estoque_origem_id || !produtosTipos.controlaEstoque(p, tipo)) continue;
    const qtd = Number(it.quantidade) || 0;
    if (qtd <= 0) continue;
    const anterior = Number(p.estoque) || 0;
    const novo = produtosTipos.arred(anterior + qtd);
    db.prepare('UPDATE produtos SET estoque = ?, preco_custo = ? WHERE id = ?').run(novo, it.preco_unitario, p.id);
    registrarMovimentoEstoque({
      produtoId: p.id,
      tipo: 'entrada',
      quantidade: qtd,
      anterior,
      novo,
      observacao: `Compra #${compra.id}`,
      usuarioId
    });
  }
  const fin = inserirFinanceiro({
    tipo: 'Despesa',
    categoria: 'Estoque',
    descricao: `Compra #${compra.id}`,
    valor: Number(compra.valor) || 0,
    data_vencimento: hojeIso(),
    status: 'Pendente',
    fornecedor_id: compra.fornecedor_id,
    origem: 'compra'
  });
  db.prepare(`UPDATE compras SET status='Recebido', data_recebimento=datetime('now','localtime'), financeiro_id=? WHERE id=?`)
    .run(fin.lastInsertRowid, compra.id);
  return fin.lastInsertRowid;
}

app.get('/api/compras', (req, res) => {
  const { search = '', page = 1, limit = 15, status = '' } = req.query;
  const st = String(status || '').trim();
  let where = 'WHERE 1=1';
  const params = [];
  if (st && st !== 'Todos') {
    where += ' AND c.status = ?';
    params.push(comprasMod.normalizarStatus(st));
  }
  if (search) {
    where += ` AND (CAST(c.id AS TEXT) LIKE ? OR IFNULL(f.nome,'') LIKE ? OR IFNULL(c.forma_pagamento,'') LIKE ? OR IFNULL(c.observacao,'') LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  const from = `FROM compras c LEFT JOIN fornecedores f ON f.id = c.fornecedor_id ${where}`;
  const total = db.prepare(`SELECT COUNT(*) as total ${from}`).get(...params)?.total || 0;
  const todos = db.prepare('SELECT status, valor FROM compras').all();
  const resumo = comprasMod.resumir(todos);
  const limite = Math.min(Math.max(Number(limit) || 15, 1), 200);
  const pagina = Math.max(Number(page) || 1, 1);
  const offset = (pagina - 1) * limite;
  const data = db.prepare(`
    SELECT c.*, f.nome as fornecedor_nome
    ${from}
    ORDER BY c.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limite, offset);
  res.json({
    data,
    total,
    page: pagina,
    limit: limite,
    totalPages: Math.ceil(total / limite) || 1,
    resumo
  });
});

app.get('/api/compras/:id(\\d+)', (req, res) => {
  const row = compraComItens(req.params.id);
  if (!row) return res.status(404).json({ error: 'Pedido de compra nao encontrado' });
  res.json(row);
});

app.post('/api/compras', (req, res) => {
  try {
    const d = payloadCompra(req.body || {});
    const txn = db.transaction(() => {
      const result = db.prepare(`INSERT INTO compras
        (fornecedor_id, status, data_pedido, valor, forma_pagamento, observacao, usuario_id)
        VALUES (?,?,?,?,?,?,?)`).run(
        d.fornecedor_id, 'Aguardando', d.data_pedido, d.valor, d.forma_pagamento, d.observacao,
        req.usuario?.id || null
      );
      salvarItensCompra(result.lastInsertRowid, d.itens);
      return result.lastInsertRowid;
    });
    res.json({ id: txn() });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao criar pedido' });
  }
});

app.put('/api/compras/:id(\\d+)', (req, res) => {
  try {
    const atual = db.prepare('SELECT * FROM compras WHERE id = ?').get(req.params.id);
    if (!atual) return res.status(404).json({ error: 'Pedido de compra nao encontrado' });
    if (!comprasMod.podeEditar(atual.status)) {
      return res.status(400).json({ error: 'So e possivel editar pedidos aguardando aprovacao' });
    }
    const d = payloadCompra(req.body || {});
    const txn = db.transaction(() => {
      db.prepare(`UPDATE compras SET fornecedor_id=?, data_pedido=?, valor=?, forma_pagamento=?, observacao=? WHERE id=?`)
        .run(d.fornecedor_id, d.data_pedido, d.valor, d.forma_pagamento, d.observacao, atual.id);
      salvarItensCompra(atual.id, d.itens);
    });
    txn();
    res.json({ message: 'Pedido atualizado' });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao atualizar pedido' });
  }
});

app.delete('/api/compras/:id(\\d+)', (req, res) => {
  const atual = db.prepare('SELECT * FROM compras WHERE id = ?').get(req.params.id);
  if (!atual) return res.status(404).json({ error: 'Pedido de compra nao encontrado' });
  if (!comprasMod.podeExcluir(atual.status)) {
    return res.status(400).json({ error: 'So e possivel excluir pedidos aguardando ou recusados' });
  }
  db.prepare('DELETE FROM compra_itens WHERE compra_id = ?').run(atual.id);
  db.prepare('DELETE FROM compras WHERE id = ?').run(atual.id);
  res.json({ message: 'Pedido excluido' });
});

app.post('/api/compras/:id(\\d+)/aprovar', (req, res) => {
  try {
    const atual = db.prepare('SELECT * FROM compras WHERE id = ?').get(req.params.id);
    if (!atual) return res.status(404).json({ error: 'Pedido de compra nao encontrado' });
    comprasMod.transicao(atual.status, 'Aprovado');
    db.prepare(`UPDATE compras SET status='Aprovado', data_aprovacao=datetime('now','localtime') WHERE id=?`).run(atual.id);
    res.json({ message: 'Pedido aprovado', status: 'Aprovado' });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao aprovar' });
  }
});

app.post('/api/compras/:id(\\d+)/recusar', (req, res) => {
  try {
    const atual = db.prepare('SELECT * FROM compras WHERE id = ?').get(req.params.id);
    if (!atual) return res.status(404).json({ error: 'Pedido de compra nao encontrado' });
    comprasMod.transicao(atual.status, 'Recusado');
    db.prepare(`UPDATE compras SET status='Recusado' WHERE id=?`).run(atual.id);
    res.json({ message: 'Pedido recusado', status: 'Recusado' });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao recusar' });
  }
});

app.post('/api/compras/:id(\\d+)/receber', (req, res) => {
  try {
    const atual = db.prepare('SELECT * FROM compras WHERE id = ?').get(req.params.id);
    if (!atual) return res.status(404).json({ error: 'Pedido de compra nao encontrado' });
    comprasMod.transicao(atual.status, 'Recebido');
    const txn = db.transaction(() => receberCompra(atual, req.usuario?.id));
    const financeiroId = txn();
    res.json({ message: 'Pedido recebido', status: 'Recebido', financeiro_id: financeiroId });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao receber' });
  }
});

function upsertFornecedorPorCnpj(nota) {
  const cnpj = comprasXml.onlyDigits(nota.emit_cnpj);
  let row = null;
  if (cnpj) {
    row = db.prepare("SELECT * FROM fornecedores WHERE replace(replace(replace(replace(IFNULL(cnpj,''),'.',''),'/',''),'-',''),' ','') = ? ORDER BY ativo DESC, id LIMIT 1").get(cnpj);
  }
  if (!row && nota.emit_nome) {
    row = db.prepare('SELECT * FROM fornecedores WHERE lower(nome) = lower(?) ORDER BY ativo DESC, id LIMIT 1').get(nota.emit_nome);
  }
  if (row) {
    if (!row.ativo) db.prepare('UPDATE fornecedores SET ativo = 1 WHERE id = ?').run(row.id);
    if (cnpj && !row.cnpj) db.prepare('UPDATE fornecedores SET cnpj=? WHERE id=?').run(cnpj, row.id);
    return row.id;
  }
  const r = db.prepare('INSERT INTO fornecedores (nome, cnpj, endereco, ativo) VALUES (?,?,?,1)')
    .run(nota.emit_nome || 'Fornecedor NF-e', cnpj || null, nota.emit_endereco || null);
  return r.lastInsertRowid;
}

function mapasDePara(fornecedorId) {
  const depara = {};
  if (fornecedorId) {
    const rows = db.prepare('SELECT codigo_fornecedor, produto_id, fator FROM produto_fornecedor_depara WHERE fornecedor_id = ?').all(fornecedorId);
    for (const r of rows) depara[String(r.codigo_fornecedor)] = r;
  }
  const produtos = db.prepare("SELECT id, nome, codigo, ncm FROM produtos WHERE ativo = 1 AND IFNULL(tipo,'produto') NOT IN ('servico','kit')").all();
  const porEan = {};
  const porCodigo = {};
  const porNome = {};
  for (const p of produtos) {
    const ean = comprasXml.eanValido(p.codigo);
    if (ean && !porEan[ean]) porEan[ean] = p;
    if (p.codigo && !porCodigo[p.codigo]) porCodigo[p.codigo] = p;
    const nome = String(p.nome || '').trim().toLowerCase();
    if (nome && !porNome[nome]) porNome[nome] = p;
  }
  return { depara, porEan, porCodigo, porNome };
}

function persistirEntradaXml(nota, { origem, usuarioId }) {
  const existente = db.prepare('SELECT id, status FROM nfe_entrada WHERE chave = ?').get(nota.chave);
  if (existente) {
    const err = new Error(`NF-e ja importada (entrada #${existente.id}, ${existente.status})`);
    err.status = 409;
    err.entrada_id = existente.id;
    throw err;
  }
  const fornecedorId = upsertFornecedorPorCnpj(nota);
  const preview = comprasXml.montarItensPreview(nota, mapasDePara(fornecedorId));
  const ins = db.prepare(`INSERT INTO nfe_entrada
    (chave, numero, serie, modelo, natureza, data_emissao, emit_cnpj, emit_nome, emit_ie, emit_uf, dest_cnpj, valor, xml, status, origem, fornecedor_id, usuario_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const result = ins.run(
    nota.chave, nota.numero, nota.serie, nota.modelo, nota.natureza, nota.data_emissao,
    nota.emit_cnpj, nota.emit_nome, nota.emit_ie, nota.emit_uf, nota.dest_cnpj, nota.valor,
    nota.xml, 'Pendente', origem || 'arquivo', fornecedorId, usuarioId || null
  );
  const entradaId = result.lastInsertRowid;
  const insItem = db.prepare(`INSERT INTO nfe_entrada_itens
    (entrada_id, n_item, codigo_fornecedor, ean, descricao, ncm, cfop, cfop_entrada, unidade, quantidade, preco_unitario, subtotal, icms, ipi, pis, cofins,
     produto_id, fator, quantidade_estoque, preco_custo, margem, preco_venda, criar_produto, origem_match)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const it of preview) {
    insItem.run(
      entradaId, it.n_item, it.codigo_fornecedor, it.ean, it.descricao, it.ncm, it.cfop, it.cfop_entrada, it.unidade,
      it.quantidade, it.preco_unitario, it.subtotal, it.icms, it.ipi, it.pis, it.cofins,
      it.produto_id, it.fator, it.quantidade_estoque, it.preco_custo, it.margem, it.preco_venda, it.criar_produto, it.origem_match
    );
  }
  return entradaId;
}

function entradaComItens(id) {
  const row = db.prepare(`
    SELECT e.*, f.nome as fornecedor_nome
    FROM nfe_entrada e
    LEFT JOIN fornecedores f ON f.id = e.fornecedor_id
    WHERE e.id = ?
  `).get(id);
  if (!row) return null;
  row.itens = db.prepare(`
    SELECT i.*, p.nome as produto_nome, p.codigo as produto_codigo, p.unidade as produto_unidade, p.preco as produto_preco
    FROM nfe_entrada_itens i
    LEFT JOIN produtos p ON p.id = i.produto_id
    WHERE i.entrada_id = ?
    ORDER BY i.n_item, i.id
  `).all(id);
  return row;
}

function aplicarItensEntrada(entradaId, itensBody) {
  if (!Array.isArray(itensBody)) return;
  const upd = db.prepare(`UPDATE nfe_entrada_itens
    SET produto_id=?, fator=?, quantidade_estoque=?, preco_custo=?, margem=?, preco_venda=?, criar_produto=?
    WHERE id=? AND entrada_id=?`);
  for (const it of itensBody) {
    const id = Number(it.id);
    if (!id) continue;
    const atual = db.prepare('SELECT * FROM nfe_entrada_itens WHERE id=? AND entrada_id=?').get(id, entradaId);
    if (!atual) continue;
    const fator = Number(it.fator);
    const conv = comprasXml.aplicarFator(atual, Number.isFinite(fator) && fator > 0 ? fator : atual.fator);
    const margem = Number(it.margem);
    const m = Number.isFinite(margem) ? margem : (Number(atual.margem) || 0);
    let produtoId = inteiroOuNulo(it.produto_id);
    let criar = it.criar_produto == null ? atual.criar_produto : (it.criar_produto ? 1 : 0);
    if (produtoId) criar = 0;
    const vendaInformada = it.preco_venda != null && it.preco_venda !== '';
    const precoVenda = vendaInformada
      ? comprasXml.arredMoney(it.preco_venda)
      : comprasXml.precoComMargem(conv.preco_custo, m);
    upd.run(produtoId, conv.fator, conv.quantidade_estoque, conv.preco_custo, m, precoVenda, criar ? 1 : 0, id, entradaId);
  }
}

function criarProdutoDaEntrada(it, fornecedorId) {
  const codigo = comprasXml.eanValido(it.ean) || String(it.codigo_fornecedor || '').slice(0, 40) || null;
  const ncm = String(it.ncm || '00000000').replace(/\D/g, '').padStart(8, '0').slice(0, 8);
  const unidade = String(it.unidade || 'UN').slice(0, 6);
  const categoriaNome = garantirCategoria('NF-e');
  const r = db.prepare(`INSERT INTO produtos
    (nome, codigo, descricao, preco, preco_custo, estoque, estoque_minimo, categoria, fornecedor_id, ncm, cfop, unidade, origem, tipo, controla_estoque, fracionado, ativo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(
    it.descricao || 'Produto NF-e', codigo, it.descricao || '',
    Number(it.preco_venda) || Number(it.preco_custo) || 0,
    Number(it.preco_custo) || 0,
    0, 0, categoriaNome, fornecedorId || null, ncm, it.cfop_entrada || '1102', unidade, '0',
    'produto', 1, 0
  );
  return r.lastInsertRowid;
}

function salvarDePara(fornecedorId, it, produtoId) {
  if (!fornecedorId || !produtoId || !it.codigo_fornecedor) return;
  const existente = db.prepare('SELECT id FROM produto_fornecedor_depara WHERE fornecedor_id=? AND codigo_fornecedor=?')
    .get(fornecedorId, it.codigo_fornecedor);
  if (existente) {
    db.prepare(`UPDATE produto_fornecedor_depara SET produto_id=?, fator=?, ean=?, unidade_fornecedor=?, atualizado_em=datetime('now','localtime') WHERE id=?`)
      .run(produtoId, it.fator || 1, it.ean || null, it.unidade || null, existente.id);
    return;
  }
  db.prepare(`INSERT INTO produto_fornecedor_depara (fornecedor_id, codigo_fornecedor, ean, produto_id, fator, unidade_fornecedor)
    VALUES (?,?,?,?,?,?)`).run(fornecedorId, it.codigo_fornecedor, it.ean || null, produtoId, it.fator || 1, it.unidade || null);
}

function confirmarEntradaXml(entrada, usuarioId) {
  const itens = db.prepare('SELECT * FROM nfe_entrada_itens WHERE entrada_id=? ORDER BY n_item, id').all(entrada.id);
  if (!itens.length) {
    const err = new Error('Entrada sem itens');
    err.status = 400;
    throw err;
  }
  for (const it of itens) {
    if (!it.produto_id && !it.criar_produto) {
      const err = new Error(`Associe o produto: ${it.descricao}`);
      err.status = 400;
      throw err;
    }
  }
  const compraItens = [];
  for (const it of itens) {
    let produtoId = it.produto_id;
    if (!produtoId && it.criar_produto) {
      produtoId = criarProdutoDaEntrada(it, entrada.fornecedor_id);
      db.prepare('UPDATE nfe_entrada_itens SET produto_id=?, criar_produto=0 WHERE id=?').run(produtoId, it.id);
    }
    salvarDePara(entrada.fornecedor_id, it, produtoId);
    if (Number(it.preco_venda) > 0) {
      db.prepare('UPDATE produtos SET preco=? WHERE id=?').run(comprasXml.arredMoney(it.preco_venda), produtoId);
    }
    const qtd = Number(it.quantidade_estoque) || Number(it.quantidade) || 0;
    const custo = Number(it.preco_custo) || Number(it.preco_unitario) || 0;
    compraItens.push({
      produto_id: produtoId,
      descricao: it.descricao,
      quantidade: qtd,
      preco_unitario: custo,
      subtotal: comprasXml.arredMoney(qtd * custo),
      fator: Number(it.fator) || 1,
      ncm: it.ncm,
      cfop: it.cfop_entrada || it.cfop,
      unidade_xml: it.unidade
    });
  }
  const valor = comprasMod.totalizar(compraItens);
  const dataPedido = dataValida(entrada.data_emissao) || hojeIso();
  const compra = db.prepare(`INSERT INTO compras
    (fornecedor_id, status, data_pedido, valor, forma_pagamento, observacao, usuario_id, nfe_entrada_id, chave_nfe)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    entrada.fornecedor_id, 'Aprovado', dataPedido, valor, 'Boleto',
    `NF-e ${entrada.numero || ''} chave ${entrada.chave}`, usuarioId || null, entrada.id, entrada.chave
  );
  const compraId = compra.lastInsertRowid;
  const insItem = db.prepare(`INSERT INTO compra_itens
    (compra_id, produto_id, descricao, quantidade, preco_unitario, subtotal, fator, ncm, cfop, unidade_xml)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  for (const it of compraItens) {
    insItem.run(compraId, it.produto_id, it.descricao, it.quantidade, it.preco_unitario, it.subtotal, it.fator, it.ncm, it.cfop, it.unidade_xml);
  }
  const compraRow = db.prepare('SELECT * FROM compras WHERE id=?').get(compraId);
  const financeiroId = receberCompra(compraRow, usuarioId);
  db.prepare(`UPDATE nfe_entrada SET status='Entrada', compra_id=? WHERE id=?`).run(compraId, entrada.id);
  return { compra_id: compraId, financeiro_id: financeiroId };
}

app.get('/api/compras/xml', (req, res) => {
  const { search = '', page = 1, limit = 15, status = '' } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (status) {
    where += ' AND e.status = ?';
    params.push(comprasXml.normalizarStatus(status));
  }
  if (search) {
    const s = `%${search}%`;
    where += ` AND (e.chave LIKE ? OR IFNULL(e.emit_nome,'') LIKE ? OR CAST(e.numero AS TEXT) LIKE ?)`;
    params.push(s, s, s);
  }
  const from = `FROM nfe_entrada e LEFT JOIN fornecedores f ON f.id = e.fornecedor_id ${where}`;
  const total = db.prepare(`SELECT COUNT(*) as total ${from}`).get(...params)?.total || 0;
  const limite = Math.min(Math.max(Number(limit) || 15, 1), 200);
  const pagina = Math.max(Number(page) || 1, 1);
  const offset = (pagina - 1) * limite;
  const data = db.prepare(`
    SELECT e.id, e.chave, e.numero, e.serie, e.data_emissao, e.emit_nome, e.emit_cnpj, e.valor, e.status, e.origem, e.compra_id, f.nome as fornecedor_nome
    ${from}
    ORDER BY e.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limite, offset);
  res.json({ data, total, page: pagina, limit: limite, totalPages: Math.ceil(total / limite) || 1 });
});

app.get('/api/compras/xml/:id', (req, res) => {
  const row = entradaComItens(req.params.id);
  if (!row) return res.status(404).json({ error: 'XML de entrada nao encontrado' });
  res.json(row);
});

app.post('/api/compras/xml/import', (req, res) => {
  try {
    const { xml, conteudo, encoding } = req.body || {};
    let raw = xml || conteudo || '';
    if (encoding === 'base64' && raw) {
      raw = Buffer.from(String(raw), 'base64').toString('utf8');
    }
    const nota = comprasXml.parseXml(raw);
    const txn = db.transaction(() => persistirEntradaXml(nota, { origem: 'arquivo', usuarioId: req.usuario?.id }));
    const id = txn();
    res.json(entradaComItens(id));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao importar XML', entrada_id: err.entrada_id });
  }
});

app.post('/api/compras/xml/sefaz', (req, res) => {
  try {
    const cfg = Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor]));
    const cnpj = comprasXml.onlyDigits(cfg.empresa_cnpj || cfg.nfce_cnpj || '');
    if (cnpj.length !== 14) {
      return res.status(400).json({ error: 'Informe o CNPJ da empresa em Configuracoes para buscar notas na SEFAZ (simulacao local)' });
    }
    const seq = (db.prepare('SELECT COUNT(*) as c FROM nfe_entrada').get()?.c || 0) + 1;
    const chave = comprasXml.chaveDemo(seq);
    const xml = comprasXml.xmlDemoSefaz({
      cnpjDest: cnpj,
      razaoDest: cfg.empresa_nome || 'ERP ISAC',
      chaveBase: chave
    });
    const nota = comprasXml.parseXml(xml);
    const txn = db.transaction(() => persistirEntradaXml(nota, { origem: 'sefaz', usuarioId: req.usuario?.id }));
    const id = txn();
    res.json({ ...entradaComItens(id), sefaz: 'simulada', aviso: 'Consulta SEFAZ simulada localmente. Sem transmissao a SEFAZ nesta entrega.' });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha na consulta SEFAZ', entrada_id: err.entrada_id });
  }
});

app.put('/api/compras/xml/:id', (req, res) => {
  try {
    const atual = db.prepare('SELECT * FROM nfe_entrada WHERE id=?').get(req.params.id);
    if (!atual) return res.status(404).json({ error: 'XML de entrada nao encontrado' });
    if (atual.status === 'Entrada' || atual.status === 'Cancelada') {
      return res.status(400).json({ error: 'Entrada ja finalizada' });
    }
    const txn = db.transaction(() => {
      aplicarItensEntrada(atual.id, req.body?.itens || []);
      db.prepare(`UPDATE nfe_entrada SET status='Conferida' WHERE id=?`).run(atual.id);
    });
    txn();
    res.json(entradaComItens(atual.id));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao associar itens' });
  }
});

app.post('/api/compras/xml/:id/confirmar', (req, res) => {
  try {
    const atual = db.prepare('SELECT * FROM nfe_entrada WHERE id=?').get(req.params.id);
    if (!atual) return res.status(404).json({ error: 'XML de entrada nao encontrado' });
    if (atual.status === 'Entrada') return res.status(400).json({ error: 'Esta NF-e ja deu entrada' });
    if (atual.status === 'Cancelada') return res.status(400).json({ error: 'Entrada cancelada' });
    if (Array.isArray(req.body?.itens)) aplicarItensEntrada(atual.id, req.body.itens);
    const txn = db.transaction(() => confirmarEntradaXml(atual, req.usuario?.id));
    const r = txn();
    res.json({ message: 'Entrada confirmada. Estoque e custo atualizados.', ...r, status: 'Entrada' });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao confirmar entrada' });
  }
});

function ecomCfg() {
  return Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor]));
}

function ecomSecret(plataforma) {
  const cfg = ecomCfg();
  const p = ecomMod.normalizarPlataforma(plataforma);
  if (p === 'woocommerce') return cfg.ecommerce_woo_secret || '';
  if (p === 'shopify') return cfg.ecommerce_shopify_secret || '';
  if (p === 'nuvemshop') return cfg.ecommerce_nuvemshop_token || '';
  if (p === 'vtex') return cfg.ecommerce_vtex_token || '';
  if (p === 'mercadolivre') return cfg.ecommerce_ml_token || '';
  return cfg.ecommerce_api_secret || '';
}

function ecomUsuarioSistema() {
  const row = db.prepare("SELECT id FROM usuarios WHERE cargo = 'Administrador' AND ativo = 1 ORDER BY id LIMIT 1").get();
  return row?.id || 1;
}

function autenticarWebhook(req, plataforma) {
  const p = ecomMod.normalizarPlataforma(plataforma);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) headers[String(k).toLowerCase()] = v;
  const bearer = String(headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (bearer.startsWith('erp_live_')) {
    const hash = hashToken(bearer);
    const tok = db.prepare('SELECT * FROM ecommerce_tokens WHERE token_hash = ? AND ativo = 1').get(hash);
    if (tok) return { via: 'token', token: tok };
  }
  if (p === 'generico') {
    const esperado = ecomSecret('generico');
    if (esperado && ecomMod.timingSafeEqual(esperado, bearer)) return { via: 'secret' };
    if (tokValidoGenerico(bearer)) return { via: 'token' };
    const err = new Error('Token de API invalido');
    err.status = 401;
    throw err;
  }
  if (p === 'mercadolivre') {
    const secret = ecomSecret(p);
    if (!secret) {
      const err = new Error('Token Mercado Livre nao configurado');
      err.status = 401;
      throw err;
    }
    try {
      ecomMod.verificarAssinatura({
        plataforma: p,
        secret,
        rawBody: req.rawBody || Buffer.from(JSON.stringify(req.body || {})),
        headers
      });
      return { via: 'hmac' };
    } catch (err) {
      if (err.status === 401 && /nao configurado/i.test(err.message)) throw err;
      return { via: 'ml-token', token: secret };
    }
  }
  ecomMod.verificarAssinatura({
    plataforma: p,
    secret: ecomSecret(p),
    rawBody: req.rawBody || Buffer.from(JSON.stringify(req.body || {})),
    headers
  });
  return { via: 'hmac' };
}

function tokValidoGenerico(bearer) {
  if (!bearer) return false;
  const hash = hashToken(bearer);
  return !!db.prepare('SELECT id FROM ecommerce_tokens WHERE token_hash = ? AND ativo = 1').get(hash);
}

function registrarWebhookLog({ plataforma, evento, ok, payload, erro }) {
  db.prepare(`INSERT INTO ecommerce_webhooks_log (plataforma, evento, ok, payload, erro) VALUES (?,?,?,?,?)`)
    .run(plataforma || 'generico', evento || '', ok ? 1 : 0, payload ? String(payload).slice(0, 8000) : null, erro || null);
}

function processarPedidoEcommerce(plataforma, body) {
  const pedido = ecomMod.validarPedido(ecomMod.parsePedido(plataforma, body));
  const existente = db.prepare('SELECT * FROM ecommerce_pedidos WHERE plataforma = ? AND external_id = ?')
    .get(plataforma, pedido.external_id);
  if (pedido.status === 'pendente') {
    return { ignored: true, status: 'pendente', external_id: pedido.external_id };
  }
  if (pedido.status === 'cancelado') {
    if (existente?.venda_id) {
      const venda = db.prepare('SELECT * FROM vendas WHERE id = ?').get(existente.venda_id);
      if (venda && venda.status !== 'Cancelada') {
        const itens = db.prepare('SELECT * FROM venda_itens WHERE venda_id = ?').all(venda.id);
        const txn = db.transaction(() => {
          devolverEstoqueVenda(itens, ecomUsuarioSistema(), `Cancelamento loja ${plataforma} #${pedido.external_id}`);
          db.prepare("UPDATE vendas SET status='Cancelada' WHERE id=?").run(venda.id);
          estornarFinanceiroVenda(venda.id, `Estorno loja ${plataforma} #${pedido.external_id}`);
          db.prepare('UPDATE ecommerce_pedidos SET status=? WHERE id=?').run('cancelado', existente.id);
        });
        txn();
      } else {
        db.prepare('UPDATE ecommerce_pedidos SET status=? WHERE id=?').run('cancelado', existente.id);
      }
      return { cancelled: true, venda_id: existente.venda_id, pedido_id: existente.id };
    }
    return { ignored: true, status: 'cancelado', external_id: pedido.external_id };
  }
  if (existente?.venda_id) {
    return { duplicate: true, venda_id: existente.venda_id, pedido_id: existente.id };
  }
  const cfg = ecomCfg();
  const payload = JSON.stringify(body || {}).slice(0, 8000);
  if (String(cfg.ecommerce_auto_baixa || '1') === '0') {
    const clienteId = ecomMod.upsertCliente(db, pedido.cliente);
    if (existente) return { queued: true, pedido_id: existente.id };
    const ins = db.prepare(`INSERT INTO ecommerce_pedidos (plataforma, external_id, cliente_id, status, total, payload_json)
      VALUES (?,?,?,?,?,?)`).run(plataforma, pedido.external_id, clienteId, 'pago', 0, payload);
    return { queued: true, pedido_id: ins.lastInsertRowid };
  }
  try {
    return db.transaction(() => {
      const clienteId = ecomMod.upsertCliente(db, pedido.cliente);
      const itens = ecomMod.resolverItens(db, pedido.itens);
      let pedidoId = existente?.id;
      if (!pedidoId) {
        pedidoId = db.prepare(`INSERT INTO ecommerce_pedidos (plataforma, external_id, cliente_id, status, payload_json)
          VALUES (?,?,?,?,?)`).run(plataforma, pedido.external_id, clienteId, 'pago', payload).lastInsertRowid;
      }
      const venda = criarVendaInterna({
        cliente_id: clienteId,
        itens,
        desconto: pedido.desconto || 0,
        forma_pagamento: pedido.forma_pagamento,
        usuario_id: ecomUsuarioSistema(),
        exigirCaixa: false,
        origem: 'ecommerce',
        ecommerce_pedido_id: pedidoId
      });
      db.prepare('UPDATE ecommerce_pedidos SET venda_id=?, cliente_id=?, status=?, total=? WHERE id=?')
        .run(venda.id, clienteId, 'pago', venda.total, pedidoId);
      db.prepare('UPDATE vendas SET ecommerce_pedido_id=? WHERE id=?').run(pedidoId, venda.id);
      return { venda_id: venda.id, pedido_id: pedidoId, cliente_id: clienteId, total: venda.total };
    })();
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE')) {
      const row = db.prepare('SELECT * FROM ecommerce_pedidos WHERE plataforma = ? AND external_id = ?')
        .get(plataforma, pedido.external_id);
      if (row?.venda_id) return { duplicate: true, venda_id: row.venda_id, pedido_id: row.id };
    }
    throw err;
  }
}

app.post('/api/webhooks/:plataforma', async (req, res) => {
  const plataforma = ecomMod.normalizarPlataforma(req.params.plataforma);
  try {
    autenticarWebhook(req, plataforma);
    let body = req.body || {};
    if (plataforma === 'mercadolivre') {
      const topic = String(body.topic || '');
      if (topic && !/order/i.test(topic)) {
        registrarWebhookLog({ plataforma, evento: 'ignorado', ok: 1, payload: JSON.stringify({ topic }).slice(0, 500) });
        return res.json({ ok: true, ignored: true, topic });
      }
      body = await ecomMod.enriquecerPedidoMercadoLivre(ecomSecret('mercadolivre'), body);
    }
    const r = processarPedidoEcommerce(plataforma, body);
    registrarWebhookLog({
      plataforma,
      evento: r.cancelled ? 'cancelado' : (r.duplicate ? 'duplicado' : 'pedido'),
      ok: 1,
      payload: JSON.stringify({ external_id: (req.body || {}).id || (req.body || {}).external_id, r }).slice(0, 4000)
    });
    res.json({ ok: true, plataforma, ...r });
  } catch (err) {
    registrarWebhookLog({
      plataforma,
      evento: 'erro',
      ok: 0,
      payload: JSON.stringify(req.body || {}).slice(0, 2000),
      erro: err.message
    });
    res.status(err.status || 400).json({ error: err.message || 'Falha no webhook' });
  }
});

app.get('/api/ecommerce/config', (req, res) => {
  const cfg = ecomCfg();
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  const base = `${proto}://${host}`;
  res.json({
    auto_baixa: String(cfg.ecommerce_auto_baixa || '1') === '1',
    woo_secret: ecomMod.mascarar(cfg.ecommerce_woo_secret),
    shopify_secret: ecomMod.mascarar(cfg.ecommerce_shopify_secret),
    nuvemshop_token: ecomMod.mascarar(cfg.ecommerce_nuvemshop_token),
    vtex_token: ecomMod.mascarar(cfg.ecommerce_vtex_token),
    ml_token: ecomMod.mascarar(cfg.ecommerce_ml_token),
    api_secret: ecomMod.mascarar(cfg.ecommerce_api_secret),
    tem_woo: !!cfg.ecommerce_woo_secret,
    tem_shopify: !!cfg.ecommerce_shopify_secret,
    tem_nuvemshop: !!cfg.ecommerce_nuvemshop_token,
    tem_vtex: !!cfg.ecommerce_vtex_token,
    tem_ml: !!cfg.ecommerce_ml_token,
    tem_api: !!cfg.ecommerce_api_secret,
    urls: {
      generico: `${base}/api/webhooks/generico`,
      woocommerce: `${base}/api/webhooks/woocommerce`,
      shopify: `${base}/api/webhooks/shopify`,
      nuvemshop: `${base}/api/webhooks/nuvemshop`,
      vtex: `${base}/api/webhooks/vtex`,
      mercadolivre: `${base}/api/webhooks/mercadolivre`
    }
  });
});

app.put('/api/ecommerce/config', (req, res) => {
  const body = req.body || {};
  const stmt = db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor');
  const map = {
    ecommerce_auto_baixa: body.auto_baixa === false || body.auto_baixa === 0 || body.auto_baixa === '0' ? '0' : '1'
  };
  if (body.woo_secret != null && String(body.woo_secret).trim() && !String(body.woo_secret).includes('**')) {
    map.ecommerce_woo_secret = String(body.woo_secret).trim();
  }
  if (body.shopify_secret != null && String(body.shopify_secret).trim() && !String(body.shopify_secret).includes('**')) {
    map.ecommerce_shopify_secret = String(body.shopify_secret).trim();
  }
  if (body.nuvemshop_token != null && String(body.nuvemshop_token).trim() && !String(body.nuvemshop_token).includes('**')) {
    map.ecommerce_nuvemshop_token = String(body.nuvemshop_token).trim();
  }
  if (body.vtex_token != null && String(body.vtex_token).trim() && !String(body.vtex_token).includes('**')) {
    map.ecommerce_vtex_token = String(body.vtex_token).trim();
  }
  if (body.ml_token != null && String(body.ml_token).trim() && !String(body.ml_token).includes('**')) {
    map.ecommerce_ml_token = String(body.ml_token).trim();
  }
  if (body.api_secret != null && String(body.api_secret).trim() && !String(body.api_secret).includes('**')) {
    map.ecommerce_api_secret = String(body.api_secret).trim();
  }
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(map)) stmt.run(k, v);
  });
  tx();
  res.json({ message: 'Integracao salva' });
});

app.get('/api/ecommerce/tokens', (req, res) => {
  const rows = db.prepare('SELECT id, nome, plataforma, prefixo, ativo, criado_em FROM ecommerce_tokens ORDER BY id DESC').all();
  res.json({ data: rows });
});

app.post('/api/ecommerce/tokens', (req, res) => {
  const nome = String(req.body?.nome || '').trim() || 'Token loja';
  const plataforma = ecomMod.normalizarPlataforma(req.body?.plataforma);
  const gerado = ecomMod.gerarToken();
  const r = db.prepare('INSERT INTO ecommerce_tokens (nome, plataforma, token_hash, prefixo, ativo) VALUES (?,?,?,?,1)')
    .run(nome, plataforma, gerado.hash, gerado.prefixo);
  res.json({ id: r.lastInsertRowid, token: gerado.token, prefixo: gerado.prefixo, message: 'Copie o token agora. Ele nao sera exibido de novo.' });
});

app.delete('/api/ecommerce/tokens/:id', (req, res) => {
  db.prepare('UPDATE ecommerce_tokens SET ativo = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Token desativado' });
});

app.get('/api/ecommerce/pedidos', (req, res) => {
  const { search = '', page = 1, limit = 15, plataforma } = req.query;
  let query = `SELECT p.*, c.nome as cliente_nome, v.status as venda_status, v.total as venda_total
    FROM ecommerce_pedidos p
    LEFT JOIN clientes c ON c.id = p.cliente_id
    LEFT JOIN vendas v ON v.id = p.venda_id WHERE 1=1`;
  const params = [];
  if (plataforma) { query += ' AND p.plataforma = ?'; params.push(plataforma); }
  if (search) {
    query += ' AND (p.external_id LIKE ? OR c.nome LIKE ? OR CAST(p.venda_id AS TEXT) LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY p.id DESC';
  const countQ = query.replace(/SELECT p\.\*, c\.nome as cliente_nome, v\.status as venda_status, v\.total as venda_total[\s\S]*?FROM ecommerce_pedidos p/, 'SELECT COUNT(*) as total FROM ecommerce_pedidos p');
  const total = db.prepare(countQ).get(...params)?.total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare(`${query} LIMIT ? OFFSET ?`).all(...params, +limit, offset);
  res.json({ data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) || 1 });
});

app.get('/api/ecommerce/log', (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const total = db.prepare('SELECT COUNT(*) as total FROM ecommerce_webhooks_log').get().total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare('SELECT * FROM ecommerce_webhooks_log ORDER BY id DESC LIMIT ? OFFSET ?').all(+limit, offset);
  res.json({ data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) || 1 });
});

app.post('/api/ecommerce/pedidos', (req, res) => {
  try {
    const plataforma = ecomMod.normalizarPlataforma(req.body?.plataforma || 'generico');
    const r = processarPedidoEcommerce(plataforma, req.body || {});
    res.json({ ok: true, ...r });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao importar pedido' });
  }
});

function rhGradeRow(id) {
  return db.prepare('SELECT * FROM rh_grades WHERE id = ?').get(id);
}

app.get('/api/rh/grades', (req, res) => {
  const { search = '', page = 1, limit = 15, status = '' } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (status) { where += ' AND g.status = ?'; params.push(rhMod.normalizarStatus(status)); }
  if (search) {
    where += ' AND (g.nome LIKE ? OR g.tipo LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s);
  }
  const from = `FROM rh_grades g ${where}`;
  const total = db.prepare(`SELECT COUNT(*) as total ${from}`).get(...params)?.total || 0;
  const limite = Math.min(Math.max(Number(limit) || 15, 1), 200);
  const pagina = Math.max(Number(page) || 1, 1);
  const data = db.prepare(`
    SELECT g.*,
      (SELECT COUNT(*) FROM rh_funcionarios f WHERE f.grade_id = g.id AND f.ativo = 1) as funcionarios
    ${from} ORDER BY g.nome ASC LIMIT ? OFFSET ?
  `).all(...params, limite, (pagina - 1) * limite);
  res.json({ data, total, page: pagina, limit: limite, totalPages: Math.ceil(total / limite) || 1 });
});

app.get('/api/rh/grades/all', (req, res) => {
  res.json(db.prepare("SELECT id, nome, status, tipo FROM rh_grades WHERE status = 'ativo' ORDER BY nome").all());
});

app.get('/api/rh/grades/:id', (req, res) => {
  const row = rhGradeRow(req.params.id);
  if (!row) return res.status(404).json({ error: 'Grade horaria nao encontrada' });
  row.funcionarios = db.prepare('SELECT COUNT(*) as c FROM rh_funcionarios WHERE grade_id = ? AND ativo = 1').get(row.id).c;
  res.json(row);
});

app.post('/api/rh/grades', (req, res) => {
  try {
    const d = rhMod.payloadGrade(req.body || {});
    const result = db.prepare(`INSERT INTO rh_grades
      (nome, status, tipo, horas_dia, horas_semana, horas_mes, limite_dia, intervalo_minimo, banco_horas, flexivel, exigir_localizacao, exigir_perto)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      d.nome, d.status, d.tipo, d.horas_dia, d.horas_semana, d.horas_mes, d.limite_dia, d.intervalo_minimo,
      d.banco_horas, d.flexivel, d.exigir_localizacao, d.exigir_perto
    );
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao criar grade' });
  }
});

app.put('/api/rh/grades/:id', (req, res) => {
  try {
    const atual = rhGradeRow(req.params.id);
    if (!atual) return res.status(404).json({ error: 'Grade horaria nao encontrada' });
    const d = rhMod.payloadGrade(req.body || {});
    db.prepare(`UPDATE rh_grades SET nome=?, status=?, tipo=?, horas_dia=?, horas_semana=?, horas_mes=?,
      limite_dia=?, intervalo_minimo=?, banco_horas=?, flexivel=?, exigir_localizacao=?, exigir_perto=? WHERE id=?`).run(
      d.nome, d.status, d.tipo, d.horas_dia, d.horas_semana, d.horas_mes, d.limite_dia, d.intervalo_minimo,
      d.banco_horas, d.flexivel, d.exigir_localizacao, d.exigir_perto, atual.id
    );
    res.json({ message: 'Grade atualizada' });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao atualizar grade' });
  }
});

app.delete('/api/rh/grades/:id', (req, res) => {
  const atual = rhGradeRow(req.params.id);
  if (!atual) return res.status(404).json({ error: 'Grade horaria nao encontrada' });
  const usados = db.prepare('SELECT COUNT(*) as c FROM rh_funcionarios WHERE grade_id = ? AND ativo = 1').get(atual.id).c;
  if (usados) return res.status(400).json({ error: `Nao e possivel excluir: ${usados} funcionario(s) nesta grade` });
  db.prepare('DELETE FROM rh_grades WHERE id = ?').run(atual.id);
  res.json({ message: 'Grade excluida' });
});

function payloadFuncionario(body) {
  const nome = String(body.nome || '').trim();
  if (!nome) {
    const err = new Error('Nome e obrigatorio');
    err.status = 400;
    throw err;
  }
  const gradeId = inteiroOuNulo(body.grade_id);
  if (gradeId) {
    const g = rhGradeRow(gradeId);
    if (!g) {
      const err = new Error('Grade horaria nao encontrada');
      err.status = 400;
      throw err;
    }
  }
  return {
    nome: nome.slice(0, 120),
    cpf: String(body.cpf || '').slice(0, 20),
    cargo: String(body.cargo || '').slice(0, 80),
    telefone: String(body.telefone || '').slice(0, 30),
    email: String(body.email || '').slice(0, 120),
    data_admissao: dataValida(body.data_admissao),
    data_demissao: dataValida(body.data_demissao),
    salario: Number(body.salario) || 0,
    grade_id: gradeId,
    usuario_id: inteiroOuNulo(body.usuario_id),
    ativo: body.ativo === 0 || body.ativo === '0' || body.ativo === false ? 0 : 1
  };
}

app.get('/api/rh/funcionarios', (req, res) => {
  const { search = '', page = 1, limit = 15, ativo = '' } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (ativo === '1' || ativo === '0') { where += ' AND f.ativo = ?'; params.push(Number(ativo)); }
  if (search) {
    where += ' AND (f.nome LIKE ? OR IFNULL(f.cpf,\'\') LIKE ? OR IFNULL(f.cargo,\'\') LIKE ? OR IFNULL(f.email,\'\') LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  const from = `FROM rh_funcionarios f LEFT JOIN rh_grades g ON g.id = f.grade_id ${where}`;
  const total = db.prepare(`SELECT COUNT(*) as total ${from}`).get(...params)?.total || 0;
  const limite = Math.min(Math.max(Number(limit) || 15, 1), 200);
  const pagina = Math.max(Number(page) || 1, 1);
  const data = db.prepare(`
    SELECT f.*, g.nome as grade_nome, g.tipo as grade_tipo
    ${from} ORDER BY f.nome ASC LIMIT ? OFFSET ?
  `).all(...params, limite, (pagina - 1) * limite);
  res.json({ data, total, page: pagina, limit: limite, totalPages: Math.ceil(total / limite) || 1 });
});

app.get('/api/rh/funcionarios/all', (req, res) => {
  res.json(db.prepare('SELECT id, nome, cargo, grade_id FROM rh_funcionarios WHERE ativo = 1 ORDER BY nome').all());
});

app.get('/api/rh/funcionarios/:id', (req, res) => {
  const row = db.prepare(`
    SELECT f.*, g.nome as grade_nome FROM rh_funcionarios f
    LEFT JOIN rh_grades g ON g.id = f.grade_id WHERE f.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Funcionario nao encontrado' });
  res.json(row);
});

app.post('/api/rh/funcionarios', (req, res) => {
  try {
    const d = payloadFuncionario(req.body || {});
    const result = db.prepare(`INSERT INTO rh_funcionarios
      (nome, cpf, cargo, telefone, email, data_admissao, data_demissao, salario, grade_id, usuario_id, ativo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      d.nome, d.cpf, d.cargo, d.telefone, d.email, d.data_admissao, d.data_demissao, d.salario, d.grade_id, d.usuario_id, d.ativo
    );
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao cadastrar funcionario' });
  }
});

app.put('/api/rh/funcionarios/:id', (req, res) => {
  try {
    const atual = db.prepare('SELECT id FROM rh_funcionarios WHERE id = ?').get(req.params.id);
    if (!atual) return res.status(404).json({ error: 'Funcionario nao encontrado' });
    const d = payloadFuncionario(req.body || {});
    db.prepare(`UPDATE rh_funcionarios SET nome=?, cpf=?, cargo=?, telefone=?, email=?, data_admissao=?,
      data_demissao=?, salario=?, grade_id=?, usuario_id=?, ativo=? WHERE id=?`).run(
      d.nome, d.cpf, d.cargo, d.telefone, d.email, d.data_admissao, d.data_demissao, d.salario, d.grade_id, d.usuario_id, d.ativo, atual.id
    );
    res.json({ message: 'Funcionario atualizado' });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao atualizar funcionario' });
  }
});

app.delete('/api/rh/funcionarios/:id', (req, res) => {
  const atual = db.prepare('SELECT id FROM rh_funcionarios WHERE id = ?').get(req.params.id);
  if (!atual) return res.status(404).json({ error: 'Funcionario nao encontrado' });
  db.prepare('UPDATE rh_funcionarios SET ativo = 0 WHERE id = ?').run(atual.id);
  res.json({ message: 'Funcionario desativado' });
});

app.get('/api/rh/pontos', (req, res) => {
  const { search = '', page = 1, limit = 15, funcionario_id = '', de = '', ate = '' } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  const fid = inteiroOuNulo(funcionario_id);
  if (fid) { where += ' AND p.funcionario_id = ?'; params.push(fid); }
  if (de && dataValida(de)) { where += ' AND date(p.data) >= date(?)'; params.push(de); }
  if (ate && dataValida(ate)) { where += ' AND date(p.data) <= date(?)'; params.push(ate); }
  if (search) {
    where += ' AND (f.nome LIKE ? OR IFNULL(p.observacao,\'\') LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s);
  }
  const from = `FROM rh_pontos p JOIN rh_funcionarios f ON f.id = p.funcionario_id ${where}`;
  const total = db.prepare(`SELECT COUNT(*) as total ${from}`).get(...params)?.total || 0;
  const limite = Math.min(Math.max(Number(limit) || 15, 1), 200);
  const pagina = Math.max(Number(page) || 1, 1);
  const data = db.prepare(`
    SELECT p.*, f.nome as funcionario_nome
    ${from} ORDER BY p.data DESC, p.horario DESC LIMIT ? OFFSET ?
  `).all(...params, limite, (pagina - 1) * limite);
  res.json({ data, total, page: pagina, limit: limite, totalPages: Math.ceil(total / limite) || 1 });
});

app.post('/api/rh/pontos', (req, res) => {
  try {
    const funcionarioId = inteiroOuNulo(req.body?.funcionario_id);
    if (!funcionarioId) {
      const err = new Error('Funcionario e obrigatorio');
      err.status = 400;
      throw err;
    }
    const func = db.prepare('SELECT id FROM rh_funcionarios WHERE id = ? AND ativo = 1').get(funcionarioId);
    if (!func) {
      const err = new Error('Funcionario nao encontrado');
      err.status = 400;
      throw err;
    }
    const data = dataValida(req.body.data) || hojeIso();
    const horario = rhMod.parseHora(req.body.horario, '08:00');
    const tipo = rhMod.normalizarBatida(req.body.tipo);
    const result = db.prepare(`INSERT INTO rh_pontos (funcionario_id, data, horario, tipo, observacao)
      VALUES (?,?,?,?,?)`).run(funcionarioId, data, horario, tipo, String(req.body.observacao || '').slice(0, 200));
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao registrar ponto' });
  }
});

app.delete('/api/rh/pontos/:id', (req, res) => {
  const atual = db.prepare('SELECT id FROM rh_pontos WHERE id = ?').get(req.params.id);
  if (!atual) return res.status(404).json({ error: 'Batida nao encontrada' });
  db.prepare('DELETE FROM rh_pontos WHERE id = ?').run(atual.id);
  res.json({ message: 'Batida excluida' });
});

app.get('/api/rh/folhas', (req, res) => {
  try {
    const funcionarioId = inteiroOuNulo(req.query.funcionario_id);
    if (!funcionarioId) return res.status(400).json({ error: 'Informe o funcionario' });
    const func = db.prepare(`
      SELECT f.*, g.nome as grade_nome FROM rh_funcionarios f
      LEFT JOIN rh_grades g ON g.id = f.grade_id WHERE f.id = ?
    `).get(funcionarioId);
    if (!func) return res.status(404).json({ error: 'Funcionario nao encontrado' });
    const de = dataValida(req.query.de) || db.prepare("SELECT date('now','localtime','start of month') as d").get().d;
    const ate = dataValida(req.query.ate) || hojeIso();
    const batidas = db.prepare(`
      SELECT * FROM rh_pontos WHERE funcionario_id = ? AND date(data) >= date(?) AND date(data) <= date(?)
      ORDER BY data, horario
    `).all(funcionarioId, de, ate);
    const grade = func.grade_id ? rhGradeRow(func.grade_id) : null;
    const folha = rhMod.calcularFolha({ batidas, grade });
    res.json({ funcionario: func, grade, de, ate, batidas, ...folha });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao gerar folha' });
  }
});

function paginarLista(lista, page, limit) {
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));
  const total = lista.length;
  const offset = (pg - 1) * lim;
  return {
    data: lista.slice(offset, offset + lim),
    total,
    page: pg,
    limit: lim,
    totalPages: Math.ceil(total / lim) || 1
  };
}

app.get('/api/gerencia/orcamentos', (req, res) => {
  const { search = '', page = 1, limit = 15, status } = req.query;
  let query = `SELECT o.*, u.nome as usuario_nome FROM orcamentos o
    LEFT JOIN usuarios u ON o.usuario_id = u.id WHERE 1=1`;
  const params = [];
  if (status) {
    query += ' AND o.status = ?';
    params.push(gerenciaMod.normalizarStatusOrc(status));
  }
  if (search) {
    query += ' AND (o.cliente_nome LIKE ? OR CAST(o.id AS TEXT) LIKE ? OR IFNULL(o.observacao,\'\') LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY o.criado_em DESC, o.id DESC';
  const rows = db.prepare(query).all(...params).map(o => ({
    ...o,
    itens: gerenciaMod.parseItensOrc(o.itens),
    status: gerenciaMod.normalizarStatusOrc(o.status)
  }));
  const resumo = gerenciaMod.resumirOrcamentos(
    db.prepare('SELECT status, total FROM orcamentos').all().map(o => ({
      status: gerenciaMod.normalizarStatusOrc(o.status),
      total: o.total
    }))
  );
  const pg = paginarLista(rows, page, limit);
  res.json({ ...pg, resumo });
});

app.get('/api/gerencia/orcamentos/:id', (req, res) => {
  const row = db.prepare(`SELECT o.*, u.nome as usuario_nome FROM orcamentos o
    LEFT JOIN usuarios u ON o.usuario_id = u.id WHERE o.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Orcamento nao encontrado' });
  res.json({
    ...row,
    itens: gerenciaMod.parseItensOrc(row.itens),
    status: gerenciaMod.normalizarStatusOrc(row.status)
  });
});

app.post('/api/gerencia/orcamentos/:id/aprovar', (req, res) => {
  try {
    const atual = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(req.params.id);
    if (!atual) return res.status(404).json({ error: 'Orcamento nao encontrado' });
    gerenciaMod.transicaoOrc(atual.status, 'Aprovado');
    db.prepare(`UPDATE orcamentos SET status='Aprovado', aprovado_em=datetime('now','localtime'), aprovado_por=? WHERE id=?`)
      .run(req.usuario?.id || null, atual.id);
    res.json({ message: 'Orcamento aprovado', status: 'Aprovado' });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao aprovar' });
  }
});

app.post('/api/gerencia/orcamentos/:id/recusar', (req, res) => {
  try {
    const atual = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(req.params.id);
    if (!atual) return res.status(404).json({ error: 'Orcamento nao encontrado' });
    gerenciaMod.transicaoOrc(atual.status, 'Recusado');
    db.prepare("UPDATE orcamentos SET status='Recusado' WHERE id=?").run(atual.id);
    res.json({ message: 'Orcamento recusado', status: 'Recusado' });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao recusar' });
  }
});

app.post('/api/gerencia/orcamentos/:id/converter', (req, res) => {
  try {
    const atual = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(req.params.id);
    if (!atual) return res.status(404).json({ error: 'Orcamento nao encontrado' });
    if (atual.venda_id) {
      const err = new Error('Orcamento ja convertido');
      err.status = 400;
      throw err;
    }
    gerenciaMod.transicaoOrc(atual.status, 'Convertido');
    const itens = gerenciaMod.itensParaVenda(atual.itens);
    const forma = String(req.body?.forma_pagamento || 'PIX').trim() || 'PIX';
    const venda = criarVendaInterna({
      cliente_id: atual.cliente_id || null,
      itens,
      desconto: Number(atual.desconto) || 0,
      forma_pagamento: forma,
      usuario_id: req.usuario?.id,
      exigirCaixa: false,
      origem: 'gerencia'
    });
    db.prepare("UPDATE orcamentos SET status='Convertido', venda_id=? WHERE id=?").run(venda.id, atual.id);
    res.json({ message: 'Orcamento convertido em venda', status: 'Convertido', venda_id: venda.id, total: venda.total });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao converter' });
  }
});

app.get('/api/gerencia/fechamentos', (req, res) => {
  const { search = '', page = 1, limit = 15, conferido } = req.query;
  let query = `SELECT f.*, u.nome as usuario_nome, c.nome as conferido_nome
    FROM caixa_fechamentos f
    LEFT JOIN usuarios u ON f.usuario_id = u.id
    LEFT JOIN usuarios c ON f.conferido_por = c.id WHERE 1=1`;
  const params = [];
  if (conferido === '1' || conferido === '0') {
    query += ' AND f.conferido = ?';
    params.push(Number(conferido));
  }
  if (search) {
    query += ' AND (IFNULL(f.observacao,\'\') LIKE ? OR IFNULL(u.nome,\'\') LIKE ? OR CAST(f.id AS TEXT) LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY f.fechado_em DESC, f.id DESC';
  const rows = db.prepare(query).all(...params);
  const resumo = db.prepare(`
    SELECT COUNT(*) as total,
      COALESCE(SUM(CASE WHEN conferido=0 THEN 1 ELSE 0 END),0) as pendentes,
      COALESCE(SUM(CASE WHEN conferido=1 THEN 1 ELSE 0 END),0) as conferidos,
      COALESCE(SUM(saldo),0) as saldo
    FROM caixa_fechamentos
  `).get();
  const pg = paginarLista(rows, page, limit);
  res.json({ ...pg, resumo });
});

app.post('/api/gerencia/fechamentos/:id/conferir', (req, res) => {
  const atual = db.prepare('SELECT * FROM caixa_fechamentos WHERE id = ?').get(req.params.id);
  if (!atual) return res.status(404).json({ error: 'Fechamento nao encontrado' });
  if (atual.conferido) return res.json({ message: 'Fechamento ja conferido', status: 'conferido' });
  db.prepare(`UPDATE caixa_fechamentos SET conferido=1, conferido_em=datetime('now','localtime'), conferido_por=?, observacao=? WHERE id=?`)
    .run(req.usuario?.id || null, String(req.body?.observacao || '').trim() || atual.observacao, atual.id);
  res.json({ message: 'Fechamento conferido', status: 'conferido' });
});

app.get('/api/gerencia/inventario', (req, res) => {
  const { search = '', page = 1, limit = 15, categoria } = req.query;
  let query = `SELECT p.*, f.nome as fornecedor_nome, o.nome as estoque_origem_nome, o.estoque as estoque_origem_qtd
    FROM produtos p
    LEFT JOIN fornecedores f ON p.fornecedor_id = f.id
    LEFT JOIN produtos o ON o.id = p.estoque_origem_id
    WHERE p.ativo = 1`;
  const params = [];
  if (search) {
    query += ' AND (p.nome LIKE ? OR p.codigo LIKE ? OR IFNULL(p.categoria,\'\') LIKE ? OR IFNULL(p.localizacao,\'\') LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  if (categoria) {
    query += ' AND lower(IFNULL(p.categoria,\'\')) = lower(?)';
    params.push(String(categoria).trim());
  }
  query += ' ORDER BY p.nome ASC';
  const rows = db.prepare(query).all(...params).map(p => {
    const row = enriquecerProduto(p);
    row.situacao = produtosEstoque.situacaoDe(row);
    row.situacao_label = produtosEstoque.rotuloSituacao(row.situacao);
    row.valor_estoque = produtosEstoque.valorEstoque(row);
    return row;
  }).filter(p => {
    const tipo = produtosTipos.normalizarTipo(p.tipo);
    return tipo !== 'servico' && tipo !== 'kit' && produtosTipos.controlaEstoque(p, tipo);
  });
  const resumo = produtosEstoque.resumir(rows);
  const pg = paginarLista(rows, page, limit);
  res.json({ ...pg, resumo });
});

app.post('/api/gerencia/inventario', (req, res) => {
  try {
    const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
    if (!itens.length) {
      const err = new Error('Informe ao menos um item para contar');
      err.status = 400;
      throw err;
    }
    const usuario_id = req.usuario?.id;
    const obs = String(req.body?.observacao || 'Inventario gerencia').trim() || 'Inventario gerencia';
    const txn = db.transaction(() => {
      let atualizados = 0;
      for (const it of itens) {
        const id = Number(it.produto_id || it.id);
        if (!id) continue;
        const produto = db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1').get(id);
        if (!produto) continue;
        const tipoProd = produtosTipos.normalizarTipo(produto.tipo);
        if (tipoProd === 'servico' || tipoProd === 'kit' || !produtosTipos.controlaEstoque(produto, tipoProd)) continue;
        const alvo = produto.estoque_origem_id
          ? db.prepare('SELECT * FROM produtos WHERE id = ?').get(produto.estoque_origem_id)
          : produto;
        if (!alvo) continue;
        const contado = gerenciaMod.validarContagem(it.contado != null ? it.contado : it.quantidade);
        const anterior = alvo.estoque || 0;
        const novo = Math.max(0, contado);
        db.prepare('UPDATE produtos SET estoque = ? WHERE id = ?').run(novo, alvo.id);
        db.prepare('INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, estoque_anterior, estoque_novo, observacao, usuario_id) VALUES (?,?,?,?,?,?,?)')
          .run(alvo.id, 'inventario', novo, anterior, novo, obs, usuario_id || null);
        atualizados += 1;
      }
      if (!atualizados) {
        const err = new Error('Nenhum item valido para inventario');
        err.status = 400;
        throw err;
      }
      return atualizados;
    });
    const n = txn();
    res.json({ message: `${n} item(ns) inventariado(s)`, atualizados: n });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha no inventario' });
  }
});

app.get('/api/gerencia/estoque', (req, res) => {
  const { search = '', page = 1, limit = 15, categoria, situacao, tipo } = req.query;
  let query = `SELECT p.*, f.nome as fornecedor_nome, o.nome as estoque_origem_nome, o.estoque as estoque_origem_qtd
    FROM produtos p
    LEFT JOIN fornecedores f ON p.fornecedor_id = f.id
    LEFT JOIN produtos o ON o.id = p.estoque_origem_id
    WHERE p.ativo = 1`;
  const params = [];
  if (search) {
    query += ' AND (p.nome LIKE ? OR p.codigo LIKE ? OR IFNULL(p.categoria,\'\') LIKE ? OR IFNULL(p.marca,\'\') LIKE ? OR IFNULL(p.referencia,\'\') LIKE ? OR IFNULL(p.localizacao,\'\') LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s, s, s);
  }
  if (categoria) {
    query += ' AND lower(IFNULL(p.categoria,\'\')) = lower(?)';
    params.push(String(categoria).trim());
  }
  if (tipo) {
    query += ' AND lower(IFNULL(p.tipo,\'produto\')) = lower(?)';
    params.push(String(tipo).trim());
  }
  query += ' ORDER BY p.nome ASC';
  const rows = db.prepare(query).all(...params).map(p => {
    const row = enriquecerProduto(p);
    row.situacao = produtosEstoque.situacaoDe(row);
    row.situacao_label = produtosEstoque.rotuloSituacao(row.situacao);
    row.valor_estoque = produtosEstoque.valorEstoque(row);
    return row;
  });
  const filtrados = situacao ? rows.filter(p => p.situacao === String(situacao).trim()) : rows;
  const resumo = produtosEstoque.resumir(filtrados);
  const pg = paginarLista(filtrados, page, limit);
  res.json({ ...pg, resumo });
});

function cfgEmitente() {
  const cfg = Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor]));
  return {
    cnpj: cfg.nfce_cnpj || cfg.empresa_cnpj || '',
    razao: cfg.nfce_razao_social || cfg.empresa_nome || 'ERP ISAC',
    ie: cfg.nfce_ie || '',
    uf: cfg.nfce_uf || cfg.empresa_estado || 'RN',
    cuf: String(cfg.nfce_codigo_municipio || '2410306').slice(0, 2) || '24',
    ambiente: cfg.nfce_ambiente || 'homologacao',
    crt: Number(cfg.nfce_crt || 1)
  };
}

function proximoNumeroNota(modelo) {
  const chave = modelo === 'NFS-e' ? 'nfse_numero_atual' : 'nfe_numero_atual';
  const row = db.prepare('SELECT valor FROM config WHERE chave=?').get(chave);
  const n = (Number(row?.valor) || 0) + 1;
  db.prepare("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor")
    .run(chave, String(n));
  return n;
}

function itensDaNota(notaId) {
  return db.prepare('SELECT * FROM nota_itens WHERE nota_id=?').all(notaId);
}

function notaCompleta(id) {
  const n = db.prepare(`SELECT n.*, c.nome as cliente_nome FROM notas_fiscais n
    LEFT JOIN clientes c ON n.cliente_id = c.id WHERE n.id=?`).get(id);
  if (!n) return null;
  n.itens = itensDaNota(id);
  return n;
}

// ============ CRM ============
app.get('/api/crm', (req, res) => {
  const { search = '', etapa, vendedor_id } = req.query;
  let query = `SELECT o.*, c.nome as cliente_cadastro, c.telefone as cliente_telefone, u.nome as vendedor_nome
    FROM crm_oportunidades o
    LEFT JOIN clientes c ON o.cliente_id = c.id
    LEFT JOIN usuarios u ON o.vendedor_id = u.id WHERE 1=1`;
  const params = [];
  if (etapa) { query += ' AND o.etapa=?'; params.push(crmMod.normalizarEtapa(etapa)); }
  if (vendedor_id) { query += ' AND o.vendedor_id=?'; params.push(Number(vendedor_id)); }
  if (search) {
    query += ' AND (o.titulo LIKE ? OR IFNULL(o.cliente_nome,\'\') LIKE ? OR IFNULL(c.nome,\'\') LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY o.id DESC';
  const data = db.prepare(query).all(...params);
  res.json({ data, kanban: crmMod.agruparKanban(data), resumo: crmMod.resumirFunil(data) });
});

app.get('/api/crm/:id', (req, res) => {
  const row = db.prepare(`SELECT o.*, c.nome as cliente_cadastro, u.nome as vendedor_nome
    FROM crm_oportunidades o LEFT JOIN clientes c ON o.cliente_id=c.id
    LEFT JOIN usuarios u ON o.vendedor_id=u.id WHERE o.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Oportunidade nao encontrada' });
  res.json(row);
});

app.post('/api/crm', (req, res) => {
  try {
    const d = crmMod.payloadOportunidade(req.body || {});
    if (!d.vendedor_id && req.usuario?.id) d.vendedor_id = req.usuario.id;
    const r = db.prepare(`INSERT INTO crm_oportunidades
      (titulo, cliente_id, cliente_nome, valor, etapa, probabilidade, origem, vendedor_id, previsao_fechamento, observacao)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      d.titulo, d.cliente_id, d.cliente_nome, d.valor, d.etapa, d.probabilidade,
      d.origem, d.vendedor_id, d.previsao_fechamento, d.observacao
    );
    res.json({ id: r.lastInsertRowid });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.put('/api/crm/:id', (req, res) => {
  try {
    const atual = db.prepare('SELECT * FROM crm_oportunidades WHERE id=?').get(req.params.id);
    if (!atual) return res.status(404).json({ error: 'Oportunidade nao encontrada' });
    const d = crmMod.payloadOportunidade({ ...atual, ...(req.body || {}) });
    if (req.body?.etapa && req.body.etapa !== atual.etapa) {
      d.etapa = crmMod.transicaoEtapa(atual.etapa, req.body.etapa);
      if (req.body.probabilidade == null) d.probabilidade = crmMod.probabilidadeDaEtapa(d.etapa);
    }
    db.prepare(`UPDATE crm_oportunidades SET titulo=?, cliente_id=?, cliente_nome=?, valor=?, etapa=?,
      probabilidade=?, origem=?, vendedor_id=?, previsao_fechamento=?, observacao=? WHERE id=?`).run(
      d.titulo, d.cliente_id, d.cliente_nome, d.valor, d.etapa, d.probabilidade,
      d.origem, d.vendedor_id, d.previsao_fechamento, d.observacao, req.params.id
    );
    res.json({ message: 'Oportunidade atualizada', etapa: d.etapa });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.post('/api/crm/:id/mover', (req, res) => {
  try {
    const atual = db.prepare('SELECT * FROM crm_oportunidades WHERE id=?').get(req.params.id);
    if (!atual) return res.status(404).json({ error: 'Oportunidade nao encontrada' });
    const etapa = crmMod.transicaoEtapa(atual.etapa, req.body?.etapa);
    const probabilidade = crmMod.probabilidadeDaEtapa(etapa);
    db.prepare('UPDATE crm_oportunidades SET etapa=?, probabilidade=? WHERE id=?').run(etapa, probabilidade, req.params.id);
    res.json({ message: 'Etapa atualizada', etapa, probabilidade });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.post('/api/crm/:id/ganhar', (req, res) => {
  try {
    const atual = db.prepare('SELECT * FROM crm_oportunidades WHERE id=?').get(req.params.id);
    if (!atual) return res.status(404).json({ error: 'Oportunidade nao encontrada' });
    crmMod.transicaoEtapa(atual.etapa, 'Ganho');
    db.prepare("UPDATE crm_oportunidades SET etapa='Ganho', probabilidade=100 WHERE id=?").run(req.params.id);
    res.json({ message: 'Oportunidade ganha', etapa: 'Ganho' });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.post('/api/crm/:id/perder', (req, res) => {
  try {
    const atual = db.prepare('SELECT * FROM crm_oportunidades WHERE id=?').get(req.params.id);
    if (!atual) return res.status(404).json({ error: 'Oportunidade nao encontrada' });
    crmMod.transicaoEtapa(atual.etapa, 'Perdido');
    db.prepare("UPDATE crm_oportunidades SET etapa='Perdido', probabilidade=0 WHERE id=?").run(req.params.id);
    res.json({ message: 'Oportunidade perdida', etapa: 'Perdido' });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.delete('/api/crm/:id', (req, res) => {
  db.prepare('DELETE FROM crm_oportunidades WHERE id=?').run(req.params.id);
  res.json({ message: 'Oportunidade removida' });
});

// ============ CONTRATOS ============
app.get('/api/contratos', (req, res) => {
  const { search = '', page = 1, limit = 15, status } = req.query;
  let query = `SELECT c.*, cl.nome as cliente_nome FROM contratos c
    LEFT JOIN clientes cl ON c.cliente_id = cl.id WHERE 1=1`;
  const params = [];
  if (status) { query += ' AND c.status=?'; params.push(contratosMod.normalizarStatus(status)); }
  if (search) {
    query += ' AND (c.descricao LIKE ? OR cl.nome LIKE ? OR CAST(c.id AS TEXT) LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY c.id DESC';
  const rows = db.prepare(query).all(...params);
  const pg = paginarLista(rows, page, limit);
  res.json({ ...pg, resumo: contratosMod.resumirContratos(rows) });
});

app.get('/api/contratos/:id', (req, res) => {
  const row = db.prepare(`SELECT c.*, cl.nome as cliente_nome FROM contratos c
    LEFT JOIN clientes cl ON c.cliente_id=cl.id WHERE c.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Contrato nao encontrado' });
  row.itens = db.prepare('SELECT * FROM contrato_itens WHERE contrato_id=?').all(row.id);
  res.json(row);
});

app.post('/api/contratos', (req, res) => {
  try {
    const d = contratosMod.payloadContrato(req.body || {});
    const cli = db.prepare('SELECT id FROM clientes WHERE id=?').get(d.cliente_id);
    if (!cli) return res.status(400).json({ error: 'Cliente nao encontrado' });
    const r = db.prepare(`INSERT INTO contratos
      (cliente_id, descricao, valor, periodicidade, dia_vencimento, inicio, fim, status, proximo_faturamento, observacao)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      d.cliente_id, d.descricao, d.valor, d.periodicidade, d.dia_vencimento,
      d.inicio, d.fim, d.status, d.proximo_faturamento, d.observacao
    );
    if (d.itens) {
      const ins = db.prepare('INSERT INTO contrato_itens (contrato_id, produto_id, descricao, quantidade, preco_unitario, subtotal) VALUES (?,?,?,?,?,?)');
      for (const it of d.itens) ins.run(r.lastInsertRowid, it.produto_id, it.descricao, it.quantidade, it.preco_unitario, it.subtotal);
    }
    res.json({ id: r.lastInsertRowid });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.put('/api/contratos/:id', (req, res) => {
  try {
    const atual = db.prepare('SELECT * FROM contratos WHERE id=?').get(req.params.id);
    if (!atual) return res.status(404).json({ error: 'Contrato nao encontrado' });
    const d = contratosMod.payloadContrato({ ...atual, ...(req.body || {}), itens: req.body?.itens });
    if (req.body?.status && req.body.status !== atual.status) {
      d.status = contratosMod.transicaoStatus(atual.status, req.body.status);
    }
    db.prepare(`UPDATE contratos SET cliente_id=?, descricao=?, valor=?, periodicidade=?, dia_vencimento=?,
      inicio=?, fim=?, status=?, proximo_faturamento=?, observacao=? WHERE id=?`).run(
      d.cliente_id, d.descricao, d.valor, d.periodicidade, d.dia_vencimento,
      d.inicio, d.fim, d.status, d.proximo_faturamento, d.observacao, req.params.id
    );
    if (Array.isArray(req.body?.itens)) {
      db.prepare('DELETE FROM contrato_itens WHERE contrato_id=?').run(req.params.id);
      const ins = db.prepare('INSERT INTO contrato_itens (contrato_id, produto_id, descricao, quantidade, preco_unitario, subtotal) VALUES (?,?,?,?,?,?)');
      for (const it of d.itens || []) ins.run(req.params.id, it.produto_id, it.descricao, it.quantidade, it.preco_unitario, it.subtotal);
    }
    res.json({ message: 'Contrato atualizado' });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.post('/api/contratos/:id/faturar', (req, res) => {
  try {
    const c = db.prepare('SELECT * FROM contratos WHERE id=?').get(req.params.id);
    if (!c) return res.status(404).json({ error: 'Contrato nao encontrado' });
    const hoje = hojeIso();
    contratosMod.podeFaturar(c, hoje);
    const apos = contratosMod.aposFaturar(c, hoje);
    const fin = inserirFinanceiro({
      tipo: 'Receita',
      categoria: 'Contrato',
      descricao: `Contrato #${c.id} ${c.descricao}`,
      valor: c.valor,
      data_vencimento: hoje,
      status: 'Pendente',
      cliente_id: c.cliente_id,
      origem: 'contrato'
    });
    db.prepare('UPDATE financeiro SET contrato_id=? WHERE id=?').run(c.id, fin.lastInsertRowid);
    db.prepare('UPDATE contratos SET proximo_faturamento=?, ultimo_faturamento=?, status=? WHERE id=?')
      .run(apos.proximo_faturamento, apos.ultimo_faturamento, apos.status, c.id);
    res.json({ message: 'Fatura gerada', financeiro_id: fin.lastInsertRowid, proximo_faturamento: apos.proximo_faturamento, status: apos.status });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.delete('/api/contratos/:id', (req, res) => {
  const c = db.prepare('SELECT status FROM contratos WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contrato nao encontrado' });
  if (c.status === 'Ativo') return res.status(400).json({ error: 'Encerre o contrato antes de excluir' });
  db.prepare('DELETE FROM contratos WHERE id=?').run(req.params.id);
  res.json({ message: 'Contrato removido' });
});

// ============ BANCOS / CONCILIACAO / FLUXO ============
app.get('/api/bancos', (req, res) => {
  const data = db.prepare('SELECT * FROM contas_bancarias ORDER BY ativo DESC, nome').all();
  res.json({ data });
});

app.post('/api/bancos', (req, res) => {
  try {
    const d = bancosMod.payloadConta(req.body || {});
    const r = db.prepare(`INSERT INTO contas_bancarias (nome, banco, agencia, conta, tipo, saldo_inicial, saldo_atual, ativo)
      VALUES (?,?,?,?,?,?,?,?)`).run(d.nome, d.banco, d.agencia, d.conta, d.tipo, d.saldo_inicial, d.saldo_inicial, d.ativo);
    res.json({ id: r.lastInsertRowid });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.put('/api/bancos/:id', (req, res) => {
  try {
    const atual = db.prepare('SELECT * FROM contas_bancarias WHERE id=?').get(req.params.id);
    if (!atual) return res.status(404).json({ error: 'Conta nao encontrada' });
    const d = bancosMod.payloadConta({ ...atual, ...(req.body || {}) });
    db.prepare('UPDATE contas_bancarias SET nome=?, banco=?, agencia=?, conta=?, tipo=?, ativo=? WHERE id=?')
      .run(d.nome, d.banco, d.agencia, d.conta, d.tipo, d.ativo, req.params.id);
    res.json({ message: 'Conta atualizada' });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.delete('/api/bancos/:id', (req, res) => {
  db.prepare('DELETE FROM extrato_bancario WHERE conta_id=?').run(req.params.id);
  db.prepare('DELETE FROM contas_bancarias WHERE id=?').run(req.params.id);
  res.json({ message: 'Conta removida' });
});

app.get('/api/bancos/:id/extrato', (req, res) => {
  const conta = db.prepare('SELECT * FROM contas_bancarias WHERE id=?').get(req.params.id);
  if (!conta) return res.status(404).json({ error: 'Conta nao encontrada' });
  const { status } = req.query;
  let q = 'SELECT * FROM extrato_bancario WHERE conta_id=?';
  const params = [req.params.id];
  if (status) { q += ' AND status=?'; params.push(bancosMod.normalizarStatusExtrato(status)); }
  q += ' ORDER BY data DESC, id DESC';
  const data = db.prepare(q).all(...params);
  res.json({ conta, data });
});

app.post('/api/bancos/:id/extrato', (req, res) => {
  try {
    const conta = db.prepare('SELECT * FROM contas_bancarias WHERE id=?').get(req.params.id);
    if (!conta) return res.status(404).json({ error: 'Conta nao encontrada' });
    let linhas = req.body?.linhas;
    if (!linhas && req.body?.csv) linhas = bancosMod.parseCsvExtrato(req.body.csv);
    if (!Array.isArray(linhas) || !linhas.length) {
      linhas = [bancosMod.linhaExtrato(req.body || {})];
    }
    const ins = db.prepare(`INSERT INTO extrato_bancario (conta_id, data, descricao, valor, tipo, documento, status)
      VALUES (?,?,?,?,?,?, 'Aberto')`);
    const txn = db.transaction(() => {
      let n = 0;
      for (const l of linhas) {
        const row = l.valor != null ? bancosMod.linhaExtrato(l) : l;
        ins.run(conta.id, row.data, row.descricao, row.valor, row.tipo, row.documento || '');
        n += 1;
      }
      return n;
    });
    res.json({ message: `${txn()} linha(s) importada(s)` });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.get('/api/conciliacao', (req, res) => {
  const contaId = Number(req.query.conta_id);
  if (!contaId) return res.status(400).json({ error: 'Informe a conta' });
  const extratos = db.prepare("SELECT * FROM extrato_bancario WHERE conta_id=? AND status='Aberto'").all(contaId);
  const lanc = db.prepare("SELECT * FROM financeiro WHERE status IN ('Pago','Pendente') AND id NOT IN (SELECT IFNULL(financeiro_id,0) FROM extrato_bancario WHERE financeiro_id IS NOT NULL)").all();
  res.json({ extratos, lancamentos: lanc, sugestoes: bancosMod.sugerirMatches(extratos, lanc) });
});

app.post('/api/conciliacao', (req, res) => {
  try {
    const extratoId = Number(req.body?.extrato_id);
    const financeiroId = Number(req.body?.financeiro_id);
    const ext = db.prepare('SELECT * FROM extrato_bancario WHERE id=?').get(extratoId);
    if (!ext) return res.status(404).json({ error: 'Linha de extrato nao encontrada' });
    if (ext.status === 'Conciliado') return res.status(400).json({ error: 'Ja conciliado' });
    const fin = db.prepare('SELECT * FROM financeiro WHERE id=?').get(financeiroId);
    if (!fin) return res.status(404).json({ error: 'Lancamento nao encontrado' });
    db.prepare("UPDATE extrato_bancario SET status='Conciliado', financeiro_id=? WHERE id=?").run(financeiroId, extratoId);
    if (fin.status === 'Pendente') {
      db.prepare("UPDATE financeiro SET status='Pago', data_pagamento=? WHERE id=?").run(ext.data, financeiroId);
    }
    const conta = db.prepare('SELECT * FROM contas_bancarias WHERE id=?').get(ext.conta_id);
    const novo = bancosMod.aplicarMovimentoSaldo(conta.saldo_atual, ext.valor);
    db.prepare('UPDATE contas_bancarias SET saldo_atual=? WHERE id=?').run(novo, conta.id);
    res.json({ message: 'Conciliado', saldo_atual: novo });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.post('/api/conciliacao/ignorar', (req, res) => {
  const ext = db.prepare('SELECT * FROM extrato_bancario WHERE id=?').get(req.body?.extrato_id);
  if (!ext) return res.status(404).json({ error: 'Linha nao encontrada' });
  db.prepare("UPDATE extrato_bancario SET status='Ignorado' WHERE id=?").run(ext.id);
  res.json({ message: 'Ignorado' });
});

app.get('/api/fluxo', (req, res) => {
  try {
    const dias = Number(req.query.dias) || 30;
    const de = req.query.de || hojeIso();
    const contas = db.prepare('SELECT COALESCE(SUM(saldo_atual),0) as s FROM contas_bancarias WHERE ativo=1').get();
    const lanc = db.prepare(`SELECT tipo, valor, data_vencimento FROM financeiro
      WHERE status='Pendente' AND data_vencimento IS NOT NULL`).all();
    const fluxo = bancosMod.montarFluxo({
      saldoInicial: contas.s,
      de,
      dias,
      lancamentos: lanc
    });
    res.json(fluxo);
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

// ============ NF-e / NFS-e ============
function listarNotas(req, modelo) {
  const { search = '', page = 1, limit = 15, status } = req.query;
  let query = `SELECT n.*, c.nome as cliente_nome FROM notas_fiscais n
    LEFT JOIN clientes c ON n.cliente_id = c.id WHERE n.modelo=?`;
  const params = [modelo];
  if (status) { query += ' AND n.status=?'; params.push(fiscalMod.normalizarStatus(status)); }
  if (search) {
    query += ' AND (IFNULL(n.destinatario_nome,\'\') LIKE ? OR IFNULL(n.chave,\'\') LIKE ? OR CAST(n.numero AS TEXT) LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY n.id DESC';
  const rows = db.prepare(query).all(...params);
  const pg = paginarLista(rows, page, limit);
  return { ...pg, resumo: fiscalMod.resumirNotas(rows) };
}

function gravarNota(body, modeloFixo) {
  const emit = cfgEmitente();
  const d = fiscalMod.payloadNota({ ...body, modelo: modeloFixo || body.modelo, crt: emit.crt, uf_emit: emit.uf });
  const numero = body.numero ? Number(body.numero) : proximoNumeroNota(d.modelo);
  const r = db.prepare(`INSERT INTO notas_fiscais
    (modelo, numero, serie, natureza, venda_id, os_id, contrato_id, cliente_id,
     destinatario_nome, destinatario_doc, destinatario_ie, destinatario_endereco,
     destinatario_cidade, destinatario_uf, destinatario_cep, total, status, ambiente)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    d.modelo, numero, d.serie, d.natureza, d.venda_id, d.os_id, d.contrato_id, d.cliente_id,
    d.destinatario_nome, d.destinatario_doc, d.destinatario_ie, d.destinatario_endereco,
    d.destinatario_cidade, d.destinatario_uf, d.destinatario_cep, d.total, 'Rascunho', emit.ambiente
  );
  const ins = db.prepare('INSERT INTO nota_itens (nota_id, produto_id, descricao, quantidade, preco_unitario, subtotal, ncm, cfop) VALUES (?,?,?,?,?,?,?,?)');
  for (const it of d.calc.itens) {
    ins.run(r.lastInsertRowid, null, it.descricao, it.quantidade, it.preco_unitario, it.subtotal, it.ncm, it.cfop);
  }
  return r.lastInsertRowid;
}

function emitirNotaLocal(id) {
  const nota = notaCompleta(id);
  if (!nota) { const e = new Error('Nota nao encontrada'); e.status = 404; throw e; }
  fiscalMod.transicaoStatus(nota.status, 'Autorizada');
  const emit = cfgEmitente();
  const calc = fiscalMod.calcularImpostos({
    itens: nota.itens, crt: emit.crt, ufEmit: emit.uf, ufDest: nota.destinatario_uf, modelo: nota.modelo
  });
  const auth = fiscalMod.simularAutorizacao({ ...nota, calc }, emit);
  db.prepare('UPDATE notas_fiscais SET status=?, chave=?, protocolo=?, xml=? WHERE id=?')
    .run(auth.status, auth.chave, auth.protocolo, auth.xml, id);
  return { ...auth, id };
}

app.get('/api/nfe', (req, res) => res.json(listarNotas(req, '55')));
app.get('/api/nfse', (req, res) => res.json(listarNotas(req, 'NFS-e')));

app.get('/api/nfe/:id', (req, res) => {
  const n = notaCompleta(req.params.id);
  if (!n || n.modelo !== '55') return res.status(404).json({ error: 'NF-e nao encontrada' });
  res.json(n);
});
app.get('/api/nfse/:id', (req, res) => {
  const n = notaCompleta(req.params.id);
  if (!n || n.modelo !== 'NFS-e') return res.status(404).json({ error: 'NFS-e nao encontrada' });
  res.json(n);
});

app.post('/api/nfe', (req, res) => {
  try { res.json({ id: gravarNota(req.body || {}, '55') }); }
  catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});
app.post('/api/nfse', (req, res) => {
  try { res.json({ id: gravarNota(req.body || {}, 'NFS-e') }); }
  catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.post('/api/nfe/:id/emitir', (req, res) => {
  try { res.json(emitirNotaLocal(req.params.id)); }
  catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});
app.post('/api/nfse/:id/emitir', (req, res) => {
  try { res.json(emitirNotaLocal(req.params.id)); }
  catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.post('/api/nfe/:id/cancelar', (req, res) => {
  try {
    const n = db.prepare('SELECT * FROM notas_fiscais WHERE id=?').get(req.params.id);
    if (!n) return res.status(404).json({ error: 'Nota nao encontrada' });
    fiscalMod.transicaoStatus(n.status, 'Cancelada');
    db.prepare("UPDATE notas_fiscais SET status='Cancelada' WHERE id=?").run(n.id);
    res.json({ message: 'Nota cancelada' });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});
app.post('/api/nfse/:id/cancelar', (req, res) => {
  try {
    const n = db.prepare('SELECT * FROM notas_fiscais WHERE id=?').get(req.params.id);
    if (!n) return res.status(404).json({ error: 'Nota nao encontrada' });
    fiscalMod.transicaoStatus(n.status, 'Cancelada');
    db.prepare("UPDATE notas_fiscais SET status='Cancelada' WHERE id=?").run(n.id);
    res.json({ message: 'NFS-e cancelada' });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.get('/api/nfe/:id/xml', (req, res) => {
  const n = db.prepare('SELECT * FROM notas_fiscais WHERE id=?').get(req.params.id);
  if (!n?.xml) return res.status(404).json({ error: 'XML nao encontrado' });
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="NFe-${n.chave || n.id}.xml"`);
  res.send(n.xml);
});
app.get('/api/nfse/:id/xml', (req, res) => {
  const n = db.prepare('SELECT * FROM notas_fiscais WHERE id=?').get(req.params.id);
  if (!n?.xml) return res.status(404).json({ error: 'XML nao encontrado' });
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="NFSe-${n.numero || n.id}.xml"`);
  res.send(n.xml);
});

app.post('/api/nfe/da-venda/:id', (req, res) => {
  try {
    const venda = db.prepare(`SELECT v.*, c.nome as cliente_nome, c.cpf_cnpj, c.endereco, c.cidade, c.estado
      FROM vendas v LEFT JOIN clientes c ON v.cliente_id=c.id WHERE v.id=?`).get(req.params.id);
    if (!venda) return res.status(404).json({ error: 'Venda nao encontrada' });
    const itens = db.prepare(`SELECT vi.*, COALESCE(p.nome, vi.descricao) as nome, p.ncm, p.cfop
      FROM venda_itens vi LEFT JOIN produtos p ON vi.produto_id=p.id WHERE vi.venda_id=?`).all(venda.id);
    const id = gravarNota({
      modelo: '55',
      venda_id: venda.id,
      cliente_id: venda.cliente_id,
      destinatario_nome: venda.cliente_nome || 'Destinatario',
      destinatario_doc: venda.cpf_cnpj,
      destinatario_endereco: venda.endereco,
      destinatario_cidade: venda.cidade,
      destinatario_uf: venda.estado,
      itens: itens.map(i => ({ descricao: i.nome, quantidade: i.quantidade, preco_unitario: i.preco_unitario, ncm: i.ncm, cfop: i.cfop }))
    }, '55');
    const auth = emitirNotaLocal(id);
    res.json({ id, ...auth });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.post('/api/nfse/da-os/:id', (req, res) => {
  try {
    const os = db.prepare(`SELECT o.*, c.nome as cliente_nome, c.cpf_cnpj, c.endereco, c.cidade, c.estado
      FROM ordens_servico o LEFT JOIN clientes c ON o.cliente_id=c.id WHERE o.id=?`).get(req.params.id);
    if (!os) return res.status(404).json({ error: 'OS nao encontrada' });
    const id = gravarNota({
      modelo: 'NFS-e',
      os_id: os.id,
      cliente_id: os.cliente_id,
      destinatario_nome: os.cliente_nome || 'Tomador',
      destinatario_doc: os.cpf_cnpj || '00000000000',
      destinatario_endereco: os.endereco,
      destinatario_cidade: os.cidade,
      destinatario_uf: os.estado,
      natureza: os.solicitacao || 'Prestacao de servicos',
      itens: [{ descricao: os.solicitacao || os.equipamento || 'Servico', quantidade: 1, preco_unitario: os.valor_previsto || 0 }]
    }, 'NFS-e');
    const auth = emitirNotaLocal(id);
    res.json({ id, ...auth });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

// ============ PRODUCAO ============
app.get('/api/producao', (req, res) => {
  const { search = '', page = 1, limit = 15, status } = req.query;
  let query = `SELECT o.*, p.nome as produto_nome, p.codigo as produto_codigo, u.nome as usuario_nome
    FROM ordens_producao o
    LEFT JOIN produtos p ON o.produto_id = p.id
    LEFT JOIN usuarios u ON o.usuario_id = u.id WHERE 1=1`;
  const params = [];
  if (status) { query += ' AND o.status=?'; params.push(producaoMod.normalizarStatus(status)); }
  if (search) {
    query += ' AND (p.nome LIKE ? OR p.codigo LIKE ? OR CAST(o.id AS TEXT) LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY o.id DESC';
  const rows = db.prepare(query).all(...params);
  const pg = paginarLista(rows, page, limit);
  res.json({ ...pg, resumo: producaoMod.resumirOps(rows) });
});

app.get('/api/producao/:id', (req, res) => {
  const row = db.prepare(`SELECT o.*, p.nome as produto_nome FROM ordens_producao o
    LEFT JOIN produtos p ON o.produto_id=p.id WHERE o.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'OP nao encontrada' });
  row.itens = db.prepare(`SELECT i.*, p.nome as item_nome, p.estoque FROM ordem_producao_itens i
    LEFT JOIN produtos p ON i.item_id=p.id WHERE i.op_id=?`).all(row.id);
  res.json(row);
});

app.post('/api/producao', (req, res) => {
  try {
    const d = producaoMod.payloadOp(req.body || {});
    const prod = db.prepare('SELECT * FROM produtos WHERE id=?').get(d.produto_id);
    if (!prod) return res.status(400).json({ error: 'Produto nao encontrado' });
    let bom = (req.body?.itens || []).map(it => ({ item_id: it.item_id || it.produto_id, quantidade: it.quantidade, descricao: it.descricao }));
    if (!bom.length) {
      bom = db.prepare(`SELECT item_id, quantidade, p.nome as descricao FROM produto_composicao c
        LEFT JOIN produtos p ON p.id=c.item_id WHERE c.produto_id=?`).all(d.produto_id);
    }
    const precisa = producaoMod.explodirBom(bom, d.quantidade);
    const r = db.prepare('INSERT INTO ordens_producao (produto_id, quantidade, status, observacao, usuario_id) VALUES (?,?,?,?,?)')
      .run(d.produto_id, d.quantidade, 'Aberta', d.observacao, req.usuario?.id || null);
    const ins = db.prepare('INSERT INTO ordem_producao_itens (op_id, item_id, quantidade) VALUES (?,?,?)');
    for (const it of precisa) ins.run(r.lastInsertRowid, it.item_id, it.quantidade);
    res.json({ id: r.lastInsertRowid, itens: precisa.length });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.post('/api/producao/:id/iniciar', (req, res) => {
  try {
    const op = db.prepare('SELECT * FROM ordens_producao WHERE id=?').get(req.params.id);
    if (!op) return res.status(404).json({ error: 'OP nao encontrada' });
    producaoMod.transicaoStatus(op.status, 'Em producao');
    db.prepare("UPDATE ordens_producao SET status='Em producao' WHERE id=?").run(op.id);
    res.json({ message: 'Producao iniciada', status: 'Em producao' });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.post('/api/producao/:id/concluir', (req, res) => {
  try {
    const op = db.prepare('SELECT * FROM ordens_producao WHERE id=?').get(req.params.id);
    if (!op) return res.status(404).json({ error: 'OP nao encontrada' });
    producaoMod.transicaoStatus(op.status, 'Concluida');
    const itens = db.prepare('SELECT * FROM ordem_producao_itens WHERE op_id=?').all(op.id);
    const saldos = itens.map(it => db.prepare('SELECT id, estoque FROM produtos WHERE id=?').get(it.item_id)).filter(Boolean);
    const faltas = producaoMod.checarEstoque(itens, saldos);
    if (faltas.length) {
      const e = new Error('Estoque insuficiente: ' + faltas.map(f => `${f.descricao || f.item_id} falta ${f.falta}`).join('; '));
      e.status = 400;
      throw e;
    }
    const txn = db.transaction(() => {
      for (const it of itens) {
        const p = db.prepare('SELECT estoque FROM produtos WHERE id=?').get(it.item_id);
        const anterior = Number(p?.estoque) || 0;
        const novo = producaoMod.arredQtd(anterior - it.quantidade);
        db.prepare('UPDATE produtos SET estoque=? WHERE id=?').run(novo, it.item_id);
        registrarMovimentoEstoque({
          produtoId: it.item_id, tipo: 'Saída', quantidade: it.quantidade,
          anterior, novo, observacao: `OP #${op.id} consumo`, usuarioId: req.usuario?.id
        });
      }
      const acab = db.prepare('SELECT estoque FROM produtos WHERE id=?').get(op.produto_id);
      const antA = Number(acab?.estoque) || 0;
      const novoA = producaoMod.arredQtd(antA + op.quantidade);
      db.prepare('UPDATE produtos SET estoque=? WHERE id=?').run(novoA, op.produto_id);
      registrarMovimentoEstoque({
        produtoId: op.produto_id, tipo: 'Entrada', quantidade: op.quantidade,
        anterior: antA, novo: novoA, observacao: `OP #${op.id} acabado`, usuarioId: req.usuario?.id
      });
      db.prepare("UPDATE ordens_producao SET status='Concluida', concluida_em=datetime('now','localtime') WHERE id=?").run(op.id);
    });
    txn();
    res.json({ message: 'OP concluida', status: 'Concluida' });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.post('/api/producao/:id/cancelar', (req, res) => {
  try {
    const op = db.prepare('SELECT * FROM ordens_producao WHERE id=?').get(req.params.id);
    if (!op) return res.status(404).json({ error: 'OP nao encontrada' });
    producaoMod.transicaoStatus(op.status, 'Cancelada');
    db.prepare("UPDATE ordens_producao SET status='Cancelada' WHERE id=?").run(op.id);
    res.json({ message: 'OP cancelada' });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

app.get('/api/curva-abc', (req, res) => {
  const de = req.query.de || db.prepare("SELECT date('now','localtime','start of month') as d").get().d;
  const ate = req.query.ate || hojeIso();
  const linhas = db.prepare(`
    SELECT vi.produto_id, COALESCE(p.nome, vi.descricao) as nome,
      SUM(vi.quantidade) as quantidade, SUM(vi.subtotal) as valor
    FROM venda_itens vi
    JOIN vendas v ON v.id = vi.venda_id
    LEFT JOIN produtos p ON p.id = vi.produto_id
    WHERE v.status != 'Cancelada' AND date(v.criado_em) BETWEEN date(?) AND date(?)
    GROUP BY vi.produto_id, COALESCE(p.nome, vi.descricao)
  `).all(de, ate);
  res.json({ de, ate, data: producaoMod.curvaAbc(linhas) });
});

function garantirCategoria(nome) {
  const n = String(nome || '').trim();
  if (!n) return '';
  const row = db.prepare('SELECT id, nome, ativo FROM produto_categorias WHERE lower(nome) = lower(?) ORDER BY ativo DESC, id DESC LIMIT 1').get(n);
  if (row) {
    if (!row.ativo) db.prepare('UPDATE produto_categorias SET ativo = 1 WHERE id = ?').run(row.id);
    return row.nome;
  }
  db.prepare('INSERT INTO produto_categorias (nome, ativo) VALUES (?, 1)').run(n);
  return n;
}

// ============ CATEGORIAS ============
app.get('/api/categorias', (req, res) => {
  const { search = '', page = 1, limit = 15 } = req.query;
  let query = `SELECT c.*,
    (SELECT COUNT(*) FROM produtos p WHERE p.ativo = 1 AND lower(IFNULL(p.categoria,'')) = lower(c.nome)) as produtos
    FROM produto_categorias c WHERE c.ativo = 1`;
  const params = [];
  if (search) {
    query += ' AND (c.nome LIKE ? OR IFNULL(c.descricao,\'\') LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s);
  }
  query += ' ORDER BY c.nome ASC';
  let countQuery = 'SELECT COUNT(*) as total FROM produto_categorias c WHERE c.ativo = 1';
  if (search) countQuery += ' AND (c.nome LIKE ? OR IFNULL(c.descricao,\'\') LIKE ?)';
  const total = db.prepare(countQuery).get(...params)?.total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare(`${query} LIMIT ? OFFSET ?`).all(...params, +limit, offset);
  res.json({ data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) || 1 });
});

app.get('/api/categorias/all', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.nome, c.descricao,
      (SELECT COUNT(*) FROM produtos p WHERE p.ativo = 1 AND lower(IFNULL(p.categoria,'')) = lower(c.nome)) as produtos
    FROM produto_categorias c WHERE c.ativo = 1 ORDER BY c.nome
  `).all();
  res.json(rows);
});

app.get('/api/categorias/:id', (req, res) => {
  const row = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM produtos p WHERE p.ativo = 1 AND lower(IFNULL(p.categoria,'')) = lower(c.nome)) as produtos
    FROM produto_categorias c WHERE c.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Categoria não encontrada' });
  res.json(row);
});

app.post('/api/categorias', (req, res) => {
  const nome = String(req.body.nome || '').trim();
  const descricao = String(req.body.descricao || '').trim();
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
  const existe = db.prepare('SELECT id FROM produto_categorias WHERE lower(nome) = lower(?) AND ativo = 1').get(nome);
  if (existe) return res.status(400).json({ error: 'Já existe uma categoria com este nome' });
  const inativa = db.prepare('SELECT id FROM produto_categorias WHERE lower(nome) = lower(?)').get(nome);
  if (inativa) {
    db.prepare('UPDATE produto_categorias SET ativo = 1, descricao = ? WHERE id = ?').run(descricao || null, inativa.id);
    return res.json({ id: inativa.id });
  }
  const result = db.prepare('INSERT INTO produto_categorias (nome, descricao, ativo) VALUES (?,?,1)').run(nome, descricao || null);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/categorias/:id', (req, res) => {
  const cat = db.prepare('SELECT * FROM produto_categorias WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });
  const nome = String(req.body.nome || '').trim();
  const descricao = String(req.body.descricao || '').trim();
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
  const outro = db.prepare('SELECT id FROM produto_categorias WHERE lower(nome) = lower(?) AND id != ? AND ativo = 1').get(nome, cat.id);
  if (outro) return res.status(400).json({ error: 'Já existe uma categoria com este nome' });
  const txn = db.transaction(() => {
    db.prepare('UPDATE produto_categorias SET nome=?, descricao=? WHERE id=?').run(nome, descricao || null, cat.id);
    if (nome !== cat.nome) {
      db.prepare('UPDATE produtos SET categoria = ? WHERE lower(IFNULL(categoria,\'\')) = lower(?)').run(nome, cat.nome);
    }
  });
  txn();
  res.json({ message: 'Categoria atualizada' });
});

app.delete('/api/categorias/:id', (req, res) => {
  const cat = db.prepare('SELECT * FROM produto_categorias WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });
  const usados = db.prepare('SELECT COUNT(*) as c FROM produtos WHERE ativo = 1 AND lower(IFNULL(categoria,\'\')) = lower(?)').get(cat.nome).c;
  if (usados) return res.status(400).json({ error: `Não é possível excluir: ${usados} produto(s) nesta categoria` });
  db.prepare('UPDATE produto_categorias SET ativo = 0 WHERE id = ?').run(cat.id);
  res.json({ message: 'Categoria removida' });
});

// ============ ESTOQUE (busca de itens) ============
app.get('/api/estoque', (req, res) => {
  const { search = '', page = 1, limit = 15, categoria, situacao, tipo } = req.query;
  let query = `SELECT p.*, f.nome as fornecedor_nome, o.nome as estoque_origem_nome, o.estoque as estoque_origem_qtd
    FROM produtos p
    LEFT JOIN fornecedores f ON p.fornecedor_id = f.id
    LEFT JOIN produtos o ON o.id = p.estoque_origem_id
    WHERE p.ativo = 1`;
  const params = [];
  if (search) {
    query += ' AND (p.nome LIKE ? OR p.codigo LIKE ? OR IFNULL(p.categoria,\'\') LIKE ? OR IFNULL(p.marca,\'\') LIKE ? OR IFNULL(p.referencia,\'\') LIKE ? OR IFNULL(p.localizacao,\'\') LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s, s, s);
  }
  if (categoria) {
    query += ' AND lower(IFNULL(p.categoria,\'\')) = lower(?)';
    params.push(String(categoria).trim());
  }
  if (tipo) {
    query += ' AND lower(IFNULL(p.tipo,\'produto\')) = lower(?)';
    params.push(String(tipo).trim());
  }
  query += ' ORDER BY p.nome ASC';
  const rows = db.prepare(query).all(...params).map(p => {
    const row = enriquecerProduto(p);
    row.situacao = produtosEstoque.situacaoDe(row);
    row.situacao_label = produtosEstoque.rotuloSituacao(row.situacao);
    row.valor_estoque = produtosEstoque.valorEstoque(row);
    return row;
  });
  const filtrados = situacao
    ? rows.filter(p => p.situacao === String(situacao).trim())
    : rows;
  const resumo = produtosEstoque.resumir(filtrados);
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));
  const total = filtrados.length;
  const offset = (pg - 1) * lim;
  res.json({
    data: filtrados.slice(offset, offset + lim),
    total,
    page: pg,
    limit: lim,
    totalPages: Math.ceil(total / lim) || 1,
    resumo
  });
});

// ============ PRODUTOS ============
app.get('/api/produtos', (req, res) => {
  const { search = '', page = 1, limit = 15, categoria } = req.query;
  let query = `SELECT p.*, f.nome as fornecedor_nome, o.nome as estoque_origem_nome, o.estoque as estoque_origem_qtd,
    (SELECT COUNT(*) FROM promocoes pr WHERE pr.produto_id = p.id AND pr.ativo = 1
      AND (pr.data_inicio IS NULL OR date(pr.data_inicio) <= date('now','localtime'))
      AND (pr.data_fim IS NULL OR date(pr.data_fim) >= date('now','localtime'))) as promocao_ativa
    FROM produtos p
    LEFT JOIN fornecedores f ON p.fornecedor_id = f.id
    LEFT JOIN produtos o ON o.id = p.estoque_origem_id
    WHERE p.ativo = 1`;
  const params = [];
  if (search) {
    query += ' AND (p.nome LIKE ? OR p.codigo LIKE ? OR p.categoria LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (categoria) {
    query += ' AND lower(IFNULL(p.categoria,\'\')) = lower(?)';
    params.push(String(categoria).trim());
  }
  query += ' ORDER BY p.nome ASC';
  let countQuery = 'SELECT COUNT(*) as total FROM produtos p WHERE p.ativo = 1';
  const countParams = [];
  if (search) {
    countQuery += ' AND (p.nome LIKE ? OR p.codigo LIKE ? OR p.categoria LIKE ?)';
    const s = `%${search}%`;
    countParams.push(s, s, s);
  }
  if (categoria) {
    countQuery += ' AND lower(IFNULL(p.categoria,\'\')) = lower(?)';
    countParams.push(String(categoria).trim());
  }
  const total = db.prepare(countQuery).get(...countParams)?.total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare(`${query} LIMIT ? OFFSET ?`).all(...params, +limit, offset)
    .map(p => enriquecerProduto(p));
  res.json({ data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) || 1 });
});

function itensComposicao(produtoId) {
  return db.prepare(`
    SELECT c.item_id as id, c.quantidade, p.nome, p.codigo, p.estoque, p.preco_custo,
      p.tipo, p.controla_estoque, p.fracionado, p.estoque_origem_id, p.estoque_consumo,
      o.estoque as estoque_origem_qtd, o.nome as estoque_origem_nome
    FROM produto_composicao c
    JOIN produtos p ON p.id = c.item_id
    LEFT JOIN produtos o ON o.id = p.estoque_origem_id
    WHERE c.produto_id = ?
    ORDER BY c.id
  `).all(produtoId);
}

function estoqueDisponivelProduto(p, origem) {
  const tipo = produtosTipos.normalizarTipo(p?.tipo);
  if (!produtosTipos.controlaEstoque(p, tipo)) return null;
  if (tipo === 'kit') {
    const itens = p.composicao || itensComposicao(p.id);
    return produtosTipos.calcularEstoqueDisponivel({ ...p, tipo, composicao: itens }, {
      itensKit: itens.map(it => ({
        quantidade: it.quantidade,
        produto: it
      }))
    });
  }
  return produtosTipos.calcularEstoqueDisponivel(p, {
    origemEstoque: origem?.estoque != null ? origem.estoque : p.estoque_origem_qtd
  });
}

function enriquecerProduto(p) {
  if (!p) return p;
  const tipo = produtosTipos.normalizarTipo(p.tipo);
  const row = { ...p, tipo };
  if (tipo === 'kit') row.composicao = itensComposicao(p.id);
  row.estoque_disponivel = estoqueDisponivelProduto(row);
  row.controla_estoque = produtosTipos.controlaEstoque(row, tipo) ? 1 : 0;
  row.fracionado = produtosTipos.ehFracionado(row, tipo) ? 1 : 0;
  return row;
}

app.get('/api/produtos/all', (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.nome, p.preco, p.preco_custo, p.estoque, p.codigo, p.categoria,
      p.tipo, p.controla_estoque, p.fracionado, p.unidade,
      p.estoque_origem_id, p.estoque_consumo, o.nome as estoque_origem_nome, o.estoque as estoque_origem_qtd
    FROM produtos p
    LEFT JOIN produtos o ON o.id = p.estoque_origem_id
    WHERE p.ativo = 1 ORDER BY p.nome
  `).all();
  res.json(rows.map(p => enriquecerProduto(p)));
});

app.get('/api/produtos/codigo/:codigo', (req, res) => {
  const row = db.prepare(`
    SELECT p.id, p.nome, p.preco, p.preco_custo, p.estoque, p.estoque_minimo, p.codigo, p.categoria,
      p.tipo, p.controla_estoque, p.fracionado, p.unidade,
      p.estoque_origem_id, p.estoque_consumo, o.nome as estoque_origem_nome, o.estoque as estoque_origem_qtd
    FROM produtos p
    LEFT JOIN produtos o ON o.id = p.estoque_origem_id
    WHERE p.ativo = 1 AND p.codigo = ?
  `).get(req.params.codigo);
  if (!row) return res.status(404).json({ error: 'Produto não encontrado' });
  res.json(enriquecerProduto(row));
});

app.get('/api/produtos/formatos', (req, res) => {
  res.json(produtosIo.FORMATOS);
});

function produtosParaExport() {
  return db.prepare(`SELECT p.nome, p.codigo, p.descricao, p.preco, p.preco_custo, p.estoque, p.estoque_minimo,
      p.categoria, p.ncm, p.cfop, p.unidade, p.origem, p.estoque_consumo,
      p.tipo, p.controla_estoque, p.fracionado, p.marca, p.referencia, p.localizacao,
      o.codigo as estoque_origem_codigo
    FROM produtos p
    LEFT JOIN produtos o ON o.id = p.estoque_origem_id
    WHERE p.ativo = 1 ORDER BY p.nome`).all();
}

function enviarArquivoProdutos(res, out, nome) {
  res.setHeader('Content-Type', out.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${nome}.${out.ext}"`);
  res.send(out.body);
}

app.get('/api/produtos/export', (req, res) => {
  try {
    const out = produtosIo.exportar(produtosParaExport(), req.query.formato || 'csv');
    enviarArquivoProdutos(res, out, 'produtos');
  } catch (err) {
    res.status(400).json({ error: err.message || 'Falha ao exportar' });
  }
});

app.get('/api/produtos/modelo', (req, res) => {
  try {
    const out = produtosIo.modelo(req.query.formato || 'csv');
    enviarArquivoProdutos(res, out, 'modelo-produtos');
  } catch (err) {
    res.status(400).json({ error: err.message || 'Falha ao gerar modelo' });
  }
});

app.post('/api/produtos/import', (req, res) => {
  try {
    const { conteudo, formato, nome, encoding } = req.body || {};
    if (!conteudo) return res.status(400).json({ error: 'Envie um arquivo de produtos' });
    const raw = encoding === 'base64' ? Buffer.from(conteudo, 'base64') : conteudo;
    const parsed = produtosIo.parse(raw, { formato, nomeArquivo: nome });
    if (!parsed.length) return res.status(400).json({ error: 'Nenhum produto encontrado no arquivo' });

    const findCodigo = db.prepare(`SELECT id, estoque_origem_id FROM produtos WHERE codigo IS NOT NULL AND codigo != '' AND codigo = ? ORDER BY ativo DESC, id DESC LIMIT 1`);
    const findNome = db.prepare(`SELECT id FROM produtos WHERE lower(nome) = lower(?) ORDER BY ativo DESC, id DESC LIMIT 1`);
    const ins = db.prepare(`INSERT INTO produtos (nome, codigo, descricao, preco, preco_custo, estoque, estoque_minimo, categoria, ncm, cfop, unidade, origem, estoque_origem_id, estoque_consumo, tipo, controla_estoque, fracionado, marca, referencia, localizacao, ativo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`);
    const upd = db.prepare(`UPDATE produtos SET nome=?, codigo=?, descricao=?, preco=?, preco_custo=?, estoque=?, estoque_minimo=?, categoria=?, ncm=?, cfop=?, unidade=?, origem=?, estoque_origem_id=?, estoque_consumo=?, tipo=?, controla_estoque=?, fracionado=?, marca=?, referencia=?, localizacao=?, ativo=1 WHERE id=?`);
    const mov = db.prepare(`INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, estoque_anterior, estoque_novo, observacao, usuario_id) VALUES (?,?,?,?,?,?,?)`);
    const getEstoque = db.prepare('SELECT estoque FROM produtos WHERE id = ?');

    const erros = [];
    let criados = 0;
    let atualizados = 0;
    const tx = db.transaction((lista) => {
      lista.forEach((item, idx) => {
        const p = produtosIo.normalizar(item);
        const linha = idx + 2;
        if (p.erros.length) {
          erros.push({ linha, nome: p.nome || item.nome || '', codigo: p.codigo || '', erros: p.erros });
          return;
        }
        let row = p.codigo ? findCodigo.get(p.codigo) : null;
        if (!row) row = findNome.get(p.nome);
        let origemId = null;
        let consumo = Number(p.estoque_consumo) || 0;
        if (p.estoque_origem_codigo) {
          const origem = findCodigo.get(p.estoque_origem_codigo);
          if (origem && !origem.estoque_origem_id) origemId = origem.id;
        }
        if (!origemId) consumo = 0;
        const tipo = produtosTipos.normalizarTipo(p.tipo);
        const controla = tipo === 'servico' ? 0 : produtosTipos.flagOn(p.controla_estoque, true);
        const fracionado = tipo === 'pesavel' ? 1 : produtosTipos.flagOn(p.fracionado, false);
        const categoriaNome = garantirCategoria(p.categoria);
        const vals = [p.nome, p.codigo, p.descricao, p.preco, p.preco_custo, p.estoque, p.estoque_minimo, categoriaNome, p.ncm, p.cfop, p.unidade, p.origem, origemId, consumo, tipo, controla, fracionado, p.marca || null, p.referencia || null, p.localizacao || null];
        if (row) {
          const anterior = getEstoque.get(row.id)?.estoque || 0;
          upd.run(...vals, row.id);
          if (anterior !== p.estoque) {
            mov.run(row.id, 'inventario', p.estoque, anterior, p.estoque, 'Importacao de produtos', req.usuario.id);
          }
          atualizados++;
        } else {
          const result = ins.run(...vals);
          mov.run(result.lastInsertRowid, 'entrada', p.estoque, 0, p.estoque, 'Importacao de produtos', req.usuario.id);
          criados++;
        }
      });
    });
    tx(parsed);
    res.json({ total: parsed.length, criados, atualizados, rejeitados: erros.length, erros });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Falha ao importar' });
  }
});

function validarEstoqueOrigem(origemId, consumo, produtoId) {
  const origem = origemId ? parseInt(origemId, 10) : 0;
  const cons = Number(consumo) || 0;
  if (!origem) return { estoque_origem_id: null, estoque_consumo: 0 };
  if (produtoId && origem === Number(produtoId)) {
    throw new Error('A dose não pode ser produzida a partir de si mesma');
  }
  if (cons <= 0) throw new Error('Informe quanto da garrafa cada unidade consome');
  const origemProd = db.prepare('SELECT id, estoque_origem_id, ativo FROM produtos WHERE id = ?').get(origem);
  if (!origemProd || !origemProd.ativo) throw new Error('Produto de origem não encontrado');
  if (origemProd.estoque_origem_id) throw new Error('A origem precisa ser a garrafa, não outra dose');
  return { estoque_origem_id: origem, estoque_consumo: cons };
}

function validarComposicao(itens, produtoId) {
  if (!Array.isArray(itens) || !itens.length) throw new Error('Informe ao menos um item na composição do kit');
  const seen = new Set();
  const out = [];
  for (const raw of itens) {
    const itemId = parseInt(raw.item_id || raw.id, 10);
    const qtd = Number(raw.quantidade);
    if (!itemId || !Number.isFinite(qtd) || qtd <= 0) throw new Error('Composição inválida: informe produto e quantidade');
    if (produtoId && itemId === Number(produtoId)) throw new Error('O kit não pode conter a si mesmo');
    if (seen.has(itemId)) throw new Error('Item repetido na composição');
    const item = db.prepare('SELECT id, tipo, ativo, estoque_origem_id FROM produtos WHERE id = ?').get(itemId);
    if (!item || !item.ativo) throw new Error('Item da composição não encontrado');
    if (produtosTipos.normalizarTipo(item.tipo) === 'kit') throw new Error('Kit não pode conter outro kit');
    seen.add(itemId);
    out.push({ item_id: itemId, quantidade: produtosTipos.arred(qtd) });
  }
  return out;
}

function salvarComposicao(produtoId, itens) {
  db.prepare('DELETE FROM produto_composicao WHERE produto_id = ?').run(produtoId);
  const ins = db.prepare('INSERT INTO produto_composicao (produto_id, item_id, quantidade) VALUES (?,?,?)');
  for (const it of itens) ins.run(produtoId, it.item_id, it.quantidade);
}

function camposProduto(body, produtoId) {
  const tipo = produtosTipos.normalizarTipo(body.tipo);
  const controla = tipo === 'servico' ? 0 : produtosTipos.flagOn(body.controla_estoque, true);
  const fracionado = tipo === 'pesavel' ? 1 : produtosTipos.flagOn(body.fracionado, false);
  const unidadePadrao = tipo === 'pesavel' ? 'KG' : (tipo === 'servico' ? 'UN' : 'UN');
  let origem = { estoque_origem_id: null, estoque_consumo: 0 };
  if (tipo === 'produto') {
    origem = validarEstoqueOrigem(body.estoque_origem_id, body.estoque_consumo, produtoId);
  }
  let composicao = [];
  if (tipo === 'kit') composicao = validarComposicao(body.composicao || [], produtoId);
  return {
    tipo,
    controla_estoque: controla,
    fracionado,
    marca: body.marca || null,
    referencia: body.referencia || null,
    localizacao: body.localizacao || null,
    comissao: Number(body.comissao) || 0,
    tempo_servico: parseInt(body.tempo_servico, 10) || 0,
    garantia_dias: parseInt(body.garantia_dias, 10) || 0,
    unidade: body.unidade || unidadePadrao,
    estoque: tipo === 'servico' || tipo === 'kit' ? 0 : (body.estoque == null || body.estoque === '' ? 0 : Number(body.estoque) || 0),
    estoque_origem_id: origem.estoque_origem_id,
    estoque_consumo: origem.estoque_consumo,
    composicao
  };
}

app.get('/api/produtos/:id', (req, res) => {
  const row = db.prepare(`
    SELECT p.*, o.nome as estoque_origem_nome, o.estoque as estoque_origem_qtd
    FROM produtos p LEFT JOIN produtos o ON o.id = p.estoque_origem_id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Produto não encontrado' });
  res.json(enriquecerProduto(row));
});

app.post('/api/produtos', (req, res) => {
  const { nome, codigo, descricao, preco, preco_custo, foto, estoque_minimo, categoria, fornecedor_id, ncm, cfop, origem } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
  let extra;
  try { extra = camposProduto(req.body); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  const categoriaNome = garantirCategoria(categoria);
  const txn = db.transaction(() => {
    const result = db.prepare(`INSERT INTO produtos
      (nome, codigo, descricao, preco, preco_custo, foto, estoque, estoque_minimo, categoria, fornecedor_id, ncm, cfop, unidade, origem,
       estoque_origem_id, estoque_consumo, tipo, controla_estoque, fracionado, marca, referencia, localizacao, comissao, tempo_servico, garantia_dias)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      nome, codigo, descricao, preco || 0, preco_custo || 0, foto || null, extra.estoque, estoque_minimo || 0, categoriaNome, fornecedor_id || null,
      ncm || '00000000', cfop || '5102', extra.unidade, origem || '0', extra.estoque_origem_id, extra.estoque_consumo,
      extra.tipo, extra.controla_estoque, extra.fracionado, extra.marca, extra.referencia, extra.localizacao,
      extra.comissao, extra.tempo_servico, extra.garantia_dias
    );
    if (extra.tipo === 'kit') salvarComposicao(result.lastInsertRowid, extra.composicao);
    return result.lastInsertRowid;
  });
  try { res.json({ id: txn() }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/produtos/:id', (req, res) => {
  const { nome, codigo, descricao, preco, preco_custo, foto, estoque_minimo, categoria, fornecedor_id, ncm, cfop, origem } = req.body;
  let extra;
  try { extra = camposProduto(req.body, req.params.id); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  const categoriaNome = garantirCategoria(categoria);
  const txn = db.transaction(() => {
    db.prepare(`UPDATE produtos SET nome=?, codigo=?, descricao=?, preco=?, preco_custo=?, foto=?, estoque=?, estoque_minimo=?, categoria=?,
      fornecedor_id=?, ncm=?, cfop=?, unidade=?, origem=?, estoque_origem_id=?, estoque_consumo=?, tipo=?, controla_estoque=?, fracionado=?,
      marca=?, referencia=?, localizacao=?, comissao=?, tempo_servico=?, garantia_dias=? WHERE id=?`).run(
      nome, codigo, descricao, preco || 0, preco_custo || 0, foto || null, extra.estoque, estoque_minimo || 0, categoriaNome, fornecedor_id || null,
      ncm || '00000000', cfop || '5102', extra.unidade, origem || '0', extra.estoque_origem_id, extra.estoque_consumo,
      extra.tipo, extra.controla_estoque, extra.fracionado, extra.marca, extra.referencia, extra.localizacao,
      extra.comissao, extra.tempo_servico, extra.garantia_dias, req.params.id
    );
    if (extra.tipo === 'kit') salvarComposicao(req.params.id, extra.composicao);
    else db.prepare('DELETE FROM produto_composicao WHERE produto_id = ?').run(req.params.id);
  });
  try { txn(); res.json({ message: 'Produto atualizado' }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/produtos/:id', (req, res) => {
  db.prepare('UPDATE produtos SET ativo = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Produto removido' });
});

app.post('/api/produtos/:id/estoque', (req, res) => {
  const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
  const tipoProd = produtosTipos.normalizarTipo(produto.tipo);
  if (tipoProd === 'servico' || tipoProd === 'kit' || !produtosTipos.controlaEstoque(produto, tipoProd)) {
    return res.status(400).json({ error: 'Este item não controla estoque próprio' });
  }
  const { tipo, quantidade, observacao } = req.body;
  const usuario_id = req.usuario.id;
  const qtd = Number(quantidade);
  if (!tipo || !['entrada', 'ajuste', 'inventario'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo inválido' });
  }
  if (!Number.isFinite(qtd) || (tipo === 'entrada' && qtd <= 0) || (tipo === 'ajuste' && qtd === 0) || (tipo === 'inventario' && qtd < 0)) {
    return res.status(400).json({ error: 'Quantidade inválida' });
  }
  const anterior = produto.estoque || 0;
  let novo = anterior;
  if (tipo === 'entrada') novo = anterior + qtd;
  else if (tipo === 'ajuste') novo = Math.max(0, anterior + qtd);
  else novo = Math.max(0, qtd);
  db.prepare('UPDATE produtos SET estoque = ? WHERE id = ?').run(novo, produto.id);
  db.prepare('INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, estoque_anterior, estoque_novo, observacao, usuario_id) VALUES (?,?,?,?,?,?,?)')
    .run(produto.id, tipo, qtd, anterior, novo, observacao || null, usuario_id || null);
  res.json({ estoque: novo, anterior });
});

app.get('/api/produtos/:id/estoque', (req, res) => {
  const rows = db.prepare('SELECT * FROM estoque_movimentos WHERE produto_id = ? ORDER BY criado_em DESC LIMIT 50').all(req.params.id);
  res.json(rows);
});

app.get('/api/promocoes', (req, res) => {
  const rows = db.prepare(`
    SELECT pr.*, p.nome as produto_nome, p.preco as preco_venda
    FROM promocoes pr JOIN produtos p ON pr.produto_id = p.id
    WHERE p.ativo = 1
    ORDER BY pr.ativo DESC, pr.criado_em DESC
  `).all();
  res.json(rows);
});

app.get('/api/produtos/:id/promocoes', (req, res) => {
  const rows = db.prepare('SELECT * FROM promocoes WHERE produto_id = ? ORDER BY ativo DESC, criado_em DESC').all(req.params.id);
  res.json(rows);
});

app.post('/api/produtos/:id/promocoes', (req, res) => {
  const produto = db.prepare('SELECT id FROM produtos WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
  const { descricao, tipo, valor, data_inicio, data_fim } = req.body;
  const result = db.prepare('INSERT INTO promocoes (produto_id, descricao, tipo, valor, data_inicio, data_fim, ativo) VALUES (?,?,?,?,?,?,1)')
    .run(produto.id, descricao || '', tipo || 'percentual', valor || 0, data_inicio || null, data_fim || null);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/promocoes/:id', (req, res) => {
  const { descricao, tipo, valor, data_inicio, data_fim, ativo } = req.body;
  db.prepare('UPDATE promocoes SET descricao=?, tipo=?, valor=?, data_inicio=?, data_fim=?, ativo=? WHERE id=?')
    .run(descricao, tipo, valor, data_inicio || null, data_fim || null, ativo ? 1 : 0, req.params.id);
  res.json({ message: 'Promoção atualizada' });
});

app.delete('/api/promocoes/:id', (req, res) => {
  db.prepare('UPDATE promocoes SET ativo = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Promoção desativada' });
});

// ============ ORDENS DE SERVIÇO ============
app.get('/api/ordens-servico/stats', (req, res) => {
  const abertas = db.prepare("SELECT COUNT(*) as total FROM ordens_servico WHERE status IN ('Aberta','Em andamento')").get();
  const prontas = db.prepare("SELECT COUNT(*) as total FROM ordens_servico WHERE status = 'Pronta para entrega'").get();
  const valor = db.prepare("SELECT COALESCE(SUM(valor_previsto),0) as total FROM ordens_servico WHERE status NOT IN ('Entregue','Cancelada')").get();
  res.json({ abertas: abertas.total, prontas: prontas.total, valorPrevisto: valor.total });
});

app.get('/api/ordens-servico/:id', (req, res) => {
  const row = db.prepare(`
    SELECT os.*, c.nome as cliente_nome FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id WHERE os.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Ordem não encontrada' });
  res.json(row);
});

app.get('/api/ordens-servico', (req, res) => {
  const { search = '', page = 1, limit = 15 } = req.query;
  let query = `SELECT os.*, c.nome as cliente_nome FROM ordens_servico os LEFT JOIN clientes c ON os.cliente_id = c.id WHERE 1=1`;
  const params = [];
  if (search) {
    query += ' AND (c.nome LIKE ? OR os.equipamento LIKE ? OR os.solicitacao LIKE ? OR os.status LIKE ? OR CAST(os.id AS TEXT) LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }
  query += ' ORDER BY os.id DESC';
  const countQ = query.replace(/SELECT os\.\*, c\.nome as cliente_nome/, 'SELECT COUNT(*) as total');
  const total = db.prepare(countQ).get(...params)?.total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare(`${query} LIMIT ? OFFSET ?`).all(...params, +limit, offset);
  res.json({ data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) || 1 });
});

app.post('/api/ordens-servico', (req, res) => {
  const { status, cliente_id, equipamento, solicitacao, valor_previsto, data_prevista, data_final, data_entrega, observacoes } = req.body;
  const result = db.prepare(`INSERT INTO ordens_servico (status, cliente_id, equipamento, solicitacao, valor_previsto, data_prevista, data_final, data_entrega, observacoes) VALUES (?,?,?,?,?,?,?,?,?)`).run(status || 'Aberta', cliente_id, equipamento, solicitacao, valor_previsto || 0, data_prevista, data_final, data_entrega, observacoes);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/ordens-servico/:id', (req, res) => {
  const { status, cliente_id, equipamento, solicitacao, valor_previsto, data_prevista, data_final, data_entrega, observacoes } = req.body;
  db.prepare(`UPDATE ordens_servico SET status=?, cliente_id=?, equipamento=?, solicitacao=?, valor_previsto=?, data_prevista=?, data_final=?, data_entrega=?, observacoes=? WHERE id=?`).run(status, cliente_id, equipamento, solicitacao, valor_previsto, data_prevista, data_final, data_entrega, observacoes, req.params.id);
  res.json({ message: 'Ordem atualizada' });
});

app.delete('/api/ordens-servico/:id', (req, res) => {
  db.prepare('DELETE FROM ordens_servico WHERE id = ?').run(req.params.id);
  res.json({ message: 'Ordem removida' });
});

// ============ USUÁRIOS ============
app.get('/api/usuarios', (req, res) => {
  const { search = '', page = 1, limit = 15 } = req.query;
  let query = 'SELECT id, nome, email, cargo, celular, cpf, tipo_pessoa, ativo, criado_em FROM usuarios WHERE 1=1';
  const params = [];
  if (search) {
    query += ' AND (nome LIKE ? OR email LIKE ? OR cargo LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY nome ASC';
  const countQ = query.replace(/SELECT id, nome, email, cargo, celular, cpf, tipo_pessoa, ativo, criado_em/, 'SELECT COUNT(*) as total');
  const total = db.prepare(countQ).get(...params)?.total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare(`${query} LIMIT ? OFFSET ?`).all(...params, +limit, offset);
  res.json({ data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) || 1 });
});

app.get('/api/usuarios/:id', (req, res) => {
  const row = db.prepare('SELECT id, nome, email, cargo, celular, data_nascimento, cpf, tipo_pessoa, ativo, criado_em FROM usuarios WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json(row);
});

app.post('/api/usuarios', exigirAdmin, (req, res) => {
  const { nome, email, senha, cargo, celular, data_nascimento, cpf, tipo_pessoa } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
  if (String(senha).length < 4 || String(senha).length > 200) {
    return res.status(400).json({ error: 'A senha deve ter entre 4 e 200 caracteres' });
  }
  try {
    const result = db.prepare('INSERT INTO usuarios (nome, email, senha, cargo, celular, data_nascimento, cpf, tipo_pessoa) VALUES (?,?,?,?,?,?,?,?)')
      .run(nome, String(email).trim().toLowerCase(), hashSenha(senha), cargo || 'Vendedor', celular || null, data_nascimento || null, cpf || null, tipo_pessoa || 'PF');
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Email já cadastrado' });
  }
});

app.put('/api/usuarios/:id', exigirAdmin, (req, res) => {
  const { nome, email, senha, cargo, ativo, celular, data_nascimento, cpf, tipo_pessoa } = req.body;
  const alvo = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(req.params.id);
  if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (senha && (String(senha).length < 4 || String(senha).length > 200)) {
    return res.status(400).json({ error: 'A senha deve ter entre 4 e 200 caracteres' });
  }
  const emailNormalizado = String(email || '').trim().toLowerCase();
  if (senha) {
    db.prepare('UPDATE usuarios SET nome=?, email=?, senha=?, cargo=?, ativo=?, celular=?, data_nascimento=?, cpf=?, tipo_pessoa=? WHERE id=?')
      .run(nome, emailNormalizado, hashSenha(senha), cargo, ativo ?? 1, celular || null, data_nascimento || null, cpf || null, tipo_pessoa || 'PF', req.params.id);
  } else {
    db.prepare('UPDATE usuarios SET nome=?, email=?, cargo=?, ativo=?, celular=?, data_nascimento=?, cpf=?, tipo_pessoa=? WHERE id=?')
      .run(nome, emailNormalizado, cargo, ativo ?? 1, celular || null, data_nascimento || null, cpf || null, tipo_pessoa || 'PF', req.params.id);
  }
  res.json({ message: 'Usuário atualizado' });
});

app.delete('/api/usuarios/:id', exigirAdmin, (req, res) => {
  db.prepare('UPDATE usuarios SET ativo = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Usuário desativado' });
});

const PERMISSOES_DISPONIVEIS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'vendas', label: 'Realizar vendas' },
  { key: 'caixa', label: 'Gerenciar caixa' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'produtos', label: 'Produtos' },
  { key: 'categorias', label: 'Categorias de estoque' },
  { key: 'estoque', label: 'Estoque' },
  { key: 'compras', label: 'Pedidos de compras' },
  { key: 'ecommerce', label: 'Loja online / API' },
  { key: 'ordens-servico', label: 'Ordens de servico' },
  { key: 'rh-funcionarios', label: 'R.H. Funcionarios' },
  { key: 'rh-pontos', label: 'R.H. Folhas de ponto' },
  { key: 'rh-grades', label: 'R.H. Grades horarias' },
  { key: 'gerencia-aprovacao-vendas', label: 'Gerencia: Aprovacao Vendas' },
  { key: 'gerencia-compras', label: 'Gerencia: Compras' },
  { key: 'gerencia-fechamento-caixas', label: 'Gerencia: Fechamento Caixas' },
  { key: 'gerencia-inventario', label: 'Gerencia: Inventario' },
  { key: 'gerencia-consulta-estoque', label: 'Gerencia: Consulta Estoque' },
  { key: 'usuarios', label: 'Usuarios' },
  { key: 'fornecedores', label: 'Fornecedores' },
  { key: 'historico-vendas', label: 'Historico de vendas' },
  { key: 'relatorio', label: 'Relatorio geral' },
  { key: 'contador-nfe', label: 'Listar NFe emitidas' },
  { key: 'contador-compras', label: 'Relatorio de Compras' },
  { key: 'contador-xml', label: 'Download XML NFes' },
  { key: 'contador-extrato', label: 'Download extrato' },
  { key: 'contador-sped', label: 'SPED Fiscal' },
  { key: 'backup', label: 'Gerenciar Backup' },
  { key: 'impressoras', label: 'Impressoras adicionadas' },
  { key: 'configuracoes', label: 'Configuracoes' },
  { key: 'manual', label: 'Manual' }
];

app.get('/api/perfis', (req, res) => {
  const rows = db.prepare('SELECT * FROM perfis ORDER BY nome').all().map(p => ({
    ...p,
    permissoes: safeParseJson(p.permissoes)
  }));
  res.json({ data: rows, opcoes: PERMISSOES_DISPONIVEIS });
});

app.get('/api/perfis/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM perfis WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Perfil não encontrado' });
  row.permissoes = safeParseJson(row.permissoes);
  res.json(row);
});

app.put('/api/perfis/:id', exigirAdmin, (req, res) => {
  const { nome, descricao, permissoes } = req.body;
  const atual = db.prepare('SELECT nome FROM perfis WHERE id = ?').get(req.params.id);
  if (!atual) return res.status(404).json({ error: 'Perfil não encontrado' });
  const lista = Array.isArray(permissoes) ? permissoes : [];
  db.prepare('UPDATE perfis SET nome=?, descricao=?, permissoes=? WHERE id=?')
    .run(nome || atual.nome, descricao || '', JSON.stringify(lista), req.params.id);
  if (nome && nome !== atual.nome) {
    db.prepare('UPDATE usuarios SET cargo=? WHERE cargo=?').run(nome, atual.nome);
  }
  res.json({ message: 'Perfil atualizado' });
});

function hojeIso() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function isFiado(forma) {
  const f = String(forma || '').toLowerCase();
  return f.includes('fiado') || f.includes('credi');
}

function taxaOperadora(cfg, forma, bruto) {
  const f = String(forma || '');
  let pct = 0;
  if (f === 'Cartão Crédito' || f === 'Cartão') pct = parseFloat(cfg.taxa_credito || 0);
  else if (f === 'Cartão Débito') pct = parseFloat(cfg.taxa_debito || 0);
  else if (f.toUpperCase() === 'PIX') pct = parseFloat(cfg.taxa_pix || 0);
  const taxa = Math.round(Math.max(0, (Number(bruto) || 0) * (pct / 100)) * 100) / 100;
  const liquido = Math.round(Math.max(0, (Number(bruto) || 0) - taxa) * 100) / 100;
  return { taxa, liquido, pct };
}

function clienteInadimplente(clienteId) {
  if (!clienteId) return { qtd: 0, total: 0, titulos: [] };
  const titulos = db.prepare(`
    SELECT id, descricao, valor, data_vencimento FROM financeiro
    WHERE cliente_id = ? AND tipo = 'Receita' AND status = 'Pendente'
      AND data_vencimento IS NOT NULL AND date(data_vencimento) < date('now','localtime')
    ORDER BY data_vencimento
  `).all(clienteId);
  const total = titulos.reduce((s, t) => s + (Number(t.valor) || 0), 0);
  return { qtd: titulos.length, total, titulos };
}

function inserirFinanceiro(d) {
  const hoje = hojeIso();
  return db.prepare(`INSERT INTO financeiro
    (tipo, categoria, descricao, valor, data_vencimento, data_pagamento, status, cliente_id, fornecedor_id,
     venda_id, caixa_id, origem, valor_bruto, valor_taxa, valor_liquido, forma_pagamento, parcelas)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    d.tipo, d.categoria || '', d.descricao || '', Number(d.valor) || 0,
    d.data_vencimento || hoje, d.data_pagamento || null, d.status || 'Pendente',
    d.cliente_id || null, d.fornecedor_id || null, d.venda_id || null, d.caixa_id || null,
    d.origem || null, Number(d.valor_bruto) || 0, Number(d.valor_taxa) || 0,
    Number(d.valor_liquido != null ? d.valor_liquido : d.valor) || 0,
    d.forma_pagamento || null, d.parcelas || 1
  );
}

function registrarMovimentoEstoque({ produtoId, tipo, quantidade, anterior, novo, observacao, usuarioId }) {
  if (!produtoId) return;
  db.prepare(`INSERT INTO estoque_movimentos
    (produto_id, tipo, quantidade, estoque_anterior, estoque_novo, observacao, usuario_id)
    VALUES (?,?,?,?,?,?,?)`).run(
    produtoId, tipo, Number(quantidade) || 0, Number(anterior) || 0, Number(novo) || 0,
    observacao || null, usuarioId || null
  );
}

function baixarUnidadeEstoque(prod, quantidade, usuarioId, observacao) {
  const consumo = Number(prod.estoque_consumo) || 0;
  const origemId = prod.estoque_origem_id && consumo > 0 ? prod.estoque_origem_id : null;
  const alvoId = origemId || prod.id;
  const qtdBaixa = produtosTipos.arred(origemId ? quantidade * consumo : quantidade);
  const alvo = db.prepare('SELECT estoque FROM produtos WHERE id = ?').get(alvoId);
  const anterior = Number(alvo?.estoque) || 0;
  if (anterior + 1e-9 < qtdBaixa) throw new Error('Estoque insuficiente');
  const novo = produtosTipos.arred(anterior - qtdBaixa);
  db.prepare('UPDATE produtos SET estoque = ? WHERE id = ?').run(novo, alvoId);
  registrarMovimentoEstoque({
    produtoId: alvoId,
    tipo: 'Saída',
    quantidade: qtdBaixa,
    anterior,
    novo,
    observacao,
    usuarioId
  });
  return { estoque_origem_id: origemId, estoque_consumo: origemId ? consumo : 0, quantidade: qtdBaixa };
}

function baixarEstoqueItem(item, quantidade, usuarioId, observacao) {
  const prod = db.prepare('SELECT id, estoque, tipo, controla_estoque, fracionado, estoque_origem_id, estoque_consumo FROM produtos WHERE id = ?').get(item.produto_id);
  if (!prod) throw new Error('Produto não encontrado');
  const tipo = produtosTipos.normalizarTipo(prod.tipo);
  if (!produtosTipos.controlaEstoque(prod, tipo)) {
    return { estoque_origem_id: null, estoque_consumo: 0, tipo, composicao: null };
  }
  if (tipo === 'kit') {
    const itens = itensComposicao(prod.id);
    if (!itens.length) throw new Error('Kit sem composição');
    const snapshot = [];
    for (const it of itens) {
      snapshot.push({ item_id: it.id, quantidade: Number(it.quantidade) || 0 });
      if (!produtosTipos.controlaEstoque(it)) continue;
      const qtd = produtosTipos.arred(quantidade * (Number(it.quantidade) || 0));
      baixarUnidadeEstoque(it, qtd, usuarioId, `${observacao} · kit ${prod.id}`);
    }
    return { estoque_origem_id: null, estoque_consumo: 0, tipo, composicao: JSON.stringify(snapshot) };
  }
  const baixa = baixarUnidadeEstoque(prod, quantidade, usuarioId, observacao);
  return { ...baixa, tipo, composicao: null };
}

function devolverUnidadeEstoque(alvoId, qtdDevolve, usuarioId, observacao) {
  const prod = db.prepare('SELECT estoque FROM produtos WHERE id = ?').get(alvoId);
  const anterior = Number(prod?.estoque) || 0;
  const novo = produtosTipos.arred(anterior + qtdDevolve);
  db.prepare('UPDATE produtos SET estoque = ? WHERE id = ?').run(novo, alvoId);
  registrarMovimentoEstoque({
    produtoId: alvoId,
    tipo: 'Entrada',
    quantidade: qtdDevolve,
    anterior,
    novo,
    observacao,
    usuarioId
  });
}

function devolverEstoqueVenda(itens, usuarioId, observacao) {
  for (const item of itens) {
    if (!item.produto_id) continue;
    const tipo = produtosTipos.normalizarTipo(item.tipo);
    if (tipo === 'servico') continue;
    const atual = db.prepare('SELECT tipo, controla_estoque FROM produtos WHERE id = ?').get(item.produto_id);
    if (atual && tipo !== 'kit' && !produtosTipos.controlaEstoque(atual)) continue;
    const qtdItem = Number(item.quantidade) || 0;
    if (tipo === 'kit') {
      let parts = [];
      try { parts = item.composicao ? JSON.parse(item.composicao) : []; } catch { parts = []; }
      if (!parts.length) parts = itensComposicao(item.produto_id).map(it => ({ item_id: it.id, quantidade: it.quantidade }));
      for (const part of parts) {
        const comp = db.prepare('SELECT id, tipo, controla_estoque, estoque_origem_id, estoque_consumo FROM produtos WHERE id = ?').get(part.item_id);
        if (!comp || !produtosTipos.controlaEstoque(comp)) continue;
        const consumo = Number(comp.estoque_consumo) || 0;
        const origemId = comp.estoque_origem_id && consumo > 0 ? comp.estoque_origem_id : null;
        const alvoId = origemId || comp.id;
        const qtdDevolve = produtosTipos.arred(qtdItem * (Number(part.quantidade) || 0) * (origemId ? consumo : 1));
        devolverUnidadeEstoque(alvoId, qtdDevolve, usuarioId, observacao);
      }
      continue;
    }
    const origemId = item.estoque_origem_id || null;
    const consumo = Number(item.estoque_consumo) || 0;
    const alvoId = origemId && consumo > 0 ? origemId : item.produto_id;
    const qtdDevolve = produtosTipos.arred(origemId && consumo > 0 ? qtdItem * consumo : qtdItem);
    devolverUnidadeEstoque(alvoId, qtdDevolve, usuarioId, observacao);
  }
}

function estornarFinanceiroVenda(vendaId, motivo) {
  const rows = db.prepare("SELECT * FROM financeiro WHERE venda_id = ? AND status != 'Cancelado'").all(vendaId);
  for (const row of rows) {
    if (row.status === 'Pendente') {
      db.prepare("UPDATE financeiro SET status='Cancelado', descricao=? WHERE id=?")
        .run(`${row.descricao || ''} (cancelado)`.trim(), row.id);
    } else {
      inserirFinanceiro({
        tipo: row.tipo === 'Receita' ? 'Despesa' : 'Receita',
        categoria: row.tipo === 'Receita' ? 'Estorno venda' : 'Estorno taxa',
        descricao: motivo || `Estorno ${row.descricao || ''}`.trim(),
        valor: row.valor,
        data_vencimento: hojeIso(),
        data_pagamento: hojeIso(),
        status: 'Pago',
        cliente_id: row.cliente_id,
        venda_id: vendaId,
        origem: 'venda-estorno',
        valor_bruto: row.valor_bruto,
        valor_taxa: row.valor_taxa,
        valor_liquido: row.valor_liquido,
        forma_pagamento: row.forma_pagamento
      });
    }
  }
}

function lancarVendaNoFinanceiro({ vendaId, clienteId, clienteNome, forma, bruto, taxa, liquido, parcelas }) {
  const hoje = hojeIso();
  const fiado = isFiado(forma);
  const nParcelas = Math.max(1, Number(parcelas) || 1);
  if (fiado) {
    const valorParcela = bruto / nParcelas;
    for (let i = 0; i < nParcelas; i++) {
      const venc = new Date();
      venc.setDate(venc.getDate() + (30 * (i + 1)));
      const p = n => String(n).padStart(2, '0');
      const dataVenc = `${venc.getFullYear()}-${p(venc.getMonth() + 1)}-${p(venc.getDate())}`;
      inserirFinanceiro({
        tipo: 'Receita',
        categoria: 'Crediario',
        descricao: nParcelas > 1
          ? `Venda #${vendaId} fiado ${i + 1}/${nParcelas} · ${clienteNome}`
          : `Venda #${vendaId} fiado · ${clienteNome}`,
        valor: Math.round(valorParcela * 100) / 100,
        data_vencimento: dataVenc,
        status: 'Pendente',
        cliente_id: clienteId,
        venda_id: vendaId,
        origem: 'venda',
        valor_bruto: bruto,
        valor_taxa: 0,
        valor_liquido: bruto,
        forma_pagamento: forma,
        parcelas: nParcelas
      });
    }
    return;
  }
  inserirFinanceiro({
    tipo: 'Receita',
    categoria: 'Venda',
    descricao: `Venda #${vendaId} · ${forma} · ${clienteNome}`,
    valor: liquido,
    data_vencimento: hoje,
    data_pagamento: hoje,
    status: 'Pago',
    cliente_id: clienteId || null,
    venda_id: vendaId,
    origem: 'venda',
    valor_bruto: bruto,
    valor_taxa: taxa,
    valor_liquido: liquido,
    forma_pagamento: forma,
    parcelas: nParcelas
  });
  if (taxa > 0) {
    inserirFinanceiro({
      tipo: 'Despesa',
      categoria: 'Taxa operadora',
      descricao: `Taxa ${forma} venda #${vendaId}`,
      valor: taxa,
      data_vencimento: hoje,
      data_pagamento: hoje,
      status: 'Pago',
      venda_id: vendaId,
      origem: 'taxa-operadora',
      valor_bruto: bruto,
      valor_taxa: taxa,
      valor_liquido: taxa,
      forma_pagamento: forma
    });
  }
}

// ============ CAIXA ============
function caixaSessaoDesde() {
  const status = db.prepare('SELECT aberto, aberto_em FROM caixa_status WHERE id = 1').get();
  return status?.aberto === 1 && status.aberto_em ? status.aberto_em : null;
}

app.get('/api/caixa/status', (req, res) => {
  const status = db.prepare('SELECT * FROM caixa_status WHERE id = 1').get();
  const desde = caixaSessaoDesde();
  const params = desde ? [desde] : [];
  const filtro = desde ? 'AND criado_em >= ?' : '';

  const mov = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN tipo='Abertura' THEN valor ELSE 0 END),0) AS abertura,
      COALESCE(SUM(CASE WHEN tipo='Entrada' THEN valor ELSE 0 END),0) AS entradas,
      COALESCE(SUM(CASE WHEN tipo='Saída' THEN valor ELSE 0 END),0) AS saidas,
      COALESCE(SUM(CASE WHEN tipo IN ('Entrada','Venda realizada') AND (forma_pagamento IS NULL OR forma_pagamento='Dinheiro') THEN valor ELSE 0 END),0) AS dinheiro
    FROM caixa WHERE 1=1 ${filtro}
  `).get(...params);

  const vendas = db.prepare(`
    SELECT COALESCE(SUM(total),0) AS total,
           COALESCE(SUM(CASE WHEN forma_pagamento IN ('PIX','Cartão','Cartão Crédito','Cartão Débito') THEN total ELSE 0 END),0) AS cartao_pix,
           COALESCE(SUM(COALESCE(taxa_cartao,0)),0) AS taxas
    FROM vendas WHERE status != 'Cancelada' ${desde ? 'AND criado_em >= ?' : ''}
  `).get(...params);

  const totalCaixa = mov.abertura + mov.dinheiro - mov.saidas;
  res.json({
    ...status,
    aberto: status?.aberto === 1,
    total_caixa: totalCaixa,
    total_vendas: vendas.total,
    cartao_pix: vendas.cartao_pix,
    venda_liquida: vendas.total - vendas.taxas,
    entradas: mov.entradas,
    saidas: mov.saidas,
    saldo: totalCaixa
  });
});

app.post('/api/caixa/abrir', (req, res) => {
  const { valor_inicial } = req.body;
  const usuario_id = req.usuario.id;
  const valor = Number(valor_inicial) || 0;
  const txn = db.transaction(() => {
    const n = db.prepare("SELECT COUNT(*) AS c FROM caixa WHERE tipo = 'Abertura'").get().c + 1;
    const info = db.prepare(`INSERT INTO caixa (tipo, descricao, valor, forma_pagamento, cliente_nome, usuario_id)
      VALUES ('Abertura', ?, ?, NULL, 'Saldo inicial', ?)`)
      .run(`Abertura de caixa ${String(n).padStart(2, '0')}`, valor, usuario_id || null);
    db.prepare("UPDATE caixa_status SET aberto=1, valor_inicial=?, aberto_em=datetime('now','localtime'), fechado_em=NULL, usuario_id=? WHERE id=1")
      .run(valor, usuario_id || null);
    return info.lastInsertRowid;
  });
  const id = txn();
  res.json({ id, message: 'Caixa aberto' });
});

app.post('/api/caixa/fechar', (req, res) => {
  const usuario_id = req.usuario?.id;
  const status = db.prepare('SELECT * FROM caixa_status WHERE id = 1').get();
  const desde = status?.aberto === 1 && status.aberto_em ? status.aberto_em : null;
  const params = desde ? [desde] : [];
  const filtro = desde ? 'AND criado_em >= ?' : '';
  const mov = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN tipo='Abertura' THEN valor ELSE 0 END),0) AS abertura,
      COALESCE(SUM(CASE WHEN tipo='Entrada' THEN valor ELSE 0 END),0) AS entradas,
      COALESCE(SUM(CASE WHEN tipo='Saída' THEN valor ELSE 0 END),0) AS saidas,
      COALESCE(SUM(CASE WHEN tipo='Venda realizada' THEN valor ELSE 0 END),0) AS vendas
    FROM caixa WHERE 1=1 ${filtro}
  `).get(...params);
  const calc = gerenciaMod.calcularFechamento(mov);
  const txn = db.transaction(() => {
    db.prepare("UPDATE caixa_status SET aberto=0, fechado_em=datetime('now','localtime') WHERE id=1").run();
    const info = db.prepare(`INSERT INTO caixa_fechamentos
      (aberto_em, fechado_em, valor_inicial, total_vendas, entradas, saidas, saldo, conferido, usuario_id)
      VALUES (?, datetime('now','localtime'), ?, ?, ?, ?, ?, 0, ?)`).run(
      status?.aberto_em || null, calc.abertura, calc.vendas, calc.entradas, calc.saidas, calc.saldo, usuario_id || null
    );
    return info.lastInsertRowid;
  });
  const id = txn();
  res.json({ message: 'Caixa fechado', fechamento_id: id, ...calc });
});

app.get('/api/caixa/movimentos', (req, res) => {
  const { search = '', page = 1, limit = 15 } = req.query;
  let query = `SELECT c.*, u.nome AS usuario_nome FROM caixa c
    LEFT JOIN usuarios u ON c.usuario_id = u.id WHERE 1=1`;
  const params = [];
  if (search) {
    query += ' AND (c.descricao LIKE ? OR c.cliente_nome LIKE ? OR c.tipo LIKE ? OR c.forma_pagamento LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  query += ' ORDER BY c.criado_em DESC, c.id DESC';
  const countQ = query.replace(/SELECT c\.\*, u\.nome AS usuario_nome/, 'SELECT COUNT(*) AS total');
  const total = db.prepare(countQ).get(...params)?.total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare(`${query} LIMIT ? OFFSET ?`).all(...params, +limit, offset);
  res.json({ data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) || 1 });
});

app.get('/api/caixa/movimentos/:id', (req, res) => {
  const movimento = db.prepare(`
    SELECT c.*, u.nome AS usuario_nome FROM caixa c
    LEFT JOIN usuarios u ON c.usuario_id = u.id WHERE c.id = ?
  `).get(req.params.id);
  if (!movimento) return res.status(404).json({ error: 'Movimento não encontrado' });
  let venda = null;
  if (movimento.venda_id) {
    venda = db.prepare(`
      SELECT v.*, c.nome AS cliente_nome FROM vendas v
      LEFT JOIN clientes c ON v.cliente_id = c.id WHERE v.id = ?
    `).get(movimento.venda_id);
    if (venda) {
      venda.itens = db.prepare(`
        SELECT vi.*, p.nome AS produto_nome FROM venda_itens vi
        LEFT JOIN produtos p ON vi.produto_id = p.id WHERE vi.venda_id = ?
      `).all(movimento.venda_id);
    }
  }
  res.json({ ...movimento, venda });
});

app.post('/api/caixa/movimentos', (req, res) => {
  const { tipo, descricao, valor, forma_pagamento } = req.body;
  const usuario_id = req.usuario.id;
  if (!['Entrada', 'Saída'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
  const status = db.prepare('SELECT aberto FROM caixa_status WHERE id = 1').get();
  if (!status?.aberto) return res.status(400).json({ error: 'Caixa fechado. Abra o caixa para registrar movimentos.' });
  const txn = db.transaction(() => {
    const result = db.prepare('INSERT INTO caixa (tipo, descricao, valor, forma_pagamento, usuario_id) VALUES (?,?,?,?,?)')
      .run(tipo, descricao || tipo, Number(valor) || 0, forma_pagamento || null, usuario_id || null);
    const caixaId = result.lastInsertRowid;
    const hoje = hojeIso();
    const isEntrada = tipo === 'Entrada';
    const fin = inserirFinanceiro({
      tipo: isEntrada ? 'Receita' : 'Despesa',
      categoria: isEntrada ? 'Suprimento' : 'Sangria',
      descricao: descricao || (isEntrada ? 'Suprimento de caixa' : 'Sangria'),
      valor: Number(valor) || 0,
      data_vencimento: hoje,
      data_pagamento: hoje,
      status: 'Pago',
      caixa_id: caixaId,
      origem: isEntrada ? 'suprimento' : 'sangria',
      valor_bruto: Number(valor) || 0,
      valor_liquido: Number(valor) || 0,
      forma_pagamento: forma_pagamento || 'Dinheiro'
    });
    db.prepare('UPDATE caixa SET financeiro_id=? WHERE id=?').run(fin.lastInsertRowid, caixaId);
    return caixaId;
  });
  res.json({ id: txn() });
});

app.put('/api/caixa/movimentos/:id', (req, res) => {
  const movimento = db.prepare('SELECT * FROM caixa WHERE id = ?').get(req.params.id);
  if (!movimento) return res.status(404).json({ error: 'Movimento não encontrado' });
  const { descricao, valor, forma_pagamento, cliente_nome } = req.body;
  const txn = db.transaction(() => {
    db.prepare('UPDATE caixa SET descricao=?, valor=?, forma_pagamento=?, cliente_nome=? WHERE id=?')
      .run(
        descricao ?? movimento.descricao,
        valor != null ? Number(valor) : movimento.valor,
        forma_pagamento ?? movimento.forma_pagamento,
        cliente_nome ?? movimento.cliente_nome,
        req.params.id
      );
    if (movimento.financeiro_id) {
      db.prepare('UPDATE financeiro SET descricao=?, valor=?, valor_bruto=?, valor_liquido=?, forma_pagamento=? WHERE id=?')
        .run(
          descricao ?? movimento.descricao,
          valor != null ? Number(valor) : movimento.valor,
          valor != null ? Number(valor) : movimento.valor,
          valor != null ? Number(valor) : movimento.valor,
          forma_pagamento ?? movimento.forma_pagamento,
          movimento.financeiro_id
        );
    }
  });
  txn();
  res.json({ message: 'Movimento atualizado' });
});

app.delete('/api/caixa/movimentos/:id', (req, res) => {
  const movimento = db.prepare('SELECT * FROM caixa WHERE id = ?').get(req.params.id);
  if (!movimento) return res.status(404).json({ error: 'Movimento não encontrado' });
  const txn = db.transaction(() => {
    if (movimento.venda_id) {
      const venda = db.prepare('SELECT * FROM vendas WHERE id = ?').get(movimento.venda_id);
      if (venda && venda.status !== 'Cancelada') {
        const itens = db.prepare('SELECT * FROM venda_itens WHERE venda_id = ?').all(venda.id);
        devolverEstoqueVenda(itens, req.usuario.id, `Cancelamento venda #${venda.id} (movimento caixa #${movimento.id})`);
        db.prepare("UPDATE vendas SET status='Cancelada' WHERE id=?").run(venda.id);
      }
    }
    if (movimento.financeiro_id) {
      db.prepare('DELETE FROM financeiro WHERE id = ?').run(movimento.financeiro_id);
    } else if (movimento.venda_id) {
      estornarFinanceiroVenda(movimento.venda_id, `Estorno movimento caixa #${movimento.id}`);
    } else {
      db.prepare("DELETE FROM financeiro WHERE caixa_id = ? AND origem IN ('sangria','suprimento')").run(movimento.id);
    }
    db.prepare('DELETE FROM caixa WHERE id = ?').run(req.params.id);
  });
  txn();
  res.json({ message: 'Movimento removido' });
});

app.get('/api/caixa/historico', (req, res) => {
  const data = db.prepare(`
    SELECT date(criado_em) AS dia,
      COALESCE(SUM(CASE WHEN tipo='Abertura' THEN valor ELSE 0 END),0) AS abertura,
      COALESCE(SUM(CASE WHEN tipo='Entrada' THEN valor ELSE 0 END),0) AS entradas,
      COALESCE(SUM(CASE WHEN tipo='Venda realizada' THEN valor ELSE 0 END),0) AS vendas,
      COALESCE(SUM(CASE WHEN tipo='Saída' THEN valor ELSE 0 END),0) AS saidas
    FROM caixa GROUP BY dia ORDER BY dia DESC LIMIT 60
  `).all();
  res.json({ data });
});


// ============ VENDAS ============
function criarVendaInterna({
  cliente_id, itens, desconto, forma_pagamento, valor_recebido, parcelas, usuario_id,
  exigirCaixa = true, origem = 'pdv', ecommerce_pedido_id = null
}) {
  if (exigirCaixa) {
    const status = db.prepare('SELECT aberto FROM caixa_status WHERE id = 1').get();
    if (!status?.aberto) {
      const err = new Error('Caixa fechado. Abra o caixa para realizar vendas.');
      err.status = 400;
      throw err;
    }
  }
  if (!itens?.length) {
    const err = new Error('Adicione itens à venda');
    err.status = 400;
    throw err;
  }
  const fiado = isFiado(forma_pagamento);
  if (fiado && !cliente_id) {
    const err = new Error('Selecione um cliente cadastrado para venda fiado.');
    err.status = 400;
    throw err;
  }
  const cfg = Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor]));
  const clienteNome = cliente_id
    ? (db.prepare('SELECT nome FROM clientes WHERE id = ?').get(cliente_id)?.nome || 'Visitante')
    : 'Visitante';
  const insertVenda = db.prepare(`INSERT INTO vendas (cliente_id, total, desconto, forma_pagamento, usuario_id, valor_recebido, troco, parcelas, taxa_cartao, origem, ecommerce_pedido_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const insertItem = db.prepare('INSERT INTO venda_itens (venda_id, produto_id, descricao, quantidade, preco_unitario, subtotal, os_id, preco_custo, estoque_origem_id, estoque_consumo, tipo, composicao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  const insertCaixa = db.prepare(`INSERT INTO caixa (tipo, descricao, valor, forma_pagamento, cliente_nome, desconto, desconto_percent, venda_id, usuario_id)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const marcarOS = db.prepare("UPDATE ordens_servico SET status='Entregue', data_entrega=datetime('now','localtime') WHERE id=? AND status NOT IN ('Entregue','Cancelada')");

  const txn = db.transaction(() => {
    let subtotal = 0;
    for (const item of itens) {
      subtotal += item.quantidade * item.preco_unitario;
    }
    const desc = desconto || 0;
    const total = Math.max(0, subtotal - desc);
    const op = taxaOperadora(cfg, forma_pagamento, total);
    const taxa = fiado ? 0 : op.taxa;
    const liquido = fiado ? total : op.liquido;
    const recebido = fiado ? 0 : (valor_recebido != null ? Number(valor_recebido) : total);
    const troco = fiado ? 0 : Math.max(0, recebido - total);
    const qtdParcelas = parcelas || 1;
    const venda = insertVenda.run(
      cliente_id || null, total, desc, forma_pagamento, usuario_id, recebido, troco, qtdParcelas, taxa,
      origem || 'pdv', ecommerce_pedido_id || null
    );
    for (const item of itens) {
      const quantidade = Number(item.quantidade) || 1;
      const preco = Number(item.preco_unitario) || 0;
      let custo = Number(item.preco_custo);
      if ((!custo || Number.isNaN(custo)) && item.produto_id) {
        custo = Number(db.prepare('SELECT preco_custo FROM produtos WHERE id = ?').get(item.produto_id)?.preco_custo) || 0;
      }
      let baixa = { estoque_origem_id: null, estoque_consumo: 0, tipo: null, composicao: null };
      if (item.produto_id) {
        baixa = baixarEstoqueItem(item, quantidade, usuario_id, `Venda #${venda.lastInsertRowid}`);
      }
      insertItem.run(venda.lastInsertRowid, item.produto_id || null, item.descricao || null,
        quantidade, preco, quantidade * preco, item.os_id || null, custo || 0,
        baixa.estoque_origem_id, baixa.estoque_consumo, baixa.tipo, baixa.composicao);
      if (item.os_id) {
        const os = db.prepare('SELECT id, status FROM ordens_servico WHERE id = ?').get(item.os_id);
        if (!os) throw new Error(`Ordem de serviço #${item.os_id} não encontrada`);
        if (['Entregue', 'Cancelada'].includes(os.status)) {
          throw new Error(`Ordem de serviço #${item.os_id} não pode ser cobrada`);
        }
        marcarOS.run(item.os_id);
      }
    }
    if (!fiado && exigirCaixa) {
      insertCaixa.run('Venda realizada', origem === 'ecommerce' ? 'Venda loja online' : 'Venda', total, forma_pagamento, clienteNome, desc,
        subtotal > 0 ? (desc / subtotal) * 100 : 0, venda.lastInsertRowid, usuario_id);
    }
    lancarVendaNoFinanceiro({
      vendaId: venda.lastInsertRowid,
      clienteId: cliente_id || null,
      clienteNome,
      forma: forma_pagamento,
      bruto: total,
      taxa,
      liquido,
      parcelas: qtdParcelas
    });
    return { id: venda.lastInsertRowid, total, taxa, liquido };
  });
  return txn();
}

app.post('/api/vendas', async (req, res) => {
  const { cliente_id, itens, desconto, forma_pagamento, valor_recebido, parcelas, emitir_nfce } = req.body;
  try {
    const venda = criarVendaInterna({
      cliente_id, itens, desconto, forma_pagamento, valor_recebido, parcelas,
      usuario_id: req.usuario.id, exigirCaixa: true, origem: 'pdv'
    });
    const nota = await nfce.emitirAposVenda(venda.id, emitir_nfce);
    res.json({
      id: venda.id,
      message: 'Venda realizada',
      nfce: nota ? nfce.resumoPublico(nota) : null
    });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || 'Falha ao finalizar venda' });
  }
});

app.get('/api/vendas', (req, res) => {
  const { search = '', page = 1, limit = 15, cliente_id, status } = req.query;
  let query = `SELECT v.*, c.nome as cliente_nome, u.nome as usuario_nome,
    n.status as nfce_status, n.chave as nfce_chave, n.numero as nfce_numero, n.serie as nfce_serie
    FROM vendas v
    LEFT JOIN clientes c ON v.cliente_id = c.id
    LEFT JOIN usuarios u ON v.usuario_id = u.id
    LEFT JOIN nfce n ON n.id = v.nfce_id WHERE 1=1`;
  const params = [];
  if (cliente_id) { query += ' AND v.cliente_id = ?'; params.push(cliente_id); }
  if (status) { query += ' AND v.status = ?'; params.push(status); }
  if (search) {
    query += ' AND (c.nome LIKE ? OR CAST(v.id AS TEXT) LIKE ? OR v.forma_pagamento LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY v.criado_em DESC, v.id DESC';
  const countQ = query.replace(/SELECT v\.\*, c\.nome as cliente_nome, u\.nome as usuario_nome,[\s\S]*?FROM vendas v/, 'SELECT COUNT(*) as total FROM vendas v');
  const total = db.prepare(countQ).get(...params)?.total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare(`${query} LIMIT ? OFFSET ?`).all(...params, +limit, offset);
  res.json({ data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) || 1 });
});

app.get('/api/vendas/:id', (req, res) => {
  const venda = db.prepare(`
    SELECT v.*, c.nome as cliente_nome, u.nome as usuario_nome FROM vendas v
    LEFT JOIN clientes c ON v.cliente_id = c.id
    LEFT JOIN usuarios u ON v.usuario_id = u.id
    WHERE v.id = ?
  `).get(req.params.id);
  if (!venda) return res.status(404).json({ error: 'Venda não encontrada' });
  const itens = db.prepare(`
    SELECT vi.*, COALESCE(p.nome, vi.descricao) as produto_nome, p.codigo as codigo
    FROM venda_itens vi
    LEFT JOIN produtos p ON vi.produto_id = p.id WHERE vi.venda_id = ?
  `).all(req.params.id);
  const cfgRaw = nfce.loadConfig();
  const cfg = nfce.sanitizar(cfgRaw);
  const nota = nfce.nfceDaVenda(Number(req.params.id));
  let pix = null;
  if (String(venda.forma_pagamento || '').toUpperCase() === 'PIX') {
    try {
      pix = pixMod.gerar(cfgRaw, { valor: venda.total, txid: 'V' + venda.id });
    } catch {}
  }
  res.json({ ...venda, itens, cupom: cfg, nfce: nfce.resumoPublico(nota), pix });
});

app.post('/api/vendas/:id/cancelar', async (req, res) => {
  const venda = db.prepare('SELECT * FROM vendas WHERE id = ?').get(req.params.id);
  if (!venda) return res.status(404).json({ error: 'Venda não encontrada' });
  if (venda.status === 'Cancelada') return res.status(400).json({ error: 'Venda já cancelada' });
  const itens = db.prepare('SELECT * FROM venda_itens WHERE venda_id = ?').all(req.params.id);
  const nota = nfce.nfceDaVenda(Number(req.params.id));
  if (nota && nota.status === 'autorizada') {
    try {
      await nfce.cancelarNfce(Number(req.params.id), req.body?.justificativa || 'Cancelamento da venda no PDV ERP ISAC');
    } catch (err) {
      return res.status(400).json({ error: 'Nao foi possivel cancelar a NFC-e: ' + err.message });
    }
  }
  const txn = db.transaction(() => {
    devolverEstoqueVenda(itens, req.usuario.id, `Cancelamento venda #${req.params.id}`);
    for (const item of itens) {
      if (item.os_id) {
        db.prepare("UPDATE ordens_servico SET status='Pronta para entrega', data_entrega=NULL WHERE id=? AND status='Entregue'").run(item.os_id);
      }
    }
    db.prepare("UPDATE vendas SET status='Cancelada' WHERE id=?").run(req.params.id);
    if (!isFiado(venda.forma_pagamento)) {
      db.prepare('INSERT INTO caixa (tipo, descricao, valor, forma_pagamento, usuario_id) VALUES (?,?,?,?,?)')
        .run('Saída', `Cancelamento venda #${req.params.id}`, venda.total, venda.forma_pagamento, venda.usuario_id);
    }
    estornarFinanceiroVenda(venda.id, `Estorno venda #${venda.id}`);
  });
  txn();
  res.json({ message: 'Venda cancelada' });
});

// ============ ORÇAMENTOS ============
app.get('/api/orcamentos', (req, res) => {
  const { search = '', page = 1, limit = 15 } = req.query;
  let query = `SELECT o.* FROM orcamentos o WHERE 1=1`;
  const params = [];
  if (search) {
    query += ' AND (o.cliente_nome LIKE ? OR CAST(o.id AS TEXT) LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s);
  }
  query += ' ORDER BY o.criado_em DESC, o.id DESC';
  const countQ = query.replace('SELECT o.*', 'SELECT COUNT(*) as total');
  const total = db.prepare(countQ).get(...params)?.total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare(`${query} LIMIT ? OFFSET ?`).all(...params, +limit, offset)
    .map(o => ({ ...o, itens: safeParseJson(o.itens) }));
  res.json({ data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) || 1 });
});

app.get('/api/orcamentos/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Orçamento não encontrado' });
  const cfg = Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor]));
  res.json({ ...row, itens: safeParseJson(row.itens), cupom: cfg });
});

app.post('/api/orcamentos', (req, res) => {
  const { cliente_id, cliente_nome, itens, subtotal, desconto, total, observacao } = req.body;
  const usuario_id = req.usuario.id;
  if (!itens?.length) return res.status(400).json({ error: 'Adicione itens ao orçamento' });
  const result = db.prepare(`INSERT INTO orcamentos (cliente_id, cliente_nome, itens, subtotal, desconto, total, observacao, usuario_id)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    cliente_id || null, cliente_nome || 'Visitante', JSON.stringify(itens),
    subtotal || 0, desconto || 0, total || 0, observacao || null, usuario_id || null
  );
  res.json({ id: result.lastInsertRowid, message: 'Orçamento salvo' });
});

app.delete('/api/orcamentos/:id', (req, res) => {
  db.prepare('DELETE FROM orcamentos WHERE id = ?').run(req.params.id);
  res.json({ message: 'Orçamento removido' });
});

// ============ FINANCEIRO ============
app.get('/api/financeiro/cliente/:id/inadimplencia', (req, res) => {
  res.json(clienteInadimplente(Number(req.params.id)));
});

app.get('/api/financeiro', (req, res) => {
  const { search = '', page = 1, limit = 15, tipo } = req.query;
  let query = `SELECT f.*, c.nome as cliente_nome, fo.nome as fornecedor_nome FROM financeiro f
    LEFT JOIN clientes c ON f.cliente_id = c.id
    LEFT JOIN fornecedores fo ON f.fornecedor_id = fo.id WHERE 1=1`;
  const params = [];
  if (tipo) { query += ' AND f.tipo = ?'; params.push(tipo); }
  if (search) {
    query += ' AND (f.descricao LIKE ? OR f.categoria LIKE ? OR c.nome LIKE ? OR fo.nome LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  query += ' ORDER BY f.data_vencimento DESC, f.id DESC';
  const countQ = query.replace(/SELECT f\.\*, c\.nome as cliente_nome, fo\.nome as fornecedor_nome/, 'SELECT COUNT(*) as total');
  const total = db.prepare(countQ).get(...params)?.total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare(`${query} LIMIT ? OFFSET ?`).all(...params, +limit, offset);
  res.json({ data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) || 1 });
});

app.get('/api/financeiro/stats', (req, res) => {
  const sum = (sql, ...params) => db.prepare(sql).get(...params)?.total || 0;
  const hoje = "date('now','localtime')";
  const aReceber = sum(`SELECT COALESCE(SUM(valor),0) as total FROM financeiro
    WHERE tipo='Receita' AND status='Pendente' AND (data_vencimento IS NULL OR date(data_vencimento) >= ${hoje})`);
  const receberVencido = sum(`SELECT COALESCE(SUM(valor),0) as total FROM financeiro
    WHERE tipo='Receita' AND status='Pendente' AND date(data_vencimento) < ${hoje}`);
  const aPagar = sum(`SELECT COALESCE(SUM(valor),0) as total FROM financeiro
    WHERE tipo='Despesa' AND status='Pendente' AND (data_vencimento IS NULL OR date(data_vencimento) >= ${hoje})`);
  const pagarVencido = sum(`SELECT COALESCE(SUM(valor),0) as total FROM financeiro
    WHERE tipo='Despesa' AND status='Pendente' AND date(data_vencimento) < ${hoje}`);
  const previsao = (dias) => {
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN tipo='Receita' THEN valor ELSE 0 END),0) as entradas,
        COALESCE(SUM(CASE WHEN tipo='Despesa' THEN valor ELSE 0 END),0) as saidas
      FROM financeiro
      WHERE status='Pendente'
        AND date(data_vencimento) >= ${hoje}
        AND date(data_vencimento) <= date('now','localtime','+${dias} days')
    `).get();
    return { entradas: row.entradas, saidas: row.saidas, saldo: row.entradas - row.saidas };
  };
  const qtdPagar = db.prepare("SELECT COUNT(*) as total FROM financeiro WHERE tipo='Despesa'").get().total;
  const qtdReceber = db.prepare("SELECT COUNT(*) as total FROM financeiro WHERE tipo='Receita'").get().total;
  res.json({
    a_receber: aReceber,
    receber_vencido: receberVencido,
    a_pagar: aPagar,
    pagar_vencido: pagarVencido,
    saldo_previsto: (aReceber + receberVencido) - (aPagar + pagarVencido),
    previsao7: previsao(7),
    previsao15: previsao(15),
    previsao30: previsao(30),
    qtd_pagar: qtdPagar,
    qtd_receber: qtdReceber,
    receitas: aReceber + receberVencido,
    despesas: aPagar + pagarVencido,
    pendentes: aReceber + receberVencido + aPagar + pagarVencido,
    saldo: (aReceber + receberVencido) - (aPagar + pagarVencido)
  });
});

app.get('/api/financeiro/:id', (req, res) => {
  const row = db.prepare(`
    SELECT f.*, c.nome as cliente_nome, fo.nome as fornecedor_nome FROM financeiro f
    LEFT JOIN clientes c ON f.cliente_id = c.id
    LEFT JOIN fornecedores fo ON f.fornecedor_id = fo.id
    WHERE f.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Lançamento não encontrado' });
  res.json(row);
});

const TIPOS_FINANCEIRO = new Set(['Receita', 'Despesa']);
const STATUS_FINANCEIRO = new Set(['Pendente', 'Pago', 'Cancelado']);

function dataValida(valor) {
  if (!valor) return null;
  const s = String(valor).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    return null;
  }
  return s;
}

function inteiroOuNulo(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function validarLancamentoFinanceiro(body = {}) {
  const tipo = String(body.tipo || '').trim();
  if (!TIPOS_FINANCEIRO.has(tipo)) {
    const err = new Error('Tipo deve ser Receita ou Despesa');
    err.status = 400;
    throw err;
  }
  const valor = Number(body.valor);
  if (!Number.isFinite(valor) || valor < 0) {
    const err = new Error('Valor invalido');
    err.status = 400;
    throw err;
  }
  const status = String(body.status || 'Pendente').trim();
  if (!STATUS_FINANCEIRO.has(status)) {
    const err = new Error('Status invalido');
    err.status = 400;
    throw err;
  }
  if (body.data_vencimento && !dataValida(body.data_vencimento)) {
    const err = new Error('Data de vencimento invalida');
    err.status = 400;
    throw err;
  }
  if (body.data_pagamento && !dataValida(body.data_pagamento)) {
    const err = new Error('Data de pagamento invalida');
    err.status = 400;
    throw err;
  }
  const vencimento = dataValida(body.data_vencimento) || hojeIso();
  let pagamento = dataValida(body.data_pagamento);
  if (status === 'Pago' && !pagamento) pagamento = hojeIso();
  return {
    tipo,
    categoria: String(body.categoria || '').slice(0, 100),
    descricao: String(body.descricao || '').slice(0, 500),
    valor: Math.round(valor * 100) / 100,
    data_vencimento: vencimento,
    data_pagamento: pagamento,
    status,
    cliente_id: inteiroOuNulo(body.cliente_id),
    fornecedor_id: inteiroOuNulo(body.fornecedor_id)
  };
}

app.post('/api/financeiro', (req, res) => {
  try {
    const d = validarLancamentoFinanceiro(req.body || {});
    const result = db.prepare(`INSERT INTO financeiro
      (tipo, categoria, descricao, valor, data_vencimento, data_pagamento, status, cliente_id, fornecedor_id)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      d.tipo, d.categoria, d.descricao, d.valor, d.data_vencimento, d.data_pagamento,
      d.status, d.cliente_id, d.fornecedor_id
    );
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao salvar lancamento' });
  }
});

app.put('/api/financeiro/:id', (req, res) => {
  try {
    const existe = db.prepare('SELECT id FROM financeiro WHERE id = ?').get(req.params.id);
    if (!existe) return res.status(404).json({ error: 'Lançamento não encontrado' });
    const d = validarLancamentoFinanceiro(req.body || {});
    db.prepare(`UPDATE financeiro SET tipo=?, categoria=?, descricao=?, valor=?, data_vencimento=?,
      data_pagamento=?, status=?, cliente_id=?, fornecedor_id=? WHERE id=?`).run(
      d.tipo, d.categoria, d.descricao, d.valor, d.data_vencimento, d.data_pagamento,
      d.status, d.cliente_id, d.fornecedor_id, req.params.id
    );
    res.json({ message: 'Lançamento atualizado' });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao atualizar lancamento' });
  }
});

app.delete('/api/financeiro/:id', (req, res) => {
  db.prepare('DELETE FROM financeiro WHERE id = ?').run(req.params.id);
  res.json({ message: 'Lançamento removido' });
});

// ============ RELATÓRIO ============
function parseRelatorioPeriodo(query) {
  const periodo = query.periodo || 'mes';
  let from = query.de;
  let to = query.ate;
  if (!from || !to) {
    to = db.prepare("SELECT date('now','localtime') as d").get().d;
    if (periodo === 'hoje') from = to;
    else if (periodo === '7dias') from = db.prepare("SELECT date('now','localtime','-6 days') as d").get().d;
    else if (periodo === '30dias') from = db.prepare("SELECT date('now','localtime','-29 days') as d").get().d;
    else if (periodo === 'ano') from = db.prepare("SELECT date('now','localtime','start of year') as d").get().d;
    else from = db.prepare("SELECT date('now','localtime','start of month') as d").get().d;
  }
  return { from, to, periodo };
}

function eachDate(from, to) {
  const days = [];
  let d = from;
  let guard = 0;
  while (d <= to && guard < 400) {
    days.push(d);
    d = db.prepare('SELECT date(?, \'+1 day\') as d').get(d).d;
    guard += 1;
  }
  return days;
}

app.get('/api/relatorio', (req, res) => {
  const { from, to, periodo } = parseRelatorioPeriodo(req.query);
  const vendaFiltro = "date(v.criado_em) >= date(?) AND date(v.criado_em) <= date(?) AND IFNULL(v.status,'') != 'Cancelada'";
  const params = [from, to];

  const vendasAgg = db.prepare(`
    SELECT COUNT(*) as qtd, COALESCE(SUM(total),0) as receita, COALESCE(SUM(desconto),0) as desconto
    FROM vendas v WHERE ${vendaFiltro}
  `).get(...params);

  const itensAgg = db.prepare(`
    SELECT COALESCE(SUM(vi.quantidade),0) as itens,
           COALESCE(SUM(vi.quantidade * COALESCE(p.preco_custo,0)),0) as custo
    FROM venda_itens vi
    JOIN vendas v ON vi.venda_id = v.id
    LEFT JOIN produtos p ON vi.produto_id = p.id
    WHERE ${vendaFiltro}
  `).get(...params);

  const lucro = (vendasAgg.receita || 0) - (itensAgg.custo || 0);
  const ticketMedio = vendasAgg.qtd ? vendasAgg.receita / vendasAgg.qtd : 0;

  const crediarioAberto = db.prepare(`
    SELECT COALESCE(SUM(valor),0) as total FROM financeiro
    WHERE tipo='Receita' AND status='Pendente'
      AND date(data_vencimento) >= date(?) AND date(data_vencimento) <= date(?)
  `).get(from, to).total;
  const crediarioVencido = db.prepare(`
    SELECT COALESCE(SUM(valor),0) as total FROM financeiro
    WHERE tipo='Receita' AND status='Pendente'
      AND date(data_vencimento) >= date(?) AND date(data_vencimento) <= date(?)
      AND date(data_vencimento) < date('now','localtime')
  `).get(from, to).total;

  const estoque = db.prepare(`
    SELECT COALESCE(SUM(
             CASE WHEN p.estoque_origem_id IS NOT NULL AND IFNULL(p.estoque_consumo,0) > 0 THEN 0
             ELSE p.estoque * COALESCE(p.preco,0) END
           ),0) as valor,
            SUM(CASE WHEN IFNULL(p.tipo,'produto') NOT IN ('servico','kit') AND IFNULL(p.controla_estoque,1)=1 AND (
             CASE WHEN p.estoque_origem_id IS NOT NULL AND IFNULL(p.estoque_consumo,0) > 0
               THEN CAST((IFNULL(o.estoque,0) / p.estoque_consumo) AS INTEGER)
               ELSE p.estoque END
           ) <= IFNULL(p.estoque_minimo,0) THEN 1 ELSE 0 END) as alertas
    FROM produtos p
    LEFT JOIN produtos o ON o.id = p.estoque_origem_id
    WHERE p.ativo = 1
  `).get();

  const caixaMov = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN tipo='Entrada' THEN valor ELSE 0 END),0) as suprimentos,
      COALESCE(SUM(CASE WHEN tipo='Saída' THEN valor ELSE 0 END),0) as sangrias
    FROM caixa
    WHERE date(criado_em) >= date(?) AND date(criado_em) <= date(?)
  `).get(from, to);

  const osAbertas = db.prepare("SELECT COUNT(*) as total FROM ordens_servico WHERE status IN ('Aberta','Em andamento')").get().total;
  const osFinalizadas = db.prepare(`
    SELECT COUNT(*) as total FROM ordens_servico
    WHERE status IN ('Entregue','Pronta para entrega')
      AND date(COALESCE(data_final, data_entrega, criado_em)) >= date(?)
      AND date(COALESCE(data_final, data_entrega, criado_em)) <= date(?)
  `).get(from, to).total;

  const porDiaRows = db.prepare(`
    SELECT date(v.criado_em) as dia,
           COALESCE(SUM(v.total),0) as receita,
           COALESCE(SUM((
             SELECT COALESCE(SUM(vi.quantidade * COALESCE(p.preco_custo,0)),0)
             FROM venda_itens vi
             LEFT JOIN produtos p ON vi.produto_id = p.id
             WHERE vi.venda_id = v.id
           )),0) as custo
    FROM vendas v
    WHERE ${vendaFiltro}
    GROUP BY dia
    ORDER BY dia
  `).all(...params);
  const porDiaMap = Object.fromEntries(porDiaRows.map(r => [r.dia, r]));
  const porDia = eachDate(from, to).map(dia => {
    const row = porDiaMap[dia] || { receita: 0, custo: 0 };
    return { dia, receita: row.receita || 0, lucro: (row.receita || 0) - (row.custo || 0) };
  });

  const formasPagamento = db.prepare(`
    SELECT COALESCE(NULLIF(forma_pagamento,''), 'Outros') as forma,
           COALESCE(SUM(total),0) as total,
           COUNT(*) as qtd
    FROM vendas v
    WHERE ${vendaFiltro}
    GROUP BY forma
    ORDER BY total DESC
  `).all(...params);

  const produtosMaisVendidos = db.prepare(`
    SELECT COALESCE(p.nome, vi.descricao, 'Item') as nome,
           SUM(vi.quantidade) as qtd,
           SUM(vi.subtotal) as total
    FROM venda_itens vi
    JOIN vendas v ON vi.venda_id = v.id
    LEFT JOIN produtos p ON vi.produto_id = p.id
    WHERE ${vendaFiltro}
    GROUP BY nome ORDER BY qtd DESC LIMIT 8
  `).all(...params);

  const clientesTop = db.prepare(`
    SELECT COALESCE(c.nome, 'Visitante') as nome, COUNT(v.id) as qtd, SUM(v.total) as total
    FROM vendas v
    LEFT JOIN clientes c ON v.cliente_id = c.id
    WHERE ${vendaFiltro}
    GROUP BY nome ORDER BY total DESC LIMIT 8
  `).all(...params);

  const financeiroResumo = db.prepare(`
    SELECT tipo, status, SUM(valor) as total FROM financeiro GROUP BY tipo, status
  `).all();
  const totalVendas = { qtd: vendasAgg.qtd, total: vendasAgg.receita };
  const vendasPorMes = db.prepare(`
    SELECT strftime('%Y-%m', criado_em) as mes, COUNT(*) as qtd, SUM(total) as total
    FROM vendas WHERE IFNULL(status,'') != 'Cancelada'
    GROUP BY mes ORDER BY mes DESC LIMIT 12
  `).all();

  res.json({
    periodo, de: from, ate: to,
    receita: vendasAgg.receita || 0,
    vendas_ativas: vendasAgg.qtd || 0,
    lucro,
    ticket_medio: ticketMedio,
    itens_vendidos: itensAgg.itens || 0,
    crediario_aberto: crediarioAberto || 0,
    crediario_vencido: crediarioVencido || 0,
    estoque_valor: estoque.valor || 0,
    estoque_alertas: estoque.alertas || 0,
    suprimentos: caixaMov.suprimentos || 0,
    sangrias: caixaMov.sangrias || 0,
    ordens_abertas: osAbertas || 0,
    ordens_finalizadas: osFinalizadas || 0,
    alertas: estoque.alertas || 0,
    porDia,
    formasPagamento,
    produtosMaisVendidos,
    clientesTop,
    financeiroResumo,
    totalVendas,
    vendasPorMes
  });
});

const IMPRESSORA_NOMES = ['Nenhum', 'Generica', 'EPSON TM-T20', 'Bematech MP-4200', 'Elgin i9', 'Daruma DR800', 'HP DeskJet', 'Canon PIXMA', 'Brother HL'];
const IMPRESSORA_TIPOS = ['Nenhum', 'Wi-Fi', 'Bluetooth', 'USB', 'Rede'];
const IMPRESSORA_MODOS = ['Nenhum', 'Termica', 'Jato de tinta', 'Laser'];
const IMPRESSORA_LARGURAS = ['58mm', '80mm', 'A4'];
const IMPRESSORA_PORTAS = ['Nenhum', 'COM1', 'COM2', 'COM3', 'USB001', 'LPT1', 'TCP'];

function impressoraPayload(body) {
  const d = body || {};
  const nome = String(d.nome || '').trim();
  const tipo = IMPRESSORA_TIPOS.includes(d.tipo) ? d.tipo : 'Nenhum';
  const modo = IMPRESSORA_MODOS.includes(d.modo) ? d.modo : 'Nenhum';
  const largura = IMPRESSORA_LARGURAS.includes(d.largura) ? d.largura : '58mm';
  const escala = Math.min(200, Math.max(50, parseInt(d.escala, 10) || 100));
  const barras = d.barras === 0 || d.barras === '0' || d.barras === false ? 0 : 1;
  const porta = String(d.porta || 'Nenhum').trim() || 'Nenhum';
  const ativa = d.ativa === 0 || d.ativa === '0' || d.ativa === false ? 0 : 1;
  const envio = tipo === 'Nenhum' ? '' : tipo;
  return { nome, tipo, modo, envio, largura, escala, barras, porta, ativa };
}

app.get('/api/impressoras/opcoes', (req, res) => {
  res.json({
    nomes: IMPRESSORA_NOMES,
    tipos: IMPRESSORA_TIPOS,
    modos: IMPRESSORA_MODOS,
    larguras: IMPRESSORA_LARGURAS,
    portas: IMPRESSORA_PORTAS
  });
});

app.get('/api/impressoras/ativa', (req, res) => {
  const row = db.prepare('SELECT * FROM impressoras WHERE ativa = 1 ORDER BY id DESC LIMIT 1').get();
  res.json(row || null);
});

app.get('/api/impressoras', (req, res) => {
  const { search = '', page = 1, limit = 15 } = req.query;
  let query = 'SELECT * FROM impressoras WHERE 1=1';
  const params = [];
  if (search) {
    query += ' AND (nome LIKE ? OR tipo LIKE ? OR modo LIKE ? OR largura LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  query += ' ORDER BY id DESC';
  const countQ = query.replace('SELECT *', 'SELECT COUNT(*) as total');
  const total = db.prepare(countQ).get(...params)?.total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare(`${query} LIMIT ? OFFSET ?`).all(...params, +limit, offset);
  res.json({ data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) || 1 });
});

app.get('/api/impressoras/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM impressoras WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Impressora nao encontrada' });
  res.json(row);
});

app.post('/api/impressoras', (req, res) => {
  const p = impressoraPayload(req.body);
  if (!p.nome || p.nome === 'Nenhum') return res.status(400).json({ error: 'Selecione a impressora' });
  if (p.ativa) db.prepare('UPDATE impressoras SET ativa = 0').run();
  const result = db.prepare(`INSERT INTO impressoras (nome, tipo, modo, envio, largura, escala, barras, porta, ativa)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(p.nome, p.tipo, p.modo, p.envio, p.largura, p.escala, p.barras, p.porta, p.ativa);
  res.json({ id: result.lastInsertRowid, message: 'Impressora salva' });
});

app.put('/api/impressoras/:id', (req, res) => {
  const atual = db.prepare('SELECT id FROM impressoras WHERE id = ?').get(req.params.id);
  if (!atual) return res.status(404).json({ error: 'Impressora nao encontrada' });
  const p = impressoraPayload(req.body);
  if (!p.nome || p.nome === 'Nenhum') return res.status(400).json({ error: 'Selecione a impressora' });
  if (p.ativa) db.prepare('UPDATE impressoras SET ativa = 0 WHERE id != ?').run(req.params.id);
  db.prepare(`UPDATE impressoras SET nome=?, tipo=?, modo=?, envio=?, largura=?, escala=?, barras=?, porta=?, ativa=? WHERE id=?`)
    .run(p.nome, p.tipo, p.modo, p.envio, p.largura, p.escala, p.barras, p.porta, p.ativa, req.params.id);
  res.json({ message: 'Impressora atualizada' });
});

app.delete('/api/impressoras/:id', (req, res) => {
  db.prepare('DELETE FROM impressoras WHERE id = ?').run(req.params.id);
  res.json({ message: 'Impressora excluida' });
});

function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(2)} MB`;
}

app.get('/api/backups/status', (req, res) => {
  try {
    res.json(backupMod.status());
  } catch (err) {
    res.status(500).json({ error: err.message || 'Falha ao ler status' });
  }
});

app.get('/api/backups', (req, res) => {
  try {
    const { search, page, limit } = req.query;
    const result = backupMod.listar({ search, page, limit });
    result.data = result.data.map(r => ({ ...r, tamanho_fmt: formatBytes(r.tamanho) }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Falha ao listar backups' });
  }
});

app.post('/api/backups', async (req, res) => {
  try {
    const item = await backupMod.criar((req.body || {}).tipo);
    res.json({ ...item, tamanho_fmt: formatBytes(item.tamanho), message: 'Backup realizado' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Falha ao criar backup' });
  }
});

app.post('/api/backups/verificar-atualizacao', async (req, res) => {
  try {
    const r = await backupMod.verificarAtualizacao();
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Falha ao verificar atualizacao' });
  }
});

app.post('/api/backups/restaurar-arquivo', async (req, res) => {
  try {
    const { senha, conteudo, nome, encoding } = req.body || {};
    const admin = db.prepare('SELECT * FROM usuarios WHERE id = ? AND ativo = 1').get(req.usuario.id);
    if (!admin || admin.cargo !== 'Administrador') {
      return res.status(403).json({ error: 'Somente o administrador pode restaurar backup' });
    }
    if (!senha) return res.status(400).json({ error: 'Informe a senha do administrador' });
    if (!verificarSenha(senha, admin.senha)) return res.status(401).json({ error: 'Senha invalida' });
    if (!conteudo) return res.status(400).json({ error: 'Envie um arquivo .zip ou .db' });
    const raw = encoding === 'base64' ? Buffer.from(conteudo, 'base64') : Buffer.from(conteudo);
    await backupMod.restaurar(raw, nome);
    res.json({ message: 'Backup restaurado. Recarregue o sistema.' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Falha ao restaurar backup' });
  }
});

app.get('/api/backups/:id/download', (req, res) => {
  try {
    const item = backupMod.obter(req.params.id);
    if (!item) return res.status(404).json({ error: 'Backup nao encontrado' });
    if (!item.existe) return res.status(404).json({ error: 'Arquivo do backup nao esta no disco' });
    res.setHeader('Content-Type', item.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${item.nome}"`);
    res.sendFile(item.path);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Falha ao baixar backup' });
  }
});

app.post('/api/backups/:id/restaurar', async (req, res) => {
  try {
    const { senha } = req.body || {};
    const admin = db.prepare('SELECT * FROM usuarios WHERE id = ? AND ativo = 1').get(req.usuario.id);
    if (!admin || admin.cargo !== 'Administrador') {
      return res.status(403).json({ error: 'Somente o administrador pode restaurar backup' });
    }
    if (!senha) return res.status(400).json({ error: 'Informe a senha do administrador' });
    if (!verificarSenha(senha, admin.senha)) return res.status(401).json({ error: 'Senha invalida' });
    await backupMod.restaurarPorId(req.params.id);
    res.json({ message: 'Backup restaurado. Recarregue o sistema.' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Falha ao restaurar backup' });
  }
});

app.delete('/api/backups/:id', (req, res) => {
  try {
    backupMod.excluir(req.params.id);
    res.json({ message: 'Backup excluido' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Falha ao excluir backup' });
  }
});

// ============ CONTADOR ============
function sendAnexo(res, nome, body, tipo) {
  res.setHeader('Content-Type', tipo);
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  res.send(body);
}

// ============ DRE ============
app.get('/api/dre', (req, res) => {
  try { res.json(dre.gerarDre(req.query)); }
  catch (err) { res.status(400).json({ error: err.message || 'Falha ao gerar DRE' }); }
});

app.get('/api/dre.txt', (req, res) => {
  try {
    const d = dre.dreTxt(req.query);
    sendAnexo(res, d.nome, d.texto, 'text/plain; charset=utf-8');
  } catch (err) { res.status(400).json({ error: err.message || 'Falha ao gerar DRE' }); }
});

app.get('/api/dre.csv', (req, res) => {
  try {
    const d = dre.dreCsv(req.query);
    sendAnexo(res, d.nome, d.texto, 'text/csv; charset=utf-8');
  } catch (err) { res.status(400).json({ error: err.message || 'Falha ao gerar DRE CSV' }); }
});

app.get('/api/contador/nfe', (req, res) => {
  try { res.json(contador.listarNfe(req.query)); }
  catch (err) { res.status(400).json({ error: err.message || 'Falha ao listar NFe' }); }
});

app.get('/api/contador/nfe/xml.zip', (req, res) => {
  try {
    const z = contador.zipXmlNfe(req.query);
    sendAnexo(res, z.nome, z.buf, 'application/zip');
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Falha ao gerar ZIP de XMLs' });
  }
});

app.get('/api/contador/compras', (req, res) => {
  try { res.json(contador.listarCompras(req.query)); }
  catch (err) { res.status(400).json({ error: err.message || 'Falha no relatorio de compras' }); }
});

app.get('/api/contador/compras.csv', (req, res) => {
  try {
    const c = contador.comprasCsv(req.query);
    sendAnexo(res, c.nome, c.texto, 'text/csv; charset=utf-8');
  } catch (err) { res.status(400).json({ error: err.message || 'Falha ao exportar compras' }); }
});

app.get('/api/contador/extrato', (req, res) => {
  try { res.json(contador.montarExtrato(req.query)); }
  catch (err) { res.status(400).json({ error: err.message || 'Falha ao montar extrato' }); }
});

app.get('/api/contador/extrato.txt', (req, res) => {
  try {
    const e = contador.extratoTxt(req.query);
    sendAnexo(res, e.nome, e.texto, 'text/plain; charset=utf-8');
  } catch (err) { res.status(400).json({ error: err.message || 'Falha ao gerar extrato' }); }
});

app.get('/api/contador/extrato.csv', (req, res) => {
  try {
    const e = contador.extratoCsv(req.query);
    sendAnexo(res, e.nome, e.texto, 'text/csv; charset=utf-8');
  } catch (err) { res.status(400).json({ error: err.message || 'Falha ao gerar extrato CSV' }); }
});

app.get('/api/contador/sped', (req, res) => {
  try { res.json(contador.spedPreview(req.query)); }
  catch (err) { res.status(400).json({ error: err.message || 'Falha ao gerar SPED' }); }
});

app.get('/api/contador/sped.txt', (req, res) => {
  try {
    const s = contador.gerarSped(req.query);
    sendAnexo(res, s.nome, s.texto, 'text/plain; charset=utf-8');
  } catch (err) { res.status(400).json({ error: err.message || 'Falha ao gerar SPED Fiscal' }); }
});

const assistenteRag = require('./assistente/rag');

app.get('/api/assistente/modulos', (req, res) => {
  res.json({ data: assistenteRag.listarModulos() });
});

app.post('/api/assistente', async (req, res) => {
  try {
    const { pergunta, pagina } = req.body || {};
    const resposta = await assistenteRag.perguntar(pergunta, pagina);
    res.json(resposta);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Falha no assistente' });
  }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Rota não encontrada' });
  }
  if (req.path === '/loja' || req.path.startsWith('/loja/')) {
    return res.sendFile(path.join(__dirname, 'public', 'loja.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Erro interno' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ERP ISAC rodando em http://localhost:${PORT}`);
});
