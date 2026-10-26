import { useEffect, useState } from 'react'
import { BatteryCharging, LayoutGrid, Monitor, Smartphone, Wifi } from 'lucide-react'
import { RADIO } from './config.js'
import { agoraServidor, fmtHora } from './relogio.js'
import ListenerApp from './listener/ListenerApp.jsx'
import Admin from './admin/Admin.jsx'

const visaoDaUrl = () => (window.location.hash === '#admin' ? 'admin' : 'ouvinte')

export default function App() {
  const [visao, setVisao] = useState(visaoDaUrl)

  useEffect(() => {
    const onHash = () => setVisao(visaoDaUrl())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const trocar = (v) => {
    window.location.hash = v === 'admin' ? 'admin' : ''
    setVisao(v)
  }

  return (
    <div className="flex min-h-full flex-col">
      <BarraTopo visao={visao} trocar={trocar} />
      {visao === 'admin' ? (
        <Admin />
      ) : (
        <main className="flex flex-1 justify-center sm:py-8">
          <Celular>
            <ListenerApp />
          </Celular>
        </main>
      )}
    </div>
  )
}

function BarraTopo({ visao, trocar }) {
  const telaCheia = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen?.()
  }

  return (
    // No celular o ouvinte não vê esta barra (só atrapalharia); o painel abre pelo endereço .../#admin
    <header className={`sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur ${visao === 'ouvinte' ? 'hidden sm:block' : ''}`}>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:py-3">
        <img src="/logo-difusora.png" alt={`${RADIO.nome} ${RADIO.frequencia}`} className="h-9 w-auto shrink-0 sm:h-12" />
        <div className="hidden min-w-0 border-l border-slate-200 pl-3 sm:block">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-base text-marca-800">Pergunta da Hora</h1>
            <span className="hidden items-center gap-1 rounded-full border border-marca-200 bg-marca-50 px-2 py-0.5 text-[10px] font-bold text-marca-700 sm:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> NO AR
            </span>
          </div>
          <p className="hidden text-xs text-slate-500 sm:block">{RADIO.slogan}</p>
        </div>

        <nav className="mx-auto flex rounded-xl bg-slate-100 p-1 ring-1 ring-slate-200">
          {[
            { id: 'ouvinte', nome: 'App do Ouvinte', curto: 'Ouvinte', icone: Smartphone },
            { id: 'admin', nome: 'Painel Admin', curto: 'Admin', icone: LayoutGrid },
          ].map(({ id, nome, curto, icone: I }) => (
            <button
              key={id}
              onClick={() => trocar(id)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:px-3.5 sm:text-sm ${
                visao === id ? 'bg-white text-marca-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <I size={15} />
              <span className="sm:hidden">{curto}</span>
              <span className="hidden sm:inline">{nome}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button onClick={telaCheia} className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 md:flex">
            <Monitor size={15} /> Modo Tela Cheia
          </button>
        </div>
      </div>
    </header>
  )
}

function Celular({ children }) {
  const [hora, setHora] = useState(agoraServidor)
  useEffect(() => {
    const id = setInterval(() => setHora(agoraServidor()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    // No celular de verdade ocupa a tela toda; do tablet para cima aparece dentro da moldura.
    <div className="flex w-full flex-col bg-slate-50 sm:h-[800px] sm:w-[400px] sm:overflow-hidden sm:rounded-[3rem] sm:border-[10px] sm:border-slate-800 sm:shadow-2xl sm:shadow-slate-900/20">
      <div className="hidden items-center justify-between bg-marca-900 px-6 py-2 text-[11px] font-bold text-white sm:flex">
        <span>{fmtHora(hora, false)}</span>
        <span className="flex items-center gap-2">
          <span className="text-ouro-300">{RADIO.frequencia} FM</span>
          <Wifi size={13} />
          <BatteryCharging size={14} className="text-emerald-400" />
        </span>
      </div>
      <div className="altura-tela relative bg-slate-50 sm:h-auto sm:min-h-0 sm:flex-1">{children}</div>
    </div>
  )
}
