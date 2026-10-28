import { useEffect, useState } from 'react'
import { Loading } from '@carbon/react'
import './Carregando.scss'

// Carregamento de uma área (28/10/2026, padrão revisto com o Kimi): página, painel, janela, relatório, documento ou
// conversa abrindo. Spinner de 40 px com o texto embaixo, no centro da área que vai receber o conteúdo. Só aparece
// depois de 200 ms (o que carrega antes disso não pisca) e entra com fade. `sobreposto`: por cima do conteúdo que já
// está na área (uma janela ou painel), com fundo translúcido só nela; `pagina`: o mesmo sobre a aba inteira (trocando
// de relatório), abaixo do cabeçalho. `telaCheia`: a verificação de sessão, antes de existir qualquer tela.
// `alturaMinima`: a altura do que vai aparecer (um gráfico, por exemplo), para a tela não pular quando ele chegar.
//
// Fora daqui: ação em botão (o indicador fica no próprio botão), etapas de um andamento (geração, coleta, resposta do
// chat) e item de lista sendo aberto (barra fina na base do item, .barra-indeterminada).
export default function Carregando({ descricao, detalhe, sobreposto = false, pagina = false, telaCheia = false,
  compacto = false, alturaMinima, atraso = 200, className = '' }) {
  const [visivel, setVisivel] = useState(atraso <= 0)
  useEffect(() => {
    if (atraso <= 0) return undefined
    const relogio = setTimeout(() => setVisivel(true), atraso)
    return () => clearTimeout(relogio)
  }, [atraso])

  const classes = ['carregando', (sobreposto || pagina) && 'carregando--sobreposto', pagina && 'carregando--pagina',
    telaCheia && 'carregando--tela-cheia',
    compacto && 'carregando--compacto', visivel && 'carregando--visivel', className].filter(Boolean).join(' ')
  return (
    <div className={classes} role="status" aria-live="polite" aria-busy="true"
      style={alturaMinima ? { minHeight: alturaMinima } : undefined}>
      <div className="carregando__conteudo">
        <Loading withOverlay={false} small={false} description={descricao || 'Carregando'} className="carregando__spinner" />
        {descricao && <p className="carregando__texto">{descricao}</p>}
        {detalhe && <p className="carregando__detalhe">{detalhe}</p>}
      </div>
    </div>
  )
}
