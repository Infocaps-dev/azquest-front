// Rótulo de botão que troca de texto sem mudar a largura do botão (30/10/2026): "Baixar PDF" → "Gerando PDF… 12 s",
// "Entrar" → "Entrando…". Todos os textos possíveis ficam na mesma célula, um por cima do outro, e só o atual aparece:
// o botão fica sempre com a largura do mais longo, e nada ao lado se mexe. Algarismos com largura fixa, para um
// contador ("12 s" → "13 s") também não mexer.
export default function RotuloFixo({ atual, opcoes = [] }) {
  const todas = opcoes.includes(atual) ? opcoes : [...opcoes, atual]
  return (
    <span className="rotulo-fixo">
      {todas.map(texto => (
        <span key={texto} className={texto === atual ? undefined : 'rotulo-fixo__reserva'}
          aria-hidden={texto === atual ? undefined : true}>
          {texto}
        </span>
      ))}
    </span>
  )
}
