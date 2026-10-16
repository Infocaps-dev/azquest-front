# Front do Piloto AZ Quest

React + Vite + Carbon. Três abas: Início (conversa com o agente), Análise de
Crédito (etapa 1.2) e Monitoramento (etapa 1.5).

```sh
npm install
npm run dev     # http://localhost:5173
npm run lint
npm run build
```

## Os quatro prefixos

Em desenvolvimento o dev server do Vite encaminha cada prefixo para o serviço
dele (`vite.config.js`). Prefixos próprios, não um `/api` só, porque são
serviços diferentes com hosts diferentes:

| Prefixo | Serviço | O quê |
|---|---|---|
| `/api` | `azquest-auth-bff` | Login, sessão, usuários |
| `/analise` | `analise-api` | Análise de Crédito **e a conversa da tela de início** |
| `/monitor` | `monitor-api` | Monitoramento |

Para apontar para um serviço rodando na própria máquina:
`VITE_API_TARGET`, `VITE_ANALISE_TARGET`, `VITE_MONITOR_TARGET`.

## Modos simulados

Quatro flags em `.env.development`, uma por frente. Com a flag em `true` a
tela serve dados fixos e não chama o serviço — serve para demonstrar sem
backend de pé.

| Flag | Efeito |
|---|---|
| `VITE_AUTH_MOCK` | Login sem o BFF |
| `VITE_ANALISE_MOCK` | A aba Análise de Crédito a partir de `public/piloto/analise.json` |
| `VITE_MONITOR_MOCK` | O ciclo B1–B8 avançando sozinho |
| `VITE_CHAT_MOCK` | A conversa da tela de início com respostas de roteiro |

## A conversa da tela de início

Fala com o Agente Analista de Crédito AZ Quest no watsonx Orchestrate, pela
`analise-api` (`POST /analise/api/chat`). A chave do Orchestrate fica no
servidor — nunca no navegador.

| Arquivo | O quê |
|---|---|
| `services/chatApi.js` | O cliente: `fetch` + `ReadableStream`, e o modo simulado |
| `hooks/useConversa.js` | O estado de um turno, o histórico e o relógio da espera |
| `components/Chat/ChatMain.jsx` | A conversa e o composer |
| `components/Chat/RespostaDoAgente.jsx` | O markdown do agente, sem HTML cru |
| `components/Chat/ConversationSidebar.jsx` | As conversas de quem está logado |

Duas coisas que surpreendem quem mexe nisso pela primeira vez, as duas
medidas e registradas no `DIAGNOSTICO.md` da `analise-api`:

**O Orchestrate não manda nada nos primeiros ~39 segundos.** Pedido de
relatório leva ~38s; notícias, até 58s. O aviso de andamento do agente não
preenche essa espera porque durante ela não chega nada — por isso a tela
mostra o tempo decorrido, que é dela e não do agente.

**O agente nunca escreve o relatório no chat.** Ele devolve um link assinado
para o HTML no Cloud Object Storage, válido por 7 dias. A tela reconhece esse
link e oferece a passagem para a aba Análise de Crédito, que é onde o
relatório é revisado item a item.

## Publicação

O `Dockerfile` constrói em duas etapas: Node gera o bundle, nginx o serve. A
imagem final não tem Node nem `node_modules`.

```sh
docker build -t br.icr.io/azquest/azquest-front:<versao> .
docker push br.icr.io/azquest/azquest-front:<versao>
ibmcloud ce app update --name azquest-front --image br.icr.io/azquest/azquest-front:<versao>
```

No ar: `https://azquest-front.2fom3olxz1yh.br-sao.codeengine.appdomain.cloud`.

**O `nginx.conf` faz em produção o que o `vite.config.js` faz em dev**: serve a
SPA e encaminha os três prefixos. Mesmo desenho de propósito, para o que
funciona na máquina funcionar no ar.

**Por que proxy e não CORS.** O cookie de sessão que o BFF emite é
`SameSite=Lax`, e Lax não viaja em requisição cross-site: um front hospedado
noutro domínio não receberia o cookie nem com CORS liberado. Trocar para
`SameSite=None` resolveria no Chrome e quebraria no Safari, que bloqueia
cookie de terceiro, e ainda exigiria CORS em três serviços (as duas FastAPI
não têm nenhum hoje). Com o proxy, navegador e API ficam na mesma origem: o
cookie é first-party, não há preflight, e nada muda nos três serviços.

Nenhum `VITE_*_MOCK` é definido no build de produção, então os quatro modos
simulados ficam desligados. É o que se quer no ar: nenhuma tela servindo dado
de mentira.

## O que ainda não está resolvido

**O Code Engine bufferiza o SSE.** Medido em 16/10/2026: a mesma pergunta que
na máquina local espalhou 29 eventos ao longo de 8 segundos chega, pela API
publicada, toda de uma vez no fim. Não é o nginx daqui, que tem
`proxy_buffering off` e foi descartado como causa comparando os dois caminhos.

Consequência: os avisos de andamento do agente não aparecem progressivamente
no ar, e o relógio de `useConversa.js` passa a ser o único sinal de vida
durante a espera. O chat funciona, a resposta é a mesma: o que se perde é a
espera informada. Investigar o buffer do ingress do Code Engine fica para
depois do Piloto.
