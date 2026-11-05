# Mapa SASI: municípios, cidades e negócios do HubSpot

Um site só. Ele lê os negócios do HubSpot e se atualiza sozinho: negócio criado, alterado, perdido ou apagado no HubSpot muda no mapa, sem recarregar a página.

## Como abrir

1. Dê dois cliques em **Iniciar_Mapa.bat** (precisa do Node.js: https://nodejs.org, versão LTS).
2. O navegador abre em **http://localhost:8800**. Deixe a janela preta aberta: ela é o servidor.

Sem o token do HubSpot (passo abaixo), o site abre com os negócios salvos de 05/11/2026 e avisa no topo "HubSpot ainda não conectado".

## Ligar ao HubSpot (uma vez só)

1. No HubSpot: engrenagem (Configurações) → Integrações → **Aplicativos privados** → Criar aplicativo privado.
2. Aba **Escopos**: marque `crm.objects.deals.read`, `crm.objects.owners.read` e `crm.schemas.deals.read`. Só leitura: o site não altera nada no HubSpot.
3. Criar o aplicativo e copiar o **token** (começa com `pat-`).
4. Abra o arquivo `.env` desta pasta (o Iniciar_Mapa.bat cria) e cole depois de `HUBSPOT_TOKEN=`. Salve e rode o Iniciar_Mapa.bat de novo.

O token é uma senha. Não mande por chat nem e-mail.

No topo do site aparece **"Ao vivo · HubSpot · atualizado às HH:MM"** quando está ligado.

## Quando o mapa atualiza

- **A cada 60 segundos** (muda em `SYNC_SEGUNDOS` no `.env`): o servidor pergunta ao HubSpot o que mudou. Não precisa de nada além do token.
- **Na hora** (opcional): o HubSpot pode avisar o servidor no instante da mudança (webhook). Precisa de um endereço público do site. Configure em Configurações → Integrações → Webhooks, com a URL `https://SEU-ENDERECO/webhook/hubspot` e os eventos `deal.creation`, `deal.propertyChange` e `deal.deletion`; coloque `PUBLIC_URL` e `HUBSPOT_CLIENT_SECRET` no `.env`.
- **A cada 1 hora**: carga completa, que pega também negócios apagados.

## Quais negócios entram

Todos os negócios de todos os funis e etapas, **menos Perdido e Descontinuado**. Negócio sem cidade entra mesmo assim:

- com cidade (campo `cidade`, estado ou o nome do negócio): aparece na bolinha/contorno do município;
- só com estado (órgãos estaduais): aparece ao escolher o estado, em "Negócios sem município definido";
- sem nenhuma localização: aparece na lista "Negócios sem localização".

Quanto melhor o campo **Cidade** e **Estado** no HubSpot, mais negócios caem no município certo. Para corrigir um caso sem mexer no HubSpot, edite `data/ajustes.json` (exemplo: `"Nome exato do negócio": {"ibge": 2611606}`).

## Vendedores do filtro

A lista do filtro de vendedor está em `config.json`. Os nomes têm que ser iguais aos do HubSpot. Os negócios de outros proprietários continuam no mapa e nos totais.

## Quem pode ver (importante)

O site mostra os negócios de **todos** os vendedores. A regra do PRD diz que o vendedor não pode ver os negócios dos outros. Por isso:

- use o site apenas na sua máquina ou para a gestão;
- para outras pessoas da rede, ponha `HOST=0.0.0.0` e defina `MAPA_USUARIO` e `MAPA_SENHA` no `.env`;
- para cada vendedor ver só os próprios negócios, o servidor precisa saber quem está logado no chat do Criador de propostas. Isso entra quando o mapa for integrado ao chat, e o filtro tem que ser feito no servidor, não na tela.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `Iniciar_Mapa.bat` | liga o site |
| `index.html` | a página do mapa (contornos do IBGE e população já dentro) |
| `server.js`, `localizador.js` | servidor, leitura do HubSpot e descoberta do município |
| `.env` | token e opções (criado a partir do `.env.example`) |
| `config.json` | lista de vendedores do filtro |
| `data/ajustes.json` | correções manuais de município por nome de negócio |
| `data/urbano_*.bin.gz`, `data/urbano_hosts.json` | manchas urbanas das cidades (IBGE) em 3 níveis de detalhe; o site busca sob demanda |
| `data/negocios_snapshot.json` | negócios salvos de 05/11/2026 (usados enquanto não há token) |
| `data/negocios_cache.json` | última cópia dos negócios (criada pelo servidor) |

## Fontes dos dados do mapa

População: IBGE (estimativa 2026; Censo 2022 para a população urbana). Contornos: malhas municipais do IBGE. Manchas urbanas: Áreas Urbanizadas 2022 (IBGE). Posição das sedes: Wikidata.
