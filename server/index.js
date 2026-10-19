// resumos-api: os resumos dos relatórios de crédito para o front (prefixo /resumos no Vite).
//
// Os resumos são gravados no COS pelo monitor (job resumo-relatorio do Code Engine) em
// resumos/indice.json e resumos/<id>.json. O bucket é privado: esta API lê com a credencial HMAC e
// gera, a cada pedido, links assinados novos para o HTML do relatório.
//
// Login: não há login próprio. Cada pedido reaproveita a sessão do BFF de autenticação
// (azquest-auth-bff): o cookie que chega é repassado para GET /api/auth/me, e só segue quem tem
// sessão válida. Mesmo padrão de prefixo da monitor-api e da analise-api.
//
// Concorrência: a revisão (revisoes/<id>.json) é gravada pela API e pelo job dos ajustes. Toda gravação é condicional
// (If-Match com o ETag lido): se outro gravou no meio-tempo, a alteração é refeita sobre o que está lá, sem apagar a
// decisão de ninguém. As decisões levam a versão do relatório que a tela mostrava: decidir sobre uma versão que já
// mudou devolve 409, em vez de aprovar um texto que o revisor não viu.
//
// Variáveis de ambiente:
//   COS_ACCESS_KEY_ID, COS_SECRET_ACCESS_KEY  credencial HMAC do COS (secret cos-hmac no Code Engine)
//   COS_ENDPOINT   padrão https://s3.br-sao.cloud-object-storage.appdomain.cloud
//   COS_BUCKET     padrão ecovias-itr-docs
//   AUTH_BFF_URL   padrão https://azquest-auth-bff.2fom3olxz1yh.br-sao.codeengine.appdomain.cloud
//   MONITOR_API_URL     padrão https://monitor-api.2fom3olxz1yh.br-sao.codeengine.appdomain.cloud
//   PUBLICAR_BASELINE   "true" envia o baseline à monitor-api (etapa 1.5) ao publicar; desligado por padrão
//   PAPEIS_PUBLICACAO   papéis do BFF que podem publicar e devolver (ex.: "gestor,admin"); vazio = qualquer um logado
//   PORT           padrão 8080
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'node:crypto'
import express from 'express'
import { baselineAtualizado, emissorCanonico } from './baseline.js'
import {
  TIPOS_AJUSTAVEIS, decidir, estadoDaRevisao, pedidoAtrasado, pedidoDeAjustes, publicando, recuperarPedidoAtrasado,
  revisaoVazia, validarDecisao,
} from './revisao.js'

const BUCKET = process.env.COS_BUCKET || 'ecovias-itr-docs'
const AUTH_BFF_URL = (process.env.AUTH_BFF_URL
  || 'https://azquest-auth-bff.2fom3olxz1yh.br-sao.codeengine.appdomain.cloud').replace(/\/$/, '')
const VALIDADE_LINK = 60 * 60 // 1 hora
const CACHE_SESSAO_MS = 60 * 1000
const ID = /^[a-z0-9][a-z0-9-]{0,199}$/
const ITEM = /^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/
const MONITOR_API_URL = (process.env.MONITOR_API_URL
  || 'https://monitor-api.2fom3olxz1yh.br-sao.codeengine.appdomain.cloud').replace(/\/$/, '')
const PUBLICAR_BASELINE = process.env.PUBLICAR_BASELINE === 'true'
const PAPEIS_PUBLICACAO = (process.env.PAPEIS_PUBLICACAO || '').split(',').map(p => p.trim()).filter(Boolean)

const cos = new S3Client({
  region: 'us-east-1', // o COS assina com a região genérica; o endpoint é que define br-sao
  endpoint: process.env.COS_ENDPOINT || 'https://s3.br-sao.cloud-object-storage.appdomain.cloud',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.COS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.COS_SECRET_ACCESS_KEY || '',
  },
})

// Erro com status e mensagem para a tela (o tratador de erros no fim do arquivo responde com eles).
class ErroHttp extends Error {
  constructor(status, detail, extra = {}) {
    super(detail)
    this.status = status
    this.extra = extra
  }
}

