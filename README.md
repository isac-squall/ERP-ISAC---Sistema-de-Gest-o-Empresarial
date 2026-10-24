# ERP ISAC - Sistema de Gestao Empresarial

Sistema ERP completo para loja e assistencia tecnica: PDV, caixa, estoque, financeiro, CRM, contratos, NF-e/NFS-e, producao, ordens de servico e NFC-e.

## Modulos

- **Dashboard** — Vendas do dia e do mes, clientes, produtos, estoque baixo, OS abertas/prontas, contas e grafico de receita
- **Realizar vendas** — PDV com carrinho, abas, lupa (Produto / Categoria / Ordem de servico), F7, NFC-e e cupom
- **Gerenciar caixa** — Abertura, entrada (suprimento), saida (sangria), fechamento e historico
- **Financeiro** — Contas a pagar e receber, vencidos, saldo previsto, previsao 7/15/30 dias, contas bancarias, extrato CSV, conciliacao e fluxo de caixa 30 dias
- **CRM** — Funil kanban (Lead, Qualificacao, Proposta, Negociacao, Ganho, Perdido) com pipeline ponderado
- **Contratos** — Recorrencia (mensal a anual), MRR e faturamento que lanca Receita no Financeiro
- **NF-e / NFS-e** — Emissao simulada local (sem SEFAZ/prefeitura); XML e cancelamento; NF-e da venda e NFS-e da OS
- **Producao** — Ordem de producao com BOM (composicao do kit), baixa de insumos, entrada do acabado e curva ABC
- **Clientes** — Cadastro com busca e paginacao; vinculo no PDV (Visitante); botao WhatsApp no telefone
- **Loja digital** — Vitrine publica em `/loja` com produtos, categorias, carrinho e pedido pelo WhatsApp da loja
- **Produtos** — Tipos Produto/Servico/Kit/Pesavel, estoque, precos, codigo de barras, promocao, foto, NCM/CFOP, importacao/exportacao e dose (baixa da garrafa)
- **Categorias** — Cadastro de categorias de estoque (CRUD); vinculo no produto e filtro na lista
- **Estoque** — Busca de itens (nome, codigo, marca, local), filtros por categoria/situacao/tipo, saldo, minimo, valor a custo e movimento (entrada, ajuste, inventario)
- **Pedidos de compras** — Lista estilo SimpleDot (Todos / Aguardando / Aprovados / Recusados / Recebidos); novo pedido com itens; aprovar, recusar e receber (entra estoque e conta a pagar)
- **R.H.** — Submenu: Funcionarios, Folhas de Ponto e Grades Horarias (cadastro no estilo SimpleDot)
- **Gerência** — Submenu: Aprovacao Vendas, Compras, Fechamento Caixas, Inventario e Consulta Estoque
- **Loja online / API** — Webhooks WooCommerce, Shopify, Nuvemshop, VTEX e Mercado Livre: pedido pago vira venda, cadastra cliente e baixa estoque
- **Ordens de servico** — Status, cliente, Servicos/Equipamentos, valor previsto; cobranca no PDV
- **Usuarios** — Acessos e niveis (Administrador, Gerente, Vendedor, Caixa)
- **Fornecedores** — Cadastro vinculado a produtos e contas a pagar
- **Historico de vendas** — Consulta, cupom/DANFE, XML da NFC-e e cancelamento
- **Relatorio geral** — Receita, lucro, ticket medio, rankings e graficos por periodo
- **Contador** — Submenu: Listar NFe emitidas, Relatorio de Compras, Download XML NFes, Download extrato e SPED Fiscal
- **Gerenciar Backup** — Criar, listar, baixar, restaurar e excluir copias do banco; verificar atualizacao
- **Impressoras** — Cadastro com conexao (Wi-Fi, Bluetooth, USB), modo (termica/jato de tinta) e largura (58mm, 80mm, A4)
- **Configuracoes** — Cadastro da empresa (logo, nome, contatos, CNPJ), cupom, taxas, NFC-e e Zona critica
- **Licenca** — Teste de 30 dias, IDs da maquina (BIOS / UUID / disco) e chave de mensalidade
- **Manual** — Ajuda por modulo e assistente de duvidas no canto da tela

## Novidades

