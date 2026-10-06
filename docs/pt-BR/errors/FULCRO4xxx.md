# FULCRO4xxx — `@fulcro/reflect`

🇺🇸 English: [Read this documentation in English](../../errors/FULCRO4xxx.md)

Os erros de [reflexão](../reflect.md). Voltar para
[todos os códigos](../errors.md).

A maioria destes tem uma causa em comum: um utilitário que responde a partir de
um tipo chegou ao runtime sem que o transformer tivesse respondido antes. Um
tipo só existe em tempo de compilação, então em runtime não sobra nada para
ler, e o utilitário recusa em vez de adivinhar. A correção é a mesma para todos
— configurar o transformer, como [Reflexão](../reflect.md) descreve — e cada
seção abaixo diz o que mais pode causá-lo.

## FULCRO4001

```text
Error: FULCRO4001: keysOf<T>() was not resolved at compile time. …
```

Detalhes:

```text
{ operation: string }
```

O transformer não respondeu `keysOf<T>()`. Além de um transformer que não
rodou, `T` pode não ter chaves para ler: um primitivo, uma união, ou um
parâmetro genérico que ainda não foi substituído.

## FULCRO4002

```text
Error: FULCRO4002: is<T>() was not resolved at compile time. …
```

Detalhes:

```text
{ operation: string }
```

O transformer não respondeu `is<T>()` ou `as<T>()` — a mensagem diz qual. Além
de um transformer que não rodou, `T` pode não ter nada que possa ser verificado
em runtime: uma index signature, ou um parâmetro genérico que ainda não foi
substituído.

Passe um teste seu como segundo argumento quando o tipo não puder ser lido.

## FULCRO4003

```text
Error: FULCRO4003: defaultOf<T>() resolves a type, which only exists at compile time. …
```

Detalhes:

```text
{ operation: string }
```

`defaultOf<T>()` chegou ao runtime. Ele não tem forma nenhuma em runtime: a
chamada é sempre substituída pelo valor que ela descreve, e só o transformer
consegue fazer isso.

## FULCRO4004

```text
Error: FULCRO4004: typeOf<T>() was not resolved at compile time. …
```

Detalhes:

```text
{ operation: string }
```

A forma de `typeOf` com argumento de tipo chegou ao runtime sem resposta. A
forma que recebe um valor, `typeOf(value)`, não precisa do transformer e
funciona como está.

## FULCRO4005

```text
Error: FULCRO4005: pathsOf<T>() was not resolved at compile time. …
```

Detalhes:

```text
{ operation: string }
```

O transformer não respondeu `pathsOf<T>()`. Além de um transformer que não
rodou, `T` pode não ter caminhos para percorrer: um primitivo, ou um parâmetro
genérico que ainda não foi substituído.

## FULCRO4006

```text
TypeError: FULCRO4006: as<Order>() refused a value of type string.
```

Detalhes:

```text
{ operation: string; named: string; received: string }
```

`as<T>()` recebeu um valor que não é um `T`, e não conseguiu dizer mais do que
o tipo do valor — o valor inteiro tem a forma errada.

Use `is<T>()` para ramificar a partir da resposta em vez de parar.

## FULCRO4007

```text
TypeError: FULCRO4007: as<Order>() refused a value: customer.email: expected string, got number
```

Detalhes:

```text
{ operation: string; named: string; where: string }
```

`as<T>()` recebeu um valor que não é um `T`, e a mensagem diz o primeiro lugar
onde ele difere.

## FULCRO4008

```text
Error: FULCRO4008: nameOf<T>() names a type, which only exists at compile time. …
```

Detalhes:

```text
{ operation: string }
```

A forma de `nameOf` com argumento de tipo chegou ao runtime. As formas que
recebem um valor ou um acessor, `nameOf(value)` e `nameOf(() => order.total)`,
não precisam do transformer.

## FULCRO4009

```text
Error: FULCRO4009: sizeOf<T>() reads the layout a type declares, which only exists at compile time. …
```

Detalhes:

```text
{ operation: string; call: string }
```

`sizeOf<T>()`, `alignOf<T>()`, `offsetOf<T>(field)` ou `layoutOf<T>()`
chegou ao runtime sem resposta. Além de um transformer que não rodou, `T` pode
não ser um tipo concreto: um parâmetro genérico não tem layout até ser
substituído, e uma união de tipos com layouts diferentes não tem um layout
único. `offsetOf` também fica sem resposta quando o campo não é escrito como
uma string literal, por exemplo uma variável guardando o nome.

## FULCRO4010

```text
FULCRO4010: constantOf(…) cannot be evaluated at compile time: 'counter' is declared with let or var, so it can change. …
```

Detalhes:

```text
{ operation: string; call: string; reason: string }
```

Um erro de compilação, na chamada. O transformer só avalia `constantOf` quando
consegue provar que a função é constante: todo nome que ela lê de fora de si é
um `const`, uma função, ou um dos built-ins cuja resposta depende só dos
argumentos. A mensagem diz o primeiro nome que não é, e por quê: um `let`, um
parâmetro de uma função que a envolve, uma classe, `Date`, ou um valor
declarado só num `.d.ts` — o que inclui tudo o que vem de outro pacote, cujo
código-fonte o compilador nunca vê.

Faça do que a função lê um `const` no seu próprio código, ou calcule o valor em
runtime, sem `constantOf`.

## FULCRO4011

```text
TypeError: FULCRO4011: constantOf(…) produced an instance of Map, which cannot be written as a literal. …
```

Detalhes:

```text
{ operation: string; call: string; received: string }
```

A função passada a `constantOf` devolveu algo que um literal não consegue
escrever: uma função, um símbolo, uma instância de classe, um array com buracos
ou com propriedades a mais, um objeto com getter ou com chaves símbolo, ou um
objeto alcançado duas vezes — compartilhado, ou um ciclo. Lançado em tempo de
compilação como erro de compilação, e em runtime pela mesma regra, para que uma
chamada responda igual com e sem o transformer.

Devolva dados simples: números, strings, booleanos, bigints, `null`,
`undefined`, e arrays e objetos simples deles.

## FULCRO4012

```text
FULCRO4012: constantOf(…) threw while it was evaluated at compile time: refused on purpose
```

Detalhes:

```text
{ operation: string; call: string; thrown: string }
```

Um erro de compilação: a função passada a `constantOf` lançou enquanto o
transformer a executava. A mensagem depois dos dois-pontos é o que ela lançou.
`Math.random` é removido do contexto em que ela roda, então chamá-lo cai aqui.

## FULCRO4013

```text
FULCRO4013: constantOf(…) did not finish within 5000 ms at compile time.
```

Detalhes:

```text
{ operation: string; call: string; milliseconds: number }
```

Um erro de compilação: a função passada a `constantOf` passou do limite e foi
interrompida, em vez de deixar o build travado.

## FULCRO4014

```text
TypeError: FULCRO4014: constantOf: expected a function, received number.
```

Detalhes:

```text
{ operation: string; received: string }
```

`constantOf` recebeu algo que não é uma função, em runtime. O transformer
recusa a mesma chamada em tempo de compilação com FULCRO4010.