// A condição da gravação falhou (412): outro gravou o objeto depois da leitura.
class Conflito extends Error {}

const naoExiste = e => e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404

async function lerJsonComEtag(chave) {
  try {
    const r = await cos.send(new GetObjectCommand({ Bucket: BUCKET, Key: chave }))
    return { dados: JSON.parse(await r.Body.transformToString('utf-8')), etag: r.ETag }
  } catch (e) {
    if (naoExiste(e)) return { dados: null, etag: null }
    throw e
  }
}

async function lerJson(chave) {
  return (await lerJsonComEtag(chave)).dados
}

// seIgual: só grava se o objeto ainda tiver esse ETag. soSeNovo: só grava se o objeto não existir.
async function gravarJson(chave, dados, { seIgual, soSeNovo } = {}) {
  try {
    await cos.send(new PutObjectCommand({
      Bucket: BUCKET, Key: chave, Body: JSON.stringify(dados, null, 1),
      ContentType: 'application/json; charset=utf-8', CacheControl: 'no-cache',
      ...(seIgual ? { IfMatch: seIgual } : {}), ...(soSeNovo ? { IfNoneMatch: '*' } : {}),
    }))
  } catch (e) {
    if (e.$metadata?.httpStatusCode === 412 || e.name === 'PreconditionFailed') throw new Conflito(chave)
    throw e
  }
}

const agoraIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z')

function linkAssinado(chave) {
  return getSignedUrl(cos, new GetObjectCommand({ Bucket: BUCKET, Key: chave }), { expiresIn: VALIDADE_LINK })
}

// Sessões já conferidas no BFF, por cookie, por um minuto: a tela faz vários pedidos seguidos.
const sessoes = new Map()

async function usuarioDaSessao(cookie) {
  const agora = Date.now()
  const guardada = sessoes.get(cookie)
  if (guardada && guardada.expira > agora) return guardada.usuario
  const r = await fetch(`${AUTH_BFF_URL}/api/auth/me`, {
    headers: { Cookie: cookie, Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  })
  if (r.status === 401 || r.status === 403) return null
  if (!r.ok) throw new Error(`BFF de autenticação respondeu HTTP ${r.status}`)
  const usuario = await r.json()
  if (sessoes.size > 1000) sessoes.clear()
  sessoes.set(cookie, { usuario, expira: agora + CACHE_SESSAO_MS })
  return usuario
}

async function exigirSessao(req, res, next) {
  const cookie = req.headers.cookie
  if (!cookie) return res.status(401).json({ detail: 'Sessão expirada. Entre de novo.' })
  try {
    const usuario = await usuarioDaSessao(cookie)
    if (!usuario) return res.status(401).json({ detail: 'Sessão expirada. Entre de novo.' })
    req.usuario = usuario
    next()
  } catch (e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), rota: req.path, erro: String(e) }))
    res.status(503).json({ detail: 'Não foi possível conferir a sessão. Tente de novo em instantes.' })
  }
}

// Alterações só pela própria tela: o navegador marca de onde veio o pedido (Sec-Fetch-Site), e um formulário de
// outro site não consegue mandar JSON sem passar pelo CORS, que esta API não libera. Os dois juntos fecham o CSRF
// mesmo se o cookie da sessão viajar.
function exigirMesmaOrigem(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next()
  const site = req.headers['sec-fetch-site']
  if (site && site !== 'same-origin' && site !== 'none') {
    return res.status(403).json({ detail: 'Pedido de outra origem recusado.' })
  }
  if (!req.is('application/json')) return res.status(415).json({ detail: 'Envie o pedido em JSON.' })
  next()
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '200kb' }))
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  res.set('X-Content-Type-Options', 'nosniff')
  next()
})

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

app.use('/api', exigirSessao)
app.use('/api', exigirMesmaOrigem)

const emRota = handler => async (req, res, next) => {
  try {
    await handler(req, res)
  } catch (e) {
    next(e)
  }
}

