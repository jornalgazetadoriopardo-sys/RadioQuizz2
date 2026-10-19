import { useEffect, useRef, useState } from 'react'
import { Car, Coffee, Fuel, GraduationCap, Hammer, HeartPulse, Pill, Shirt, ShoppingCart, Store, Tv, Utensils } from 'lucide-react'

const ICONES = { ShoppingCart, Fuel, Tv, HeartPulse, Store, Car, Utensils, Shirt, Hammer, GraduationCap, Pill, Coffee }

export function Icone({ nome, ...props }) {
  const C = ICONES[nome] ?? Store
  return <C {...props} />
}

export const ICONES_PATROCINADOR = Object.keys(ICONES)

export const CORES = {
  amber: { fundo: 'bg-amber-50', texto: 'text-amber-600', titulo: 'text-amber-700' },
  rose: { fundo: 'bg-rose-50', texto: 'text-rose-500', titulo: 'text-rose-600' },
  sky: { fundo: 'bg-sky-50', texto: 'text-sky-600', titulo: 'text-sky-700' },
  emerald: { fundo: 'bg-emerald-50', texto: 'text-emerald-600', titulo: 'text-emerald-700' },
  violet: { fundo: 'bg-violet-50', texto: 'text-violet-600', titulo: 'text-violet-700' },
}

export function Avatar({ nome, tamanho = 'w-10 h-10', destaque = false }) {
  const iniciais = (nome || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
  return (
    <div
      className={`${tamanho} shrink-0 rounded-full grid place-items-center font-bold text-sm ${
        destaque ? 'bg-rose-600 text-white ring-2 ring-rose-200' : 'bg-slate-200 text-slate-600'
      }`}
    >
      {iniciais}
    </div>
  )
}

export function Card({ className = '', children, ...props }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200/80 shadow-sm ${className}`} {...props}>
      {children}
    </div>
  )
}

export function Selo({ cor = 'rose', className = '', children }) {
  const cores = {
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${cores[cor]} ${className}`}>
      {children}
    </span>
  )
}

/**
 * Contagem regressiva em milissegundos. Pausa sozinha quando a aba/tela fica oculta
 * (Page Visibility API) — é o "Não saia desta tela" dos anúncios.
 */
export function useContagem(segundos, aoTerminar, { pausarQuandoOculto = false } = {}) {
  const [restante, setRestante] = useState(segundos * 1000)
  const [oculto, setOculto] = useState(false)
  const terminou = useRef(false)
  const callback = useRef(aoTerminar)
  callback.current = aoTerminar

  useEffect(() => {
    if (!pausarQuandoOculto) return
    const onVis = () => setOculto(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [pausarQuandoOculto])

  useEffect(() => {
    if (oculto) return
    let anterior = performance.now()
    const id = setInterval(() => {
      const agora = performance.now()
      const delta = agora - anterior
      anterior = agora
      setRestante((r) => Math.max(0, r - delta))
    }, 100)
    return () => clearInterval(id)
  }, [oculto])

  useEffect(() => {
    if (restante <= 0 && !terminou.current) {
      terminou.current = true
      callback.current?.()
    }
  }, [restante])

  return { restante, segundos: Math.ceil(restante / 1000), fracao: restante / Math.max(segundos * 1000, 1), oculto }
}
