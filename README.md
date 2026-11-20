# Compras Astro - Lista de Compras Serverless com Astro e SolidJS

## 1. Objetivo e Finalidade
Lista de compras ultrarrápida com renderização no servidor e ilhas interativas reativas.

## 2. Tecnologias Utilizadas
- Astro, SolidJS (@astrojs/solid-js), Tailwind CSS, Firebase

## 3. Arquitetura e Estrutura de Diretórios
Astro SSR com componentes reativos em SolidJS e persistência em tempo real no Firebase Firestore.

## 4. Principais Arquivos e Responsabilidades
- `astro.config.mjs`: Configuração do Astro com SolidJS e Tailwind.
- `src/`: Páginas e componentes de gerenciamento de itens.

## 5. Funcionalidades Identificadas
- Carregamento quase instantâneo graças à arquitetura de ilhas do Astro
- Adição e remoção reativa de produtos com SolidJS
- Sincronização em nuvem via Firebase

## 6. Como Compilar ou Executar
```bash
npm install
npm run dev
```

## 7. Estado Atual do Projeto
**Completo**

## 8. Pendências e Limitações Identificadas
Histórico de compras anteriores com comparativo de preços.
