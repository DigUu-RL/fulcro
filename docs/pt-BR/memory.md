# Memória: `Storage<T>`

🇺🇸 English: [Read this documentation in English](../memory.md)

O tipo de um valor diz o que ele é. Onde ficam os seus bytes é outra decisão, e
este pacote faz dela outro pedaço de código: um contrato, `Storage<T>`, contra o
qual o seu código é escrito, e as estratégias que guardam os valores por trás
dele.

```sh
npm install @fulcro/memory
```

```ts
import {
	createFixedBufferStorage,
	createManagedStorage,
	type Storage,
} from '@fulcro/memory';
```

## O contrato

Um storage guarda um número fixo de valores de um tipo, por índice:

```ts
interface Storage<T> {
	readonly length: number;
	get(index: number): T;
	set(index: number, value: T): void;
}
```

Escreva o código contra isso, e ele roda sem mudança sobre qualquer estratégia:

```ts
const total = (prices: Storage<number>): number => {
	let sum = 0;

	for (let index = 0; index < prices.length; index++) sum += prices.get(index);

	return sum;
};
```

`total` nunca fica sabendo se os preços estão num array comum ou num buffer de
bytes, e uma estratégia acrescentada depois chega até ele sem que ele mude.

O comprimento é fixado quando o storage é criado. Um índice é um inteiro de `0`
a `length - 1`, e qualquer outra coisa — `-1`, `length`, `1.5`, `NaN` — lança um
`RangeError` com código [`FULCRO7002`](./errors/FULCRO7xxx.md#fulcro7002). Nunca
é lido como `undefined`, e nunca é escrito depois do fim.

Um storage é um objeto congelado de funções simples, então `get` e `set` podem
ser passados adiante sozinhos:

```ts
const { get } = createManagedStorage(3, 0);
```

## Escolhendo uma estratégia

| Você precisa guardar                                        | Use                        |
| ----------------------------------------------------------- | -------------------------- |
| Qualquer valor: objetos, strings, funções, `null`           | `createManagedStorage`     |
| Muitos valores de uma struct, como bytes e não como objetos | `createFixedBufferStorage` |

## `createManagedStorage`

Memória que o motor JavaScript gerencia: um array comum, por trás do contrato.

```ts
const scores: Storage<number> = createManagedStorage(3, 0);

scores.set(1, 42);
scores.get(1); // 42
```

O segundo argumento é o valor que toda posição guarda até ser definida, e o tipo
é inferido dele. Passe o tipo explicitamente quando as posições forem guardar
mais do que o tipo do valor inicial:

```ts
const users = createManagedStorage<User | null>(100, null);
```

Os valores são guardados **como são**: `get` devolve o mesmo objeto que `set`
recebeu, não uma cópia, e nada dentro de um valor é lido.

**Cuidado com o valor inicial.** É um valor só, guardado em todas as posições —
não um novo por posição. Com um objeto, toda posição começa como o mesmo objeto:

```ts
const lists = createManagedStorage(3, [] as string[]);

lists.get(0).push('a');
lists.get(2); // ['a'] — o mesmo array
```

Comece com `null` e defina cada posição com `set` quando cada uma precisar do
seu próprio.

## `createFixedBufferStorage`

Um buffer de tamanho fixo, cada valor guardado como seus bytes, um após o
outro. O tipo do elemento é uma [struct](./types.md) de `@fulcro/types`:

```ts
import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

const Point = struct('Point', {
	x: SinglePrecisionFloat,
	y: SinglePrecisionFloat,
});
type Point = Struct<typeof Point>;

const points: Storage<Point> = createFixedBufferStorage(Point, 1_000_000);

points.set(0, Point.from({ x: 1, y: 2 }));
points.get(0).x; // 1
```

**O que custa.** O buffer é alocado uma vez, `length × Point.layout.size`
bytes — oito milhões aqui — e mais nada. Nenhum objeto é criado na criação: um
milhão de pontos custam os bytes, não um milhão de objetos.

**Toda posição começa em zero.** O buffer é zerado, então uma posição que
ninguém definiu é lida como a struct com todos os campos em zero.

**Uma leitura cria um valor novo.** `get` lê os bytes e monta um valor congelado
a partir deles, um novo a cada chamada. Duas leituras do mesmo índice são iguais
por `Point.equals`, mas não por `===`. E `set` guarda os bytes, não o objeto: o
valor que você passou não é o que você recebe de volta.

**Um valor do tipo errado é recusado.** `set` pergunta à struct se o valor é um
dos seus, e lança um `TypeError` com código
[`FULCRO7004`](./errors/FULCRO7xxx.md#fulcro7004) antes de escrever qualquer
byte quando não é. O compilador já recusa um objeto comum onde se espera um
`Point`; isto é para o valor que chega de código sem tipos.

**Só structs, por enquanto.** Um tipo numérico sozinho — `SinglePrecisionFloat`,
`SignedInteger(32)` — não traz uma codificação em bytes própria, e é recusado
com [`FULCRO7003`](./errors/FULCRO7xxx.md#fulcro7003). Envolva-o numa struct de
um campo:

```ts
const Sample = struct('Sample', { value: SinglePrecisionFloat });
const samples = createFixedBufferStorage(Sample, 44_100);
```

Os métodos de uma struct voltam com cada valor lido, e structs se aninham,
campos `Decimal` inclusive — tudo o que uma struct pode guardar, um buffer fixo
pode armazenar.

## O que ainda não faz

- **Crescer.** O comprimento é o da criação.
- **Entregar os seus bytes.** O buffer é privado do storage; uma view sobre ele
  é a próxima feature deste pacote.
- **Iterar.** Percorra com um índice, como acima.

## Erros

| Código                                            | Quando                                                      |
| ------------------------------------------------- | ----------------------------------------------------------- |
| [`FULCRO7001`](./errors/FULCRO7xxx.md#fulcro7001) | Um comprimento que não é um inteiro seguro não negativo     |
| [`FULCRO7002`](./errors/FULCRO7xxx.md#fulcro7002) | Um índice fora do storage                                   |
| [`FULCRO7003`](./errors/FULCRO7xxx.md#fulcro7003) | Um tipo de elemento que um buffer fixo não consegue guardar |
| [`FULCRO7004`](./errors/FULCRO7xxx.md#fulcro7004) | Um valor que o tipo do elemento não reconhece, num buffer   |
