module.exports = [
  {
    id: 'login',
    modulo: 'Login',
    sessao: 'Acesso ao sistema',
    pagina: 'login',
    titulo: 'Como entrar no ERP ISAC',
    keywords: 'login entrar senha email acesso autenticacao sair logout usuario',
    conteudo: `O acesso e feito na tela inicial com e-mail e senha. Login padrao do administrador: admin@erpisac.com / admin123. Contas de demonstracao: gerente@erpisac.com / gerente123, vendedor@erpisac.com / venda123, caixa@erpisac.com / caixa123. Se as credenciais estiverem erradas, o sistema exibe Credenciais invalidas. Para sair, use o menu do usuario no canto superior direito e clique em Sair.`,
    passos: [
      'Abra o sistema no navegador.',
      'Informe e-mail e senha.',
      'Clique em Entrar.',
      'O menu lateral mostra apenas as telas liberadas para o cargo.'
    ]
  },
  {
    id: 'dashboard',
    modulo: 'Dashboard',
    sessao: 'Visao geral',
    pagina: 'dashboard',
    titulo: 'Painel inicial com indicadores',
    keywords: 'dashboard inicio metricas resumo vendas estoque os contas grafico',
    conteudo: `O Dashboard e a tela inicial. Mostra vendas do dia e do mes, clientes, produtos, estoque baixo, ordens de servico abertas e prontas, contas a pagar e a receber, e vendas recentes. O grafico de receita pode ser filtrado por periodo. Use o sino no cabecalho para ver alertas de estoque baixo, OS pronta e contas atrasadas.`,
    passos: [
      'Acesse Dashboard no menu lateral.',
      'Leia os cards de indicadores no topo.',
      'Troque o periodo do grafico quando quiser comparar.',
      'Clique no sino para ver notificacoes.'
    ]
  },
  {
    id: 'vendas-pdv',
    modulo: 'Realizar vendas',
    sessao: 'PDV e carrinho',
    pagina: 'vendas',
    titulo: 'Como vender no caixa',
    keywords: 'venda pdv caixa livre carrinho item produto finalizar f7 f8 f3 aba cliente visitante nfce nota fiscal fiado crediario margem taxa',
    conteudo: `A tela Realizar vendas e o PDV. O caixa precisa estar aberto; se estiver fechado, o sistema pede para ir em Gerenciar caixa. A venda comeca vazia (Caixa livre). Busque o item, monte o carrinho, escolha o cliente (padrao Visitante) e finalize com F7. Formas de pagamento: Dinheiro, Cartao Debito, Cartao Credito, PIX e Fiado. Venda a vista lanca Receita Pago no Financeiro; Fiado exige cliente cadastrado e gera Contas a receber. Taxas de cartao/PIX descontam o liquido. Cliente inadimplente recebe alerta. O painel mostra margem estimada (preco menos custo). Se a NFC-e estiver habilitada, o F7 pode emitir a nota automaticamente.`,
    passos: [
      'Abra o caixa em Gerenciar caixa.',
      'Entre em Realizar vendas.',
      'Se quiser, clique no botao Visitante para selecionar o cliente.',
      'Busque o produto, categoria ou ordem de servico na lupa.',
      'Ajuste quantidades no carrinho.',
      'Pressione F7, escolha o pagamento e confirme.',
      'Imprima o cupom se desejar.'
    ]
  },
  {
    id: 'vendas-lupa',
    modulo: 'Realizar vendas',
    sessao: 'Lupa de busca',
    pagina: 'vendas',
    titulo: 'Buscar produto, categoria ou ordem de servico',
    keywords: 'lupa buscar pesquisa produto categoria ordem servico os notebook celular dropdown',
    conteudo: `A lupa do PDV abre o menu BUSCAR EM com tres opcoes. Produto: nome, codigo de barras, SKU ou ID. Categoria: lista produtos da categoria digitada. Ordem de servico: cliente, aparelho, problema ou numero da OS. Clique na seta ao lado da lupa, escolha o tipo, digite e clique no resultado para adicionar ao carrinho. Ordens Entregue ou Cancelada nao entram na cobrança. A mesma OS nao pode ser adicionada duas vezes.`,
    passos: [
      'Clique na lupa com a seta no campo de busca.',
      'Escolha Produto, Categoria ou Ordem de servico.',
      'Digite o termo (ex.: notebook, celular, OS 2).',
      'Clique no resultado para colocar no carrinho.',
      'No caso de OS, o cliente da ordem e preenchido automaticamente se a aba estiver em Visitante.'
    ]
  },
  {
    id: 'vendas-os',
    modulo: 'Realizar vendas',
    sessao: 'Cobrar ordem de servico',
    pagina: 'vendas',
    titulo: 'Cobrar OS no caixa',
    keywords: 'cobrar os ordem servico notebook celular valor previsto entregue finalizar',
    conteudo: `Para cobrar uma OS, use a lupa em Ordem de servico e adicione a OS ao carrinho. O item aparece com a tag OS, quantidade 1 e o valor previsto. Ao finalizar a venda (F7), a ordem e marcada como Entregue. Se a venda for cancelada no historico, a OS volta para Pronta para entrega. Servicos avulsos (sem OS) tambem podem ser lancados pelo F8 na aba Servico.`,
    passos: [
      'Na lupa, escolha Ordem de servico.',
      'Selecione a OS (ex.: OS notebook ou OS celular).',
      'Confira o valor no carrinho.',
      'Finalize com F7.',
      'A OS passa para status Entregue.'
    ]
  },
  {
    id: 'vendas-atalhos',
    modulo: 'Realizar vendas',
    sessao: 'Atalhos e acoes',
    pagina: 'vendas',
    titulo: 'Atalhos do PDV',
    keywords: 'atalho f7 f8 f6 f3 ctrl pdf orcamento historico pedido cancelar',
    conteudo: `F7 finaliza a venda. F8 abre Produto / servico para buscar produto ou lancar um servico avulso. F6 mostra historico de pedidos e permite repetir. F3 cancela a venda atual e limpa o carrinho. PDF imprime o pedido da aba. Orcamento salva e imprime um orcamento com os itens atuais.`,
    passos: [
      'F7: finalizar venda.',
      'F8: produto ou servico avulso.',
      'F6: historico de pedidos.',
      'F3: cancelar venda da aba.',
      'Ctrl+T / Ctrl+W: nova aba / fechar aba.'
    ]
  },
  {
    id: 'caixa',
    modulo: 'Gerenciar caixa',
    sessao: 'Abertura e fechamento',
    pagina: 'caixa',
    titulo: 'Abrir, movimentar e fechar o caixa',
    keywords: 'caixa abrir fechar entrada saida suprimento sangria movimento historico saldo financeiro',
    conteudo: `Em Gerenciar caixa voce abre o caixa com valor inicial antes de vender. Com o caixa aberto aparecem total do caixa, vendas, cartao/PIX e venda liquida. Use Entrada (suprimento) e Saida (sangria): esses lancamentos alimentam Receita/Despesa no Financeiro em tempo real. Historico mostra sessoes anteriores. Fechar caixa encerra o dia. Sem caixa aberto o PDV nao vende.`,
    passos: [
      'Abra Gerenciar caixa.',
      'Clique em Abrir caixa e informe o valor inicial.',
      'Lance Entrada ou Saida quando precisar.',
      'Ao final do dia clique em Fechar caixa.',
      'Consulte Historico para sessoes passadas.'
    ]
  },
  {
    id: 'financeiro',
    modulo: 'Financeiro',
    sessao: 'Contas a pagar e receber',
    pagina: 'financeiro',
    titulo: 'Contas a pagar, receber e previsao',
    keywords: 'financeiro pagar receber conta vencido saldo previsao despesa receita pdv fiado taxa sangria dre resultado',
    conteudo: `O Financeiro tem abas Contas a pagar, Contas a receber e DRE. Os cards mostram a receber, receber vencido, a pagar, pagar vencido e saldo previsto, alem de previsao em 7, 15 e 30 dias. Vendas a vista do PDV entram como Receita Pago; Fiado entra como Contas a receber. Taxas de cartao/PIX geram Despesa Taxa operadora. Sangria e suprimento do Caixa tambem lancam sozinhos. Cadastre descricao, cliente ou fornecedor, categoria, valor, vencimento e status. Marque como pago ou pendente. Lancamentos vencidos entram nas notificacoes e no alerta do PDV.`,
    passos: [
      'Abra Financeiro no menu.',
      'Escolha Contas a pagar, Contas a receber ou a aba DRE.',
      'Clique em Nova conta e preencha os dados.',
      'Altere o status quando pagar ou receber.',
      'Acompanhe as previsoes e os valores vencidos.'
    ]
  },
  {
    id: 'dre',
    modulo: 'Financeiro',
    sessao: 'DRE - Demonstracao do Resultado',
    pagina: 'financeiro',
    titulo: 'Resultado do exercicio (DRE) por competencia',
    keywords: 'dre demonstracao resultado exercicio lucro prejuizo receita bruta liquida cmv lucro bruto despesa operacional lajir margem competencia fiado receber cobrar cliente',
    conteudo: `A aba DRE no Financeiro monta a Demonstracao do Resultado no regime de competencia: o faturamento entra pela data da venda e as despesas pela data de vencimento, independentemente do pagamento (diferente do extrato, que e de caixa). Receita Bruta = vendas de produtos + servicos (OS) + outras receitas; Deducoes = descontos, impostos sobre vendas e estornos; depois CMV (custo dos itens vendidos), Despesas administrativas e comerciais (inclui taxas de operadora), Resultado Operacional (LAJIR), Resultado Financeiro e Lucro/Prejuizo Liquido. Venda fiado entra na Receita Bruta no dia da venda e aparece na linha Fiado a receber (a cobrar) em negativo, com o nome do cliente, para controle de cobranca (o titulo vence em 30 dias). Compras de estoque ficam fora do DRE (vao para o ativo) e aparecem na secao Fora do DRE. A classificacao usa a categoria do lancamento (imposto, aluguel, energia, taxa, juros, estoque, etc.). Filtre por periodo e baixe TXT ou CSV para o contador.`,
    passos: [
      'Abra Financeiro e clique na aba DRE.',
      'Escolha o periodo (Hoje, 7 dias, 30 dias, Mes, Ano) ou informe De e Ate.',
      'Confira as linhas da DRE, o card Fiado a receber e a tabela de clientes a cobrar.',
      'Veja o detalhamento por categoria e os itens Fora do DRE.',
      'Baixe TXT ou CSV para enviar ao contador.'
    ]
  },
  {
    id: 'clientes',
    modulo: 'Clientes',
    sessao: 'Cadastro',
    pagina: 'clientes',
    titulo: 'Cadastrar e pesquisar clientes',
    keywords: 'cliente cadastro cpf telefone whatsapp email endereco pesquisar editar excluir',
    conteudo: `Em Clientes voce cadastra nome, CPF/CNPJ, telefone (WhatsApp), e-mail e endereco. A lista tem busca e paginacao. O icone do WhatsApp ao lado do telefone abre a conversa com o cliente. O cliente pode ser selecionado no PDV no botao Visitante. Ordens de servico e contas a receber tambem usam o cadastro de clientes.`,
    passos: [
      'Abra Clientes.',
      'Clique em Novo Cliente.',
      'Preencha os dados, inclusive o telefone/WhatsApp, e salve.',
      'Use a busca para localizar e editar.',
      'Clique no icone do WhatsApp para falar com o cliente.',
      'No PDV, clique em Visitante para vincular o cliente a venda.'
    ]
  },
  {
    id: 'produtos',
    modulo: 'Produtos',
    sessao: 'Estoque e cadastro',
    pagina: 'produtos',
    titulo: 'Produtos, estoque, codigo e promocao',
    keywords: 'produto estoque preco codigo barras sku categoria categorias cadastro promocao foto minimo importar exportar csv excel xlsx xml json sql dose garrafa bebida consumo servico kit pesavel composicao fracionado',
    conteudo: `Produtos controla nome, codigo de barras, descricao, preco de venda, preco de custo, estoque, estoque minimo, categoria, fornecedor, foto e promocao. A categoria vem do cadastro em Categorias (menu lateral ou botao na toolbar de Produtos): nome, descricao e quantidade de produtos. No formulario do produto escolha a categoria no select (botao + cria na hora). A lista de produtos filtra por categoria. Renomear a categoria atualiza os produtos; so e possivel excluir se nenhum produto ativo estiver nela. No cadastro escolha o tipo: Produto (estoque proprio), Servico (nao controla estoque), Kit (composicao; a venda baixa cada item) ou Pesavel (quantidade decimal, unidade KG). Estoque baixo gera alerta no sino. Ajuste de estoque registra movimento. No PDV o estoque e baixado na venda e devolvido se a venda for cancelada. Para bebidas por dose, cadastre a garrafa com estoque em unidades e a dose com Produzido a partir de = garrafa e Consumo por unidade = 1/doses (ex.: 20 doses = 0,05). A venda da dose baixa a fração da garrafa. Importar e Exportar na toolbar (e em Opcoes) aceitam Excel, CSV, TXT, JSON, XML, SQL, HTML e Markdown. Na importacao, produto com o mesmo codigo de barras ou o mesmo nome e atualizado; os demais sao cadastrados. Campos obrigatorios: nome, codigo, preco e estoque. Use Exportar > Baixar modelo para o layout.`,
    passos: [
      'Abra Categorias para cadastrar os grupos de estoque, ou use o botao Categorias em Produtos.',
      'Abra Produtos e clique em Adicionar ou use Importar.',
      'Escolha o tipo: Produto, Servico, Kit ou Pesavel.',
      'Informe nome, preco, estoque e escolha a categoria no select.',
      'Para dose: escolha a garrafa em Produzido a partir de e o consumo (ex.: 0,05).',
      'Para kit: adicione os itens da composicao com a quantidade de cada um.',
      'Se quiser, cadastre codigo de barras para a lupa do PDV.',
      'Use Importar/Exportar para planilha, CSV, JSON, XML ou SQL.',
      'Use o menu de acoes para estoque, promocao ou edicao.',
      'Mantenha o estoque minimo para receber alertas.',
      'Use o filtro Todas as categorias na lista de produtos.'
    ]
  },
  {
    id: 'categorias',
    modulo: 'Categorias',
    sessao: 'Estoque e cadastro',
    pagina: 'categorias',
    titulo: 'Categorias de estoque',
    keywords: 'categoria categorias estoque grupo classificacao produto filtro cadastro',
    conteudo: `Categorias de estoque organiza os produtos em grupos (ex.: Bebidas, Informatica, Pecas). Cada categoria tem nome e descricao opcional. O cadastro do produto usa um select com essas categorias. A lista de produtos filtra por categoria. Ao renomear, os produtos vinculados acompanham. Nao e possivel excluir uma categoria que ainda tenha produtos ativos. Nomes ja usados no campo texto antigo sao migrados automaticamente.`,
    passos: [
      'Abra Categorias no menu ou o botao Categorias em Produtos.',
      'Clique em Nova categoria e informe o nome.',
      'No cadastro do produto, escolha a categoria no select.',
      'Na lista de produtos, use o filtro Todas as categorias.'
    ]
  },
  {
    id: 'estoque',
    modulo: 'Estoque',
    sessao: 'Busca de itens',
    pagina: 'estoque',
    titulo: 'Consultar e ajustar o estoque',
    keywords: 'estoque busca saldo minimo situacao zerado baixo inventario ajuste entrada localizacao marca categoria',
    conteudo: `A aba Estoque lista os itens com saldo, minimo, local, custo e valor (quantidade x custo). Cards no topo: quantidade de itens, valor a custo, estoque baixo e sem estoque. A pesquisa cobre nome, codigo, marca, referencia, categoria e localizacao. Filtros: categoria, situacao (Em estoque, Estoque baixo, Sem estoque, Nao controla) e tipo (Produto, Pesavel, Kit, Servico). Servico nao controla estoque; Kit mostra o saldo pela composicao; dose mostra as doses restantes da garrafa. No menu de acoes: editar, compra/entrada, ajustar estoque e inventario. O valor de estoque usa o preco de custo (nao o de venda).`,
    passos: [
      'Abra Estoque no menu ou o botao Estoque em Produtos.',
      'Use a busca (nome, codigo, marca ou local).',
      'Filtre por categoria, situacao ou tipo.',
      'No menu do item, registre entrada, ajuste ou inventario.'
    ]
  },
  {
    id: 'loja',
    modulo: 'Loja digital',
    sessao: 'Catalogo e WhatsApp',
    pagina: 'configuracoes',
    titulo: 'Site para anunciar produtos e pedir no WhatsApp',
    keywords: 'loja site vitrine catalogo digital whatsapp pedido carrinho produto anunciar',
    conteudo: `A loja digital fica em /loja (sem login). Mostra os produtos ativos com foto, preco, promocao e categorias. O cliente monta o carrinho, informa nome e WhatsApp e envia o pedido para o WhatsApp da loja cadastrado em Configuracoes. Kits nao entram na vitrine. No cadastro de Clientes, o icone do WhatsApp abre conversa com o telefone do cliente.`,
    passos: [
      'Em Configuracoes, preencha o WhatsApp da loja e Salvar empresa.',
      'Cadastre produtos com foto, preco e categoria.',
      'Abra /loja (link Site da loja em Configuracoes).',
      'O cliente adiciona itens, preenche nome e WhatsApp e clica em Pedir no WhatsApp.',
      'Para falar com um cliente cadastrado, use o icone do WhatsApp em Clientes.'
    ]
  },
  {
    id: 'compras',
    modulo: 'Pedidos de compras',
    sessao: 'Compras e recebimento',
    pagina: 'compras',
    titulo: 'Pedir, aprovar e receber mercadoria',
    keywords: 'compra compras pedido fornecedor aprovar recusar receber estoque conta pagar boleto',
    conteudo: `Pedidos de compras controla a compra de mercadoria. Abas: Todos, Aguardando, Aprovados, Recusados e Recebidos. Colunas: numero, status, fornecedor, data, valor, pagamento e acoes. Crie o pedido com fornecedor, data, forma de pagamento e itens (quantidade e custo). Fluxo: Aguardando -> Aprovar ou Recusar; Aprovado -> Receber (entra no estoque, atualiza o custo e lanca conta a pagar no Financeiro, categoria Estoque). Pedido recebido nao edita nem exclui. Servico, kit e dose nao entram como item de estoque. Acesso: Administrador e Gerente.`,
    passos: [
      'Abra Pedidos de compras no menu.',
      'Clique em Novo Pedido de Compra, escolha o fornecedor e inclua os itens.',
      'Salve. O pedido fica Aguardando.',
      'Aprove ou recuse no menu de acoes.',
      'No pedido Aprovado, clique em Receber para entrar o estoque e gerar a conta a pagar.'
    ]
  },
  {
    id: 'rh-funcionarios',
    modulo: 'R.H.',
    sessao: 'Funcionarios',
    pagina: 'rh-funcionarios',
    titulo: 'Cadastrar funcionarios e vincular grade',
    keywords: 'rh recursos humanos funcionario cargo salario admissao cpf grade horaria equipe colaborador',
    conteudo: `Em R.H. > Funcionarios voce cadastra nome, CPF, cargo, telefone, e-mail, data de admissao, salario e a grade horaria. Status Ativo/Inativo. A lista mostra grade vinculada e permite abrir a folha de ponto do funcionario. Excluir desativa o cadastro. Acesso: Administrador e Gerente.`,
    passos: [
      'Abra R.H. > Funcionarios.',
      'Clique em Novo Funcionario.',
      'Preencha nome, cargo, admissao, salario e a grade.',
      'Salve. Use o relogio na linha para ver a folha de ponto.'
    ]
  },
  {
    id: 'rh-pontos',
    modulo: 'R.H.',
    sessao: 'Folhas de ponto',
    pagina: 'rh-pontos',
    titulo: 'Registrar ponto e acompanhar a folha',
    keywords: 'rh ponto batida folha jornada extra banco horas entrada saida intervalo funcionario',
    conteudo: `Folhas de ponto registram batidas (Entrada, Inicio intervalo, Fim intervalo, Saida). Filtre por funcionario e periodo. Com um funcionario selecionado, os cards mostram previsto, trabalhado, extras e saldo/banco conforme a grade. Extra e o que passar da jornada do dia. Banco de horas so conta se a grade permitir.`,
    passos: [
      'Abra R.H. > Folhas de Ponto.',
      'Clique em Registrar ponto, escolha funcionario, data, horario e tipo.',
      'Filtre por funcionario e datas para ver a folha.',
      'Exclua uma batida se foi lancada errada.'
    ]
  },
  {
    id: 'rh-grades',
    modulo: 'R.H.',
    sessao: 'Grades horarias',
    pagina: 'rh-grades',
    titulo: 'Cadastrar grade horario de trabalho',
    keywords: 'rh grade horaria jornada comercial flexivel banco horas intervalo localizacao unidade equipe',
    conteudo: `Grades horarias definem a jornada dos funcionarios. Cadastro no estilo SimpleDot: Nome, Status Ativo/Inativo, Tipo Comercial ou Flexivel, horas previstas por dia/semana/mes, limite de horas por dia, intervalo minimo, banco de horas, exigir localizacao e exigir estar perto da unidade. Breadcrumb: Dashboard / R.H. / Grades Horarias / Novo. Botoes Voltar e Salvar. Grade flexivel calcula o saldo pelas batidas. Nao exclui grade em uso por funcionario ativo.`,
    passos: [
      'Abra R.H. > Grades Horarias.',
      'Clique em Nova grade.',
      'Informe nome, status, tipo e as horas.',
      'Defina banco de horas e regras de localizacao.',
      'Salve e vincule a grade no cadastro do funcionario.'
    ]
  },
  {
    id: 'ecommerce',
    modulo: 'Loja online',
    sessao: 'API e webhooks',
    pagina: 'ecommerce',
    titulo: 'Integrar WooCommerce, Shopify, Nuvemshop, VTEX ou Mercado Livre',
    keywords: 'ecommerce loja virtual webhook api shopify woocommerce nuvemshop vtex mercadolivre mercado livre meli estoque pedido cliente sincronizar',
    conteudo: `Loja online recebe pedidos da vitrine (WooCommerce, Shopify, Nuvemshop, VTEX, Mercado Livre ou API generica). Pedido pago cadastra/atualiza o cliente, gera venda no ERP e baixa o estoque. O SKU da loja deve ser o codigo de barras do produto (ou o campo sku_ecommerce). Cancelamento/estorno devolve o estoque. O mesmo id externo nao gera venda duplicada. Autenticacao: HMAC/secret da plataforma ou Bearer erp_live_.... Mercado Livre: cole o Access Token; a notificacao so traz o id — o ERP consulta GET /orders/{id} na API. Nao exige caixa aberto. Acesso: Administrador e Gerente.`,
    passos: [
      'Abra Loja online no menu.',
      'Cole o segredo da plataforma (ou o Access Token do Mercado Livre) e Salvar conexao.',
      'Cadastre o webhook na loja apontando para a URL exibida.',
      'No Mercado Livre, use POST /api/webhooks/mercadolivre (topico orders_v2).',
      'Ou gere um token Bearer e envie POST /api/webhooks/generico.',
      'Confira Pedidos e o log de webhooks.'
    ]
  },
  {
    id: 'ordens-servico',
    modulo: 'Ordens de servico',
    sessao: 'Gestao de OS',
    pagina: 'ordens-servico',
    titulo: 'Abrir e acompanhar ordens de servico',
    keywords: 'ordem servico os equipamento servicos equipamentos solicitacao status prevista entrega notebook celular',
    conteudo: `Ordens de servico controla status (Aberta, Em andamento, Pronta para entrega, Entregue, Cancelada), cliente, servicos/equipamentos, solicitacao, valor previsto e datas. No campo Servicos/Equipamentos voce cadastra aparelho (notebook, celular) ou servico (formatacao, instalacao). Cards mostram OS abertas, prontas e valor previsto. Para cobrar, va em Realizar vendas, lupa, Ordem de servico. OS de teste: Notebook Dell Inspiron (troca de tela) e Celular Samsung Galaxy (troca de bateria).`,
    passos: [
      'Abra Ordens de servico.',
      'Clique em Novo Servico.',
      'Escolha cliente, servicos/equipamentos, problema e valor previsto.',
      'Atualize o status conforme o conserto.',
      'Quando estiver pronta, cobre no PDV pela lupa de OS.'
    ]
  },
  {
    id: 'usuarios',
    modulo: 'Usuarios',
    sessao: 'Acessos e perfis',
    pagina: 'usuarios',
    titulo: 'Usuarios e niveis de acesso',
    keywords: 'usuario senha cargo perfil permissao administrador gerente vendedor caixa',
    conteudo: `Usuarios cadastra nome, e-mail, celular, nascimento, CPF, tipo PF/PJ, senha e nivel de acesso. Niveis padrao: Administrador (tudo), Gerente (sem usuarios e configuracoes), Vendedor (vendas, clientes, produtos, OS e historico) e Caixa (PDV, caixa, clientes e historico). O menu lateral esconde telas sem permissao. Perfil de acesso define quais paginas cada cargo ve.`,
    passos: [
      'Abra Usuarios (somente quem tem permissao).',
      'Clique em Novo Usuario.',
      'Escolha o nivel de acesso.',
      'Defina senha e salve.',
      'Use Perfil de acesso para marcar as telas do cargo.'
    ]
  },
  {
    id: 'fornecedores',
    modulo: 'Fornecedores',
    sessao: 'Cadastro',
    pagina: 'fornecedores',
    titulo: 'Cadastrar fornecedores',
    keywords: 'fornecedor cnpj telefone email produto conta pagar',
    conteudo: `Fornecedores guarda nome, CNPJ, telefone, e-mail e endereco. Podem ser vinculados a produtos e a contas a pagar no Financeiro.`,
    passos: [
      'Abra Fornecedores.',
      'Clique em Novo Fornecedor e preencha os dados.',
      'Vincule o fornecedor ao produto, se desejar.',
      'Use o fornecedor nas contas a pagar.'
    ]
  },
  {
    id: 'historico-vendas',
    modulo: 'Historico de vendas',
    sessao: 'Consulta e cancelamento',
    pagina: 'historico-vendas',
    titulo: 'Consultar, imprimir e cancelar vendas',
    keywords: 'historico venda cupom cancelar estoque consulta pedido nfce danfe xml emitir',
    conteudo: `O Historico de vendas lista vendas com cliente, total, pagamento, status e NFC-e. E possivel abrir o detalhe, imprimir o cupom ou DANFE, baixar o XML, emitir NFC-e de venda antiga e cancelar. No cancelamento o estoque volta, OS cobrada retorna para Pronta para entrega e a NFC-e autorizada e cancelada na SEFAZ (ou em simulacao).`,
    passos: [
      'Abra Historico de vendas.',
      'Pesquise por cliente, numero ou forma de pagamento.',
      'Imprima o DANFE ou baixe o XML se houver NFC-e.',
      'Cancele somente se a venda deve ser desfeita.'
    ]
  },
  {
    id: 'relatorio',
    modulo: 'Relatorio geral',
    sessao: 'Indicadores e graficos',
    pagina: 'relatorio',
    titulo: 'Relatorio de faturamento e rankings',
    keywords: 'relatorio faturamento lucro ticket estoque grafico periodo ranking produto cliente',
    conteudo: `O Relatorio geral mostra receita, lucro, ticket medio, itens vendidos, crediario, estoque, suprimentos, sangrias, OS e alertas. Filtros: Hoje, 7 dias, 30 dias, Mes, Ano ou intervalo de/ate. Ha graficos por dia, formas de pagamento, produtos mais vendidos e top clientes.`,
    passos: [
      'Abra Relatorio geral.',
      'Escolha o periodo ou as datas.',
      'Clique em Atualizar.',
      'Leia os cards e os graficos.'
    ]
  },
  {
    id: 'contador-nfe',
    modulo: 'Contador',
    sessao: 'Listar NFe emitidas',
    pagina: 'contador-nfe',
    titulo: 'Listar NFC-e emitidas no periodo',
    keywords: 'contador nfe nfce nota fiscal listar emitidas chave protocolo xml danfe',
    conteudo: `O menu Contador (submenu recolhivel) reune as funcoes fiscais. Listar NFe emitidas mostra numero, serie, cliente, chave, status, valor e data. Filtros: Hoje, 7 dias, 30 dias, Mes, Ano ou de/ate, alem de status e busca. Acoes: ver a venda, imprimir DANFE e baixar o XML. Tambem gera ZIP com todos os XMLs do periodo. Acesso: Administrador e Gerente.`,
    passos: [
      'Abra Contador no menu e clique em Listar NFe emitidas.',
      'Escolha o periodo ou as datas.',
      'Filtre por status se quiser so autorizadas.',
      'Use o olho, a impressora ou o XML na linha.',
      'Clique em Baixar XMLs (ZIP) para o pacote do periodo.'
    ]
  },
  {
    id: 'contador-compras',
    modulo: 'Contador',
    sessao: 'Relatorio de Compras',
    pagina: 'contador-compras',
    titulo: 'Relatorio de compras e despesas',
    keywords: 'contador compras despesa fornecedor relatorio csv pagar',
    conteudo: `Relatorio de Compras lista as despesas do Financeiro no periodo, com totais pago e pendente, ranking por fornecedor e por categoria. Exporta CSV (UTF-8 com BOM) para o contador. Os lancamentos vem de Contas a pagar.`,
    passos: [
      'Abra Contador > Relatorio de Compras.',
      'Escolha o periodo.',
      'Confira os cards e os rankings.',
      'Clique em Exportar CSV se precisar enviar ao contador.'
    ]
  },
  {
    id: 'contador-xml',
    modulo: 'Contador',
    sessao: 'Download XML NFes',
    pagina: 'contador-xml',
    titulo: 'Baixar XML das NFC-e em ZIP',
    keywords: 'contador xml nfe zip download arquivo sefaz',
    conteudo: `Download XML NFes gera um ZIP com os arquivos XML das NFC-e do periodo (nome NFCe-chave.xml). So entram notas que ja possuem XML gravado. O download individual continua no historico de vendas.`,
    passos: [
      'Abra Contador > Download XML NFes.',
      'Escolha o periodo.',
      'Clique em Baixar ZIP.',
      'Envie o arquivo ao contador.'
    ]
  },
  {
    id: 'contador-extrato',
    modulo: 'Contador',
    sessao: 'Download extrato',
    pagina: 'contador-extrato',
    titulo: 'Baixar extrato contabil',
    keywords: 'contador extrato txt csv caixa vendas financeiro saldo',
    conteudo: `Download extrato consolida vendas, movimentos de caixa e lancamentos financeiros do periodo. Baixa TXT (conferencia impressa) ou CSV (planilha). Os cards mostram vendas, receitas, despesas e saldo.`,
    passos: [
      'Abra Contador > Download extrato.',
      'Escolha o periodo.',
      'Confira o saldo.',
      'Baixe TXT ou CSV.'
    ]
  },
  {
    id: 'contador-sped',
    modulo: 'Contador',
    sessao: 'SPED Fiscal',
    pagina: 'contador-sped',
    titulo: 'Gerar arquivo SPED Fiscal',
    keywords: 'contador sped fiscal efd icms ipi pva sefaz bloco c100 c170',
    conteudo: `SPED Fiscal gera o arquivo EFD ICMS/IPI (layout simplificado, blocos 0, C, H e 9) com as NFC-e do mes de apuracao. Inclui 0000/0005 da empresa, C100 por nota e C170 pelos itens. Preencha razao social, CNPJ, IE e endereco em Configuracoes / NFC-e antes de enviar ao PVA. O arquivo e texto no padrao |registro|campos|.`,
    passos: [
      'Preencha CNPJ, IE e endereco em Configuracoes.',
      'Abra Contador > SPED Fiscal.',
      'Escolha o mes de apuracao.',
      'Clique em Baixar SPED.',
      'Entregue o .txt ao contador para importar no PVA.'
    ]
  },
  {
    id: 'backup',
    modulo: 'Gerenciar Backup',
    sessao: 'Copias de seguranca',
    pagina: 'backup',
    titulo: 'Fazer, baixar e restaurar backup',
    keywords: 'backup restaurar copiar banco zip sqlite atualizacao versao gerenciar backup',
    conteudo: `Gerenciar Backup lista as copias do banco (ID, nome, data, tamanho). Realizar backup gera ZIP completo (erp.db + manifesto) ou so o SQLite, gravado em backups/. Baixar, restaurar (senha do admin, substitui o banco) e excluir. Restaurar arquivo aceita .zip ou .db. Verificar atualizacao consulta a ultima release no GitHub. So o Administrador ve esta tela.`,
    passos: [
      'Abra Gerenciar Backup no menu (somente admin).',
      'Clique em Realizar backup e escolha Completo ou Somente banco.',
      'Use baixar, restaurar (com senha) ou excluir na linha.',
      'Restaurar arquivo envia um .zip ou .db do computador.',
      'Verificar atualizacao consulta se ha versao nova.'
    ]
  },
  {
    id: 'impressoras',
    modulo: 'Impressoras',
    sessao: 'Cadastro para notas',
    pagina: 'impressoras',
    titulo: 'Cadastrar impressora do cupom e NFC-e',
    keywords: 'impressora wifi bluetooth usb termica jato tinta 58mm 80mm a4 cupom danfe papel conexao',
    conteudo: `Impressoras adicionadas cadastra o equipamento usado na emissao de cupom e NFC-e. Tipo de conexao: Wi-Fi, Bluetooth, USB ou Rede. Modo: Termica, Jato de tinta ou Laser. Largura do papel: 58mm, 80mm ou A4. A escala ajusta o tamanho do cupom/PDF (50% a 200%). A impressora marcada como Ativa e usada na impressao. So uma fica ativa por vez.`,
    passos: [
      'Abra Impressoras no menu.',
      'Clique em Adicionar.',
      'Escolha a impressora, tipo de conexao, modo e largura do papel.',
      'Ajuste a escala do cupom e a porta.',
      'Deixe Ativa ligada e clique em Salvar.',
      'No PDV ou no Historico, imprima o cupom/DANFE; o papel segue a largura cadastrada.'
    ]
  },
  {
    id: 'configuracoes',
    modulo: 'Configuracoes',
    sessao: 'Cupom e PDV',
    pagina: 'configuracoes',
    titulo: 'Personalizar cupom e taxas',
    keywords: 'configuracao cupom taxa cartao credito debito quantidade pdv nfce certificado csc sefaz zona critica apagar banco dados licenca empresa loja logo cnpj whatsapp vitrine site catalogo',
    conteudo: `Configuracoes comeca com Editar empresa: nome da loja, logo (PNG/JPG ate 2MB), telefone, WhatsApp da loja, e-mail, Instagram, cidade, estado, endereco e CNPJ. Esses dados aparecem no login, na sidebar, no cupom e na vitrine publica /loja. O WhatsApp da loja recebe os pedidos do catalogo digital. Abaixo vem cupom, taxas do PDV e NFC-e. A Zona critica no rodape apaga vendas, clientes, produtos, usuarios e configuracoes; a licenca e os dados da empresa sao preservados. So o administrador, digitando APAGAR e a senha, consegue executar.`,
    passos: [
      'Clique na engrenagem ou em Configuracoes.',
      'Em Editar empresa, preencha nome, logo, telefone, WhatsApp da loja, e-mail, Instagram, endereco e CNPJ e clique em Salvar empresa.',
      'Abra o Site da loja (/loja) para ver o catalogo publico.',
      'Ajuste o texto do cupom e as taxas.',
      'Preencha os dados fiscais da NFC-e.',
      'Envie o certificado A1 e o CSC.',
      'Zona critica: Apagar banco de dados so com confirmacao APAGAR e senha do admin.'
    ]
  },
  {
    id: 'nfce',
    modulo: 'Configuracoes',
    sessao: 'NFC-e',
    pagina: 'configuracoes',
    titulo: 'Emitir NFC-e no PDV',
    keywords: 'nfce nfc-e nota fiscal consumidor certificado a1 pfx csc token sefaz danfe xml homologacao producao serie',
    conteudo: `A NFC-e (Nota Fiscal de Consumidor Eletronica, modelo 65) e emitida no PDV ao finalizar a venda (F7) se estiver habilitada e com emitir automatico. Pre-requisitos: credenciamento na SEFAZ, certificado digital A1 (.pfx) com senha, CSC (token + ID) e serie cadastrada. Em Homologacao a nota nao tem valor fiscal. Sem certificado ou com modo simulacao, o sistema gera chave, XML, QR e protocolo local para treinar. No Historico voce imprime o DANFE, baixa o XML ou emite a nota de uma venda antiga. Cancelar a venda tambem cancela a NFC-e autorizada.`,
    passos: [
      'Credencie a empresa na SEFAZ do estado e obtenha o CSC.',
      'Em Configuracoes, habilite NFC-e e preencha CNPJ, IE, endereco e codigo IBGE.',
      'Envie o certificado A1 (.pfx) e a senha. Informe CSC ID e token.',
      'Comece em Homologacao. Desmarque simulacao para transmitir de verdade.',
      'Abra o caixa, venda no PDV e finalize com F7 marcando Emitir NFC-e.',
      'Imprima o DANFE com chave e QR Code. Consulte no portal da SEFAZ.'
    ]
  },
  {
    id: 'manual',
    modulo: 'Manual',
    sessao: 'Ajuda do sistema',
    pagina: 'manual',
    titulo: 'Manual e assistente de duvidas',
    keywords: 'manual ajuda duvida assistente ia rag chat',
    conteudo: `O Manual resume como usar cada modulo. Alem dele, o assistente de IA no canto da tela responde duvidas: ele identifica o modulo ou a sessao e explica o passo a passo com base no funcionamento do ERP.`,
    passos: [
      'Abra Manual no menu para a visao geral.',
      'Ou clique no botao do assistente no canto da tela.',
      'Pergunte em portugues, por exemplo: como cobrar uma OS?.'
    ]
  },
  {
    id: 'cabecalho',
    modulo: 'Cabecalho',
    sessao: 'Ferramentas',
    pagina: 'dashboard',
    titulo: 'Sino, tema, calculadora e tela cheia',
    keywords: 'sino notificacao tema escuro claro calculadora tela cheia engrenagem licenca computador ativar',
    conteudo: `No cabecalho: sino (notificacoes de estoque, OS pronta e contas atrasadas), icone de computador (Informacoes do computador: status da licenca, BIOS, UUID e disco), engrenagem (configuracoes), interruptor (tema claro/escuro), calculadora e tela cheia. O nome do usuario abre o menu Sair.`,
    passos: [
      'Sino: ver alertas.',
      'Icone de computador: status da licenca e IDs da maquina.',
      'Engrenagem: configuracoes.',
      'Interruptor: tema claro ou escuro.',
      'Calculadora e expandir: ferramentas rapidas.'
    ]
  },
  {
    id: 'licenca',
    modulo: 'Licenca',
    sessao: 'Mensalidade e ativacao',
    pagina: 'dashboard',
    titulo: 'Ativar a licenca da mensalidade',
    keywords: 'licenca mensalidade teste ativar chave computador bios uuid disco bloqueado vencido erpISAC',
    conteudo: `O ERP inicia em teste de 30 dias. O icone de computador no cabecalho abre Informacoes do computador: status (Teste/Ativado/Vencido), tempo restante, BIOS Serial, UUID e Disco Serial. A chave de ativacao tem o formato ERPISAC-AAAAMMDD-XXXX-XXXXXXXX e vale so para esta maquina. Use Validar neste PC para conferir se a chave pertence a esta maquina antes de ativar; a mensagem informa Chave invalida, Chave de outra maquina ou Chave vencida. Se o teste ou a mensalidade vencer, o sistema bloqueia as telas e as APIs (HTTP 402) ate ativar. Login e o modal de licenca continuam liberados. O fornecedor gera a chave no proprio modal com a senha mestre (use o icone de olho para mostrar ou ocultar a senha). A Zona critica preserva a licenca.`,
    passos: [
      'Clique no icone de computador no cabecalho.',
      'Confira status, tempo restante e os tres IDs da maquina.',
      'Cole a chave de ativacao (formato ERPISAC-...) e clique em Validar neste PC.',
      'Se a chave for valida para esta maquina, clique em Ativar.',
      'Se o sistema estiver bloqueado, use Informacoes do computador na tela de bloqueio.'
    ]
  },
  {
    id: 'permissoes',
    modulo: 'Usuarios',
    sessao: 'Permissoes por cargo',
    pagina: 'usuarios',
    titulo: 'O que cada nivel pode ver',
    keywords: 'permissao menu escondido cargo nivel acesso sem permissao',
    conteudo: `O menu mostra so as paginas do cargo. Administrador ve tudo, inclusive Contador, Gerenciar Backup e Impressoras. Gerente nao acessa Usuarios, Backup nem Configuracoes (acessa Contador, Impressoras, Pedidos de compras, R.H. e Loja online). Vendedor nao acessa Caixa, Financeiro, Usuarios, Fornecedores, Relatorio, Contador, Backup, Impressoras, Compras, R.H., Loja online nem Configuracoes. Caixa acessa Dashboard, Vendas, Caixa, Clientes, Historico e Manual. Admin, Gerente e Vendedor acessam Categorias e Estoque. Sem permissao a tela avisa Sem permissao para esta pagina.`,
    passos: [
      'Faca login com o usuario do cargo desejado.',
      'Confira o menu lateral filtrado.',
      'Admin altera as telas em Perfil de acesso.'
    ]
  }
];
