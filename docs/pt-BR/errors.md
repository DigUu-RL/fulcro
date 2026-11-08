# Códigos de erro

🇺🇸 English: [Read this documentation in English](../errors.md)

Todo erro lançado por um pacote `@fulcro` carrega um código e os seus detalhes.
O código fica no início da mensagem e no próprio erro; os detalhes são os
valores a partir dos quais a mensagem foi escrita, cada um com o seu nome:

```text
TypeError: FULCRO6021: NavigationFix.from: missing field 'parsecsFromCoruscant'.
```

```ts
import { isFulcroError } from '@fulcro/errors';

try {
	NavigationFix.from(transmission);
} catch (error) {
	if (isFulcroError(error, 'FULCRO6021')) {
		error.details.field; // 'parsecsFromCoruscant' — peça de novo
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

O R2-D2 repassando uma posição de navegação cuja transmissão foi cortada — o
código diz o que deu errado, e os detalhes dizem qual campo pedir de novo:

```ts
import { isFulcroError } from '@fulcro/errors';
import { SinglePrecisionFloat, struct, UnsignedInteger } from '@fulcro/types';

const NavigationFix = struct('NavigationFix', {
	parsecsFromCoruscant: SinglePrecisionFloat,
	hyperspaceLane: UnsignedInteger(8),
});

const receiveFix = (transmission: string, retransmit: (field: string) => void): void => {
	try {
		const fix = NavigationFix.from(JSON.parse(transmission));

		console.log(
			`Lane ${String(fix.hyperspaceLane)}, ${String(fix.parsecsFromCoruscant)} parsecs out`,
		);
	} catch (error) {
		if (isFulcroError(error, 'FULCRO6021')) {
			retransmit(error.details.field);

			return;
		}

		throw error;
	}
};

receiveFix('{ "hyperspaceLane": 3 }', (field) => {
	console.log(`R2-D2, transmit '${field}' again`); // "R2-D2, transmit 'parsecsFromCoruscant' again"
});

receiveFix('{ "hyperspaceLane": 3, "parsecsFromCoruscant": 12 }', () => {});
// 'Lane 3, 12 parsecs out'
```

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

O controle do hangar de um Destróier Estelar, ao receber o pedido de uma baia
que ele não tem:

```ts
import { isFulcroError } from '@fulcro/errors';
import { createManagedStorage } from '@fulcro/memory';

const hangarBays = createManagedStorage<string | null>(10, null);

hangarBays.set(3, 'Lambda-class shuttle Tydirium');

try {
	hangarBays.get(12);
} catch (error) {
	if (isFulcroError(error, 'FULCRO7002')) {
		console.log(error.details); // { operation: 'ManagedStorage.get', index: 12, length: 10 }
		console.log(error instanceof RangeError); // true
	}
}
```

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

O console do oficial do convés, transformando qualquer erro da biblioteca numa
linha para a tripulação e mantendo o número da baia como número:

```ts
import { FulcroError, isFulcroError } from '@fulcro/errors';
import type { DetailsOf } from '@fulcro/errors';
import { createManagedStorage } from '@fulcro/memory';

const describeBay = (details: DetailsOf<'FULCRO7002'>): string => {
	return `Bay ${String(details.index)} requested; this hangar has ${String(details.length)} bays`;
};

const forTheCrew = (error: unknown): string => {
	if (isFulcroError(error, 'FULCRO7002')) return describeBay(error.details);
	if (error instanceof FulcroError) return `${error.code} in ${error.details.operation}`;

	return 'Unknown malfunction — send for the Chief Engineer';
};

const hangarBays = createManagedStorage<string | null>(10, null);

try {
	hangarBays.get(12);
} catch (error) {
	console.log(forTheCrew(error)); // 'Bay 12 requested; this hangar has 10 bays'
}

console.log(forTheCrew(new Error('Rebel sabotage'))); // 'Unknown malfunction — send for the Chief Engineer'
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
RangeError: FULCRO6031: Starfighter.from: field 'crew': UnsignedInteger<8>.from: 300 is outside [0, 255].
```

O erro original, como o campo o lançou, fica em `cause`. Os detalhes são os do
campo, sem mudança: o contexto fica só na mensagem.

Um caça registrado com uma tripulação que nenhuma cabine comportaria:

```ts
import { isFulcroError } from '@fulcro/errors';
import { SinglePrecisionFloat, struct, UnsignedInteger } from '@fulcro/types';

const Starfighter = struct('Starfighter', {
	crew: UnsignedInteger(8),
	shields: SinglePrecisionFloat,
});

try {
	Starfighter.from({ crew: 300, shields: 1 });
} catch (error) {
	if (isFulcroError(error, 'FULCRO6031')) {
		console.log(error.message);
		// "FULCRO6031: Starfighter.from: field 'crew': UnsignedInteger<8>.from: 300 is outside [0, 255]."

		console.log((error.cause as Error).message); // 'FULCRO6031: UnsignedInteger<8>.from: 300 is outside [0, 255].'
		console.log(error.details.operation); // 'UnsignedInteger<8>.from' — os detalhes do campo, sem mudança
	}
}
```

## Através de um worker

Um erro lançado dentro de um worker do `@fulcro/parallel` não consegue voltar
como o próprio objeto de erro. Um erro da própria biblioteca atravessa como o seu
código e os seus detalhes, e o pool o cria de novo do seu lado — mesmo código,
mesma classe, mesmos detalhes. Um erro lançado pela sua task volta como
[FULCRO3005](./errors/FULCRO3xxx.md#fulcro3005), com a sua mensagem mantida
palavra por palavra.
