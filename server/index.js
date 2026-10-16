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
// Variáveis de ambiente:
//   COS_ACCESS_KEY_ID, COS_SECRET_ACCESS_KEY  credencial HMAC do COS (secret cos-hmac no Code Engine)
//   COS_ENDPOINT   padrão https://s3.br-sao.cloud-object-storage.appdomain.cloud
//   COS_BUCKET     padrão ecovias-itr-docs
//   AUTH_BFF_URL   padrão https://azquest-auth-bff.2fom3olxz1yh.br-sao.codeengine.appdomain.cloud
//   MONITOR_API_URL     padrão https://monitor-api.2fom3olxz1yh.br-sao.codeengine.appdomain.cloud
//   PUBLICAR_BASELINE   "true" envia o baseline à monitor-api (etapa 1.5) ao publicar; desligado por padrão
//   PORT           padrão 8080
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import express from 'express'
import { baselineAtualizado, emissorCanonico } from './baseline.js'
import {
  TIPOS_AJUSTAVEIS, decidir, estadoDaRevisao, pedidoDeAjustes, revisaoVazia, validarDecisao,
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

const cos = new S3Client({
  region: 'us-east-1', // o COS assina com a região genérica; o endpoint é que define br-sao
  endpoint: process.env.COS_ENDPOINT || 'https://s3.br-sao.cloud-object-storage.appdomain.cloud',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.COS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.COS_SECRET_ACCESS_KEY || '',
  },
})

async function lerJson(chave) {
  try {
    const r = await cos.send(new GetObjectCommand({ Bucket: BUCKET, Key: chave }))
    return JSON.parse(await r.Body.transformToString('utf-8'))
  } catch (e) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null
    throw e
  }
}

async function gravarJson(chave, dados) {
  await cos.send(new PutObjectCommand({
    Bucket: BUCKET, Key: chave, Body: JSON.stringify(dados, null, 1),
    ContentType: 'application/json; charset=utf-8', CacheControl: 'no-cache',
  }))
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

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '200kb' }))
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

app.use('/api', exigirSessao)

// Lista para o dashboard: uma linha por relatório, do mais recente para o mais antigo.
app.get('/api/resumos', async (req, res, next) => {
  try {
    res.json((await lerJson('resumos/indice.json')) ?? { atualizado_em: null, total: 0, relatorios: [] })
  } catch (e) {
    next(e)
  }
})

// Resumo completo de um relatório, com link assinado novo (o gravado no resumo expira em 7 dias).
app.get('/api/resumos/:id', async (req, res, next) => {
  if (!ID.test(req.params.id)) return res.status(400).json({ detail: 'Identificador de relatório inválido.' })
  try {
    const resumo = await lerJson(`resumos/${req.params.id}.json`)
    if (!resumo) return res.status(404).json({ detail: 'Resumo não encontrado.' })
    const chave = resumo.arquivos?.html || `relatorios/${req.params.id}.html`
    const expira = new Date(Date.now() + VALIDADE_LINK * 1000).toISOString().replace(/\.\d+Z$/, 'Z')
    res.json({ ...resumo, link: { url: await linkAssinado(chave), expira_em: expira } })
  } catch (e) {
    next(e)
  }
})

// ── Revisão e publicação ───────────────────────────────────────────────

async function resumoERevisao(id) {
  const resumo = await lerJson(`resumos/${id}.json`)
  if (!resumo) return [null, null]
  return [resumo, (await lerJson(`revisoes/${id}.json`)) ?? revisaoVazia(id)]
}

function comId(handler) {
  return async (req, res, next) => {
    if (!ID.test(req.params.id) || (req.params.item && !ITEM.test(req.params.item))) {
      return res.status(400).json({ detail: 'Identificador inválido.' })
    }
    try {
      const [resumo, revisao] = await resumoERevisao(req.params.id)
      if (!resumo) return res.status(404).json({ detail: 'Resumo não encontrado.' })
      await handler(req, res, resumo, revisao)
    } catch (e) {
      next(e)
    }
  }
}

// Decisão de cada item na versão atual, contagens por status e por categoria, e o que bloqueia a publicação.
app.get('/api/resumos/:id/revisao', comId(async (req, res, resumo, revisao) => {
  res.json(estadoDaRevisao(resumo, revisao))
}))

