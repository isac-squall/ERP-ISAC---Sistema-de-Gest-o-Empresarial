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

// ============ AUTH ============
app.post('/api/auth/login', (req, res) => {
  const { email, senha } = req.body;
  const user = db.prepare('SELECT id, nome, email, cargo FROM usuarios WHERE email = ? AND senha = ? AND ativo = 1').get(email, senha);
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
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
  res.json(db.prepare('SELECT id, nome, preco, estoque, codigo FROM produtos WHERE ativo = 1 ORDER BY nome').all());
});

app.get('/api/produtos/codigo/:codigo', (req, res) => {
  const row = db.prepare('SELECT id, nome, preco, estoque, estoque_minimo, codigo FROM produtos WHERE ativo = 1 AND codigo = ?').get(req.params.codigo);
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
  let query = 'SELECT id, nome, email, cargo, ativo, criado_em FROM usuarios WHERE 1=1';
  const params = [];
  if (search) {
    query += ' AND (nome LIKE ? OR email LIKE ? OR cargo LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY nome ASC';
  const countQ = query.replace(/SELECT id, nome, email, cargo, ativo, criado_em/, 'SELECT COUNT(*) as total');
  const total = db.prepare(countQ).get(...params)?.total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare(`${query} LIMIT ? OFFSET ?`).all(...params, +limit, offset);
  res.json({ data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) || 1 });
});

app.get('/api/usuarios/:id', (req, res) => {
  const row = db.prepare('SELECT id, nome, email, cargo, ativo, criado_em FROM usuarios WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json(row);
});

app.post('/api/usuarios', (req, res) => {
  const { nome, email, senha, cargo } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
  try {
    const result = db.prepare('INSERT INTO usuarios (nome, email, senha, cargo) VALUES (?,?,?,?)').run(nome, email, senha, cargo || 'Operador');
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Email já cadastrado' });
  }
});

app.put('/api/usuarios/:id', (req, res) => {
  const { nome, email, senha, cargo, ativo } = req.body;
  if (senha) {
    db.prepare('UPDATE usuarios SET nome=?, email=?, senha=?, cargo=?, ativo=? WHERE id=?').run(nome, email, senha, cargo, ativo ?? 1, req.params.id);
  } else {
    db.prepare('UPDATE usuarios SET nome=?, email=?, cargo=?, ativo=? WHERE id=?').run(nome, email, cargo, ativo ?? 1, req.params.id);
  }
  res.json({ message: 'Usuário atualizado' });
});

app.delete('/api/usuarios/:id', (req, res) => {
  db.prepare('UPDATE usuarios SET ativo = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Usuário desativado' });
});

