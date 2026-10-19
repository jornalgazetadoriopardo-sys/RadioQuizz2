# Configurar o Supabase (uma vez só)

Projeto: `sxhwkkplxaotpxtgbzqe` — painel em https://supabase.com/dashboard/project/sxhwkkplxaotpxtgbzqe

## 1. Criar o banco de dados
1. No menu lateral, abra **SQL Editor** → **New query**.
2. Cole todo o conteúdo de [`supabase/migrations/001_esquema.sql`](supabase/migrations/001_esquema.sql) e clique em **Run**.
   Deve aparecer "Success. No rows returned".
3. Abra outra **New query**, cole [`supabase/migrations/002_dados_exemplo.sql`](supabase/migrations/002_dados_exemplo.sql) e clique em **Run**
   (cria 6 rodadas, 4 patrocinadores e 3 prêmios de exemplo — tudo editável depois pelo Painel Admin).

## 2. Ligar as formas de login
Em **Authentication → Sign In / Providers**:
- **Allow anonymous sign-ins**: ligue. É o botão "Entrar só com o nome (teste)" — o jeito mais rápido para a equipe testar.
- **Email**: já vem ligado. Atenção: o envio de e-mail padrão do Supabase só entrega para membros da equipe
  do projeto no Supabase e tem limite de poucos e-mails por hora. Para liberar o login por e-mail para qualquer pessoa,
  configure um SMTP próprio em **Authentication → Emails → SMTP Settings** (ex.: Resend, que tem plano gratuito).
- (Opcional) Para o login também aceitar um **código de 6 dígitos**, em **Authentication → Emails → Magic Link**
  acrescente `{{ .Token }}` no texto do e-mail.

Em **Authentication → URL Configuration**:
- **Site URL**: o endereço do Netlify (ex.: `https://quiz-difusora.netlify.app`).
- **Redirect URLs**: adicione o mesmo endereço e também `http://localhost:5173` (para desenvolvimento).

## 3. Tornar alguém administrador
1. A pessoa entra uma vez no app com **e-mail** (o "entrar só com o nome" não serve para admin).
2. No **SQL Editor**, rode trocando o e-mail:
   ```sql
   update public.perfis set admin = true
   where id = (select id from auth.users where email = 'email.do.admin@exemplo.com');
   ```
3. A pessoa recarrega a página e o **Painel Admin** fica liberado.

## Como a equipe testa
1. A produção abre o **Painel Admin → Ao vivo** no computador.
2. Os testadores abrem o link no celular e entram.
3. A produção clica em **No ar** numa rodada: a pergunta aparece na hora em todos os celulares.
4. O placar ao vivo mostra quantos abriram, responderam e acertaram.
5. Problemas encontrados: botão **Relatar problema** no app → aparecem na aba **Feedback** do painel.

Dica: ligue o **Modo apresentação** no painel para os anúncios durarem 5 s em vez de 15 s e 30 s.

## Segurança
- A chave `sb_publishable_...` que está em `src/config.js` é pública por natureza (vai no navegador).
- **Nunca** coloque no código nem compartilhe a chave **secret** / `service_role`.
- Quem protege os dados são as regras do banco (Row Level Security): o ouvinte não vê o gabarito,
  não consegue alterar pontos e só lê as próprias respostas. A resposta é conferida e o tempo é medido no servidor.
