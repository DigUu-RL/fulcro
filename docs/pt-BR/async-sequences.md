# Sequências assíncronas

🇺🇸 English: [Read this documentation in English](../async-sequences.md)

Consultas sobre dados que chegam com o tempo — páginas de uma API, linhas de um
arquivo, registros de um cursor — com os mesmos operadores que você já conhece de
[`Sequence`](./sequences.md).

```sh
npm install @fulcro/collections
```

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';
```

Fica atrás do seu próprio subpath, para que um bundle que importa só a sequência
síncrona não carregue nada dela.

## A versão de trinta segundos

```ts
const officers = await AsyncSequenceCollection.from(fetchCrewPages())
	.where((member) => member.rank === 'officer')
	.select((member) => member.name)
	.take(10)
	.toArray();
```

Se você já usou a sequência síncrona, já conhece esta. **Uma regra cobre a
superfície inteira:**

- Os operadores que devolviam uma `Sequence` agora devolvem uma `AsyncSequence`,
  e mantêm os seus nomes.
- Os operadores que devolviam um valor agora devolvem uma `Promise` dele, e
  mantêm os seus nomes.

Não existe `toArrayAsync`, nem `whereAsync`. O `await` é a única coisa que muda
na chamada.

A mesma consulta contra o registro de pessoal da Estrela da Morte, servido uma
página de cada vez, com as páginas que de fato foram pedidas contadas:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface CrewMember {
	name: string;
	rank: 'officer' | 'stormtrooper' | 'technician';
	station: string;
}

interface CrewPage {
	items: CrewMember[];
	next?: string;
}

const registry: Record<string, CrewPage> = {
	start: {
		items: [
			{ name: 'Grand Moff Tarkin', rank: 'officer', station: 'Overbridge' },
			{ name: 'TK-421', rank: 'stormtrooper', station: 'Docking Bay 327' },
		],
		next: 'page-2',
	},
	'page-2': {
		items: [
			{ name: 'Admiral Motti', rank: 'officer', station: 'Conference room' },
			{ name: 'General Tagge', rank: 'officer', station: 'Conference room' },
		],
		next: 'page-3',
	},
	'page-3': {
		items: [{ name: 'Superlaser gunner', rank: 'technician', station: 'Superlaser' }],
	},
};

let pagesRequested = 0;

const imperialNet = {
	crew: async ({ cursor }: { cursor?: string }): Promise<CrewPage> => {
		pagesRequested++;

		return registry[cursor ?? 'start'];
	},
};

const fetchCrewPages = async function* (): AsyncGenerator<CrewMember> {
	let cursor: string | undefined;

	do {
		const page = await imperialNet.crew({ cursor });

		yield* page.items;

		cursor = page.next;
	} while (cursor !== undefined);
};

const officers = await AsyncSequenceCollection.from(fetchCrewPages())
	.where((member) => member.rank === 'officer')
	.select((member) => member.name)
	.take(2)
	.toArray();

console.log(officers); // ['Grand Moff Tarkin', 'Admiral Motti']
console.log(pagesRequested); // 2 — a terceira página nunca foi pedida
```

## De onde vêm os elementos

`from` aceita três formas, e raramente você precisa pensar em qual:

```ts
// Algo que produz com o tempo.
AsyncSequenceCollection.from(hyperspaceBeacons());

// Um array ou generator comum, levado para o mundo assíncrono.
AsyncSequenceCollection.from(['Sullust', 'Endor']);

// Um array de promises — a forma `names.map(load)`.
AsyncSequenceCollection.from(names.map((name) => loadJediRecord(name)));
```

