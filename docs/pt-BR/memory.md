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
	readonly get: (index: number) => T;
	readonly set: (index: number, value: T) => void;
}
```

`get` e `set` são funções guardadas pelo storage, não métodos: funcionam fora
do objeto, então `const { get, set } = storage` vale tanto quanto chamá-las por
ele. O mesmo vale para todo membro das views, dos ponteiros, das referências e
dos alocadores abaixo.

Por serem funções, seus parâmetros são checados num sentido só. Um
`Storage<number>` não é um `Storage<unknown>` — esse poderia receber uma string
em `set` —, então o código feito para um storage de qualquer tipo o recebe de
forma genérica, `<T>(storage: Storage<T>)`, e não como `Storage<unknown>`.

Escreva o código contra isso, e ele roda sem mudança sobre qualquer estratégia:

```ts
const totalCredits = (bounties: Storage<number>): number => {
	let sum = 0;

	for (let index = 0; index < bounties.length; index++) sum += bounties.get(index);

	return sum;
};
```

`totalCredits` nunca fica sabendo se as recompensas estão num array comum ou
num buffer de bytes, e uma estratégia acrescentada depois chega até ele sem que
ele mude.

O comprimento é fixado quando o storage é criado. Um índice é um inteiro de `0`
a `length - 1`, e qualquer outra coisa — `-1`, `length`, `1.5`, `NaN` — lança um
`RangeError` com código [`FULCRO7002`](./errors/FULCRO7xxx.md#fulcro7002). Nunca
é lido como `undefined`, e nunca é escrito depois do fim.

Um storage é um objeto congelado de funções simples, então `get` e `set` podem
ser passados adiante sozinhos:

```ts
const { get } = createManagedStorage(3, 0);
```

Um `totalCredits` só, rodando sobre um storage de números comuns e sobre um de
inteiros de 32 bits guardados em bytes — e o índice além do qual ele se recusa a
ler:

```ts
import { createFixedBufferStorage, createManagedStorage, type Storage } from '@fulcro/memory';
import { SignedInteger } from '@fulcro/types';

// Genérico no elemento, como o contrato pede: um Storage<SignedInteger<32>>
// não é um Storage<number>, embora todo valor que ele guarda seja um número.
const totalCredits = <T extends number>(bounties: Storage<T>): number => {
	let sum = 0;

	for (let index = 0; index < bounties.length; index++) sum += bounties.get(index);

	return sum;
};

const guildBoard = createManagedStorage(3, 0);

guildBoard.set(0, 50_000);
guildBoard.set(1, 15_000);
guildBoard.set(2, 100_000);

const Credits = SignedInteger(32);
const huttLedger = createFixedBufferStorage(Credits, 2);

huttLedger.set(0, Credits.from(10_000));
huttLedger.set(1, Credits.from(7_500));

console.log(totalCredits(guildBoard)); // 165000
console.log(totalCredits(huttLedger)); // 17500 — a mesma função, sobre bytes

const { get } = guildBoard;

console.log(get(2)); // 100000 — tirada do objeto, continua funcionando

try {
	guildBoard.get(3);
} catch (error) {
	console.log((error as Error).message.startsWith('FULCRO7002')); // true — nunca lido como undefined
}
```

## Escolhendo uma estratégia

| Você precisa guardar                                          | Use                        |
| ------------------------------------------------------------- | -------------------------- |
| Qualquer valor: objetos, strings, funções, `null`             | `createManagedStorage`     |
| Muitos valores de uma struct ou de um tipo numérico, em bytes | `createFixedBufferStorage` |

## `createManagedStorage`

Memória que o motor JavaScript gerencia: um array comum, por trás do contrato.

```ts
const hangarBays: Storage<number> = createManagedStorage(3, 0);

hangarBays.set(1, 42);
hangarBays.get(1); // 42
```

O segundo argumento é o valor que toda posição guarda até ser definida, e o tipo
é inferido dele. Passe o tipo explicitamente quando as posições forem guardar
mais do que o tipo do valor inicial:

```ts
const roster = createManagedStorage<RebelPilot | null>(100, null);
```

Os valores são guardados **como são**: `get` devolve o mesmo objeto que `set`
recebeu, não uma cópia, e nada dentro de um valor é lido.

**Cuidado com o valor inicial.** É um valor só, guardado em todas as posições —
não um novo por posição. Com um objeto, toda posição começa como o mesmo objeto:

```ts
const cargoHolds = createManagedStorage(3, [] as string[]);

cargoHolds.get(0).push('spice');
cargoHolds.get(2); // ['spice'] — o mesmo array
```

Comece com `null` e defina cada posição com `set` quando cada uma precisar do
seu próprio.

A escala do Esquadrão Vermelho, guardando as fichas dos pilotos como são — e os
porões de carga que, no fim, eram todos o mesmo porão:

```ts
import { createManagedStorage } from '@fulcro/memory';

interface RebelPilot {
	callSign: string;
	name: string;
}

const roster = createManagedStorage<RebelPilot | null>(12, null);
const luke: RebelPilot = { callSign: 'Red Five', name: 'Luke Skywalker' };

roster.set(4, luke);

console.log(roster.get(4) === luke); // true — guardado como é, não copiado
console.log(roster.get(0)); // null — nunca definido

const sharedHold = createManagedStorage(3, [] as string[]);

sharedHold.get(0).push('spice');

console.log(sharedHold.get(2)); // ['spice'] — um array só em todas as posições

const ownHolds = createManagedStorage<string[] | null>(3, null);

for (let hold = 0; hold < ownHolds.length; hold++) ownHolds.set(hold, []);

ownHolds.get(0)?.push('coaxium');

console.log(ownHolds.get(2)); // [] — cada porão com o seu
```

## `createFixedBufferStorage`

Um buffer de tamanho fixo, cada valor guardado como seus bytes, um após o
outro. O tipo do elemento é uma [struct](./types.md) de `@fulcro/types`, ou um
dos seus tipos numéricos — veja abaixo:

```ts
import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