- Importar e exportar produtos (Excel, CSV, TXT, JSON, XML, SQL, HTML e Markdown)
- NFC-e no PDV (certificado A1, CSC, homologacao/producao, DANFE e XML)
- Lupa do PDV: Produto, Categoria ou Ordem de servico; OS Entregue ao finalizar a venda
- Assistente RAG por modulo/sessao (chat flutuante)
- Relatorio geral e permissoes por cargo
- Instalador Windows offline `dist/ERP-ISAC-Setup.exe`
- Zona critica em Configuracoes: apaga vendas, clientes, produtos, usuarios, configuracoes e imagens; a licenca atual e preservada
- Cadastro da empresa: logo, nome da loja, telefone, WhatsApp, e-mail, Instagram, cidade, estado, endereco e CNPJ (login, sidebar, cupom e vitrine)
- Loja digital em `/loja`: catalogo publico (preco, foto, promocao, filtro por categoria), carrinho e envio do pedido no WhatsApp da loja. No cadastro do cliente, o telefone abre o WhatsApp.
- Gerenciar Backup: realizar backup completo (ZIP) ou so do banco, baixar, restaurar (com senha do admin) e excluir; verificar atualizacao do app
- Impressoras: conexao Wi-Fi/Bluetooth/USB, modo termica ou jato de tinta, papel 58mm/80mm/A4, escala do cupom e NFC-e
- Contador: listar NFC-e, relatorio de compras, ZIP de XMLs, extrato TXT/CSV e SPED Fiscal (EFD ICMS/IPI simplificado)
- Licenca/mensalidade: icone de computador no cabecalho; periodo de teste de 30 dias; se vencer, o sistema bloqueia ate ativar a chave da maquina
- PDV + Financeiro: baixa automatica da venda, taxas liquidas de cartao/PIX, Fiado com alerta de inadimplencia, sangria/suprimento no Financeiro e margem no PDV
- DRE no Financeiro: resultado do exercicio por competencia (Receita Bruta, CMV, despesas, LAJIR e Lucro Liquido) com export TXT/CSV; fiado a receber no dia da venda (valor a cobrar)
- Bebidas por dose: cadastre a dose vinculada a garrafa e o consumo (ex.: 0,05 = 20 doses). A venda baixa o estoque da garrafa; o cancelamento devolve
- Cadastro de itens: tipo Produto, Servico (sem estoque), Kit (baixa a composicao) e Pesavel (quantidade decimal, unidade KG)
- Categorias de estoque: tela propria (nome, descricao, produtos vinculados); no cadastro do produto a categoria e um select; a lista de produtos filtra por categoria. Nomes ja usados sao migrados. Ao renomear, os produtos acompanham; so exclui se nenhum produto ativo usar.
- Aba Estoque: pesquisa de itens no estilo SimpleDot (stock_items/search), com cards de quantidade, valor a custo, estoque baixo e zerado; filtros de categoria, situacao e tipo; acoes de compra, ajuste e inventario.
- Pedidos de compras: tela Pedidos de compras (SimpleDot purchase_orders) com abas Todos/Aguardando/Aprovados/Recusados/Recebidos; colunas #, Status, Fornecedor, Data, Valor, Pagamento e Acoes; ao receber, entra estoque (custo atualizado) e lanca Despesa Estoque no Financeiro (fora do DRE / CMV). Teste: `npm run test:compras`.
- R.H.: Funcionarios (cargo, salario, grade, admissao), Folhas de ponto (batidas e saldo previsto/trabalhado/extra/banco) e Grades horarias no estilo SimpleDot (Nome, Status, Tipo Comercial/Flexivel, horas dia/semana/mes, limite, intervalo, banco de horas, exigir localizacao/perto). Grade em uso por funcionario ativo nao exclui. Acesso: Administrador e Gerente. Teste: `npm run test:rh`.
- Loja online / API: webhooks em `/api/webhooks/{woocommerce|shopify|nuvemshop|vtex|mercadolivre|generico}`. Pedido pago faz upsert do cliente, cria venda (`origem=ecommerce`) e baixa estoque pelo SKU (codigo de barras). Cancelamento devolve estoque. Idempotencia por plataforma + id externo. Tokens Bearer `erp_live_...`. Mercado Livre: cole o Access Token; a notificacao nao traz itens — o ERP busca o pedido em `GET /orders/{id}`. Acesso: Administrador e Gerente. Teste: `npm run test:ecommerce`.
- Gerencia: submenu Aprovacao Vendas (orcamentos do PDV: aprovar, recusar, converter em venda), Compras (aprovar/receber pedidos), Fechamento Caixas (conferir o caixa fechado), Inventario (contagem substitui saldo) e Consulta Estoque (somente leitura). Acesso: Administrador e Gerente. Teste: `npm run test:gerencia`.
- CRM: kanban de oportunidades (Lead a Perdido), valor e probabilidade por etapa, WhatsApp do cliente. Acesso: Administrador, Gerente e Vendedor. Teste: `npm run test:crm`.
- Contratos: cadastro recorrente; Faturar gera Receita Pendente no Financeiro e avanca a proxima data. Contrato Ativo nao exclui (encerra antes). Teste: `npm run test:contratos`.
- Bancos: contas (Corrente/Poupanca/Caixa/Digital), importacao de extrato CSV, conciliacao por valor+data e fluxo de caixa 30 dias. Abas no Financeiro. Teste: `npm run test:bancos`.
- NF-e e NFS-e: rascunho, autorizacao simulada (chave/protocolo/XML locais) e cancelamento. Sem transmissao a SEFAZ ou prefeitura nesta entrega. Teste: `npm run test:fiscal`.
- Producao: OP usa a composicao (BOM) do produto/kit; concluir baixa insumos e entra o acabado. Curva ABC pelo faturamento do mes (A ate 80%, B ate 95%, C o restante). Teste: `npm run test:producao`.