// Lista para o dashboard: uma linha por relatório, do mais recente para o mais antigo.
app.get('/api/resumos', emRota(async (req, res) => {
  res.json((await lerJson('resumos/indice.json')) ?? { atualizado_em: null, total: 0, relatorios: [] })
}))

// Resumo completo de um relatório. O link assinado de 7 dias que o monitor grava no resumo não sai daqui: a tela abre
// o relatório pela própria API (/api/relatorios/:id), e um link que vale como senha não precisa circular.
app.get('/api/resumos/:id', emRota(async (req, res) => {
  if (!ID.test(req.params.id)) throw new ErroHttp(400, 'Identificador de relatório inválido.')
  const resumo = await lerJson(`resumos/${req.params.id}.json`)
  if (!resumo) throw new ErroHttp(404, 'Resumo não encontrado.')
  const { link, ...semLink } = resumo // eslint-disable-line no-unused-vars
  res.json(semLink)
}))

// ── Revisão e publicação ───────────────────────────────────────────────

function validarIds(req) {
  if (!ID.test(req.params.id) || (req.params.item && !ITEM.test(req.params.item))) {
    throw new ErroHttp(400, 'Identificador inválido.')
  }
}

async function lerResumo(id) {
  const resumo = await lerJson(`resumos/${id}.json`)
  if (!resumo) throw new ErroHttp(404, 'Resumo não encontrado.')
  return resumo
}

// A versão que a tela mostrava tem de ser a atual: decidir sobre um texto que já mudou seria aprovar o que o revisor
// não viu.
function exigirVersao(req, resumo) {
  const versao = req.body?.versao
  if (!Number.isInteger(versao)) throw new ErroHttp(422, 'Informe a versão do relatório que está na tela.')
  if (versao !== resumo.versao) {
    throw new ErroHttp(409, `O relatório mudou para a versão ${resumo.versao} enquanto a tela mostrava a ${versao}. `
      + 'A tela foi atualizada: confira o texto novo antes de decidir.', { versao_atual: resumo.versao })
  }
}

function exigirPapelDePublicacao(usuario) {
  if (PAPEIS_PUBLICACAO.length && !PAPEIS_PUBLICACAO.includes(usuario?.role)) {
    throw new ErroHttp(403, 'Seu perfil não pode publicar nem devolver versões.')
  }
}

// Lê a revisão, aplica `alterar` e grava só se ninguém gravou no meio-tempo; se gravou, refaz sobre o que está lá.
// `alterar` pode lançar ErroHttp para recusar; devolve o que a rota precisar.
async function atualizarRevisao(id, alterar) {
  const chave = `revisoes/${id}.json`
  for (let tentativa = 0; tentativa < 15; tentativa++) {
    // Espera aleatória entre tentativas: vários revisores gravando no mesmo instante não repetem juntos.
    if (tentativa) await new Promise(r => setTimeout(r, 20 + Math.random() * 60 * tentativa))
    const { dados, etag } = await lerJsonComEtag(chave)
    const revisao = dados ?? revisaoVazia(id)
    const resultado = await alterar(revisao)
    try {
      await gravarJson(chave, revisao, etag ? { seIgual: etag } : { soSeNovo: true })
      return { revisao, resultado }
    } catch (e) {
      if (!(e instanceof Conflito)) throw e
    }
  }
  throw new ErroHttp(409, 'A revisão foi alterada por outra pessoa várias vezes seguidas. Recarregue e tente de novo.')
}

function bloquearDuranteGeracaoOuPublicacao(revisao, resumo) {
  if (publicando(revisao, resumo)) throw new ErroHttp(409, 'A publicação desta versão está em andamento.')
}

// Decisão de cada item na versão atual, contagens por status e por categoria, e o que bloqueia a publicação.
app.get('/api/resumos/:id/revisao', emRota(async (req, res) => {
  validarIds(req)
  const resumo = await lerResumo(req.params.id)
  res.json(estadoDaRevisao(resumo, (await lerJson(`revisoes/${req.params.id}.json`)) ?? revisaoVazia(req.params.id)))
}))

