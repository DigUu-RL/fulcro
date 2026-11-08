# Concorrência limitada

🇺🇸 English: [Read this documentation in English](../concurrency.md)

Rodar vários elementos ao mesmo tempo em vez de um de cada vez — para trabalho
que passa o tempo esperando.

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';
```

Faz parte das [sequências assíncronas](./async-sequences.md); leia aquela página
antes, se ainda não leu.

## O problema que isto resolve

Isto carrega cem registros dos Arquivos Jedi um depois do outro. Se cada
requisição leva 100 ms, leva dez segundos:

```ts
const records = await AsyncSequenceCollection.from(names).select(loadJediRecord).toArray();
```

Isto carrega oito de cada vez, e leva pouco mais de um segundo:

```ts
const records = await AsyncSequenceCollection.from(names)
	.selectAwait(loadJediRecord, { concurrency: 8 })
	.toArray();
```

Nada roda _no mesmo instante_ — o JavaScript tem uma thread só. O que se
sobrepõe é a **espera**. Enquanto uma requisição está no ar, as outras também
podem estar.

**Isto não faz nada por um trabalho que não está esperando.** Parsing, hashing,
redimensionamento — qualquer coisa limitada por CPU — não fica mais rápida,
porque nunca houve tempo ocioso para preencher. Isso pede paralelismo de
verdade, que é outra ferramenta.

Os dois, contra um arquivo que registra quantas requisições está atendendo ao
mesmo tempo:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface JediRecord {
	name: string;
	homeworld: string;
}

const homeworlds = new Map([
	['Yoda', 'unknown'],
	['Mace Windu', 'Haruun Kal'],
	['Obi-Wan Kenobi', 'Stewjon'],
	['Ki-Adi-Mundi', 'Cerea'],
	['Plo Koon', 'Dorin'],
	['Kit Fisto', 'Glee Anselm'],
	['Shaak Ti', 'Shili'],
	['Aayla Secura', 'Ryloth'],
]);

let inFlight = 0;
let peak = 0;

const loadJediRecord = async (name: string): Promise<JediRecord> => {
	inFlight++;
	peak = Math.max(peak, inFlight);

	await new Promise((resolve) => setTimeout(resolve, 100));

	inFlight--;

	return { name, homeworld: homeworlds.get(name) ?? 'unknown' };
};

const names = [...homeworlds.keys()];

await AsyncSequenceCollection.from(names).select(loadJediRecord).toArray();

console.log(peak); // 1 — oito requisições, uma depois da outra

peak = 0;

const records = await AsyncSequenceCollection.from(names)
	.selectAwait(loadJediRecord, { concurrency: 4 })
	.toArray();

console.log(peak); // 4 — a espera se sobrepôs, e nunca mais de quatro ao mesmo tempo
console.log(records[2]); // { name: 'Obi-Wan Kenobi', homeworld: 'Stewjon' } — na ordem de entrada
```

## Os operadores

```ts
// Projeta vários de cada vez.
.selectAwait(loadJediRecord, { concurrency: 8 })

// Filtra com uma condição que precisa perguntar algo.
.whereAwait(async (designation) => hasClearance(designation), { concurrency: 8 })

// Projeta e filtra de uma vez, descartando o que voltou vazio.
.chooseAwait((designation) => findPost(designation), { concurrency: 8 })

// Ranqueia por uma chave que precisa ser buscada.
.topByAwait((designation) => fetchMarksmanship(designation), 10, { concurrency: 8 })

// Faz algo pelos seus efeitos, sem reunir resultado nenhum.
await troopers.forEachAwait((designation) => imperialRecords.file(designation), { concurrency: 4 });
```

O sufixo `Await` é a marca: `select` aguarda um elemento antes de puxar o
próximo, `selectAwait` mantém vários em andamento. Os operadores sem ele não
precisam de nenhuma decisão sua, e é para isso que ficam separados.

