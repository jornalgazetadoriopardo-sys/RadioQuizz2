import { useCallback, useEffect, useState } from 'react'
import { mensagemDeErro, supabase } from '../supabase.js'

// Peças comuns do Painel Admin (formulários e carga de tabelas).

export function useTabela(consulta, { tempoReal } = {}) {
  const [itens, setItens] = useState(null)
  const [erro, setErro] = useState('')
  const recarregar = useCallback(async () => {
    const { data, error } = await consulta()
    if (error) return setErro(mensagemDeErro(error))
    setItens(data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    recarregar()
    if (!tempoReal) return
    const canal = supabase
      .channel(`admin-${tempoReal}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: tempoReal }, recarregar)
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [recarregar, tempoReal])

  return { itens, erro, recarregar }
}

export function Campo({ rotulo, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{rotulo}</span>
      {children}
    </label>
  )
}

export const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-rose-400 focus:ring-4 focus:ring-rose-100'

export function Texto({ valor, onChange, multilinha, ...props }) {
  return multilinha ? (
    <textarea rows={3} value={valor ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} {...props} />
  ) : (
    <input value={valor ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} {...props} />
  )
}

export function Numero({ valor, onChange, ...props }) {
  return <input type="number" value={valor} onChange={(e) => onChange(Number(e.target.value))} className={inputCls} {...props} />
}

export function Botao({ variante = 'primario', className = '', children, ...props }) {
  const v = {
    primario: 'bg-rose-600 text-white hover:bg-rose-700',
    secundario: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    perigo: 'bg-white text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50',
    escuro: 'bg-slate-900 text-white hover:bg-slate-800',
  }
  return (
    <button className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition active:scale-[.98] disabled:opacity-40 ${v[variante]} ${className}`} {...props}>
      {children}
    </button>
  )
}


/** Envia uma imagem para o armazenamento dos patrocinadores e devolve o endereço público. */
export async function enviarImagem(arquivo, pasta) {
  if (!arquivo) return null
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(arquivo.type)) throw new Error('Use uma imagem PNG, JPG, WEBP ou SVG.')
  if (arquivo.size > 3 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 3 MB.')
  const caminho = `${pasta}/${Date.now()}-${arquivo.name.replace(/[^\w.-]/g, '_')}`
  const { error } = await supabase.storage.from('patrocinadores').upload(caminho, arquivo, { upsert: true })
  if (error) throw new Error(mensagemDeErro(error))
  return supabase.storage.from('patrocinadores').getPublicUrl(caminho).data.publicUrl
}
