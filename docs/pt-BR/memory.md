# Memória: `Storage<T>` e `Allocator`

🇺🇸 English: [Read this documentation in English](../memory.md)

O tipo de um valor diz o que ele é. Onde ficam os seus bytes é outra decisão, e
este pacote faz dela outro pedaço de código: um contrato, `Storage<T>`, contra o
qual o seu código é escrito, e as estratégias que guardam os valores por trás
dele. De onde vem a própria memória é uma terceira decisão, tomada pelo
[`Allocator`](#alocadores) que você passa.

```sh
npm install @fulcro/memory
```

```ts
import {
	allocate,
	createArenaAllocator,
	createFixedBufferStorage,
	createManagedStorage,
	createStackAllocator,
	type Allocation,
	type Allocator,
	type StackAllocator,
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

## Alocadores

`createFixedBufferStorage` cria o seu próprio buffer. Quando você quer escolher
de onde vem a memória — uma que é liberada de uma vez no fim de um quadro, ou
uma recortada de um orçamento fixado de antemão —, peça-a a um alocador e passe
o alocador:

```ts
const step = (stack: StackAllocator): void => {
	using frame = stack.enter();
	const particles: Storage<Particle> = allocate(Particle, 10_000, frame);

	// …
}; // todas as partículas são liberadas aqui, de uma vez
```

`allocate(element, length, allocator)` devolve um `Storage<T>` exatamente como
`createFixedBufferStorage` — os valores guardados como bytes, um depois do
outro, começando em zero. Só a origem da memória muda, e o código que lê o
storage não tem como saber.

### O contrato `Allocator`

```ts
interface Allocator {
	allocate(size: number, alignment: number): Allocation;
}

interface Allocation {
	readonly bytes: DataView; // exatamente `size` bytes, zerados
	isLive(): boolean;
}
```

`size` é uma contagem de bytes; `alignment` é uma potência de dois da qual a
posição do primeiro byte tem de ser múltipla. `allocate` lê os dois do layout
do elemento, então você só os passa quando pede bytes crus a um alocador:

```ts
const header: Allocation = arena.allocate(16, 8);

header.bytes.setFloat64(0, Date.now());
```

Isso é tudo o que um alocador promete. Como a memória volta muda de uma
estratégia para outra — toda de uma vez, último a entrar primeiro a sair, um
bloco por vez, ou nunca —, então cada estratégia tem os seus próprios métodos
para isso, e nenhuma carrega um `free` que teria de recusar.

O código que precisa de memória recebe um `Allocator` e deixa a escolha para
quem o chama:

```ts
const createParticles = (
	count: number,
	allocator: Allocator,
): Storage<Particle> => allocate(Particle, count, allocator);
```

### Escolhendo um alocador

| As suas alocações…                                  | Use                          | Liberadas por          |
| --------------------------------------------------- | ---------------------------- | ---------------------- |
| …não têm um tempo de vida que valha gerenciar       | `createManagedAllocator()`   | o garbage collector    |
| …terminam todas juntas: uma requisição, uma passada | `createArenaAllocator(size)` | `reset()`, ou `using`  |
| …se aninham, as internas terminando primeiro        | `createStackAllocator(size)` | sair de um quadro      |
| …têm de caber num orçamento fixado de antemão       | `createFixedBufferAllocator` | `reset()`              |
| …têm todas um tamanho e vêm e vão em qualquer ordem | `createPoolAllocator`        | `deallocate(cada uma)` |

**Gerenciado.** `createManagedAllocator()` dá a cada alocação um buffer próprio
e nunca libera nenhum: o garbage collector recupera uma alocação quando nada
mais a segura. Passe-o quando nada na situação pede outra coisa.

**Arena.** `createArenaAllocator(chunkSize)` reserva memória `chunkSize` bytes
por vez e a entrega da frente para trás. `reset()` libera tudo de uma vez e
guarda os pedaços, então a passada seguinte não pede memória nenhuma ao engine.
Também é um domínio de alocação: entrada com `using`, ela é resetada quando o
escopo termina. Ela cresce: um pedaço cheio é seguido de outro, e uma
requisição maior que um pedaço ganha um pedaço do seu próprio tamanho.

```ts
const arena = createArenaAllocator(64 * 1024);

for (const request of requests) {
	const scratch = allocate(Sample, request.length, arena);
	// …
	arena.reset();
}
```

**Pilha.** `createStackAllocator(capacity)` guarda um buffer de `capacity`
bytes e nunca cresce. `stack.enter()` abre um quadro; alocar a partir do quadro
reserva memória que dura até o quadro ser deixado, no fim do seu escopo
`using` — termine o escopo como terminar, com um throw inclusive. Quadros se
aninham, e só o mais interno ainda aberto pode alocar ou ser deixado; `using`
mantém essa ordem sozinho. Alocar da própria pilha, fora de qualquer quadro,
reserva memória que dura tanto quanto a pilha.

**Buffer fixo.** `createFixedBufferAllocator(buffer)` entrega um `ArrayBuffer`
que você já tem e nunca pede memória ao engine. `reset()` recomeça da frente.
O que o buffer guardava antes é sobrescrito com zeros conforme é entregue.

**Pool.** `createPoolAllocator(blockSize, blockCount)` corta um buffer em
`blockCount` blocos de `blockSize` bytes. Cada alocação toma um bloco e
`deallocate(allocation)` o devolve, em qualquer ordem. Uma requisição cabe
quando o seu tamanho é no máximo `blockSize` e o seu alinhamento divide
`blockSize`.

Cada factory devolve o seu alocador com um tipo próprio — `ArenaAllocator`,
`StackAllocator`, `FixedBufferAllocator`, `PoolAllocator` —, que é `Allocator`
mais os métodos que devolvem memória. `createManagedAllocator` devolve um
`Allocator` simples, já que não tem nada a devolver. Use o tipo específico onde
você chama esses métodos, e `Allocator` em todo o resto.

### Domínios de alocação

Um `AllocationDomain` é um alocador que também é `Disposable`: sair do seu
escopo `using` libera toda a sua região de uma vez. Uma arena é um, e cada
quadro de uma pilha também. Sair custa o mesmo seja o que for que se alocou —
nada é liberado uma alocação por vez.

### Memória liberada é recusada, não lida

Liberar não tira a memória de quem ainda a segura: os bytes continuam lá, e o
alocador os entrega à próxima requisição. Por isso cada alocação sabe dizer se
ainda é dela — `isLive()` vira `false` no momento em que a sua memória é
liberada, e continua falso depois que os bytes são entregues de novo —, e um
storage de `allocate` pergunta antes de cada `get` e `set`:

```ts
const arena = createArenaAllocator(1024);
const before = allocate(Particle, 1, arena);

arena.reset();
const after = allocate(Particle, 1, arena); // os mesmos bytes
after.set(0, Particle.from({ x: 7, y: 7 }));

before.get(0); // lança FULCRO7009 — nunca lê a partícula de after
```

Custa uma comparação por acesso. Não cobre os `bytes` de uma alocação que você
pediu diretamente: confira `isLive()` você mesmo antes de lê-los quando uma
liberação pode ter acontecido.

### Escrevendo um alocador próprio

Qualquer coisa com um `allocate(size, alignment)` que devolve
`{ bytes, isLive }` é um alocador, e `allocate` e toda função escrita contra
`Allocator` o aceitam sem que este pacote mude. Honre o contrato inteiro:
exatamente `size` bytes, zerados, começando num múltiplo de `alignment`, nunca
compartilhados com outra alocação viva, e `isLive()` falso a partir do momento
em que são liberados.

## O que ainda não faz

- **Crescer.** O comprimento de um storage é o da criação.
- **Entregar os seus bytes.** O buffer de um storage é privado dele; uma view
  sobre ele é a próxima feature deste pacote.
- **Iterar.** Percorra com um índice, como acima.
- **Alocar fora da memória do engine.** Todo alocador entrega bytes de um
  `ArrayBuffer`.

## Erros

| Código                                            | Quando                                                          |
| ------------------------------------------------- | --------------------------------------------------------------- |
| [`FULCRO7001`](./errors/FULCRO7xxx.md#fulcro7001) | Um comprimento ou uma contagem de blocos que não é uma contagem |
| [`FULCRO7002`](./errors/FULCRO7xxx.md#fulcro7002) | Um índice fora do storage                                       |
| [`FULCRO7003`](./errors/FULCRO7xxx.md#fulcro7003) | Um tipo de elemento que não pode ser guardado como bytes        |
| [`FULCRO7004`](./errors/FULCRO7xxx.md#fulcro7004) | Um valor que o tipo do elemento não reconhece, num buffer       |
| [`FULCRO7005`](./errors/FULCRO7xxx.md#fulcro7005) | Um tamanho em bytes que não é uma contagem                      |
| [`FULCRO7006`](./errors/FULCRO7xxx.md#fulcro7006) | Um alinhamento que não é potência de dois                       |
| [`FULCRO7007`](./errors/FULCRO7xxx.md#fulcro7007) | Um alocador sem espaço para uma requisição                      |
| [`FULCRO7008`](./errors/FULCRO7xxx.md#fulcro7008) | Um quadro da pilha usado com um quadro aberto acima dele        |
| [`FULCRO7009`](./errors/FULCRO7xxx.md#fulcro7009) | Memória usada depois que o seu alocador a liberou               |
| [`FULCRO7010`](./errors/FULCRO7xxx.md#fulcro7010) | Uma requisição que os blocos de um pool não comportam           |
| [`FULCRO7011`](./errors/FULCRO7xxx.md#fulcro7011) | Uma alocação devolvida a um pool que não a fez                  |
| [`FULCRO7012`](./errors/FULCRO7xxx.md#fulcro7012) | Um quadro da pilha usado para alocar depois de deixado          |
| [`FULCRO7013`](./errors/FULCRO7xxx.md#fulcro7013) | Algo que não é um `ArrayBuffer` para um buffer fixo             |
