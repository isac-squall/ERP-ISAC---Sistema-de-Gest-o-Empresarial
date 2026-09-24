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
  try {
    const saved = localStorage.getItem('erp_user');
    if (saved) {
      currentUser = JSON.parse(saved);
      if (currentUser && currentUser.id) showApp();
      else currentUser = null;
    }
  } catch {
    localStorage.removeItem('erp_user');
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
    document.getElementById('ai-chat')?.classList.add('hidden');
    document.getElementById('ai-chat-panel')?.classList.add('hidden');
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
  document.getElementById('notif-panel').onclick = (e) => e.stopPropagation();
  document.addEventListener('click', () => {
    document.getElementById('notif-panel')?.classList.add('hidden');
    closeProdutoMenus();
    fecharPosBusca();
  });

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

  initAssistenteChat();

  document.addEventListener('keydown', (e) => {
    if (currentPage !== 'vendas') return;
    if (e.key === 'F7') { e.preventDefault(); posFinalizarVenda(); return; }
    if (e.key === 'F8') { e.preventDefault(); posProdutoServico(); return; }
    if (e.key === 'F6') { e.preventDefault(); posHistoricoPedido(); return; }
    if (e.key === 'F3') { e.preventDefault(); posCancelarVenda(); return; }
    if (e.ctrlKey && (e.key === 't' || e.key === 'T')) { e.preventDefault(); posNovaAba(); return; }
    if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); posFecharAba(); return; }
    if (e.ctrlKey && e.key === 'ArrowRight') { e.preventDefault(); posIrAba(1); return; }
    if (e.ctrlKey && e.key === 'ArrowLeft') { e.preventDefault(); posIrAba(-1); return; }
  });
}

function userPermissoes() {
  const list = currentUser?.permissoes;
  if (Array.isArray(list) && list.length) return list;
  return currentUser?.cargo === 'Administrador'
    ? ['dashboard', 'vendas', 'caixa', 'financeiro', 'clientes', 'produtos', 'ordens-servico', 'usuarios', 'fornecedores', 'historico-vendas', 'relatorio', 'configuracoes', 'manual']
    : ['dashboard', 'manual'];
}

function canAccess(page) {
  return userPermissoes().includes(page);
}

function applyMenuPermissions() {
  const allowed = userPermissoes();
  document.querySelectorAll('.nav-item').forEach(el => {
    const page = el.dataset.page;
    el.classList.toggle('hidden', page && !allowed.includes(page));
  });
  document.getElementById('settings-btn')?.classList.toggle('hidden', !allowed.includes('configuracoes'));
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-name').textContent = currentUser.nome;
  document.getElementById('ai-chat')?.classList.remove('hidden');
  applyMenuPermissions();
  refreshNotificacoes();
  const start = canAccess('dashboard') ? 'dashboard' : (userPermissoes()[0] || 'manual');
  navigate(start);
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
  if (!canAccess(page)) {
    showToast('Sem permissão para esta página', 'error');
    return;
  }
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
    financeiro: () => { pageState.financeiro.tab = pageState.financeiro.tab || 'pagar'; return renderFinanceiro(); },
    clientes: renderClientes,
    produtos: renderProdutos,
    'ordens-servico': renderOrdensServico,
    usuarios: renderUsuarios,
    fornecedores: renderFornecedores,
    'historico-vendas': renderHistoricoVendas,
    relatorio: () => {
      const st = pageState.relatorio;
      st.periodo = st.periodo || 'mes';
      return renderRelatorio();
    },
    configuracoes: renderConfiguracoes,
    manual: renderManual
  };
  const renderer = renderers[currentPage];
  if (!renderer) {
    content.innerHTML = `<div class="card"><p>Página não encontrada.</p></div>`;
    return;
  }
  try { await renderer(); }
  catch (err) { content.innerHTML = `<div class="card"><p style="color:red">Erro: ${err.message}</p></div>`; }
}

function pageHeader(title, breadcrumb) {
  return `<div class="page-header"><h2>${title}</h2><div class="breadcrumb">${breadcrumb}</div></div>`;
}

// ===================== DASHBOARD =====================
async function renderDashboard() {
  const [d, charts] = await Promise.all([API.dashboard(), API.charts('semana')]);
  const maxReceita = Math.max(...(charts.receita || []).map(r => r.receita || 0), 1);
  const cc = charts.contasClientes || {};
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
        <div class="card-head">
          <h3>Receita da semana</h3>
          <select id="chart-periodo">
            <option value="semana">Semana</option>
            <option value="mes">Mês</option>
            <option value="ano">Ano</option>
          </select>
        </div>
        <div class="chart-placeholder" id="dash-chart">
          ${renderChartBars(charts.receita, maxReceita)}
        </div>
      </div>
      <div class="card">
        <h3>Contas de clientes</h3>
        <div class="contas-resumo">
          <div><span>Vence hoje</span><strong>${cc.venceHoje?.qtd || 0} · ${formatCurrency(cc.venceHoje?.total)}</strong></div>
          <div><span>Atrasado</span><strong class="text-danger">${cc.atrasado?.qtd || 0} · ${formatCurrency(cc.atrasado?.total)}</strong></div>
          <div><span>Pendente</span><strong>${cc.pendente?.qtd || 0} · ${formatCurrency(cc.pendente?.total)}</strong></div>
        </div>
        <div class="dashboard-grid" style="margin-top:16px">
          <div>
            <h4 class="muted">A receber</h4>
            <div class="stat-value" style="color:var(--success);font-size:22px">${formatCurrency(d.contasReceber)}</div>
          </div>
          <div>
            <h4 class="muted">A pagar</h4>
            <div class="stat-value" style="color:var(--danger);font-size:22px">${formatCurrency(d.contasPagar)}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="card">
      <h3>Vendas recentes</h3>
      <table class="data-table">
        <thead><tr><th>#</th><th>Cliente</th><th>Total</th><th>Pagamento</th><th>Data</th></tr></thead>
        <tbody>${d.vendasRecentes.length ? d.vendasRecentes.map(v => `
          <tr><td>${v.id}</td><td>${escapeHtml(v.cliente_nome || 'Avulso')}</td><td>${formatCurrency(v.total)}</td><td>${escapeHtml(v.forma_pagamento || '-')}</td><td>${formatDateTime(v.criado_em)}</td></tr>
        `).join('') : '<tr class="empty-row"><td colspan="5">Nenhuma venda recente</td></tr>'}
        </tbody>
      </table>
    </div>`;
  document.getElementById('chart-periodo').onchange = async (e) => {
    const c = await API.charts(e.target.value);
    const max = Math.max(...(c.receita || []).map(r => r.receita || 0), 1);
    document.getElementById('dash-chart').innerHTML = renderChartBars(c.receita, max);
  };
}

function renderChartBars(rows, max) {
  if (!rows || !rows.length) return '<p class="muted">Sem dados no período</p>';
  return rows.map(v => `
    <div class="chart-bar" style="height:${((v.receita || 0) / max * 160)}px" title="${escapeHtml(v.label)} ${formatCurrency(v.receita)}">
      <span>${escapeHtml(v.label)}</span>
    </div>`).join('');
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
      <td>${escapeHtml(o.cliente_nome || '-')}</td>
      <td>${escapeHtml(o.equipamento || '-')}</td>
      <td>${escapeHtml(o.solicitacao || '-')}</td>
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
  if (id) data = await API.ordensServico.get(id);
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
      <div class="form-group"><label>Equipamento</label><input name="equipamento" value="${escapeHtml(data.equipamento || '')}"></div>
      <div class="form-group"><label>Solicitação</label><textarea name="solicitacao" rows="3">${escapeHtml(data.solicitacao || '')}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Valor previsto</label><input name="valor_previsto" type="number" step="0.01" value="${data.valor_previsto || 0}"></div>
        <div class="form-group"><label>Data prevista</label><input name="data_prevista" type="date" value="${toInputDate(data.data_prevista)}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Data final</label><input name="data_final" type="date" value="${toInputDate(data.data_final)}"></div>
        <div class="form-group"><label>Data entrega</label><input name="data_entrega" type="date" value="${toInputDate(data.data_entrega)}"></div>
      </div>
      <div class="form-group"><label>Observações</label><textarea name="observacoes" rows="2">${escapeHtml(data.observacoes || '')}</textarea></div>
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
  try {
    await API.ordensServico.delete(id);
    showToast('Ordem excluída', 'success');
    renderOrdensServico();
  } catch (err) { showToast(err.message, 'error'); }
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
    <td>${c.id}</td><td>${escapeHtml(c.nome)}</td><td>${escapeHtml(c.cpf_cnpj || '-')}</td><td>${escapeHtml(c.telefone || '-')}</td>
    <td>${escapeHtml(c.email || '-')}</td><td>${escapeHtml(c.cidade || '-')}</td>
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
      <div class="form-group"><label>Nome *</label><input name="nome" value="${escapeHtml(data.nome || '')}" required></div>
      <div class="form-row">
        <div class="form-group"><label>CPF/CNPJ</label><input name="cpf_cnpj" value="${escapeHtml(data.cpf_cnpj || '')}"></div>
        <div class="form-group"><label>Telefone</label><input name="telefone" value="${escapeHtml(data.telefone || '')}"></div>
      </div>
      <div class="form-group"><label>Email</label><input name="email" type="email" value="${escapeHtml(data.email || '')}"></div>
      <div class="form-group"><label>Endereço</label><input name="endereco" value="${escapeHtml(data.endereco || '')}"></div>
      <div class="form-row">
        <div class="form-group"><label>Cidade</label><input name="cidade" value="${escapeHtml(data.cidade || '')}"></div>
        <div class="form-group"><label>Estado</label><input name="estado" value="${escapeHtml(data.estado || '')}"></div>
      </div>
    </form>`,
    `<button class="btn btn-outline modal-close-btn">Cancelar</button><button class="btn btn-primary" id="entity-save">Salvar</button>`);
  bindEntitySave(id, 'clientes', renderClientes);
}

async function deleteCliente(id) {
  if (!confirm('Deseja excluir este cliente?')) return;
  try {
    await API.clientes.delete(id);
    showToast('Cliente excluído', 'success'); renderClientes();
  } catch (err) { showToast(err.message, 'error'); }
}

// ===================== PRODUTOS =====================
async function renderProdutos() {
  const st = pageState.produtos;
  const result = await API.produtos.list({ search: st.search, page: st.page, limit: st.limit });
  document.getElementById('content').innerHTML = `
    ${pageHeader('Produtos', 'Dashboard / Produtos')}
    <div class="toolbar">
      <div class="search-box">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="Pesquisar..." value="${escapeHtml(st.search || '')}" id="table-search">
      </div>
      <span class="toolbar-info">Total de produtos: ${result.total}</span>
      <div class="toolbar-spacer"></div>
      <button class="btn-icon-square" id="produtos-settings" title="Opções"><i class="fas fa-cog"></i></button>
      <button class="btn btn-success" id="produtos-promocoes"><i class="fas fa-percent"></i> Promocoes</button>
      <button class="btn btn-primary" id="table-new">Adicionar</button>
    </div>
    <div class="table-wrapper">
      <table class="data-table produtos-table">
        <thead><tr>
          <th>#</th>
          <th>Foto</th>
          <th>Nome</th>
          <th>Codigo barras</th>
          <th>Preço Venda</th>
          <th>Preço Custo</th>
          <th>qtd <i class="fas fa-check-circle th-ok"></i></th>
          <th>qtd <i class="fas fa-exclamation-triangle th-warn"></i></th>
          <th>Ações</th>
        </tr></thead>
        <tbody id="table-body">${renderProdutosRows(result.data)}</tbody>
      </table>
      <div id="table-pagination"></div>
    </div>`;
  bindTableEvents('produtos', result, loadProdutos);
  document.getElementById('table-new').onclick = () => showProdutoForm();
  document.getElementById('produtos-promocoes').onclick = () => showPromocoesLista();
  document.getElementById('produtos-settings').onclick = () => showProdutosOpcoes();
}

function produtoFotoHtml(p) {
  if (p.foto) return `<img class="produto-foto" src="${escapeHtml(p.foto)}" alt="">`;
  return `<div class="produto-foto produto-foto-placeholder"><i class="fas fa-cube"></i></div>`;
}

function renderProdutosRows(data) {
  if (!data.length) return '<tr class="empty-row"><td colspan="9">Nenhum registro encontrado</td></tr>';
  return data.map((p, i) => `<tr>
    <td>${i + 1}</td>
    <td>${produtoFotoHtml(p)}</td>
    <td>${escapeHtml(p.nome)}${p.promocao_ativa ? ' <span class="promo-tag">promo</span>' : ''}</td>
    <td>${escapeHtml(p.codigo || '-')}</td>
    <td>${formatCurrency(p.preco)}</td>
    <td>${formatCurrency(p.preco_custo)}</td>
    <td>${p.estoque}</td>
    <td>${p.estoque_minimo || 0}</td>
    <td class="actions-cell">
      <div class="action-menu-wrap">
        <button class="btn-icon-square btn-menu" onclick="toggleProdutoMenu(event, ${p.id})" title="Ações">
          <i class="fas fa-ellipsis-v"></i>
        </button>
        <div class="action-dropdown" id="produto-menu-${p.id}">
          <button type="button" onclick="showProdutoForm(${p.id})"><i class="fas fa-edit menu-edit"></i> Editar produto</button>
          <button type="button" onclick="imprimirPrecoProduto(${p.id})"><i class="fas fa-print menu-print"></i> Imprimir preço</button>
          <button type="button" onclick="imprimirCodigoBarras(${p.id})"><i class="fas fa-barcode menu-barcode"></i> Código de barras</button>
          <button type="button" onclick="showProdutoPromocao(${p.id})"><i class="fas fa-percent menu-promo"></i> Promoção do produto</button>
          <div class="action-sep"></div>
          <button type="button" onclick="showEstoqueMovimento(${p.id}, 'entrada')"><i class="fas fa-cart-plus menu-in"></i> Compra/entrada</button>
          <button type="button" onclick="showEstoqueMovimento(${p.id}, 'ajuste')"><i class="fas fa-sync-alt menu-ajuste"></i> Ajustar estoque</button>
          <button type="button" onclick="showEstoqueMovimento(${p.id}, 'inventario')"><i class="fas fa-clipboard-check menu-inv"></i> Inventário</button>
          <div class="action-sep"></div>
          <button type="button" class="danger" onclick="deleteProduto(${p.id})"><i class="fas fa-trash"></i> Excluir produto</button>
        </div>
      </div>
    </td></tr>`).join('');
}

function closeProdutoMenus() {
  document.querySelectorAll('.action-dropdown.open').forEach(el => el.classList.remove('open'));
}