// Decide um item: {versao, decisao: aprovado|ajustado|rejeitado, motivo, texto_ajustado}.
app.patch('/api/resumos/:id/itens/:item', emRota(async (req, res) => {
  validarIds(req)
  const erro = validarDecisao(req.body || {})
  if (erro) throw new ErroHttp(422, erro)
  const resumo = await lerResumo(req.params.id)
  exigirVersao(req, resumo)
  const item = (resumo.itens || []).find(i => i.id === req.params.item)
  if (!item) throw new ErroHttp(404, 'Item não existe nesta versão do relatório.')
  if (req.body.decisao === 'ajustado' && (!TIPOS_AJUSTAVEIS.includes(item.tipo) || !item.bruto)) {
    throw new ErroHttp(422, 'Tabela, gráfico, imagem e pendência não têm texto para ajustar: rejeite com o motivo e '
      + 'peça a correção ao agente no chat.')
  }
  const { revisao } = await atualizarRevisao(req.params.id, revisao => {
    bloquearDuranteGeracaoOuPublicacao(revisao, resumo)
    if (req.body.decisao === 'ajustado' && revisao.ajuste_pendente && !pedidoAtrasado(revisao)) {
      throw new ErroHttp(409, 'Uma versão nova está sendo gerada. Ajuste de novo quando ela chegar.')
    }
    decidir(revisao, resumo, [req.params.item], req.body, req.usuario, agoraIso())
  })
  res.json(estadoDaRevisao(resumo, revisao))
}))

// Decide vários itens de uma vez (uma seção, uma categoria): {versao, itens: [ids], decisao, motivo}. Ajuste é um a um.
app.post('/api/resumos/:id/revisao/lote', emRota(async (req, res) => {
  validarIds(req)
  const { itens = [], decisao, motivo } = req.body || {}
  if (decisao === 'ajustado') throw new ErroHttp(422, 'O ajuste é feito item a item.')
  const erro = validarDecisao({ decisao, motivo })
  if (erro) throw new ErroHttp(422, erro)
  if (!Array.isArray(itens) || !itens.length || itens.length > 500 || !itens.every(i => typeof i === 'string' && ITEM.test(i))) {
    throw new ErroHttp(422, 'Informe a lista de itens.')
  }
  const resumo = await lerResumo(req.params.id)
  exigirVersao(req, resumo)
  const { revisao, resultado } = await atualizarRevisao(req.params.id, revisao => {
    bloquearDuranteGeracaoOuPublicacao(revisao, resumo)
    return decidir(revisao, resumo, itens, { decisao, motivo }, req.usuario, agoraIso())
  })
  res.json({ ...estadoDaRevisao(resumo, revisao), ignorados: resultado })
}))

// Gera a versão nova com todos os ajustes aguardando: grava o pedido em ajustes/<id>/<pedido>.json, que dispara o
// job do monitor (assinatura de eventos do COS). Um pedido por vez; um pedido sem resposta há mais de 15 minutos é
// dado como perdido e os itens dele entram no próximo.
app.post('/api/resumos/:id/ajustes/aplicar', emRota(async (req, res) => {
  validarIds(req)
  const resumo = await lerResumo(req.params.id)
  exigirVersao(req, resumo)
  const { revisao, resultado: pedido } = await atualizarRevisao(req.params.id, revisao => {
    bloquearDuranteGeracaoOuPublicacao(revisao, resumo)
    if (revisao.ajuste_pendente) {
      if (!pedidoAtrasado(revisao)) throw new ErroHttp(409, 'A versão nova já está sendo gerada.')
      recuperarPedidoAtrasado(revisao, agoraIso())
    }
    const novo = pedidoDeAjustes(resumo, revisao, req.usuario, agoraIso())
    if (!novo) throw new ErroHttp(422, 'Nenhum ajuste aguardando.')
    return novo
  })
  await gravarJson(`ajustes/${req.params.id}/${pedido.pedido_id}.json`, pedido, { soSeNovo: true })
  res.status(202).json(estadoDaRevisao(resumo, revisao))
}))

