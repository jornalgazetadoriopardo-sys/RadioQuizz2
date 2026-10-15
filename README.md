# Pergunta da Hora — Quiz interativo para rádio (demo)

Demo de um quiz ao vivo para os ouvintes de uma rádio FM: o locutor anuncia a pergunta no ar, o ouvinte
responde pelo celular, acumula pontos e concorre a prêmios oferecidos por patrocinadores.

## O que tem no demo
- **App do Ouvinte** (moldura de celular no desktop, tela cheia no celular): rodada atual, próxima rodada,
  prêmio da semana, ranking e grade do dia.
- **Fluxo da rodada:** anúncio do patrocinador (15 s, pausa se o ouvinte sair da tela) → pergunta com
  cronômetro → anúncio de liberação do gabarito (30 s) → resultado com explicação.
- **Pontuação:** quanto mais rápido, mais pontos (de 100% a 50% do valor da rodada).
- **Painel Admin** (`/#admin`): cadastro de rodadas, patrocinadores e prêmios; "Colocar no ar agora";
  ranking; **Modo apresentação** (anúncios de 5 s, útil para demonstrar).

Tudo roda no navegador e fica salvo no `localStorage` — ainda não há servidor nem login real.
Para personalizar nome e frequência da rádio, edite `src/config.js`; os dados de exemplo ficam em `src/data/seed.js`.

## Rodar localmente
```bash
npm install
npm run dev
```

## Publicar no Netlify
O `netlify.toml` já está configurado (build `npm run build`, pasta `dist`).
No Netlify: **Add new site → Import from Git →** escolha este repositório e a branch desejada → **Deploy**.
