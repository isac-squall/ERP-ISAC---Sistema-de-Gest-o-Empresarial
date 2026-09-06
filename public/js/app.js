let currentUser = null;
let currentPage = 'dashboard';
let pageState = {};

const PAGES = {
  dashboard: { title: 'Dashboard', breadcrumb: 'Dashboard' },
  vendas: { title: 'Realizar vendas', breadcrumb: 'Dashboard / Realizar vendas' },
  caixa: { title: 'Gerenciar caixa', breadcrumb: 'Dashboard / Gerenciar caixa' },
  financeiro: { title: 'Financeiro', breadcrumb: 'Dashboard / Financeiro' },
  clientes: { title: 'Clientes', breadcrumb: 'Dashboard / Clientes' },
  produtos: { title: 'Produtos', breadcrumb: 'Dashboard / Produtos' },
  'ordens-servico': { title: 'Ordens de serviço', breadcrumb: 'Dashboard / Ordens de serviço' },
  usuarios: { title: 'Usuários', breadcrumb: 'Dashboard / Usuários' },
  fornecedores: { title: 'Fornecedores', breadcrumb: 'Dashboard / Fornecedores' },
  'historico-vendas': { title: 'Histórico de vendas', breadcrumb: 'Dashboard / Histórico de vendas' },
  relatorio: { title: 'Relatório geral', breadcrumb: 'Dashboard / Relatório geral' },
  configuracoes: { title: 'Configurações', breadcrumb: 'Dashboard / Configurações' },
  manual: { title: 'Manual', breadcrumb: 'Dashboard / Manual' }
};

document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('erp_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    showApp();
  }
  bindGlobalEvents();
});

function bindGlobalEvents() {
  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      currentUser = await API.login(
        document.getElementById('login-email').value,
        document.getElementById('login-senha').value
      );
      localStorage.setItem('erp_user', JSON.stringify(currentUser));
      showApp();
    } catch (err) { showToast(err.message, 'error'); }
  };

  document.getElementById('logout-btn').onclick = (e) => {
    e.preventDefault();
    currentUser = null;
    localStorage.removeItem('erp_user');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
  };

  document.getElementById('sidebar-toggle').onclick = () =>
    document.getElementById('sidebar').classList.toggle('collapsed');

  document.querySelectorAll('.nav-item').forEach(el => {
    el.onclick = (e) => { e.preventDefault(); navigate(el.dataset.page); };
  });

  document.querySelector('.modal-close').onclick = closeModal;
  document.querySelector('.modal-overlay').onclick = closeModal;

  document.getElementById('theme-switch').onchange = (e) => {
    document.documentElement.setAttribute('data-theme', e.target.checked ? 'dark' : '');
    localStorage.setItem('erp_theme', e.target.checked ? 'dark' : 'light');
  };
  if (localStorage.getItem('erp_theme') === 'dark') {
    document.getElementById('theme-switch').checked = true;
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  document.getElementById('settings-btn').onclick = () => navigate('configuracoes');

  document.getElementById('notif-btn').onclick = async (e) => {
    e.stopPropagation();
    const panel = document.getElementById('notif-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) await refreshNotificacoes(true);
  };
  document.addEventListener('click', () => document.getElementById('notif-panel')?.classList.add('hidden'));

  document.getElementById('fullscreen-btn').onclick = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  };

  document.getElementById('calc-btn').onclick = () =>
    document.getElementById('calculator').classList.toggle('hidden');
  document.getElementById('calc-close').onclick = () =>
    document.getElementById('calculator').classList.add('hidden');

  const calcDisplay = document.getElementById('calc-display');
  document.querySelectorAll('.calc-buttons button').forEach(btn => {
    btn.onclick = () => {
      const v = btn.dataset.val;
      if (v === 'C') calcDisplay.value = '0';
      else if (v === '=') {
        try { calcDisplay.value = eval(calcDisplay.value); }
        catch { calcDisplay.value = 'Erro'; }
      } else {
        calcDisplay.value = calcDisplay.value === '0' ? v : calcDisplay.value + v;
      }
    };
  });
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-name').textContent = currentUser.nome;
  refreshNotificacoes();
  navigate('dashboard');
}

async function refreshNotificacoes(fillPanel) {
  try {
    const n = await API.notificacoes();
    const badge = document.getElementById('notif-badge');
    if (n.count) {
      badge.textContent = n.count;
      badge.classList.remove('hidden');
    } else badge.classList.add('hidden');
    if (fillPanel) {
      document.getElementById('notif-panel').innerHTML = n.itens.length
        ? n.itens.map(i => `<div class="notif-item">${i.texto}</div>`).join('')
        : '<div class="notif-item">Nenhuma notificação</div>';
    }
  } catch {}
}

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page));
  pageState[page] = pageState[page] || { page: 1, limit: 15, search: '' };
  renderPage();
}

async function renderPage() {
  const content = document.getElementById('content');
  content.innerHTML = '<div style="padding:40px;text-align:center"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
  const renderers = {
    dashboard: renderDashboard,
    vendas: renderVendas,
    caixa: renderCaixa,
    financeiro: renderFinanceiro,
    clientes: renderClientes,
    produtos: renderProdutos,
    'ordens-servico': renderOrdensServico,
    usuarios: renderUsuarios,
    fornecedores: renderFornecedores,
    'historico-vendas': renderHistoricoVendas,
    relatorio: renderRelatorio
  };
  try { await renderers[currentPage](); }
  catch (err) { content.innerHTML = `<div class="card"><p style="color:red">Erro: ${err.message}</p></div>`; }
}

function pageHeader(title, breadcrumb) {
  return `<div class="page-header"><h2>${title}</h2><div class="breadcrumb">${breadcrumb}</div></div>`;
}

