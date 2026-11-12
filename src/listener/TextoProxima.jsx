import { quandoFalado } from '../store.jsx'

/** "Aguarde a próxima pergunta, que será amanhã, às 9h30." (dia e horário em destaque) */
export function TextoProxima({ rodada }) {
  return (
    <>
      Aguarde a próxima pergunta, que será <b>{quandoFalado(rodada)}</b>.
    </>
  )
}
