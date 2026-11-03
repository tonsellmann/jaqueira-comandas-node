# Jaqueira · comandas

Comandas em tempo real para restaurante, em Node.js. O garçom lança o pedido no celular, a cozinha e o bar recebem cada um a sua parte na hora, e o caixa fecha a conta dividida com os 10%. Não tem nenhuma dependência: servidor HTTP, banco SQLite, tempo real e testes, tudo vem no próprio Node.

**Projeto conceito.** A Jaqueira Cozinha Baiana, de Ilhéus, é fictícia; o cardápio é o mesmo do site dela no portfólio.

- Demonstração: https://luisantoniodev.tech/projetos/jaqueira-comandas/
- Portfólio: https://luisantoniodev.tech

## O problema

Num restaurante cheio, a comanda de papel faz três estragos:

- **O Wi-Fi do salão é ruim, e o pedido duplica.** O garçom aperta "enviar", a tela trava, ele aperta de novo. Sai moqueca em dobro, e a dobra vai para o lixo ou para a conta errada.
- **O principal sai antes da hora.** A mesa pede casquinha de siri e moqueca juntos. A cozinha faz tudo de uma vez, e a moqueca esfria esperando a entrada acabar.
- **A conta não fecha.** Quatro amigos, dois dividem a moqueca, um não bebeu. Calculadora no balcão, centavo sobrando, 10% de quem?

## O que o sistema faz

- **Garçom, no celular.** Mesas livres, abertas e com prato pronto (piscando em amarelo). Monta o pedido por etapa, com observação, de quem é cada item e a opção de segurar principais e sobremesas até ele chamar.
- **Cozinha e bar.** Cada estação vê só o que é dela, na ordem de chegada, com o tempo de cada pedido: verde, amarelo depois do tempo de preparo, vermelho depois de 1,5 vez. Um toque no prato começa; outro marca pronto. O que está segurado aparece embaixo, em "Vem pela frente", para a cozinha se planejar.
- **Caixa.** A conta da mesa com os 10%, inteira, dividida em partes iguais ou por pessoa. No modo por pessoa, cada um paga o seu, o que é da mesa é repartido e os 10% acompanham o consumo de cada um. As partes sempre somam o total, sem um centavo a mais ou a menos. A conta só fecha com tudo entregue.
- **Cancelar o que já está no fogo pede o motivo**, que fica registrado para o fechamento do dia.

## Por que Node.js

- **Tempo real é o centro do problema.** Cada tela fica conectada o tempo todo, esperando o próximo pedido. Com o Node, centenas de conexões abertas cabem num processo só, sem uma thread por tela.
- **Uma linguagem dos dois lados.** As regras do salão (`src/dominio`) são as mesmas no servidor e nas telas. O servidor entrega o próprio TypeScript sem os tipos (`/dominio/*.js`), e cada tela aplica os eventos com a mesma função `aplicar` que o servidor usa. Não existe uma segunda versão da regra para desalinhar.
- **Tudo vem no Node.** `node:http`, `node:sqlite`, `node:test` e o TypeScript sem compilação (o Node retira os tipos ao carregar). Sem dependência, não há o que atualizar toda semana nem pacote de terceiros para virar brecha. O sistema roda no computador do caixa, sem servidor de banco.

### O que ficou de fora

- **PHP com Laravel.** Ótimo para gestão, mas o tempo real pediria um serviço à parte (Reverb ou Pusher) e um segundo processo para cuidar.
- **Firebase.** Daria o tempo real pronto, mas o celular do garçom e a tela da cozinha só conversariam passando pela internet: caiu a internet do restaurante, a cozinha para de receber. Aqui, o servidor fica dentro do restaurante, e basta o Wi-Fi local.
- **WebSocket.** As telas só recebem do servidor e mandam comandos pelo POST comum. Server-Sent Events fazem isso com reconexão automática e retomada pelo `Last-Event-ID`, que vêm no próprio navegador.

## Como funciona

O salão é uma sequência de fatos numerados: mesa aberta, itens pedidos, etapa chamada, preparo iniciado, item pronto, entregue, cancelado, conta fechada. Ninguém altera uma comanda. Cada ação vira um evento, e o estado de qualquer tela é a soma dos eventos na ordem.

```
tela  --POST /api/comandos {id, pedido}-->  Livro.executar
                                            |  já vi esse id? devolve o resultado guardado
                                            |  decidir(salão, pedido) -> fatos ou erro
                                            |  grava fatos + resultado numa transação (SQLite)
tela  <--GET /api/eventos (SSE)--------------  avisa as telas abertas
```

- **Sem pedido em dobro.** Cada comando leva um id criado no celular. Se a resposta se perde no Wi-Fi, o celular tenta de novo com o mesmo id, e o servidor devolve o que respondeu da primeira vez, sem gravar nada. O teste manda o mesmo pedido três vezes ao mesmo tempo e confere um único evento.
- **Fila no celular.** O comando entra numa fila guardada no aparelho e sai em ordem. Sem rede, espera, tentando de novo em intervalos crescentes. A tela mostra "Sem conexão · 2 na fila".
- **Nada se perde na reconexão.** Cada evento sai com o seu número. O navegador reconecta sozinho mandando o último número que viu, e o servidor manda só o que faltou.
- **O id funciona em http.** No restaurante, o celular abre o servidor pelo IP da rede local, sem https, e o `crypto.randomUUID` não existe fora de página segura. O id é gerado com `crypto.getRandomValues`, que existe nos dois casos.

```
src/
  dominio/      cardápio, salão (eventos e estado), comandos, conta e o Livro
  servidor/     HTTP, SSE e o armazenamento em SQLite
public/         as telas do garçom, da cozinha e do bar, e do caixa
tests/          21 testes: regras, conta, livro e o servidor de verdade numa porta local
demo/           a demonstração do portfólio, com o servidor rodando no navegador
```

## Rodar

Precisa de Node 24 ou mais novo, e mais nada. Não há `npm install`.

```bash
npm test
npm start
```

Abra http://localhost:3000/garcom no celular (pelo IP do computador, na mesma rede), http://localhost:3000/cozinha na tela da cozinha e http://localhost:3000/caixa no caixa. O banco fica em `dados/salao.db`.

Para a demonstração estática, como a do portfólio:

```bash
npm run demo
```

## O que falta para um restaurante de verdade

- Um PIN por aparelho: hoje, qualquer um na rede do restaurante abre as telas.
- Impressão do pedido na cozinha, para quem ainda quer o papel.
- Arquivar os eventos de cada dia no fechamento do caixa.
