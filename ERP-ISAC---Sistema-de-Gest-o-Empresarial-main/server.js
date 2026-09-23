const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
}));

function paginate(query, params, page = 1, limit = 15, search = '') {
  const offset = (page - 1) * limit;
  let countQuery = query.replace(/SELECT[\s\S]*?FROM/i, 'SELECT COUNT(*) as total FROM');
  const countParams = [...params];
  if (search) {
    // count uses same params minus limit/offset
  }
  const total = db.prepare(countQuery).get(...countParams)?.total || 0;
  const rows = db.prepare(`${query} LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
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
      'dashboard', 'vendas', 'caixa', 'financeiro', 'clientes', 'produtos',
      'ordens-servico', 'usuarios', 'fornecedores', 'historico-vendas',
      'relatorio', 'configuracoes', 'manual'
    ];
  }
  return ['dashboard', 'manual'];
}

app.post('/api/auth/login', (req, res) => {
  const { email, senha } = req.body;
  const user = db.prepare('SELECT id, nome, email, cargo FROM usuarios WHERE email = ? AND senha = ? AND ativo = 1').get(email, senha);
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
  user.permissoes = permissoesDoCargo(user.cargo);
  res.json(user);
});

// ============ DASHBOARD ============
app.get('/api/dashboard', (req, res) => {
  const vendasHoje = db.prepare("SELECT COALESCE(SUM(total),0) as total FROM vendas WHERE date(criado_em) = date('now','localtime')").get();
  const vendasMes = db.prepare("SELECT COALESCE(SUM(total),0) as total FROM vendas WHERE strftime('%Y-%m', criado_em) = strftime('%Y-%m', 'now','localtime')").get();
  const totalClientes = db.prepare('SELECT COUNT(*) as total FROM clientes WHERE ativo = 1').get();
  const totalProdutos = db.prepare('SELECT COUNT(*) as total FROM produtos WHERE ativo = 1').get();
  const estoqueBaixo = db.prepare('SELECT COUNT(*) as total FROM produtos WHERE estoque <= estoque_minimo AND ativo = 1').get();
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
  const estoque = db.prepare('SELECT id, nome, estoque, estoque_minimo FROM produtos WHERE ativo=1 AND estoque <= estoque_minimo LIMIT 10').all();
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
  const rows = db.prepare('SELECT chave, valor FROM config').all();
  const cfg = {};
  rows.forEach(r => { cfg[r.chave] = r.valor; });
  res.json(cfg);
});

app.put('/api/config', (req, res) => {
  const stmt = db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor');
  const txn = db.transaction((body) => {
    for (const [chave, valor] of Object.entries(body)) {
      stmt.run(chave, String(valor ?? ''));
    }
  });
  txn(req.body || {});
  res.json({ message: 'Configuração salva' });
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
  res.json(db.prepare('SELECT id, nome FROM clientes WHERE ativo = 1 ORDER BY nome').all());
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

// ============ PRODUTOS ============
app.get('/api/produtos', (req, res) => {
  const { search = '', page = 1, limit = 15 } = req.query;
  let query = `SELECT p.*, f.nome as fornecedor_nome,
    (SELECT COUNT(*) FROM promocoes pr WHERE pr.produto_id = p.id AND pr.ativo = 1
      AND (pr.data_inicio IS NULL OR date(pr.data_inicio) <= date('now','localtime'))
      AND (pr.data_fim IS NULL OR date(pr.data_fim) >= date('now','localtime'))) as promocao_ativa
    FROM produtos p LEFT JOIN fornecedores f ON p.fornecedor_id = f.id WHERE p.ativo = 1`;
  const params = [];
  if (search) {
    query += ' AND (p.nome LIKE ? OR p.codigo LIKE ? OR p.categoria LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY p.nome ASC';
  let countQuery = 'SELECT COUNT(*) as total FROM produtos p WHERE p.ativo = 1';
  if (search) countQuery += ' AND (p.nome LIKE ? OR p.codigo LIKE ? OR p.categoria LIKE ?)';
  const total = db.prepare(countQuery).get(...params)?.total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare(`${query} LIMIT ? OFFSET ?`).all(...params, +limit, offset);
  res.json({ data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) || 1 });
});

app.get('/api/produtos/all', (req, res) => {
  res.json(db.prepare('SELECT id, nome, preco, preco_custo, estoque, codigo, categoria FROM produtos WHERE ativo = 1 ORDER BY nome').all());
});

app.get('/api/produtos/codigo/:codigo', (req, res) => {
  const row = db.prepare('SELECT id, nome, preco, estoque, estoque_minimo, codigo, categoria FROM produtos WHERE ativo = 1 AND codigo = ?').get(req.params.codigo);
  if (!row) return res.status(404).json({ error: 'Produto não encontrado' });
  res.json(row);
});

app.get('/api/produtos/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Produto não encontrado' });
  res.json(row);
});

app.post('/api/produtos', (req, res) => {
  const { nome, codigo, descricao, preco, preco_custo, foto, estoque, estoque_minimo, categoria, fornecedor_id } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
  const result = db.prepare('INSERT INTO produtos (nome, codigo, descricao, preco, preco_custo, foto, estoque, estoque_minimo, categoria, fornecedor_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(nome, codigo, descricao, preco || 0, preco_custo || 0, foto || null, estoque || 0, estoque_minimo || 0, categoria, fornecedor_id || null);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/produtos/:id', (req, res) => {
  const { nome, codigo, descricao, preco, preco_custo, foto, estoque, estoque_minimo, categoria, fornecedor_id } = req.body;
  db.prepare('UPDATE produtos SET nome=?, codigo=?, descricao=?, preco=?, preco_custo=?, foto=?, estoque=?, estoque_minimo=?, categoria=?, fornecedor_id=? WHERE id=?').run(nome, codigo, descricao, preco || 0, preco_custo || 0, foto || null, estoque || 0, estoque_minimo || 0, categoria, fornecedor_id || null, req.params.id);
  res.json({ message: 'Produto atualizado' });
});

app.delete('/api/produtos/:id', (req, res) => {
  db.prepare('UPDATE produtos SET ativo = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Produto removido' });
});

app.post('/api/produtos/:id/estoque', (req, res) => {
  const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
  const { tipo, quantidade, observacao, usuario_id } = req.body;
  const qtd = parseInt(quantidade, 10);
  if (!tipo || !['entrada', 'ajuste', 'inventario'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo inválido' });
  }
  if (isNaN(qtd) || (tipo === 'entrada' && qtd <= 0) || (tipo === 'ajuste' && qtd === 0) || (tipo === 'inventario' && qtd < 0)) {
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

app.post('/api/usuarios', (req, res) => {
  const { nome, email, senha, cargo, celular, data_nascimento, cpf, tipo_pessoa } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
  try {
    const result = db.prepare('INSERT INTO usuarios (nome, email, senha, cargo, celular, data_nascimento, cpf, tipo_pessoa) VALUES (?,?,?,?,?,?,?,?)')
      .run(nome, email, senha, cargo || 'Vendedor', celular || null, data_nascimento || null, cpf || null, tipo_pessoa || 'PF');
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Email já cadastrado' });
  }
});

app.put('/api/usuarios/:id', (req, res) => {
  const { nome, email, senha, cargo, ativo, celular, data_nascimento, cpf, tipo_pessoa } = req.body;
  if (senha) {
    db.prepare('UPDATE usuarios SET nome=?, email=?, senha=?, cargo=?, ativo=?, celular=?, data_nascimento=?, cpf=?, tipo_pessoa=? WHERE id=?')
      .run(nome, email, senha, cargo, ativo ?? 1, celular || null, data_nascimento || null, cpf || null, tipo_pessoa || 'PF', req.params.id);
  } else {
    db.prepare('UPDATE usuarios SET nome=?, email=?, cargo=?, ativo=?, celular=?, data_nascimento=?, cpf=?, tipo_pessoa=? WHERE id=?')
      .run(nome, email, cargo, ativo ?? 1, celular || null, data_nascimento || null, cpf || null, tipo_pessoa || 'PF', req.params.id);
  }
  res.json({ message: 'Usuário atualizado' });
});

app.delete('/api/usuarios/:id', (req, res) => {
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
  { key: 'ordens-servico', label: 'Ordens de servico' },
  { key: 'usuarios', label: 'Usuarios' },
  { key: 'fornecedores', label: 'Fornecedores' },
  { key: 'historico-vendas', label: 'Historico de vendas' },
  { key: 'relatorio', label: 'Relatorio geral' },
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

app.put('/api/perfis/:id', (req, res) => {
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
  const { valor_inicial, usuario_id } = req.body;
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
  db.prepare("UPDATE caixa_status SET aberto=0, fechado_em=datetime('now','localtime') WHERE id=1").run();
  res.json({ message: 'Caixa fechado' });
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
  const { tipo, descricao, valor, forma_pagamento, usuario_id } = req.body;
  if (!['Entrada', 'Saída'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
  const status = db.prepare('SELECT aberto FROM caixa_status WHERE id = 1').get();
  if (!status?.aberto) return res.status(400).json({ error: 'Caixa fechado. Abra o caixa para registrar movimentos.' });
  const result = db.prepare('INSERT INTO caixa (tipo, descricao, valor, forma_pagamento, usuario_id) VALUES (?,?,?,?,?)')
    .run(tipo, descricao || tipo, Number(valor) || 0, forma_pagamento || null, usuario_id || null);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/caixa/movimentos/:id', (req, res) => {
  const movimento = db.prepare('SELECT * FROM caixa WHERE id = ?').get(req.params.id);
  if (!movimento) return res.status(404).json({ error: 'Movimento não encontrado' });
  const { descricao, valor, forma_pagamento, cliente_nome } = req.body;
  db.prepare('UPDATE caixa SET descricao=?, valor=?, forma_pagamento=?, cliente_nome=? WHERE id=?')
    .run(
      descricao ?? movimento.descricao,
      valor != null ? Number(valor) : movimento.valor,
      forma_pagamento ?? movimento.forma_pagamento,
      cliente_nome ?? movimento.cliente_nome,
      req.params.id
    );
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
        for (const item of itens) {
          db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(item.quantidade, item.produto_id);
        }
        db.prepare("UPDATE vendas SET status='Cancelada' WHERE id=?").run(venda.id);
      }
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
app.post('/api/vendas', (req, res) => {
  const { cliente_id, itens, desconto, forma_pagamento, usuario_id, valor_recebido, parcelas } = req.body;
  const status = db.prepare('SELECT aberto FROM caixa_status WHERE id = 1').get();
  if (!status?.aberto) return res.status(400).json({ error: 'Caixa fechado. Abra o caixa para realizar vendas.' });
  if (!itens?.length) return res.status(400).json({ error: 'Adicione itens à venda' });

  const cfg = Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor]));
  const clienteNome = cliente_id
    ? (db.prepare('SELECT nome FROM clientes WHERE id = ?').get(cliente_id)?.nome || 'Visitante')
    : 'Visitante';
  const insertVenda = db.prepare(`INSERT INTO vendas (cliente_id, total, desconto, forma_pagamento, usuario_id, valor_recebido, troco, parcelas, taxa_cartao)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const insertItem = db.prepare('INSERT INTO venda_itens (venda_id, produto_id, descricao, quantidade, preco_unitario, subtotal, os_id) VALUES (?,?,?,?,?,?,?)');
  const updateEstoque = db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ? AND estoque >= ?');
  const insertCaixa = db.prepare(`INSERT INTO caixa (tipo, descricao, valor, forma_pagamento, cliente_nome, desconto, desconto_percent, venda_id, usuario_id)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const marcarOS = db.prepare("UPDATE ordens_servico SET status='Entregue', data_entrega=datetime('now','localtime') WHERE id=? AND status NOT IN ('Entregue','Cancelada')");

  const txn = db.transaction(() => {
    let subtotal = 0;
    for (const item of itens) {
      subtotal += item.quantidade * item.preco_unitario;
    }
    const desc = desconto || 0;
    let total = Math.max(0, subtotal - desc);
    let taxa = 0;
    if (forma_pagamento === 'Cartão Crédito') taxa = total * (parseFloat(cfg.taxa_credito || 0) / 100);
    if (forma_pagamento === 'Cartão Débito') taxa = total * (parseFloat(cfg.taxa_debito || 0) / 100);
    total += taxa;
    const recebido = valor_recebido != null ? Number(valor_recebido) : total;
    const troco = Math.max(0, recebido - total);
    const qtdParcelas = parcelas || 1;
    const venda = insertVenda.run(cliente_id || null, total, desc, forma_pagamento, usuario_id, recebido, troco, qtdParcelas, taxa);
    for (const item of itens) {
      const quantidade = Number(item.quantidade) || 1;
      const preco = Number(item.preco_unitario) || 0;
      if (item.produto_id) {
        const ok = updateEstoque.run(quantidade, item.produto_id, quantidade);
        if (ok.changes === 0) throw new Error('Estoque insuficiente');
      }
      insertItem.run(venda.lastInsertRowid, item.produto_id || null, item.descricao || null,
        quantidade, preco, quantidade * preco, item.os_id || null);
      if (item.os_id) {
        const os = db.prepare('SELECT id, status FROM ordens_servico WHERE id = ?').get(item.os_id);
        if (!os) throw new Error(`Ordem de serviço #${item.os_id} não encontrada`);
        if (['Entregue', 'Cancelada'].includes(os.status)) {
          throw new Error(`Ordem de serviço #${item.os_id} não pode ser cobrada`);
        }
        marcarOS.run(item.os_id);
      }
    }
    insertCaixa.run('Venda realizada', 'Venda', total, forma_pagamento, clienteNome, desc,
      subtotal > 0 ? (desc / subtotal) * 100 : 0, venda.lastInsertRowid, usuario_id);
    return venda.lastInsertRowid;
  });

  try {
    const vendaId = txn();
    res.json({ id: vendaId, message: 'Venda realizada' });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Falha ao finalizar venda' });
  }
});

