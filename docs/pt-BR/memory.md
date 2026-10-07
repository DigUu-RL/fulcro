# Memória: `Storage<T>`, `Allocator` e `View<T>`

🇺🇸 English: [Read this documentation in English](../memory.md)

O tipo de um valor diz o que ele é. Onde ficam os seus bytes é outra decisão, e
este pacote faz dela outro pedaço de código: um contrato, `Storage<T>`, contra o
qual o seu código é escrito, e as estratégias que guardam os valores por trás
dele. De onde vem a própria memória é uma terceira decisão, tomada pelo
[`Allocator`](#alocadores) que você passa. Alcançar valores guardados em
outro lugar — uma região deles, uma posição, um valor — sem copiá-los nem ser
dono deles é a [camada de acesso](#views-ponteiros-e-referências).
Alcançá-los por endereço em bytes, do jeito que um módulo WebAssembly faz, é
uma [memória linear](#memória-linear-e-ponteiros-nativos). Dizer quem pode usar
os valores e por quanto tempo — um dono, empréstimos que terminam, uso depois de
um move recusado — é [ownership](#ownership).

```sh
npm install @fulcro/memory
```

```ts
import {
	allocate,
	asReadOnlyView,
	asView,
	borrow,
	borrowMutable,
	createArenaAllocator,
	createFixedBufferStorage,
	createLinearMemory,
	createManagedStorage,
	createStackAllocator,
	move,
	nativePointerTo,
	own,
	pointerTo,
	referenceTo,
	type Allocation,
	type Allocator,
	type Borrowed,
	type LinearMemory,
	type MemoryReference,
	type MutableBorrow,
	type NativePointer,
	type Owned,
	type Pointer,
	type ReadOnlyView,
	type StackAllocator,
	type Storage,
	type View,
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

| As suas alocações…                                  | Use                          | Liberadas por         |
| --------------------------------------------------- | ---------------------------- | --------------------- |
| …não têm um tempo de vida que valha gerenciar       | `createManagedAllocator()`   | o garbage collector   |
| …terminam todas juntas: uma requisição, uma passada | `createArenaAllocator(size)` | `reset()`, ou `using` |
| …se aninham, as internas terminando primeiro        | `createStackAllocator(size)` | sair de um quadro     |
| …têm de caber num orçamento fixado de antemão       | `createFixedBufferAllocator` | `reset()`, ou `using` |
| …têm todas um tamanho e vêm e vão em qualquer ordem | `createPoolAllocator`        | `deallocate`, `using` |

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
O que o buffer guardava antes é sobrescrito com zeros conforme é entregue. Como
uma arena, é um domínio de alocação: entrado com `using`, é resetado quando o
escopo termina.

**Pool.** `createPoolAllocator(blockSize, blockCount)` corta um buffer em
`blockCount` blocos de `blockSize` bytes. Cada alocação toma um bloco e
`deallocate(allocation)` o devolve, em qualquer ordem. Uma requisição cabe
quando o seu tamanho é no máximo `blockSize` e o seu alinhamento divide
`blockSize`.

As alocações de um pool são descartáveis por conta própria, então um bloco
declarado com `using` volta quando o seu escopo termina:

```ts
{
	using message = pool.allocate(48, 8);
	// …
} // o bloco é do pool de novo
```

Descartar uma alocação cujo bloco já voltou não faz nada, mesmo depois de o
bloco ter sido entregue a outro; `deallocate` sobre ela continua lançando
[`FULCRO7009`](./errors/FULCRO7xxx.md#fulcro7009).

Cada factory devolve o seu alocador com um tipo próprio — `ArenaAllocator`,
`StackAllocator`, `FixedBufferAllocator`, `PoolAllocator` —, que é `Allocator`
mais os métodos que devolvem memória. `createManagedAllocator` devolve um
`Allocator` simples, já que não tem nada a devolver. Use o tipo específico onde
você chama esses métodos, e `Allocator` em todo o resto.

### Domínios de alocação

Um `AllocationDomain` é um alocador que também é `Disposable`: sair do seu
escopo `using` libera toda a sua região de uma vez. Uma arena é um, um alocador
de buffer fixo é um, e cada quadro de uma pilha também. Sair custa o mesmo seja
o que for que se alocou — nada é liberado uma alocação por vez.

`using` e `await using` são do próprio TypeScript, e pedem TypeScript 5.2 ou
posterior com `esnext.disposable` em `lib` (ou `@types/node`, que declara o
mesmo) — é de lá que vêm os tipos `Disposable` e `AsyncDisposable`.

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

## Views, ponteiros e referências

Um storage é dono dos seus valores. Um código que só precisa alcançar alguns
deles — somar um intervalo, preencher a segunda metade, incrementar um
contador — não deveria precisar do storage inteiro, e também não deveria
receber uma cópia. Três tipos fazem esse alcance, e nenhum deles é dono de
nada:

```text
Pointer<T>          onde está um valor
View<T>             onde uma região começa, e quanto ela mede
MemoryReference<T>  um valor que pode ser lido e substituído
```

### `View<T>` e `ReadOnlyView<T>`

```ts
interface ReadOnlyView<T> {
	readonly length: number;
	get(index: number): T;
	subview(start: number, length?: number): ReadOnlyView<T>;
}

interface View<T> extends ReadOnlyView<T> {
	set(index: number, value: T): void;
	subview(start: number, length?: number): View<T>;
	readOnly(): ReadOnlyView<T>;
}
```

`asView(source, start?, length?)` observa uma região de um storage, de outra
view ou de um array:

```ts
const scores: Storage<number> = createManagedStorage(100, 0);
const firstTen: View<number> = asView(scores, 0, 10);
const rest: View<number> = asView(scores, 10); // posições 10 a 99

firstTen.set(3, 42);
scores.get(3); // 42 — a view escreveu no storage
```

Nada é copiado, em nenhum comprimento. Uma view lembra a sua origem, onde a
sua região começa e quanto ela mede; todo `get` e `set` vai à origem, então a
view e a origem nunca discordam. `subview` recorta uma parte de uma view do
mesmo jeito, e uma subview de uma subview lê diretamente a origem original,
então aninhá-las não custa nada a cada acesso.

Um índice é uma posição dentro da view, de `0` a `length - 1`, e qualquer outra
coisa lança [`FULCRO7002`](./errors/FULCRO7xxx.md#fulcro7002) — mesmo onde a
origem continua além da view. Uma região que não cabe na sua origem lança
[`FULCRO7014`](./errors/FULCRO7xxx.md#fulcro7014). Uma região vazia é
permitida em qualquer lugar, inclusive no fim, como num array.

Uma view tem a forma de um `Storage<T>`, então toda função escrita contra o
contrato aceita uma:

```ts
total(asView(prices, 10, 5)); // o `total` do contrato acima
```

**Somente leitura.** `asReadOnlyView(source, start?, length?)` e
`view.readOnly()` devolvem uma `ReadOnlyView<T>`, o que entregar a um código
que deve só ler. Ela não tem `set`, nem no tipo nem em runtime. O objeto não
tem essa propriedade, então um cast não devolve o direito de escrever. Ela
também aceita um array `readonly` e outra view somente leitura, que `asView`
recusa porque as escreveria.

**Sobre um array.** O array é observado no lugar. Ele pode encolher depois, o
que um storage não pode, e uma posição que ele não alcança mais lança
[`FULCRO7015`](./errors/FULCRO7xxx.md#fulcro7015) em vez de ler `undefined`.
Uma view mantém o comprimento da criação quando o array cresce.

**Ela não sobrevive à memória.** Sobre um storage de `allocate`, todo acesso
ainda confere se o alocador liberou os bytes, e lança
[`FULCRO7009`](./errors/FULCRO7xxx.md#fulcro7009) quando ele os liberou,
exatamente como o storage faria. Uma view não é dona de nada, então não tem
nada a liberar.

### `Pointer<T>`

`pointerTo(source, index)` aponta para uma posição de um storage, de uma view
ou de um array:

```ts
const queue: Storage<string> = createManagedStorage(8, '');
const head: Pointer<string> = pointerTo(queue, 0);

head.set('first');
head.offset(1).set('second');
queue.get(1); // 'second'
```

`offset(delta)` devolve um ponteiro novo, para frente ou para trás, e deixa o
original como estava. Um ponteiro pode ficar uma posição depois do último
valor, para que um laço chegue ao fim e pare ali:

```ts
for (
	let cursor = pointerTo(queue, 0);
	cursor.index < queue.length;
	cursor = cursor.offset(1)
) {
	cursor.get();
}
```

Ler ou escrever no fim lança `FULCRO7002`. Apontar fora de `0` até o
comprimento lança [`FULCRO7016`](./errors/FULCRO7xxx.md#fulcro7016).
`asView(pointer, length)` observa a região que começa no ponteiro: um valor
quando o comprimento é omitido.

### `MemoryReference<T>`

`referenceTo(value)` cria um valor que pode ser lido e substituído. Entregue-o
a um código que precisa mudar um valor do qual não é dono:

```ts
const increment = (counter: MemoryReference<number>): void => {
	counter.set(counter.get() + 1);
};

const hits = referenceTo(0);

increment(hits);
hits.get(); // 1
```

O valor é guardado como está, nunca copiado. Uma referência não tem posição
nem aritmética. Isso é o que um ponteiro acrescenta, e todo `Pointer<T>` também
é uma `MemoryReference<T>`, então `increment(pointerTo(queue, 3))` funciona.
`asView(reference)` a observa como uma view de comprimento `1`.

### O que pode ser uma origem

| Origem                            | `asView` | `asReadOnlyView` | `pointerTo` |
| --------------------------------- | -------- | ---------------- | ----------- |
| Um `Storage<T>`, de qualquer tipo | sim      | sim              | sim         |
| Uma `View<T>`                     | sim      | sim              | sim         |
| Uma `ReadOnlyView<T>`             | não      | sim              | não         |
| Um `T[]`                          | sim      | sim              | sim         |
| Um `readonly T[]`                 | não      | sim              | não         |
| Um `Pointer<T>`                   | sim      | sim              | não         |
| Uma `MemoryReference<T>`          | sim      | sim              | não         |

Qualquer outra coisa lança [`FULCRO7017`](./errors/FULCRO7xxx.md#fulcro7017).
Um storage ou uma referência escritos fora deste pacote são aceitos pela sua
forma, exatamente como um criado aqui.

## Memória linear e ponteiros nativos

Um `Pointer<T>` conta valores. Há código que precisa contar bytes: apontar
para um campo no meio de um struct, ler os mesmos bytes como outro tipo, ou ler
o que um módulo WebAssembly escreveu num endereço que ele devolveu. Para isso,
o Fulcro enxerga um bloco de bytes como um espaço de endereços — uma **memória
linear**, em que o endereço `0` é o primeiro byte — e aponta para dentro dele
por endereço em bytes.

```ts
interface LinearMemory {
	readonly byteLength: number;
}

interface NativePointer<T> extends MemoryReference<T> {
	readonly memory: LinearMemory;
	readonly address: number;
	get(): T;
	set(value: T): void;
	at(byteOffset: number): NativePointer<T>;
	at<TOther>(
		byteOffset: number,
		element: AlignedElement<TOther>,
	): NativePointer<TOther>;
}
```

### `createLinearMemory`

`createLinearMemory(backing)` abrange um `ArrayBuffer`, ou o
`WebAssembly.Memory` que um módulo exporta:

```ts
const { instance } = await WebAssembly.instantiate(bytes);
const moduleExports = instance.exports as {
	memory: WebAssembly.Memory;
	latest: () => number;
};
const memory: LinearMemory = createLinearMemory(moduleExports.memory);

memory.byteLength; // 65536, uma página
```

O TypeScript tipa cada exportação de um módulo como qualquer tipo de exportação
— função, memória, tabela ou global —, então diga qual é cada uma, como acima,
antes de repassá-la.

Nada é copiado, e a memória continua sendo do seu dono: o módulo segue usando-a
como antes. `byteLength` é o comprimento agora, e aumenta quando o módulo
cresce a sua memória ou quando um buffer redimensionável muda de tamanho.

Uma memória compartilhada entre threads é recusada, seja um
`SharedArrayBuffer` ou um `WebAssembly.Memory` compartilhado, com
[`FULCRO7018`](./errors/FULCRO7xxx.md#fulcro7018). Um typed array também, porque
cobre só parte do seu buffer. Passe o próprio buffer.

### `nativePointerTo(memory, address, element)`

Aponta para um endereço em bytes de uma memória, para um valor do tipo do
elemento — um struct, como em `allocate`:

```ts
const latest: NativePointer<Reading> = nativePointerTo(
	memory,
	moduleExports.latest(),
	Reading,
);

latest.get(); // a leitura que o módulo escreveu, lida onde ele a escreveu
latest.set(Reading.from({ value: 0 })); // e o módulo enxerga isto
```

`at(byteOffset)` move o ponteiro em bytes, para frente ou para trás, e deixa o
original como estava. Entregue também um tipo, e ele lê os bytes dali como
esse tipo. É assim que um ponteiro alcança um campo de um struct, no lugar:

```ts
const particle: NativePointer<Particle> = nativePointerTo(memory, 64, Particle);
const velocity: NativePointer<Point> = particle.at(
	Particle.layout.fields.velocity.offset,
	Point,
);

velocity.set(Point.from({ x: 0, y: -9.8 })); // escreve a velocidade da partícula
```

Um endereço é um inteiro de `0` até o comprimento da memória; o próprio
comprimento é permitido, para que um laço chegue ao fim. Qualquer outra coisa
lança [`FULCRO7019`](./errors/FULCRO7xxx.md#fulcro7019). Um endereço também
precisa ser múltiplo do alinhamento do tipo, ou lança
[`FULCRO7020`](./errors/FULCRO7xxx.md#fulcro7020). Ler ou escrever onde os
bytes do valor não cabem todos lança
[`FULCRO7021`](./errors/FULCRO7xxx.md#fulcro7021).

**Ele acompanha a memória quando ela cresce.** Crescer uma memória WebAssembly
troca o seu buffer e deixa vazia toda view do antigo. Um ponteiro nativo guarda
a memória e o endereço, nunca uma view, então lê os bytes atuais a cada acesso.
Isso custa uma leitura de propriedade por acesso; uma view nova só é criada
depois de um crescimento, não a cada acesso.

**Nada vigia o endereço.** Um ponteiro feito de uma memória pode alcançar
qualquer byte dela, e confia que há ali um valor do seu tipo. É isso que um
endereço entregue por um módulo é. Quando os bytes vieram de um alocador,
aponte para a alocação.

### `nativePointerTo(allocation, element)`

Aponta para o primeiro byte de uma alocação:

```ts
const allocation = arena.allocate(Header.layout.size, Header.layout.alignment);
const header: NativePointer<Header> = nativePointerTo(allocation, Header);

header.set(Header.from({ version: 2, length: 0 }));
arena.reset();
header.get(); // lança FULCRO7009 — os bytes voltaram para a arena
```

Todo alocador funciona, inclusive um escrito por você: a memória é o buffer do
qual a alocação foi recortada, e o endereço é onde a alocação começa nele. Duas
alocações de uma arena podem estar em buffers diferentes, então compare
endereços só dentro de uma mesma memória.

Um ponteiro assim, e todo ponteiro movido a partir dele, alcança só os bytes da
alocação. Mover-se para fora deles lança `FULCRO7019`. Antes de cada leitura e
escrita ele pergunta à alocação se ela ainda está viva, e lança
[`FULCRO7009`](./errors/FULCRO7xxx.md#fulcro7009) assim que o alocador a
liberou — uma comparação por acesso, como num storage de `allocate`. Peça ao
alocador o alinhamento do tipo: uma alocação que começa onde o tipo não pode
começar lança `FULCRO7020`.

## Ownership

Uma view deixa um código alcançar valores que não são dele, e não diz nada
sobre quem mais os alcança ao mesmo tempo. Ownership diz: uma storage ganha um
único dono, e os seus valores são emprestados por esse dono — a qualquer número
de leitores ao mesmo tempo, ou a um único escritor — e passados adiante com um
move que gasta o dono antigo.

```ts
interface Owned<T> extends Disposable {
	readonly length: number;
	[Symbol.dispose](): void;
}

interface Borrowed<T> extends ReadOnlyView<T> {}

interface MutableBorrow<T> extends View<T> {}
```

Um empréstimo é uma view: `Borrowed<T>` é aceito onde quer que um
`ReadOnlyView<T>` seja, e `MutableBorrow<T>` onde quer que um `View<T>` seja,
então um código escrito contra views recebe empréstimos sem mudança. Nenhum dos
três é confundido com outra coisa — um objeto qualquer com `length` não é um
`Owned<number>`, nem qualquer view é um empréstimo.

### `own(create)`

Cria uma storage e o seu dono:

```ts
const scores: Owned<number> = own(() => createManagedStorage(100, 0));
const particles = own(() => allocate(Particle, 10_000, arena));
```

A storage é criada dentro da função de propósito: nada mais fica com ela, então
não há caminho por fora dos empréstimos até os seus valores. Uma storage que a
função devolve de outro lugar — uma variável, uma view feita sobre ela antes —
continua alcançável por ali, sem verificação. Devolver uma storage que já tem
dono lança [`FULCRO7025`](./errors/FULCRO7xxx.md#fulcro7025); devolver um
empréstimo lança [`FULCRO7026`](./errors/FULCRO7xxx.md#fulcro7026).

Um dono expõe o seu `length`, e um `[Symbol.dispose]` para o `using`, e mais
nada. Os seus valores são alcançados por um empréstimo.

### `borrow(owner)` e `borrowMutable(owner)`

```ts
const total = (values: ReadOnlyView<number>): number => {
	let sum = 0;

	for (let index = 0; index < values.length; index++) sum += values.get(index);

	return sum;
};

borrowMutable(scores).set(3, 42);
total(borrow(scores)); // 42
```

`borrow` empresta os valores para leitura. Empréstimos compartilhados convivem:
tomar um não encerra nenhum outro. `borrowMutable` os empresta para escrita, com
exclusividade: tomá-lo encerra todo empréstimo tomado antes, e ele termina assim
que o dono é emprestado de novo, de qualquer forma.

Um empréstimo que terminou lança
[`FULCRO7024`](./errors/FULCRO7xxx.md#fulcro7024) no acesso seguinte — e o
mesmo vale para toda subview, view somente leitura, view e ponteiro feitos a
partir dele, não importa como foram feitos.

| Tomar           | Encerra                                      |
| --------------- | -------------------------------------------- |
| `borrow`        | o `borrowMutable` anterior, se houver        |
| `borrowMutable` | todo empréstimo anterior                     |
| `move`          | todo empréstimo, e o dono de onde foi tomado |
| descartá-lo     | todo empréstimo, e o próprio dono            |

Um empréstimo dura até o seu último uso, não até o fim de um escopo. Tomar um
empréstimo conflitante é sempre permitido; o que é recusado é usar o anterior
depois dele.

### `move(owner)`

```ts
const queue = own(() => createManagedStorage(64, 0));
const worker = move(queue);

borrow(worker).get(0); // ok
borrow(queue); // lança FULCRO7023: queue foi movido
```

O novo dono possui exatamente os mesmos valores; nada é copiado. O dono antigo
recusa tudo o que lhe pedem dali em diante, o seu `length` inclusive, com
[`FULCRO7023`](./errors/FULCRO7xxx.md#fulcro7023).

### Encerrando a posse com `using`

Um dono declarado com `using` termina com o seu escopo, termine o escopo como
terminar: todo empréstimo tomado dele termina, e o dono recusa tudo o que lhe
pedem depois com [`FULCRO7030`](./errors/FULCRO7xxx.md#fulcro7030).

```ts
{
	using frame = stack.enter();
	using particles = own(() => allocate(Particle, 10_000, frame));

	borrowMutable(particles).set(0, Particle.from({ x: 1, y: 2 }));
} // os empréstimos de particles terminam, e depois o quadro libera a memória deles
```

Descartar encerra a posse, não a memória: os bytes pertencem ao alocador, e
voltam quando o alocador os libera — aqui, quando o quadro declarado antes do
dono é deixado logo depois dele, já que o `using` encerra primeiro a última
declaração.

Um dono de onde se moveu não é mais o dono, então o fim do seu escopo não tem o
que encerrar, e o dono que o `move` devolveu mantém os seus empréstimos:

```ts
const handOver = (): Owned<number> => {
	using scores = own(() => createManagedStorage(100, 0));

	return move(scores); // sair descarta scores, o que não faz nada
};
```

Descartar duas vezes é descartar uma.

### Recusado na compilação

Todas as recusas acima acontecem em runtime, nos caminhos que rodam. O
transformer do memory recusa os mesmos usos na compilação, no uso, e diz onde
estava o move ou o empréstimo conflitante:

```text
FULCRO7027: move: 'queue' is used after it was moved at line 2; use the owner move returned.
FULCRO7028: borrow: the borrow 'reading' is used after borrowMutable(scores) at line 8 ended it.
FULCRO7029: borrow: the borrow 'reading' is used after its owner 'scores' was moved at line 9.
```

Ele é opcional e não reescreve nada. Configure-o pelo `ts-patch`:

```json
{ "plugins": [{ "transform": "@fulcro/memory/transformer" }] }
```

ou, para um bundler, por `@fulcro/memory/unplugin`:

```ts
import { vite as fulcroMemory } from '@fulcro/memory/unplugin';

export default defineConfig({ plugins: [fulcroMemory()] });
```

Ele convive com os plugins de `@fulcro/reflect` e `@fulcro/collections`, em
qualquer ordem. Os seus erros vêm do build — `tsc` pelo `ts-patch`, ou o
bundler — e não de `tsc --noEmit` nem de um editor, que não rodam plugins.

Ele segue variáveis, por todos os caminhos que o código pode tomar: um move num
ramo de um `if` deixa a variável movida depois dele, um move dentro de um laço é
visto pela iteração seguinte, e uma função criada depois de um move não pode
nomear o que foi movido. O que ele não segue fica com a verificação em runtime,
que o pega quando roda:

- um dono ou um empréstimo alcançado por uma propriedade, um array ou um apelido
  (`const other = owner`);
- uma função criada antes do move, que pode rodar antes ou depois dele;
- uma subview ou um ponteiro feito de um empréstimo e guardado numa variável
  própria.

### O que custa

Criar um dono, um empréstimo ou um move não lê nem copia nada. Cada acesso por
um empréstimo faz uma comparação para saber se o empréstimo terminou, e então
lê ou escreve a storage uma vez — através de qualquer número de subviews
aninhadas. Sobre uma storage de `allocate`, a storage ainda pergunta uma vez se
a sua memória continua viva, como sempre faz; o empréstimo não acrescenta uma
segunda pergunta. Encerrar empréstimos — por um empréstimo, um move ou o fim de
um escopo `using` — custa o mesmo, não importa quantos foram tomados, e não lê
nada.

### Segurança progressiva

Cada degrau abaixo troca uma garantia por alcance:

1. **Valores com dono**, alcançados por empréstimos: quem pode ler e escrever é
   verificado em todo acesso, e na compilação com o transformer.
2. **Views, ponteiros e referências** sobre uma storage: sem dono, então nada
   diz quem mais está escrevendo — o índice continua verificado.
3. **Ponteiros nativos** numa memória linear: qualquer byte dela, confiando que
   há ali um valor do tipo.

Cada degrau é alcançado chamando uma função, e em que degrau um valor está fica
visível no tipo que você tem nas mãos.

## O que ainda não faz

- **Crescer.** O comprimento de um storage é o da criação.
- **Entregar os seus bytes.** O buffer de um storage é privado dele, e uma
  view lê valores, não bytes. Uma view sobre bytes crus está planejada junto
  com a serialização binária.
- **Compartilhar memória entre threads.** Uma memória linear compartilhada é
  recusada até que o pacote saiba dizer quem pode escrever o quê, e quando.
- **Endereçar mais que uma memória de 32 bits.** Endereços são números; os de
  uma memória de 64 bits são `bigint`s, e são recusados.
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
| [`FULCRO7014`](./errors/FULCRO7xxx.md#fulcro7014) | Uma região que não cabe na sua origem                           |
| [`FULCRO7015`](./errors/FULCRO7xxx.md#fulcro7015) | Uma posição que um array deixou de alcançar depois de observado |
| [`FULCRO7016`](./errors/FULCRO7xxx.md#fulcro7016) | Um ponteiro fora de `0` até o comprimento da sua origem         |
| [`FULCRO7017`](./errors/FULCRO7xxx.md#fulcro7017) | Algo que não é uma origem sobre a qual se faz uma view          |
| [`FULCRO7018`](./errors/FULCRO7xxx.md#fulcro7018) | Uma memória linear sobre algo inendereçável, ou compartilhado   |
| [`FULCRO7019`](./errors/FULCRO7xxx.md#fulcro7019) | Um ponteiro nativo fora de onde pode apontar                    |
| [`FULCRO7020`](./errors/FULCRO7xxx.md#fulcro7020) | Um endereço onde o tipo do ponteiro não pode começar            |
| [`FULCRO7021`](./errors/FULCRO7xxx.md#fulcro7021) | Um valor cujos bytes passam de onde o ponteiro pode ler         |
| [`FULCRO7022`](./errors/FULCRO7xxx.md#fulcro7022) | Nem memória linear nem alocação, para apontar dentro            |
| [`FULCRO7023`](./errors/FULCRO7xxx.md#fulcro7023) | Um dono usado depois de ser movido                              |
| [`FULCRO7024`](./errors/FULCRO7xxx.md#fulcro7024) | Um empréstimo usado depois de terminar                          |
| [`FULCRO7025`](./errors/FULCRO7xxx.md#fulcro7025) | Uma storage possuída uma segunda vez                            |
| [`FULCRO7026`](./errors/FULCRO7xxx.md#fulcro7026) | Um empréstimo passado a `own` como storage                      |
| [`FULCRO7027`](./errors/FULCRO7xxx.md#fulcro7027) | Na compilação: uma variável usada depois de ser movida          |
| [`FULCRO7028`](./errors/FULCRO7xxx.md#fulcro7028) | Na compilação: um empréstimo usado depois de um conflitante     |
| [`FULCRO7029`](./errors/FULCRO7xxx.md#fulcro7029) | Na compilação: um empréstimo usado depois que o dono foi movido |
| [`FULCRO7030`](./errors/FULCRO7xxx.md#fulcro7030) | Um dono usado depois que o seu escopo `using` o descartou       |
