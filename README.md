# Pergunta da Hora — Quiz interativo para rádio

Quiz ao vivo para os ouvintes de uma rádio FM: o locutor anuncia a pergunta no ar, o ouvinte
responde pelo celular, acumula pontos e concorre a prêmios oferecidos por patrocinadores.

## O que tem
- **App do Ouvinte** (moldura de celular no desktop, tela cheia no celular): login, rodada no ar, próxima rodada,
  prêmio da semana, ranking semanal, grade do dia e "Relatar problema".
- **Fluxo da rodada:** anúncio do patrocinador (15 s, pausa se o ouvinte sair da tela) → pergunta com
  cronômetro → anúncio de liberação do gabarito (30 s) → resultado com explicação.
- **Pontuação:** quem acerta ganha o valor cheio da rodada (valores quebrados, ex.: 53,75, para evitar empates).
  Cada pergunta tem um **tempo limite** definido pelo admin, medido **no servidor** — resposta fora do tempo vale 0
  e o gabarito nunca vai para o celular antes da resposta.
- **Painel Admin** (`/#admin`): aba **Ao vivo** (soltar/encerrar a pergunta e placar em tempo real), cadastro de
  rodadas, patrocinadores (com logo) e prêmios, ranking, feedback da equipe e **Modo apresentação** (anúncios de 5 s).

Backend: **Supabase** (PostgreSQL + Auth + Realtime + Storage). Como configurar: [LEIA-ME-SUPABASE.md](LEIA-ME-SUPABASE.md).
Banco de dados e regras de segurança: `supabase/migrations/`. Nome e frequência da rádio, formas de login e
durações dos anúncios: `src/config.js`.

## Rodar localmente
```bash
npm install
npm run dev
```

## Publicar no Netlify
O `netlify.toml` já está configurado (build `npm run build`, pasta `dist`).
No Netlify: **Add new site → Import from Git →** escolha este repositório e a branch desejada → **Deploy**.
