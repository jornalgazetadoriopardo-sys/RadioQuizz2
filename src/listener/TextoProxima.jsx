import { quandoFalado } from '../store.jsx'

/** "Aguarde a próxima pergunta, que será amanhã, às 10h30, sobre Música." (horário e tema em destaque) */
export function TextoProxima({ rodada }) {
  const tema = rodada.categoria?.trim()
  return (
    <>
      Aguarde a próxima pergunta, que será <b>{quandoFalado(rodada)}</b>
      {tema && (
        <>
          , sobre <b>{tema}</b>
        </>
      )}
      .
    </>
  )
}