// Decide um item: {decisao: aprovado|ajustado|rejeitado, motivo, texto_ajustado}.
app.patch('/api/resumos/:id/itens/:item', comId(async (req, res, resumo, revisao) => {
  const erro = validarDecisao(req.body || {})
  if (erro) return res.status(422).json({ detail: erro })
  const item = (resumo.itens || []).find(i => i.id === req.params.item)
  if (req.body.decisao === 'ajustado' && item && (!TIPOS_AJUSTAVEIS.includes(item.tipo) || !item.bruto)) {
    return res.status(422).json({ detail: 'Tabela, gráfico, imagem e pendência não têm texto para ajustar: rejeite com '
      + 'o motivo e peça a correção ao agente no chat.' })
  }
  if (req.body.decisao === 'ajustado' && revisao.ajuste_pendente) {
    return res.status(409).json({ detail: 'Uma versão nova está sendo gerada. Ajuste de novo quando ela chegar.' })
  }
  const faltando = decidir(revisao, resumo, [req.params.item], req.body, req.usuario, agoraIso())
  if (faltando.length) return res.status(404).json({ detail: 'Item não existe nesta versão do relatório.' })
  await gravarJson(`revisoes/${req.params.id}.json`, revisao)
  res.json(estadoDaRevisao(resumo, revisao))
}))

// Decide vários itens de uma vez (uma seção, uma categoria): {itens: [ids], decisao, motivo}. Ajuste é um a um.
app.post('/api/resumos/:id/revisao/lote', comId(async (req, res, resumo, revisao) => {
  const { itens = [], decisao, motivo } = req.body || {}
  if (decisao === 'ajustado') return res.status(422).json({ detail: 'O ajuste é feito item a item.' })
  const erro = validarDecisao({ decisao, motivo })
  if (erro) return res.status(422).json({ detail: erro })
  if (!Array.isArray(itens) || !itens.length || itens.length > 500 || !itens.every(i => ITEM.test(i))) {
    return res.status(422).json({ detail: 'Informe a lista de itens.' })
  }
  const faltando = decidir(revisao, resumo, itens, { decisao, motivo }, req.usuario, agoraIso())
  await gravarJson(`revisoes/${req.params.id}.json`, revisao)
  res.json({ ...estadoDaRevisao(resumo, revisao), ignorados: faltando })
}))

// Gera a versão nova com todos os ajustes aguardando: grava o pedido em ajustes/<id>/<pedido>.json, que dispara o
// job do monitor (assinatura de eventos do COS). Um pedido por vez: o próximo só depois que a versão nova chegar.
app.post('/api/resumos/:id/ajustes/aplicar', comId(async (req, res, resumo, revisao) => {
  if (revisao.ajuste_pendente) {
    const minutos = (Date.now() - Date.parse(revisao.ajuste_pendente.em)) / 60000
    if (minutos < 15) return res.status(409).json({ detail: 'A versão nova já está sendo gerada.' })
    revisao.historico.push({ em: agoraIso(), acao: 'pedido de ajuste sem resposta descartado', ...revisao.ajuste_pendente })
    revisao.ajuste_pendente = null // pedido perdido (job fora do ar): libera um novo
  }
  const pedido = pedidoDeAjustes(resumo, revisao, req.usuario, agoraIso())
  if (!pedido) return res.status(422).json({ detail: 'Nenhum ajuste aguardando.' })
  await gravarJson(`revisoes/${req.params.id}.json`, revisao)
  await gravarJson(`ajustes/${req.params.id}/${pedido.pedido_id}.json`, pedido)
  res.status(202).json(estadoDaRevisao(resumo, revisao))
}))