// ===================== DASHBOARD =====================
async function renderDashboard() {
  const d = await API.dashboard();
  document.getElementById('content').innerHTML = `
    ${pageHeader('Dashboard', 'Dashboard')}
    <div class="stats-row">
      <div class="stat-card blue"><h4>Vendas hoje</h4><div class="stat-value">${formatCurrency(d.vendasHoje)}</div></div>
      <div class="stat-card green"><h4>Vendas do mês</h4><div class="stat-value">${formatCurrency(d.vendasMes)}</div></div>
      <div class="stat-card teal"><h4>Valor previsto (OS)</h4><div class="stat-value">${formatCurrency(d.valorPrevisto)}</div></div>
    </div>
    <div class="stats-row">
      <div class="stat-card blue"><h4>Clientes</h4><div class="stat-value">${d.totalClientes}</div></div>
      <div class="stat-card green"><h4>Produtos</h4><div class="stat-value">${d.totalProdutos}</div></div>
      <div class="stat-card orange"><h4>Estoque baixo</h4><div class="stat-value">${d.estoqueBaixo}</div></div>
    </div>
    <div class="stats-row">
      <div class="stat-card blue"><h4>Ordens abertas</h4><div class="stat-value">${d.ordensAbertas}</div></div>
      <div class="stat-card green"><h4>Prontas p/ entrega</h4><div class="stat-value">${d.ordensProntas}</div></div>
      <div class="stat-card ${d.caixaAberto ? 'green' : 'red'}"><h4>Caixa</h4><div class="stat-value">${d.caixaAberto ? 'Aberto' : 'Fechado'}</div></div>
    </div>
    <div class="dashboard-grid">
      <div class="card">
        <h3>Contas a receber</h3>
        <div class="stat-value" style="color:var(--success);font-size:24px">${formatCurrency(d.contasReceber)}</div>
      </div>
      <div class="card">
        <h3>Contas a pagar</h3>
        <div class="stat-value" style="color:var(--danger);font-size:24px">${formatCurrency(d.contasPagar)}</div>
      </div>
    </div>
    <div class="card">
      <h3>Vendas recentes</h3>
      <table class="data-table">
        <thead><tr><th>#</th><th>Cliente</th><th>Total</th><th>Pagamento</th><th>Data</th></tr></thead>
        <tbody>${d.vendasRecentes.length ? d.vendasRecentes.map(v => `
          <tr><td>${v.id}</td><td>${v.cliente_nome || 'Avulso'}</td><td>${formatCurrency(v.total)}</td><td>${v.forma_pagamento || '-'}</td><td>${formatDateTime(v.criado_em)}</td></tr>
        `).join('') : '<tr class="empty-row"><td colspan="5">Nenhuma venda recente</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

// ===================== ORDENS DE SERVIÇO =====================
async function renderOrdensServico() {
  const st = pageState['ordens-servico'];
  const [stats, result] = await Promise.all([
    API.ordensServico.stats(),
    API.ordensServico.list({ search: st.search, page: st.page, limit: st.limit })
  ]);

  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="stats-row">
      <div class="stat-card blue"><h4>Ordens abertas</h4><div class="stat-value">${stats.abertas}</div></div>
      <div class="stat-card green"><h4>Prontas para entrega</h4><div class="stat-value">${stats.prontas}</div></div>
      <div class="stat-card teal"><h4>Valor previsto</h4><div class="stat-value">${formatCurrency(stats.valorPrevisto)}</div></div>
    </div>
    ${pageHeader('Ordens de serviço', 'Dashboard / Ordens de serviço')}
    ${renderTableToolbar(st.search, `Total de ordens: ${result.total}`, 'Novo Serviço')}
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr>
          <th>#</th><th>Status</th><th>Cliente</th><th>Equipamento</th>
          <th>Solicitacao</th><th>Previsto</th><th>Final</th><th>Entrega</th><th>Criada em</th><th>Acoes</th>
        </tr></thead>
        <tbody id="os-tbody">${renderOSTableRows(result.data)}</tbody>
      </table>
      <div id="os-pagination"></div>
    </div>`;

  bindTableEvents('ordens-servico', result, loadOrdensServico);
  document.getElementById('table-new').onclick = () => showOSForm();
}

function renderOSTableRows(data) {
  if (!data.length) return '<tr class="empty-row"><td colspan="10">Nenhum registro encontrado</td></tr>';
  return data.map(o => `
    <tr>
      <td>${o.id}</td>
      <td><span class="status-badge ${statusClass(o.status)}">${o.status}</span></td>
      <td>${o.cliente_nome || '-'}</td>
      <td>${o.equipamento || '-'}</td>
      <td>${o.solicitacao || '-'}</td>
      <td>${formatDate(o.data_prevista)}</td>
      <td>${formatDate(o.data_final)}</td>
      <td>${formatDate(o.data_entrega)}</td>
      <td>${formatDateTime(o.criado_em)}</td>
      <td class="actions-cell">
        <button class="btn-icon edit" onclick="showOSForm(${o.id})"><i class="fas fa-edit"></i></button>
        <button class="btn-icon delete" onclick="deleteOS(${o.id})"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`).join('');
}

async function loadOrdensServico() {
  const st = pageState['ordens-servico'];
  const result = await API.ordensServico.list({ search: st.search, page: st.page, limit: st.limit });
  document.getElementById('os-tbody').innerHTML = renderOSTableRows(result.data);
  renderPagination(document.getElementById('os-pagination'), result.page, result.totalPages, result.total, result.limit, (p, l) => {
    st.page = p; st.limit = l; loadOrdensServico();
  });
  document.querySelector('.toolbar-info').textContent = `Total de ordens: ${result.total}`;
}

