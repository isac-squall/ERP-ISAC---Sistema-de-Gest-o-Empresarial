# ERP ISAC - Sistema de Gestao Empresarial

Sistema ERP completo para loja e assistencia tecnica: PDV, caixa, estoque, financeiro, ordens de servico e NFC-e.

## Modulos

- **Dashboard** — Vendas do dia e do mes, clientes, produtos, estoque baixo, OS abertas/prontas, contas e grafico de receita
- **Realizar vendas** — PDV com carrinho, abas, lupa (Produto / Categoria / Ordem de servico), F7, NFC-e e cupom
- **Gerenciar caixa** — Abertura, entrada (suprimento), saida (sangria), fechamento e historico
- **Financeiro** — Contas a pagar e receber, vencidos, saldo previsto e previsao em 7/15/30 dias
- **Clientes** — Cadastro com busca e paginacao; vinculo no PDV (Visitante)
- **Produtos** — Estoque, precos, codigo de barras, promocao, foto, NCM/CFOP e importacao/exportacao
- **Ordens de servico** — Status, cliente, Servicos/Equipamentos, valor previsto; cobranca no PDV
- **Usuarios** — Acessos e niveis (Administrador, Gerente, Vendedor, Caixa)
- **Fornecedores** — Cadastro vinculado a produtos e contas a pagar
- **Historico de vendas** — Consulta, cupom/DANFE, XML da NFC-e e cancelamento
- **Relatorio geral** — Receita, lucro, ticket medio, rankings e graficos por periodo
- **Configuracoes** — Cadastro da empresa (logo, nome, contatos, CNPJ), cupom, taxas, NFC-e e Zona critica
- **Manual** — Ajuda por modulo e assistente de duvidas no canto da tela

## Novidades

- Importar e exportar produtos (Excel, CSV, TXT, JSON, XML, SQL, HTML e Markdown)
- NFC-e no PDV (certificado A1, CSC, homologacao/producao, DANFE e XML)
- Lupa do PDV: Produto, Categoria ou Ordem de servico; OS Entregue ao finalizar a venda
- Assistente RAG por modulo/sessao (chat flutuante)
- Relatorio geral e permissoes por cargo
- Instalador Windows offline `dist/ERP-ISAC-Setup.exe`
- Zona critica em Configuracoes: apaga vendas, clientes, produtos, usuarios, configuracoes e imagens; a licenca atual e preservada
- Cadastro da empresa: logo, nome da loja, telefone, e-mail, Instagram, cidade, estado, endereco e CNPJ (login, sidebar e cupom)

## Produtos: importar e exportar

Na tela **Produtos**, use **Importar** / **Exportar** (toolbar ou Opcoes).

Formatos: Excel (`.xlsx` / `.xls`), CSV, TSV, TXT, JSON, XML, SQL, HTML e Markdown.

- **Exportar** baixa todos os produtos ativos; **Baixar modelo** gera o layout com uma linha de exemplo
- **Importar** cadastra produtos novos e atualiza os existentes pelo codigo de barras ou pelo nome
- Campos obrigatorios: nome, codigo de barras, preco e estoque
- Colunas reconhecidas: nome, codigo, descricao, preco, preco_custo, estoque, estoque_minimo, categoria, ncm, cfop, unidade, origem

## PDV (Realizar vendas)

O caixa precisa estar aberto. A venda comeca vazia (Caixa livre).

- Lupa **BUSCAR EM**: Produto (nome, codigo, SKU, ID), Categoria ou Ordem de servico
- OS Entregue ou Cancelada nao entra no carrinho; a mesma OS nao pode ser adicionada duas vezes
- Ao finalizar (F7), a OS vai para **Entregue**; se a venda for cancelada, volta para **Pronta para entrega**
- Pagamentos: Dinheiro, Cartao Debito, Cartao Credito e PIX
- Atalhos: F7 finalizar, F8 produto/servico, F6 historico, F3 cancelar aba, Ctrl+T / Ctrl+W abas
- Se a NFC-e estiver habilitada, o F7 pode emitir a nota automaticamente

## NFC-e

Nota Fiscal de Consumidor Eletronica (modelo 65), emitida no PDV.

Pre-requisitos: credenciamento na SEFAZ, certificado A1 (`.pfx` + senha), CSC (ID + token) e serie.

1. Em **Configuracoes**, habilite NFC-e e preencha CNPJ, IE, endereco e codigo IBGE
2. Envie o certificado A1 e o CSC
3. Comece em **Homologacao**. O modo simulacao gera chave/XML/protocolo local sem transmitir
4. Venda no PDV e finalize com F7 marcando emitir NFC-e
5. No historico: DANFE, XML e cancelamento (cancela a NFC-e autorizada)

Por padrao `nfce_simulacao=1` (treino sem SEFAZ).

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
| Gerente | Sem Usuarios e Configuracoes |
| Vendedor | Vendas, clientes, produtos, OS e historico |
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

Acesse **http://localhost:3000**. O servidor escuta em `0.0.0.0:3000`.

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

Nao versionar `node_modules/`, `erp.db-shm`, `erp.db-wal` nem `dist/*.zip`. O instalador `dist/ERP-ISAC-Setup.exe` pode ir no repositorio.