// Devolve a versão para ajuste: {justificativa}. A versão nova do relatório reabre a revisão sozinha.
app.post('/api/resumos/:id/devolver', comId(async (req, res, resumo, revisao) => {
  const justificativa = req.body?.justificativa?.trim()
  if (!justificativa) return res.status(422).json({ detail: 'Devolver exige justificativa.' })
  const agora = agoraIso()
  const usuario = req.usuario?.email || req.usuario?.name
  revisao.decisao = { status: 'devolvida', versao: resumo.versao, justificativa, usuario, em: agora }
  revisao.historico.push({ em: agora, usuario, acao: 'devolvida', justificativa })
  await gravarJson(`revisoes/${req.params.id}.json`, revisao)
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

// Aprova e publica a versão: exige todos os itens revisados e nenhum rejeitado. Grava o registro da publicação e,
// com PUBLICAR_BASELINE=true, envia o baseline ao Monitoramento (etapa 1.5) com a sessão de quem publicou.
app.post('/api/resumos/:id/publicar', comId(async (req, res, resumo, revisao) => {
  const estado = estadoDaRevisao(resumo, revisao)
  if (estado.status === 'publicada') return res.status(409).json({ detail: 'Esta versão já foi publicada.' })
  if (estado.bloqueios_para_publicar.length) {
    return res.status(409).json({ detail: `Publicação bloqueada: ${estado.bloqueios_para_publicar.join('; ')}.` })
  }
  const agora = agoraIso()
  const usuario = req.usuario?.email || req.usuario?.name
  // Baseline: parte do vigente (o da monitor-api; se ela não responder, a cópia nossa no bucket) e troca o que vinha
  // do relatório de referência pelos dados desta versão. Fica guardado no bucket (vigente e histórico) mesmo com o
  // envio desligado ou a monitor-api fora do ar.
  const emissor = emissorCanonico(resumo.empresa)
  const pasta = pastaDoBaseline(emissor)
  const anterior = (await baselineDaMonitorApi(emissor, req.headers.cookie)) ?? (await lerJson(`${pasta}/vigente.json`))
  const baseline = baselineAtualizado(anterior, resumo, req.usuario, agora)
  await gravarJson(`${pasta}/vigente.json`, baseline)
  await gravarJson(`${pasta}/${agora.replace(/[^0-9]/g, '')}-${resumo.relatorio_id}-v${resumo.versao}.json`, baseline)
  let envio = { enviado: false, motivo: 'envio ao Monitoramento desligado (PUBLICAR_BASELINE)' }
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
  const publicacao = { relatorio_id: resumo.relatorio_id, versao: resumo.versao, publicado_em: agora, usuario,
    contagem: estado.contagem, baseline, envio_baseline: envio, itens: estado.itens }
  await gravarJson(`publicacoes/${resumo.relatorio_id}-v${resumo.versao}.json`, publicacao)
  revisao.decisao = { status: 'publicada', versao: resumo.versao, usuario, em: agora, baseline: envio }
  revisao.historico.push({ em: agora, usuario, acao: 'publicada', versao: resumo.versao })
  await gravarJson(`revisoes/${req.params.id}.json`, revisao)
  res.json({ ...estadoDaRevisao(resumo, revisao), baseline: envio })
}))

// Baseline vigente do emissor (o da última versão publicada), na cópia que a publicação guarda no bucket. É a fonte
// dos dados de referência das telas (painel da tela de início); 404 enquanto nada foi publicado.
app.get('/api/baselines/:emissor', async (req, res, next) => {
  const pasta = pastaDoBaseline(req.params.emissor)
  if (!pasta) return res.status(400).json({ detail: 'Emissor inválido.' })
  try {
    const vigente = await lerJson(`${pasta}/vigente.json`)
    if (!vigente) return res.status(404).json({ detail: 'Nenhuma versão publicada deste emissor.' })
    res.json(vigente)
  } catch (e) {
    next(e)
  }
})

// HTML do relatório pela própria API (mesma origem do front): a tela abre num iframe e rola até a âncora.
app.get('/api/relatorios/:id/html', async (req, res, next) => {
  const { id } = req.params
  const versao = req.query.versao
  if (!ID.test(id) || (versao && !/^\d{1,4}$/.test(versao))) {
    return res.status(400).json({ detail: 'Identificador de relatório inválido.' })
  }
  try {
    const r = await cos.send(new GetObjectCommand({
      Bucket: BUCKET, Key: versao ? `relatorios/${id}-v${versao}.html` : `relatorios/${id}.html`,
    }))
    res.type('html').send(await r.Body.transformToString('utf-8'))
  } catch (e) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ detail: 'Relatório não encontrado.' })
    }
    next(e)
  }
})

// Abre o HTML do relatório (versão atual, ou ?versao=N) num link assinado.
app.get('/api/relatorios/:id', async (req, res, next) => {
  const { id } = req.params
  const versao = req.query.versao
  if (!ID.test(id) || (versao && !/^\d{1,4}$/.test(versao))) {
    return res.status(400).json({ detail: 'Identificador de relatório inválido.' })
  }
  try {
    res.redirect(302, await linkAssinado(versao ? `relatorios/${id}-v${versao}.html` : `relatorios/${id}.html`))
  } catch (e) {
    next(e)
  }
})

app.use((req, res) => res.status(404).json({ detail: 'Rota não encontrada.' }))

app.use((err, req, res, next) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), rota: req.path, erro: String(err) }))
  if (res.headersSent) return next(err)
  res.status(502).json({ detail: 'Falha ao ler o armazenamento dos relatórios.' })
})

const porta = Number(process.env.PORT || 8080)
app.listen(porta, () => console.log(`resumos-api em http://localhost:${porta}`))
