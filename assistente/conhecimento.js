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
    keywords: 'venda pdv caixa livre carrinho item produto finalizar f7 f8 f3 aba cliente visitante nfce nota fiscal',
    conteudo: `A tela Realizar vendas e o PDV. O caixa precisa estar aberto; se estiver fechado, o sistema pede para ir em Gerenciar caixa. A venda comeca vazia (Caixa livre). Busque o item, monte o carrinho, escolha o cliente (padrao Visitante) e finalize com F7. Formas de pagamento: Dinheiro, Cartao Debito, Cartao Credito e PIX. E possivel desconto, valor recebido, troco e parcelas. Se a NFC-e estiver habilitada, o F7 pode emitir a nota automaticamente. Ctrl+T abre nova aba, Ctrl+W fecha a aba, setas alternam abas.`,
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
    keywords: 'produto estoque preco codigo barras sku categoria promocao foto minimo importar exportar csv excel xlsx xml json sql',
    conteudo: `Produtos controla nome, codigo de barras, descricao, preco de venda, preco de custo, estoque, estoque minimo, categoria, fornecedor, foto e promocao. Estoque baixo gera alerta no sino. Ajuste de estoque registra movimento. No PDV o estoque e baixado na venda e devolvido se a venda for cancelada. Importar e Exportar na toolbar (e em Opcoes) aceitam Excel, CSV, TXT, JSON, XML, SQL, HTML e Markdown. Na importacao, produto com o mesmo codigo de barras ou o mesmo nome e atualizado; os demais sao cadastrados. Campos obrigatorios: nome, codigo, preco e estoque. Use Exportar > Baixar modelo para o layout.`,
    passos: [
      'Abra Produtos e clique em Adicionar ou use Importar.',
      'Informe nome, preco, estoque e categoria.',
      'Se quiser, cadastre codigo de barras para a lupa do PDV.',
      'Use Importar/Exportar para planilha, CSV, JSON, XML ou SQL.',
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
    keywords: 'configuracao cupom taxa cartao credito debito quantidade pdv nfce certificado csc sefaz zona critica apagar banco dados licenca empresa loja logo cnpj',
    conteudo: `Configuracoes comeca com Editar empresa: nome da loja, logo (PNG/JPG ate 2MB), telefone, e-mail, Instagram, cidade, estado, endereco e CNPJ. Esses dados aparecem no login, na sidebar e no cupom. Abaixo vem cupom, taxas do PDV e NFC-e. A Zona critica no rodape apaga vendas, clientes, produtos, usuarios e configuracoes; a licenca e os dados da empresa sao preservados. So o administrador, digitando APAGAR e a senha, consegue executar.`,
    passos: [
      'Clique na engrenagem ou em Configuracoes.',
      'Em Editar empresa, preencha nome, logo, telefone, e-mail, Instagram, endereco e CNPJ e clique em Salvar empresa.',
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
    conteudo: `O ERP inicia em teste de 30 dias. O icone de computador no cabecalho abre Informacoes do computador: status (Teste/Ativado/Vencido), tempo restante, BIOS Serial, UUID e Disco Serial. A chave de ativacao tem o formato ERPISAC-AAAAMMDD-XXXX-XXXXXXXX e vale so para esta maquina. Se o teste ou a mensalidade vencer, o sistema bloqueia as telas e as APIs (HTTP 402) ate ativar. Login e o modal de licenca continuam liberados. O fornecedor gera a chave no proprio modal com a senha mestre. A Zona critica preserva a licenca.`,
    passos: [
      'Clique no icone de computador no cabecalho.',
      'Confira status, tempo restante e os tres IDs da maquina.',
      'Cole a chave de ativacao e clique em Ativar.',
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
    conteudo: `O menu mostra so as paginas do cargo. Administrador ve tudo, inclusive Contador, Gerenciar Backup e Impressoras. Gerente nao acessa Usuarios, Backup nem Configuracoes (acessa Contador e Impressoras). Vendedor nao acessa Caixa, Financeiro, Usuarios, Fornecedores, Relatorio, Contador, Backup, Impressoras nem Configuracoes. Caixa acessa Dashboard, Vendas, Caixa, Clientes, Historico e Manual. Sem permissao a tela avisa Sem permissao para esta pagina.`,
    passos: [
      'Faca login com o usuario do cargo desejado.',
      'Confira o menu lateral filtrado.',
      'Admin altera as telas em Perfil de acesso.'
    ]
  }
];