## Produtos: importar e exportar

Na tela **Produtos**, use **Importar** / **Exportar** (toolbar ou Opcoes).

Formatos: Excel (`.xlsx` / `.xls`), CSV, TSV, TXT, JSON, XML, SQL, HTML e Markdown.

- **Exportar** baixa todos os produtos ativos; **Baixar modelo** gera o layout com uma linha de exemplo
- **Importar** cadastra produtos novos e atualiza os existentes pelo codigo de barras ou pelo nome
- Campos obrigatorios: nome, codigo de barras, preco e estoque
- Colunas reconhecidas: nome, codigo, descricao, preco, preco_custo, estoque, estoque_minimo, categoria, ncm, cfop, unidade, origem, estoque_origem_codigo, estoque_consumo, tipo, controla_estoque, fracionado, marca, referencia, localizacao
- Dose: em **Produzido a partir de** escolha a garrafa e informe o consumo por unidade (1 dividido pelo numero de doses). Ex.: 20 doses por garrafa = `0,05`. O PDV mostra as doses restantes e baixa a garrafa na venda
- Tipos: **Produto** (estoque proprio ou dose), **Servico** (nao baixa estoque), **Kit** (composicao; a venda baixa cada item) e **Pesavel** (quantidade decimal no PDV)

## PDV (Realizar vendas)

O caixa precisa estar aberto. A venda comeca vazia (Caixa livre).

- Lupa **BUSCAR EM**: Produto (nome, codigo, SKU, ID), Categoria ou Ordem de servico
- OS Entregue ou Cancelada nao entra no carrinho; a mesma OS nao pode ser adicionada duas vezes
- Ao finalizar (F7), a OS vai para **Entregue**; se a venda for cancelada, volta para **Pronta para entrega**
- Pagamentos: Dinheiro, Cartao Debito, Cartao Credito, PIX e Fiado
- Venda a vista (Dinheiro/PIX/cartao) lanca Receita Pago no Financeiro; Fiado gera Contas a receber (parcela a cada 30 dias)
- Taxas de credito, debito e PIX descontam o liquido no Financeiro (despesa Taxa operadora)
- Cliente com titulos vencidos recebe alerta no PDV; Fiado exige confirmacao
- Painel do PDV mostra margem estimada (preco menos custo)
- Sangria e suprimento do Caixa alimentam Despesa/Receita no Financeiro em tempo real
- Atalhos: F7 finalizar, F8 produto/servico, F6 historico, F3 cancelar aba, Ctrl+T / Ctrl+W abas
- Se a NFC-e estiver habilitada, o F7 pode emitir a nota automaticamente
- Dose: o PDV mostra as doses restantes da garrafa; ao vender, baixa o consumo no estoque da garrafa (cancelamento devolve)
- Servico cadastrado entra no PDV sem checar estoque; Kit baixa a composicao; Pesavel pede quantidade decimal (kg)