// Devolve a versão para ajuste: {versao, justificativa}. A versão nova do relatório reabre a revisão sozinha.
app.post('/api/resumos/:id/devolver', emRota(async (req, res) => {
  validarIds(req)
  exigirPapelDePublicacao(req.usuario)
  const justificativa = typeof req.body?.justificativa === 'string' ? req.body.justificativa.trim() : ''
  if (!justificativa) throw new ErroHttp(422, 'Devolver exige justificativa.')
  if (justificativa.length > 2000) throw new ErroHttp(422, 'A justificativa passa de 2.000 caracteres.')
  const resumo = await lerResumo(req.params.id)
  exigirVersao(req, resumo)
  const { revisao } = await atualizarRevisao(req.params.id, revisao => {
    bloquearDuranteGeracaoOuPublicacao(revisao, resumo)
    if (revisao.decisao?.versao === resumo.versao && revisao.decisao.status === 'publicada') {
      throw new ErroHttp(409, 'Esta versão já foi publicada: para mudar, gere uma versão nova pelo agente.')
    }
    const agora = agoraIso()
    const usuario = req.usuario?.email || req.usuario?.name
    revisao.decisao = { status: 'devolvida', versao: resumo.versao, justificativa, usuario, em: agora }
    revisao.historico.push({ em: agora, usuario, acao: 'devolvida', justificativa })
  })
  res.json(estadoDaRevisao(resumo, revisao))
}))

// Pasta do baseline do emissor no bucket: baselines/ecorodovias/.
function pastaDoBaseline(emissor) {
  const slug = emissorCanonico(emissor).normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
  return /^[a-z0-9][a-z0-9-]{0,80}$/.test(slug) ? `baselines/${slug}` : null
}