// ============ CAIXA ============
app.get('/api/caixa/status', (req, res) => {
  const status = db.prepare('SELECT * FROM caixa_status WHERE id = 1').get();
  const movimentos = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN tipo='Entrada' THEN valor ELSE 0 END),0) as entradas,
           COALESCE(SUM(CASE WHEN tipo='Saída' THEN valor ELSE 0 END),0) as saidas
    FROM caixa WHERE date(criado_em) = date('now','localtime')
  `).get();
  const saldo = (status?.valor_inicial || 0) + movimentos.entradas - movimentos.saidas;
  res.json({
    ...status,
    aberto: status?.aberto === 1,
    entradas: movimentos.entradas,
    saidas: movimentos.saidas,
    saldo
  });
});

app.post('/api/caixa/abrir', (req, res) => {
  const { valor_inicial, usuario_id } = req.body;
  db.prepare("UPDATE caixa_status SET aberto=1, valor_inicial=?, aberto_em=datetime('now','localtime'), fechado_em=NULL, usuario_id=? WHERE id=1").run(valor_inicial || 0, usuario_id);
  res.json({ message: 'Caixa aberto' });
});

app.post('/api/caixa/fechar', (req, res) => {
  db.prepare("UPDATE caixa_status SET aberto=0, fechado_em=datetime('now','localtime') WHERE id=1").run();
  res.json({ message: 'Caixa fechado' });
});

app.get('/api/caixa/movimentos', (req, res) => {
  const { page = 1, limit = 15 } = req.query;
  const total = db.prepare('SELECT COUNT(*) as total FROM caixa').get().total;
  const offset = (page - 1) * limit;
  const data = db.prepare(`
    SELECT c.*, u.nome as usuario_nome FROM caixa c
    LEFT JOIN usuarios u ON c.usuario_id = u.id
    ORDER BY c.criado_em DESC LIMIT ? OFFSET ?
  `).all(+limit, offset);
  res.json({ data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) || 1 });
});

app.post('/api/caixa/movimentos', (req, res) => {
  const { tipo, descricao, valor, forma_pagamento, usuario_id } = req.body;
  const status = db.prepare('SELECT aberto FROM caixa_status WHERE id = 1').get();
  if (!status?.aberto) return res.status(400).json({ error: 'Caixa fechado' });
  const result = db.prepare('INSERT INTO caixa (tipo, descricao, valor, forma_pagamento, usuario_id) VALUES (?,?,?,?,?)').run(tipo, descricao, valor, forma_pagamento, usuario_id);
  res.json({ id: result.lastInsertRowid });
});

// ============ VENDAS ============
app.post('/api/vendas', (req, res) => {
  const { cliente_id, itens, desconto, forma_pagamento, usuario_id, valor_recebido, parcelas } = req.body;
  const status = db.prepare('SELECT aberto FROM caixa_status WHERE id = 1').get();
  if (!status?.aberto) return res.status(400).json({ error: 'Caixa fechado. Abra o caixa para realizar vendas.' });
  if (!itens?.length) return res.status(400).json({ error: 'Adicione itens à venda' });

  const cfg = Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor]));
  const insertVenda = db.prepare(`INSERT INTO vendas (cliente_id, total, desconto, forma_pagamento, usuario_id, valor_recebido, troco, parcelas, taxa_cartao)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const insertItem = db.prepare('INSERT INTO venda_itens (venda_id, produto_id, quantidade, preco_unitario, subtotal) VALUES (?,?,?,?,?)');
  const updateEstoque = db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ? AND estoque >= ?');
  const insertCaixa = db.prepare('INSERT INTO caixa (tipo, descricao, valor, forma_pagamento, usuario_id) VALUES (?,?,?,?,?)');

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
      const ok = updateEstoque.run(item.quantidade, item.produto_id, item.quantidade);
      if (ok.changes === 0) throw new Error('Estoque insuficiente');
      insertItem.run(venda.lastInsertRowid, item.produto_id, item.quantidade, item.preco_unitario, item.quantidade * item.preco_unitario);
    }
    insertCaixa.run('Entrada', `Venda #${venda.lastInsertRowid}`, total, forma_pagamento, usuario_id);
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
  const { search = '', page = 1, limit = 15 } = req.query;
  let query = `SELECT v.*, c.nome as cliente_nome, u.nome as usuario_nome FROM vendas v
    LEFT JOIN clientes c ON v.cliente_id = c.id
    LEFT JOIN usuarios u ON v.usuario_id = u.id WHERE 1=1`;
  const params = [];
  if (search) {
    query += ' AND (c.nome LIKE ? OR CAST(v.id AS TEXT) LIKE ? OR v.forma_pagamento LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY v.criado_em DESC';
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
    SELECT vi.*, p.nome as produto_nome, p.codigo as codigo FROM venda_itens vi
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
      db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(item.quantidade, item.produto_id);
    }
    db.prepare("UPDATE vendas SET status='Cancelada' WHERE id=?").run(req.params.id);
    db.prepare('INSERT INTO caixa (tipo, descricao, valor, forma_pagamento, usuario_id) VALUES (?,?,?,?,?)')
      .run('Saída', `Cancelamento venda #${req.params.id}`, venda.total, venda.forma_pagamento, venda.usuario_id);
  });
  txn();
  res.json({ message: 'Venda cancelada' });
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
    query += ' AND (f.descricao LIKE ? OR f.categoria LIKE ? OR c.nome LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY f.data_vencimento DESC';
  const countQ = query.replace(/SELECT f\.\*, c\.nome as cliente_nome, fo\.nome as fornecedor_nome/, 'SELECT COUNT(*) as total');
  const total = db.prepare(countQ).get(...params)?.total || 0;
  const offset = (page - 1) * limit;
  const data = db.prepare(`${query} LIMIT ? OFFSET ?`).all(...params, +limit, offset);
  res.json({ data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) || 1 });
});

app.get('/api/financeiro/stats', (req, res) => {
  const receitas = db.prepare("SELECT COALESCE(SUM(valor),0) as total FROM financeiro WHERE tipo='Receita'").get();
  const despesas = db.prepare("SELECT COALESCE(SUM(valor),0) as total FROM financeiro WHERE tipo='Despesa'").get();
  const pendentes = db.prepare("SELECT COALESCE(SUM(valor),0) as total FROM financeiro WHERE status='Pendente'").get();
  res.json({ receitas: receitas.total, despesas: despesas.total, pendentes: pendentes.total, saldo: receitas.total - despesas.total });
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
app.get('/api/relatorio', (req, res) => {
  const vendasPorMes = db.prepare(`
    SELECT strftime('%Y-%m', criado_em) as mes, COUNT(*) as qtd, SUM(total) as total
    FROM vendas GROUP BY mes ORDER BY mes DESC LIMIT 12
  `).all();
  const produtosMaisVendidos = db.prepare(`
    SELECT p.nome, SUM(vi.quantidade) as qtd, SUM(vi.subtotal) as total
    FROM venda_itens vi JOIN produtos p ON vi.produto_id = p.id
    GROUP BY p.id ORDER BY qtd DESC LIMIT 10
  `).all();
  const clientesTop = db.prepare(`
    SELECT c.nome, COUNT(v.id) as qtd, SUM(v.total) as total
    FROM vendas v JOIN clientes c ON v.cliente_id = c.id
    GROUP BY c.id ORDER BY total DESC LIMIT 10
  `).all();
  const financeiroResumo = db.prepare(`
    SELECT tipo, status, SUM(valor) as total FROM financeiro GROUP BY tipo, status
  `).all();
  const totalVendas = db.prepare('SELECT COUNT(*) as qtd, COALESCE(SUM(total),0) as total FROM vendas').get();
  res.json({ vendasPorMes, produtosMaisVendidos, clientesTop, financeiroResumo, totalVendas });
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