## DRE (Demonstracao do Resultado)

No **Financeiro**, a aba **DRE** monta o resultado do periodo no regime de **competencia** (faturamento pela data da venda e despesas pela data de vencimento, nao pelo pagamento).

- Receita Bruta = vendas de produtos + servicos (OS) + outras receitas
- Deducoes = descontos concedidos, impostos sobre vendas e estornos/devolucoes
- CMV = custo dos itens efetivamente vendidos (compra de estoque fica fora do DRE, no ativo)
- Despesas operacionais = administrativas + comerciais (inclui taxas de operadora)
- Resultado Operacional (LAJIR), Resultado Financeiro e Lucro/Prejuizo Liquido, com margens bruta e liquida
- A classificacao usa a categoria do lancamento; o detalhamento por categoria e a secao **Fora do DRE** ficam visiveis
- Exporta TXT e CSV; endpoint `GET /api/dre` (parametros `de`, `ate` ou `periodo`)
- Fiado entra na Receita Bruta no dia da venda e aparece como **Fiado a receber (a cobrar)** em negativo, com o cliente, para controle de cobranca (o titulo vence em 30 dias)
- Horario do sistema: America/Sao_Paulo (o filtro Hoje segue o dia no Brasil)
- Teste: `npm run test:dre` (roda em transacao com rollback, nao altera o banco)
- **Contas bancarias**: cadastre banco, agencia e saldo inicial; importe CSV (data, descricao, valor)
- **Conciliacao**: o ERP sugere pares extrato x lancamento (mesmo valor, data ate 5 dias); conciliar marca o titulo como Pago e atualiza o saldo
- **Fluxo de caixa**: projecao de 30 dias com titulos Pendentes sobre o saldo das contas ativas

## CRM

Menu **CRM** (Administrador, Gerente e Vendedor).

- Colunas: Lead, Qualificacao, Proposta, Negociacao, Ganho, Perdido
- Cards mostram cliente, valor e probabilidade; Avancar, Ganhar e Perder
- Pipeline = soma das abertas; Ponderado = valor x probabilidade

## Contratos

Menu **Contratos**. Periodicidade Mensal, Trimestral, Semestral ou Anual.

- **Faturar** lanca Receita categoria Contrato no Financeiro (status Pendente)
- A proxima data avanca pela periodicidade; se passar do fim, o contrato encerra
- Contrato Ativo nao exclui: encerre antes

## NF-e e NFS-e

Menus **NF-e** (modelo 55) e **NFS-e**. Emissao **simulada local** (sem SEFAZ/prefeitura).

1. Crie o rascunho (cliente, destinatario, item e valor)
2. **Emitir** gera chave, protocolo e XML
3. Baixe o XML; **Cancelar** so em nota autorizada
4. APIs: `POST /api/nfe/da-venda/:id` e `POST /api/nfse/da-os/:id`

Para o varejo com SEFAZ, use a NFC-e no PDV (certificado A1).

## Producao

Menu **Producao**. A OP usa a composicao do produto (kit/BOM).

- Status: Aberta, Em producao, Concluida, Cancelada
- **Concluir** exige estoque dos insumos; baixa o consumo e entra o acabado
- Aba **Curva ABC**: ranking do mes (A ate 80% do faturamento, B ate 95%, C o restante)

## NFC-e

Nota Fiscal de Consumidor Eletronica (modelo 65), emitida no PDV.

Pre-requisitos: credenciamento na SEFAZ, certificado A1 (`.pfx` + senha), CSC (ID + token) e serie.

1. Em **Configuracoes**, habilite NFC-e e preencha CNPJ, IE, endereco e codigo IBGE
2. Envie o certificado A1 e o CSC
3. Comece em **Homologacao**. O modo simulacao gera chave/XML/protocolo local sem transmitir
4. Venda no PDV e finalize com F7 marcando emitir NFC-e
5. No historico: DANFE, XML e cancelamento (cancela a NFC-e autorizada)

