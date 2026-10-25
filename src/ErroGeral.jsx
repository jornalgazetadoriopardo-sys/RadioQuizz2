import { Component } from 'react'

// Se algum erro inesperado derrubar a tela, mostra um aviso com botão de recarregar (em vez de tela branca).
export default class ErroGeral extends Component {
  state = { erro: null }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-white px-6 text-center">
        <p className="text-xl font-extrabold">Ops, algo deu errado</p>
        <p className="max-w-xs text-sm text-slate-600">Recarregue a página. Se continuar, avise a produção pelo WhatsApp da rádio.</p>
        <p className="max-w-xs break-words text-[11px] text-slate-400">{String(this.state.erro?.message ?? this.state.erro)}</p>
        <button onClick={() => location.reload()} className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white">
          Recarregar
        </button>
      </div>
    )
  }
}