app.get('/api/vendas', (req, res) => {
  const { search = '', page = 1, limit = 15, cliente_id, status } = req.query;
  let query = `SELECT v.*, c.nome as cliente_nome, u.nome as usuario_nome FROM vendas v
    LEFT JOIN clientes c ON v.cliente_id = c.id
    LEFT JOIN usuarios u ON v.usuario_id = u.id WHERE 1=1`;
  const params = [];
  if (cliente_id) { query += ' AND v.cliente_id = ?'; params.push(cliente_id); }
  if (status) { query += ' AND v.status = ?'; params.push(status); }
  if (search) {
    query += ' AND (c.nome LIKE ? OR CAST(v.id AS TEXT) LIKE ? OR v.forma_pagamento LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY v.criado_em DESC, v.id DESC';
  const countQ = query.replace(/SELECT v\.\*, c\.nome as cliente_nome, u\.nome as usuario_nome/, 'SELECT COUNT(*) as total');
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
  const cfg = Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor]));
  res.json({ ...venda, itens, cupom: cfg });
});

app.post('/api/vendas/:id/cancelar', (req, res) => {
  const venda = db.prepare('SELECT * FROM vendas WHERE id = ?').get(req.params.id);
  if (!venda) return res.status(404).json({ error: 'Venda não encontrada' });
  if (venda.status === 'Cancelada') return res.status(400).json({ error: 'Venda já cancelada' });
  const itens = db.prepare('SELECT * FROM venda_itens WHERE venda_id = ?').all(req.params.id);
  const txn = db.transaction(() => {
    for (const item of itens) {
      if (item.produto_id) db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(item.quantidade, item.produto_id);
      if (item.os_id) {
        db.prepare("UPDATE ordens_servico SET status='Pronta para entrega', data_entrega=NULL WHERE id=? AND status='Entregue'").run(item.os_id);
      }
    }
    db.prepare("UPDATE vendas SET status='Cancelada' WHERE id=?").run(req.params.id);
    db.prepare('INSERT INTO caixa (tipo, descricao, valor, forma_pagamento, usuario_id) VALUES (?,?,?,?,?)')
      .run('Saída', `Cancelamento venda #${req.params.id}`, venda.total, venda.forma_pagamento, venda.usuario_id);
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
  const { cliente_id, cliente_nome, itens, subtotal, desconto, total, observacao, usuario_id } = req.body;
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

app.post('/api/financeiro', (req, res) => {
  const { tipo, categoria, descricao, valor, data_vencimento, data_pagamento, status, cliente_id, fornecedor_id } = req.body;
  const result = db.prepare('INSERT INTO financeiro (tipo, categoria, descricao, valor, data_vencimento, data_pagamento, status, cliente_id, fornecedor_id) VALUES (?,?,?,?,?,?,?,?,?)').run(tipo, categoria, descricao, valor, data_vencimento, data_pagamento, status || 'Pendente', cliente_id || null, fornecedor_id || null);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/financeiro/:id', (req, res) => {
  const { tipo, categoria, descricao, valor, data_vencimento, data_pagamento, status, cliente_id, fornecedor_id } = req.body;
  db.prepare('UPDATE financeiro SET tipo=?, categoria=?, descricao=?, valor=?, data_vencimento=?, data_pagamento=?, status=?, cliente_id=?, fornecedor_id=? WHERE id=?').run(tipo, categoria, descricao, valor, data_vencimento, data_pagamento, status, cliente_id || null, fornecedor_id || null, req.params.id);
  res.json({ message: 'Lançamento atualizado' });
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
  `).get().total;
  const crediarioVencido = db.prepare(`
    SELECT COALESCE(SUM(valor),0) as total FROM financeiro
    WHERE tipo='Receita' AND status='Pendente' AND date(data_vencimento) < date('now','localtime')
  `).get().total;

  const estoque = db.prepare(`
    SELECT COALESCE(SUM(estoque * COALESCE(preco,0)),0) as valor,
           SUM(CASE WHEN estoque <= estoque_minimo THEN 1 ELSE 0 END) as alertas
    FROM produtos WHERE ativo = 1
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
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Erro interno' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ERP ISAC rodando em http://localhost:${PORT}`);
});