Os quatro, numa guarnição de stormtroopers cujas fichas ficam numa rede imperial
lenta:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const network = (milliseconds: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const garrison = ['TK-421', 'TK-422', 'FN-2187', 'TK-9091', 'TK-0117'];

const clearance = new Set(['FN-2187', 'TK-0117']);
const posts = new Map([
	['TK-421', 'Docking Bay 327'],
	['FN-2187', 'Starkiller Base sanitation'],
]);
const marksmanship = new Map([
	['TK-421', 12],
	['TK-422', 31],
	['FN-2187', 88],
	['TK-9091', 7],
	['TK-0117', 64],
]);

const hasClearance = async (designation: string): Promise<boolean> => {
	await network(10);

	return clearance.has(designation);
};

const findPost = async (designation: string): Promise<string | null> => {
	await network(10);

	return posts.get(designation) ?? null;
};

const fetchMarksmanship = async (designation: string): Promise<number> => {
	await network(10);

	return marksmanship.get(designation) ?? 0;
};

const filed: string[] = [];

const imperialRecords = {
	file: async (designation: string): Promise<void> => {
		await network(5);
		filed.push(designation);
	},
};

const troopers = AsyncSequenceCollection.from(garrison);

console.log(
	await troopers
		.whereAwait(async (designation) => hasClearance(designation), { concurrency: 3 })
		.toArray(),
);
// ['FN-2187', 'TK-0117']

console.log(
	await troopers.chooseAwait((designation) => findPost(designation), { concurrency: 3 }).toArray(),
);
// ['Docking Bay 327', 'Starkiller Base sanitation']

console.log(
	await troopers
		.topByAwait((designation) => fetchMarksmanship(designation), 2, { concurrency: 3 })
		.toArray(),
);
// ['FN-2187', 'TK-0117'] — os dois únicos que acertavam alguma coisa

await troopers.forEachAwait((designation) => imperialRecords.file(designation), { concurrency: 2 });

console.log(filed.length); // 5
```

## `concurrency` é obrigatório, e isso é de propósito

Não há padrão, e o tipo não deixa você omiti-lo:

```ts
.selectAwait(loadJediRecord, { concurrency: 8 }) // ✓
.selectAwait(loadJediRecord)                     // ✗ não compila
```

Nenhum padrão poderia estar certo:

- **Sem limite** é como se estoura um rate limit e se esgotam os descritores de
  arquivo — e funciona bem em desenvolvimento, onde a entrada é pequena, para
  depois falhar em produção.
- **`1`** tornaria o operador inútil.
- **Qualquer coisa entre os dois** é um palpite sobre um serviço que só você
  conhece.

Um limite que não é um inteiro positivo é recusado **onde você o escreveu**, e
não depois, quando a sequência roda:

```ts
.selectAwait(loadJediRecord, { concurrency: 0 })
// Error: FULCRO1017: selectAwait() needs a positive integer concurrency, and was given 0.
```

Um limite lido da configuração, recusado no instante em que a cadeia é montada —
antes de um único registro ser pedido:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

let requests = 0;

const loadJediRecord = async (name: string): Promise<string> => {
	requests++;
	await new Promise((resolve) => setTimeout(resolve, 10));

	return `${name}: record restored`;
};

// Uma configuração que alguém deixou em zero depois do expurgo.
const archiveSettings = { parallelDownloads: 0 };

try {
	AsyncSequenceCollection.from(['Yoda', 'Kenobi']).selectAwait(loadJediRecord, {
		concurrency: archiveSettings.parallelDownloads,
	});
} catch (error) {
	console.log((error as Error).message);
	// 'FULCRO1017: selectAwait() needs a positive integer concurrency, and was given 0.'
}

console.log(requests); // 0
```

### Escolhendo um número

Não há resposta universal, mas há pontos de partida úteis:

| Trabalho                      | Ponto de partida razoável                   |
| ----------------------------- | ------------------------------------------- |
| Uma API que você não controla | O que o rate limit dela permitir, com folga |
| Uma API que você controla     | 10–50                                       |
| Um banco com pool de conexões | No máximo o tamanho do pool                 |
| Ler muitos arquivos           | 10–100                                      |

Se o que você está chamando tem um limite documentado, esse é o seu teto. Se não
tem, comece baixo e suba enquanto observa os erros.

## Ordem

Os resultados voltam **na ordem de entrada, por padrão**:

```ts
const arrivals = await AsyncSequenceCollection.from(['Millennium Falcon', 'Ghost', 'Razor Crest'])
	.selectAwait(jumpToLightspeed, { concurrency: 3 })
	.toArray();
// ['Millennium Falcon', 'Ghost', 'Razor Crest'] — qualquer que seja a ordem em que chegaram
```

É o comportamento que se combina bem: um operador no meio de uma cadeia não deve
mudar em silêncio o que um `zip` ou um `pairwise` mais adiante está pareando. Um
elemento lento segura os que vêm atrás dele, embora eles ainda tenham _rodado_ de
forma concorrente — a espera se sobrepõe de qualquer jeito.

Peça a ordem de conclusão quando quiser cada resultado assim que ele existir:

```ts
.selectAwait(jumpToLightspeed, { concurrency: 8, ordered: false })
```

Útil quando você está renderizando resultados à medida que chegam, ou gravando-os
em algum lugar que não liga para a ordem. Não é útil quando a posição tem
significado.

Três naves saltando ao mesmo tempo, com as chegadas listadas dos dois jeitos:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const jumpSeconds = new Map([
	['Millennium Falcon', 10],
	['Ghost', 60],
	['Razor Crest', 30],
]);

const jumpToLightspeed = async (ship: string): Promise<string> => {
	await new Promise((resolve) => setTimeout(resolve, jumpSeconds.get(ship)));

	return ship;
};

const fleet = AsyncSequenceCollection.from([...jumpSeconds.keys()]);

console.log(await fleet.selectAwait(jumpToLightspeed, { concurrency: 3 }).toArray());
// ['Millennium Falcon', 'Ghost', 'Razor Crest'] — a ordem em que foram enviadas

console.log(
	await fleet.selectAwait(jumpToLightspeed, { concurrency: 3, ordered: false }).toArray(),
);
// ['Millennium Falcon', 'Razor Crest', 'Ghost'] — a ordem em que chegaram
```

## Quando algo falha

A sequência é rejeitada com o primeiro erro, e:

1. **Nenhum trabalho novo é iniciado.**
2. **O trabalho já em andamento é aguardado** antes de a rejeição chegar até você.

O segundo ponto não é cortesia — é o que impede que a rejeição de uma tarefa que
ninguém está mais esperando apareça depois como uma rejeição não tratada e
derrube o processo.

```ts
try {
	await council.selectAwait(loadJediRecord, { concurrency: 8 }).toArray();
} catch (error) {
	// A primeira falha. Todo o resto que estava em andamento terminou e foi descartado.
}
```

Os registros do Conselho, com um membro que deixou a Ordem — a falha interrompe
o trabalho novo, e espera pelas requisições que já saíram:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const started: string[] = [];
const finished: string[] = [];

const loadJediRecord = async (name: string): Promise<string> => {
	started.push(name);

	await new Promise((resolve) => setTimeout(resolve, name === 'Dooku' ? 10 : 30));

	if (name === 'Dooku') throw new Error('Dooku has left the Jedi Order');

	finished.push(name);

	return `${name}: record restored`;
};

const council = AsyncSequenceCollection.from([
	'Yoda',
	'Dooku',
	'Mace Windu',
	'Plo Koon',
	'Kit Fisto',
]);

try {
	await council.selectAwait(loadJediRecord, { concurrency: 3 }).toArray();
} catch (error) {
	console.log((error as Error).message); // 'Dooku has left the Jedi Order'
}

console.log(started); // ['Yoda', 'Dooku', 'Mace Windu'] — nada começou depois da falha
console.log(finished); // ['Yoda', 'Mace Windu'] — os dois em andamento terminaram antes de a rejeição chegar
```

### Reunindo as falhas em vez de parar

Não existe uma flag `settled: true`, porque você já consegue expressar isso — e
a composição se lê melhor do que uma flag se leria:

```ts
const outcomes = await AsyncSequenceCollection.from(planets)
	.selectAwait((planet) => tryCatch(() => decodeCoordinates(planet)), { concurrency: 8 })
	.toArray();

const [decoded, failed] = SequenceCollection.from(outcomes).partition(
	(outcome) => outcome.error === null,
);
```

Todo elemento é tentado, nada para antes, e você fica com as duas metades.

Decifrando as coordenadas de todos os planetas de um mapa estelar roubado — um
deles foi apagado dos arquivos, e o resto é decifrado mesmo assim:

```ts
import { SequenceCollection } from '@fulcro/collections';
import { AsyncSequenceCollection } from '@fulcro/collections/async';
import { tryCatch } from '@fulcro/functions';

const decodeCoordinates = async (planet: string): Promise<string> => {
	await new Promise((resolve) => setTimeout(resolve, 5));

	if (planet === 'Kamino') throw new Error('Kamino is not in the archives');

	return `${planet}: coordinates decoded`;
};

const planets = ['Hoth', 'Dagobah', 'Kamino', 'Bespin'];

const outcomes = await AsyncSequenceCollection.from(planets)
	.selectAwait((planet) => tryCatch(() => decodeCoordinates(planet)), { concurrency: 2 })
	.toArray();

const [decoded, failed] = SequenceCollection.from(outcomes).partition(
	(outcome) => outcome.error === null,
);

console.log(decoded.select((outcome) => outcome.value).toArray());
// ['Hoth: coordinates decoded', 'Dagobah: coordinates decoded', 'Bespin: coordinates decoded']

console.log(failed.select((outcome) => (outcome.error as Error).message).toArray());
// ['Kamino is not in the archives'] — "Se um item não aparece nos nossos registros, ele não existe."
```

## Cancelando

O signal vai no terminal, como em todo o resto:

```ts
const controller = new AbortController();

await AsyncSequenceCollection.from(holocrons)
	.selectAwait(downloadHolocron, { concurrency: 8 })
	.toArray({ signal: controller.signal });
```

Abortar interrompe o trabalho novo e rejeita. **Não** mata as oito requisições
que já estão no ar — uma promise não tem cancelamento. Para parar essas também,
passe o mesmo signal para o próprio trabalho:

```ts
const controller = new AbortController();

await AsyncSequenceCollection.from(holocrons)
	.selectAwait((name) => downloadHolocron(name, controller.signal), {
		concurrency: 8,
	})
	.toArray({ signal: controller.signal });
```

Os holocrons do Templo sendo copiados enquanto os clones entram — o signal para
os downloads que começaram, e o resto nunca começa:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const started: string[] = [];

const downloadHolocron = (name: string, signal: AbortSignal): Promise<string> => {
	started.push(name);

	return new Promise((resolve, reject) => {
		const transfer = setTimeout(() => resolve(`${name}: copied`), 1_000);

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

const holocrons = [
	'Sith Holocron',
	'Kyber Archive',
	'Temple Map',
	'Order of Succession',
	'Youngling Registry',
];

const controller = new AbortController();

setTimeout(() => controller.abort(new Error('Operation: Knightfall has begun')), 30);

try {
	await AsyncSequenceCollection.from(holocrons)
		.selectAwait((name) => downloadHolocron(name, controller.signal), { concurrency: 2 })
		.toArray({ signal: controller.signal });
} catch (reason) {
	console.log((reason as Error).message); // 'Operation: Knightfall has begun'
}

console.log(started); // ['Sith Holocron', 'Kyber Archive'] — os outros três nunca começaram
```

## Do que você abre mão

O resto de `AsyncSequence` tem **contrapressão**: um elemento é puxado,
processado, e só então o próximo é pedido. Os operadores concorrentes quebram
isso de propósito — até `concurrency` elementos são puxados antes de qualquer
resultado voltar.

Essa é a troca. É a certa quando os elementos são baratos e o trabalho sobre eles
é lento, que é o caso para o qual estes operadores existem. É a errada se puxar
os elementos já é caro, ou se a fonte não pode correr na frente.

## Cenários reais

### Enriquecendo uma lista a partir de uma API

```ts
const enriched = await AsyncSequenceCollection.from(jobs)
	.selectAwait(async (job) => ({ ...job, standing: await loadGuildStanding(job.hunter) }), {
		concurrency: 10,
	})
	.toArray();
```

O quadro de trabalhos da Guilda, cada trabalho juntado à reputação do seu
caçador num registro remoto:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface Job {
	target: string;
	hunter: string;
}

const standings = new Map([
	['Boba Fett', 'legendary'],
	['Din Djarin', 'trusted'],
	['Bossk', 'reliable'],
]);

const loadGuildStanding = async (hunter: string): Promise<string> => {
	await new Promise((resolve) => setTimeout(resolve, 20));

	return standings.get(hunter) ?? 'unlisted';
};

const jobs: Job[] = [
	{ target: 'Han Solo', hunter: 'Boba Fett' },
	{ target: 'Grogu', hunter: 'Din Djarin' },
	{ target: 'Chewbacca', hunter: 'Bossk' },
	{ target: 'Mythrol', hunter: 'Din Djarin' },
];

const enriched = await AsyncSequenceCollection.from(jobs)
	.selectAwait(async (job) => ({ ...job, standing: await loadGuildStanding(job.hunter) }), {
		concurrency: 10,
	})
	.toArray();

console.log(enriched[0]); // { target: 'Han Solo', hunter: 'Boba Fett', standing: 'legendary' }
console.log(enriched.map((job) => job.standing)); // ['legendary', 'trusted', 'reliable', 'trusted']
```

### Gravando lotes, vários de cada vez

```ts
await AsyncSequenceCollection.from(streamManifests())
	.chunk(500)
	.forEachAwait((batch) => imperialDatabase.insertMany(batch), { concurrency: 4 });
```

Quatro inserções de quinhentas linhas em andamento, e o stream nunca fica mais
de quatro lotes adiantado.

Um dia de manifestos de carga dos estaleiros de Kuat, gravados em lotes com duas
inserções permitidas em andamento:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

let inFlight = 0;
let peak = 0;
const written: number[] = [];

const imperialDatabase = {
	insertMany: async (batch: readonly string[]): Promise<void> => {
		inFlight++;
		peak = Math.max(peak, inFlight);

		await new Promise((resolve) => setTimeout(resolve, 20));

		written.push(batch.length);
		inFlight--;
	},
};

const streamManifests = async function* (): AsyncGenerator<string> {
	for (let hull = 1; hull <= 1_800; hull++) yield `Star Destroyer hull ${String(hull)}`;
};

await AsyncSequenceCollection.from(streamManifests())
	.chunk(500)
	.forEachAwait((batch) => imperialDatabase.insertMany(batch), { concurrency: 2 });

console.log(written.length); // 4 — lotes de 500, 500, 500 e 300
console.log(peak); // 2 — nunca mais inserções ao mesmo tempo do que o limite
```

### Verificando permissões antes de agir

```ts
const allowed = await AsyncSequenceCollection.from(holocrons)
	.whereAwait((holocron) => canRead(padawan, holocron), { concurrency: 20 })
	.toArray();
```

Uma Padawan nos Arquivos, vendo só o que o serviço de acesso permite:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface Holocron {
	title: string;
	restricted: boolean;
}

interface Reader {
	name: string;
	rank: 'Padawan' | 'Knight' | 'Master';
}

const canRead = async (reader: Reader, holocron: Holocron): Promise<boolean> => {
	await new Promise((resolve) => setTimeout(resolve, 10));

	return !holocron.restricted || reader.rank === 'Master';
};

const padawan: Reader = { name: 'Ahsoka Tano', rank: 'Padawan' };

const holocrons: Holocron[] = [
	{ title: 'Lightsaber forms', restricted: false },
	{ title: 'The Sith Code', restricted: true },
	{ title: 'History of the Old Republic', restricted: false },
];

const allowed = await AsyncSequenceCollection.from(holocrons)
	.whereAwait((holocron) => canRead(padawan, holocron), { concurrency: 20 })
	.select((holocron) => holocron.title)
	.toArray();

console.log(allowed); // ['Lightsaber forms', 'History of the Old Republic']
```

### Renderizando resultados à medida que chegam

```ts
const results = AsyncSequenceCollection.from(sectors).selectAwait(searchStarCharts, {
	concurrency: 6,
	ordered: false,
});

for await (const result of results) render(result);
```

Procurando Kamino nos mapas estelares, setor por setor, cada resposta mostrada no
momento em que volta:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const searchTime = new Map([
	['Rishi Maze', 40],
	['Abrion sector', 10],
	['Outer Rim', 25],
]);

const searchStarCharts = async (sector: string): Promise<string> => {
	await new Promise((resolve) => setTimeout(resolve, searchTime.get(sector)));

	return sector === 'Rishi Maze'
		? `${sector}: a gap where a planet should be`
		: `${sector}: nothing`;
};

const screen: string[] = [];

const render = (result: string): void => {
	screen.push(result);
};

const results = AsyncSequenceCollection.from([...searchTime.keys()]).selectAwait(searchStarCharts, {
	concurrency: 6,
	ordered: false,
});

for await (const result of results) render(result);

console.log(screen);
// ['Abrion sector: nothing', 'Outer Rim: nothing', 'Rishi Maze: a gap where a planet should be']
```

## Referência

| Operador                                  | Devolve                         | Opções                             |
| ----------------------------------------- | ------------------------------- | ---------------------------------- |
| `selectAwait(selector, options)`          | `AsyncSequence<R>`              | `concurrency`, `ordered`           |
| `whereAwait(predicate, options)`          | `AsyncSequence<T>`              | `concurrency`, `ordered`           |
| `chooseAwait(selector, options)`          | `AsyncSequence<NonNullable<R>>` | `concurrency`, `ordered`           |
| `topByAwait(keySelector, count, options)` | `AsyncSequence<T>`              | `concurrency`                      |
| `forEachAwait(action, options)`           | `Promise<void>`                 | `concurrency`, `ordered`, `signal` |

`forEachAwait` passa para a ação a posição do elemento **na fonte**, e não a
ordem em que as ações por acaso terminaram. O resultado de `topByAwait` é
ranqueado, então sai na ordem das chaves, com os empates desfeitos pela chegada,
o que quer que diga `ordered`.