async function showOSForm(id) {
  let data = {};
  if (id) {
    const list = await API.ordensServico.list({ search: '', page: 1, limit: 1000 });
    data = list.data.find(o => o.id === id) || {};
  }
  const clientes = await API.clientes.all();
  openModal(id ? 'Editar Ordem de Serviço' : 'Nova Ordem de Serviço', `
    <form id="os-form">
      <div class="form-row">
        <div class="form-group"><label>Status</label>
          <select name="status">
            ${['Aberta','Em andamento','Pronta para entrega','Entregue','Cancelada'].map(s =>
              `<option ${data.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Cliente</label>
          <select name="cliente_id"><option value="">Selecione...</option>
            ${clientes.map(c => `<option value="${c.id}" ${data.cliente_id == c.id ? 'selected' : ''}>${c.nome}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group"><label>Equipamento</label><input name="equipamento" value="${data.equipamento || ''}"></div>
      <div class="form-group"><label>Solicitação</label><textarea name="solicitacao" rows="3">${data.solicitacao || ''}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Valor previsto</label><input name="valor_previsto" type="number" step="0.01" value="${data.valor_previsto || 0}"></div>
        <div class="form-group"><label>Data prevista</label><input name="data_prevista" type="date" value="${data.data_prevista || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Data final</label><input name="data_final" type="date" value="${data.data_final || ''}"></div>
        <div class="form-group"><label>Data entrega</label><input name="data_entrega" type="date" value="${data.data_entrega || ''}"></div>
      </div>
      <div class="form-group"><label>Observações</label><textarea name="observacoes" rows="2">${data.observacoes || ''}</textarea></div>
    </form>`,
    `<button class="btn btn-outline modal-close-btn">Cancelar</button>
     <button class="btn btn-primary" id="os-save">Salvar</button>`);

  document.querySelector('.modal-close-btn').onclick = closeModal;
  document.getElementById('os-save').onclick = async () => {
    const fd = new FormData(document.getElementById('os-form'));
    const body = Object.fromEntries(fd);
    body.cliente_id = body.cliente_id || null;
    body.valor_previsto = parseFloat(body.valor_previsto) || 0;
    try {
      if (id) await API.ordensServico.update(id, body);
      else await API.ordensServico.create(body);
      closeModal(); showToast('Ordem salva!', 'success'); renderOrdensServico();
    } catch (err) { showToast(err.message, 'error'); }
  };
}

async function deleteOS(id) {
  if (!confirm('Deseja excluir esta ordem?')) return;
  await API.ordensServico.delete(id);
  showToast('Ordem excluída', 'success');
  renderOrdensServico();
}

// ===================== CLIENTES =====================
async function renderClientes() {
  const st = pageState.clientes;
  const result = await API.clientes.list({ search: st.search, page: st.page, limit: st.limit });
  document.getElementById('content').innerHTML = `
    ${pageHeader('Clientes', 'Dashboard / Clientes')}
    ${renderTableToolbar(st.search, `Total de clientes: ${result.total}`, 'Novo Cliente')}
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>#</th><th>Nome</th><th>CPF/CNPJ</th><th>Telefone</th><th>Email</th><th>Cidade</th><th>Acoes</th></tr></thead>
        <tbody id="table-body">${renderClientesRows(result.data)}</tbody>
      </table>
      <div id="table-pagination"></div>
    </div>`;
  bindTableEvents('clientes', result, loadClientes);
  document.getElementById('table-new').onclick = () => showClienteForm();
}

function renderClientesRows(data) {
  if (!data.length) return '<tr class="empty-row"><td colspan="7">Nenhum registro encontrado</td></tr>';
  return data.map(c => `<tr>
    <td>${c.id}</td><td>${c.nome}</td><td>${c.cpf_cnpj || '-'}</td><td>${c.telefone || '-'}</td>
    <td>${c.email || '-'}</td><td>${c.cidade || '-'}</td>
    <td class="actions-cell">
      <button class="btn-icon edit" onclick="showClienteForm(${c.id})"><i class="fas fa-edit"></i></button>
      <button class="btn-icon delete" onclick="deleteCliente(${c.id})"><i class="fas fa-trash"></i></button>
    </td></tr>`).join('');
}

async function loadClientes() {
  const st = pageState.clientes;
  const result = await API.clientes.list({ search: st.search, page: st.page, limit: st.limit });
  document.getElementById('table-body').innerHTML = renderClientesRows(result.data);
  renderPagination(document.getElementById('table-pagination'), result.page, result.totalPages, result.total, result.limit, (p, l) => {
    st.page = p; st.limit = l; loadClientes();
  });
  document.querySelector('.toolbar-info').textContent = `Total de clientes: ${result.total}`;
}

async function showClienteForm(id) {
  let data = {};
  if (id) data = await API.clientes.get(id);
  openModal(id ? 'Editar Cliente' : 'Novo Cliente', `
    <form id="entity-form">
      <div class="form-group"><label>Nome *</label><input name="nome" value="${data.nome || ''}" required></div>
      <div class="form-row">
        <div class="form-group"><label>CPF/CNPJ</label><input name="cpf_cnpj" value="${data.cpf_cnpj || ''}"></div>
        <div class="form-group"><label>Telefone</label><input name="telefone" value="${data.telefone || ''}"></div>
      </div>
      <div class="form-group"><label>Email</label><input name="email" type="email" value="${data.email || ''}"></div>
      <div class="form-group"><label>Endereço</label><input name="endereco" value="${data.endereco || ''}"></div>
      <div class="form-row">
        <div class="form-group"><label>Cidade</label><input name="cidade" value="${data.cidade || ''}"></div>
        <div class="form-group"><label>Estado</label><input name="estado" value="${data.estado || ''}"></div>
      </div>
    </form>`,
    `<button class="btn btn-outline modal-close-btn">Cancelar</button><button class="btn btn-primary" id="entity-save">Salvar</button>`);
  bindEntitySave(id, 'clientes', renderClientes);
}

async function deleteCliente(id) {
  if (!confirm('Deseja excluir este cliente?')) return;
  await API.clientes.delete(id);
  showToast('Cliente excluído', 'success'); renderClientes();
}

// ===================== PRODUTOS =====================
async function renderProdutos() {
  const st = pageState.produtos;
  const result = await API.produtos.list({ search: st.search, page: st.page, limit: st.limit });
  document.getElementById('content').innerHTML = `
    ${pageHeader('Produtos', 'Dashboard / Produtos')}
    ${renderTableToolbar(st.search, `Total de produtos: ${result.total}`, 'Novo Produto')}
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>#</th><th>Nome</th><th>Código</th><th>Preço</th><th>Estoque</th><th>Categoria</th><th>Fornecedor</th><th>Acoes</th></tr></thead>
        <tbody id="table-body">${renderProdutosRows(result.data)}</tbody>
      </table>
      <div id="table-pagination"></div>
    </div>`;
  bindTableEvents('produtos', result, loadProdutos);
  document.getElementById('table-new').onclick = () => showProdutoForm();
}

function renderProdutosRows(data) {
  if (!data.length) return '<tr class="empty-row"><td colspan="8">Nenhum registro encontrado</td></tr>';
  return data.map(p => `<tr>
    <td>${p.id}</td><td>${p.nome}</td><td>${p.codigo || '-'}</td><td>${formatCurrency(p.preco)}</td>
    <td>${p.estoque}${p.estoque <= p.estoque_minimo ? ' ⚠️' : ''}</td><td>${p.categoria || '-'}</td>
    <td>${p.fornecedor_nome || '-'}</td>
    <td class="actions-cell">
      <button class="btn-icon edit" onclick="showProdutoForm(${p.id})"><i class="fas fa-edit"></i></button>
      <button class="btn-icon delete" onclick="deleteProduto(${p.id})"><i class="fas fa-trash"></i></button>
    </td></tr>`).join('');
}

async function loadProdutos() {
  const st = pageState.produtos;
  const result = await API.produtos.list({ search: st.search, page: st.page, limit: st.limit });
  document.getElementById('table-body').innerHTML = renderProdutosRows(result.data);
  renderPagination(document.getElementById('table-pagination'), result.page, result.totalPages, result.total, result.limit, (p, l) => {
    st.page = p; st.limit = l; loadProdutos();
  });
  document.querySelector('.toolbar-info').textContent = `Total de produtos: ${result.total}`;
}

async function showProdutoForm(id) {
  let data = {};
  if (id) {
    const list = await API.produtos.list({ page: 1, limit: 1000 });
    data = list.data.find(p => p.id === id) || {};
  }
  const fornecedores = await API.fornecedores.all();
  openModal(id ? 'Editar Produto' : 'Novo Produto', `
    <form id="entity-form">
      <div class="form-group"><label>Nome *</label><input name="nome" value="${data.nome || ''}" required></div>
      <div class="form-row">
        <div class="form-group"><label>Código</label><input name="codigo" value="${data.codigo || ''}"></div>
        <div class="form-group"><label>Categoria</label><input name="categoria" value="${data.categoria || ''}"></div>
      </div>
      <div class="form-group"><label>Descrição</label><textarea name="descricao" rows="2">${data.descricao || ''}</textarea></div>
      <div class="form-row-3">
        <div class="form-group"><label>Preço</label><input name="preco" type="number" step="0.01" value="${data.preco || 0}"></div>
        <div class="form-group"><label>Estoque</label><input name="estoque" type="number" value="${data.estoque || 0}"></div>
        <div class="form-group"><label>Estoque mínimo</label><input name="estoque_minimo" type="number" value="${data.estoque_minimo || 0}"></div>
      </div>
      <div class="form-group"><label>Fornecedor</label>
        <select name="fornecedor_id"><option value="">Nenhum</option>
          ${fornecedores.map(f => `<option value="${f.id}" ${data.fornecedor_id == f.id ? 'selected' : ''}>${f.nome}</option>`).join('')}
        </select></div>
    </form>`,
    `<button class="btn btn-outline modal-close-btn">Cancelar</button><button class="btn btn-primary" id="entity-save">Salvar</button>`);
  bindEntitySave(id, 'produtos', renderProdutos);
}

async function deleteProduto(id) {
  if (!confirm('Deseja excluir este produto?')) return;
  await API.produtos.delete(id);
  showToast('Produto excluído', 'success'); renderProdutos();
}

// ===================== FORNECEDORES =====================
async function renderFornecedores() {
  const st = pageState.fornecedores;
  const result = await API.fornecedores.list({ search: st.search, page: st.page, limit: st.limit });
  document.getElementById('content').innerHTML = `
    ${pageHeader('Fornecedores', 'Dashboard / Fornecedores')}
    ${renderTableToolbar(st.search, `Total de fornecedores: ${result.total}`, 'Novo Fornecedor')}
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>#</th><th>Nome</th><th>CNPJ</th><th>Telefone</th><th>Email</th><th>Acoes</th></tr></thead>
        <tbody id="table-body">${renderFornecedoresRows(result.data)}</tbody>
      </table>
      <div id="table-pagination"></div>
    </div>`;
  bindTableEvents('fornecedores', result, loadFornecedores);
  document.getElementById('table-new').onclick = () => showFornecedorForm();
}

function renderFornecedoresRows(data) {
  if (!data.length) return '<tr class="empty-row"><td colspan="6">Nenhum registro encontrado</td></tr>';
  return data.map(f => `<tr>
    <td>${f.id}</td><td>${f.nome}</td><td>${f.cnpj || '-'}</td><td>${f.telefone || '-'}</td><td>${f.email || '-'}</td>
    <td class="actions-cell">
      <button class="btn-icon edit" onclick="showFornecedorForm(${f.id})"><i class="fas fa-edit"></i></button>
      <button class="btn-icon delete" onclick="deleteFornecedor(${f.id})"><i class="fas fa-trash"></i></button>
    </td></tr>`).join('');
}

async function loadFornecedores() {
  const st = pageState.fornecedores;
  const result = await API.fornecedores.list({ search: st.search, page: st.page, limit: st.limit });
  document.getElementById('table-body').innerHTML = renderFornecedoresRows(result.data);
  renderPagination(document.getElementById('table-pagination'), result.page, result.totalPages, result.total, result.limit, (p, l) => {
    st.page = p; st.limit = l; loadFornecedores();
  });
  document.querySelector('.toolbar-info').textContent = `Total de fornecedores: ${result.total}`;
}

async function showFornecedorForm(id) {
  let data = {};
  if (id) {
    const list = await API.fornecedores.list({ page: 1, limit: 1000 });
    data = list.data.find(f => f.id === id) || {};
  }
  openModal(id ? 'Editar Fornecedor' : 'Novo Fornecedor', `
    <form id="entity-form">
      <div class="form-group"><label>Nome *</label><input name="nome" value="${data.nome || ''}" required></div>
      <div class="form-row">
        <div class="form-group"><label>CNPJ</label><input name="cnpj" value="${data.cnpj || ''}"></div>
        <div class="form-group"><label>Telefone</label><input name="telefone" value="${data.telefone || ''}"></div>
      </div>
      <div class="form-group"><label>Email</label><input name="email" type="email" value="${data.email || ''}"></div>
      <div class="form-group"><label>Endereço</label><input name="endereco" value="${data.endereco || ''}"></div>
    </form>`,
    `<button class="btn btn-outline modal-close-btn">Cancelar</button><button class="btn btn-primary" id="entity-save">Salvar</button>`);
  bindEntitySave(id, 'fornecedores', renderFornecedores);
}

async function deleteFornecedor(id) {
  if (!confirm('Deseja excluir este fornecedor?')) return;
  await API.fornecedores.delete(id);
  showToast('Fornecedor excluído', 'success'); renderFornecedores();
}

// ===================== USUÁRIOS =====================
async function renderUsuarios() {
  const st = pageState.usuarios;
  const result = await API.usuarios.list({ search: st.search, page: st.page, limit: st.limit });
  document.getElementById('content').innerHTML = `
    ${pageHeader('Usuários', 'Dashboard / Usuários')}
    ${renderTableToolbar(st.search, `Total de usuários: ${result.total}`, 'Novo Usuário')}
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>#</th><th>Nome</th><th>Email</th><th>Cargo</th><th>Status</th><th>Criado em</th><th>Acoes</th></tr></thead>
        <tbody id="table-body">${renderUsuariosRows(result.data)}</tbody>
      </table>
      <div id="table-pagination"></div>
    </div>`;
  bindTableEvents('usuarios', result, loadUsuarios);
  document.getElementById('table-new').onclick = () => showUsuarioForm();
}

function renderUsuariosRows(data) {
  if (!data.length) return '<tr class="empty-row"><td colspan="7">Nenhum registro encontrado</td></tr>';
  return data.map(u => `<tr>
    <td>${u.id}</td><td>${u.nome}</td><td>${u.email}</td><td>${u.cargo}</td>
    <td><span class="status-badge ${u.ativo ? 'ativo' : 'inativo'}">${u.ativo ? 'Ativo' : 'Inativo'}</span></td>
    <td>${formatDateTime(u.criado_em)}</td>
    <td class="actions-cell">
      <button class="btn-icon edit" onclick="showUsuarioForm(${u.id})"><i class="fas fa-edit"></i></button>
      <button class="btn-icon delete" onclick="deleteUsuario(${u.id})"><i class="fas fa-trash"></i></button>
    </td></tr>`).join('');
}

async function loadUsuarios() {
  const st = pageState.usuarios;
  const result = await API.usuarios.list({ search: st.search, page: st.page, limit: st.limit });
  document.getElementById('table-body').innerHTML = renderUsuariosRows(result.data);
  renderPagination(document.getElementById('table-pagination'), result.page, result.totalPages, result.total, result.limit, (p, l) => {
    st.page = p; st.limit = l; loadUsuarios();
  });
  document.querySelector('.toolbar-info').textContent = `Total de usuários: ${result.total}`;
}

async function showUsuarioForm(id) {
  let data = {};
  if (id) {
    const list = await API.usuarios.list({ page: 1, limit: 1000 });
    data = list.data.find(u => u.id === id) || {};
  }
  openModal(id ? 'Editar Usuário' : 'Novo Usuário', `
    <form id="entity-form">
      <div class="form-group"><label>Nome *</label><input name="nome" value="${data.nome || ''}" required></div>
      <div class="form-row">
        <div class="form-group"><label>Email *</label><input name="email" type="email" value="${data.email || ''}" required></div>
        <div class="form-group"><label>Senha ${id ? '(deixe vazio p/ manter)' : '*'}</label><input name="senha" type="password" ${id ? '' : 'required'}></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Cargo</label>
          <select name="cargo">
            ${['Administrador','Gerente','Operador','Vendedor'].map(c =>
              `<option ${data.cargo === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select></div>
        ${id ? `<div class="form-group"><label>Status</label>
          <select name="ativo"><option value="1" ${data.ativo ? 'selected' : ''}>Ativo</option><option value="0" ${!data.ativo ? 'selected' : ''}>Inativo</option></select></div>` : ''}
      </div>
    </form>`,
    `<button class="btn btn-outline modal-close-btn">Cancelar</button><button class="btn btn-primary" id="entity-save">Salvar</button>`);
  bindEntitySave(id, 'usuarios', renderUsuarios, (body) => { if (body.ativo !== undefined) body.ativo = +body.ativo; });
}

async function deleteUsuario(id) {
  if (!confirm('Deseja desativar este usuário?')) return;
  await API.usuarios.delete(id);
  showToast('Usuário desativado', 'success'); renderUsuarios();
}

// ===================== VENDAS (POS) =====================
let cart = [];

async function renderVendas() {
  const [produtos, clientes, caixaStatus] = await Promise.all([
    API.produtos.all(), API.clientes.all(), API.caixa.status()
  ]);

  if (!caixaStatus.aberto) {
    document.getElementById('content').innerHTML = `
      ${pageHeader('Realizar vendas', 'Dashboard / Realizar vendas')}
      <div class="card caixa-status fechado">
        <div class="status-icon"><i class="fas fa-lock"></i></div>
        <h3>Caixa Fechado</h3>
        <p>Abra o caixa antes de realizar vendas.</p>
        <button class="btn btn-primary" onclick="navigate('caixa')">Ir para Caixa</button>
      </div>`;
    return;
  }

  document.getElementById('content').innerHTML = `
    ${pageHeader('Realizar vendas', 'Dashboard / Realizar vendas')}
    <div class="pos-layout">
      <div class="pos-products">
        <div class="search-box" style="margin-bottom:12px;max-width:100%">
          <i class="fas fa-search"></i>
          <input type="text" id="pos-search" placeholder="Buscar produto...">
        </div>
        <div class="product-grid" id="product-grid">
          ${produtos.map(p => `
            <div class="product-card" onclick="addToCart(${p.id}, '${p.nome.replace(/'/g,"\\'")}', ${p.preco}, ${p.estoque})">
              <h4>${p.nome}</h4>
              <div class="price">${formatCurrency(p.preco)}</div>
              <div class="stock">Estoque: ${p.estoque}</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="cart-panel">
        <div class="cart-header"><h3><i class="fas fa-shopping-cart"></i> Carrinho</h3></div>
        <div class="cart-items" id="cart-items"></div>
        <div class="cart-footer">
          <div class="form-group"><label>Cliente</label>
            <select id="venda-cliente"><option value="">Avulso</option>
              ${clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')}
            </select></div>
          <div class="form-row">
            <div class="form-group"><label>Desconto</label><input id="venda-desconto" type="number" step="0.01" value="0"></div>
            <div class="form-group"><label>Pagamento</label>
              <select id="venda-pagamento">
                <option>Dinheiro</option><option>Cartão Débito</option><option>Cartão Crédito</option><option>PIX</option>
              </select></div>
          </div>
          <div class="cart-total"><span>Total:</span><span id="cart-total">${formatCurrency(0)}</span></div>
          <button class="btn btn-success btn-block" id="finalizar-venda"><i class="fas fa-check"></i> Finalizar Venda</button>
        </div>
      </div>
    </div>`;

  cart = [];
  updateCart();
  document.getElementById('pos-search').oninput = debounce((e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.product-card').forEach(card => {
      card.style.display = card.querySelector('h4').textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  }, 300);

  document.getElementById('venda-desconto').oninput = updateCart;
  document.getElementById('finalizar-venda').onclick = finalizarVenda;
}

function addToCart(id, nome, preco, estoque) {
  if (estoque <= 0) { showToast('Produto sem estoque', 'error'); return; }
  const existing = cart.find(i => i.produto_id === id);
  if (existing) {
    if (existing.quantidade >= estoque) { showToast('Estoque insuficiente', 'error'); return; }
    existing.quantidade++;
  } else {
    cart.push({ produto_id: id, nome, preco_unitario: preco, quantidade: 1, estoque });
  }
  updateCart();
}

function updateCart() {
  const container = document.getElementById('cart-items');
  if (!container) return;
  if (!cart.length) {
    container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-muted)">Carrinho vazio</p>';
  } else {
    container.innerHTML = cart.map((item, idx) => `
      <div class="cart-item">
        <div class="cart-item-info"><strong>${item.nome}</strong><br>${formatCurrency(item.preco_unitario)}</div>
        <div class="cart-item-qty">
          <button onclick="changeQty(${idx},-1)">-</button>
          <span>${item.quantidade}</span>
          <button onclick="changeQty(${idx},1)">+</button>
        </div>
        <div>${formatCurrency(item.quantidade * item.preco_unitario)}</div>
        <button class="btn-icon delete" onclick="removeFromCart(${idx})"><i class="fas fa-times"></i></button>
      </div>`).join('');
  }
  const desconto = parseFloat(document.getElementById('venda-desconto')?.value) || 0;
  const total = cart.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0) - desconto;
  const totalEl = document.getElementById('cart-total');
  if (totalEl) totalEl.textContent = formatCurrency(Math.max(0, total));
}

function changeQty(idx, delta) {
  cart[idx].quantidade += delta;
  if (cart[idx].quantidade <= 0) cart.splice(idx, 1);
  else if (cart[idx].quantidade > cart[idx].estoque) { cart[idx].quantidade = cart[idx].estoque; showToast('Estoque insuficiente', 'error'); }
  updateCart();
}

function removeFromCart(idx) { cart.splice(idx, 1); updateCart(); }

async function finalizarVenda() {
  if (!cart.length) { showToast('Adicione produtos ao carrinho', 'error'); return; }
  try {
    await API.vendas.create({
      cliente_id: document.getElementById('venda-cliente').value || null,
      itens: cart.map(i => ({ produto_id: i.produto_id, quantidade: i.quantidade, preco_unitario: i.preco_unitario })),
      desconto: parseFloat(document.getElementById('venda-desconto').value) || 0,
      forma_pagamento: document.getElementById('venda-pagamento').value,
      usuario_id: currentUser.id
    });
    showToast('Venda realizada com sucesso!', 'success');
    renderVendas();
  } catch (err) { showToast(err.message, 'error'); }
}

// ===================== CAIXA =====================
async function renderCaixa() {
  const [status, movimentos] = await Promise.all([
    API.caixa.status(), API.caixa.movimentos({ page: 1, limit: 15 })
  ]);

  document.getElementById('content').innerHTML = `
    ${pageHeader('Gerenciar caixa', 'Dashboard / Gerenciar caixa')}
    <div class="stats-row">
      <div class="stat-card ${status.aberto ? 'green' : 'red'}">
        <h4>Status</h4><div class="stat-value">${status.aberto ? 'Aberto' : 'Fechado'}</div>
      </div>
      <div class="stat-card blue"><h4>Saldo atual</h4><div class="stat-value">${formatCurrency(status.saldo)}</div></div>
      <div class="stat-card teal"><h4>Entradas hoje</h4><div class="stat-value">${formatCurrency(status.entradas)}</div></div>
    </div>
    <div class="card" style="text-align:center;padding:24px">
      ${status.aberto ? `
        <button class="btn btn-danger" id="fechar-caixa"><i class="fas fa-lock"></i> Fechar Caixa</button>
        <button class="btn btn-primary" id="nova-saida" style="margin-left:8px"><i class="fas fa-minus"></i> Registrar Saída</button>
      ` : `
        <button class="btn btn-success" id="abrir-caixa"><i class="fas fa-lock-open"></i> Abrir Caixa</button>
      `}
    </div>
    <div class="card">
      <h3>Movimentações</h3>
      <table class="data-table">
        <thead><tr><th>#</th><th>Tipo</th><th>Descrição</th><th>Valor</th><th>Pagamento</th><th>Usuário</th><th>Data</th></tr></thead>
        <tbody>${movimentos.data.length ? movimentos.data.map(m => `
          <tr><td>${m.id}</td><td><span class="status-badge ${m.tipo === 'Entrada' ? 'pago' : 'cancelada'}">${m.tipo}</span></td>
          <td>${m.descricao || '-'}</td><td>${formatCurrency(m.valor)}</td><td>${m.forma_pagamento || '-'}</td>
          <td>${m.usuario_nome || '-'}</td><td>${formatDateTime(m.criado_em)}</td></tr>
        `).join('') : '<tr class="empty-row"><td colspan="7">Nenhum movimento</td></tr>'}
        </tbody>
      </table>
    </div>`;

  if (status.aberto) {
    document.getElementById('fechar-caixa').onclick = async () => {
      if (!confirm('Deseja fechar o caixa?')) return;
      await API.caixa.fechar();
      showToast('Caixa fechado', 'success'); renderCaixa();
    };
    document.getElementById('nova-saida').onclick = () => showMovimentoForm('Saída');
  } else {
    document.getElementById('abrir-caixa').onclick = () => {
      openModal('Abrir Caixa', `
        <form id="entity-form">
          <div class="form-group"><label>Valor inicial</label><input name="valor_inicial" type="number" step="0.01" value="0"></div>
        </form>`,
        `<button class="btn btn-outline modal-close-btn">Cancelar</button><button class="btn btn-success" id="entity-save">Abrir</button>`);
      document.querySelector('.modal-close-btn').onclick = closeModal;
      document.getElementById('entity-save').onclick = async () => {
        const val = parseFloat(document.querySelector('[name=valor_inicial]').value) || 0;
        try {
          await API.caixa.abrir({ valor_inicial: val, usuario_id: currentUser.id });
          closeModal(); showToast('Caixa aberto!', 'success'); renderCaixa();
        } catch (err) { showToast(err.message, 'error'); }
      };
    };
  }
}

function showMovimentoForm(tipo) {
  openModal(`Registrar ${tipo}`, `
    <form id="entity-form">
      <div class="form-group"><label>Descrição</label><input name="descricao" required></div>
      <div class="form-row">
        <div class="form-group"><label>Valor</label><input name="valor" type="number" step="0.01" required></div>
        <div class="form-group"><label>Forma pagamento</label>
          <select name="forma_pagamento"><option>Dinheiro</option><option>PIX</option><option>Cartão</option></select></div>
      </div>
    </form>`,
    `<button class="btn btn-outline modal-close-btn">Cancelar</button><button class="btn btn-primary" id="entity-save">Salvar</button>`);
  document.querySelector('.modal-close-btn').onclick = closeModal;
  document.getElementById('entity-save').onclick = async () => {
    const fd = new FormData(document.getElementById('entity-form'));
    const body = Object.fromEntries(fd);
    body.tipo = tipo;
    body.valor = parseFloat(body.valor);
    body.usuario_id = currentUser.id;
    await API.caixa.movimento(body);
    closeModal(); showToast('Movimento registrado', 'success'); renderCaixa();
  };
}

// ===================== FINANCEIRO =====================
async function renderFinanceiro() {
  const st = pageState.financeiro;
  const [stats, result] = await Promise.all([
    API.financeiro.stats(),
    API.financeiro.list({ search: st.search, page: st.page, limit: st.limit })
  ]);

  document.getElementById('content').innerHTML = `
    <div class="stats-row">
      <div class="stat-card green"><h4>Receitas</h4><div class="stat-value">${formatCurrency(stats.receitas)}</div></div>
      <div class="stat-card red"><h4>Despesas</h4><div class="stat-value">${formatCurrency(stats.despesas)}</div></div>
      <div class="stat-card blue"><h4>Saldo</h4><div class="stat-value">${formatCurrency(stats.saldo)}</div></div>
    </div>
    ${pageHeader('Financeiro', 'Dashboard / Financeiro')}
    ${renderTableToolbar(st.search, `Total de lançamentos: ${result.total}`, 'Novo Lançamento')}
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>#</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Acoes</th></tr></thead>
        <tbody id="table-body">${renderFinanceiroRows(result.data)}</tbody>
      </table>
      <div id="table-pagination"></div>
    </div>`;
  bindTableEvents('financeiro', result, loadFinanceiro);
  document.getElementById('table-new').onclick = () => showFinanceiroForm();
}

function renderFinanceiroRows(data) {
  if (!data.length) return '<tr class="empty-row"><td colspan="8">Nenhum registro encontrado</td></tr>';
  return data.map(f => `<tr>
    <td>${f.id}</td><td><span class="status-badge ${f.tipo === 'Receita' ? 'pago' : 'cancelada'}">${f.tipo}</span></td>
    <td>${f.categoria || '-'}</td><td>${f.descricao || '-'}</td><td>${formatCurrency(f.valor)}</td>
    <td>${formatDate(f.data_vencimento)}</td><td><span class="status-badge ${statusClass(f.status)}">${f.status}</span></td>
    <td class="actions-cell">
      <button class="btn-icon edit" onclick="showFinanceiroForm(${f.id})"><i class="fas fa-edit"></i></button>
      <button class="btn-icon delete" onclick="deleteFinanceiro(${f.id})"><i class="fas fa-trash"></i></button>
    </td></tr>`).join('');
}

async function loadFinanceiro() {
  const st = pageState.financeiro;
  const result = await API.financeiro.list({ search: st.search, page: st.page, limit: st.limit });
  document.getElementById('table-body').innerHTML = renderFinanceiroRows(result.data);
  renderPagination(document.getElementById('table-pagination'), result.page, result.totalPages, result.total, result.limit, (p, l) => {
    st.page = p; st.limit = l; loadFinanceiro();
  });
  document.querySelector('.toolbar-info').textContent = `Total de lançamentos: ${result.total}`;
}

async function showFinanceiroForm(id) {
  let data = {};
  if (id) {
    const list = await API.financeiro.list({ page: 1, limit: 1000 });
    data = list.data.find(f => f.id === id) || {};
  }
  openModal(id ? 'Editar Lançamento' : 'Novo Lançamento', `
    <form id="entity-form">
      <div class="form-row">
        <div class="form-group"><label>Tipo</label>
          <select name="tipo"><option ${data.tipo === 'Receita' ? 'selected' : ''}>Receita</option><option ${data.tipo === 'Despesa' ? 'selected' : ''}>Despesa</option></select></div>
        <div class="form-group"><label>Status</label>
          <select name="status"><option ${data.status === 'Pendente' ? 'selected' : ''}>Pendente</option><option ${data.status === 'Pago' ? 'selected' : ''}>Pago</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Categoria</label><input name="categoria" value="${data.categoria || ''}"></div>
        <div class="form-group"><label>Valor</label><input name="valor" type="number" step="0.01" value="${data.valor || 0}" required></div>
      </div>
      <div class="form-group"><label>Descrição</label><input name="descricao" value="${data.descricao || ''}"></div>
      <div class="form-row">
        <div class="form-group"><label>Vencimento</label><input name="data_vencimento" type="date" value="${data.data_vencimento || ''}"></div>
        <div class="form-group"><label>Pagamento</label><input name="data_pagamento" type="date" value="${data.data_pagamento || ''}"></div>
      </div>
    </form>`,
    `<button class="btn btn-outline modal-close-btn">Cancelar</button><button class="btn btn-primary" id="entity-save">Salvar</button>`);
  bindEntitySave(id, 'financeiro', renderFinanceiro, (body) => { body.valor = parseFloat(body.valor); });
}

async function deleteFinanceiro(id) {
  if (!confirm('Deseja excluir este lançamento?')) return;
  await API.financeiro.delete(id);
  showToast('Lançamento excluído', 'success'); renderFinanceiro();
}

// ===================== HISTÓRICO DE VENDAS =====================
async function renderHistoricoVendas() {
  const st = pageState['historico-vendas'];
  const result = await API.vendas.list({ search: st.search, page: st.page, limit: st.limit });
  document.getElementById('content').innerHTML = `
    ${pageHeader('Histórico de vendas', 'Dashboard / Histórico de vendas')}
    ${renderTableToolbar(st.search, `Total de vendas: ${result.total}`, '')}
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>#</th><th>Cliente</th><th>Total</th><th>Desconto</th><th>Pagamento</th><th>Status</th><th>Vendedor</th><th>Data</th><th>Acoes</th></tr></thead>
        <tbody id="table-body">${renderVendasRows(result.data)}</tbody>
      </table>
      <div id="table-pagination"></div>
    </div>`;
  bindTableEvents('historico-vendas', result, loadHistoricoVendas);
}

function renderVendasRows(data) {
  if (!data.length) return '<tr class="empty-row"><td colspan="9">Nenhum registro encontrado</td></tr>';
  return data.map(v => `<tr>
    <td>${v.id}</td><td>${v.cliente_nome || 'Avulso'}</td><td>${formatCurrency(v.total)}</td>
    <td>${formatCurrency(v.desconto)}</td><td>${v.forma_pagamento || '-'}</td>
    <td><span class="status-badge pago">${v.status}</span></td><td>${v.usuario_nome || '-'}</td>
    <td>${formatDateTime(v.criado_em)}</td>
    <td><button class="btn-icon view" onclick="viewVenda(${v.id})"><i class="fas fa-eye"></i></button></td>
  </tr>`).join('');
}

async function loadHistoricoVendas() {
  const st = pageState['historico-vendas'];
  const result = await API.vendas.list({ search: st.search, page: st.page, limit: st.limit });
  document.getElementById('table-body').innerHTML = renderVendasRows(result.data);
  renderPagination(document.getElementById('table-pagination'), result.page, result.totalPages, result.total, result.limit, (p, l) => {
    st.page = p; st.limit = l; loadHistoricoVendas();
  });
  document.querySelector('.toolbar-info').textContent = `Total de vendas: ${result.total}`;
}

async function viewVenda(id) {
  const v = await API.vendas.get(id);
  openModal(`Venda #${v.id}`, `
    <p><strong>Cliente:</strong> ${v.cliente_nome || 'Avulso'}</p>
    <p><strong>Total:</strong> ${formatCurrency(v.total)} | <strong>Desconto:</strong> ${formatCurrency(v.desconto)}</p>
    <p><strong>Pagamento:</strong> ${v.forma_pagamento} | <strong>Data:</strong> ${formatDateTime(v.criado_em)}</p>
    <table class="data-table" style="margin-top:12px">
      <thead><tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Subtotal</th></tr></thead>
      <tbody>${v.itens.map(i => `<tr><td>${i.produto_nome}</td><td>${i.quantidade}</td><td>${formatCurrency(i.preco_unitario)}</td><td>${formatCurrency(i.subtotal)}</td></tr>`).join('')}
      </tbody></table>`, `<button class="btn btn-outline modal-close-btn">Fechar</button>`);
  document.querySelector('.modal-close-btn').onclick = closeModal;
}

// ===================== RELATÓRIO =====================
async function renderRelatorio() {
  const r = await API.relatorio();
  const maxVenda = Math.max(...r.vendasPorMes.map(v => v.total || 0), 1);

  document.getElementById('content').innerHTML = `
    ${pageHeader('Relatório geral', 'Dashboard / Relatório geral')}
    <div class="stats-row">
      <div class="stat-card blue"><h4>Total de vendas</h4><div class="stat-value">${r.totalVendas.qtd}</div></div>
      <div class="stat-card green"><h4>Faturamento total</h4><div class="stat-value">${formatCurrency(r.totalVendas.total)}</div></div>
      <div class="stat-card teal"><h4>Meses com dados</h4><div class="stat-value">${r.vendasPorMes.length}</div></div>
    </div>
    <div class="dashboard-grid">
      <div class="card report-section">
        <h3>Vendas por mês</h3>
        <div class="chart-placeholder">
          ${r.vendasPorMes.reverse().map(v => `
            <div class="chart-bar" style="height:${((v.total || 0) / maxVenda * 160)}px" title="${formatCurrency(v.total)}">
              <span>${v.mes}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="card report-section">
        <h3>Produtos mais vendidos</h3>
        <table class="report-table">
          <thead><tr><th>Produto</th><th>Qtd</th><th>Total</th></tr></thead>
          <tbody>${r.produtosMaisVendidos.length ? r.produtosMaisVendidos.map(p => `
            <tr><td>${p.nome}</td><td>${p.qtd}</td><td>${formatCurrency(p.total)}</td></tr>
          `).join('') : '<tr><td colspan="3">Sem dados</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    <div class="dashboard-grid">
      <div class="card report-section">
        <h3>Top clientes</h3>
        <table class="report-table">
          <thead><tr><th>Cliente</th><th>Compras</th><th>Total</th></tr></thead>
          <tbody>${r.clientesTop.length ? r.clientesTop.map(c => `
            <tr><td>${c.nome}</td><td>${c.qtd}</td><td>${formatCurrency(c.total)}</td></tr>
          `).join('') : '<tr><td colspan="3">Sem dados</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="card report-section">
        <h3>Resumo financeiro</h3>
        <table class="report-table">
          <thead><tr><th>Tipo</th><th>Status</th><th>Total</th></tr></thead>
          <tbody>${r.financeiroResumo.length ? r.financeiroResumo.map(f => `
            <tr><td>${f.tipo}</td><td>${f.status}</td><td>${formatCurrency(f.total)}</td></tr>
          `).join('') : '<tr><td colspan="3">Sem dados</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ===================== HELPERS =====================
function bindTableEvents(pageKey, result, reloadFn) {
  const st = pageState[pageKey];
  const pagId = pageKey === 'ordens-servico' ? 'os-pagination' : 'table-pagination';
  renderPagination(document.getElementById(pagId), result.page, result.totalPages, result.total, result.limit, (p, l) => {
    st.page = p; st.limit = l; reloadFn();
  });
  document.getElementById('table-search').oninput = debounce((e) => {
    st.search = e.target.value; st.page = 1; reloadFn();
  }, 400);
}

function bindEntitySave(id, apiKey, rerender, transform) {
  document.querySelector('.modal-close-btn').onclick = closeModal;
  document.getElementById('entity-save').onclick = async () => {
    const fd = new FormData(document.getElementById('entity-form'));
    const body = Object.fromEntries(fd);
    if (transform) transform(body);
    if (body.preco !== undefined) body.preco = parseFloat(body.preco);
    if (body.estoque !== undefined) body.estoque = parseInt(body.estoque);
    if (body.estoque_minimo !== undefined) body.estoque_minimo = parseInt(body.estoque_minimo);
    if (body.fornecedor_id !== undefined) body.fornecedor_id = body.fornecedor_id || null;
    try {
      if (id) await API[apiKey].update(id, body);
      else await API[apiKey].create(body);
      closeModal(); showToast('Salvo com sucesso!', 'success'); rerender();
    } catch (err) { showToast(err.message, 'error'); }
  };
}
