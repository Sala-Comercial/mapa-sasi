# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Vendedores da SASI (área comercial). Cada um usa o mapa para enxergar a própria carteira de negócios do HubSpot no território: em quais municípios e estados tem negócio, contrato fechado ou negociação em andamento.

## Product Purpose

Mapa SASI mostra o Brasil por município (e por cidade, pela mancha urbana) com a população do IBGE e os negócios da SASI vindos do HubSpot, atualizado sozinho. A pergunta principal que precisa responder rápido: **onde a SASI tem negócio** (e, por contraste, onde não tem). Sucesso: o vendedor bate o olho e entende a cobertura dele, chega ao município em poucos cliques e vê negócios, valores e etapas.

## Positioning

Cruza dado real do HubSpot (negócios, etapas, funis, vendedores) com a malha municipal oficial do IBGE e a população, ao vivo. Negócios sem município (órgãos estaduais) ou sem localização não somem: aparecem em listas próprias.

## Operating Context

- Roda local (`node server.js`, porta 8800) ou publicado; lê o HubSpot por token privado, sincroniza a cada 60 s, aceita webhook e tem uma cópia de segurança dos negócios (`data/negocios_snapshot.json`, 05/11/2026).
- Filtros: vendedor, situação (fechado / em negociação), funil, etapa, estado, faixa de população, ocultar sem negócio.
- Visões: Município (malha IBGE) e Cidade (Áreas Urbanizadas 2022). Aba Lista com ordenação e exportação CSV.
- Pode ser embutido em outro sistema via `window.SasiMapa` / `postMessage` (ex.: filtrar pelo vendedor logado).

## Capabilities and Constraints

- Página única `index.html` em HTML/CSS/JS puro, desenhada em canvas; sem framework nem build.
- Contornos e população vêm embutidos na página; manchas urbanas são buscadas em `/data`.
- Repositório privado: contém negócios reais (clientes, valores, vendedores). Nunca expor publicamente.
- Etapas Perdido e Descontinuado ficam fora.

## Brand Commitments

Seguir o SASI Design System (white-label Sumé): tokens semânticos, primitivos e voz operacional do sistema.

## Evidence on Hand

- Dados reais: `data/negocios_snapshot.json` (345 negócios em 05/11/2026), `data/municipios.json`, manchas urbanas IBGE em `data/`.
- Fontes: IBGE (estimativas 2026, Censo 2022, malhas municipais, Áreas Urbanizadas 2022), Wikidata (sedes), HubSpot.

## Product Principles

1. Cobertura primeiro: o que tem negócio precisa saltar aos olhos; o resto recua.
2. Dado sempre verdadeiro e rastreável à fonte (IBGE / HubSpot), com a hora da última atualização visível.
3. Nenhum negócio se perde: o que não cabe no mapa aparece em lista.
4. Poucos cliques do Brasil ao negócio.
