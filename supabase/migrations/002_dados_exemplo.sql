-- =====================================================================
-- Pergunta da Hora — dados de exemplo para a equipe testar (opcional)
-- Rode depois do 001_esquema.sql. Tudo pode ser editado depois pelo Painel Admin.
-- =====================================================================

with novas as (
  insert into public.rodadas (horario, categoria, titulo, descricao, nivel, pontos, tempo_resposta) values
    ('10:30', 'História da Rádio', 'Clássicos da Música & Cultura Regional', 'O locutor acabou de anunciar na 107.3 FM. Participe e acumule pontos para os prêmios da semana!', 'Médio', 53.75, 15),
    ('11:00', 'Conhecimentos Gerais', 'Desafio Nível Extremo', 'A pergunta mais difícil da manhã. Vale o dobro de pontos!', 'Extremo', 108.45, 12),
    ('11:30', 'Música Brasileira', 'Hora da MPB', 'Teste seus conhecimentos sobre os grandes nomes da música brasileira.', 'Fácil', 32.50, 15),
    ('12:00', 'Esporte', 'Bola em Jogo', 'Pergunta especial do programa esportivo do meio-dia.', 'Médio', 54.20, 15),
    ('12:30', 'Cultura Regional', 'Sabores do Interior', 'Você conhece a culinária da nossa região?', 'Fácil', 30.80, 15),
    ('13:00', 'Ciências', 'Curiosidades da Ciência', 'Pergunta difícil para fechar a rodada da manhã.', 'Difícil', 79.90, 12)
  returning id, horario
)
insert into public.rodadas_conteudo (rodada_id, pergunta, alternativas, correta, explicacao)
select novas.id, c.pergunta, c.alternativas, c.correta, c.explicacao
from novas
join (values
  ('10:30', 'Qual foi o primeiro grande festival transmitido ao vivo pela Difusora FM nos anos 90?',
    array['Festival Som das Águas', 'Rock in Rádio 107', 'Festival Regional da Canção', 'Circuito Musical Mogiana'], 2,
    'O Festival Regional da Canção foi a primeira grande transmissão ao vivo da rádio, em 1994.'),
  ('11:00', 'Qual rio dá nome à região conhecida como "Mogiana", no interior paulista?',
    array['Rio Pardo', 'Rio Mogi Guaçu', 'Rio Tietê', 'Rio Grande'], 1,
    'O nome vem do Rio Mogi Guaçu, que batizou também a antiga Companhia Mogiana de Estradas de Ferro.'),
  ('11:30', 'Quem compôs a canção "Garota de Ipanema" junto com Vinicius de Moraes?',
    array['Chico Buarque', 'Tom Jobim', 'Caetano Veloso', 'João Gilberto'], 1,
    'Tom Jobim e Vinicius de Moraes compuseram "Garota de Ipanema" em 1962.'),
  ('12:00', 'Em que ano o Brasil conquistou sua primeira Copa do Mundo de futebol?',
    array['1950', '1958', '1962', '1970'], 1,
    'O Brasil foi campeão pela primeira vez em 1958, na Suécia.'),
  ('12:30', 'Qual destes pratos é típico da culinária caipira paulista?',
    array['Acarajé', 'Virado à paulista', 'Tacacá', 'Barreado'], 1,
    'O virado à paulista, com feijão, couve, ovo e bisteca, é símbolo da cozinha caipira.'),
  ('13:00', 'Em que faixa de frequência opera o rádio FM no Brasil?',
    array['535 a 1605 kHz', '76 a 108 MHz', '2,4 a 2,5 GHz', '30 a 300 kHz'], 1,
    'O FM brasileiro vai de 76 a 108 MHz, incluindo a faixa estendida que recebeu as rádios migradas do AM.')
) as c (horario, pergunta, alternativas, correta, explicacao) on c.horario = novas.horario;

insert into public.patrocinadores (nome, slogan, descricao, icone, cor) values
  ('Supermercado Central', 'Festival de Carnes Nobres & Bebidas', 'As melhores ofertas de Casa Branca e região para o seu final de semana.', 'ShoppingCart', 'amber'),
  ('Auto Posto Aliança', 'Combustível de Confiança e Qualidade', 'Gasolina aditivada, troca de óleo e conveniência 24h em Casa Branca.', 'Fuel', 'rose'),
  ('EletroShow Regional', 'Tecnologia com o Melhor Preço', 'TVs, celulares e eletrodomésticos em até 12x sem juros.', 'Tv', 'sky'),
  ('Farmácia Saúde Já', 'Cuidando de Você Todos os Dias', 'Entrega grátis em toda a cidade e descontos para clientes cadastrados.', 'HeartPulse', 'emerald');

insert into public.premios (colocacao, titulo, oferecido_por) values
  (1, 'Smart TV 50" 4K UHD', 'EletroShow Regional'),
  (2, 'Vale-compras de R$ 500', 'Supermercado Central'),
  (3, 'Tanque cheio + troca de óleo', 'Auto Posto Aliança');
