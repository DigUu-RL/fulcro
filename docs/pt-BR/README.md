# Documentação

🇺🇸 English: [Read this documentation in English](../README.md)

Guias de uso dos pacotes `@fulcro`. Cada um foi escrito para ser lido sozinho —
comando de instalação, exemplos reais e os cenários para os quais o recurso
existe.

Os READMEs dos pacotes são a versão curta; é aqui que estão os detalhes.

## Comece aqui

Duas coisas a saber antes de escolher um guia, porque são elas a razão de ser da
biblioteca.

**Consultar, não fazer laços.** [Sequências](./sequences.md) é o que a maioria
das pessoas quer, e o resto se apoia no vocabulário dele — a sequência
assíncrona mantém todo nome que a síncrona usa.

**Verificar, a partir dos seus próprios tipos.** Com o plugin do compilador
configurado, o tipo que você já escreveu vira a verificação em runtime:

```ts
const order = as<Order>(await response.json()); // lança, dizendo qual campo está errado
const orders = SequenceCollection.from(rows).cast<Order>(); // sobre muitos
```

`response.json()` devolve `any`. Essa linha é o último lugar em que os dados não
foram verificados, e não há schema para manter em sincronia com o tipo, porque o
schema _é_ o tipo. Veja [Reflexão](./reflect.md) para um valor só e
[Sequências](./sequences.md#oftype-e-cast--a-mesma-pergunta-duas-respostas) para
uma coleção.

## Guias

| Guia                                             | Cobre                                                                                                                            | Pacote                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| [Sequências](./sequences.md)                     | Consultas sobre arrays, sets, maps e generators; validação por tipo                                                              | `@fulcro/collections`       |
| [Sequências assíncronas](./async-sequences.md)   | O mesmo, sobre dados que chegam com o tempo                                                                                      | `@fulcro/collections/async` |
| [Concorrência limitada](./concurrency.md)        | Rodar vários elementos ao mesmo tempo, para trabalho que espera                                                                  | `@fulcro/collections/async` |
| [Tasks estruturadas](./tasks.md)                 | Tasks que começam e terminam juntas, com cancelamento, para trabalho que espera                                                  | `@fulcro/parallel`          |
| [Paralelismo com workers](./parallelism.md)      | Trabalho limitado por CPU espalhado por threads, no browser e no Node                                                            | `@fulcro/parallel`          |
| [Reflexão](./reflect.md)                         | `nameOf`, `typeOf`, `defaultOf`, `is`, `as`, `constantOf` e o transformer                                                        | `@fulcro/reflect`           |
| [Fluxo de controle como valores](./functions.md) | `switchFor`, `tryCatch`, `Result`, `Option` e `equals`                                                                           | `@fulcro/functions`         |
| [Tipos numéricos](./types.md)                    | Inteiros de largura fixa, floats, `BigInteger`, `Decimal`, structs, matrizes, vetores, frações, números complexos, quatérnios    | `@fulcro/types`             |
| [Memória](./memory.md)                           | `Storage<T>` sobre memória gerenciada ou bytes, o `Allocator` de onde vêm os bytes, views e ponteiros para dentro deles, e posse | `@fulcro/memory`            |
| [Códigos de erro](./errors.md)                   | O que cada código `FULCRO` quer dizer, e o que escrever no lugar                                                                 | todos os pacotes            |

## Qual ferramenta para qual problema

| Você tem                                                      | Use                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| Um array ou um `Set` para consultar                           | [Sequências](./sequences.md)                          |
| Registros chegando de um cursor, um stream, uma API           | [Sequências assíncronas](./async-sequences.md)        |
| Cem requisições a fazer, e elas são lentas                    | [Concorrência limitada](./concurrency.md)             |
| Várias requisições que dão certo ou falham juntas             | [Tasks estruturadas](./tasks.md)                      |
| Cem arquivos para fazer parsing, e a CPU é o limite           | [Paralelismo](./parallelism.md)                       |
| **Um payload em que você não confia, e um tipo para ele**     | [`as`](./reflect.md)                                  |
| Um payload em que você prefere ramificar a lançar             | [`is`](./reflect.md)                                  |
| Um feed inteiro para verificar à medida que chega             | [`cast`](./async-sequences.md)                        |
| Um array misto para estreitar para um tipo só                 | [`ofType`](./sequences.md)                            |
| Os dez melhores de cem mil                                    | [`topBy`](./sequences.md)                             |
| Uma projeção que também é o filtro                            | [`choose`](./sequences.md)                            |
| Uma string que tem de bater com o nome de uma propriedade     | [`nameOf`](./reflect.md)                              |
| Um valor vazio para um tipo, que acompanha o tipo             | [`defaultOf`](./reflect.md)                           |
| Um `switch` que precisa quebrar quando um enum cresce         | [`switchFor`](./functions.md)                         |
| Uma falha que você prefere ter como valor                     | [`tryCatch`](./functions.md)                          |
| Um valor que pode faltar, tratado de forma exaustiva          | [`Option`](./functions.md#option)                     |
| Dois valores para comparar pelo que guardam                   | [`equals`](./functions.md#equals)                     |
| Dinheiro, ou qualquer número decimal por natureza             | [`Decimal`](./types.md)                               |
| Um inteiro que precisa ficar em 8, 16 ou 32 bits              | [`SignedInteger`](./types.md)                         |
| Um produto de matrizes cujas formas precisam bater            | [`Matrix`](./types.md#matemática)                     |
| Uma tabela de consulta calculada uma vez, não a cada execução | [`constantOf`](./reflect.md)                          |
| Um milhão de structs, como bytes em vez de objetos            | [`createFixedBufferStorage`](./memory.md)             |
| Memória de rascunho liberada de uma vez, a cada quadro        | [`createStackAllocator`](./memory.md#alocadores)      |
| Parte de um storage, repassada sem cópia                      | [`asView`](./memory.md#views-ponteiros-e-referências) |

**`is` ou `as`?** Os dois verificam do mesmo jeito. `is` é um type guard, para
quando uma falha deve ramificar o programa; `as` devolve o valor ou lança, para
quando ela deve pará-lo. **`ofType` ou `cast`?** A mesma pergunta sobre uma
coleção: `ofType` pula o que não se encaixa, `cast` recusa ali.

**Concorrência ou paralelismo?** Se o trabalho está _esperando_ — rede, disco,
banco — use concorrência. Se está _calculando_ — parsing, hashing,
redimensionamento — use paralelismo. Threads não fazem nada pela espera, e
concorrência não faz nada pelo cálculo.

## Para quem contribui

Não são guias. Registram decisões e padrões, para quem está mudando o código em
vez de usá-lo. Ficam em inglês: são os padrões do próprio repositório.

| Nota                                                             | Cobre                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [Padrão de testes](../testing.md)                                | As duas suítes que todo recurso carrega, e por que medir o tempo é a asserção errada |
| [Async, concorrência e paralelismo](../async-and-parallelism.md) | Por que os três são diferentes, e a forma que cada um assume                         |

## O que vai onde

- **README do pacote** — o que o pacote é, o bastante para decidir se você o
  quer, e o exemplo útil mais curto.
- **Um guia aqui** — como usar de fato. Cenários, comandos de terminal, exemplos
  completos, os modos de falha que vale conhecer antes de encontrá-los.
- **Uma nota de design aqui** — por que é construído do jeito que é. Leia antes
  de mudar algo que parece estranho; ela provavelmente diz por quê.
- **JSDoc no código** — o contrato de uma função ou de um tipo, e o raciocínio
  que só faz sentido ao lado do código.