Por padrao `nfce_simulacao=1` (treino sem SEFAZ).

## Contador

Menu **Contador** (submenu recolhivel; Administrador e Gerente).

- **Listar NFe emitidas** — NFC-e do periodo (numero, chave, status, valor); DANFE, XML e ZIP
- **Relatorio de Compras** — despesas do Financeiro, totais e CSV
- **Download XML NFes** — ZIP com os XML das notas do periodo
- **Download extrato** — TXT ou CSV com vendas, caixa e financeiro
- **SPED Fiscal** — arquivo EFD ICMS/IPI (blocos 0, C, H e 9) do mes de apuracao

Preencha CNPJ, IE e endereco em Configuracoes antes de gerar o SPED.

## Licenca e mensalidade

O icone de computador no cabecalho abre **Informacoes do computador**.

- Periodo de **teste de 30 dias** a partir da primeira execucao
- Status: Teste, Ativado, Vencido ou Bloqueado; tempo restante; maquina autorizada ou nao
- Identificadores: BIOS Serial, UUID e Disco Serial (Windows via WMIC/CIM; Linux via DMI/sysfs)
- Formato da chave: `ERPISAC-AAAAMMDD-XXXX-XXXXXXXX` (data de validade + trecho do hardware + assinatura)
- **Validar neste PC**: confere a chave contra o hardware atual (chave invalida, de outra maquina ou vencida) antes de ativar
- Sem chave valida apos o teste, as APIs retornam 402 e a tela de bloqueio pede ativacao
- Gerar chave (fornecedor): a senha mestre precisa ser definida em `ERP_LICENCA_MASTER` no ambiente; sem essa variavel a geracao fica desabilitada
- A assinatura das chaves usa `ERP_LICENCA_SECRETO` quando definido; mantenha o mesmo segredo no emissor e no cliente
- Login, dados da empresa e rotas `/api/licenca` (GET, ativar e validar) continuam liberados com o sistema bloqueado
- Zona critica preserva as chaves `licenca_*`

## Gerenciar Backup

Menu **Gerenciar Backup** (somente Administrador).

- **Realizar backup** gera um ZIP completo (`erp.db` + manifesto) ou so o arquivo SQLite
- Os arquivos ficam na pasta `backups/` e na tabela da tela (ID, Nome, Data, Tamanho, Acoes)
- Acoes: baixar, restaurar (pede senha do admin e substitui o banco) e excluir
- **Restaurar arquivo** aceita `.zip` ou `.db` enviado do computador
- **Verificar atualizacao** consulta a ultima release no GitHub

Nao versionar a pasta `backups/`.

## Impressoras

Menu **Impressoras** (Administrador e Gerente).

- **Adicionar** cadastra nome, tipo de conexao (Wi-Fi, Bluetooth, USB, Rede), modo (Termica, Jato de tinta, Laser) e largura (58mm, 80mm, A4)
- Escala do cupom/PDF de 50% a 200%; porta COM/USB/LPT/TCP
- So uma impressora fica **Ativa**; cupom, DANFE NFC-e e etiquetas usam essa largura e escala
- Marque **Imprimir codigo de barras no cupom** se a termica deve imprimir barras

## Ordens de servico

Campo **Servicos/Equipamentos**: aparelho (notebook, celular) ou servico (formatacao, instalacao).

Status: Aberta, Em andamento, Pronta para entrega, Entregue, Cancelada.

Para cobrar: **Realizar vendas** > lupa > Ordem de servico.

## Cadastro da empresa

Em **Configuracoes**, o bloco **Editar empresa** cadastra a loja que vai usar o sistema:

- Logo (PNG ou JPG, ate 2 MB)
- Nome da loja, telefone, e-mail, Instagram
- Cidade, estado, endereco e CNPJ

Esses dados aparecem no login, na barra lateral e no cupom. Salvar a empresa tambem atualiza o titulo/cabecalho do cupom.

## Zona critica

Em **Configuracoes**, no rodape, **Apagar banco de dados** limpa vendas, clientes, produtos, usuarios, configuracoes e imagens.

- So o administrador consegue executar
- Confirme digitando `APAGAR` e a senha
- A licenca atual e preservada quando existir
- O administrador logado e recriado para entrar de novo
- Nao da para desfazer

