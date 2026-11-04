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

export const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-marca-400 focus:ring-4 focus:ring-marca-100'

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
    primario: 'bg-marca-600 text-white hover:bg-marca-700',
    secundario: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    perigo: 'bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50',
    escuro: 'bg-marca-800 text-white hover:bg-marca-900',
  }
  return (
    <button className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition active:scale-[.98] disabled:opacity-40 ${v[variante]} ${className}`} {...props}>
      {children}
    </button>
  )
}


/** Envia uma imagem para o armazenamento dos patrocinadores e devolve o endereço público. */
/** Diminui uma foto grande (máx. 1280 px, JPEG) para carregar rápido no celular. PNG/SVG pequenos ficam como estão. */
export async function reduzirFoto(arquivo, lado = 1280) {
  if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) return arquivo
  const img = await new Promise((ok, falha) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = falha
    i.src = URL.createObjectURL(arquivo)
  }).catch(() => null)
  if (!img) return arquivo
  const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight))
  if (escala === 1 && arquivo.size < 400 * 1024) return arquivo
  const tela = document.createElement('canvas')
  tela.width = Math.round(img.naturalWidth * escala)
  tela.height = Math.round(img.naturalHeight * escala)
  const ctx = tela.getContext('2d')
  ctx.fillStyle = '#ffffff' // PNG transparente vira fundo branco
  ctx.fillRect(0, 0, tela.width, tela.height)
  ctx.drawImage(img, 0, 0, tela.width, tela.height)
  const blob = await new Promise((ok) => tela.toBlob(ok, 'image/jpeg', 0.82))
  if (!blob) return arquivo
  return new File([blob], arquivo.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
}

export async function enviarImagem(arquivo, pasta) {
  if (!arquivo) return null
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(arquivo.type)) throw new Error('Use uma imagem PNG, JPG, WEBP ou SVG.')
  if (arquivo.size > 3 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 3 MB.')
  const caminho = `${pasta}/${Date.now()}-${arquivo.name.replace(/[^\w.-]/g, '_')}`
  const { error } = await supabase.storage.from('patrocinadores').upload(caminho, arquivo, { upsert: true })
  if (error) throw new Error(mensagemDeErro(error))
  return supabase.storage.from('patrocinadores').getPublicUrl(caminho).data.publicUrl
}

/** Envia o vídeo de um anúncio (MP4) e devolve o endereço público. */
export async function enviarVideo(arquivo, pasta) {
  if (!arquivo) return null
  if (!/^video\/(mp4|quicktime)$/.test(arquivo.type)) throw new Error('Use um vídeo MP4 (ou MOV gravado no iPhone).')
  if (arquivo.size > 20 * 1024 * 1024) throw new Error('O vídeo deve ter no máximo 20 MB. Exporte em 720p ou menor.')
  const caminho = `${pasta}/${Date.now()}-${arquivo.name.replace(/[^\w.-]/g, '_')}`
  const { error } = await supabase.storage.from('patrocinadores').upload(caminho, arquivo, { upsert: true, contentType: arquivo.type })
  if (error) throw new Error(mensagemDeErro(error))
  return supabase.storage.from('patrocinadores').getPublicUrl(caminho).data.publicUrl
}