const SensorContact = struct('SensorContact', {
	bearing: SinglePrecisionFloat,
	range: SinglePrecisionFloat,
});
type SensorContact = Struct<typeof SensorContact>;

const contacts: Storage<SensorContact> = createFixedBufferStorage(SensorContact, 1_000_000);

contacts.set(0, SensorContact.from({ bearing: 1, range: 2 }));
contacts.get(0).bearing; // 1
```

**O que custa.** O buffer é alocado uma vez,
`length × SensorContact.layout.size` bytes — oito milhões aqui — e mais nada.
Nenhum objeto é criado na criação: um milhão de contatos custam os bytes, não um
milhão de objetos.

**Toda posição começa em zero.** O buffer é zerado, então uma posição que
ninguém definiu é lida como a struct com todos os campos em zero.

**Uma leitura cria um valor novo.** `get` lê os bytes e monta um valor congelado
a partir deles, um novo a cada chamada. Duas leituras do mesmo índice são iguais
por `SensorContact.equals`, mas não por `===`. E `set` guarda os bytes, não o
objeto: o valor que você passou não é o que você recebe de volta.

**Um valor do tipo errado é recusado.** `set` pergunta à struct se o valor é um
dos seus, e lança um `TypeError` com código
[`FULCRO7004`](./errors/FULCRO7xxx.md#fulcro7004) antes de escrever qualquer
byte quando não é. O compilador já recusa um objeto comum onde se espera um
`SensorContact`; isto é para o valor que chega de código sem tipos.

**Um tipo numérico é guardado sozinho.** Todo tipo numérico de layout fixo —
os inteiros de largura fixa, `HalfPrecisionFloat`, `SinglePrecisionFloat`,
`DoublePrecisionFloat` e `Decimal` — se lê e se escreve em bytes, então não
precisa de uma struct em volta:

```ts
const thermalReadings: Storage<SinglePrecisionFloat> = createFixedBufferStorage(
	SinglePrecisionFloat,
	44_100,
);

thermalReadings.set(0, SinglePrecisionFloat.from(0.5));
```

Os valores ficam um após o outro, quatro bytes cada aqui, na mesma codificação
que um campo de struct desse tipo usa. `get` devolve o próprio valor — um
número, ou um bigint a partir de 64 bits —, e não um objeto em volta dele.
`BigInteger` e `Fraction` não têm layout fixo e são recusados com
[`FULCRO7003`](./errors/FULCRO7xxx.md#fulcro7003).

Os métodos de uma struct voltam com cada valor lido, e structs se aninham,
campos `Decimal` inclusive — tudo o que uma struct pode guardar, um buffer fixo
pode armazenar.

O registro do sensor de longo alcance da Base Echo, um milhão de contatos
guardados em bytes, com as leituras térmicas ao lado guardadas como floats
soltos:

```ts
import { createFixedBufferStorage } from '@fulcro/memory';
import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

const SensorContact = struct('SensorContact', {
	bearing: SinglePrecisionFloat,
	range: SinglePrecisionFloat,
});
type SensorContact = Struct<typeof SensorContact>;

const contacts = createFixedBufferStorage(SensorContact, 1_000_000);
const probeDroid: SensorContact = SensorContact.from({ bearing: 1, range: 2 });

contacts.set(0, probeDroid);

console.log(contacts.get(0)); // { bearing: 1, range: 2 }
console.log(contacts.get(0) === probeDroid); // false — um valor novo, lido dos bytes
console.log(SensorContact.equals(contacts.get(0), probeDroid)); // true
console.log(contacts.get(999_999)); // { bearing: 0, range: 0 } — zerado até ser definido

try {
	contacts.set(1, { bearing: 3, range: 4 } as unknown as SensorContact);
} catch (error) {
	console.log((error as Error).message.startsWith('FULCRO7004')); // true — não é um SensorContact
}

const thermalReadings = createFixedBufferStorage(SinglePrecisionFloat, 44_100);

thermalReadings.set(0, SinglePrecisionFloat.from(0.5));

console.log(thermalReadings.get(0)); // 0.5 — o próprio número, não um objeto
```

### Guardado num typed array

Um tipo numérico nomeia a codificação dos seus bytes no layout —
`SinglePrecisionFloat.layout.encoding` é `'Float32'` —, e quando a linguagem
tem um typed array com esse nome, a storage guarda os valores num deles, sobre
os mesmos bytes. A escolha é feita uma vez, quando a storage é criada; daí em
diante `get` e `set` indexam o typed array e não chamam nem o `read` e o
`write` do tipo nem um acessor de `DataView`.

Nada mais muda. As mesmas verificações rodam, na mesma ordem, e recusam com os
mesmos erros; os bytes são os mesmos, em little-endian. Uma storage que o
`allocate` criou sobre um buffer que você enxerga deixa esse buffer exatamente
como deixaria sem o typed array.

Os inteiros de até 64 bits, `SinglePrecisionFloat` e `DoublePrecisionFloat`
são guardados assim. Estes são lidos e escritos pelo tipo, como uma struct:

- `HalfPrecisionFloat`: o Node 22 não tem `Float16Array`, e onde há um ele
  escreve um `NaN` num padrão de bits próprio;
- os inteiros de 128 bits e o `Decimal`, para os quais nenhum typed array é tão
  largo;
- bytes que não começam num múltiplo do tamanho, vindos de um alocador que
  ignorou o alinhamento pedido;
- todo tipo de mais de um byte numa plataforma que não é little-endian.

Um tipo de elemento escrito fora deste pacote também pode nomear uma
codificação, como `layout: { size: 4, alignment: 4, encoding: 'Int32' }`.
Nomeá-la é prometer que o `read` e o `write` dele produzem exatamente os bytes
do elemento desse typed array, em little-endian; uma codificação sem typed
array por trás não é um erro, só é lida do outro jeito.

## Alocadores

`createFixedBufferStorage` cria o seu próprio buffer. Quando você quer escolher
de onde vem a memória — uma que é liberada de uma vez no fim de um quadro, ou
uma recortada de um orçamento fixado de antemão —, peça-a a um alocador e passe
o alocador:

```ts
const step = (stack: StackAllocator): void => {
	using frame = stack.enter();
	const bolts: Storage<BlasterBolt> = allocate(BlasterBolt, 10_000, frame);

	// …
}; // todos os disparos são liberados aqui, de uma vez
```

`allocate(element, length, allocator)` devolve um `Storage<T>` exatamente como
`createFixedBufferStorage` — os valores guardados como bytes, um depois do
outro, começando em zero. Só a origem da memória muda, e o código que lê o
storage não tem como saber.

Uma simulação de treino com blasters avançando quadro a quadro, com os disparos
de cada quadro liberados de uma vez quando o quadro termina:

```ts
import { allocate, createStackAllocator, type StackAllocator, type Storage } from '@fulcro/memory';
import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

