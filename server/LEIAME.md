# resumos-api

API dos resumos dos relatórios de crédito, para a tela do front (prefixo `/resumos`, como `/monitor` e `/analise`).

O monitor de resumos (job `resumo-relatorio` do Code Engine) grava no bucket privado `ecovias-itr-docs`, a cada
relatório gerado ou alterado pelo agente, `resumos/<id>.json` e o índice `resumos/indice.json`. Esta API lê esses
arquivos com a credencial do COS. O formato está em `relatorio-creditos/monitor_resumo/LEIAME.md`.

| Rota | Retorno |
|---|---|
| `GET /api/resumos` | índice: `{atualizado_em, total, relatorios: [...]}`, do mais recente para o mais antigo |
| `GET /api/resumos/:id` | resumo completo, com `link.url` assinado novo para o HTML (vale 1 hora) |
| `GET /api/relatorios/:id` | redireciona para o HTML do relatório (`?versao=N` abre uma versão específica) |
| `GET /api/relatorios/:id/html` | o HTML pela própria API (mesma origem): o front abre num iframe e rola até a âncora |
| `GET /api/resumos/:id/revisao` | decisão de cada item na versão atual, contagens, pendentes por categoria, bloqueios |
| `PATCH /api/resumos/:id/itens/:item` | decide um item: `{decisao: aprovado/ajustado/rejeitado, motivo, texto_ajustado}` |
| `POST /api/resumos/:id/revisao/lote` | decide vários: `{itens: [...], decisao, motivo}` (ajuste é sempre um a um) |
| `POST /api/resumos/:id/ajustes/aplicar` | gera a versão nova do relatório com todos os ajustes aguardando (um pedido por vez) |
| `POST /api/resumos/:id/devolver` | devolve a versão para ajuste: `{justificativa}` |
| `POST /api/resumos/:id/publicar` | aprova e publica: exige 0 pendentes e 0 rejeitados |
| `GET /api/baselines/:emissor` | baseline vigente do emissor (última versão publicada); 404 enquanto nada foi publicado |
| `GET /api/health` | `{status: "ok"}`, sem login |

Revisão: fica em `revisoes/<id>.json` no mesmo bucket, com o usuário da sessão em cada decisão. Cada decisão guarda o
texto revisado: numa versão nova do relatório, o item cujo texto mudou volta a pendente (a decisão anterior fica em
`anterior`). Regras em `server/revisao.js`.

Publicação e baseline do Monitoramento (`server/baseline.js`): a publicação grava `publicacoes/<id>-v<N>.json` e monta o
baseline a partir do vigente (o da `monitor-api`; se ela não responder, `baselines/<emissor>/vigente.json`), trocando só
o que vinha do relatório de referência pelos dados da versão publicada: alavancagem, EBITDA 12 meses, margem, dívida
líquida, capex a realizar, gatilhos de rating (seção 17b) e premissas (Anexo I). O que veio dos documentos extraídos
(covenants, ratings, vencimentos, compliance) fica como está; o que o relatório ainda não traz (projeções) fica herdado e
listado em `herdados_da_referencia`. O baseline é guardado em `baselines/<emissor>/vigente.json` e no histórico da mesma
pasta, e enviado à `monitor-api` (`POST /api/baseline`) com `PUBLICAR_BASELINE=true` (ligado no app).

Ajuste vira versão nova: "Ajustar" guarda o texto novo (só em texto, item de lista e campo do quadro); "Gerar versão
nova" grava `ajustes/<id>/<pedido>.json`, a assinatura `ajuste-pedido` dispara o job do monitor, que troca o texto no
relatório (mantendo as fontes e a referência do item, com a marca "Ajustado pelo analista"), publica a versão nova com
o mesmo código da tool e devolve o resultado em `revisoes/<id>.json` (`aplicacao` de cada item).

Login: nenhum próprio. Cada pedido repassa o cookie para `GET /api/auth/me` do `azquest-auth-bff` e só segue com
sessão válida (401 sem sessão, 503 se o BFF não responder). No front, use `src/services/resumosApi.js`.

## Desenvolvimento

`npm run dev` já usa a resumos-api publicada (proxy `/resumos` no `vite.config.js`): entre com o seu login e a tela
lê os resumos reais. Para rodar a API na máquina: copie `.env.example` para `.env.local`, preencha a credencial HMAC
do COS (nunca commite: o repositório é público), rode `npm run resumos-api` e o Vite com
`VITE_RESUMOS_TARGET=http://localhost:8082`.

## Code Engine

App `resumos-api` no projeto `azquest-resumo-relatorios` (br-sao), com o secret `cos-hmac`. Imagem só da API
(`server/Dockerfile`; o `Dockerfile` da raiz é o do front, com nginx). Para publicar uma mudança:

```powershell
ibmcloud ce project select --name azquest-resumo-relatorios
ibmcloud ce app update --name resumos-api --build-source . --build-dockerfile server/Dockerfile
```
