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
- **NFC-e** - Emissão no PDV (certificado A1, CSC, homologação/produção, DANFE)

## Recursos extras

- Tema claro/escuro
- Calculadora integrada
- Tela cheia
- Busca e paginação em todas as listagens
- Autenticação de usuários

## Instalacao no Windows

1. Copie `dist/ERP-ISAC-Setup.exe` para o notebook.
2. Clique duas vezes no `.exe` e avance as telas.
3. Use o atalho **ERP ISAC** na Area de Trabalho.

O sistema abre em **http://localhost:3000**. O instalador ja traz o Node.js e as dependencias; nao precisa de internet.

Nao execute `windows/Instalar.bat` do repositorio Git: essa pasta so tem os scripts, sem o Node.js.

## Como executar (desenvolvimento)

```bash
cd erp-isac
npm install
npm start
```

Acesse: **http://localhost:3000**

## Login padrão

- **Email:** admin@erpisac.com
- **Senha:** admin123

## Tecnologias

- Node.js + Express
- SQLite (better-sqlite3)
- HTML/CSS/JavaScript (SPA)
