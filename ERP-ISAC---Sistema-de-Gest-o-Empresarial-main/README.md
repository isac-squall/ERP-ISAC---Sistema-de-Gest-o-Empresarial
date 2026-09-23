# ERP ISAC - Sistema de Gestão Empresarial

Sistema ERP completo baseado no layout ERP ISAC, com todos os módulos funcionais.

## Módulos

- **Dashboard** - Visão geral com métricas e vendas recentes
- **Realizar vendas** - PDV (Ponto de Venda) com carrinho
- **Gerenciar caixa** - Abertura/fechamento e movimentações
- **Financeiro** - Contas a pagar e receber
- **Clientes** - Cadastro completo (CRUD)
- **Produtos** - Controle de estoque e preços
- **Ordens de serviço** - Gestão de OS com status e datas
- **Usuários** - Gerenciamento de acessos
- **Fornecedores** - Cadastro de fornecedores
- **Histórico de vendas** - Consulta de vendas realizadas
- **Relatório geral** - Gráficos e rankings

## Recursos extras

- Tema claro/escuro
- Calculadora integrada
- Tela cheia
- Busca e paginação em todas as listagens
- Autenticação de usuários

## Como executar

```bash
cd erp-isac
npm install
npm start
```

Acesse: **http://localhost:3000**

## Instalador Windows

Para gerar o instalador x64:

```bash
npm install
npm run dist
```

O arquivo `release/ERP ISAC Setup 1.0.0.exe` instala o aplicativo com Node.js, Electron e SQLite incluídos. O banco de dados do aplicativo instalado fica em `%APPDATA%\ERP ISAC\data\erp.db`, permitindo atualizações sem perder os dados e execução sem permissao de administrador.

## Login padrão

- **Email:** admin@erpisac.com
- **Senha:** admin123

## Tecnologias

- Node.js + Express
- SQLite (better-sqlite3)
- HTML/CSS/JavaScript (SPA)