// Baseline vigente na monitor-api (o que o Monitoramento usa hoje), com a sessão de quem publica. null se não houver.
async function baselineDaMonitorApi(emissor, cookie) {
  try {
    const r = await fetch(`${MONITOR_API_URL}/api/baseline?emissor=${encodeURIComponent(emissor)}`, {
      headers: { Cookie: cookie || '', Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return null
    const corpo = await r.json()
    const baseline = corpo?.baseline ?? corpo
    return baseline && (baseline.metricas || baseline.limites) ? baseline : null
  } catch {
    return null
  }
}

// Aprova e publica a versão: exige todos os itens revisados e nenhum rejeitado. Em três passos, para nenhuma decisão
// de outro revisor se perder no meio: (1) reserva a publicação na revisão ("publicando"), conferindo os bloqueios no
// que está gravado; (2) monta e guarda o baseline e, com PUBLICAR_BASELINE=true, envia ao Monitoramento; (3) grava a
// publicação. Enquanto está "publicando", decisões, ajustes e devolução desta versão são recusados.
app.post('/api/resumos/:id/publicar', emRota(async (req, res) => {
  validarIds(req)
  exigirPapelDePublicacao(req.usuario)
  const resumo = await lerResumo(req.params.id)
  exigirVersao(req, resumo)
  const emissor = emissorCanonico(resumo.empresa)
  const pasta = pastaDoBaseline(emissor)
  if (!pasta) throw new ErroHttp(422, 'O relatório não tem o nome do emissor: não há onde guardar o baseline.')
  const usuario = req.usuario?.email || req.usuario?.name

  const { revisao: reservada } = await atualizarRevisao(req.params.id, revisao => {
    if (publicando(revisao, resumo)) throw new ErroHttp(409, 'A publicação desta versão já está em andamento.')
    const estado = estadoDaRevisao(resumo, revisao)
    if (estado.status === 'publicada') throw new ErroHttp(409, 'Esta versão já foi publicada.')
    if (estado.bloqueios_para_publicar.length) {
      throw new ErroHttp(409, `Publicação bloqueada: ${estado.bloqueios_para_publicar.join('; ')}.`)
    }
    revisao.decisao = { status: 'publicando', versao: resumo.versao, usuario, em: agoraIso() }
  })

  const agora = agoraIso()
  let envio = { enviado: false, motivo: 'envio ao Monitoramento desligado (PUBLICAR_BASELINE)' }
  let baseline
  try {
    // Baseline: parte do vigente e troca o que vinha do relatório de referência pelos dados desta versão. Com o envio
    // ligado, o vigente é o da monitor-api (o que o Monitoramento usa); com ele desligado, a cópia nossa no bucket.
    const anterior = (PUBLICAR_BASELINE ? await baselineDaMonitorApi(emissor, req.headers.cookie) : null)
      ?? (await lerJson(`${pasta}/vigente.json`))
    baseline = baselineAtualizado(anterior, resumo, req.usuario, agora)
    if (PUBLICAR_BASELINE) {
      try {
        const r = await fetch(`${MONITOR_API_URL}/api/baseline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: req.headers.cookie || '' },
          body: JSON.stringify(baseline),
          signal: AbortSignal.timeout(15000),
        })
        envio = r.ok ? { enviado: true } : { enviado: false, motivo: `monitor-api respondeu HTTP ${r.status}` }
      } catch (e) {
        envio = { enviado: false, motivo: `monitor-api indisponível: ${e.message}` }
      }
    }
    const estado = estadoDaRevisao(resumo, reservada)
    await gravarJson(`publicacoes/${resumo.relatorio_id}-v${resumo.versao}.json`, {
      relatorio_id: resumo.relatorio_id, versao: resumo.versao, publicado_em: agora, usuario,
      contagem: estado.contagem, baseline, envio_baseline: envio, itens: estado.itens,
    }, { soSeNovo: true })
    await gravarJson(`${pasta}/vigente.json`, baseline)
    await gravarJson(`${pasta}/${agora.replace(/[^0-9]/g, '')}-${resumo.relatorio_id}-v${resumo.versao}.json`, baseline)
  } catch (e) {
    // Falhou antes de registrar: desfaz a reserva para a versão poder ser publicada de novo.
    await atualizarRevisao(req.params.id, revisao => {
      if (revisao.decisao?.status === 'publicando' && revisao.decisao.versao === resumo.versao) revisao.decisao = null
    }).catch(() => {})
    if (e instanceof Conflito) throw new ErroHttp(409, 'Esta versão já foi publicada.')
    throw e
  }

  const { revisao } = await atualizarRevisao(req.params.id, revisao => {
    revisao.decisao = { status: 'publicada', versao: resumo.versao, usuario, em: agora, baseline: envio }
    revisao.historico.push({ em: agora, usuario, acao: 'publicada', versao: resumo.versao })
  })
  res.json({ ...estadoDaRevisao(resumo, revisao), baseline: envio })
}))

// Baseline vigente do emissor (o da última versão publicada), na cópia que a publicação guarda no bucket. É a fonte
// dos dados de referência das telas (painel da tela de início); 404 enquanto nada foi publicado.
app.get('/api/baselines/:emissor', emRota(async (req, res) => {
  const pasta = pastaDoBaseline(req.params.emissor)
  if (!pasta) throw new ErroHttp(400, 'Emissor inválido.')
  const vigente = await lerJson(`${pasta}/vigente.json`)
  if (!vigente) throw new ErroHttp(404, 'Nenhuma versão publicada deste emissor.')
  res.json(vigente)
}))

// Pedido de edição pelo botão "Editar" do relatório completo: {versao, ancora, textos}. Grava quem pediu (da sessão) e o
// que digitou em edicoes/<id>/<pedido>.json e devolve o número do pedido, que a tela manda ao agente. A tool de edição
// lê este registro para marcar o texto novo como do analista ({AJ:usuario|data}) e aceitar só os números que ele
// digitou: a autoria vem da sessão, nunca do modelo. O prefixo edicoes/ não dispara job nenhum.
const ANCORA_EDICAO = /^(?:item|secao)-[A-Za-z0-9-]{1,80}$/
app.post('/api/resumos/:id/edicoes', emRota(async (req, res) => {
  validarIds(req)
  if (req.usuario?.role === 'leitor') throw new ErroHttp(403, 'Seu perfil só lê os relatórios: não pode pedir alterações.')
  const { versao, ancora, textos } = req.body || {}
  if (!Number.isInteger(versao) || versao < 1) throw new ErroHttp(422, 'Informe a versão do relatório que está na tela.')
  if (typeof ancora !== 'string' || !ANCORA_EDICAO.test(ancora)) throw new ErroHttp(422, 'Trecho do relatório inválido.')
  if (!Array.isArray(textos) || !textos.length || textos.length > 20
      || textos.some(t => typeof t !== 'string' || !t.trim() || t.length > 4000)) {
    throw new ErroHttp(422, 'Escreva a alteração pedida (até 4.000 caracteres por mensagem).')
  }
  const pedido = {
    pedido_id: `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    relatorio_id: req.params.id, versao, ancora, textos: textos.map(t => t.trim()),
    usuario: req.usuario?.email || req.usuario?.name || 'analista', em: agoraIso(),
  }
  await gravarJson(`edicoes/${req.params.id}/${pedido.pedido_id}.json`, pedido, { soSeNovo: true })
  res.status(201).json({ pedido_id: pedido.pedido_id })
}))

// HTML do relatório pela própria API (mesma origem do front): a tela abre num iframe e rola até a âncora. O relatório
// não tem script; a política de conteúdo garante que nenhum rode, mesmo se um dia o HTML trouxer um.
app.get('/api/relatorios/:id/html', emRota(async (req, res) => {
  const { id } = req.params
  const versao = req.query.versao
  if (!ID.test(id) || (versao && !/^\d{1,4}$/.test(versao))) throw new ErroHttp(400, 'Identificador de relatório inválido.')
  try {
    const r = await cos.send(new GetObjectCommand({
      Bucket: BUCKET, Key: versao ? `relatorios/${id}-v${versao}.html` : `relatorios/${id}.html`,
    }))
    res.set('Content-Security-Policy',
      "default-src 'none'; img-src data: 'self'; style-src 'unsafe-inline' https://fonts.googleapis.com; "
      + "font-src https://fonts.gstatic.com data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'")
    res.type('html').send(await r.Body.transformToString('utf-8'))
  } catch (e) {
    if (naoExiste(e)) throw new ErroHttp(404, 'Relatório não encontrado.')
    throw e
  }
}))

// Abre o HTML do relatório (versão atual, ou ?versao=N) num link assinado.
app.get('/api/relatorios/:id', emRota(async (req, res) => {
  const { id } = req.params
  const versao = req.query.versao
  if (!ID.test(id) || (versao && !/^\d{1,4}$/.test(versao))) throw new ErroHttp(400, 'Identificador de relatório inválido.')
  res.redirect(302, await linkAssinado(versao ? `relatorios/${id}-v${versao}.html` : `relatorios/${id}.html`))
}))

app.use((req, res) => res.status(404).json({ detail: 'Rota não encontrada.' }))

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)
  if (err instanceof ErroHttp) return res.status(err.status).json({ detail: err.message, ...err.extra })
  // Erros do leitor de JSON do express: corpo malformado ou grande demais são erro de quem pediu, não do servidor.
  if (err.type === 'entity.parse.failed') return res.status(400).json({ detail: 'JSON inválido.' })
  if (err.type === 'entity.too.large') return res.status(413).json({ detail: 'Pedido grande demais.' })
  console.error(JSON.stringify({ ts: new Date().toISOString(), rota: req.path, erro: String(err) }))
  res.status(502).json({ detail: 'Falha ao ler o armazenamento dos relatórios.' })
})

const porta = Number(process.env.PORT || 8080)
app.listen(porta, () => console.log(`resumos-api em http://localhost:${porta}`))