const BlasterBolt = struct('BlasterBolt', {
	heat: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});
type BlasterBolt = Struct<typeof BlasterBolt>;

const step = (stack: StackAllocator, firing: number): number => {
	using frame = stack.enter();
	const bolts: Storage<BlasterBolt> = allocate(BlasterBolt, 10_000, frame);

	for (let bolt = 0; bolt < firing; bolt++)
		bolts.set(bolt, BlasterBolt.from({ heat: 1, speed: 0.5 }));

	let heat = 0;

	for (let bolt = 0; bolt < bolts.length; bolt++) heat += bolts.get(bolt).heat;

	return heat;
}; // todos os disparos são liberados aqui, de uma vez

// Um buffer só, reaproveitado por todos os quadros: espaço para exatamente um quadro de disparos.
const stack = createStackAllocator(10_000 * BlasterBolt.layout.size);

console.log(step(stack, 3)); // 3
console.log(step(stack, 5)); // 5 — os mesmos bytes, zerados de novo para o quadro seguinte
```

### O contrato `Allocator`

```ts
interface Allocator {
	readonly allocate: (size: number, alignment: number) => Allocation;
}

interface Allocation {
	readonly bytes: DataView; // exatamente `size` bytes, zerados
	readonly isLive: () => boolean;
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
const createVolley = (count: number, allocator: Allocator): Storage<BlasterBolt> =>
	allocate(BlasterBolt, count, allocator);
```

Um retransmissor de comunicações escrevendo o cabeçalho de uma transmissão em
bytes crus, e uma rajada que não liga para qual alocador quem a chamou escolheu:

```ts
import {
	type Allocation,
	type Allocator,
	allocate,
	createArenaAllocator,
	createManagedAllocator,
	type Storage,
} from '@fulcro/memory';
import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

const BlasterBolt = struct('BlasterBolt', {
	heat: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});
type BlasterBolt = Struct<typeof BlasterBolt>;

const arena = createArenaAllocator(1024);

const header: Allocation = arena.allocate(16, 8);

header.bytes.setFloat64(0, 1138);
header.bytes.setUint16(8, 1977, true);

console.log(header.bytes.byteLength, header.bytes.getFloat64(0)); // 16 1138
console.log(header.isLive()); // true

const createVolley = (count: number, allocator: Allocator): Storage<BlasterBolt> => {
	return allocate(BlasterBolt, count, allocator);
};

console.log(createVolley(4, arena).length); // 4 — da arena
console.log(createVolley(4, createManagedAllocator()).length); // 4 — do engine; a rajada não tem como saber

arena.reset();

console.log(header.isLive()); // false — a arena pegou os seus bytes de volta
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

Ele também empresta memória pela duração de um escopo. `managed.enter()` abre
um quadro; alocar a partir do quadro reserva memória que dura até o quadro ser
deixado, e os quadros seguintes reaproveitam esses bytes em vez de pedir de novo
ao engine:

```ts
const managed = createManagedAllocator();

const step = (): void => {
	using frame = managed.enter();
	const bolts = allocate(BlasterBolt, 10_000, frame);
	// …
}; // os disparos são liberados aqui; o próximo step reaproveita os bytes
```

Diferente dos de uma pilha, esses quadros nunca recusam. A memória
reaproveitada é criada quando o quadro mais externo é deixado, no tamanho do
máximo que os quadros seguraram ao mesmo tempo; até ela existir, e para uma
requisição para a qual ela não tem espaço, um quadro entrega um buffer próprio,
como o alocador faria. Os quadros podem ser deixados em qualquer ordem: um
deixado antes guarda os seus bytes até que todo quadro aberto depois dele seja
deixado também. Um quadro já deixado recusa alocar, com
[`FULCRO7012`](./errors/FULCRO7xxx.md#fulcro7012). O transformer de memória abre
esses quadros por você — veja
[Alocado num quadro na compilação](#alocado-num-quadro-na-compilação).

**Arena.** `createArenaAllocator(chunkSize)` reserva memória `chunkSize` bytes
por vez e a entrega da frente para trás. `reset()` libera tudo de uma vez e
guarda os pedaços, então a passada seguinte não pede memória nenhuma ao engine.
Também é um domínio de alocação: entrada com `using`, ela é resetada quando o
escopo termina. Ela cresce: um pedaço cheio é seguido de outro, e uma
requisição maior que um pedaço ganha um pedaço do seu próprio tamanho.

```ts
const arena = createArenaAllocator(64 * 1024);

for (const sweep of sensorSweeps) {
	const scratch = allocate(SensorContact, sweep.length, arena);
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
	using holoMessage = pool.allocate(48, 8);
	// …
} // o bloco é do pool de novo
```

Descartar uma alocação cujo bloco já voltou não faz nada, mesmo depois de o
bloco ter sido entregue a outro; `deallocate` sobre ela continua lançando
[`FULCRO7009`](./errors/FULCRO7xxx.md#fulcro7009).

Cada factory devolve o seu alocador com um tipo próprio — `ManagedAllocator`,
`ArenaAllocator`, `StackAllocator`, `FixedBufferAllocator`, `PoolAllocator` —,
que é `Allocator` mais os métodos que devolvem memória. Use o tipo específico
onde você chama esses métodos, e `Allocator` em todo o resto.

Um dia na vida do conjunto de sensores da Estrela da Morte — uma arena por
varredura, um orçamento fixo recortado de um buffer que a estação já tem, e um
pool de espaços para holomensagens que vêm e vão em qualquer ordem:

```ts
import {
	allocate,
	createArenaAllocator,
	createFixedBufferAllocator,
	createManagedAllocator,
	createPoolAllocator,
} from '@fulcro/memory';
import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

const SensorContact = struct('SensorContact', {
	bearing: SinglePrecisionFloat,
	range: SinglePrecisionFloat,
});
type SensorContact = Struct<typeof SensorContact>;

const sensorSweeps = [[1, 2, 3], [4, 5], [6]];
const arena = createArenaAllocator(64 * 1024);
const strongest: number[] = [];

for (const sweep of sensorSweeps) {
	const scratch = allocate(SensorContact, sweep.length, arena);

	sweep.forEach((range, index) => scratch.set(index, SensorContact.from({ bearing: 0, range })));

	let best = 0;

	for (let index = 0; index < scratch.length; index++)
		best = Math.max(best, scratch.get(index).range);

	strongest.push(best);
	arena.reset(); // a próxima varredura reaproveita o mesmo pedaço
}

console.log(strongest); // [3, 5, 6]

// Um orçamento fixado de antemão: os 64 bytes da própria estação, e nem um a mais.
const budget = createFixedBufferAllocator(new ArrayBuffer(64));

console.log(allocate(SensorContact, 8, budget).length); // 8 — 64 bytes, exatamente o orçamento

try {
	allocate(SensorContact, 1, budget);
} catch (error) {
	console.log((error as Error).message.startsWith('FULCRO7007')); // true — não sobrou espaço
}

// Holomensagens de um tamanho só, enviadas e recebidas em qualquer ordem.
const pool = createPoolAllocator(48, 2);

{
	using fromVader = pool.allocate(48, 8);
	using fromTarkin = pool.allocate(48, 8);

	console.log(fromVader.isLive() && fromTarkin.isLive()); // true
} // os dois blocos são do pool de novo

using fromMotti = pool.allocate(48, 8);

console.log(fromMotti.isLive()); // true — um bloco que o escopo acima devolveu

const managed = createManagedAllocator();

console.log(allocate(SensorContact, 3, managed).length); // 3 — recuperado pelo garbage collector, nunca liberado
```

### Domínios de alocação

Um `AllocationDomain` é um alocador que também é `Disposable`: sair do seu
escopo `using` libera toda a sua região de uma vez. Uma arena é um, um alocador
de buffer fixo é um, e cada quadro de uma pilha ou de um alocador gerenciado
também. Sair custa o mesmo seja o que for que se alocou — nada é liberado uma
alocação por vez.

`using` e `await using` são do próprio TypeScript, e pedem TypeScript 5.2 ou
posterior com `esnext.disposable` em `lib` (ou `@types/node`, que declara o
mesmo) — é de lá que vêm os tipos `Disposable` e `AsyncDisposable`.

### Alocado num quadro na compilação

Com o transformer de memória configurado (veja
[Recusado na compilação](#recusado-na-compilação)), você não precisa abrir o
quadro por conta própria. Um storage alocado de um alocador gerenciado que nada
alcança depois que o seu bloco termina é levado para um quadro desse alocador:

```ts
const managed = createManagedAllocator();

const step = (): number => {
	const bolts = allocate(BlasterBolt, 1_000, managed);

	bolts.set(0, firstShot);

	return bolts.get(0).heat;
};
```

compila como se estivesse escrito

```ts
const step = (): number => {
	using frame = managed.enter();
	const bolts = allocate(BlasterBolt, 1_000, frame);

	bolts.set(0, firstShot);

	return bolts.get(0).heat;
};
```

O que o programa calcula não muda; muda quantas vezes ele pede memória ao
engine. Um laço que alocava um buffer por volta passa a fazer dois no total: o
da primeira volta, e a memória que todas as voltas seguintes reaproveitam.

O transformer só faz isso quando consegue provar, e deixa o storage onde foi
escrito nos outros casos. Ele leva uma declaração quando:

- ela é `const storage = allocate(element, length, allocator)`;
- `allocator` é um `const` que guarda `createManagedAllocator()`, neste módulo
  ou importado de outro;
- a declaração está num bloco de uma função que não é `async` nem generator —
  nunca no topo de um módulo, que nunca termina, nem onde uma suspensão poderia
  deixar o quadro aberto enquanto outro código abre quadros próprios;
- o storage só é usado como `storage.get(…)`, `storage.set(…)` ou
  `storage.length`, nesse bloco e fora de qualquer função criada nele.

Todo o resto conta como escapar: devolver o storage, passá-lo a uma função —
`move`, `borrow` e `asView` inclusive —, capturá-lo numa closure, guardá-lo num
objeto ou array, dar-lhe outro nome, ou tirar `storage.get` dele. Um storage que
escapa fica no alocador, vivo enquanto for alcançável. Sem o transformer, todo
storage fica.

Um estande de tiro que roda mil rodadas, escrito como se cada rodada pedisse um
buffer novo — compilado com o transformer de memória, as rodadas compartilham
um só, e o único storage que escapa fica com o seu:

```ts
import { allocate, createManagedAllocator, type Storage } from '@fulcro/memory';
import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

const BlasterBolt = struct('BlasterBolt', {
	heat: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});
type BlasterBolt = Struct<typeof BlasterBolt>;

const managed = createManagedAllocator();
const firstShot = BlasterBolt.from({ heat: 0.75, speed: 1 });

// Nunca escapa do seu bloco: alocado num quadro de `managed`.
const round = (): number => {
	const bolts = allocate(BlasterBolt, 1_000, managed);

	bolts.set(0, firstShot);

	return bolts.get(0).heat;
};

// Devolvido a quem chamou: escapa, e fica onde foi escrito.
const keepForTheRecord = (): Storage<BlasterBolt> => {
	const record = allocate(BlasterBolt, 1, managed);

	record.set(0, firstShot);

	return record;
};

let heat = 0;

for (let shot = 0; shot < 1_000; shot++) heat += round();

console.log(heat); // 750 — a mesma resposta, a partir de dois buffers em vez de mil
console.log(keepForTheRecord().get(0).heat); // 0.75 — ainda vivo depois que a sua função retornou
```

### Memória liberada é recusada, não lida

Liberar não tira a memória de quem ainda a segura: os bytes continuam lá, e o
alocador os entrega à próxima requisição. Por isso cada alocação sabe dizer se
ainda é dela — `isLive()` vira `false` no momento em que a sua memória é
liberada, e continua falso depois que os bytes são entregues de novo —, e um
storage de `allocate` pergunta antes de cada `get` e `set`:

```ts
const arena = createArenaAllocator(1024);
const firstSweep = allocate(SensorContact, 1, arena);

arena.reset();
const secondSweep = allocate(SensorContact, 1, arena); // os mesmos bytes
secondSweep.set(0, SensorContact.from({ bearing: 7, range: 7 }));

firstSweep.get(0); // lança FULCRO7009 — nunca lê o contato da segunda varredura
```

Custa uma comparação por acesso. Não cobre os `bytes` de uma alocação que você
pediu diretamente: confira `isLive()` você mesmo antes de lê-los quando uma
liberação pode ter acontecido.

As mesmas duas varreduras, com a recusa capturada e o contato da segunda
varredura intacto:

```ts
import { allocate, createArenaAllocator } from '@fulcro/memory';
import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

const SensorContact = struct('SensorContact', {
	bearing: SinglePrecisionFloat,
	range: SinglePrecisionFloat,
});
type SensorContact = Struct<typeof SensorContact>;

const arena = createArenaAllocator(1024);
const firstSweep = allocate(SensorContact, 1, arena);

arena.reset();

const secondSweep = allocate(SensorContact, 1, arena);

secondSweep.set(0, SensorContact.from({ bearing: 7, range: 7 }));

try {
	firstSweep.get(0);
} catch (error) {
	console.log((error as Error).message.startsWith('FULCRO7009')); // true — liberado, então recusado
}

console.log(secondSweep.get(0)); // { bearing: 7, range: 7 }
```

### Escrevendo um alocador próprio

Qualquer coisa com um `allocate(size, alignment)` que devolve
`{ bytes, isLive }` é um alocador, e `allocate` e toda função escrita contra
`Allocator` o aceitam sem que este pacote mude. Honre o contrato inteiro:
exatamente `size` bytes, zerados, começando num múltiplo de `alignment`, nunca
compartilhados com outra alocação viva, e `isLive()` falso a partir do momento
em que são liberados.

Um alocador que conta o que os intendentes do Império pedem a ele, e entrega a
cada pedido um buffer próprio:

```ts
import { type Allocation, type Allocator, allocate } from '@fulcro/memory';
import { SinglePrecisionFloat } from '@fulcro/types';

const requests: number[] = [];

const quartermaster: Allocator = {
	allocate: (size: number): Allocation => {
		requests.push(size);

		return { bytes: new DataView(new ArrayBuffer(size)), isLive: () => true };
	},
};

const rations = allocate(SinglePrecisionFloat, 250, quartermaster);

rations.set(0, SinglePrecisionFloat.from(1.5));

console.log(rations.get(0)); // 1.5
console.log(requests); // [1000] — 250 floats de quatro bytes, pedidos uma vez
```

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
	readonly get: (index: number) => T;
	readonly subview: (start: number, length?: number) => ReadOnlyView<T>;
}

interface View<T> extends ReadOnlyView<T> {
	readonly set: (index: number, value: T) => void;
	readonly subview: (start: number, length?: number) => View<T>;
	readonly readOnly: () => ReadOnlyView<T>;
}
```

`asView(source, start?, length?)` observa uma região de um storage, de outra
view ou de um array:

```ts
const shieldStrength: Storage<number> = createManagedStorage(100, 0);
const firstTen: View<number> = asView(shieldStrength, 0, 10);
const rest: View<number> = asView(shieldStrength, 10); // posições 10 a 99

firstTen.set(3, 42);
shieldStrength.get(3); // 42 — a view escreveu no storage
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
totalCredits(asView(bounties, 10, 5)); // o `totalCredits` do contrato acima
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

A grade de escudos da Estrela da Morte, dividida entre as equipes que cuidam
dela — uma equipe escreve os seus setores, o painel dos oficiais só lê:

```ts
import { asReadOnlyView, asView, createManagedStorage, type Storage } from '@fulcro/memory';

const totalStrength = (sectors: Storage<number>): number => {
	let sum = 0;

	for (let index = 0; index < sectors.length; index++) sum += sectors.get(index);

	return sum;
};

const shieldGrid = createManagedStorage(100, 50);
const northernCrew = asView(shieldGrid, 0, 10);
const southernHemisphere = asView(shieldGrid, 50);

northernCrew.set(3, 100);

console.log(shieldGrid.get(3)); // 100 — a view escreveu na grade
console.log(totalStrength(northernCrew)); // 550 — uma view vai aonde um storage vai
console.log(southernHemisphere.length); // 50
console.log(northernCrew.subview(2, 3).get(1)); // 100 — o mesmo setor, visto por uma subview

const officersDisplay = asReadOnlyView(shieldGrid, 0, 10);

console.log('set' in officersDisplay); // false — nenhum jeito de escrever de volta, com cast ou sem

const exhaustPorts = [2, 0, 0];
const portView = asView(exhaustPorts);

exhaustPorts.length = 1;

try {
	portView.get(2);
} catch (error) {
	console.log((error as Error).message.startsWith('FULCRO7015')); // true — o array encolheu além dele
}
```

### `Pointer<T>`

`pointerTo(source, index)` aponta para uma posição de um storage, de uma view
ou de um array:

```ts
const launchQueue: Storage<string> = createManagedStorage(8, '');
const head: Pointer<string> = pointerTo(launchQueue, 0);

head.set('Red Leader');
head.offset(1).set('Red Two');
launchQueue.get(1); // 'Red Two'
```

`offset(delta)` devolve um ponteiro novo, para frente ou para trás, e deixa o
original como estava. Um ponteiro pode ficar uma posição depois do último
valor, para que um laço chegue ao fim e pare ali:

```ts
for (
	let cursor = pointerTo(launchQueue, 0);
	cursor.index < launchQueue.length;
	cursor = cursor.offset(1)
) {
	cursor.get();
}
```

Ler ou escrever no fim lança `FULCRO7002`. Apontar fora de `0` até o
comprimento lança [`FULCRO7016`](./errors/FULCRO7xxx.md#fulcro7016).
`asView(pointer, length)` observa a região que começa no ponteiro: um valor
quando o comprimento é omitido.

A fila de decolagem no convés do hangar de Yavin 4, chamada piloto por piloto:

```ts
import { asView, createManagedStorage, pointerTo } from '@fulcro/memory';

const launchQueue = createManagedStorage(4, '');
const head = pointerTo(launchQueue, 0);

head.set('Red Leader');
head.offset(1).set('Red Two');
head.offset(2).set('Red Five');

const calledOut: string[] = [];

for (
	let cursor = pointerTo(launchQueue, 0);
	cursor.index < launchQueue.length;
	cursor = cursor.offset(1)
) {
	if (cursor.get() !== '') calledOut.push(cursor.get());
}

console.log(calledOut); // ['Red Leader', 'Red Two', 'Red Five']
console.log(head.index); // 0 — offset criou ponteiros novos e deixou este onde estava
console.log(asView(head.offset(1), 2).get(1)); // 'Red Five' — a região que começa no ponteiro
```

### `MemoryReference<T>`

`referenceTo(value)` cria um valor que pode ser lido e substituído. Entregue-o
a um código que precisa mudar um valor do qual não é dono:

```ts
const recordKill = (counter: MemoryReference<number>): void => {
	counter.set(counter.get() + 1);
};

const kills = referenceTo(0);

recordKill(kills);
kills.get(); // 1
```

O valor é guardado como está, nunca copiado. Uma referência não tem posição
nem aritmética. Isso é o que um ponteiro acrescenta, e todo `Pointer<T>` também
é uma `MemoryReference<T>`, então `recordKill(pointerTo(squadronKills, 3))`
funciona. `asView(reference)` a observa como uma view de comprimento `1`.

Os contadores de abates da Batalha de Yavin — um guardado sozinho, os outros
dentro da contagem do esquadrão — todos incrementados pela mesma função:

```ts
import {
	asView,
	createManagedStorage,
	type MemoryReference,
	pointerTo,
	referenceTo,
} from '@fulcro/memory';

const recordKill = (counter: MemoryReference<number>): void => {
	counter.set(counter.get() + 1);
};

const hansKills = referenceTo(0);
const squadronKills = createManagedStorage(6, 0);

recordKill(hansKills);
recordKill(pointerTo(squadronKills, 4)); // Red Five
recordKill(pointerTo(squadronKills, 4));

console.log(hansKills.get()); // 1 — "Grande tiro, garoto"
console.log(squadronKills.get(4)); // 2
console.log(asView(hansKills).length); // 1
```

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
	readonly get: () => T;
	readonly set: (value: T) => void;
	readonly at: {
		(byteOffset: number): NativePointer<T>;
		<TOther>(byteOffset: number, element: AlignedElement<TOther>): NativePointer<TOther>;
	};
}
```

### `createLinearMemory`

`createLinearMemory(backing)` abrange um `ArrayBuffer`, ou o
`WebAssembly.Memory` que um módulo exporta:

```ts
const { instance } = await WebAssembly.instantiate(navicomputerWasm);
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
elemento — um struct ou um tipo numérico, como em `allocate`:

```ts
const latest: NativePointer<ScannerReading> = nativePointerTo(
	memory,
	moduleExports.latest(),
	ScannerReading,
);

latest.get(); // a leitura que o módulo escreveu, lida onde ele a escreveu
latest.set(ScannerReading.from({ strength: 0 })); // e o módulo enxerga isto
```

`at(byteOffset)` move o ponteiro em bytes, para frente ou para trás, e deixa o
original como estava. Entregue também um tipo, e ele lê os bytes dali como
esse tipo. É assim que um ponteiro alcança um campo de um struct, no lugar:

```ts
const xWing: NativePointer<Starfighter> = nativePointerTo(memory, 64, Starfighter);
const thrust: NativePointer<Thrust> = xWing.at(Starfighter.layout.fields.thrust.offset, Thrust);

thrust.set(Thrust.from({ forward: 0, lateral: -9.8 })); // escreve o empuxo do caça
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

O computador de navegação da Falcon, um módulo WebAssembly, informando onde
deixou a sua última leitura do scanner — lida onde o módulo a escreveu, e o
empuxo de um caça alcançado no lugar, dentro de uma struct:

```ts
// Os tipos do WebAssembly vêm com a biblioteca DOM; um projeto Node sem ela a nomeia aqui.
/// <reference lib="dom" />
import { createLinearMemory, nativePointerTo } from '@fulcro/memory';
import { SinglePrecisionFloat, struct } from '@fulcro/types';

// Um módulo que exporta uma página de memória e `latest()`, que responde 64 — o
// endereço em que escreveu a sua última leitura. Compilado a partir do código do
// computador de navegação; os seus bytes estão escritos aqui para o exemplo rodar sozinho.
const navicomputerWasm = new Uint8Array([
	0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f, 0x03,
	0x02, 0x01, 0x00, 0x05, 0x03, 0x01, 0x00, 0x01, 0x07, 0x13, 0x02, 0x06, 0x6d, 0x65, 0x6d, 0x6f,
	0x72, 0x79, 0x02, 0x00, 0x06, 0x6c, 0x61, 0x74, 0x65, 0x73, 0x74, 0x00, 0x00, 0x0a, 0x07, 0x01,
	0x05, 0x00, 0x41, 0xc0, 0x00, 0x0b,
]);

const { instance } = await WebAssembly.instantiate(navicomputerWasm);
const moduleExports = instance.exports as { memory: WebAssembly.Memory; latest: () => number };

const memory = createLinearMemory(moduleExports.memory);

console.log(memory.byteLength); // 65536 — uma página

const ScannerReading = struct('ScannerReading', { strength: SinglePrecisionFloat });

const latest = nativePointerTo(memory, moduleExports.latest(), ScannerReading);

latest.set(ScannerReading.from({ strength: 0.75 }));

console.log(new Float32Array(moduleExports.memory.buffer, 64, 1)[0]); // 0.75 — o módulo enxerga
console.log(latest.get()); // { strength: 0.75 }

const Thrust = struct('Thrust', { forward: SinglePrecisionFloat, lateral: SinglePrecisionFloat });
const Starfighter = struct('Starfighter', { shields: SinglePrecisionFloat, thrust: Thrust });

const xWing = nativePointerTo(memory, 128, Starfighter);
const thrust = xWing.at(Starfighter.layout.fields.thrust.offset, Thrust);

thrust.set(Thrust.from({ forward: 0, lateral: -9.75 }));

console.log(xWing.get().thrust.lateral); // -9.75 — escrito por um ponteiro para o campo
console.log(thrust.address - xWing.address); // 4 — o offset do campo, em bytes

try {
	nativePointerTo(memory, 66, Starfighter);
} catch (error) {
	console.log((error as Error).message.startsWith('FULCRO7020')); // true — não alinhado para o tipo
}
```

### `nativePointerTo(allocation, element)`

Aponta para o primeiro byte de uma alocação:

```ts
const allocation = arena.allocate(
	TransmissionHeader.layout.size,
	TransmissionHeader.layout.alignment,
);
const header: NativePointer<TransmissionHeader> = nativePointerTo(allocation, TransmissionHeader);

header.set(TransmissionHeader.from({ channel: 2, length: 0 }));
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

O cabeçalho de uma transmissão escrito por um ponteiro para a sua alocação, e
recusado assim que a arena do retransmissor pega os bytes de volta:

```ts
import { createArenaAllocator, nativePointerTo } from '@fulcro/memory';
import { struct, UnsignedInteger } from '@fulcro/types';

const TransmissionHeader = struct('TransmissionHeader', {
	channel: UnsignedInteger(16),
	length: UnsignedInteger(32),
});

const arena = createArenaAllocator(1024);
const allocation = arena.allocate(
	TransmissionHeader.layout.size,
	TransmissionHeader.layout.alignment,
);
const header = nativePointerTo(allocation, TransmissionHeader);

header.set(TransmissionHeader.from({ channel: 2, length: 1138 }));

console.log(header.get()); // { channel: 2, length: 1138 }

try {
	header.at(TransmissionHeader.layout.size);
	header.at(TransmissionHeader.layout.size + 4);
} catch (error) {
	console.log((error as Error).message.startsWith('FULCRO7019')); // true — além dos bytes da alocação
}

arena.reset();

try {
	header.get();
} catch (error) {
	console.log((error as Error).message.startsWith('FULCRO7009')); // true — os bytes voltaram para a arena
}
```

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
const shieldStrength: Owned<number> = own(() => createManagedStorage(100, 0));
const bolts = own(() => allocate(BlasterBolt, 10_000, arena));
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
const totalStrength = (sectors: ReadOnlyView<number>): number => {
	let sum = 0;

	for (let index = 0; index < sectors.length; index++) sum += sectors.get(index);

	return sum;
};

borrowMutable(shieldStrength).set(3, 42);
totalStrength(borrow(shieldStrength)); // 42
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

A grade de escudos da segunda Estrela da Morte, de posse da estação, lida por
dois oficiais ao mesmo tempo e escrita só pelo engenheiro-chefe — e o painel do
oficial que continuou lendo depois que o engenheiro assumiu:

```ts
import {
	borrow,
	borrowMutable,
	createManagedStorage,
	own,
	type ReadOnlyView,
} from '@fulcro/memory';

const totalStrength = (sectors: ReadOnlyView<number>): number => {
	let sum = 0;

	for (let index = 0; index < sectors.length; index++) sum += sectors.get(index);

	return sum;
};

const shieldGrid = own(() => createManagedStorage(10, 0));

borrowMutable(shieldGrid).set(3, 42);

const forMotti = borrow(shieldGrid);
const forTagge = borrow(shieldGrid);

console.log(totalStrength(forMotti), totalStrength(forTagge)); // 42 42 — empréstimos compartilhados convivem

// O painel dos oficiais guarda o seu empréstimo num objeto de console, onde o
// compilador não o segue — então quem recusa é o runtime.
const officersConsole = { reading: borrow(shieldGrid) };

borrowMutable(shieldGrid).set(4, 58); // o engenheiro-chefe assume a grade

try {
	officersConsole.reading.get(4);
} catch (error) {
	console.log((error as Error).message.startsWith('FULCRO7024')); // true — o empréstimo terminou
}

console.log(totalStrength(borrow(shieldGrid))); // 100 — um empréstimo novo vê o trabalho do engenheiro
```

### `move(owner)`

```ts
const launchQueue = own(() => createManagedStorage(64, 0));
const hangarCrew = move(launchQueue);

borrow(hangarCrew).get(0); // ok
borrow(launchQueue); // lança FULCRO7023: launchQueue foi movido
```

O novo dono possui exatamente os mesmos valores; nada é copiado. O dono antigo
recusa tudo o que lhe pedem dali em diante, o seu `length` inclusive, com
[`FULCRO7023`](./errors/FULCRO7xxx.md#fulcro7023).

A fila de decolagem passada do controlador de voo para a equipe do hangar — e o
console do controlador, que ainda guardava o dono antigo:

```ts
import { borrow, borrowMutable, createManagedStorage, move, own } from '@fulcro/memory';

const flightControl = { queue: own(() => createManagedStorage(4, 0)) };

borrowMutable(flightControl.queue).set(0, 5);

const hangarCrew = move(flightControl.queue);

console.log(borrow(hangarCrew).get(0)); // 5 — os mesmos valores, nada copiado

try {
	console.log(flightControl.queue.length);
} catch (error) {
	console.log((error as Error).message.startsWith('FULCRO7023')); // true — movido, e recusado, length inclusive
}
```

### Encerrando a posse com `using`

Um dono declarado com `using` termina com o seu escopo, termine o escopo como
terminar: todo empréstimo tomado dele termina, e o dono recusa tudo o que lhe
pedem depois com [`FULCRO7030`](./errors/FULCRO7xxx.md#fulcro7030).

```ts
{
	using frame = stack.enter();
	using bolts = own(() => allocate(BlasterBolt, 10_000, frame));

	borrowMutable(bolts).set(0, BlasterBolt.from({ heat: 1, speed: 2 }));
} // os empréstimos de bolts terminam, e depois o quadro libera a memória deles
```

Descartar encerra a posse, não a memória: os bytes pertencem ao alocador, e
voltam quando o alocador os libera — aqui, quando o quadro declarado antes do
dono é deixado logo depois dele, já que o `using` encerra primeiro a última
declaração.

Um dono de onde se moveu não é mais o dono, então o fim do seu escopo não tem o
que encerrar, e o dono que o `move` devolveu mantém os seus empréstimos:

```ts
const handOver = (): Owned<number> => {
	using shieldStrength = own(() => createManagedStorage(100, 0));

	return move(shieldStrength); // sair descarta shieldStrength, o que não faz nada
};
```

Descartar duas vezes é descartar uma.

Uma rodada de treino cujos disparos terminam com o seu escopo, e uma escala de
serviço passada adiante no fim de um turno — o escopo termina, a escala passada
adiante continua viva:

```ts
import {
	allocate,
	borrow,
	borrowMutable,
	createManagedStorage,
	createStackAllocator,
	move,
	own,
	type Owned,
} from '@fulcro/memory';
import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

const BlasterBolt = struct('BlasterBolt', {
	heat: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});
type BlasterBolt = Struct<typeof BlasterBolt>;

const stack = createStackAllocator(10_000 * BlasterBolt.layout.size);
const range = { lastRun: undefined as Owned<BlasterBolt> | undefined };

{
	using frame = stack.enter();
	using bolts = own(() => allocate(BlasterBolt, 10_000, frame));

	borrowMutable(bolts).set(0, BlasterBolt.from({ heat: 1, speed: 2 }));
	range.lastRun = bolts;

	console.log(borrow(bolts).get(0).heat); // 1
} // os empréstimos de bolts terminam, e depois o quadro libera a memória deles

try {
	console.log(range.lastRun?.length);
} catch (error) {
	console.log((error as Error).message.startsWith('FULCRO7030')); // true — descartado com o seu escopo
}

const handOver = (): Owned<number> => {
	using dutyRoster = own(() => createManagedStorage(3, 0));

	borrowMutable(dutyRoster).set(0, 7567); // o Capitão Rex no primeiro turno

	return move(dutyRoster); // sair descarta dutyRoster, o que não faz nada
};

const nextShift = handOver();

console.log(borrow(nextShift).get(0)); // 7567 — o dono movido manteve tudo
```

### Recusado na compilação

Todas as recusas acima acontecem em runtime, nos caminhos que rodam. O
transformer do memory recusa os mesmos usos na compilação, no uso, e diz onde
estava o move ou o empréstimo conflitante:

```text
FULCRO7027: move: 'launchQueue' is used after it was moved at line 2; use the owner move returned.
FULCRO7028: borrow: the borrow 'reading' is used after borrowMutable(shieldGrid) at line 8 ended it.
FULCRO7029: borrow: the borrow 'reading' is used after its owner 'shieldGrid' was moved at line 9.
```

Ele é opcional e não reescreve nenhuma chamada: a única coisa que reescreve é
uma declaração que ele prova não sobreviver ao seu bloco — veja
[Alocado num quadro na compilação](#alocado-num-quadro-na-compilação).
Configure-o pelo `ts-patch`:

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

Este arquivo não compila com o transformer do memory — a fila de decolagem é
usada depois de passada adiante, e o build diz isso nessa linha, antes de o
programa poder rodar:

```ts
import { borrow, createManagedStorage, move, own } from '@fulcro/memory';

const launchQueue = own(() => createManagedStorage(64, 0));
const hangarCrew = move(launchQueue);

console.log(borrow(hangarCrew).get(0));
console.log(borrow(launchQueue).get(0)); // recusado pelo build: FULCRO7027
```

A configuração do Vite de um projeto que usa os três transformers:

```ts
// vite.config.ts dos sistemas da Estrela da Morte
import { vite as fulcroCollections } from '@fulcro/collections/unplugin';
import { vite as fulcroMemory } from '@fulcro/memory/unplugin';
import { vite as fulcroReflect } from '@fulcro/reflect/unplugin';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [fulcroReflect(), fulcroCollections(), fulcroMemory()],
});
```

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
| [`FULCRO7012`](./errors/FULCRO7xxx.md#fulcro7012) | Um quadro usado para alocar depois de deixado                   |
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