As três, alimentando o plano de reunião para a Batalha de Endor:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const wait = (milliseconds: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

// Faróis respondendo um de cada vez, à medida que o sinal cruza a galáxia.
const hyperspaceBeacons = async function* (): AsyncGenerator<string> {
	for (const beacon of ['Corellia', 'Kuat', 'Fondor']) {
		await wait(10);
		yield beacon;
	}
};

// Um plano que já está em mãos.
const rendezvous = ['Sullust', 'Endor'];

// Registros carregados juntos, cada um resolvendo quando fica pronto.
const loadJediRecord = async (name: string): Promise<string> => {
	await wait(5);

	return `Master ${name}`;
};

console.log(await AsyncSequenceCollection.from(hyperspaceBeacons()).toArray()); // ['Corellia', 'Kuat', 'Fondor']
console.log(await AsyncSequenceCollection.from(rendezvous).toArray()); // ['Sullust', 'Endor']

console.log(await AsyncSequenceCollection.from(['Yoda', 'Kenobi'].map(loadJediRecord)).toArray());
// ['Master Yoda', 'Master Kenobi']
```

Um async generator costuma ser como a primeira é escrita:

```ts
async function* fetchCrewPages(): AsyncGenerator<CrewMember> {
	let cursor: string | undefined;

	do {
		const page = await imperialNet.crew({ cursor });

		yield* page.items;

		cursor = page.next;
	} while (cursor !== undefined);
}
```

Nada nessa função roda até algo consumir a sequência, e ela deixa de ser chamada
no momento em que o consumidor para de pedir.

Espiões bothanos repassando informação por uma rede paginada por cursor — o
consumidor para no primeiro relatório sobre a segunda Estrela da Morte, e a rede
para junto:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface IntelligenceReport {
	source: string;
	subject: string;
}

interface ReportPage {
	items: IntelligenceReport[];
	next?: number;
}

const relay: ReportPage[] = [
	{ items: [{ source: 'Bothan cell 7', subject: 'Imperial supply convoy' }], next: 1 },
	{ items: [{ source: 'Bothan cell 2', subject: 'Second Death Star, Endor system' }], next: 2 },
	{ items: [{ source: 'Bothan cell 4', subject: 'The Emperor will oversee the final stages' }] },
];

const pagesRelayed: number[] = [];

const bothanNetwork = {
	reports: async ({ cursor }: { cursor?: number }): Promise<ReportPage> => {
		const index = cursor ?? 0;

		pagesRelayed.push(index);
		await new Promise((resolve) => setTimeout(resolve, 5));

		return relay[index];
	},
};

async function* interceptReports(): AsyncGenerator<IntelligenceReport> {
	let cursor: number | undefined;

	do {
		const page = await bothanNetwork.reports({ cursor });

		yield* page.items;

		cursor = page.next;
	} while (cursor !== undefined);
}

const breakthrough = await AsyncSequenceCollection.from(interceptReports())
	.where((report) => report.subject.includes('Death Star'))
	.first();

console.log(`${breakthrough.source}: ${breakthrough.subject}`); // 'Bothan cell 2: Second Death Star, Endor system'
console.log(pagesRelayed); // [0, 1] — "Muitos bothanos morreram para nos trazer esta informação"; nenhum precisou morrer pela página 2
```

## Suas funções podem ser síncronas ou assíncronas — as duas funcionam

Toda projeção, predicado e ação aceita qualquer uma:

```ts
.where((trooper) => trooper.startsWith('TK'))           // tudo certo
.where(async (trooper) => hasClearance(trooper))        // também certo
```

Você nunca embrulha nada, e não há um segundo nome de operador para lembrar.

Uma verificação de embarque na Estrela da Morte, com um teste respondido na hora
e outro que precisa perguntar à segurança imperial:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const securityClearance = new Map([
	['TK-421', false],
	['FN-2187', true],
	['TK-9091', false],
]);

const hasClearance = async (designation: string): Promise<boolean> => {
	await new Promise((resolve) => setTimeout(resolve, 5));

	return securityClearance.get(designation) ?? false;
};

const cleared = await AsyncSequenceCollection.from(['TK-421', 'FN-2187', 'CT-7567', 'TK-9091'])
	.where((designation) => designation.startsWith('TK') || designation.startsWith('FN'))
	.where(async (designation) => hasClearance(designation))
	.toArray();

console.log(cleared); // ['FN-2187']
```

## Nada roda até você pedir, e nada roda adiantado

Duas propriedades que vale conhecer, porque são elas que tornam isto utilizável
em dados grandes demais para segurar.

**Adiado.** Montar uma cadeia não lê nada:

```ts
const contacts = AsyncSequenceCollection.from(scannerFeed()).select(identify); // nenhum I/O ainda

const identified = await contacts.toArray(); // agora lê
```

**Contrapressão.** Um elemento é puxado, processado, e só então o próximo é
pedido. Um arquivo sendo lido em stream nunca fica em buffer à frente do código
que o lê.

E um operador que já tem o que precisa para de puxar — o que é a diferença entre
terminar e travar numa fonte sem fim:

```ts
// `scannerFeed()` nunca termina. Isto ainda assim retorna.
const firstThree = await AsyncSequenceCollection.from(scannerFeed()).take(3).toArray();
```

O scanner da Falcon na entrada do campo de asteroides de Hoth: um feed sem fim,
lido só até onde a pergunta precisa:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface ScannerReading {
	contact: string;
	bearing: number;
}

let readingsTaken = 0;

const scannerFeed = async function* (): AsyncGenerator<ScannerReading> {
	const contacts = ['TIE fighter', 'TIE fighter', 'Star Destroyer', 'asteroid', 'TIE interceptor'];

	for (let tick = 0; ; tick++) {
		readingsTaken++;
		await new Promise((resolve) => setTimeout(resolve, 1));

		yield { contact: contacts[tick % contacts.length] ?? 'unknown', bearing: (tick * 37) % 360 };
	}
};

const pursuers = AsyncSequenceCollection.from(scannerFeed())
	.where((reading) => reading.contact.startsWith('TIE'))
	.select((reading) => `${reading.contact} at ${String(reading.bearing)}°`);

console.log(readingsTaken); // 0 — montar a cadeia não leu nada

console.log(await pursuers.take(3).toArray());
// ['TIE fighter at 0°', 'TIE fighter at 37°', 'TIE interceptor at 148°']

console.log(readingsTaken); // 5 — e o feed ficou onde a resposta foi encontrada
```

## Cenários reais

### Paginando uma API sem segurar todas as páginas

```ts
const ships = await AsyncSequenceCollection.from(fetchGuildPages())
	.where((hunter) => hunter.active)
	.select((hunter) => hunter.ship)
	.toArray();
```

Fica uma página na memória de cada vez, quantas houver.

O diretório da Guilda dos Caçadores de Recompensa, lido até o fim, uma página de
cada vez:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface BountyHunter {
	name: string;
	ship: string;
	active: boolean;
}

const guildDirectory: BountyHunter[][] = [
	[
		{ name: 'Boba Fett', ship: 'Slave I', active: true },
		{ name: 'Bossk', ship: "Hound's Tooth", active: true },
	],
	[
		{ name: 'IG-88', ship: 'IG-2000', active: false },
		{ name: 'Din Djarin', ship: 'Razor Crest', active: true },
	],
	[{ name: 'Cad Bane', ship: 'Justifier', active: false }],
];

let largestPageHeld = 0;

const fetchGuildPages = async function* (): AsyncGenerator<BountyHunter> {
	for (const page of guildDirectory) {
		await new Promise((resolve) => setTimeout(resolve, 5));
		largestPageHeld = Math.max(largestPageHeld, page.length);

		yield* page;
	}
};

const ships = await AsyncSequenceCollection.from(fetchGuildPages())
	.where((hunter) => hunter.active)
	.select((hunter) => hunter.ship)
	.toArray();

console.log(ships); // ['Slave I', "Hound's Tooth", 'Razor Crest']
console.log(largestPageHeld); // 2 — nunca mais do que uma página em mãos
```

### Lendo um arquivo grande linha a linha

```ts
const lines = createInterface({
	input: createReadStream('docking-bay-94.log'),
	crlfDelay: Number.POSITIVE_INFINITY,
});

const refusals = await AsyncSequenceCollection.from(lines)
	.where((line) => line.includes(' refused: '))
	.take(100)
	.toArray();
```

O `readline` já é um async iterable, então entra direto. A leitura para depois da
centésima recusa, e não no fim do arquivo.

O registro de atracagem de Mos Eisley, gravado e depois lido de volta do jeito
que um registro de verdade seria — em stream, não carregado inteiro:

```ts
import { createReadStream, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { AsyncSequenceCollection } from '@fulcro/collections/async';

const logPath = join(tmpdir(), 'docking-bay-94.log');

writeFileSync(
	logPath,
	[
		'0907 ARRIVAL Millennium Falcon cleared',
		'0915 DEPARTURE Sandcrawler cleared',
		'0921 INSPECTION Millennium Falcon refused: no Imperial permit',
		'0930 ARRIVAL TIE patrol cleared',
		'0942 INSPECTION Millennium Falcon refused: blaster fire in the bay',
	].join('\n'),
);

const lines = createInterface({
	input: createReadStream(logPath),
	crlfDelay: Number.POSITIVE_INFINITY,
});

const refusals = await AsyncSequenceCollection.from(lines)
	.where((line) => line.includes(' refused: '))
	.select((line) => line.split(' refused: ')[1])
	.take(100)
	.toArray();

console.log(refusals); // ['no Imperial permit', 'blaster fire in the bay']
```

### Gravando em lotes

```ts
await AsyncSequenceCollection.from(streamCensus())
	.select(normalize)
	.chunk(500)
	.forEach((batch) => imperialArchive.insertMany(batch));
```

`chunk` é como um stream vira lotes sem que o stream seja reunido antes.

O censo imperial de uma legião de stormtroopers, enviado em stream para o
arquivo em lotes de quinhentos:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const imperialArchive = {
	batches: [] as number[],
	async insertMany(batch: readonly string[]): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, 1));
		this.batches.push(batch.length);
	},
};

const streamCensus = async function* (): AsyncGenerator<string> {
	for (let number = 1; number <= 1_250; number++) yield `tk-${String(number).padStart(4, '0')}`;
};

const normalize = (designation: string): string => designation.toUpperCase();

await AsyncSequenceCollection.from(streamCensus())
	.select(normalize)
	.chunk(500)
	.forEach((batch) => imperialArchive.insertMany(batch));

console.log(imperialArchive.batches); // [500, 500, 250]
```

### Um total corrente à medida que os valores chegam

```ts
const balances = AsyncSequenceCollection.from(wagers()).scan(
	0,
	(balance, wager) => balance + wager.credits,
);

for await (const balance of balances) render(balance);
```

Uma noite nas mesas de Canto Bight, com o saldo mostrado depois de cada mão:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface Wager {
	table: string;
	credits: number;
}

const wagers = async function* (): AsyncGenerator<Wager> {
	yield { table: 'sabacc', credits: 500 };
	yield { table: 'fathier race', credits: -1_200 };
	yield { table: 'sabacc', credits: 2_000 };
};

const screen: string[] = [];

const render = (balance: number): void => {
	screen.push(`${String(balance)} credits`);
};

const balances = AsyncSequenceCollection.from(wagers()).scan(
	0,
	(balance, wager) => balance + wager.credits,
);

for await (const balance of balances) render(balance);

console.log(screen); // ['500 credits', '-700 credits', '1300 credits']
```

## Cancelando

Todo terminal aceita um `AbortSignal`:

```ts
const controller = new AbortController();

setTimeout(() => controller.abort(), 5_000);

const crew = await AsyncSequenceCollection.from(fetchCrewPages()).toArray({
	signal: controller.signal,
});
```

**O que o abort faz, e o que ele não consegue fazer.** Uma promise não tem
cancelamento — é um fato do JavaScript, não uma lacuna aqui. Então abortar faz
exatamente duas coisas:

1. Nenhum elemento a mais é puxado.
2. A promise que você está aguardando é rejeitada com o motivo do signal.

O trabalho que já está em andamento continua até o fim; o resultado dele é
descartado. Se você esperava que `abort()` matasse uma requisição no meio, ele
não mata — a não ser que o próprio trabalho receba um signal, e nesse caso passe
o mesmo e ele mata:

```ts
.select((name) => fetch(`https://archives.jedi-temple.example/${name}`, { signal: controller.signal }))
```

O signal fica no terminal em vez de no `from`, o que quer dizer que a mesma
sequência pode ser consumida duas vezes sob signals diferentes.

`AbortSignal.timeout(5_000)` é um atalho para o controller acima.

Han desistindo de um enxame sem fim de caças TIE, e o download do arquivo que o
Imperador interrompeu — o segundo passa o mesmo signal para o próprio trabalho:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const wait = (milliseconds: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const tieSwarm = async function* (): AsyncGenerator<string> {
	for (let wave = 1; ; wave++) {
		await wait(10);
		yield `TIE wave ${String(wave)}`;
	}
};

const retreat = new AbortController();

setTimeout(() => retreat.abort(new Error('Never tell me the odds!')), 50);

try {
	await AsyncSequenceCollection.from(tieSwarm()).toArray({ signal: retreat.signal });
} catch (reason) {
	console.log((reason as Error).message); // 'Never tell me the odds!'
}

// Um trabalho que recebe o signal para junto com ele, em vez de terminar para ninguém.
const downloadArchive = (name: string, signal: AbortSignal): Promise<string> => {
	return new Promise((resolve, reject) => {
		const transfer = setTimeout(() => resolve(`${name}: archive restored`), 1_000);

		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(transfer);
				reject(signal.reason);
			},
			{ once: true },
		);
	});
};

const order66 = AbortSignal.timeout(20);

try {
	await AsyncSequenceCollection.from(['Yoda', 'Kenobi'])
		.select((name) => downloadArchive(name, order66))
		.toArray({ signal: order66 });
} catch (reason) {
	console.log((reason as Error).name); // 'TimeoutError'
}
```

## O que muda em relação à sequência síncrona

|                       | `Sequence`          | `AsyncSequence`             |
| --------------------- | ------------------- | --------------------------- |
| Consumida com         | `for...of`          | `for await...of`            |
| Os terminais devolvem | o valor             | uma `Promise` dele          |
| Acesso por índice     | `sequence[5]`       | `elementAtOrNull(5)`        |
| `count()`             | muitas vezes `O(1)` | sempre percorre             |
| Cancelamento          | —                   | `AbortSignal` nos terminais |

**O acesso por índice some**, e não é descuido: `sequence[5]` teria de devolver
uma promise a partir da leitura de uma propriedade, o que quer dizer algo bem
diferente do que quer dizer na sequência síncrona. `elementAtOrNull(5)` é o
caminho.

**`count()` sempre percorre.** A sequência síncrona muitas vezes responde em
`O(1)` porque um array declara o seu tamanho. Um `AsyncIterable` não declara
nada, então não há o que ler de antemão.

## Operadores

| Adiados                                       | Terminais                                 |
| --------------------------------------------- | ----------------------------------------- |
| `where` `select` `selectMany`                 | `toArray` `toSet` `count`                 |
| `take` `skip` `takeWhile` `skipWhile`         | `any` `all` `contains`                    |
| `takeLast` `skipLast`                         | `first` `firstOrNull` `last` `lastOrNull` |
| `distinct` `distinctBy` `concat`              | `single` `singleOrNull`                   |
| `chunk` `scan` `windowed` `pairwise`          | `elementAt` `elementAtOrNull`             |
| `append` `prepend` `defaultIfEmpty`           | `sum` `average` `min` `max`               |
| `choose` `ofType` `cast` `topBy` `tap`        | `minBy` `maxBy` `sequenceEqual`           |
| `groupAdjacent` `zip`                         | `countBy` `toMap` `toLookup`              |
| `except` `exceptBy` `intersect` `intersectBy` | `standardDeviation`                       |
| `union` `unionBy` `join` `groupJoin`          | `sampleStandardDeviation`                 |
|                                               | `forEach` `aggregate`                     |

Além das formas concorrentes: `selectAwait`, `whereAwait`, `chooseAwait`,
`topByAwait` e o terminal `forEachAwait`.

### O que falta de propósito

Seis operadores da sequência síncrona **não** estão aqui, e a ausência deles é o
desenho, não uma lacuna: `orderBy`, `orderByDescending`, `reverse`, `groupBy`,
`median` e `percentile`.

Todos eles precisam segurar a fonte inteira antes de produzir qualquer coisa.
`orderBy` não consegue emitir um primeiro elemento antes de o último chegar;
`groupBy` não consegue fechar um grupo antes de saber que não vêm mais membros.
Oferecê-los com a mesma forma do resto seria uma armadilha de memória vestida de
operador comum — tudo certo na fixture de um teste, desastroso no feed em
produção.

Quando você os quiser, diga isso em voz alta:

```ts
const sorted = SequenceCollection.from(await arrivals.toArray()).orderBy((row) => row.arrivedAt);
```

`toArray()` é onde segurar tudo fica visível, que é exatamente onde isso deve
ficar.

A frota imperial saindo do hiperespaço sobre Hoth, posta em ordem depois que
toda ela chegou:

```ts
import { SequenceCollection } from '@fulcro/collections';
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface Arrival {
	ship: string;
	arrivedAt: number;
}

const hyperspaceExits = async function* (): AsyncGenerator<Arrival> {
	yield { ship: 'Executor', arrivedAt: 3 };
	yield { ship: 'Avenger', arrivedAt: 1 };
	yield { ship: 'Tyrant', arrivedAt: 2 };
};

const arrivals = AsyncSequenceCollection.from(hyperspaceExits());

const order = SequenceCollection.from(await arrivals.toArray())
	.orderBy((row) => row.arrivedAt)
	.select((row) => row.ship)
	.toArray();

console.log(order); // ['Avenger', 'Tyrant', 'Executor']
```

Dois que fazem stream valem ser conhecidos como as respostas para as mesmas
perguntas: **`groupAdjacent`** agrupa elementos consecutivos e fecha um trecho
assim que a chave muda, e **`topBy`** ranqueia sem ordenar, segurando uma janela
em vez do stream.

### Quais deles fazem stream de verdade

A maioria não segura nada além de uma janela. Três merecem destaque.

**`takeLast` não consegue produzir antes de a fonte acabar** — nada sabe quais
são os dez últimos de algo que ainda está chegando. O que ele mantém limitado é
a memória: dez elementos, não o stream. O irmão dele, `skipLast`, _faz_ stream,
liberando um elemento assim que `count` outros chegaram atrás dele.

**As operações de conjunto e as junções leem o argumento primeiro**, inteiro,
antes de produzir qualquer coisa. O que isso limita é a sequência que você
passa, nunca aquela em que você chamou — então um stream fica do lado de fora de
um `join`, e uma coleção de tamanho razoável do lado de dentro.

**`countBy` e `toLookup` crescem com o número de chaves distintas.** Contar por
categoria num feed sem fim tudo bem; contar por identificador, não.

## Validando um stream à medida que ele chega

`cast<T>()` também está aqui, e é aqui que ele mais compensa. Dados não
confiáveis costumam chegar de forma assíncrona — uma API paginada, um arquivo
sendo lido, uma fila — e o caminho síncrono significaria reunir tudo na memória
antes, que é justamente o que este tipo existe para evitar.

```ts
const bounties = AsyncSequenceCollection.from(paginatedBounties()).cast<Bounty>();

for await (const bounty of bounties) {
	// `bounty` é um `Bounty`, verificado, uma página de cada vez.
}
```

Ele recusa **no elemento que falhou**, então uma página ruim é pega sem que o
resto do feed seja buscado:

```text
TypeError: FULCRO1015: cast('Bounty') found a string at index 2.
```

`ofType<T>()` é a mesma verificação usada para filtrar em vez de recusar. Os dois
aceitam um nome de `typeof`, uma classe, um teste que você escreve, ou — com o
transformer do pacote configurado — o próprio tipo, interfaces incluídas. O
relato completo do que é coberto e do que é recusado está em
[sequences.md](./sequences.md#oftype-e-cast--a-mesma-pergunta-duas-respostas); o
comportamento aqui é idêntico.

Um feed da Guilda com um transmissor danificado no meio, recusado no dano e não
um registro depois:

```ts
// Precisa do @fulcro/collections/transformer.
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface Bounty {
	target: string;
	credits: number;
}

let recordsFetched = 0;

const paginatedBounties = async function* (): AsyncGenerator<unknown> {
	const feed: unknown[] = [
		{ target: 'Han Solo', credits: 50_000 },
		{ target: 'Grogu', credits: 100_000 },
		'static from a damaged transmitter',
		{ target: 'Mythrol', credits: 5_000 },
	];

	for (const record of feed) {
		recordsFetched++;
		yield record;
	}
};

const accepted: string[] = [];

try {
	for await (const bounty of AsyncSequenceCollection.from(paginatedBounties()).cast<Bounty>()) {
		accepted.push(bounty.target);
	}
} catch (error) {
	console.log((error as Error).message); // "FULCRO1015: cast('Bounty') found a string at index 2."
}

console.log(accepted); // ['Han Solo', 'Grogu']
console.log(recordsFetched); // 3 — o registro do Mythrol nunca foi buscado
```

## `topBy` sobre um stream

Ranquear normalmente quer dizer ordenar, e ordenar quer dizer ter tudo. `topBy`
mantém, em vez disso, uma janela com os `count` melhores vistos até agora, então
o que ele segura é limitado por `count`, e não pelo tamanho do stream:

```ts
const slowest = await AsyncSequenceCollection.from(everyJump())
	.topBy((jump) => jump.seconds, 10)
	.toArray();
```

Cem mil elementos para um top dez seguram dez. Ele precisa chegar ao fim antes de
responder — nada consegue saber o top dez de um stream que não terminou —
então coloque um `take` na frente de um que não termina.

O registro do computador de navegação com os saltos no hiperespaço de um dia,
ranqueado pelos três que mais demoraram:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface Jump {
	ship: string;
	seconds: number;
}

const everyJump = async function* (): AsyncGenerator<Jump> {
	yield { ship: 'Millennium Falcon', seconds: 12 };
	yield { ship: 'Ghost', seconds: 47 };
	yield { ship: 'Razor Crest', seconds: 31 };
	yield { ship: 'Slave I', seconds: 25 };
	yield { ship: 'Home One', seconds: 90 };
	yield { ship: 'Tantive IV', seconds: 18 };
};

const slowest = await AsyncSequenceCollection.from(everyJump())
	.topBy((jump) => jump.seconds, 3)
	.select((jump) => `${jump.ship} (${String(jump.seconds)} s)`)
	.toArray();

console.log(slowest); // ['Home One (90 s)', 'Ghost (47 s)', 'Razor Crest (31 s)']
```

`topByAwait` extrai várias chaves ao mesmo tempo, para uma chave que precisa ser
buscada em vez de lida. Os empates continuam sendo desfeitos pela **chegada**,
que é registrada antes de as chaves serem extraídas: trabalho concorrente termina
numa ordem que não tem nada a ver com a entrada, e deixar isso decidir faria a
resposta depender de qual busca foi mais rápida.

## `choose` e `tap`

`choose` projeta e filtra numa passada só, aguardando um elemento de cada vez;
`chooseAwait` roda várias projeções ao mesmo tempo. O limite de concorrência
conta as projeções **em andamento**, não os resultados mantidos — descartar um
resultado não libera uma vaga, senão o limite dependeria, em silêncio, de quanto
a projeção descarta.

`tap` observa sem consumir, e **aguarda** a ação antes de passar o elemento
adiante. É de propósito: uma ação que grava em algum lugar deve segurar o stream
onde está, em vez de ficar para trás dos elementos que deveria estar observando.
