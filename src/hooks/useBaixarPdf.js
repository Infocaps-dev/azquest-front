import { useCallback, useEffect, useRef, useState } from 'react'
import { enderecoPdf, prepararPdf } from '../services/resumosApi'

// "Baixar PDF" com retorno na tela.
//
// O PDF de cada versão é gerado uma vez no serviço de PDF e depois sai pronto do
// bucket. A primeira vez pode levar até 2 min, quando o serviço está desligado e
// precisa religar: um link simples ficaria esse tempo todo sem mostrar nada (e o
// pedido longo era cortado no meio). Aqui a tela pede a geração, pergunta a
// cada 3 s se ficou pronto e só então baixa o arquivo, que chega na hora.
//
// `gerando` é o tempo desde o clique, em segundos (null fora da geração): o botão
// diz que está processando e, passados 15 s, a tela explica a demora (`ligando`).

const INTERVALO_MS = 3000
const LIMITE_MS = 5 * 60 * 1000

function baixarArquivo(url) {
  const a = document.createElement('a')
  a.href = url
  a.download = ''
  document.body.append(a)
  a.click()
  a.remove()
}

export function useBaixarPdf() {
  const [gerando, setGerando] = useState(null)
  const [erro, setErro] = useState(null)
  const montado = useRef(true)
  const ocupado = useRef(false)

  useEffect(() => {
    montado.current = true
    return () => { montado.current = false }
  }, [])

  const baixar = useCallback(async (id, versao) => {
    if (!id || ocupado.current) return
    ocupado.current = true
    setErro(null)
    setGerando(0)
    const inicio = Date.now()
    const relogio = setInterval(() => setGerando(Math.floor((Date.now() - inicio) / 1000)), 1000)
    try {
      for (;;) {
        const r = await prepararPdf(id, versao)
        if (!montado.current) return
        if (r.pronto) {
          baixarArquivo(enderecoPdf(id, r.versao))
          return
        }
        if (Date.now() - inicio > LIMITE_MS) {
          throw new Error('O serviço de PDF está demorando mais que o normal. Tente de novo em alguns minutos.')
        }
        await new Promise(resolve => { setTimeout(resolve, INTERVALO_MS) })
      }
    } catch (e) {
      if (montado.current) setErro(e.message || 'Não foi possível gerar o PDF.')
    } finally {
      clearInterval(relogio)
      ocupado.current = false
      if (montado.current) setGerando(null)
    }
  }, [])

  return {
    baixar, gerando, erro, limparErro: useCallback(() => setErro(null), []), ligando: gerando !== null && gerando >= 15,
  }
}

// Texto do botão enquanto gera.
export function rotuloGerandoPdf(segundos) {
  return segundos >= 5 ? `Gerando PDF… ${segundos} s` : 'Gerando PDF…'
}

export const AVISO_LIGANDO_PDF = 'O serviço de PDF estava desligado e está ligando: a primeira vez pode levar até 2 min. '
  + 'O download começa sozinho.'
