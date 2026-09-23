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
    keywords: 'venda pdv caixa livre carrinho item produto finalizar f7 f8 f3 aba cliente visitante',
    conteudo: `A tela Realizar vendas e o PDV. O caixa precisa estar aberto; se estiver fechado, o sistema pede para ir em Gerenciar caixa. A venda comeca vazia (Caixa livre). Busque o item, monte o carrinho, escolha o cliente (padrao Visitante) e finalize com F7. Formas de pagamento: Dinheiro, Cartao Debito, Cartao Credito e PIX. E possivel desconto, valor recebido, troco e parcelas. Ctrl+T abre nova aba, Ctrl+W fecha a aba, setas alternam abas.`,
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
    keywords: 'caixa abrir fechar entrada saida suprimento sangria movimento historico saldo',
    conteudo: `Em Gerenciar caixa voce abre o caixa com valor inicial antes de vender. Com o caixa aberto aparecem total do caixa, vendas, cartao/PIX e venda liquida. Use Entrada (suprimento) e Saida (sangria). Historico mostra sessoes anteriores. Fechar caixa encerra o dia. Sem caixa aberto o PDV nao vende.`,
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
    keywords: 'financeiro pagar receber conta vencido saldo previsao despesa receita',
    conteudo: `O Financeiro tem abas Contas a pagar e Contas a receber. Os cards mostram a receber, receber vencido, a pagar, pagar vencido e saldo previsto, alem de previsao em 7, 15 e 30 dias. Cadastre descricao, cliente ou fornecedor, categoria, valor, vencimento e status. Marque como pago ou pendente. Lancamentos vencidos entram nas notificacoes.`,
    passos: [
      'Abra Financeiro no menu.',
      'Escolha Contas a pagar ou Contas a receber.',
      'Clique em Nova conta e preencha os dados.',
      'Altere o status quando pagar ou receber.',
      'Acompanhe as previsoes e os valores vencidos.'
    ]
  },
  {
    id: 'clientes',
    modulo: 'Clientes',
    sessao: 'Cadastro',
    pagina: 'clientes',
    titulo: 'Cadastrar e pesquisar clientes',
    keywords: 'cliente cadastro cpf telefone email endereco pesquisar editar excluir',
    conteudo: `Em Clientes voce cadastra nome, CPF/CNPJ, telefone, e-mail e endereco. A lista tem busca e paginacao. O cliente pode ser selecionado no PDV no botao Visitante. Ordens de servico e contas a receber tambem usam o cadastro de clientes.`,
    passos: [
      'Abra Clientes.',
      'Clique em Novo Cliente.',
      'Preencha os dados e salve.',
      'Use a busca para localizar e editar.',
      'No PDV, clique em Visitante para vincular o cliente a venda.'
    ]
  },
  {
    id: 'produtos',
    modulo: 'Produtos',
    sessao: 'Estoque e cadastro',
    pagina: 'produtos',
    titulo: 'Produtos, estoque, codigo e promocao',
    keywords: 'produto estoque preco codigo barras sku categoria promocao foto minimo',
    conteudo: `Produtos controla nome, codigo de barras, descricao, preco de venda, preco de custo, estoque, estoque minimo, categoria, fornecedor, foto e promocao. Estoque baixo gera alerta no sino. Ajuste de estoque registra movimento. No PDV o estoque e baixado na venda e devolvido se a venda for cancelada.`,
    passos: [
      'Abra Produtos e clique em Novo Produto.',
      'Informe nome, preco, estoque e categoria.',
      'Se quiser, cadastre codigo de barras para a lupa do PDV.',
      'Use o menu de acoes para estoque, promocao ou edicao.',
      'Mantenha o estoque minimo para receber alertas.'
    ]
  },
  {
    id: 'ordens-servico',
    modulo: 'Ordens de servico',
    sessao: 'Gestao de OS',
    pagina: 'ordens-servico',
    titulo: 'Abrir e acompanhar ordens de servico',
    keywords: 'ordem servico os equipamento solicitacao status prevista entrega notebook celular',
    conteudo: `Ordens de servico controla status (Aberta, Em andamento, Pronta para entrega, Entregue, Cancelada), cliente, equipamento, solicitacao, valor previsto e datas. Cards mostram OS abertas, prontas e valor previsto. Para cobrar, va em Realizar vendas, lupa, Ordem de servico. OS de teste: Notebook Dell Inspiron (troca de tela) e Celular Samsung Galaxy (troca de bateria).`,
    passos: [
      'Abra Ordens de servico.',
      'Clique em Novo Servico.',
      'Escolha cliente, equipamento, problema e valor previsto.',
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
    keywords: 'historico venda cupom cancelar estoque consulta pedido',
    conteudo: `O Historico de vendas lista vendas com cliente, total, pagamento e data. E possivel abrir o detalhe, imprimir o cupom e cancelar. No cancelamento o estoque dos produtos volta e, se houver OS cobrada, a ordem retorna para Pronta para entrega.`,
    passos: [
      'Abra Historico de vendas.',
      'Pesquise por cliente, numero ou forma de pagamento.',
      'Imprima o cupom se precisar.',
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
    id: 'configuracoes',
    modulo: 'Configuracoes',
    sessao: 'Cupom e PDV',
    pagina: 'configuracoes',
    titulo: 'Personalizar cupom e taxas',
    keywords: 'configuracao cupom taxa cartao credito debito quantidade pdv',
    conteudo: `Configuracoes altera titulo, cabecalho e rodape do cupom, pergunta de quantidade ao adicionar produto no PDV e taxas de cartao de credito e debito. A engrenagem do cabecalho abre esta tela.`,
    passos: [
      'Clique na engrenagem ou em Configuracoes.',
      'Ajuste o texto do cupom.',
      'Defina as taxas de cartao, se houver.',
      'Salve as configuracoes.'
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
    keywords: 'sino notificacao tema escuro claro calculadora tela cheia engrenagem',
    conteudo: `No cabecalho: sino (notificacoes de estoque, OS pronta e contas atrasadas), engrenagem (configuracoes), interruptor (tema claro/escuro), calculadora e tela cheia. O nome do usuario abre o menu Sair.`,
    passos: [
      'Sino: ver alertas.',
      'Engrenagem: configuracoes.',
      'Interruptor: tema claro ou escuro.',
      'Calculadora e expandir: ferramentas rapidas.'
    ]
  },
  {
    id: 'permissoes',
    modulo: 'Usuarios',
    sessao: 'Permissoes por cargo',
    pagina: 'usuarios',
    titulo: 'O que cada nivel pode ver',
    keywords: 'permissao menu escondido cargo nivel acesso sem permissao',
    conteudo: `O menu mostra so as paginas do cargo. Administrador ve tudo. Gerente nao acessa Usuarios nem Configuracoes. Vendedor nao acessa Caixa, Financeiro, Usuarios, Fornecedores, Relatorio nem Configuracoes. Caixa acessa Dashboard, Vendas, Caixa, Clientes, Historico e Manual. Sem permissao a tela avisa Sem permissao para esta pagina.`,
    passos: [
      'Faca login com o usuario do cargo desejado.',
      'Confira o menu lateral filtrado.',
      'Admin altera as telas em Perfil de acesso.'
    ]
  }
];