function toggleProdutoMenu(e, id) {
  e.preventDefault();
  e.stopPropagation();
  const menu = document.getElementById('produto-menu-' + id);
  if (!menu) return;
  const wasOpen = menu.classList.contains('open');
  closeProdutoMenus();
  if (wasOpen) return;
  const rect = e.currentTarget.getBoundingClientRect();
  menu.classList.add('open');
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
  menu.style.left = 'auto';
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

function bindProdutoFoto() {
  const file = document.getElementById('produto-foto-file');
  if (!file) return;
  file.onchange = () => {
    const f = file.files && file.files[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { showToast('Imagem deve ter no máximo 2MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      document.getElementById('produto-foto-value').value = reader.result;
      const preview = document.getElementById('produto-foto-preview');
      preview.src = reader.result;
      preview.classList.remove('hidden');
      document.getElementById('produto-foto-placeholder')?.classList.add('hidden');
    };
    reader.readAsDataURL(f);
  };
}

async function showProdutoForm(id) {
  closeProdutoMenus();
  let data = {};
  if (id) data = await API.produtos.get(id);
  const fornecedores = await API.fornecedores.all();
  const foto = data.foto || '';
  openModal(id ? 'Editar produto' : 'Adicionar produto', `
    <form id="entity-form">
      <div class="form-group">
        <label>Foto</label>
        <div class="foto-upload">
          <img id="produto-foto-preview" class="produto-foto-lg ${foto ? '' : 'hidden'}" src="${escapeHtml(foto)}" alt="">
          <div id="produto-foto-placeholder" class="produto-foto-lg produto-foto-placeholder ${foto ? 'hidden' : ''}"><i class="fas fa-cube"></i></div>
          <input type="file" id="produto-foto-file" accept="image/*">
          <input type="hidden" name="foto" id="produto-foto-value" value="${escapeHtml(foto)}">
        </div>
      </div>
      <div class="form-group"><label>Nome *</label><input name="nome" value="${escapeHtml(data.nome || '')}" required></div>
      <div class="form-row">
        <div class="form-group"><label>Código de barras</label><input name="codigo" value="${escapeHtml(data.codigo || '')}"></div>
        <div class="form-group"><label>Categoria</label><input name="categoria" value="${escapeHtml(data.categoria || '')}"></div>
      </div>
      <div class="form-group"><label>Descrição</label><textarea name="descricao" rows="2">${escapeHtml(data.descricao || '')}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Preço venda</label><input name="preco" type="number" step="0.01" value="${data.preco || 0}"></div>
        <div class="form-group"><label>Preço custo</label><input name="preco_custo" type="number" step="0.01" value="${data.preco_custo || 0}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Estoque (qtd)</label><input name="estoque" type="number" value="${data.estoque || 0}"></div>
        <div class="form-group"><label>Estoque mínimo</label><input name="estoque_minimo" type="number" value="${data.estoque_minimo || 0}"></div>
      </div>
      <div class="form-group"><label>Fornecedor</label>
        <select name="fornecedor_id"><option value="">Nenhum</option>
          ${fornecedores.map(f => `<option value="${f.id}" ${data.fornecedor_id == f.id ? 'selected' : ''}>${escapeHtml(f.nome)}</option>`).join('')}
        </select></div>
      <div class="form-row">
        <div class="form-group"><label>NCM</label><input name="ncm" value="${escapeHtml(data.ncm || '00000000')}" maxlength="8" placeholder="00000000"></div>
        <div class="form-group"><label>CFOP</label><input name="cfop" value="${escapeHtml(data.cfop || '5102')}" maxlength="4"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Unidade</label><input name="unidade" value="${escapeHtml(data.unidade || 'UN')}" maxlength="6"></div>
        <div class="form-group"><label>Origem ICMS</label>
          <select name="origem">
            ${['0 - Nacional','1 - Estrangeira (importacao direta)','2 - Estrangeira (mercado interno)'].map((o, i) =>
              `<option value="${i}" ${String(data.origem || '0') === String(i) ? 'selected' : ''}>${o}</option>`).join('')}
          </select></div>
      </div>
    </form>`,
    `<button class="btn btn-outline modal-close-btn">Cancelar</button><button class="btn btn-primary" id="entity-save">Salvar</button>`);
  bindEntitySave(id, 'produtos', renderProdutos);
  bindProdutoFoto();
}

async function deleteProduto(id) {
  closeProdutoMenus();
  if (!confirm('Deseja excluir este produto?')) return;
  try {
    await API.produtos.delete(id);
    showToast('Produto excluído', 'success'); renderProdutos();
  } catch (err) { showToast(err.message, 'error'); }
}

async function imprimirPrecoProduto(id) {
  closeProdutoMenus();
  const p = await API.produtos.get(id);
  const area = document.getElementById('print-area');
  area.innerHTML = `
    <div class="etiqueta-preco">
      <div class="etiqueta-nome">${escapeHtml(p.nome)}</div>
      ${p.codigo ? `<div class="etiqueta-codigo">${escapeHtml(p.codigo)}</div>` : ''}
      <div class="etiqueta-valor">${formatCurrency(p.preco)}</div>
    </div>`;
  area.classList.remove('hidden');
  window.print();
  area.classList.add('hidden');
}

function drawBarcode(svgId, code) {
  if (window.JsBarcode) {
    try { JsBarcode('#' + svgId, code, { format: 'CODE128', width: 2, height: 60, fontSize: 14, margin: 8 }); return; }
    catch {}
  }
  const el = document.getElementById(svgId);
  if (el) el.outerHTML = `<div class="barcode-fallback">${escapeHtml(code)}</div>`;
}

async function imprimirCodigoBarras(id) {
  closeProdutoMenus();
  const p = await API.produtos.get(id);
  const codigo = p.codigo || String(p.id).padStart(8, '0');
  const area = document.getElementById('print-area');
  area.innerHTML = `
    <div class="etiqueta-barcode">
      <div class="etiqueta-nome">${escapeHtml(p.nome)}</div>
      <svg id="barcode-svg"></svg>
      <div class="etiqueta-valor">${formatCurrency(p.preco)}</div>
    </div>`;
  area.classList.remove('hidden');
  drawBarcode('barcode-svg', codigo);
  window.print();
  area.classList.add('hidden');
}

async function showProdutoPromocao(id) {
  closeProdutoMenus();
  const [p, lista] = await Promise.all([API.produtos.get(id), API.produtos.promocoes(id)]);
  openModal('Promoção do produto', `
    <p class="muted" style="margin-bottom:12px">${escapeHtml(p.nome)} · Preço atual ${formatCurrency(p.preco)}</p>
    <form id="promo-form">
      <div class="form-group"><label>Descrição</label><input name="descricao" placeholder="Ex: Oferta da semana"></div>
      <div class="form-row">
        <div class="form-group"><label>Tipo</label>
          <select name="tipo">
            <option value="percentual">Percentual (%)</option>
            <option value="valor">Valor fixo (R$)</option>
          </select>
        </div>
        <div class="form-group"><label>Valor</label><input name="valor" type="number" step="0.01" value="0"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Início</label><input name="data_inicio" type="date"></div>
        <div class="form-group"><label>Fim</label><input name="data_fim" type="date"></div>
      </div>
    </form>
    <h4 style="margin:16px 0 8px">Promoções</h4>
    <table class="data-table"><thead><tr><th>Descrição</th><th>Tipo</th><th>Valor</th><th>Período</th><th>Status</th></tr></thead>
    <tbody>${lista.length ? lista.map(pr => `<tr>
      <td>${escapeHtml(pr.descricao || '-')}</td>
      <td>${pr.tipo === 'valor' ? 'Valor' : '%'}</td>
      <td>${pr.tipo === 'valor' ? formatCurrency(pr.valor) : (pr.valor || 0) + '%'}</td>
      <td>${formatDate(pr.data_inicio)} a ${formatDate(pr.data_fim)}</td>
      <td><span class="status-badge ${pr.ativo ? 'ativo' : 'inativo'}">${pr.ativo ? 'Ativa' : 'Inativa'}</span></td>
    </tr>`).join('') : '<tr class="empty-row"><td colspan="5">Nenhuma promoção</td></tr>'}</tbody></table>`,
    `<button class="btn btn-outline modal-close-btn">Fechar</button><button class="btn btn-success" id="promo-save">Salvar promoção</button>`);
  document.querySelector('.modal-close-btn').onclick = closeModal;
  document.getElementById('promo-save').onclick = async () => {
    const fd = new FormData(document.getElementById('promo-form'));
    const body = Object.fromEntries(fd);
    body.valor = parseFloat(body.valor) || 0;
    try {
      await API.produtos.addPromocao(id, body);
      closeModal(); showToast('Promoção salva', 'success'); renderProdutos();
    } catch (err) { showToast(err.message, 'error'); }
  };
}

async function showPromocoesLista() {
  const lista = await API.promocoes.list();
  openModal('Promoções', `
    <table class="data-table"><thead><tr><th>Produto</th><th>Descrição</th><th>Tipo</th><th>Valor</th><th>Período</th><th>Status</th></tr></thead>
    <tbody>${lista.length ? lista.map(pr => `<tr>
      <td>${escapeHtml(pr.produto_nome)}</td>
      <td>${escapeHtml(pr.descricao || '-')}</td>
      <td>${pr.tipo === 'valor' ? 'Valor' : '%'}</td>
      <td>${pr.tipo === 'valor' ? formatCurrency(pr.valor) : (pr.valor || 0) + '%'}</td>
      <td>${formatDate(pr.data_inicio)} a ${formatDate(pr.data_fim)}</td>
      <td><span class="status-badge ${pr.ativo ? 'ativo' : 'inativo'}">${pr.ativo ? 'Ativa' : 'Inativa'}</span></td>
    </tr>`).join('') : '<tr class="empty-row"><td colspan="6">Nenhuma promoção cadastrada</td></tr>'}</tbody></table>`,
    `<button class="btn btn-outline modal-close-btn">Fechar</button>`);
  document.querySelector('.modal-close-btn').onclick = closeModal;
}

function showProdutosOpcoes() {
  openModal('Opções de produtos', `
    <p class="muted">Use o menu de ações de cada produto para editar, imprimir preço, gerar código de barras, criar promoção, registrar compra/entrada, ajustar estoque ou fazer inventário.</p>`,
    `<button class="btn btn-primary modal-close-btn">Ok</button>`);
  document.querySelector('.modal-close-btn').onclick = closeModal;
}

async function showEstoqueMovimento(id, tipo) {
  closeProdutoMenus();
  const p = await API.produtos.get(id);
  const titulos = { entrada: 'Compra/entrada', ajuste: 'Ajustar estoque', inventario: 'Inventário' };
  const hints = {
    entrada: 'Informe a quantidade comprada. O estoque será somado.',
    ajuste: 'Informe um valor positivo para entrada ou negativo para saída.',
    inventario: 'Informe a quantidade real contada. O estoque será substituído.'
  };
  openModal(titulos[tipo] || 'Estoque', `
    <p style="margin-bottom:8px"><strong>${escapeHtml(p.nome)}</strong></p>
    <p class="muted" style="margin-bottom:14px">Estoque atual: <strong>${p.estoque}</strong> · Mínimo: ${p.estoque_minimo || 0}</p>
    <p class="muted" style="margin-bottom:14px">${hints[tipo]}</p>
    <form id="estoque-form">
      <div class="form-group"><label>${tipo === 'inventario' ? 'Quantidade contada' : 'Quantidade'}</label>
        <input name="quantidade" type="number" ${tipo === 'entrada' ? 'min="1"' : ''} value="${tipo === 'inventario' ? p.estoque : 1}" required>
      </div>
      <div class="form-group"><label>Observação</label><input name="observacao" placeholder="Opcional"></div>
    </form>`,
    `<button class="btn btn-outline modal-close-btn">Cancelar</button><button class="btn btn-primary" id="estoque-save">Confirmar</button>`);
  document.querySelector('.modal-close-btn').onclick = closeModal;
  document.getElementById('estoque-save').onclick = async () => {
    const form = document.getElementById('estoque-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    try {
      await API.produtos.estoque(id, {
        tipo,
        quantidade: parseInt(fd.get('quantidade'), 10),
        observacao: fd.get('observacao'),
        usuario_id: currentUser && currentUser.id
      });
      closeModal(); showToast('Estoque atualizado', 'success'); renderProdutos();
    } catch (err) { showToast(err.message, 'error'); }
  };
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
    <td>${f.id}</td><td>${escapeHtml(f.nome)}</td><td>${escapeHtml(f.cnpj || '-')}</td><td>${escapeHtml(f.telefone || '-')}</td><td>${escapeHtml(f.email || '-')}</td>
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
  if (id) data = await API.fornecedores.get(id);
  openModal(id ? 'Editar Fornecedor' : 'Novo Fornecedor', `
    <form id="entity-form">
      <div class="form-group"><label>Nome *</label><input name="nome" value="${escapeHtml(data.nome || '')}" required></div>
      <div class="form-row">
        <div class="form-group"><label>CNPJ</label><input name="cnpj" value="${escapeHtml(data.cnpj || '')}"></div>
        <div class="form-group"><label>Telefone</label><input name="telefone" value="${escapeHtml(data.telefone || '')}"></div>
      </div>
      <div class="form-group"><label>Email</label><input name="email" type="email" value="${escapeHtml(data.email || '')}"></div>
      <div class="form-group"><label>Endereço</label><input name="endereco" value="${escapeHtml(data.endereco || '')}"></div>
    </form>`,
    `<button class="btn btn-outline modal-close-btn">Cancelar</button><button class="btn btn-primary" id="entity-save">Salvar</button>`);
  bindEntitySave(id, 'fornecedores', renderFornecedores);
}

async function deleteFornecedor(id) {
  if (!confirm('Deseja excluir este fornecedor?')) return;
  try {
    await API.fornecedores.delete(id);
    showToast('Fornecedor excluído', 'success'); renderFornecedores();
  } catch (err) { showToast(err.message, 'error'); }
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
    <td>${u.id}</td><td>${escapeHtml(u.nome)}</td><td>${escapeHtml(u.email)}</td>
    <td><span class="status-badge aberta">${escapeHtml(u.cargo || '-')}</span></td>
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
  if (id) data = await API.usuarios.get(id);
  const perfis = await API.perfis.list();
  const niveis = (perfis.data || []).map(p => p.nome);
  if (!niveis.length) niveis.push('Administrador', 'Gerente', 'Vendedor', 'Caixa');
  const cargoAtual = data.cargo || 'Vendedor';
  openModal(id ? 'Editar usuario' : 'Novo usuario', `
    <form id="entity-form">
      <div class="form-row">
        <div class="form-group"><label>Usuario *</label>
          <input name="nome" value="${escapeHtml(data.nome || '')}" required></div>
        <div class="form-group"><label>Celular</label>
          <input name="celular" value="${escapeHtml(data.celular || '')}" placeholder="Inserir o celular"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Data de nascimento</label>
          <input name="data_nascimento" type="date" value="${toInputDate(data.data_nascimento)}"></div>
        <div class="form-group"><label>E-mail *</label>
          <input name="email" type="email" value="${escapeHtml(data.email || '')}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Nivel de acesso *</label>
          <select name="cargo" id="usuario-cargo">
            ${niveis.map(c => `<option ${cargoAtual === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>CPF do usuario</label>
          <input name="cpf" value="${escapeHtml(data.cpf || '')}" placeholder="Informe o CPF"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Tipo pessoa</label>
          <div class="tipo-toggle">
            <label class="${(data.tipo_pessoa || 'PF') === 'PF' ? 'active' : ''}">
              <input type="radio" name="tipo_pessoa" value="PF" ${(data.tipo_pessoa || 'PF') === 'PF' ? 'checked' : ''}> PF
            </label>
            <label class="${data.tipo_pessoa === 'PJ' ? 'active' : ''}">
              <input type="radio" name="tipo_pessoa" value="PJ" ${data.tipo_pessoa === 'PJ' ? 'checked' : ''}> PJ
            </label>
          </div>
        </div>
        ${id ? `<div class="form-group"><label>Status</label>
          <select name="ativo"><option value="1" ${data.ativo ? 'selected' : ''}>Ativo</option><option value="0" ${!data.ativo ? 'selected' : ''}>Inativo</option></select></div>` : '<div></div>'}
      </div>
      <div class="form-row">
        <div class="form-group"><label>${id ? 'Inserir senha' : 'Senha *'}</label>
          <input name="senha" type="password" placeholder="Inserir senha" ${id ? '' : 'required'}></div>
        <div class="form-group"><label>Repetir senha</label>
          <input id="usuario-senha2" type="password" placeholder="Repita a senha" ${id ? '' : 'required'}></div>
      </div>
      ${id ? '<label class="check-label"><input type="checkbox" id="usuario-reset"> Resetar senha?</label>' : ''}
    </form>`,
    `${id ? '<button class="btn btn-purple" id="usuario-perfil">Perfil de acesso</button>' : ''}
     <button class="btn btn-outline modal-close-btn">Cancelar</button>
     <button class="btn btn-primary" id="entity-save">${id ? 'Salvar alteracoes' : 'Salvar'}</button>`);
  document.querySelectorAll('.tipo-toggle input').forEach(inp => {
    inp.onchange = () => {
      document.querySelectorAll('.tipo-toggle label').forEach(l => l.classList.toggle('active', l.querySelector('input').checked));
    };
  });
  bindEntitySave(id, 'usuarios', renderUsuarios, (body) => {
    if (body.ativo !== undefined) body.ativo = +body.ativo;
    const senha2 = document.getElementById('usuario-senha2')?.value || '';
    if (body.senha && body.senha !== senha2) throw new Error('As senhas nao conferem');
    if (id && !document.getElementById('usuario-reset')?.checked) delete body.senha;
    if (id && document.getElementById('usuario-reset')?.checked && !body.senha) {
      throw new Error('Informe a nova senha para resetar');
    }
  });
  const perfilBtn = document.getElementById('usuario-perfil');
  if (perfilBtn) {
    perfilBtn.onclick = () => showPerfilAcesso(document.getElementById('usuario-cargo').value);
  }
}

async function showPerfilAcesso(nomeCargo) {
  const lista = await API.perfis.list();
  const perfil = (lista.data || []).find(p => p.nome === nomeCargo);
  if (!perfil) { showToast('Perfil nao encontrado', 'error'); return; }
  const opcoes = lista.opcoes || [];
  const marcadas = new Set(perfil.permissoes || []);
  openModal('Editar perfil de acesso', `
    <form id="perfil-form">
      <div class="form-group"><label>Nome do perfil</label>
        <input name="nome" value="${escapeHtml(perfil.nome)}" required></div>
      <div class="form-group"><label>Descricao</label>
        <input name="descricao" value="${escapeHtml(perfil.descricao || '')}"></div>
      <div class="perm-box">
        <h4>Permissoes do perfil</h4>
        ${opcoes.map(o => `
          <label class="check-label">
            <input type="checkbox" name="perm" value="${o.key}" ${marcadas.has(o.key) ? 'checked' : ''}>
            ${escapeHtml(o.label)} (${o.key})
          </label>`).join('')}
      </div>
    </form>`,
    '<button class="btn btn-outline modal-close-btn">Cancelar</button><button class="btn btn-primary" id="perfil-save">Salvar perfil</button>');
  document.querySelector('.modal-close-btn').onclick = closeModal;
  document.getElementById('perfil-save').onclick = async () => {
    const form = document.getElementById('perfil-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const body = {
      nome: fd.get('nome'),
      descricao: fd.get('descricao') || '',
      permissoes: [...form.querySelectorAll('input[name="perm"]:checked')].map(i => i.value)
    };
    try {
      await API.perfis.update(perfil.id, body);
      if (currentUser?.cargo === perfil.nome || currentUser?.cargo === body.nome) {
        currentUser.cargo = body.nome;
        currentUser.permissoes = body.permissoes;
        localStorage.setItem('erp_user', JSON.stringify(currentUser));
        applyMenuPermissions();
      }
      closeModal();
      showToast('Perfil atualizado', 'success');
      renderUsuarios();
    } catch (err) { showToast(err.message, 'error'); }
  };
}

async function deleteUsuario(id) {
  if (!confirm('Deseja desativar este usuário?')) return;
  try {
    await API.usuarios.delete(id);
    showToast('Usuário desativado', 'success'); renderUsuarios();
  } catch (err) { showToast(err.message, 'error'); }
}

// ===================== VENDAS (POS) =====================
let posProdutos = [];
let erpConfig = {};
let posTabs = [];
let posTabIndex = 0;
let posSearchField = 'produto';
let posOsResultados = [];
let posBuscaTimer = null;

const POS_BUSCA = [
  { value: 'produto', label: 'Produto', hint: 'Nome, codigo de barras, SKU ou ID' },
  { value: 'categoria', label: 'Categoria', hint: 'Lista produtos da categoria digitada' },
  { value: 'os', label: 'Ordem de serviço', hint: 'Cliente, aparelho, problema ou numero da OS' }
];

function posTabAtual() { return posTabs[posTabIndex]; }

function posSubtotal(tab = posTabAtual()) {
  return (tab?.itens || []).reduce((s, i) => s + i.quantidade * i.preco_unitario, 0);
}

function posDesconto(tab = posTabAtual()) { return Number(tab?.desconto) || 0; }

function posTotalComTaxa(tab, forma) {
  const subtotal = posSubtotal(tab);
  let total = Math.max(0, subtotal - posDesconto(tab));
  let taxa = 0;
  if (forma === 'Cartão Crédito') taxa = total * (parseFloat(erpConfig.taxa_credito || 0) / 100);
  if (forma === 'Cartão Débito') taxa = total * (parseFloat(erpConfig.taxa_debito || 0) / 100);
  return { subtotal, desconto: posDesconto(tab), taxa, total: total + taxa };
}

function salvarPosTabs() {
  try { sessionStorage.setItem('erp_pos_tabs', JSON.stringify({ tabs: posTabs, index: posTabIndex })); } catch {}
}

function novaPosTab(cliente) {
  posTabs.push({
    id: Date.now() + Math.random(),
    cliente_id: cliente?.id || null,
    cliente_nome: cliente?.nome || 'Visitante',
    itens: [],
    desconto: 0
  });
  posTabIndex = posTabs.length - 1;
  salvarPosTabs();
  return posTabAtual();
}

function posNovaAba() { novaPosTab(); updatePosUI(); }

function posIrAba(dir) {
  if (posTabs.length < 2) return;
  posTabIndex = (posTabIndex + dir + posTabs.length) % posTabs.length;
  salvarPosTabs();
  updatePosUI();
}

function posFecharAba() {
  if (posTabs.length <= 1) { showToast('Não é possível fechar a única aba', 'error'); return; }
  posTabs.splice(posTabIndex, 1);
  if (posTabIndex >= posTabs.length) posTabIndex = posTabs.length - 1;
  salvarPosTabs();
  updatePosUI();
  showToast('Aba fechada', 'success');
}

async function renderVendas() {
  const [produtos, caixaStatus, cfg] = await Promise.all([
    API.produtos.all(), API.caixa.status(), API.config.get()
  ]);
  posProdutos = produtos;
  erpConfig = cfg || {};

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

  const salvo = (() => {
    try { return JSON.parse(sessionStorage.getItem('erp_pos_tabs') || 'null'); } catch { return null; }
  })();
  if (salvo?.tabs?.length && Array.isArray(salvo.tabs)) {
    posTabs = salvo.tabs;
    posTabIndex = Math.min(Math.max(0, salvo.index || 0), posTabs.length - 1);
  } else {
    posTabs = [];
    posTabIndex = 0;
    novaPosTab();
  }

  document.getElementById('content').innerHTML = `
    <div class="pos-topbar">
      <div class="pos-topbar-left">
        <button class="pos-round" id="pos-aba-prev" title="Aba anterior"><i class="fas fa-chevron-left"></i></button>
        <button class="pos-client" id="pos-cliente-btn">
          <i class="fas fa-shopping-cart"></i>
          <span id="pos-cliente-nome">Visitante</span>
        </button>
      </div>
      <div class="pos-topbar-right">
        <button class="pos-round" id="pos-aba-next" title="Próxima aba"><i class="fas fa-chevron-right"></i></button>
        <button class="pos-round pos-round-add" id="pos-aba-nova" title="Nova aba (Ctrl+T)"><i class="fas fa-plus"></i></button>
        <span class="pos-tab-indicator" id="pos-tab-indicator">1/1</span>
      </div>
    </div>
    <div class="pos-search-row">
      <div class="pos-search">
        <button type="button" class="pos-search-toggle" id="pos-search-toggle" title="Buscar em">
          <i class="fas fa-search"></i>
          <i class="fas fa-chevron-down"></i>
        </button>
        <div class="pos-search-menu hidden" id="pos-search-menu">
          <div class="pos-search-menu-title">BUSCAR EM</div>
          ${POS_BUSCA.map(c => `
            <button type="button" class="pos-search-option${c.value === posSearchField ? ' active' : ''}" data-field="${c.value}">
              <strong>${c.label}</strong>
              <span>${c.hint}</span>
            </button>`).join('')}
        </div>
        <input type="text" id="pos-search" placeholder="${posBuscaPlaceholder()}" autocomplete="off">
        <div class="pos-results hidden" id="pos-results"></div>
      </div>
      <div class="pos-search-actions">
        <button class="btn btn-primary" id="pos-pdf"><i class="fas fa-download"></i> PDF</button>
        <button class="btn btn-teal" id="pos-orcamento"><i class="fas fa-shopping-cart"></i> Orçamento</button>
      </div>
    </div>
    <div class="pos-layout">
      <div class="pos-main">
        <table class="data-table pos-table">
          <thead><tr>
            <th>#</th><th>Produto</th><th>Código de barras</th><th>Itens</th><th>Preço</th><th>Total</th>
          </tr></thead>
          <tbody id="pos-tbody"></tbody>
        </table>
      </div>
      <div class="pos-side">
        <div class="pos-side-head">
          <div class="pos-side-stat"><span>Itens</span><strong id="pos-itens">0</strong></div>
          <div class="pos-side-stat pos-side-total"><span>Total</span><strong id="pos-total">${formatCurrency(0)}</strong></div>
        </div>
        <div class="pos-side-btns">
          <button class="pos-action pos-f7" id="pos-f7"><span>F7 - Finalizar venda</span></button>
          <button class="pos-action pos-f8" id="pos-f8"><span>F8 - Produto / serviço</span></button>
          <button class="pos-action pos-f6" id="pos-f6"><span>F6 - Histórico pedido</span></button>
          <button class="pos-action pos-f3" id="pos-f3"><span>F3 - Cancelar venda</span></button>
        </div>
        <div class="pos-shortcuts">
          <h4>ATALHOS</h4>
          <p>F7 = Finalizar venda</p>
          <p>F8 = Produto / serviço</p>
          <p>F3 = Cancelar venda</p>
          <p>Ctrl+T = Adicionar nova aba</p>
          <p>Ctrl+W = Exclusão de aba</p>
          <p>&larr; &rarr; = Alternar abas</p>
        </div>
      </div>
    </div>`;

  updatePosUI();

  const searchEl = document.getElementById('pos-search');
  const menuEl = document.getElementById('pos-search-menu');
  const toggleEl = document.getElementById('pos-search-toggle');
  toggleEl.onclick = (e) => {
    e.stopPropagation();
    const vaiAbrir = menuEl.classList.contains('hidden');
    if (vaiAbrir) esconderPosResultados();
    menuEl.classList.toggle('hidden');
  };
  menuEl.onclick = (e) => e.stopPropagation();
  menuEl.querySelectorAll('.pos-search-option').forEach(btn => {
    btn.onclick = () => {
      posSearchField = btn.dataset.field;
      menuEl.querySelectorAll('.pos-search-option').forEach(b => b.classList.toggle('active', b.dataset.field === posSearchField));
      menuEl.classList.add('hidden');
      searchEl.placeholder = posBuscaPlaceholder();
      searchEl.value = '';
      searchEl.focus();
      if (posSearchField === 'os') mostrarPosResultados('');
      else esconderPosResultados();
    };
  });
  searchEl.onclick = (e) => e.stopPropagation();
  document.querySelector('.pos-search').onclick = (e) => e.stopPropagation();
  searchEl.onfocus = () => {
    if (posSearchField === 'os') mostrarPosResultados(searchEl.value);
  };
  searchEl.oninput = (e) => {
    clearTimeout(posBuscaTimer);
    const q = e.target.value;
    posBuscaTimer = setTimeout(() => mostrarPosResultados(q), posSearchField === 'os' ? 180 : 0);
  };
  searchEl.onkeydown = async (e) => {
    if (e.key === 'Escape') { fecharPosBusca(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = e.target.value.trim();
    if (!q) return;
    if (posSearchField === 'os') {
      await mostrarPosResultados(q);
      if (posOsResultados.length === 1) {
        posAdicionarOS(posOsResultados[0]);
        searchEl.value = '';
        esconderPosResultados();
      } else if (!posOsResultados.length) {
        showToast('Ordem de serviço não encontrada', 'error');
      }
      return;
    }
    if (posSearchField === 'produto') {
      try {
        const p = await API.produtos.byCodigo(q);
        posAdicionarItem(p);
        searchEl.value = '';
        esconderPosResultados();
        return;
      } catch {}
    }
    const achados = posFiltrarProdutos(q);
    if (achados.length) {
      posAdicionarItem(achados[0]);
      searchEl.value = '';
      esconderPosResultados();
    } else {
      showToast(posSearchField === 'categoria' ? 'Nenhum produto nesta categoria' : 'Produto não encontrado', 'error');
    }
  };

  document.getElementById('pos-aba-prev').onclick = () => posIrAba(-1);
  document.getElementById('pos-aba-next').onclick = () => posIrAba(1);
  document.getElementById('pos-aba-nova').onclick = posNovaAba;
  document.getElementById('pos-cliente-btn').onclick = posSelecionarCliente;
  document.getElementById('pos-pdf').onclick = () => posImprimirPedido('Pedido');
  document.getElementById('pos-orcamento').onclick = posGerarOrcamento;
  document.getElementById('pos-f7').onclick = posFinalizarVenda;
  document.getElementById('pos-f8').onclick = posProdutoServico;
  document.getElementById('pos-f6').onclick = posHistoricoPedido;
  document.getElementById('pos-f3').onclick = posCancelarVenda;
}

function posBuscaPlaceholder() {
  if (posSearchField === 'categoria') return 'Buscar categoria';
  if (posSearchField === 'os') return 'Buscar ordem de serviço';
  return 'Buscar produto';
}

function posFiltrarProdutos(term, campo) {
  const t = (term || '').trim().toLowerCase();
  if (!t) return [];
  const field = campo || posSearchField;
  return (posProdutos || []).filter(p => {
    if (field === 'categoria') return String(p.categoria || '').toLowerCase().includes(t);
    const nome = String(p.nome || '').toLowerCase();
    const codigo = String(p.codigo || '').toLowerCase();
    const sku = String(p.categoria || '').toLowerCase();
    return nome.includes(t) || codigo.includes(t) || sku.includes(t) || String(p.id) === t;
  }).slice(0, 12);
}

async function mostrarPosResultados(term) {
  const box = document.getElementById('pos-results');
  if (!box) return;
  const q = (term || '').trim();
  if (!q && posSearchField !== 'os') { esconderPosResultados(); return; }
  if (posSearchField === 'os') {
    try {
      const result = await API.ordensServico.list({ search: q, page: 1, limit: 12 });
      posOsResultados = (result.data || []).filter(o => !['Entregue', 'Cancelada'].includes(o.status));
    } catch {
      posOsResultados = [];
    }
    if (!posOsResultados.length) {
      box.innerHTML = '<div class="pos-result pos-result-empty">Nenhuma ordem de serviço encontrada</div>';
      box.classList.remove('hidden');
      return;
    }
    box.innerHTML = posOsResultados.map(o => `
      <div class="pos-result" data-os="${o.id}">
        <div>
          <strong>OS ${o.id} · ${escapeHtml(o.equipamento || 'Equipamento')}</strong><br>
          <small>${escapeHtml(o.cliente_nome || 'Sem cliente')} · ${escapeHtml(o.solicitacao || o.status)}</small>
        </div>
        <div class="pos-result-right">${formatCurrency(o.valor_previsto)}<br><small>${escapeHtml(o.status)}</small></div>
      </div>`).join('');
    box.classList.remove('hidden');
    box.querySelectorAll('[data-os]').forEach(el => {
      el.onclick = () => {
        const os = posOsResultados.find(x => x.id === +el.dataset.os);
        if (os) posAdicionarOS(os);
        document.getElementById('pos-search').value = '';
        esconderPosResultados();
      };
    });
    return;
  }
  const achados = posFiltrarProdutos(q);
  if (!achados.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.innerHTML = achados.map(p => `
    <div class="pos-result" data-id="${p.id}">
      <div><strong>${escapeHtml(p.nome)}</strong><br><small>${escapeHtml(p.codigo || p.categoria || 'sem código')}</small></div>
      <div class="pos-result-right">${formatCurrency(p.preco)}<br><small>Est. ${p.estoque}</small></div>
    </div>`).join('');
  box.classList.remove('hidden');
  box.querySelectorAll('.pos-result').forEach(el => {
    el.onclick = () => {
      const p = posProdutos.find(x => x.id === +el.dataset.id);
      if (p) posAdicionarItem(p);
      document.getElementById('pos-search').value = '';
      esconderPosResultados();
    };
  });
}

function esconderPosResultados() {
  const box = document.getElementById('pos-results');
  if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
  posOsResultados = [];
}

function fecharPosBusca() {
  document.getElementById('pos-search-menu')?.classList.add('hidden');
  esconderPosResultados();
}

function posAdicionarOS(os) {
  if (!os) return;
  if (['Entregue', 'Cancelada'].includes(os.status)) {
    showToast('Esta ordem de serviço não pode ser cobrada', 'error');
    return;
  }
  const tab = posTabAtual();
  if (tab.itens.some(i => i.os_id === os.id)) {
    showToast('Esta OS já está no carrinho', 'error');
    return;
  }
  tab.itens.push({
    produto_id: null, servico: true, os_id: os.id,
    nome: `OS ${os.id} · ${os.equipamento || 'Serviço'}`,
    codigo: `OS-${os.id}`,
    preco_unitario: Number(os.valor_previsto) || 0,
    quantidade: 1, estoque: null
  });
  if (!tab.cliente_id && os.cliente_id) {
    tab.cliente_id = os.cliente_id;
    tab.cliente_nome = os.cliente_nome || tab.cliente_nome;
  }
  salvarPosTabs();
  updatePosUI();
  showToast(`OS ${os.id} adicionada`, 'success');
}

function posAdicionarItem(produto, quantidade) {
  if (!produto) return;
  if (produto.estoque <= 0) { showToast('Produto sem estoque', 'error'); return; }
  const tab = posTabAtual();
  const qtd = Math.max(1, parseInt(quantidade, 10) || 1);
  const existente = tab.itens.find(i => i.produto_id === produto.id);
  if (existente) {
    if (existente.quantidade + qtd > produto.estoque) { showToast('Estoque insuficiente', 'error'); return; }
    existente.quantidade += qtd;
  } else {
    if (qtd > produto.estoque) { showToast('Estoque insuficiente', 'error'); return; }
    tab.itens.push({
      produto_id: produto.id, nome: produto.nome, codigo: produto.codigo || '',
      preco_unitario: Number(produto.preco) || 0, quantidade: qtd, estoque: produto.estoque
    });
  }
  salvarPosTabs();
  updatePosUI();
}

function posAdicionarServico(descricao, valor, quantidade) {
  const tab = posTabAtual();
  tab.itens.push({
    produto_id: null, servico: true, nome: descricao, codigo: '',
    preco_unitario: Number(valor) || 0, quantidade: Math.max(1, parseInt(quantidade, 10) || 1), estoque: null
  });
  salvarPosTabs();
  updatePosUI();
}

function renderPosRows() {
  const tab = posTabAtual();
  if (!tab || !tab.itens.length) {
    return '<tr class="pos-empty-row"><td colspan="6"><div class="pos-livre">Caixa livre</div></td></tr>';
  }
  return tab.itens.map((item, idx) => `<tr>
    <td>${idx + 1}</td>
    <td>${escapeHtml(item.nome)}${item.os_id ? ' <span class="promo-tag">OS</span>' : item.servico ? ' <span class="promo-tag">serviço</span>' : ''}</td>
    <td>${escapeHtml(item.codigo || '-')}</td>
    <td>
      <div class="pos-qty">
        ${item.os_id ? `<span>${item.quantidade}</span>` : `
        <button type="button" data-qty="${idx}" data-delta="-1">-</button>
        <span>${item.quantidade}</span>
        <button type="button" data-qty="${idx}" data-delta="1">+</button>`}
        <button type="button" class="pos-row-del" data-remove="${idx}" title="Remover"><i class="fas fa-times"></i></button>
      </div>
    </td>
    <td>${formatCurrency(item.preco_unitario)}</td>
    <td>${formatCurrency(item.quantidade * item.preco_unitario)}</td>
  </tr>`).join('');
}

function updatePosUI() {
  const tab = posTabAtual();
  if (!tab) return;
  const tbody = document.getElementById('pos-tbody');
  if (tbody) tbody.innerHTML = renderPosRows();
  const itensEl = document.getElementById('pos-itens');
  if (itensEl) itensEl.textContent = tab.itens.reduce((s, i) => s + i.quantidade, 0);
  const totalEl = document.getElementById('pos-total');
  if (totalEl) totalEl.textContent = formatCurrency(Math.max(0, posSubtotal(tab) - posDesconto(tab)));
  const clienteEl = document.getElementById('pos-cliente-nome');
  if (clienteEl) clienteEl.textContent = tab.cliente_nome || 'Visitante';
  const tabEl = document.getElementById('pos-tab-indicator');
  if (tabEl) tabEl.textContent = `${posTabIndex + 1}/${posTabs.length}`;
  if (tbody) {
    tbody.querySelectorAll('[data-qty]').forEach(btn => {
      btn.onclick = () => posAlterarQtd(+btn.dataset.qty, +btn.dataset.delta);
    });
    tbody.querySelectorAll('[data-remove]').forEach(btn => {
      btn.onclick = () => posRemoverItem(+btn.dataset.remove);
    });
  }
}

function posAlterarQtd(idx, delta) {
  const item = posTabAtual().itens[idx];
  if (!item) return;
  const nova = item.quantidade + delta;
  if (nova <= 0) { posRemoverItem(idx); return; }
  if (item.os_id) {
    showToast('A ordem de serviço é cobrada em quantidade 1', 'error');
    return;
  }
  if (item.servico) {
    item.quantidade = nova;
  } else if (nova > item.estoque) {
    showToast('Estoque insuficiente', 'error');
    return;
  } else {
    item.quantidade = nova;
  }
  salvarPosTabs();
  updatePosUI();
}

function posRemoverItem(idx) {
  posTabAtual().itens.splice(idx, 1);
  salvarPosTabs();
  updatePosUI();
}

async function posSelecionarCliente() {
  const clientes = await API.clientes.all();
  const render = (lista) => lista.map(c => `
    <div class="pos-result pos-cliente-item" data-id="${c.id}" data-nome="${escapeHtml(c.nome)}">
      <div><strong>${escapeHtml(c.nome)}</strong><br><small>${escapeHtml(c.telefone || c.email || '')}</small></div>
      <i class="fas fa-chevron-right"></i>
    </div>`).join('');
  openModal('Selecionar cliente', `
    <div class="search-box" style="max-width:100%;margin-bottom:12px">
      <i class="fas fa-search"></i>
      <input id="pos-cliente-search" placeholder="Pesquisar cliente..." autocomplete="off">
    </div>
    <div class="pos-result-list" id="pos-cliente-list">
      <div class="pos-result pos-cliente-item" data-id="" data-nome="Visitante">
        <div><strong>Visitante</strong><br><small>Sem cadastro</small></div>
        <i class="fas fa-chevron-right"></i>
      </div>
      ${render(clientes)}
    </div>`,
    '<button class="btn btn-outline modal-close-btn">Cancelar</button>');
  document.querySelector('.modal-close-btn').onclick = closeModal;
  const bind = () => {
    document.querySelectorAll('#pos-cliente-list .pos-cliente-item').forEach(el => {
      el.onclick = () => {
        const tab = posTabAtual();
        tab.cliente_id = el.dataset.id ? +el.dataset.id : null;
        tab.cliente_nome = el.dataset.nome || 'Visitante';
        salvarPosTabs();
        updatePosUI();
        closeModal();
      };
    });
  };
  bind();
  document.getElementById('pos-cliente-search').oninput = (e) => {
    const term = e.target.value.trim().toLowerCase();
    const filtrados = clientes.filter(c => String(c.nome).toLowerCase().includes(term));
    document.getElementById('pos-cliente-list').innerHTML = `
      <div class="pos-result pos-cliente-item" data-id="" data-nome="Visitante">
        <div><strong>Visitante</strong><br><small>Sem cadastro</small></div>
        <i class="fas fa-chevron-right"></i>
      </div>
      ${render(filtrados)}`;
    bind();
  };
}

function posProdutoServico() {
  openModal('Produto / serviço', `
    <div class="pos-modal-tabs">
      <button type="button" class="active" id="pm-tab-prod"><i class="fas fa-box"></i> Produto</button>
      <button type="button" id="pm-tab-serv"><i class="fas fa-wrench"></i> Serviço</button>
    </div>
    <div id="pm-prod">
      <div class="search-box" style="max-width:100%;margin-bottom:12px">
        <i class="fas fa-search"></i>
        <input id="pm-search" placeholder="Pesquisar produto..." autocomplete="off">
      </div>
      <div class="pos-result-list" id="pm-list"></div>
    </div>
    <div id="pm-serv" class="hidden">
      <div class="form-group"><label>Descrição do serviço</label><input id="pm-serv-desc" placeholder="Ex: Formatação, instalação"></div>
      <div class="form-row">
        <div class="form-group"><label>Valor</label><input id="pm-serv-valor" type="number" step="0.01" min="0" value="0"></div>
        <div class="form-group"><label>Quantidade</label><input id="pm-serv-qtd" type="number" min="1" value="1"></div>
      </div>
    </div>`,
    `<button class="btn btn-outline modal-close-btn">Fechar</button>
     <button class="btn btn-success hidden" id="pm-serv-add">Adicionar serviço</button>`);
  document.querySelector('.modal-close-btn').onclick = closeModal;

  const renderLista = (term) => {
    const lista = term ? posFiltrarProdutos(term, 'produto') : (posProdutos || []).slice(0, 50);
    const box = document.getElementById('pm-list');
    box.innerHTML = lista.length ? lista.map(p => `
      <div class="pos-result" data-id="${p.id}">
        <div><strong>${escapeHtml(p.nome)}</strong><br><small>${escapeHtml(p.codigo || 'sem código')}</small></div>
        <div class="pos-result-right">${formatCurrency(p.preco)}<br><small>Est. ${p.estoque}</small></div>
      </div>`).join('') : '<p class="muted" style="padding:12px">Nenhum produto encontrado</p>';
    box.querySelectorAll('.pos-result').forEach(el => {
      el.onclick = () => {
        const p = posProdutos.find(x => x.id === +el.dataset.id);
        if (p) { posAdicionarItem(p); closeModal(); }
      };
    });
  };
  renderLista('');
  document.getElementById('pm-search').oninput = (e) => renderLista(e.target.value.trim());
  document.getElementById('pm-tab-prod').onclick = () => {
    document.getElementById('pm-tab-prod').classList.add('active');
    document.getElementById('pm-tab-serv').classList.remove('active');
    document.getElementById('pm-prod').classList.remove('hidden');
    document.getElementById('pm-serv').classList.add('hidden');
    document.getElementById('pm-serv-add').classList.add('hidden');
  };
  document.getElementById('pm-tab-serv').onclick = () => {
    document.getElementById('pm-tab-serv').classList.add('active');
    document.getElementById('pm-tab-prod').classList.remove('active');
    document.getElementById('pm-serv').classList.remove('hidden');
    document.getElementById('pm-prod').classList.add('hidden');
    document.getElementById('pm-serv-add').classList.remove('hidden');
  };
  document.getElementById('pm-serv-add').onclick = () => {
    const desc = document.getElementById('pm-serv-desc').value.trim();
    if (!desc) { showToast('Informe a descrição do serviço', 'error'); return; }
    posAdicionarServico(desc, document.getElementById('pm-serv-valor').value, document.getElementById('pm-serv-qtd').value);
    closeModal();
  };
}

async function posHistoricoPedido() {
  const tab = posTabAtual();
  const params = { page: 1, limit: 15 };
  if (tab.cliente_id) params.cliente_id = tab.cliente_id;
  const result = await API.vendas.list(params);
  openModal('Histórico de pedidos', result.data.length ? `
    <p class="muted" style="margin-bottom:12px">
      ${tab.cliente_id ? `Pedidos de ${escapeHtml(tab.cliente_nome)}` : 'Últimos pedidos'}
    </p>
    <table class="data-table"><thead><tr><th>#</th><th>Cliente</th><th>Total</th><th>Pagamento</th><th>Data</th><th></th></tr></thead>
      <tbody>${result.data.map(v => `<tr>
        <td>${v.id}</td>
        <td>${escapeHtml(v.cliente_nome || 'Visitante')}</td>
        <td>${formatCurrency(v.total)}</td>
        <td>${escapeHtml(v.forma_pagamento || '-')}</td>
        <td>${formatDateTime(v.criado_em)}</td>
        <td><button class="btn btn-sm btn-primary" data-repetir="${v.id}"><i class="fas fa-redo"></i> Repetir</button></td>
      </tr>`).join('')}</tbody></table>`
    : '<p class="muted">Nenhum pedido encontrado.</p>',
    '<button class="btn btn-outline modal-close-btn">Fechar</button>');
  document.querySelector('.modal-close-btn').onclick = closeModal;
  document.querySelectorAll('[data-repetir]').forEach(btn => {
    btn.onclick = async () => {
      try {
        const venda = await API.vendas.get(+btn.dataset.repetir);
        const tabAtual = posTabAtual();
        for (const item of venda.itens || []) {
          if (item.produto_id) {
            const p = posProdutos.find(x => x.id === item.produto_id);
            if (p && p.estoque > 0) posAdicionarItem(p, item.quantidade);
          } else {
            posAdicionarServico(item.produto_nome || item.descricao || 'Serviço', item.preco_unitario, item.quantidade);
          }
        }
        tabAtual.desconto = venda.desconto || 0;
        salvarPosTabs();
        updatePosUI();
        closeModal();
        showToast('Pedido carregado na aba', 'success');
      } catch (err) { showToast(err.message, 'error'); }
    };
  });
}

function posCancelarVenda() {
  const tab = posTabAtual();
  if (!tab.itens.length) { showToast('Nenhum item para cancelar', 'error'); return; }
  if (!confirm('Cancelar a venda atual e limpar todos os itens?')) return;
  tab.itens = [];
  tab.desconto = 0;
  salvarPosTabs();
  updatePosUI();
  showToast('Venda cancelada', 'success');
}

function posFinalizarVenda() {
  const tab = posTabAtual();
  if (!tab.itens.length) { showToast('Adicione produtos ao carrinho', 'error'); return; }
  const subtotal = posSubtotal(tab);
  openModal('Finalizar venda', `
    <form id="pos-venda-form">
      <div class="form-group"><label>Cliente</label>
        <input value="${escapeHtml(tab.cliente_nome || 'Visitante')}" disabled></div>
      <div class="form-row">
        <div class="form-group"><label>Desconto (R$)</label>
          <input id="pos-form-desconto" name="desconto" type="number" step="0.01" min="0" value="${posDesconto(tab)}"></div>
        <div class="form-group"><label>Pagamento</label>
          <select id="pos-form-pagamento" name="forma_pagamento">
            <option>Dinheiro</option><option>Cartão Débito</option><option>Cartão Crédito</option><option>PIX</option>
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Valor recebido</label>
          <input id="pos-form-recebido" name="valor_recebido" type="number" step="0.01" min="0" value="${subtotal}"></div>
        <div class="form-group"><label>Parcelas</label>
          <input id="pos-form-parcelas" name="parcelas" type="number" min="1" value="1"></div>
      </div>
      <div class="contas-resumo">
        <div><span>Subtotal</span><strong>${formatCurrency(subtotal)}</strong></div>
        <div><span>Desconto</span><strong id="pos-form-desc-view">${formatCurrency(posDesconto(tab))}</strong></div>
        <div><span>Taxa cartão</span><strong id="pos-form-taxa">${formatCurrency(0)}</strong></div>
        <div><span>Total</span><strong id="pos-form-total">${formatCurrency(Math.max(0, subtotal - posDesconto(tab)))}</strong></div>
        <div><span>Troco</span><strong id="pos-form-troco">${formatCurrency(0)}</strong></div>
      </div>
      ${erpConfig.nfce_habilitada === '1' ? `
      <div class="form-group" style="margin-top:12px">
        <label class="check-label"><input type="checkbox" id="pos-emitir-nfce" ${erpConfig.nfce_emitir_automatico === '1' ? 'checked' : ''}> Emitir NFC-e</label>
        <small class="muted">${erpConfig.nfce_ambiente === 'producao' ? 'Ambiente de producao' : 'Homologacao'} ${erpConfig.nfce_simulacao === '1' || erpConfig.nfce_pronta !== '1' ? '· simulacao local (preencha certificado A1 + CSC para transmitir)' : '· transmissao SEFAZ'}</small>
      </div>` : ''}
    </form>`,
    '<button class="btn btn-outline modal-close-btn">Cancelar</button>' +
    '<button class="btn btn-success" id="pos-form-confirmar"><i class="fas fa-check"></i> Finalizar venda</button>');
  document.querySelector('.modal-close-btn').onclick = closeModal;

  const recalcular = () => {
    const desc = parseFloat(document.getElementById('pos-form-desconto').value) || 0;
    const forma = document.getElementById('pos-form-pagamento').value;
    const recebido = parseFloat(document.getElementById('pos-form-recebido').value) || 0;
    let total = Math.max(0, subtotal - desc);
    let taxa = 0;
    if (forma === 'Cartão Crédito') taxa = total * (parseFloat(erpConfig.taxa_credito || 0) / 100);
    if (forma === 'Cartão Débito') taxa = total * (parseFloat(erpConfig.taxa_debito || 0) / 100);
    total += taxa;
    document.getElementById('pos-form-desc-view').textContent = formatCurrency(desc);
    document.getElementById('pos-form-taxa').textContent = formatCurrency(taxa);
    document.getElementById('pos-form-total').textContent = formatCurrency(total);
    document.getElementById('pos-form-troco').textContent = formatCurrency(Math.max(0, recebido - total));
  };
  document.getElementById('pos-form-desconto').oninput = recalcular;
  document.getElementById('pos-form-pagamento').onchange = recalcular;
  document.getElementById('pos-form-recebido').oninput = recalcular;

  document.getElementById('pos-form-confirmar').onclick = async () => {
    const desc = parseFloat(document.getElementById('pos-form-desconto').value) || 0;
    const forma = document.getElementById('pos-form-pagamento').value;
    const recebido = parseFloat(document.getElementById('pos-form-recebido').value) || 0;
    const total = posTotalComTaxa(tab, forma).total;
    if (forma === 'Dinheiro' && recebido > 0 && recebido < total) {
      showToast('Valor recebido menor que o total', 'error');
      return;
    }
    try {
      const nfceBox = document.getElementById('pos-emitir-nfce');
      const venda = await API.vendas.create({
        cliente_id: tab.cliente_id || null,
        itens: tab.itens.map(i => ({
          produto_id: i.produto_id, descricao: i.servico ? i.nome : null,
          quantidade: i.quantidade, preco_unitario: i.preco_unitario, os_id: i.os_id || null
        })),
        desconto: desc,
        forma_pagamento: forma,
        usuario_id: currentUser.id,
        valor_recebido: recebido || total,
        parcelas: parseInt(document.getElementById('pos-form-parcelas').value, 10) || 1,
        ...(nfceBox ? { emitir_nfce: nfceBox.checked } : {})
      });
      tab.itens = [];
      tab.desconto = 0;
      salvarPosTabs();
      closeModal();
      const nota = venda.nfce;
      if (nota?.status === 'autorizada') showToast('Venda realizada. NFC-e autorizada.', 'success');
      else if (nota?.status === 'rejeitada' || nota?.status === 'erro') showToast('Venda ok. NFC-e: ' + (nota.motivo || 'falhou'), 'error');
      else showToast('Venda realizada com sucesso!', 'success');
      if (confirm(nota ? 'Deseja imprimir o DANFE NFC-e?' : 'Deseja imprimir o cupom?')) await printCupom(venda.id);
      updatePosUI();
      refreshNotificacoes();
    } catch (err) { showToast(err.message, 'error'); }
  };
}

function printPosDocumento(titulo, tab) {
  const area = document.getElementById('print-area');
  const subtotal = posSubtotal(tab);
  const desconto = posDesconto(tab);
  const total = Math.max(0, subtotal - desconto);
  area.innerHTML = `
    <div class="cupom">
      <h3>${escapeHtml(erpConfig.cupom_titulo || 'ERP ISAC')}</h3>
      <pre>${escapeHtml(erpConfig.cupom_cabecalho || '')}</pre>
      <h4>${escapeHtml(titulo)}</h4>
      <p>${formatDateTime(new Date())}</p>
      <p>Cliente: ${escapeHtml(tab.cliente_nome || 'Visitante')}</p>
      <table>
        ${tab.itens.map(i => `<tr><td>${escapeHtml(i.nome)} x${i.quantidade}</td><td>${formatCurrency(i.quantidade * i.preco_unitario)}</td></tr>`).join('')}
      </table>
      <p>Subtotal: ${formatCurrency(subtotal)}</p>
      <p>Desconto: ${formatCurrency(desconto)}</p>
      <p><strong>Total: ${formatCurrency(total)}</strong></p>
      <pre>${escapeHtml(erpConfig.cupom_rodape || '')}</pre>
    </div>`;
  area.classList.remove('hidden');
  window.print();
  area.classList.add('hidden');
}

function posImprimirPedido(titulo) {
  const tab = posTabAtual();
  if (!tab.itens.length) { showToast('Adicione itens para gerar o PDF', 'error'); return; }
  printPosDocumento(titulo, tab);
}

function posGerarOrcamento() {
  const tab = posTabAtual();
  if (!tab.itens.length) { showToast('Adicione itens ao orçamento', 'error'); return; }
  const subtotal = posSubtotal(tab);
  openModal('Gerar orçamento', `
    <form id="pos-orc-form">
      <div class="form-group"><label>Cliente</label>
        <input value="${escapeHtml(tab.cliente_nome || 'Visitante')}" disabled></div>
      <div class="form-row">
        <div class="form-group"><label>Desconto (R$)</label>
          <input name="desconto" type="number" step="0.01" min="0" value="${posDesconto(tab)}"></div>
        <div class="form-group"><label>Total</label>
          <input id="pos-orc-total" value="${formatCurrency(subtotal)}" disabled></div>
      </div>
      <div class="form-group"><label>Observação</label>
        <textarea name="observacao" rows="2" placeholder="Validade, condições..."></textarea></div>
    </form>`,
    '<button class="btn btn-outline modal-close-btn">Cancelar</button>' +
    '<button class="btn btn-teal" id="pos-orc-salvar"><i class="fas fa-save"></i> Salvar e imprimir</button>');
  document.querySelector('.modal-close-btn').onclick = closeModal;
  const atualiza = (e) => {
    const desc = parseFloat(e.target.value) || 0;
    document.getElementById('pos-orc-total').value = formatCurrency(Math.max(0, subtotal - desc));
  };
  document.querySelector('#pos-orc-form [name=desconto]').oninput = atualiza;
  document.getElementById('pos-orc-salvar').onclick = async () => {
    const form = document.getElementById('pos-orc-form');
    const desc = parseFloat(form.querySelector('[name=desconto]').value) || 0;
    try {
      await API.orcamentos.create({
        cliente_id: tab.cliente_id || null,
        cliente_nome: tab.cliente_nome || 'Visitante',
        itens: tab.itens.map(i => ({ produto_id: i.produto_id, descricao: i.nome, quantidade: i.quantidade, preco_unitario: i.preco_unitario, subtotal: i.quantidade * i.preco_unitario })),
        subtotal,
        desconto: desc,
        total: Math.max(0, subtotal - desc),
        observacao: form.querySelector('[name=observacao]').value,
        usuario_id: currentUser.id
      });
      closeModal();
      showToast('Orçamento salvo!', 'success');
      printPosDocumento('Orçamento', { ...tab, desconto: desc });
    } catch (err) { showToast(err.message, 'error'); }
  };
}

function nfceStatusBadge(status) {
  const map = {
    autorizada: 'ativo', rejeitada: 'cancelada', erro: 'cancelada',
    cancelada: 'cancelada', pendente: 'aberta'
  };
  return `<span class="status-badge ${map[status] || 'aberta'}">${escapeHtml(status || 'sem NFC-e')}</span>`;
}

function chaveFormatada(chave) {
  const d = String(chave || '').replace(/\D/g, '');
  return d.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function qrSvg(data) {
  const text = String(data || '');
  if (!text) return '';
  const size = 21;
  let h = 0;
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  const cells = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = Math.abs(Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233 + h) * 43758.5453);
      const on = (v - Math.floor(v)) > 0.45;
      const finder = (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
      const ring = finder && (x === 0 || y === 0 || x === 6 || y === 6 || x === size - 1 || y === size - 7 || (x >= 2 && x <= 4 && y >= 2 && y <= 4) || (x >= size - 5 && x <= size - 3 && y >= 2 && y <= 4) || (x >= 2 && x <= 4 && y >= size - 5 && y <= size - 3));
      if (on || ring) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
  }
  return `<svg class="nfce-qr" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${cells.join('')}</svg>`;
}

async function printCupom(id) {
  const v = await API.vendas.get(id);
  const c = v.cupom || {};
  const n = v.nfce;
  const area = document.getElementById('print-area');
  if (n && n.chave) {
    area.innerHTML = `
      <div class="cupom danfe-nfce">
        <h3>${escapeHtml(c.nfce_nome_fantasia || c.cupom_titulo || 'ERP ISAC')}</h3>
        <p>${escapeHtml(c.nfce_razao_social || '')}</p>
        <p>CNPJ ${escapeHtml(c.nfce_cnpj || '-')} IE ${escapeHtml(c.nfce_ie || '-')}</p>
        <pre>${escapeHtml([c.nfce_logradouro, c.nfce_numero, c.nfce_bairro, c.nfce_municipio, c.nfce_uf].filter(Boolean).join(', '))}</pre>
        <hr>
        <p><strong>DANFE NFC-e</strong> ${n.ambiente === 'producao' ? '' : '· HOMOLOGACAO SEM VALOR FISCAL'}</p>
        <p>Numero ${n.numero || '-'} Serie ${n.serie || '-'} ${formatDateTime(n.dh_emi || v.criado_em)}</p>
        <p>Protocolo ${escapeHtml(n.protocolo || '-')} ${nfceStatusBadge(n.status)}</p>
        <hr>
        <p>Consumidor: ${escapeHtml(v.cliente_nome || 'Consumidor nao identificado')}</p>
        <table>
          ${(v.itens || []).map(i => `<tr><td>${escapeHtml(i.produto_nome)} x${i.quantidade}</td><td>${formatCurrency(i.subtotal)}</td></tr>`).join('')}
        </table>
        <p><strong>Total: ${formatCurrency(v.total)}</strong></p>
        <p>Pagamento: ${escapeHtml(v.forma_pagamento || '-')}${v.troco ? ` · Troco ${formatCurrency(v.troco)}` : ''}</p>
        <hr>
        <p class="nfce-chave">${chaveFormatada(n.chave)}</p>
        <div class="nfce-qr-wrap">${qrSvg(n.qrcode || n.chave)}</div>
        <p class="muted">Consulte pela chave de acesso no portal da SEFAZ</p>
        <pre>${escapeHtml(c.cupom_rodape || '')}</pre>
      </div>`;
  } else {
    area.innerHTML = `
      <div class="cupom">
        <h3>${escapeHtml(c.cupom_titulo || 'ERP ISAC')}</h3>
        <pre>${escapeHtml(c.cupom_cabecalho || '')}</pre>
        <p>Venda #${v.id} · ${formatDateTime(v.criado_em)}</p>
        <p>Cliente: ${escapeHtml(v.cliente_nome || 'Avulso')}</p>
        <table>
          ${(v.itens || []).map(i => `<tr><td>${escapeHtml(i.produto_nome)} x${i.quantidade}</td><td>${formatCurrency(i.subtotal)}</td></tr>`).join('')}
        </table>
        <p><strong>Total: ${formatCurrency(v.total)}</strong></p>
        <p>Pagamento: ${escapeHtml(v.forma_pagamento || '-')}</p>
        ${v.troco ? `<p>Troco: ${formatCurrency(v.troco)}</p>` : ''}
        <pre>${escapeHtml(c.cupom_rodape || '')}</pre>
      </div>`;
  }
  area.classList.remove('hidden');
  window.print();
  area.classList.add('hidden');
}

// ===================== CAIXA =====================
function caixaBadgeClass(tipo) {
  const map = {
    'Abertura': 'caixa-badge info', 'Venda realizada': 'caixa-badge info',
    'Entrada': 'caixa-badge entrada', 'Saída': 'caixa-badge saida'
  };
  return map[tipo] || 'caixa-badge';
}

function caixaCliente(m) {
  if (m.cliente_nome) return escapeHtml(m.cliente_nome);
  return m.tipo === 'Abertura' ? 'Saldo inicial' : '-';
}

function caixaDesconto(m) {
  if (m.tipo === 'Abertura') return '==';
  if (m.tipo === 'Venda realizada') {
    return `${Number(m.desconto_percent || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }
  return '-';
}

function caixaPagamento(m) {
  if (m.tipo === 'Abertura') return '======';
  return escapeHtml(m.forma_pagamento || '-');
}

function renderCaixaRows(data) {
  if (!data.length) return '<tr class="empty-row"><td colspan="9">Nenhum movimento encontrado</td></tr>';
  return data.map(m => {
    const acoes = m.tipo === 'Abertura'
      ? '<span class="muted">—</span>'
      : `<button class="btn-icon view" onclick="viewCaixaMovimento(${m.id})" title="Visualizar"><i class="fas fa-eye"></i></button>
         <button class="btn-icon print" onclick="editCaixaMovimento(${m.id})" title="Editar"><i class="fas fa-edit"></i></button>
         <button class="btn-icon delete" onclick="deleteCaixaMovimento(${m.id})" title="Excluir"><i class="fas fa-trash"></i></button>`;
    return `<tr>
      <td>${m.id}</td>
      <td><span class="${caixaBadgeClass(m.tipo)}">${escapeHtml(m.tipo)}</span></td>
      <td>${caixaCliente(m)}</td>
      <td>${escapeHtml(m.descricao || '-')}</td>
      <td>${caixaDesconto(m)}</td>
      <td>${caixaPagamento(m)}</td>
      <td>${formatCurrency(m.valor)}</td>
      <td>${formatDateTime(m.criado_em)}</td>
      <td class="actions-cell">${acoes}</td>
    </tr>`;
  }).join('');
}

async function renderCaixa() {
  const st = pageState.caixa;
  const [status, movimentos] = await Promise.all([
    API.caixa.status(),
    API.caixa.movimentos({ search: st.search, page: st.page, limit: st.limit })
  ]);

  document.getElementById('content').innerHTML = `
    <div class="stats-row stats-row-4">
      <div class="stat-card green stat-card-icon">
        <div class="stat-info"><h4>Total do caixa</h4><div class="stat-value">${formatCurrency(status.total_caixa)}</div></div>
        <i class="fas fa-money-bill-wave"></i>
      </div>
      <div class="stat-card blue stat-card-icon">
        <div class="stat-info"><h4>Total de vendas</h4><div class="stat-value">${formatCurrency(status.total_vendas)}</div></div>
        <i class="fas fa-receipt"></i>
      </div>
      <div class="stat-card teal stat-card-icon">
        <div class="stat-info"><h4>Cartão ou PIX</h4><div class="stat-value">${formatCurrency(status.cartao_pix)}</div></div>
        <i class="fas fa-credit-card"></i>
      </div>
      <div class="stat-card purple stat-card-icon">
        <div class="stat-info"><h4>Venda líquida</h4><div class="stat-value">${formatCurrency(status.venda_liquida)}</div></div>
        <i class="fas fa-money-bill"></i>
      </div>
    </div>
    <div class="caixa-head">
      <h3>Movimento de caixa</h3>
      <div class="caixa-head-actions">
        ${status.aberto
          ? '<button class="btn btn-primary" id="caixa-fechar"><i class="fas fa-lock"></i> Fechar caixa</button>'
          : '<button class="btn btn-success" id="caixa-abrir"><i class="fas fa-lock-open"></i> Abrir caixa</button>'}
        <button class="btn btn-primary" id="caixa-historico"><i class="fas fa-chart-line"></i> Histórico</button>
        <button class="btn btn-success" id="caixa-entrada"><i class="fas fa-money-bill-wave"></i> Entrada</button>
        <button class="btn btn-danger" id="caixa-saida"><i class="fas fa-money-bill-wave"></i> Saída</button>
      </div>
    </div>
    <div class="toolbar">
      <div class="search-box">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="Pesquisar..." value="${escapeHtml(st.search || '')}" id="table-search">
      </div>
      <span class="toolbar-info">Movimentacoes do caixa: ${movimentos.total} registros</span>
      <div class="toolbar-spacer"></div>
      <button class="btn-icon-square" id="caixa-opcoes" title="Opções"><i class="fas fa-cog"></i></button>
    </div>
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr>
          <th>#</th><th>Tipo</th><th>Cliente</th><th>Descrição</th><th>Desconto</th>
          <th>Pagamento</th><th>Total</th><th>Data</th><th>Ações</th>
        </tr></thead>
        <tbody id="table-body">${renderCaixaRows(movimentos.data)}</tbody>
      </table>
      <div id="table-pagination"></div>
    </div>`;

  bindTableEvents('caixa', movimentos, loadCaixa);
  document.getElementById('caixa-opcoes').onclick = showCaixaOpcoes;
  document.getElementById('caixa-historico').onclick = showCaixaHistorico;
  document.getElementById('caixa-entrada').onclick = () => showCaixaMovimentoForm('Entrada');
  document.getElementById('caixa-saida').onclick = () => showCaixaMovimentoForm('Saída');
  if (status.aberto) {
    document.getElementById('caixa-fechar').onclick = fecharCaixa;
  } else {
    document.getElementById('caixa-abrir').onclick = showAbrirCaixaForm;
  }
}

async function loadCaixa() {
  const st = pageState.caixa;
  const result = await API.caixa.movimentos({ search: st.search, page: st.page, limit: st.limit });
  document.getElementById('table-body').innerHTML = renderCaixaRows(result.data);
  renderPagination(document.getElementById('table-pagination'), result.page, result.totalPages, result.total, result.limit, (p, l) => {
    st.page = p; st.limit = l; loadCaixa();
  });
  document.querySelector('.toolbar-info').textContent = `Movimentacoes do caixa: ${result.total} registros`;
}

async function fecharCaixa() {
  if (!confirm('Deseja fechar o caixa?')) return;
  try {
    await API.caixa.fechar();
    showToast('Caixa fechado', 'success'); renderCaixa();
  } catch (err) { showToast(err.message, 'error'); }
}

function showAbrirCaixaForm() {
  openModal('Abrir Caixa', `
    <form id="entity-form">
      <div class="form-group"><label>Valor inicial</label><input name="valor_inicial" type="number" step="0.01" value="0"></div>
    </form>`,
    '<button class="btn btn-outline modal-close-btn">Cancelar</button><button class="btn btn-success" id="entity-save">Abrir</button>');
  document.querySelector('.modal-close-btn').onclick = closeModal;
  document.getElementById('entity-save').onclick = async () => {
    const val = parseFloat(document.querySelector('[name=valor_inicial]').value) || 0;
    try {
      await API.caixa.abrir({ valor_inicial: val, usuario_id: currentUser.id });
      closeModal(); showToast('Caixa aberto!', 'success'); renderCaixa();
    } catch (err) { showToast(err.message, 'error'); }
  };
}

function showCaixaMovimentoForm(tipo) {
  const isEntrada = tipo === 'Entrada';
  openModal(`Registrar ${tipo}`, `
    <form id="entity-form">
      <div class="form-group"><label>Descrição</label>
        <input name="descricao" placeholder="${isEntrada ? 'Ex: Suprimento de caixa' : 'Ex: Retirada, sangria'}" required></div>
      <div class="form-row">
        <div class="form-group"><label>Valor</label><input name="valor" type="number" step="0.01" required></div>
        <div class="form-group"><label>Forma pagamento</label>
          <select name="forma_pagamento"><option>Dinheiro</option><option>PIX</option><option>Cartão</option></select></div>
      </div>
    </form>`,
    '<button class="btn btn-outline modal-close-btn">Cancelar</button>' +
    `<button class="btn ${isEntrada ? 'btn-success' : 'btn-danger'}" id="entity-save">Salvar</button>`);
  document.querySelector('.modal-close-btn').onclick = closeModal;
  document.getElementById('entity-save').onclick = async () => {
    const form = document.getElementById('entity-form');
    if (!form.reportValidity()) return;
    const body = Object.fromEntries(new FormData(form));
    body.tipo = tipo;
    body.valor = parseFloat(body.valor) || 0;
    body.usuario_id = currentUser.id;
    try {
      await API.caixa.createMovimento(body);
      closeModal(); showToast('Movimento registrado', 'success'); renderCaixa();
    } catch (err) { showToast(err.message, 'error'); }
  };
}

async function editCaixaMovimento(id) {
  const m = await API.caixa.movimento(id);
  openModal('Editar movimento', `
    <form id="entity-form">
      <div class="form-group"><label>Descrição</label><input name="descricao" value="${escapeHtml(m.descricao || '')}"></div>
      <div class="form-row">
        <div class="form-group"><label>Valor</label><input name="valor" type="number" step="0.01" value="${m.valor || 0}"></div>
        <div class="form-group"><label>Forma pagamento</label>
          <select name="forma_pagamento">
            ${['Dinheiro', 'PIX', 'Cartão', 'Cartão Crédito', 'Cartão Débito'].map(f =>
              `<option ${m.forma_pagamento === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group"><label>Cliente</label><input name="cliente_nome" value="${escapeHtml(m.cliente_nome || '')}"></div>
    </form>`,
    '<button class="btn btn-outline modal-close-btn">Cancelar</button><button class="btn btn-primary" id="entity-save">Salvar</button>');
  document.querySelector('.modal-close-btn').onclick = closeModal;
  document.getElementById('entity-save').onclick = async () => {
    const body = Object.fromEntries(new FormData(document.getElementById('entity-form')));
    body.valor = parseFloat(body.valor) || 0;
    try {
      await API.caixa.updateMovimento(id, body);
      closeModal(); showToast('Movimento atualizado', 'success'); renderCaixa();
    } catch (err) { showToast(err.message, 'error'); }
  };
}

async function viewCaixaMovimento(id) {
  const m = await API.caixa.movimento(id);
  let vendaHtml = '';
  if (m.venda) {
    vendaHtml = `
      <h4 style="margin:16px 0 8px">Itens da venda</h4>
      <table class="data-table"><thead><tr><th>Produto</th><th>Qtd</th><th>Unitário</th><th>Subtotal</th></tr></thead>
        <tbody>${(m.venda.itens || []).map(it => `<tr>
          <td>${escapeHtml(it.produto_nome || '-')}</td><td>${it.quantidade}</td>
          <td>${formatCurrency(it.preco_unitario)}</td><td>${formatCurrency(it.subtotal)}</td>
        </tr>`).join('') || '<tr class="empty-row"><td colspan="4">Sem itens</td></tr>'}</tbody></table>`;
  }
  openModal('Detalhes do movimento', `
    <div class="contas-resumo">
      <div><span>Tipo</span><strong>${escapeHtml(m.tipo)}</strong></div>
      <div><span>Cliente</span><strong>${caixaCliente(m)}</strong></div>
      <div><span>Descrição</span><strong>${escapeHtml(m.descricao || '-')}</strong></div>
      <div><span>Desconto</span><strong>${caixaDesconto(m)}</strong></div>
      <div><span>Pagamento</span><strong>${caixaPagamento(m)}</strong></div>
      <div><span>Total</span><strong>${formatCurrency(m.valor)}</strong></div>
      <div><span>Data</span><strong>${formatDateTime(m.criado_em)}</strong></div>
      <div><span>Usuário</span><strong>${escapeHtml(m.usuario_nome || '-')}</strong></div>
    </div>
    ${vendaHtml}`,
    '<button class="btn btn-outline modal-close-btn">Fechar</button>');
  document.querySelector('.modal-close-btn').onclick = closeModal;
}

async function deleteCaixaMovimento(id) {
  if (!confirm('Deseja excluir este movimento? Se for uma venda, ela será cancelada e o estoque devolvido.')) return;
  try {
    await API.caixa.deleteMovimento(id);
    showToast('Movimento removido', 'success'); renderCaixa();
  } catch (err) { showToast(err.message, 'error'); }
}

async function showCaixaHistorico() {
  const { data } = await API.caixa.historico();
  openModal('Histórico de caixa', data.length ? `
    <table class="data-table"><thead><tr><th>Data</th><th>Abertura</th><th>Entradas</th><th>Vendas</th><th>Saídas</th><th>Saldo</th></tr></thead>
      <tbody>${data.map(d => {
        const saldo = (d.abertura || 0) + (d.entradas || 0) + (d.vendas || 0) - (d.saidas || 0);
        return `<tr><td>${formatDate(d.dia)}</td><td>${formatCurrency(d.abertura)}</td><td>${formatCurrency(d.entradas)}</td>
          <td>${formatCurrency(d.vendas)}</td><td>${formatCurrency(d.saidas)}</td><td>${formatCurrency(saldo)}</td></tr>`;
      }).join('')}</tbody></table>`
    : '<p class="muted">Nenhum histórico de caixa registrado.</p>',
    '<button class="btn btn-outline modal-close-btn">Fechar</button>');
  document.querySelector('.modal-close-btn').onclick = closeModal;
}

function showCaixaOpcoes() {
  openModal('Opções de caixa', `
    <p class="muted">Use os botões acima da listagem para fechar/abrir o caixa, consultar o histórico e registrar entradas ou saídas.</p>
    <ul class="manual-list" style="margin-top:12px">
      <li><strong>Entrada</strong> — suprimento ou recebimento extra no caixa.</li>
      <li><strong>Saída</strong> — sangria, retirada ou pagamento em dinheiro.</li>
      <li>As vendas realizadas no PDV entram automaticamente como <strong>Venda realizada</strong>.</li>
    </ul>`,
    '<button class="btn btn-outline modal-close-btn">Fechar</button>');
  document.querySelector('.modal-close-btn').onclick = closeModal;
}

// ===================== FINANCEIRO =====================
function finTabTipo() {
  return (pageState.financeiro.tab || 'pagar') === 'receber' ? 'Receita' : 'Despesa';
}

function finPrevisaoCard(titulo, dados) {
  return `
    <div class="fin-forecast-card">
      <div class="fin-forecast-head">
        <h4>${titulo}</h4>
        <i class="fas fa-chart-line"></i>
      </div>
      <div class="fin-forecast-grid">
        <div><span>Entradas</span><strong class="text-success">${formatCurrency(dados.entradas)}</strong></div>
        <div><span>Saidas</span><strong class="text-danger">${formatCurrency(dados.saidas)}</strong></div>
        <div><span>Saldo</span><strong class="text-primary">${formatCurrency(dados.saldo)}</strong></div>
      </div>
    </div>`;
}

async function renderFinanceiro() {
  const st = pageState.financeiro;
  st.tab = st.tab || 'pagar';
  const tipo = finTabTipo();
  const [stats, result] = await Promise.all([
    API.financeiro.stats(),
    API.financeiro.list({ search: st.search, page: st.page, limit: st.limit, tipo })
  ]);

  const isPagar = st.tab === 'pagar';
  document.getElementById('content').innerHTML = `
    ${pageHeader('Financeiro', 'Dashboard / <a href="#" onclick="navigate(\'financeiro\');return false">Financeiro</a>')}
    <div class="stats-row stats-row-5">
      <div class="stat-card green stat-card-icon">
        <div class="stat-info"><h4>A receber</h4><div class="stat-value">${formatCurrency(stats.a_receber)}</div></div>
        <i class="fas fa-hand-holding-usd"></i>
      </div>
      <div class="stat-card red stat-card-icon">
        <div class="stat-info"><h4>Receber vencido</h4><div class="stat-value">${formatCurrency(stats.receber_vencido)}</div></div>
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <div class="stat-card blue stat-card-icon">
        <div class="stat-info"><h4>A pagar</h4><div class="stat-value">${formatCurrency(stats.a_pagar)}</div></div>
        <i class="fas fa-file-invoice-dollar"></i>
      </div>
      <div class="stat-card orange stat-card-icon">
        <div class="stat-info"><h4>Pagar vencido</h4><div class="stat-value">${formatCurrency(stats.pagar_vencido)}</div></div>
        <i class="fas fa-sack-dollar"></i>
      </div>
      <div class="stat-card teal stat-card-icon">
        <div class="stat-info"><h4>Saldo previsto</h4><div class="stat-value">${formatCurrency(stats.saldo_previsto)}</div></div>
        <i class="fas fa-chart-line"></i>
      </div>
    </div>
    <div class="fin-forecast-row">
      ${finPrevisaoCard('Previsao 7 dias', stats.previsao7 || { entradas: 0, saidas: 0, saldo: 0 })}
      ${finPrevisaoCard('Previsao 15 dias', stats.previsao15 || { entradas: 0, saidas: 0, saldo: 0 })}
      ${finPrevisaoCard('Previsao 30 dias', stats.previsao30 || { entradas: 0, saidas: 0, saldo: 0 })}
    </div>
    <div class="fin-tabs">
      <button class="fin-tab ${isPagar ? 'active' : ''}" id="fin-tab-pagar">
        <i class="fas fa-file-invoice-dollar"></i> Contas a pagar
        <span class="fin-tab-count">${stats.qtd_pagar || 0}</span>
      </button>
      <button class="fin-tab ${!isPagar ? 'active' : ''}" id="fin-tab-receber">
        <i class="fas fa-hand-holding-usd"></i> Contas a receber
        <span class="fin-tab-count">${stats.qtd_receber || 0}</span>
      </button>
    </div>
    <div class="toolbar">
      <div class="search-box">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="Pesquisar..." value="${escapeHtml(st.search || '')}" id="table-search">
      </div>
      <span class="toolbar-info">${isPagar ? 'Contas a pagar' : 'Contas a receber'}: ${result.total}</span>
      <div class="toolbar-spacer"></div>
      <button class="btn btn-primary" id="table-new">
        <i class="fas fa-plus"></i> ${isPagar ? 'Nova conta a pagar' : 'Nova conta a receber'}
      </button>
    </div>
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr>
          <th>#</th><th>Descricao</th>
          <th>${isPagar ? 'Fornecedor' : 'Cliente'}</th>
          <th>Categoria</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Acoes</th>
        </tr></thead>
        <tbody id="table-body">${renderFinanceiroRows(result.data, isPagar)}</tbody>
      </table>
      <div id="table-pagination"></div>
    </div>`;
  bindTableEvents('financeiro', result, loadFinanceiro);
  document.getElementById('table-new').onclick = () => showFinanceiroForm();
  document.getElementById('fin-tab-pagar').onclick = () => {
    st.tab = 'pagar'; st.page = 1; st.search = ''; renderFinanceiro();
  };
  document.getElementById('fin-tab-receber').onclick = () => {
    st.tab = 'receber'; st.page = 1; st.search = ''; renderFinanceiro();
  };
}

function renderFinanceiroRows(data, isPagar) {
  const pagar = isPagar ?? ((pageState.financeiro.tab || 'pagar') === 'pagar');
  if (!data.length) return '<tr class="empty-row"><td colspan="8">Nenhum registro encontrado</td></tr>';
  return data.map(f => {
    const pessoa = pagar ? (f.fornecedor_nome || '-') : (f.cliente_nome || '-');
    const vencido = f.status === 'Pendente' && f.data_vencimento && String(f.data_vencimento).slice(0, 10) < new Date().toISOString().slice(0, 10);
    return `<tr>
      <td>${f.id}</td>
      <td>${escapeHtml(f.descricao || '-')}</td>
      <td>${escapeHtml(pessoa)}</td>
      <td>${escapeHtml(f.categoria || '-')}</td>
      <td>${formatCurrency(f.valor)}</td>
      <td>${formatDate(f.data_vencimento)}</td>
      <td><span class="status-badge ${vencido ? 'cancelada' : statusClass(f.status)}">${vencido ? 'Vencido' : f.status}</span></td>
      <td class="actions-cell">
        ${f.status !== 'Pago' ? `<button class="btn-icon view" onclick="pagarFinanceiro(${f.id})" title="Marcar como pago"><i class="fas fa-check"></i></button>` : ''}
        <button class="btn-icon edit" onclick="showFinanceiroForm(${f.id})"><i class="fas fa-edit"></i></button>
        <button class="btn-icon delete" onclick="deleteFinanceiro(${f.id})"><i class="fas fa-trash"></i></button>
      </td></tr>`;
  }).join('');
}

async function loadFinanceiro() {
  const st = pageState.financeiro;
  const isPagar = (st.tab || 'pagar') === 'pagar';
  const result = await API.financeiro.list({ search: st.search, page: st.page, limit: st.limit, tipo: finTabTipo() });
  document.getElementById('table-body').innerHTML = renderFinanceiroRows(result.data, isPagar);
  renderPagination(document.getElementById('table-pagination'), result.page, result.totalPages, result.total, result.limit, (p, l) => {
    st.page = p; st.limit = l; loadFinanceiro();
  });
  document.querySelector('.toolbar-info').textContent = `${isPagar ? 'Contas a pagar' : 'Contas a receber'}: ${result.total}`;
}

async function showFinanceiroForm(id) {
  const isPagar = (pageState.financeiro.tab || 'pagar') === 'pagar';
  let data = {};
  if (id) data = await API.financeiro.get(id);
  const tipoFixo = data.tipo || (isPagar ? 'Despesa' : 'Receita');
  const [clientes, fornecedores] = await Promise.all([API.clientes.all(), API.fornecedores.all()]);
  const pessoas = tipoFixo === 'Despesa' ? fornecedores : clientes;
  const pessoaField = tipoFixo === 'Despesa' ? 'fornecedor_id' : 'cliente_id';
  const pessoaLabel = tipoFixo === 'Despesa' ? 'Fornecedor' : 'Cliente';
  const pessoaValue = data[pessoaField] || '';
  openModal(id ? 'Editar lançamento' : (tipoFixo === 'Despesa' ? 'Nova conta a pagar' : 'Nova conta a receber'), `
    <form id="entity-form">
      <input type="hidden" name="tipo" value="${tipoFixo}">
      <div class="form-group"><label>Descrição *</label>
        <input name="descricao" value="${escapeHtml(data.descricao || '')}" required></div>
      <div class="form-row">
        <div class="form-group"><label>${pessoaLabel}</label>
          <select name="${pessoaField}"><option value="">Nenhum</option>
            ${pessoas.map(p => `<option value="${p.id}" ${pessoaValue == p.id ? 'selected' : ''}>${escapeHtml(p.nome)}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Categoria</label>
          <input name="categoria" value="${escapeHtml(data.categoria || '')}" placeholder="${tipoFixo === 'Despesa' ? 'Ex: Aluguel, energia' : 'Ex: Venda, serviço'}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Valor *</label>
          <input name="valor" type="number" step="0.01" min="0" value="${data.valor || 0}" required></div>
        <div class="form-group"><label>Status</label>
          <select name="status">
            <option ${data.status === 'Pendente' || !data.status ? 'selected' : ''}>Pendente</option>
            <option ${data.status === 'Pago' ? 'selected' : ''}>Pago</option>
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Vencimento</label>
          <input name="data_vencimento" type="date" value="${toInputDate(data.data_vencimento)}"></div>
        <div class="form-group"><label>Pagamento</label>
          <input name="data_pagamento" type="date" value="${toInputDate(data.data_pagamento)}"></div>
      </div>
    </form>`,
    '<button class="btn btn-outline modal-close-btn">Cancelar</button><button class="btn btn-primary" id="entity-save">Salvar</button>');
  bindEntitySave(id, 'financeiro', renderFinanceiro, (body) => {
    body.valor = parseFloat(body.valor) || 0;
    body.cliente_id = body.cliente_id || null;
    body.fornecedor_id = body.fornecedor_id || null;
    if (body.status === 'Pago' && !body.data_pagamento) {
      body.data_pagamento = new Date().toISOString().slice(0, 10);
    }
  });
}

async function pagarFinanceiro(id) {
  if (!confirm('Marcar este lançamento como pago?')) return;
  try {
    const data = await API.financeiro.get(id);
    data.status = 'Pago';
    data.data_pagamento = data.data_pagamento || new Date().toISOString().slice(0, 10);
    await API.financeiro.update(id, data);
    showToast('Lançamento marcado como pago', 'success');
    renderFinanceiro();
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteFinanceiro(id) {
  if (!confirm('Deseja excluir este lançamento?')) return;
  try {
    await API.financeiro.delete(id);
    showToast('Lançamento excluído', 'success'); renderFinanceiro();
  } catch (err) { showToast(err.message, 'error'); }
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
        <thead><tr><th>#</th><th>Cliente</th><th>Total</th><th>Desconto</th><th>Pagamento</th><th>Status</th><th>NFC-e</th><th>Vendedor</th><th>Data</th><th>Acoes</th></tr></thead>
        <tbody id="table-body">${renderVendasRows(result.data)}</tbody>
      </table>
      <div id="table-pagination"></div>
    </div>`;
  bindTableEvents('historico-vendas', result, loadHistoricoVendas);
}

function renderVendasRows(data) {
  if (!data.length) return '<tr class="empty-row"><td colspan="10">Nenhum registro encontrado</td></tr>';
  return data.map(v => `<tr>
    <td>${v.id}</td><td>${escapeHtml(v.cliente_nome || 'Avulso')}</td><td>${formatCurrency(v.total)}</td>
    <td>${formatCurrency(v.desconto)}</td><td>${escapeHtml(v.forma_pagamento || '-')}</td>
    <td><span class="status-badge ${statusClass(v.status)}">${escapeHtml(v.status)}</span></td>
    <td>${v.nfce_status ? nfceStatusBadge(v.nfce_status) : '<span class="muted">-</span>'}</td>
    <td>${escapeHtml(v.usuario_nome || '-')}</td>
    <td>${formatDateTime(v.criado_em)}</td>
    <td class="actions-cell">
      <button class="btn-icon view" onclick="viewVenda(${v.id})" title="Detalhes"><i class="fas fa-eye"></i></button>
      <button class="btn-icon print" onclick="printCupom(${v.id})" title="Cupom / DANFE"><i class="fas fa-print"></i></button>
      ${v.status !== 'Cancelada' && (!v.nfce_status || ['erro','rejeitada'].includes(v.nfce_status)) ? `<button class="btn-icon edit" onclick="emitirNfceVenda(${v.id})" title="Emitir NFC-e"><i class="fas fa-file-invoice"></i></button>` : ''}
      ${v.status !== 'Cancelada' ? `<button class="btn-icon delete" onclick="cancelarVenda(${v.id})" title="Cancelar"><i class="fas fa-ban"></i></button>` : ''}
    </td>
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
  const n = v.nfce;
  openModal(`Venda #${v.id}`, `
    <p><strong>Cliente:</strong> ${escapeHtml(v.cliente_nome || 'Avulso')}</p>
    <p><strong>Total:</strong> ${formatCurrency(v.total)} | <strong>Desconto:</strong> ${formatCurrency(v.desconto)}</p>
    <p><strong>Pagamento:</strong> ${escapeHtml(v.forma_pagamento || '-')} | <strong>Data:</strong> ${formatDateTime(v.criado_em)}</p>
    <p><strong>Status:</strong> ${escapeHtml(v.status || '-')}${v.troco ? ` | <strong>Troco:</strong> ${formatCurrency(v.troco)}` : ''}</p>
    ${n ? `<div class="nfce-box">
      <p><strong>NFC-e</strong> ${nfceStatusBadge(n.status)} ${n.simulacao ? '<small class="muted">simulacao</small>' : ''}</p>
      <p>Numero ${n.numero || '-'} Serie ${n.serie || '-'} · ${escapeHtml(n.ambiente || '')}</p>
      <p>Protocolo: ${escapeHtml(n.protocolo || '-')}</p>
      <p class="nfce-chave">${chaveFormatada(n.chave)}</p>
      ${n.motivo ? `<p class="muted">${escapeHtml(n.motivo)}</p>` : ''}
    </div>` : '<p class="muted">Sem NFC-e nesta venda.</p>'}
    <table class="data-table" style="margin-top:12px">
      <thead><tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Subtotal</th></tr></thead>
      <tbody>${(v.itens || []).map(i => `<tr><td>${escapeHtml(i.produto_nome)}</td><td>${i.quantidade}</td><td>${formatCurrency(i.preco_unitario)}</td><td>${formatCurrency(i.subtotal)}</td></tr>`).join('')}
      </tbody></table>`,
    `<button class="btn btn-outline modal-close-btn">Fechar</button>
     <button class="btn btn-primary" id="venda-print">Imprimir</button>
     ${n?.xml !== undefined || n?.chave ? `<a class="btn btn-teal" id="venda-xml" href="/api/vendas/${id}/nfce.xml" target="_blank">XML</a>` : ''}
     ${v.status !== 'Cancelada' && (!n || ['erro','rejeitada'].includes(n.status)) ? '<button class="btn btn-success" id="venda-nfce">Emitir NFC-e</button>' : ''}
     ${v.status !== 'Cancelada' ? '<button class="btn btn-danger" id="venda-cancel">Cancelar venda</button>' : ''}`);
  document.querySelector('.modal-close-btn').onclick = closeModal;
  document.getElementById('venda-print').onclick = () => { closeModal(); printCupom(id); };
  const nfceBtn = document.getElementById('venda-nfce');
  if (nfceBtn) nfceBtn.onclick = () => { closeModal(); emitirNfceVenda(id); };
  const cancelBtn = document.getElementById('venda-cancel');
  if (cancelBtn) cancelBtn.onclick = () => { closeModal(); cancelarVenda(id); };
}

async function emitirNfceVenda(id) {
  try {
    const r = await API.nfce.emitir(id);
    showToast(r.message || 'NFC-e processada', r.nfce?.status === 'autorizada' ? 'success' : 'error');
    renderHistoricoVendas();
  } catch (err) { showToast(err.message, 'error'); }
}

async function cancelarVenda(id) {
  if (!confirm('Deseja cancelar esta venda? O estoque será devolvido.')) return;
  try {
    await API.vendas.cancelar(id);
    showToast('Venda cancelada', 'success');
    renderHistoricoVendas();
  } catch (err) { showToast(err.message, 'error'); }
}

// ===================== RELATÓRIO =====================
function relatorioDefaultRange(periodo) {
  const to = new Date();
  const from = new Date();
  if (periodo === 'hoje') { /* same day */ }
  else if (periodo === '7dias') from.setDate(from.getDate() - 6);
  else if (periodo === '30dias') from.setDate(from.getDate() - 29);
  else if (periodo === 'ano') from.setMonth(0, 1);
  else from.setDate(1);
  const iso = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return { de: iso(from), ate: iso(to) };
}

function relatorioKpi(titulo, valor, sub, icon, color) {
  return `
    <div class="rep-kpi">
      <div class="rep-kpi-body">
        <h4>${titulo}</h4>
        <div class="rep-kpi-value">${valor}</div>
        <span>${sub}</span>
      </div>
      <div class="rep-kpi-icon ${color}"><i class="fas ${icon}"></i></div>
    </div>`;
}

function relatorioLineChart(dados) {
  const w = 640, h = 260, padL = 48, padR = 16, padT = 16, padB = 36;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const max = Math.max(...dados.map(d => Math.max(d.receita || 0, d.lucro || 0)), 1);
  const step = innerW / Math.max(dados.length - 1, 1);
  const y = (v) => padT + innerH - (v / max) * innerH;
  const x = (i) => padL + i * step;
  const path = (key) => dados.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key] || 0).toFixed(1)}`).join(' ');
  const ticks = 5;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => {
    const val = max * (1 - i / ticks);
    const gy = padT + (innerH / ticks) * i;
    return `<line x1="${padL}" y1="${gy}" x2="${w - padR}" y2="${gy}" stroke="#E0E6EA" stroke-dasharray="4 4"/>
      <text x="${padL - 8}" y="${gy + 4}" text-anchor="end" fill="#90A4AE" font-size="11">${val.toFixed(2).replace('.', ',')}</text>`;
  }).join('');
  const labels = dados.map((d, i) => {
    if (dados.length > 16 && i % Math.ceil(dados.length / 8) !== 0 && i !== dados.length - 1) return '';
    const lab = String(d.dia || '').slice(8, 10) + '/' + String(d.dia || '').slice(5, 7);
    return `<text x="${x(i)}" y="${h - 10}" text-anchor="middle" fill="#90A4AE" font-size="10">${lab}</text>`;
  }).join('');
  if (!dados.length) return '<div class="rep-empty">Sem dados no período</div>';
  return `<svg class="rep-line-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${grid}
    <path d="${path('receita')}" fill="none" stroke="#43A047" stroke-width="2.5"/>
    <path d="${path('lucro')}" fill="none" stroke="#1E88E5" stroke-width="2.5"/>
    ${dados.map((d, i) => `<circle cx="${x(i)}" cy="${y(d.receita || 0)}" r="3" fill="#43A047"/>`).join('')}
    ${labels}
  </svg>
  <div class="rep-legend"><span class="leg-green"></span> Receita <span class="leg-blue"></span> Lucro</div>`;
}

function relatorioDonut(formas) {
  const total = formas.reduce((s, f) => s + (f.total || 0), 0);
  if (!total) return '<div class="rep-empty">Sem vendas no período</div>';
  const colors = ['#43A047', '#1E88E5', '#FB8C00', '#8E24AA', '#E53935', '#00838F'];
  let acc = 0;
  const r = 70, c = 2 * Math.PI * r;
  const rings = formas.map((f, i) => {
    const pct = f.total / total;
    const dash = pct * c;
    const gap = c - dash;
    const offset = c * 0.25 - acc * c;
    acc += pct;
    return `<circle cx="90" cy="90" r="${r}" fill="none" stroke="${colors[i % colors.length]}"
      stroke-width="28" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${offset}"></circle>`;
  }).join('');
  const legend = formas.map((f, i) => `
    <div><span class="dot" style="background:${colors[i % colors.length]}"></span>
      ${escapeHtml(f.forma)} · ${formatCurrency(f.total)}</div>`).join('');
  return `<div class="rep-donut-wrap">
    <svg viewBox="0 0 180 180" class="rep-donut">${rings}</svg>
    <div class="rep-donut-legend">${legend}</div>
  </div>`;
}

async function renderRelatorio() {
  const st = pageState.relatorio;
  st.periodo = st.periodo || 'mes';
  if (!st.de || !st.ate) {
    const range = relatorioDefaultRange(st.periodo);
    st.de = range.de;
    st.ate = range.ate;
  }
  const r = await API.relatorio({ periodo: st.periodo, de: st.de, ate: st.ate });
  const presets = [
    ['hoje', 'Hoje'], ['7dias', '7 dias'], ['30dias', '30 dias'], ['mes', 'Mes'], ['ano', 'Ano']
  ];

  document.getElementById('content').innerHTML = `
    <div class="rep-head">
      <div>
        <h2>Relatorio geral</h2>
        <p>Visao ampla para escolher quais graficos devem ficar no sistema.</p>
      </div>
      <div class="rep-filters">
        <div class="rep-presets">
          ${presets.map(([k, lab]) => `<button class="rep-preset ${st.periodo === k ? 'active' : ''}" data-periodo="${k}">${lab}</button>`).join('')}
        </div>
        <div class="rep-dates">
          <input type="date" id="rep-de" value="${st.de}">
          <span>ate</span>
          <input type="date" id="rep-ate" value="${st.ate}">
          <button class="btn btn-primary" id="rep-atualizar">Atualizar</button>
        </div>
      </div>
    </div>
    <div class="rep-kpis">
      ${relatorioKpi('Receita', formatCurrency(r.receita), `${r.vendas_ativas} vendas ativas`, 'fa-money-bill', 'green')}
      ${relatorioKpi('Lucro', formatCurrency(r.lucro), `Ticket medio ${formatCurrency(r.ticket_medio)}`, 'fa-chart-line', 'blue')}
      ${relatorioKpi('Itens vendidos', String(r.itens_vendidos || 0), 'Quantidade somada no periodo', 'fa-shopping-cart', 'purple')}
      ${relatorioKpi('Crediario aberto', formatCurrency(r.crediario_aberto), `Vencido ${formatCurrency(r.crediario_vencido)}`, 'fa-users', 'red')}
      ${relatorioKpi('Estoque', formatCurrency(r.estoque_valor), `${r.estoque_alertas || 0} produtos em alerta`, 'fa-box', 'teal')}
      ${relatorioKpi('Suprimentos', formatCurrency(r.suprimentos), `Sangrias ${formatCurrency(r.sangrias)}`, 'fa-donate', 'green')}
      ${relatorioKpi('Ordens abertas', String(r.ordens_abertas || 0), `${r.ordens_finalizadas || 0} finalizadas`, 'fa-tools', 'orange')}
      ${relatorioKpi('Alertas', String(r.alertas || 0), 'Produtos mais urgentes no estoque', 'fa-exclamation-triangle', 'orange')}
    </div>
    <div class="rep-charts">
      <div class="card">
        <h3>Receita e lucro por dia</h3>
        <p class="muted">Grafico principal para acompanhar o periodo selecionado</p>
        ${relatorioLineChart(r.porDia || [])}
      </div>
      <div class="card">
        <h3>Formas de pagamento</h3>
        <p class="muted">Participacao na receita</p>
        ${relatorioDonut(r.formasPagamento || [])}
      </div>
    </div>
    <div class="dashboard-grid">
      <div class="card report-section">
        <h3>Produtos mais vendidos</h3>
        <table class="report-table">
          <thead><tr><th>Produto</th><th>Qtd</th><th>Total</th></tr></thead>
          <tbody>${r.produtosMaisVendidos.length ? r.produtosMaisVendidos.map(p => `
            <tr><td>${escapeHtml(p.nome)}</td><td>${p.qtd}</td><td>${formatCurrency(p.total)}</td></tr>
          `).join('') : '<tr><td colspan="3">Sem dados</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="card report-section">
        <h3>Top clientes</h3>
        <table class="report-table">
          <thead><tr><th>Cliente</th><th>Compras</th><th>Total</th></tr></thead>
          <tbody>${r.clientesTop.length ? r.clientesTop.map(c => `
            <tr><td>${escapeHtml(c.nome)}</td><td>${c.qtd}</td><td>${formatCurrency(c.total)}</td></tr>
          `).join('') : '<tr><td colspan="3">Sem dados</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  document.querySelectorAll('.rep-preset').forEach(btn => {
    btn.onclick = () => {
      st.periodo = btn.dataset.periodo;
      const range = relatorioDefaultRange(st.periodo);
      st.de = range.de;
      st.ate = range.ate;
      renderRelatorio();
    };
  });
  document.getElementById('rep-atualizar').onclick = () => {
    st.de = document.getElementById('rep-de').value;
    st.ate = document.getElementById('rep-ate').value;
    st.periodo = 'custom';
    renderRelatorio();
  };
}

// ===================== CONFIGURAÇÕES =====================
async function renderConfiguracoes() {
  const cfg = await API.config.get();
  const ufs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  document.getElementById('content').innerHTML = `
    ${pageHeader('Configurações', 'Dashboard / Configurações')}
    <form id="config-form">
      <div class="card">
        <h3>Cupom fiscal</h3>
        <div class="form-group"><label>Título</label><input name="cupom_titulo" value="${escapeHtml(cfg.cupom_titulo || '')}"></div>
        <div class="form-group"><label>Cabeçalho</label><textarea name="cupom_cabecalho" rows="3">${escapeHtml(cfg.cupom_cabecalho || '')}</textarea></div>
        <div class="form-group"><label>Rodapé</label><textarea name="cupom_rodape" rows="2">${escapeHtml(cfg.cupom_rodape || '')}</textarea></div>
      </div>
      <div class="card">
        <h3>PDV</h3>
        <div class="form-group">
          <label class="check-label"><input type="checkbox" id="cfg-perguntar" ${cfg.perguntar_quantidade === '1' ? 'checked' : ''}> Perguntar quantidade ao adicionar produto</label>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Taxa cartão crédito (%)</label><input name="taxa_credito" type="number" step="0.01" value="${escapeHtml(cfg.taxa_credito || '0')}"></div>
          <div class="form-group"><label>Taxa cartão débito (%)</label><input name="taxa_debito" type="number" step="0.01" value="${escapeHtml(cfg.taxa_debito || '0')}"></div>
        </div>
      </div>
      <div class="card">
        <h3>NFC-e</h3>
        <p class="muted">Credencie a empresa na SEFAZ, obtenha o CSC (token + ID) e o certificado digital A1 (.pfx). Homologacao primeiro; so va para producao apos testes.</p>
        ${cfg.nfce_pronta === '1'
          ? '<p class="nfce-ok">Pronta para transmitir a SEFAZ.</p>'
          : `<p class="nfce-warn">Pendencias: ${escapeHtml(cfg.nfce_pronta_erros || 'preencha os dados fiscais')}</p>`}
        <div class="form-group">
          <label class="check-label"><input type="checkbox" id="cfg-nfce" ${cfg.nfce_habilitada === '1' ? 'checked' : ''}> Habilitar NFC-e</label>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Ambiente</label>
            <select name="nfce_ambiente">
              <option value="homologacao" ${cfg.nfce_ambiente !== 'producao' ? 'selected' : ''}>Homologacao</option>
              <option value="producao" ${cfg.nfce_ambiente === 'producao' ? 'selected' : ''}>Producao</option>
            </select></div>
          <div class="form-group"><label>UF</label>
            <select name="nfce_uf">${ufs.map(u => `<option ${cfg.nfce_uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>CNPJ</label><input name="nfce_cnpj" value="${escapeHtml(cfg.nfce_cnpj || '')}" placeholder="00.000.000/0000-00"></div>
          <div class="form-group"><label>Inscricao estadual</label><input name="nfce_ie" value="${escapeHtml(cfg.nfce_ie || '')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Razao social</label><input name="nfce_razao_social" value="${escapeHtml(cfg.nfce_razao_social || '')}"></div>
          <div class="form-group"><label>Nome fantasia</label><input name="nfce_nome_fantasia" value="${escapeHtml(cfg.nfce_nome_fantasia || '')}"></div>
        </div>
        <div class="form-group"><label>Logradouro</label><input name="nfce_logradouro" value="${escapeHtml(cfg.nfce_logradouro || '')}"></div>
        <div class="form-row-3">
          <div class="form-group"><label>Numero</label><input name="nfce_numero" value="${escapeHtml(cfg.nfce_numero || '')}"></div>
          <div class="form-group"><label>Bairro</label><input name="nfce_bairro" value="${escapeHtml(cfg.nfce_bairro || '')}"></div>
          <div class="form-group"><label>CEP</label><input name="nfce_cep" value="${escapeHtml(cfg.nfce_cep || '')}"></div>
        </div>
        <div class="form-row-3">
          <div class="form-group"><label>Municipio</label><input name="nfce_municipio" value="${escapeHtml(cfg.nfce_municipio || '')}"></div>
          <div class="form-group"><label>Codigo IBGE</label><input name="nfce_codigo_municipio" value="${escapeHtml(cfg.nfce_codigo_municipio || '')}" placeholder="2410306"></div>
          <div class="form-group"><label>Telefone</label><input name="nfce_telefone" value="${escapeHtml(cfg.nfce_telefone || '')}"></div>
        </div>
        <div class="form-row-3">
          <div class="form-group"><label>CRT</label>
            <select name="nfce_crt">
              <option value="1" ${cfg.nfce_crt !== '3' && cfg.nfce_crt !== '2' ? 'selected' : ''}>1 - Simples Nacional</option>
              <option value="2" ${cfg.nfce_crt === '2' ? 'selected' : ''}>2 - Simples excesso</option>
              <option value="3" ${cfg.nfce_crt === '3' ? 'selected' : ''}>3 - Regime normal</option>
            </select></div>
          <div class="form-group"><label>Serie NFC-e</label><input name="nfce_serie" type="number" min="1" value="${escapeHtml(cfg.nfce_serie || '1')}"></div>
          <div class="form-group"><label>Ultimo numero</label><input name="nfce_numero_atual" type="number" min="0" value="${escapeHtml(cfg.nfce_numero_atual || '0')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>CSC ID</label><input name="nfce_csc_id" value="${escapeHtml(cfg.nfce_csc_id || '')}" placeholder="ID do token SEFAZ"></div>
          <div class="form-group"><label>CSC token</label><input name="nfce_csc_token" type="password" placeholder="${cfg.nfce_csc_token === '1' ? 'Token ja salvo (deixe em branco para manter)' : 'Token CSC'}" autocomplete="new-password"></div>
        </div>
        <div class="form-group"><label>Certificado A1 (.pfx)</label>
          <input type="file" id="cfg-pfx" accept=".pfx,.p12">
          <input type="hidden" name="nfce_certificado_pfx" id="cfg-pfx-b64" value="">
          <small class="muted">${cfg.nfce_certificado_nome ? `Atual: ${escapeHtml(cfg.nfce_certificado_nome)} validade ${escapeHtml(cfg.nfce_certificado_validade || '-')}` : 'Nenhum certificado enviado'}</small>
        </div>
        <div class="form-group"><label>Senha do certificado</label>
          <input name="nfce_certificado_senha" type="password" placeholder="${cfg.nfce_certificado_senha === '1' ? 'Senha ja salva (deixe em branco para manter)' : 'Senha do PFX'}" autocomplete="new-password"></div>
        <div class="form-group">
          <label class="check-label"><input type="checkbox" id="cfg-nfce-auto" ${cfg.nfce_emitir_automatico === '1' ? 'checked' : ''}> Emitir automaticamente ao finalizar no PDV (F7)</label>
        </div>
        <div class="form-group">
          <label class="check-label"><input type="checkbox" id="cfg-nfce-sim" ${cfg.nfce_simulacao === '1' ? 'checked' : ''}> Modo simulacao (nao transmite a SEFAZ; use para treinar o fluxo)</label>
        </div>
      </div>
      <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Salvar configurações</button>
    </form>`;
  document.getElementById('cfg-pfx').onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { document.getElementById('cfg-pfx-b64').value = String(reader.result || ''); };
    reader.readAsDataURL(file);
  };
  document.getElementById('config-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd);
    body.perguntar_quantidade = document.getElementById('cfg-perguntar').checked ? '1' : '0';
    body.nfce_habilitada = document.getElementById('cfg-nfce').checked ? '1' : '0';
    body.nfce_emitir_automatico = document.getElementById('cfg-nfce-auto').checked ? '1' : '0';
    body.nfce_simulacao = document.getElementById('cfg-nfce-sim').checked ? '1' : '0';
    if (!body.nfce_csc_token) delete body.nfce_csc_token;
    if (!body.nfce_certificado_senha) delete body.nfce_certificado_senha;
    if (!body.nfce_certificado_pfx) delete body.nfce_certificado_pfx;
    try {
      const saved = await API.config.save(body);
      erpConfig = { ...erpConfig, ...saved };
      showToast('Configurações salvas', 'success');
      renderConfiguracoes();
    } catch (err) { showToast(err.message, 'error'); }
  };
}

async function renderManual() {
  document.getElementById('content').innerHTML = `
    ${pageHeader('Manual', 'Dashboard / Manual')}
    <div class="card manual-card">
      <h3>Como usar o ERP ISAC</h3>
      <ol class="manual-list">
        <li><strong>Login</strong> — Acesse com email e senha. Padrão: admin@erpisac.com / admin123.</li>
        <li><strong>Dashboard</strong> — Acompanhe vendas, estoque, OS e contas. Troque o período do gráfico.</li>
        <li><strong>Caixa</strong> — Abra o caixa com um valor inicial antes de vender. Feche ao final do dia.</li>
        <li><strong>Vendas</strong> — Busque por nome ou código de barras, monte o carrinho e finalize o pagamento.</li>
        <li><strong>Clientes / Produtos / Fornecedores</strong> — Cadastre, edite e pesquise registros com paginação.</li>
        <li><strong>Ordens de serviço</strong> — Controle status, datas e valor previsto de cada OS.</li>
        <li><strong>Financeiro</strong> — Lance receitas e despesas, marque como pago ou pendente.</li>
        <li><strong>Histórico</strong> — Consulte vendas, imprima cupom/DANFE, emita NFC-e ou cancele (estoque volta automaticamente).</li>
        <li><strong>Relatório</strong> — Veja faturamento mensal, produtos mais vendidos e top clientes.</li>
        <li><strong>Configurações</strong> — Personalize cupom, taxas de cartão, pergunta de quantidade no PDV e dados da NFC-e (CNPJ, CSC, certificado A1, série e ambiente).</li>
        <li><strong>Assistente IA</strong> — O botao azul no canto inferior direito responde duvidas identificando o modulo e a sessao.</li>
      </ol>
    </div>
    <div class="card">
      <h3>Atalhos do cabeçalho</h3>
      <ul class="manual-list">
        <li>Sino: notificações de estoque baixo, OS pronta e contas atrasadas.</li>
        <li>Engrenagem: abre Configurações.</li>
        <li>Interruptor: tema claro/escuro.</li>
        <li>Calculadora e tela cheia: ferramentas rápidas.</li>
      </ul>
    </div>`;
}

function initAssistenteChat() {
  const root = document.getElementById('ai-chat');
  const panel = document.getElementById('ai-chat-panel');
  const toggle = document.getElementById('ai-chat-toggle');
  const closeBtn = document.getElementById('ai-chat-close');
  const form = document.getElementById('ai-chat-form');
  const input = document.getElementById('ai-chat-input');
  const box = document.getElementById('ai-chat-messages');
  if (!root || !panel || !form || box.dataset.ready) return;
  box.dataset.ready = '1';

  const chips = [
    'Como vender no PDV?',
    'Como cobrar uma OS?',
    'Como abrir o caixa?',
    'Quais niveis de acesso existem?'
  ];
  const addMsg = (role, texto, meta) => {
    const el = document.createElement('div');
    el.className = `ai-msg ${role}`;
    el.innerHTML = `${meta ? `<span class="ai-msg-meta">${escapeHtml(meta)}</span>` : ''}${escapeHtml(texto)}`;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  };
  addMsg('bot', 'Ola! Sou o assistente do ERP ISAC. Pergunte sobre o modulo ou a sessao em que estiver com duvida.');
  const chipWrap = document.createElement('div');
  chipWrap.className = 'ai-chat-chips';
  chipWrap.innerHTML = chips.map(c => `<button type="button" class="ai-chip">${escapeHtml(c)}</button>`).join('');
  box.appendChild(chipWrap);
  chipWrap.querySelectorAll('.ai-chip').forEach(btn => {
    btn.onclick = () => { input.value = btn.textContent; form.requestSubmit(); };
  });

  toggle.onclick = () => panel.classList.toggle('hidden');
  closeBtn.onclick = () => panel.classList.add('hidden');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const pergunta = input.value.trim();
    if (!pergunta) return;
    input.value = '';
    addMsg('user', pergunta);
    const wait = document.createElement('div');
    wait.className = 'ai-msg bot';
    wait.textContent = 'Consultando o sistema...';
    box.appendChild(wait);
    box.scrollTop = box.scrollHeight;
    try {
      const r = await API.assistente(pergunta, currentPage);
      wait.remove();
      const meta = r.modulo ? `${r.modulo}${r.sessao ? ' / ' + r.sessao : ''}` : '';
      addMsg('bot', r.texto || 'Nao consegui responder agora.', meta);
    } catch (err) {
      wait.remove();
      addMsg('bot', err.message || 'Falha ao consultar o assistente.');
    }
  };
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
    const form = document.getElementById('entity-form');
    if (form && !form.reportValidity()) return;
    const fd = new FormData(form);
    const body = Object.fromEntries(fd);
    try { if (transform) transform(body); }
    catch (err) { showToast(err.message, 'error'); return; }
    if (body.preco !== undefined) body.preco = parseFloat(body.preco);
    if (body.preco_custo !== undefined) body.preco_custo = parseFloat(body.preco_custo);
    if (body.estoque !== undefined) body.estoque = parseInt(body.estoque);
    if (body.estoque_minimo !== undefined) body.estoque_minimo = parseInt(body.estoque_minimo);
    if (body.fornecedor_id !== undefined) body.fornecedor_id = body.fornecedor_id || null;
    if (body.cliente_id !== undefined) body.cliente_id = body.cliente_id || null;
    try {
      if (id) await API[apiKey].update(id, body);
      else await API[apiKey].create(body);
      closeModal(); showToast('Salvo com sucesso!', 'success'); rerender();
    } catch (err) { showToast(err.message, 'error'); }
  };
}