## Niveis de acesso

O menu lateral mostra so as telas do cargo. Perfil de acesso define as paginas.

| Cargo | Acesso |
| --- | --- |
| Administrador | Tudo |
| Gerente | Sem Usuarios, Backup e Configuracoes (acessa Contador, Impressoras, CRM, Contratos, NF-e/NFS-e e Producao) |
| Vendedor | Vendas, clientes, produtos, OS, historico e CRM |
| Caixa | PDV, caixa, clientes e historico |

## Login

| Perfil | Email | Senha |
| --- | --- | --- |
| Administrador | admin@erpisac.com | admin123 |
| Gerente | gerente@erpisac.com | gerente123 |
| Vendedor | vendedor@erpisac.com | venda123 |
| Caixa | caixa@erpisac.com | caixa123 |

## Instalacao no Windows

1. Copie `dist/ERP-ISAC-Setup.exe` para o notebook
2. Clique duas vezes no `.exe` e avance as telas
3. Use o atalho **ERP ISAC** na Area de Trabalho

O sistema abre em **http://localhost:3000**. O instalador ja traz o Node.js e as dependencias; nao precisa de internet.

Instalacao em `%LOCALAPPDATA%\ERP-ISAC`. O banco `erp.db` fica nessa pasta.

Nao execute `windows/Instalar.bat` do repositorio Git: essa pasta so tem os scripts, sem `runtime\node.exe`.

Se uma versao anterior estiver aberta, o instalador encerra `erp-isac.exe` automaticamente.

## Celular e outro computador

Os mesmos dados exigem o mesmo servidor e o mesmo `erp.db`.

- Na mesma rede Wi-Fi: `http://IP-do-notebook:3000`
- Fora da rede: hospede o ERP (nao basta abrir `localhost` no Chrome de outro aparelho)

## Como executar (desenvolvimento)

```bash
npm install
npm start
```

Acesse **http://localhost:3000**. Por padrao o servidor escuta em `0.0.0.0:3000` para permitir acesso de outros computadores da loja. Para restringir a esta maquina, use `HOST=127.0.0.1 npm start`.

Variaveis de ambiente relevantes:

| Variavel | Uso |
| --- | --- |
| `PORT` | Porta HTTP (padrao `3000`) |
| `HOST` | Interface de escuta (padrao `0.0.0.0`) |
| `ERP_LICENCA_MASTER` | Senha mestre para gerar chaves de licenca |
| `ERP_LICENCA_SECRETO` | Segredo HMAC das chaves de licenca |
| `USER_LLM_API_KEY` / `USER_LLM_BASE_URL` / `USER_LLM_MODEL` | Assistente com IA (opcional) |

## Seguranca

- Login por sessao com token aleatorio em cookie `HttpOnly` (`SameSite=Lax`) e expiracao de 7 dias
- Senhas armazenadas com `scrypt` + salt; bancos antigos sao migrados automaticamente no primeiro start
- Autorizacao no servidor por perfil (Administrador, Gerente, Vendedor, Caixa); a interface apenas reflete as permissoes
- CORS desabilitado; chamadas externas ao navegador nao acessam a API
- Limite de tentativas de login e de acoes criticas
- Validacao de valores, tipos, status e datas no Financeiro
- Uploads limitados a 25 MB por requisicao; ZIP de backup com limite de expansao e de tamanho (protecao contra zip bomb)
- Indices criados automaticamente para vendas, financeiro, caixa e estoque
- `PUT /api/config` aceita apenas chaves conhecidas; campos de licenca, backup e versao nao podem ser sobrescritos pela tela

## Recursos extras

- Tema claro/escuro
- Calculadora integrada
- Tela cheia
- Sino de notificacoes (estoque baixo, OS pronta, contas atrasadas)
- Busca e paginacao nas listagens
- Assistente de duvidas por modulo

## Tecnologias

- Node.js + Express
- SQLite (better-sqlite3)
- HTML/CSS/JavaScript (SPA)
- NFC-e: `node-forge` (certificado A1)

## Git

Nao versionar `node_modules/`, `erp.db-shm`, `erp.db-wal`, `backups/` nem `dist/*.zip`. O instalador `dist/ERP-ISAC-Setup.exe` pode ir no repositorio.
