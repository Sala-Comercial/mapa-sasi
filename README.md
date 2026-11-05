# Mapa SASI

Mapa do Brasil com a população dos municípios e das cidades (IBGE) e os negócios da SASI do HubSpot, por vendedor. O site lê o HubSpot e se atualiza sozinho.

**Repositório privado.** A pasta `data/negocios_snapshot.json` contém negócios reais (clientes, valores e vendedores). Não torne o repositório público.

- Como abrir, ligar ao HubSpot e atualizar: veja o [LEIA-ME.md](LEIA-ME.md).
- Para rodar: instale o Node.js 18 ou mais novo e execute `Iniciar_Mapa.bat` (ou `node server.js`). O site abre em http://localhost:8800.
- O token do HubSpot vai no arquivo `.env` (copie o `.env.example`). O `.env` nunca vai para o repositório.

## Estrutura

| Arquivo | Para quê |
|---|---|
| `server.js`, `localizador.js` | servidor, leitura do HubSpot e descoberta do município de cada negócio |
| `index.html` | a página do mapa (contornos dos municípios e população já dentro) |
| `data/` | municípios, manchas urbanas das cidades, ajustes manuais e a cópia dos negócios de 05/11/2026 |
| `config.json` | lista de vendedores do filtro |

Fontes: IBGE (população, malhas municipais, Áreas Urbanizadas 2022), Wikidata (posição das sedes) e HubSpot (negócios).
