# Códigos de erro

🇺🇸 English: [Read this documentation in English](../errors.md)

Todo erro lançado por um pacote `@fulcro` carrega um código e os seus detalhes.
O código fica no início da mensagem e no próprio erro; os detalhes são os
valores a partir dos quais a mensagem foi escrita, cada um com o seu nome:

```text
TypeError: FULCRO6021: Vector3.from: missing field 'x'.
```

```ts
import { isFulcroError } from '@fulcro/errors';

try {
	Vector3.from(payload);
} catch (error) {
	if (isFulcroError(error, 'FULCRO6021')) {
		error.details.field; // 'x' — peça de novo
	}
}
```

O código e os detalhes são as partes das quais depender. O texto depois do
código pode ser melhorado em qualquer versão; o código mantém o significado e
nunca é reaproveitado para outra coisa, mesmo depois que o erro que ele nomeava
deixa de existir, e um campo dos seus detalhes mantém o nome.

A classe também não muda. Um erro que era `RangeError` antes de ter código
continua sendo `RangeError`, então as verificações com `instanceof` continuam
funcionando.

## Lendo o que deu errado

`error.details` guarda o que a mensagem diz, como valores e não como texto, então
se recuperar de uma falha nunca exige desmontar uma frase:

```text
RangeError: FULCRO7002: ManagedStorage.get: index 12 is outside a storage of length 10.
```

```ts
error.details; // { operation: 'ManagedStorage.get', index: 12, length: 10 }
```

Os detalhes de todo código têm `operation` — a função que falhou, como você a
chamou. Os outros campos são do próprio código, e a seção de cada código os
lista. Um número continua sendo número; um valor de qualquer outro tipo chega
descrito como texto, para que um erro nunca leve os seus objetos junto para um
log. Os detalhes são congelados.

Três formas de reconhecer um erro desta biblioteca, todas de `@fulcro/errors`:

| Escreva                              | Responde                  | `details` passa a ser                                                   |
| ------------------------------------ | ------------------------- | ----------------------------------------------------------------------- |
| `isFulcroError(error, 'FULCRO7002')` | é este código?            | os campos desse código                                                  |
| `isFulcroError(error)`               | é algum código nosso?     | `operation`, e os campos de cada código depois de comparar `error.code` |
| `error instanceof FulcroError`       | o mesmo, com `instanceof` | o mesmo                                                                 |

`FulcroError` funciona com `instanceof` sem ser uma classe que o erro estende: o
erro continua sendo `RangeError` ou `TypeError`, e as duas verificações valem ao
mesmo tempo. A resposta vem dos códigos registrados, não de um protótipo, então
continua certa mesmo quando duas cópias de `@fulcro/errors` acabam instaladas
lado a lado.

Para dar nome aos detalhes de um código no seu próprio código — um handler, um
mapeamento de erros para respostas — use `DetailsOf`:

```ts
import type { DetailsOf } from '@fulcro/errors';

const describe = (details: DetailsOf<'FULCRO7002'>): string =>
	`asked for ${details.index}, there were ${details.length}`;
```

## De onde vem um código

O primeiro dígito indica o pacote que o lançou:

| Faixa        | Pacote                   | Códigos                              |
| ------------ | ------------------------ | ------------------------------------ |
| `FULCRO1xxx` | `@fulcro/collections`    | [FULCRO1xxx](./errors/FULCRO1xxx.md) |
| `FULCRO2xxx` | `@fulcro/functions`      | [FULCRO2xxx](./errors/FULCRO2xxx.md) |
| `FULCRO3xxx` | `@fulcro/parallel`       | [FULCRO3xxx](./errors/FULCRO3xxx.md) |
| `FULCRO4xxx` | `@fulcro/reflect`        | [FULCRO4xxx](./errors/FULCRO4xxx.md) |
| `FULCRO5xxx` | `@fulcro/transform-core` | [FULCRO5xxx](./errors/FULCRO5xxx.md) |
| `FULCRO6xxx` | `@fulcro/types`          | [FULCRO6xxx](./errors/FULCRO6xxx.md) |
| `FULCRO7xxx` | `@fulcro/memory`         | [FULCRO7xxx](./errors/FULCRO7xxx.md) |

Cada página tem uma seção por código, com link próprio no formato
`FULCRO6xxx.md#fulcro6021`: o que ele significa, o que costuma causá-lo, os
campos dos seus detalhes e o que escrever no lugar.

## Um erro dentro de outro

Alguns erros acontecem um nível abaixo do que você chamou. Converter uma struct
converte cada um dos seus campos, e um campo que recusa o seu valor recusa a
struct inteira. O erro mantém o código e a classe do campo, e ganha o lugar onde
foi encontrado:

```text
RangeError: FULCRO6031: Particle.from: field 'charge': UnsignedInteger<8>.from: 300 is outside [0, 255].
```

O erro original, como o campo o lançou, fica em `cause`. Os detalhes são os do
campo, sem mudança: o contexto fica só na mensagem.

## Através de um worker

Um erro lançado dentro de um worker do `@fulcro/parallel` não consegue voltar
como o próprio objeto de erro. Um erro da própria biblioteca atravessa como o seu
código e os seus detalhes, e o pool o cria de novo do seu lado — mesmo código,
mesma classe, mesmos detalhes. Um erro lançado pela sua task volta como
[FULCRO3005](./errors/FULCRO3xxx.md#fulcro3005), com a sua mensagem mantida
palavra por palavra.
