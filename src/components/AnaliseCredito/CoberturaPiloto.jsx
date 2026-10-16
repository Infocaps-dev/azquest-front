import { Tag } from '@carbon/react'
import { EVIDENCIA } from './vocabulario'

// Cobertura do Piloto, item 3.6: painel pequeno e honesto, no rodapé do resumo.
//
// Mostra a contagem por tipo de evidência, o percentual com evidência e o que
// falta revisar. Duas decisões, as duas registradas no DIAGNOSTICO.md:
//
// 1. O número é calculado do roteiro, não fixado. A seção 3.6 do handoff diz
//    "15 fonte, 21 parcial, 6 atualizada, 17 não localizado", e nem a planilha
//    nem o HTML de referência sustentam esses quatro números.
// 2. Itens e referências aparecem lado a lado. A planilha é uma lista de
//    referências: são 93 referências de 54 itens. Mostrar só um dos dois
//    números faria a conta não fechar com a planilha, qualquer que fosse o
//    escolhido.

const ORDEM = ['fonte', 'parcial', 'atualizada', 'nao_localizado']

function CoberturaPiloto({ cobertura }) {
  if (!cobertura?.evidencia) return null

  const { evidencia, exatidao, revisao } = cobertura
  const porTipo = evidencia.por_tipo || {}

  return (
    <section className="ana-cobertura" aria-label="Cobertura do Piloto">
      <h2 className="ana-secao__titulo">Cobertura do Piloto</h2>

      <div className="ana-cobertura__barras">
        {ORDEM.map(tipo => {
          const quantidade = porTipo[tipo] || 0
          const fatia = evidencia.total ? (100 * quantidade) / evidencia.total : 0
          return (
            <div key={tipo} className={`ana-cobertura__barra ana-cobertura__barra--${tipo}`}>
              <span className="ana-cobertura__numero">{quantidade}</span>
              <span className="ana-cobertura__rotulo">{EVIDENCIA[tipo].rotulo}</span>
              <span className="ana-cobertura__fatia" style={{ width: `${fatia}%` }} />
            </div>
          )
        })}
      </div>

      <div className="ana-cobertura__linha">
        <strong>{evidencia.com_evidencia}</strong> de <strong>{evidencia.total}</strong> itens
        com evidência ({evidencia.percentual_com_evidencia}%)
        {evidencia.referencias ? (
          <>, sustentados por <strong>{evidencia.referencias}</strong> referências</>
        ) : null}
      </div>

      {exatidao && (
        <div className="ana-cobertura__linha">
          Exatidão contra o gabarito: <strong>{exatidao.percentual}%</strong>
          {' '}({exatidao.corretos} de {exatidao.conferidos})
          {exatidao.divergentes > 0 && (
            <Tag type="red" size="sm">{exatidao.divergentes} divergente(s)</Tag>
          )}
        </div>
      )}

      {revisao && (
        <div className="ana-cobertura__linha">
          Revisão: {revisao.aprovado} aprovados, {revisao.ajustado} ajustados,
          {' '}{revisao.rejeitado} rejeitados, <strong>{revisao.pendente} pendentes</strong>
        </div>
      )}

      <p className="ana-cobertura__nota">
        As contagens vêm do roteiro do Piloto, não de um número fixado na tela.
        A planilha de fontes lista referências, e um item sustentado por vários
        documentos ocupa várias linhas dela.
      </p>
    </section>
  )
}

export default CoberturaPiloto
