# Sequências

🇺🇸 English: [Read this documentation in English](../sequences.md)

Consultas sobre arrays, sets, maps e generators com operadores combináveis que
só fazem o trabalho que você realmente pede.

```sh
npm install @fulcro/collections
```

```ts
import { SequenceCollection } from '@fulcro/collections';
```

## A versão de trinta segundos

```ts
const roster = SequenceCollection.from(rebelPilots)
	.where((pilot) => pilot.active)
	.orderBy((pilot) => pilot.squadron)
	.thenByDescending((pilot) => pilot.confirmedKills)
	.select((pilot) => pilot.callSign)
	.take(10)
	.toArray();
```

Lê como uma consulta, e se comporta como uma: nada roda até `toArray()` pedir.

A mesma consulta com tudo o que a cerca — a escala de briefing dos pilotos que
continuam voando depois da Batalha de Yavin:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface RebelPilot {
	callSign: string;
	name: string;
	squadron: 'Gold' | 'Red' | 'Rogue';
	confirmedKills: number;
	active: boolean;
}

const rebelPilots: RebelPilot[] = [
	{
		callSign: 'Red Leader',
		name: 'Garven Dreis',
		squadron: 'Red',
		confirmedKills: 2,
		active: false,
	},
	{ callSign: 'Red Two', name: 'Wedge Antilles', squadron: 'Red', confirmedKills: 2, active: true },
	{
		callSign: 'Red Three',
		name: 'Biggs Darklighter',
		squadron: 'Red',
		confirmedKills: 1,
		active: false,
	},
	{
		callSign: 'Red Five',
		name: 'Luke Skywalker',
		squadron: 'Red',
		confirmedKills: 3,
		active: true,
	},
	{
		callSign: 'Gold Leader',
		name: 'Jon Vander',
		squadron: 'Gold',
		confirmedKills: 1,
		active: false,
	},
	{
		callSign: 'Rogue Two',
		name: 'Zev Senesca',
		squadron: 'Rogue',
		confirmedKills: 1,
		active: true,
	},
	{
		callSign: 'Rogue Four',
		name: 'Hobbie Klivian',
		squadron: 'Rogue',
		confirmedKills: 2,
		active: true,
	},
];

const roster = SequenceCollection.from(rebelPilots)
	.where((pilot) => pilot.active)
	.orderBy((pilot) => pilot.squadron)
	.thenByDescending((pilot) => pilot.confirmedKills)
	.select((pilot) => `${pilot.callSign} — ${pilot.name}`)
	.take(10)
	.toArray();

console.log(roster);
// [
//   'Red Five — Luke Skywalker',
//   'Red Two — Wedge Antilles',
//   'Rogue Four — Hobbie Klivian',
//   'Rogue Two — Zev Senesca',
// ]
```

## A avaliação preguiçosa é o ponto todo

Montar uma cadeia **não faz trabalho nenhum**:

```ts
const echoBase = SequenceCollection.from(probeReports).where(detectsPowerGenerator); // nada rodou
```

O trabalho acontece quando algo a consome — `toArray()`, um operador escalar, ou
um laço `for...of`. E só o tanto que for preciso:

```ts
echoBase.first(); // para no primeiro que bate, quantos relatórios houver
```

Num array de um milhão de elementos filtrado até sobrar um punhado, `first()`
pode olhar três elementos. Uma implementação ansiosa olha um milhão e depois
joga fora 999.999 resultados.

Aqui está a busca inteira, com os droides sonda contando os sistemas que de fato
visitaram:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface ProbeReport {
	droid: string;
	planet: string;
	signature: 'none' | 'life-form' | 'power-generator';
}

const systemsProbed: string[] = [];

const probeReports = function* (): Generator<ProbeReport> {
	const outerRimTargets = ['Ord Mantell', 'Bespin', 'Hoth', 'Dagobah', 'Endor'];

	for (const [index, planet] of outerRimTargets.entries()) {
		systemsProbed.push(planet);

		yield {
			droid: `Viper ${String(index + 1)}`,
			planet,
			signature: planet === 'Hoth' ? 'power-generator' : 'none',
		};
	}
};

const echoBase = SequenceCollection.from(probeReports()).where(
	(report) => report.signature === 'power-generator',
);

console.log(systemsProbed); // [] — montar a consulta não sondou nada

const sighting = echoBase.first();

console.log(`${sighting.droid} found the Rebels on ${sighting.planet}`);
// 'Viper 3 found the Rebels on Hoth'

console.log(systemsProbed); // ['Ord Mantell', 'Bespin', 'Hoth'] — Dagobah e Endor nunca foram sondados
```

Pelo mesmo motivo, funciona sobre fontes infinitas:

```ts
const cloneNumbers = function* () {
	for (let n = 1; ; n++) yield n;
};

SequenceCollection.from(cloneNumbers())
	.where((n) => n % 7 === 0)
	.take(5)
	.toArray(); // [7, 14, 21, 28, 35]
```

A linha de produção de Kamino nunca acaba, e a consulta acaba mesmo assim —
designando os três primeiros soldados cujo número os marca para a 501ª Legião:

```ts
import { SequenceCollection } from '@fulcro/collections';

const cloneNumbers = function* (): Generator<number> {
	for (let n = 1; ; n++) yield n;
};

const legion501 = SequenceCollection.from(cloneNumbers())
	.where((n) => n % 501 === 0)
	.select((n) => `CT-${String(n).padStart(4, '0')}`)
	.take(3)
	.toArray();

console.log(legion501); // ['CT-0501', 'CT-1002', 'CT-1503']
```

### Quais operadores rodam na hora

Tudo o que devolve um valor em vez de uma sequência: `toArray`, `count`, `sum`,
`first`, `any`, `aggregate`, `forEach` e o resto da coluna da direita na
[referência](#referência) abaixo.

### Uma sequência de `where` e `select` é um laço só

Chamadas adjacentes de `where` e `select`, em qualquer ordem e em qualquer
quantidade, são percorridas por um único laço sobre a fonte, e não por um
gerador por chamada. Nada que você possa observar muda: cada predicado e cada
projeção roda as mesmas vezes, e na mesma ordem, elemento por elemento, que
rodaria estágio por estágio, e parar antes ainda fecha a fonte. O que some é o
custo de retomar mais um gerador para cada elemento em cada estágio. Qualquer
outro operador no meio — `orderBy`, `take`, `distinct` — começa uma nova
sequência fundida.

## Criando uma sequência

```ts
SequenceCollection.from(rebelFleet); // array, Set, Map, string, generator…
SequenceCollection.empty<Jedi>();
SequenceCollection.range(1, 66); // 1..66
SequenceCollection.repeat('Help me, Obi-Wan Kenobi', 3);
```

`range` e `repeat` geram à medida que são lidos, então um milhão de qualquer um
dos dois não custa nada até alguém pedir — e os dois sabem informar a contagem
sem gerar nada.

Cada um deles, no lugar em que seria usado:

```ts
import { SequenceCollection } from '@fulcro/collections';

// A mensagem de Leia, em loop no projetor do R2-D2.
const hologram = SequenceCollection.repeat("Help me, Obi-Wan Kenobi. You're my only hope.", 3);

// O diário de bordo da Ghost, a partir de um Set: um planeta visitado duas
// vezes aparece uma só, na ordem em que foi alcançado pela primeira vez.
const ghostItinerary = SequenceCollection.from(new Set(['Lothal', 'Garel', 'Lothal', 'Atollon']));

// As companhias de uma legião clone, numeradas sem montar um array.
const companies = SequenceCollection.range(1, 5).select((n) => `Company ${String(n)}`);

console.log(hologram.count()); // 3 — conhecido sem tocar a mensagem uma vez sequer
console.log(ghostItinerary.toArray()); // ['Lothal', 'Garel', 'Atollon']
console.log(companies.toArray()); // ['Company 1', 'Company 2', 'Company 3', 'Company 4', 'Company 5']
console.log(SequenceCollection.empty<string>().any()); // false — o Templo Jedi depois da Ordem 66
```

## Acesso por índice

Uma sequência é lida por posição, como um array:

```ts
const sequence = SequenceCollection.from(['Tatooine', 'Alderaan', 'Yavin 4']);

sequence[1]; // 'Alderaan'
sequence[9]; // undefined
```

Quem atende é um `Proxy`. Numa sequência sobre um array é uma leitura direta;
numa sobre um generator, ela anda até chegar à posição, então `sequence[500]`
custa 501 passos.

A diferença aparece quando a fonte é um generator que conta o próprio trabalho —
a Corrida de Kessel, traçada um salto de cada vez:

```ts
import { SequenceCollection } from '@fulcro/collections';

let jumpsPlotted = 0;

const kesselRun = function* (): Generator<string> {
	for (const waypoint of ['Kessel', 'The Maw', 'Akkadese Maelstrom', 'Savareen']) {
		jumpsPlotted++;
		yield waypoint;
	}
};

const route = SequenceCollection.from(kesselRun());

console.log(route[2]); // 'Akkadese Maelstrom'
console.log(jumpsPlotted); // 3 — percorrido até a posição, e nada além

const charted = SequenceCollection.from(['Kessel', 'The Maw', 'Akkadese Maelstrom', 'Savareen']);

console.log(charted[3]); // 'Savareen' — um array é lido diretamente
```

## Achando o operador que você quer

### Filtrar e dar forma

```ts
.where((pilot) => pilot.active)                 // mantém o que bate
.select((pilot) => pilot.callSign)              // transforma cada um
.choose((pilot) => pilot.astromech)             // transforma, descartando o que voltou vazio
.selectMany((squadron) => squadron.pilots)      // achata arrays aninhados
.distinct()                                     // descarta duplicatas
.distinctBy((pilot) => pilot.homeworld)         // …comparando por uma chave
.ofType('string')                               // mantém um tipo de runtime, estreitando
.cast('string')                                 // …ou lança se algum elemento não for
.tap((pilot) => console.log(pilot))             // olha, sem consumir
.reverse()
```

Os esquadrões que voaram contra a primeira Estrela da Morte, moldados de quatro
jeitos:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Pilot {
	callSign: string;
	name: string;
	homeworld: string;
	astromech: string | null;
	active: boolean;
}

interface Squadron {
	name: string;
	pilots: Pilot[];
}

const yavinStrike: Squadron[] = [
	{
		name: 'Red Squadron',
		pilots: [
			{
				callSign: 'Red Five',
				name: 'Luke Skywalker',
				homeworld: 'Tatooine',
				astromech: 'R2-D2',
				active: true,
			},
			{
				callSign: 'Red Three',
				name: 'Biggs Darklighter',
				homeworld: 'Tatooine',
				astromech: null,
				active: false,
			},
			{
				callSign: 'Red Two',
				name: 'Wedge Antilles',
				homeworld: 'Corellia',
				astromech: null,
				active: true,
			},
		],
	},
	{
		name: 'Gold Squadron',
		pilots: [
			{
				callSign: 'Gold Leader',
				name: 'Jon Vander',
				homeworld: 'Yavin 4',
				astromech: null,
				active: false,
			},
		],
	},
];

const pilots = SequenceCollection.from(yavinStrike).selectMany((squadron) => squadron.pilots);

const survivors = pilots
	.where((pilot) => pilot.active)
	.select((pilot) => `${pilot.callSign}: ${pilot.name}`)
	.toArray();

const astromechs = pilots.choose((pilot) => pilot.astromech).toArray();

const homeworlds = pilots
	.distinctBy((pilot) => pilot.homeworld)
	.select((pilot) => pilot.homeworld)
	.toArray();

const launchOrder = pilots
	.select((pilot) => pilot.callSign)
	.reverse()
	.toArray();

console.log(survivors); // ['Red Five: Luke Skywalker', 'Red Two: Wedge Antilles']
console.log(astromechs); // ['R2-D2']
console.log(homeworlds); // ['Tatooine', 'Corellia', 'Yavin 4']
console.log(launchOrder); // ['Gold Leader', 'Red Two', 'Red Three', 'Red Five']
```

#### `choose` — projetar e filtrar numa passada só

Quando a condição e a projeção são o mesmo trabalho, separá-las em
`where().select()` significa fazer esse trabalho duas vezes:

```ts
// A consulta à guilda roda duas vezes para cada fugitivo que tem recompensa.
const contracts = sightings
	.where((fugitive) => findBounty(fugitive) !== null)
	.select((fugitive) => findBounty(fugitive));
```

```ts
// Uma vez.
const contracts = sightings.choose((fugitive) => findBounty(fugitive));
```

`null` e `undefined` querem dizer "nada para este elemento". Todo o resto é
mantido, **inclusive `0`, `''` e `false`** — são respostas, e uma projeção que
queira descartá-los tem de dizer isso. O tipo do resultado perde a
nulabilidade: `choose` sobre um `string | null` dá um `Sequence<string>`.

A Guilda dos Caçadores de Recompensa cruzando o seu quadro com os últimos
avistamentos, com as consultas contadas:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Fugitive {
	name: string;
	lastSeen: string;
}

interface Bounty {
	target: string;
	credits: number;
	postedBy: string;
}

const guildBoard = new Map<string, Bounty>([
	['Han Solo', { target: 'Han Solo', credits: 50_000, postedBy: 'Jabba the Hutt' }],
	['Grogu', { target: 'Grogu', credits: 100_000, postedBy: 'The Client' }],
]);

let lookups = 0;

const findBounty = (fugitive: Fugitive): Bounty | null => {
	lookups++;

	return guildBoard.get(fugitive.name) ?? null;
};

const sightings: Fugitive[] = [
	{ name: 'Han Solo', lastSeen: 'Bespin' },
	{ name: 'Chewbacca', lastSeen: 'Bespin' },
	{ name: 'Grogu', lastSeen: 'Arvala-7' },
];

const contracts = SequenceCollection.from(sightings)
	.choose((fugitive) => findBounty(fugitive))
	.select(
		(bounty) => `${bounty.target}: ${String(bounty.credits)} credits, posted by ${bounty.postedBy}`,
	)
	.toArray();

console.log(contracts);
// ['Han Solo: 50000 credits, posted by Jabba the Hutt', 'Grogu: 100000 credits, posted by The Client']

console.log(lookups); // 3 — uma por avistamento; where().select() teria feito 5
```

#### `ofType` e `cast` — a mesma pergunta, duas respostas

Os dois estreitam uma sequência mista para um tipo só. A diferença está no que
fazem com um elemento que não se encaixa, e essa diferença é o motivo de existirem
os dois:

```ts
const intercepted = SequenceCollection.from<unknown>(['Tatooine', 7, 'Hoth']);

intercepted.ofType('string').toArray(); // ['Tatooine', 'Hoth'] — o 7 é pulado
intercepted.cast('string').toArray(); // lança no 7
```

Use `ofType` quando se **espera** que a sequência seja mista, e `cast` quando um
elemento de outro tipo quer dizer que os dados estão errados e o silêncio seria
o pior desfecho. O erro diz o que encontrou e onde:

```text
TypeError: FULCRO1015: cast('string') found a number at index 1.
```

Os dois, em dados onde cada um é a escolha certa — ruído de sensor, que é
esperado, e uma transmissão roubada, em que qualquer ruído quer dizer
corrupção:

```ts
import { SequenceCollection } from '@fulcro/collections';

// Fragmentos recuperados dos registros do raio trator da Estrela da Morte:
// quase todos nomes de sistemas, e um pouco de ruído de sensor que ninguém quer.
const fragments: unknown[] = ['Alderaan', 'Yavin 4', 1138, 'Scarif', null];

const systems = SequenceCollection.from(fragments).ofType('string').toArray();

console.log(systems); // ['Alderaan', 'Yavin 4', 'Scarif']

// Os planos têm de ser texto, todas as linhas: um número aqui quer dizer que a
// transmissão se corrompeu no caminho desde Scarif.
const plans: unknown[] = ['exhaust port', 'thermal oscillator', 2187];

try {
	SequenceCollection.from(plans).cast('string').toArray();
} catch (error) {
	console.log((error as Error).message); // "FULCRO1015: cast('string') found a number at index 2."
}
```

Os dois aceitam um nome de `typeof` ou uma classe, e os dois estreitam o tipo sem
um cast escrito à mão:

```ts
.ofType('string')    .ofType('number')    .ofType('object')
.ofType(Date)        .cast(Starship)
```

Um hangar com mais do que naves, estreitado por classe:

```ts
import { SequenceCollection } from '@fulcro/collections';

class Starship {
	constructor(
		readonly name: string,
		readonly hyperdriveClass: number,
	) {}
}

class Droid {
	constructor(readonly designation: string) {}
}

const hangar: unknown[] = [
	new Starship('Millennium Falcon', 0.5),
	new Droid('C-3PO'),
	new Starship('Ghost', 2),
	'spare parts for a T-65',
];

const ships = SequenceCollection.from(hangar)
	.ofType(Starship)
	.select((ship) => `${ship.name}, hyperdrive class ${String(ship.hyperdriveClass)}`)
	.toArray();

console.log(ships); // ['Millennium Falcon, hyperdrive class 0.5', 'Ghost, hyperdrive class 2']
```

Uma discordância deliberada com a linguagem: `ofType('object')` **não** aceita
`null`, embora `typeof null` seja `'object'`. Uma sequência estreitada para
objetos que depois lança ao ler uma propriedade seria uma armadilha.

#### Escrevendo o tipo como um tipo

Com o transformer deste pacote configurado, os dois recebem o tipo diretamente:

```ts
holocron.ofType<string>(); // Sequence<string>
holocron.ofType<Jedi>(); // Sequence<Jedi>
holocron.cast<Jedi>(); // lança no primeiro que não for um
```

Ele resolve o argumento de tipo em tempo de compilação no mesmo token que as
outras formas recebem — `ofType<string>()` é emitido como `ofType('string')`, e
`ofType<Jedi>()` como `ofType(Jedi)`. Nada muda no runtime.

A chamada do Conselho Jedi, com o transformer aplicado:

```ts
// Precisa do @fulcro/collections/transformer, configurado como abaixo.
import { SequenceCollection } from '@fulcro/collections';

class Jedi {
	constructor(
		readonly name: string,
		readonly blade: 'blue' | 'green' | 'purple',
	) {}
}

class Sith {
	constructor(readonly name: string) {}
}

const chamber: unknown[] = [
	new Jedi('Mace Windu', 'purple'),
	new Jedi('Yoda', 'green'),
	new Sith('Darth Sidious'),
];

const council = SequenceCollection.from(chamber)
	.ofType<Jedi>()
	.select((jedi) => `${jedi.name}, ${jedi.blade} blade`)
	.toArray();

console.log(council); // ['Mace Windu, purple blade', 'Yoda, green blade']
```

O plugin é **opcional**, e essa é a diferença em relação ao `@fulcro/reflect`:
todo operador aqui funciona sem ele, e só estas formas sem argumento precisam
dele. Configure do mesmo jeito:

```json
{ "plugins": [{ "transform": "@fulcro/collections/transformer" }] }
```

```ts
// vite.config.ts
import { vite as fulcroCollections } from '@fulcro/collections/unplugin';
```

A configuração inteira do Vite de um rastreador de frota que usa as duas
bibliotecas:

```ts
// vite.config.ts do rastreador da frota rebelde
import { vite as fulcroCollections } from '@fulcro/collections/unplugin';
import { vite as fulcroReflect } from '@fulcro/reflect/unplugin';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [fulcroReflect(), fulcroCollections()],
});
```

Os dois podem ficar ao lado do plugin do `@fulcro/reflect`. Cada um reescreve só
as chamadas que consegue rastrear até o seu próprio pacote, e nenhum sabe que o
outro existe.

#### Uma interface também funciona — a verificação é escrita por extenso

Um primitivo vira um nome de `typeof` e uma classe vira o seu construtor. Uma
interface não tem nenhum dos dois, mas ainda tem uma **forma**, e o compilador a
conhece por completo. Então o transformer escreve a verificação por extenso:

```ts
interface StarshipManifest {
	registry: number;
	nickname?: string;
	crew: string[];
	captain: { name: string };
	status: 'docked' | 'in-hyperspace';
	lastJump: Date;
}

manifests.ofType<StarshipManifest>();
```

vira, aproximadamente:

```js
manifests.ofType({
	name: 'StarshipManifest',
	matches: (v) =>
		v !== null &&
		typeof v === 'object' &&
		typeof v.registry === 'number' &&
		(v.nickname === undefined || typeof v.nickname === 'string') &&
		Array.isArray(v.crew) &&
		v.crew.every((e) => typeof e === 'string') &&
		v.captain !== null &&
		typeof v.captain === 'object' &&
		typeof v.captain.name === 'string' &&
		(v.status === 'docked' || v.status === 'in-hyperspace') &&
		v.lastJump instanceof Date,
});
```

O que faz de `cast<T>()` um **validador para dados não confiáveis, derivado do
próprio tipo**:

```ts
const manifests = SequenceCollection.from(JSON.parse(transmission))
	.cast<StarshipManifest>()
	.toArray();
```

`JSON.parse` devolve `any`. Essa linha é o último lugar em que os dados não
foram verificados — e o schema é a interface que você já escreveu, então ele não
tem como sair de sincronia com ela do jeito que um schema mantido à mão sai.

O controle de atracagem de Mos Eisley, lendo uma transmissão em que não tem
motivo nenhum para confiar:

```ts
// Precisa do @fulcro/collections/transformer.
import { SequenceCollection } from '@fulcro/collections';

interface DockingRecord {
	bay: number;
	ship: string;
	captain: { name: string; species: string };
	cargo: string[];
	paid: boolean;
}

const transmission = `[
	{ "bay": 94, "ship": "Millennium Falcon", "captain": { "name": "Han Solo", "species": "Human" }, "cargo": ["coaxium"], "paid": false },
	{ "bay": 86, "ship": "Slave I", "captain": { "name": "Boba Fett", "species": "Human" }, "cargo": ["carbonite"], "paid": true }
]`;

const debtors = SequenceCollection.from(JSON.parse(transmission))
	.cast<DockingRecord>()
	.where((record) => !record.paid)
	.select((record) => `Bay ${String(record.bay)}: ${record.captain.name}, ${record.ship}`)
	.toArray();

console.log(debtors); // ['Bay 94: Han Solo, Millennium Falcon']

// Um registro com "bay": "ninety-four" lançaria nesse registro, nomeando-o,
// antes que qualquer coisa adiante lesse um campo dele.
```

Coberto: primitivos, literais, uniões, interseções, objetos e interfaces
aninhados em qualquer profundidade, propriedades opcionais, arrays (todo
elemento, não uma amostra), tuplas de tamanho fixo, classes, e `Date`, `Map`,
`Set`, `RegExp` e afins por `instanceof`.

#### Tipos que contêm a si mesmos

Uma linhagem de mestres e aprendizes, uma frota de frotas, um holocron que
indexa outros holocrons — são formas comuns, e estão cobertas. Um tipo que se
refere a si mesmo vira uma função que chama a si mesma:

```ts
interface JediLineage {
	name: string;
	rank: string;
	apprentices: JediLineage[];
}

lineages.cast<JediLineage>();
```

```js
lineages.cast(
	(() => {
		const check0 = (r) =>
			r !== null &&
			typeof r === 'object' &&
			typeof r.name === 'string' &&
			typeof r.rank === 'string' &&
			Array.isArray(r.apprentices) &&
			r.apprentices.every((e) => check0(e));

		return { name: 'JediLineage', matches: (v) => check0(v) };
	})(),
);
```

A função é construída **uma vez**, onde a chamada está — não por elemento — e
não acrescenta nenhum nome ao seu escopo. Ciclos que passam por um segundo tipo
funcionam do mesmo jeito: um `Master` com `Padawan[]` com um `Master` é um ciclo
só e ganha uma função só.

Ela desce pelo valor inteiro, então uma resposta quatro níveis abaixo com um
campo errado é recusada como qualquer outra. A profundidade que ela aguenta é a
que a pilha de chamadas do seu runtime aguenta, o que para árvores realistas não
é um limite que você vá encontrar.

A linhagem de Yoda, seis gerações de profundidade, validada e depois percorrida:

```ts
// Precisa do @fulcro/collections/transformer.
import { SequenceCollection } from '@fulcro/collections';

interface JediLineage {
	name: string;
	rank: string;
	apprentices: JediLineage[];
}

const archive = `[{
	"name": "Yoda", "rank": "Grand Master", "apprentices": [{
		"name": "Dooku", "rank": "Master", "apprentices": [{
			"name": "Qui-Gon Jinn", "rank": "Master", "apprentices": [{
				"name": "Obi-Wan Kenobi", "rank": "Master", "apprentices": [{
					"name": "Anakin Skywalker", "rank": "Knight", "apprentices": [{
						"name": "Ahsoka Tano", "rank": "Padawan", "apprentices": []
					}]
				}]
			}]
		}]
	}]
}]`;

const generations = (jedi: JediLineage): number => {
	return 1 + Math.max(0, ...jedi.apprentices.map(generations));
};

const depth = SequenceCollection.from(JSON.parse(archive))
	.cast<JediLineage>()
	.select(generations)
	.first();

console.log(depth); // 6

// Se o "rank" de Ahsoka fosse 7, o cast teria lançado em Yoda — o registro que
// a contém — sem que nada lesse um rank errado.
```

**Propriedades a mais são aceitas**, porque a tipagem estrutural as aceita. Um
objeto com mais do que `DockingRecord` exige continua sendo um
`DockingRecord`, e recusá-lo faria isto discordar do compilador que o produziu.

#### O que ele recusa, e por que esse é o ponto

Uma verificação que responde "sim" para a coisa errada é pior do que nenhuma
verificação: é falsa confiança justamente onde os dados são menos confiáveis.
Então tudo o que o transformer não consegue escrever por completo, ele recusa —
não há nele nenhuma verificação parcial ou otimista.

Recusados: assinaturas de índice, genéricos não resolvidos e uma classe trazida
com `import type`, que é apagada antes que o código emitido pudesse
referenciá-la.

```text
Error: FULCRO1016: ofType<T>() was not resolved at compile time. Either the
@fulcro/collections transformer did not run over this file, or T has no runtime
representation — an interface leaves nothing to test for, so pass a class, a
typeof name, or use where() with a predicate.
```

A mensagem cita as duas causas de propósito: de dentro do programa rodando elas
não se distinguem, e adivinhar entre elas seria pior do que dizer isso. Ela lança
quando a cadeia é **montada**, não quando é lida pela primeira vez — uma chamada
que nunca foi resolvida é um build mal configurado, não dados errados.

Para um tipo recusado, escreva a verificação você mesmo e passe-a com a mesma
forma:

```ts
records.ofType<Holocron>({
	name: 'Holocron',
	matches: (v) => isHolocron(v),
});
```

Um holocron é uma assinatura de índice — qualquer era, qualquer texto —, que é
exatamente a forma sobre a qual o transformer não vai arriscar um palpite. A
verificação do arquivo, escrita à mão:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Holocron {
	[era: string]: string;
}

const isHolocron = (value: unknown): value is Holocron => {
	return (
		value !== null &&
		typeof value === 'object' &&
		Object.values(value).every((entry) => typeof entry === 'string')
	);
};

const jediArchive: unknown[] = [
	{ 'Old Republic': 'The Rule of Two', 'High Republic': 'The Great Hyperspace Disaster' },
	{ 'Clone Wars': 66 },
	{ 'Age of Rebellion': 'The Battle of Yavin' },
];

const readable = SequenceCollection.from(jediArchive)
	.ofType<Holocron>({ name: 'Holocron', matches: isHolocron })
	.selectMany((holocron) => Object.keys(holocron))
	.toArray();

console.log(readable); // ['Old Republic', 'High Republic', 'Age of Rebellion']
```

#### Quanto custa

Uma verificação de forma é **O(tamanho do valor)** por elemento, não uma
constante: todo campo de todo registro, e todo elemento de todo array dentro
dele. É o preço honesto de verificar de fato, e em cem mil registros com itens
aninhados é trabalho de verdade — medido em mais ou menos o que custa a mesma
verificação escrita à mão, que é o máximo que se pode pedir dela.

Ela para na primeira cláusula que falha, e é preguiçosa como todo o resto, então
`cast<DockingRecord>().take(5)` valida cinco registros em vez de todos.

### Pegando uma fatia

```ts
.take(10)          .takeLast(10)     .takeWhile((reading) => reading.strength > 0)
.skip(10)          .skipLast(10)     .skipWhile((reading) => reading.strength === 100)
.chunk(100)        // arrays de 100
.windowed(3)       // trechos sobrepostos de 3
.pairwise()        // cada elemento com o anterior
```

`takeWhile` para no primeiro elemento que falha — diferente de `where`, que
manteria um que batesse depois.

O gerador de escudo na lua florestal de Endor, lido uma vez por minuto enquanto
a equipe de ataque trabalha na porta do bunker:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface ShieldReading {
	minute: number;
	strength: number;
}

const endorShield: ShieldReading[] = [
	{ minute: 0, strength: 100 },
	{ minute: 1, strength: 100 },
	{ minute: 2, strength: 100 },
	{ minute: 3, strength: 64 },
	{ minute: 4, strength: 12 },
	{ minute: 5, strength: 0 },
	{ minute: 6, strength: 0 },
];

const readings = SequenceCollection.from(endorShield);

const heldAtFull = readings.takeWhile((reading) => reading.strength === 100).count();

const drops = readings
	.pairwise()
	.select(([before, after]) => before.strength - after.strength)
	.where((drop) => drop > 0)
	.toArray();

const afterTheBreach = readings
	.skipWhile((reading) => reading.strength > 0)
	.select((reading) => reading.minute)
	.toArray();

const reportBlocks = readings
	.chunk(3)
	.select((block) => block.length)
	.toArray();

console.log(heldAtFull); // 3
console.log(drops); // [36, 52, 12]
console.log(afterTheBreach); // [5, 6] — os minutos que a frota teve para o seu ataque
console.log(reportBlocks); // [3, 3, 1]
```

### Ordenação

```ts
.orderBy((racer) => racer.lapsCompleted)
.thenByDescending((racer) => racer.topSpeed)
.topBy((racer) => racer.topSpeed, 10)   // os 10 melhores, sem ordenar o resto
```

Os critérios secundários só são consultados quando os anteriores empatam. A
ordenação extrai cada chave **uma vez por elemento**, não duas vezes por
comparação, o que em cem mil registros é a diferença entre 100.000 e 1.700.000
chamadas à sua projeção.

A Clássica da Véspera de Boonta, classificada duas vezes — a classificação
completa, e os dois pods mais rápidos sem ordenar o pelotão:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Podracer {
	pilot: string;
	lapsCompleted: number;
	bestLapSeconds: number;
	topSpeed: number;
}

const boontaEve: Podracer[] = [
	{ pilot: 'Sebulba', lapsCompleted: 3, bestLapSeconds: 61.2, topSpeed: 929 },
	{ pilot: 'Ben Quadinaros', lapsCompleted: 0, bestLapSeconds: 0, topSpeed: 0 },
	{ pilot: 'Anakin Skywalker', lapsCompleted: 3, bestLapSeconds: 60.9, topSpeed: 947 },
	{ pilot: 'Mawhonic', lapsCompleted: 1, bestLapSeconds: 66.4, topSpeed: 812 },
	{ pilot: 'Gasgano', lapsCompleted: 3, bestLapSeconds: 62.4, topSpeed: 874 },
];

const standings = SequenceCollection.from(boontaEve)
	.orderByDescending((racer) => racer.lapsCompleted)
	.thenBy((racer) => racer.bestLapSeconds)
	.select((racer) => racer.pilot)
	.toArray();

const fastestPods = SequenceCollection.from(boontaEve)
	.topBy((racer) => racer.topSpeed, 2)
	.select((racer) => `${racer.pilot} at ${String(racer.topSpeed)} km/h`)
	.toArray();

console.log(standings); // ['Anakin Skywalker', 'Sebulba', 'Gasgano', 'Mawhonic', 'Ben Quadinaros']
console.log(fastestPods); // ['Anakin Skywalker at 947 km/h', 'Sebulba at 929 km/h']
```

### Agrupamento

```ts
.groupBy((ship) => ship.faction)              // todas as naves por facção
.groupAdjacent((entry) => entry.alert)         // trechos de chaves iguais consecutivas
.countBy((ship) => ship.faction)               // Map<facção, contagem>
.toLookup((ship) => ship.faction)              // Map<facção, naves[]>
```

`groupBy` reúne uma chave onde quer que ela apareça; `groupAdjacent` começa um
grupo novo toda vez que a chave muda, e só guarda o trecho em mãos. Use o segundo
para dados que já estão em ordem — linhas de log, leituras por dia.

Um `Group<K, T>` é uma sequência completa com uma `key`, então os operadores se
encadeiam nele:

```ts
.groupBy((ship) => ship.faction)
.select((group) => ({ faction: group.key, crew: group.sum((ship) => ship.crew) }))
```

As frotas sobre Endor, e o registro de alertas da Base Echo na manhã do ataque:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Ship {
	name: string;
	faction: 'Rebel Alliance' | 'Galactic Empire';
	crew: number;
}

const endorFleets: Ship[] = [
	{ name: 'Home One', faction: 'Rebel Alliance', crew: 5_402 },
	{ name: 'Executor', faction: 'Galactic Empire', crew: 279_144 },
	{ name: 'Millennium Falcon', faction: 'Rebel Alliance', crew: 4 },
	{ name: 'Tydirium', faction: 'Rebel Alliance', crew: 2 },
];

const crewPerFaction = SequenceCollection.from(endorFleets)
	.groupBy((ship) => ship.faction)
	.select((group) => ({ faction: group.key, crew: group.sum((ship) => ship.crew) }))
	.toArray();

const shipsPerFaction = SequenceCollection.from(endorFleets).countBy((ship) => ship.faction);

const namesPerFaction = SequenceCollection.from(endorFleets).toLookup(
	(ship) => ship.faction,
	(ship) => ship.name,
);

console.log(crewPerFaction);
// [{ faction: 'Rebel Alliance', crew: 5408 }, { faction: 'Galactic Empire', crew: 279144 }]

console.log(shipsPerFaction.get('Rebel Alliance')); // 3
console.log(namesPerFaction.get('Galactic Empire')); // ['Executor']

interface LogEntry {
	time: string;
	alert: 'green' | 'yellow' | 'red';
	note: string;
}

const echoBaseLog: LogEntry[] = [
	{ time: '0600', alert: 'green', note: 'Patrols out on tauntauns' },
	{ time: '0615', alert: 'green', note: 'Sensor sweep of the northern ridge' },
	{ time: '0640', alert: 'yellow', note: 'Probe droid destroyed' },
	{ time: '0702', alert: 'red', note: 'Imperial walkers sighted' },
	{ time: '0703', alert: 'red', note: 'Begin evacuation' },
];

const alertRuns = SequenceCollection.from(echoBaseLog)
	.groupAdjacent((entry) => entry.alert)
	.select((run) => `${run.key} from ${run.first().time} (${String(run.count())})`)
	.toArray();

console.log(alertRuns); // ['green from 0600 (2)', 'yellow from 0640 (1)', 'red from 0702 (2)']
```

### Combinando duas sequências

```ts
.concat(reinforcements)                         // tudo das duas
.union(reinforcements)                          // as duas, sem duplicatas
.intersect(survivors)                           // só o que está nas duas
.except(fallen)                                 // o que não está na outra
.zip(callSigns, (pilot, callSign) => …)         // em pares, parando na mais curta
```

Cada um tem uma contraparte `*By` que recebe um seletor de chave — `unionBy`,
`exceptBy`, `intersectBy` — que costuma ser o que você quer com registros.

A Batalha de Yavin vista do convés do hangar — quem decolou, quem voltou, e quem
subiu ao palanque na cerimônia:

```ts
import { SequenceCollection } from '@fulcro/collections';

const launched = [
	'Luke Skywalker',
	'Wedge Antilles',
	'Biggs Darklighter',
	'Garven Dreis',
	'Jon Vander',
];
const returned = ['Luke Skywalker', 'Wedge Antilles'];
const callSigns = ['Red Five', 'Red Two', 'Red Three', 'Red Leader', 'Gold Leader'];

const lost = SequenceCollection.from(launched).except(returned).toArray();

const flightLog = SequenceCollection.from(launched)
	.zip(callSigns, (pilot, callSign) => `${callSign}: ${pilot}`)
	.toArray();

const decorated = SequenceCollection.from(returned)
	.union(['Han Solo', 'Chewbacca', 'Luke Skywalker'])
	.toArray();

const onBothLists = SequenceCollection.from(launched)
	.intersect(['Han Solo', 'Luke Skywalker'])
	.toArray();

console.log(lost); // ['Biggs Darklighter', 'Garven Dreis', 'Jon Vander']
console.log(flightLog[0]); // 'Red Five: Luke Skywalker'
console.log(decorated); // ['Luke Skywalker', 'Wedge Antilles', 'Han Solo', 'Chewbacca']
console.log(onBothLists); // ['Luke Skywalker']
```

### Junções

```ts
// Um resultado por par que bate, como um inner join de SQL.
.join(starships, (captain) => captain.shipId, (ship) => ship.id, (captain, ship) => ({ …captain, ship }))

// Um resultado por elemento externo, com os que batem como um grupo — um left join.
.groupJoin(captains, (ship) => ship.id, (captain) => captain.shipId, (ship, theirs) => …)
```

A sequência interna é indexada uma vez, não uma vez por elemento externo.

Quem pilotou o quê — cada capitão com a sua nave, e cada nave com todos os seus
capitães, inclusive a que ninguém da lista pilotou:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Captain {
	name: string;
	shipId: string;
}

interface Starship {
	id: string;
	name: string;
}

const captains: Captain[] = [
	{ name: 'Lando Calrissian', shipId: 'falcon' },
	{ name: 'Han Solo', shipId: 'falcon' },
	{ name: 'Hera Syndulla', shipId: 'ghost' },
	{ name: 'Din Djarin', shipId: 'razor-crest' },
];

const starships: Starship[] = [
	{ id: 'falcon', name: 'Millennium Falcon' },
	{ id: 'ghost', name: 'Ghost' },
	{ id: 'razor-crest', name: 'Razor Crest' },
	{ id: 'slave-i', name: 'Slave I' },
];

const assignments = SequenceCollection.from(captains)
	.join(
		starships,
		(captain) => captain.shipId,
		(ship) => ship.id,
		(captain, ship) => `${captain.name} flies the ${ship.name}`,
	)
	.toArray();

const ownership = SequenceCollection.from(starships)
	.groupJoin(
		captains,
		(ship) => ship.id,
		(captain) => captain.shipId,
		(ship, theirs) => ({
			ship: ship.name,
			captains: theirs.select((captain) => captain.name).toArray(),
		}),
	)
	.toArray();

console.log(assignments[1]); // 'Han Solo flies the Millennium Falcon'
console.log(ownership[0]); // { ship: 'Millennium Falcon', captains: ['Lando Calrissian', 'Han Solo'] }
console.log(ownership[3]); // { ship: 'Slave I', captains: [] }
```

### Pegando um elemento só

```ts
.first()            .firstOrNull()       // lança / null quando vazia
.last()             .lastOrNull()
.single()           .singleOrNull()      // exatamente um, ou é um erro
.elementAt(5)       .elementAtOrNull(5)
```

`single` difere de `first` de propósito: um segundo que bate é um problema tanto
quanto nenhum. `singleOrNull` ainda lança com dois — uma resposta ambígua é um
defeito da consulta, não uma ausência a tolerar.

Organizando os assentos do Alto Conselho Jedi, onde algumas perguntas têm uma
resposta certa e algumas não têm nenhuma:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface CouncilMember {
	name: string;
	species: string;
	seat: number;
}

const council = SequenceCollection.from<CouncilMember>([
	{ name: 'Yoda', species: 'unknown', seat: 1 },
	{ name: 'Mace Windu', species: 'Human', seat: 2 },
	{ name: 'Ki-Adi-Mundi', species: 'Cerean', seat: 3 },
	{ name: 'Plo Koon', species: 'Kel Dor', seat: 4 },
]);

console.log(council.single((member) => member.species === 'Cerean').name); // 'Ki-Adi-Mundi'
console.log(council.singleOrNull((member) => member.species === 'Wookiee')); // null
console.log(council.first((member) => member.seat > 1).name); // 'Mace Windu'
console.log(council.last().name); // 'Plo Koon'
console.log(council.elementAtOrNull(12)); // null — Anakin não ganhou um assento

// council.single((member) => member.seat > 2) lança: Ki-Adi-Mundi e Plo Koon
// batem os dois, e escolher um esconderia que a pergunta estava errada.
```

### Fazendo uma pergunta

```ts
.any()                          .any((fighter) => !fighter.hyperdriveOnline)
.all((fighter) => fighter.torpedoes > 0)
.contains('Red Five')
.count()                        .count((fighter) => fighter.model === 'Y-wing')
.sequenceEqual(briefingOrder)
```

`count()` muitas vezes responde **sem percorrer** — um array sabe o seu tamanho,
e esse conhecimento sobrevive a `select`, `take`, `skip`, `concat`, `chunk` e
outros.

A verificação pré-voo antes da corrida pela trincheira:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Fighter {
	callSign: string;
	model: 'X-wing' | 'Y-wing';
	torpedoes: number;
	hyperdriveOnline: boolean;
}

const trenchRun: Fighter[] = [
	{ callSign: 'Red Five', model: 'X-wing', torpedoes: 2, hyperdriveOnline: true },
	{ callSign: 'Red Two', model: 'X-wing', torpedoes: 2, hyperdriveOnline: true },
	{ callSign: 'Gold Leader', model: 'Y-wing', torpedoes: 2, hyperdriveOnline: true },
	{ callSign: 'Gold Five', model: 'Y-wing', torpedoes: 2, hyperdriveOnline: false },
];

const fighters = SequenceCollection.from(trenchRun);
const callSigns = fighters.select((fighter) => fighter.callSign);

console.log(fighters.all((fighter) => fighter.torpedoes > 0)); // true
console.log(fighters.any((fighter) => !fighter.hyperdriveOnline)); // true — o Gold Five não consegue saltar
console.log(fighters.count((fighter) => fighter.model === 'Y-wing')); // 2
console.log(callSigns.contains('Red Five')); // true
console.log(callSigns.count()); // 4 — o tamanho do array, carregado através do select, sem percorrer nada
console.log(callSigns.sequenceEqual(['Red Five', 'Red Two', 'Gold Leader', 'Gold Five'])); // true
```

### Números

```ts
.sum((bounty) => bounty.credits)         .average((bounty) => bounty.credits)
.min((bounty) => bounty.credits)         .max((bounty) => bounty.credits)
.minBy((bounty) => bounty.credits)       .maxBy((bounty) => bounty.credits)   // o registro, não o valor
.median((bounty) => bounty.credits)      .percentile(95, (bounty) => bounty.credits)
.standardDeviation((bounty) => bounty.credits)
.sampleStandardDeviation((bounty) => bounty.credits)
```

`min` dá o menor número; `minBy` dá a **recompensa que o trazia**, que costuma
ser o que você queria.

Os dois desvios-padrão são nomes separados em vez de um só com uma flag. Eles
dividem por `n` e por `n - 1`, as respostas divergem mais justamente quando os
dados são poucos, e um padrão silencioso estaria errado metade das vezes. Use a
forma populacional para o conjunto inteiro, e a amostral para uma amostra tirada
de algo maior.

O quadro de recompensas da Guilda, resumido para um caçador escolhendo um
trabalho:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Bounty {
	target: string;
	credits: number;
}

const board = SequenceCollection.from<Bounty>([
	{ target: 'Han Solo', credits: 50_000 },
	{ target: 'Chewbacca', credits: 15_000 },
	{ target: 'Mythrol', credits: 5_000 },
	{ target: 'Grogu', credits: 100_000 },
]);

const credits = (bounty: Bounty): number => bounty.credits;

console.log(board.sum(credits)); // 170000
console.log(board.average(credits)); // 42500
console.log(board.max(credits)); // 100000
console.log(board.maxBy(credits).target); // 'Grogu' — a recompensa, não o número
console.log(board.minBy(credits).target); // 'Mythrol'
console.log(board.median(credits)); // 32500
console.log(Math.round(board.standardDeviation(credits))); // 37165 — o quadro inteiro
console.log(Math.round(board.sampleStandardDeviation(credits))); // 42915 — como amostra de todos os quadros da galáxia
```

### Acumulando

```ts
.aggregate(0, (balance, entry) => balance + entry.credits)   // um valor final
.scan(0, (balance, entry) => balance + entry.credits)        // todo valor parcial
```

`scan` é o `aggregate` que mostra as contas — um saldo depois de cada transação,
em vez de só o último. Ele emite um valor por elemento, então fica do mesmo
tamanho da sua fonte e pode ser combinado com ela por `zip`.

O livro-caixa da Millennium Falcon, de Mos Eisley até a cerimônia das medalhas:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface LedgerEntry {
	note: string;
	credits: number;
}

const ledger: LedgerEntry[] = [
	{ note: 'Charter to Alderaan, paid up front by Obi-Wan Kenobi', credits: 2_000 },
	{ note: 'Docking Bay 94 fees', credits: -1_750 },
	{ note: 'Reward for rescuing Princess Leia', credits: 15_000 },
];

const entries = SequenceCollection.from(ledger);

const finalBalance = entries.aggregate(0, (balance, entry) => balance + entry.credits);

const statement = entries
	.scan(0, (balance, entry) => balance + entry.credits)
	.zip(ledger, (balance, entry) => `${entry.note}: ${String(balance)}`)
	.toArray();

console.log(finalBalance); // 15250
console.log(statement);
// [
//   'Charter to Alderaan, paid up front by Obi-Wan Kenobi: 2000',
//   'Docking Bay 94 fees: 250',
//   'Reward for rescuing Princess Leia: 15250',
// ]
```

### Dividindo numa passada só

```ts
const [lightSide, darkSide] = forceUsers.partition((user) => user.side === 'light');
```

Duas chamadas a `where` leem a fonte duas vezes. Esta lê uma vez — o que um
generator não aguentaria de outro jeito, e o que corta pela metade o trabalho de
um predicado caro.

Um holocron que só pode ser lido uma vez, separado entre os dois lados da Força:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface ForceUser {
	name: string;
	side: 'light' | 'dark';
}

let recordsRead = 0;

const holocron = function* (): Generator<ForceUser> {
	const records: ForceUser[] = [
		{ name: 'Luke Skywalker', side: 'light' },
		{ name: 'Darth Vader', side: 'dark' },
		{ name: 'Ahsoka Tano', side: 'light' },
		{ name: 'Darth Maul', side: 'dark' },
		{ name: 'Rey', side: 'light' },
	];

	for (const record of records) {
		recordsRead++;
		yield record;
	}
};

const [lightSide, darkSide] = SequenceCollection.from(holocron()).partition(
	(user) => user.side === 'light',
);

console.log(lightSide.select((user) => user.name).toArray()); // ['Luke Skywalker', 'Ahsoka Tano', 'Rey']
console.log(darkSide.select((user) => user.name).toArray()); // ['Darth Vader', 'Darth Maul']
console.log(recordsRead); // 5 — o holocron foi lido uma vez, para os dois lados
```

### Materializando

```ts
.toArray()      .toSet()
.toMap((trooper) => trooper.designation)   // recusa uma chave duplicada
.toLookup((trooper) => trooper.legion)      // reúne as duplicatas em vez disso
```

As fichas do pessoal do Grande Exército, indexadas dos dois jeitos de que um
intendente precisa:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface CloneTrooper {
	designation: string;
	nickname: string;
	legion: string;
}

const troopers: CloneTrooper[] = [
	{ designation: 'CT-7567', nickname: 'Rex', legion: '501st' },
	{ designation: 'CT-5555', nickname: 'Fives', legion: '501st' },
	{ designation: 'CC-2224', nickname: 'Cody', legion: '212th' },
	{ designation: 'CT-21-0408', nickname: 'Echo', legion: '501st' },
];

const personnel = SequenceCollection.from(troopers);

const byDesignation = personnel.toMap((trooper) => trooper.designation);
const byLegion = personnel.toLookup(
	(trooper) => trooper.legion,
	(trooper) => trooper.nickname,
);
const legions = personnel.select((trooper) => trooper.legion).toSet();

console.log(byDesignation.get('CT-7567')?.nickname); // 'Rex'
console.log(byLegion.get('501st')); // ['Rex', 'Fives', 'Echo']
console.log(legions); // Set(2) { '501st', '212th' }

// personnel.toMap((trooper) => trooper.legion) lança: '501st' é a chave de três
// soldados, e um map que guardasse só um deles perderia dois em silêncio.
```

## A única coisa que vai te surpreender

Uma sequência sobre um **generator** — ou qualquer outra fonte de uma passada só
— não produz nada numa segunda travessia. Em silêncio, porque um iterador
esgotado não se distingue de um vazio:

```ts
const query = SequenceCollection.from(interceptedSignals()).select(decrypt);

query.count(); // lê o generator
query.toArray(); // [] — o generator acabou
```

Uma cadeia percorrida duas vezes também roda as suas projeções duas vezes, o que
não é problema até a projeção ser um parse ou uma requisição.

`memoize` resolve as duas coisas:

```ts
const kept = query.memoize();

kept.count(); // lê uma vez
kept.toArray(); // todo sinal, e `decrypt` nunca rodou de novo
```

Os elementos são lembrados à medida que são lidos, então o custo é memória — e
pago só pela parte que você de fato consumiu.

A armadilha inteira e a saída dela, com as decifrações contadas:

```ts
import { SequenceCollection } from '@fulcro/collections';

let decryptions = 0;

const decrypt = (signal: string): string => {
	decryptions++;

	return signal.toUpperCase();
};

const interceptedSignals = function* (): Generator<string> {
	yield 'scarif';
	yield 'jedha';
	yield 'eadu';
};

const once = SequenceCollection.from(interceptedSignals()).select(decrypt);

console.log(once.count()); // 3
console.log(once.toArray()); // [] — o generator foi gasto pelo count()

decryptions = 0;

const kept = SequenceCollection.from(interceptedSignals()).select(decrypt).memoize();

console.log(kept.count()); // 3
console.log(kept.toArray()); // ['SCARIF', 'JEDHA', 'EADU']
console.log(decryptions); // 3 — uma por sinal, quantas vezes for lido
```

**Arrays não são afetados.** Isto só pega generators, iteradores e qualquer outra
coisa que só pode ser percorrida uma vez.

## Cenários reais

### Uma lista dos dez maiores a partir de um array grande

```ts
const busiest = SequenceCollection.from(jobs)
	.groupBy((job) => job.smuggler)
	.select((group) => ({ smuggler: group.key, jobs: group.count() }))
	.topBy((row) => row.jobs, 10)
	.toArray();
```

`topBy` responde exatamente o que `orderByDescending(...).take(10)` responde — os
mesmos elementos, na mesma ordem, com os empates desfeitos do mesmo jeito — sem
ordenar a parte que vai jogar fora. Ele mantém uma janela com os dez melhores
vistos até agora, então cada elemento custa uma comparação contra o mais fraco
deles.

Em cem mil registros pedindo dez, medido: **201.400 comparações de chave para o
`topBy` contra 4.532.640 para a ordenação**, um fator de 22. O custo por elemento
não cresce com quantos você pede, e é por isso que a janela pode ser de mil quase
pelo mesmo preço de uma.

Use a ordenação quando quiser tudo ordenado; use `topBy` quando você só queria a
cabeça.

Os contrabandistas mais ocupados de Mos Eisley nesta temporada, a partir do livro
de trabalhos da cantina:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface SmugglingJob {
	smuggler: string;
	cargo: string;
	client: string;
}

const jobBook: SmugglingJob[] = [
	{ smuggler: 'Han Solo', cargo: 'spice', client: 'Jabba the Hutt' },
	{ smuggler: 'Lando Calrissian', cargo: 'Tibanna gas', client: 'Cloud City' },
	{ smuggler: 'Han Solo', cargo: 'coaxium', client: 'Crimson Dawn' },
	{ smuggler: 'Hondo Ohnaka', cargo: 'kyber crystals', client: 'unknown' },
	{ smuggler: 'Han Solo', cargo: 'passengers', client: 'Obi-Wan Kenobi' },
	{ smuggler: 'Lando Calrissian', cargo: 'droids', client: 'Rebel Alliance' },
];

const busiest = SequenceCollection.from(jobBook)
	.groupBy((job) => job.smuggler)
	.select((group) => ({ smuggler: group.key, jobs: group.count() }))
	.topBy((row) => row.jobs, 2)
	.toArray();

console.log(busiest); // [{ smuggler: 'Han Solo', jobs: 3 }, { smuggler: 'Lando Calrissian', jobs: 2 }]
```

### Paginação

```ts
const onPage = SequenceCollection.from(bounties)
	.where((bounty) => bounty.sector === sector)
	.orderByDescending((bounty) => bounty.credits)
	.skip(page * size)
	.take(size)
	.toArray();
```

O terminal da Guilda, mostrando o quadro da Orla Exterior duas recompensas por
vez:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Bounty {
	target: string;
	sector: 'Outer Rim' | 'Core Worlds';
	credits: number;
}

const guildBoard: Bounty[] = [
	{ target: 'Grogu', sector: 'Outer Rim', credits: 100_000 },
	{ target: 'Han Solo', sector: 'Outer Rim', credits: 50_000 },
	{ target: 'Mythrol', sector: 'Outer Rim', credits: 5_000 },
	{ target: 'Qi’ra', sector: 'Core Worlds', credits: 80_000 },
	{ target: 'Chewbacca', sector: 'Outer Rim', credits: 15_000 },
];

const pageOf = (sector: Bounty['sector'], page: number, size: number): string[] => {
	return SequenceCollection.from(guildBoard)
		.where((bounty) => bounty.sector === sector)
		.orderByDescending((bounty) => bounty.credits)
		.skip(page * size)
		.take(size)
		.select((bounty) => bounty.target)
		.toArray();
};

console.log(pageOf('Outer Rim', 0, 2)); // ['Grogu', 'Han Solo']
console.log(pageOf('Outer Rim', 1, 2)); // ['Chewbacca', 'Mythrol']
```

### Gravando em lotes

```ts
SequenceCollection.from(records)
	.chunk(500)
	.forEach((batch) => jediArchive.insertMany(batch));
```

Copiando os registros do Templo para Ilum antes do expurgo, em lotes que o
arquivo aguenta:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface ArchiveRecord {
	shelf: number;
	title: string;
}

const jediArchive = {
	writes: 0,
	insertMany(batch: readonly ArchiveRecord[]): void {
		this.writes++;
		console.log(`Archived shelves ${String(batch[0]?.shelf)}–${String(batch.at(-1)?.shelf)}`);
	},
};

const templeRecords = SequenceCollection.range(1, 1_200).select((shelf) => ({
	shelf,
	title: `Holocron ${String(shelf)}`,
}));

templeRecords.chunk(500).forEach((batch) => jediArchive.insertMany(batch));
// 'Archived shelves 1–500'
// 'Archived shelves 501–1000'
// 'Archived shelves 1001–1200'

console.log(jediArchive.writes); // 3
```

### Detectando lacunas numa série

```ts
const gaps = SequenceCollection.from(pings)
	.orderBy((ping) => ping.minute)
	.pairwise()
	.where(([before, after]) => after.minute - before.minute > silence)
	.toArray();
```

Os sensores de perímetro da Base Echo, verificados atrás dos minutos em que um
droide sonda poderia ter passado despercebido:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface SensorPing {
	minute: number;
	post: string;
}

const perimeter: SensorPing[] = [
	{ minute: 12, post: 'North Ridge' },
	{ minute: 3, post: 'Ion Cannon' },
	{ minute: 5, post: 'Shield Generator' },
	{ minute: 21, post: 'North Ridge' },
	{ minute: 14, post: 'Hangar' },
];

const silence = 5;

const blindSpots = SequenceCollection.from(perimeter)
	.orderBy((ping) => ping.minute)
	.pairwise()
	.where(([before, after]) => after.minute - before.minute > silence)
	.select(
		([before, after]) =>
			`No contact from minute ${String(before.minute)} to ${String(after.minute)}`,
	)
	.toArray();

console.log(blindSpots);
// ['No contact from minute 5 to 12', 'No contact from minute 14 to 21']
```

### Separando válidos de inválidos, uma vez

```ts
const [cleared, flagged] = SequenceCollection.from(manifests).partition(passesInspection);

await dock(cleared.toArray());
report(flagged.count());
```

Um posto de controle imperial em Mos Eisley, liberando os manifestos e marcando
o resto numa leitura só da fila:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface CargoManifest {
	ship: string;
	declared: string[];
	imperialPermit: boolean;
}

const queue: CargoManifest[] = [
	{ ship: 'Millennium Falcon', declared: ['passengers'], imperialPermit: false },
	{ ship: 'Sandcrawler', declared: ['droids', 'scrap'], imperialPermit: true },
	{ ship: 'Dewback patrol', declared: [], imperialPermit: true },
];

const passesInspection = (manifest: CargoManifest): boolean => manifest.imperialPermit;

const dock = async (manifests: readonly CargoManifest[]): Promise<void> => {
	for (const manifest of manifests) console.log(`Cleared: ${manifest.ship}`);
};

const [cleared, flagged] = SequenceCollection.from(queue).partition(passesInspection);

await dock(cleared.toArray());
// 'Cleared: Sandcrawler'
// 'Cleared: Dewback patrol'

console.log(`${String(flagged.count())} ship flagged for inspection`); // '1 ship flagged for inspection'
```

## Uma nota para a configuração do bundler

Este pacote **não** é livre de efeitos colaterais e não se declara assim. Os seus
barrels rodam uma etapa de composição ao carregar, que liga as classes concretas
de grupo e de sequência ordenada a um registro de fábricas. Um bundler instruído
a tratá-lo como livre de efeitos colaterais descartaria essa etapa, e `groupBy`,
`orderBy` e `orderByDescending` falhariam em runtime.

Não é preciso configurar nada — só não acrescente um override.

## Tipos

Os contratos vêm como interfaces — `Sequence<T>`, `OrderedSequence<T>`,
`Group<K, T>` — ao lado dos tipos de delegate que os operadores recebem
(`Predicate`, `Selector`, `Comparer`, `Action`, `ResultSelector`,
`Accumulator`). Prefira-os às classes concretas nas suas próprias assinaturas:

```ts
const activePilots = (pilots: Sequence<RebelPilot>): Sequence<RebelPilot> =>
	pilots.where((pilot) => pilot.active);
```

Um módulo pequeno de um rastreador de esquadrões, tipado pelos contratos para que
qualquer sequência — de um array, de um generator ou de outra consulta — possa
ser entregue a ele:

```ts
import { SequenceCollection } from '@fulcro/collections';
import type { Group, Predicate, Sequence } from '@fulcro/collections';

interface RebelPilot {
	callSign: string;
	squadron: string;
	active: boolean;
}

const isActive: Predicate<RebelPilot> = (pilot) => pilot.active;

const activePilots = (pilots: Sequence<RebelPilot>): Sequence<RebelPilot> => pilots.where(isActive);

const bySquadron = (pilots: Sequence<RebelPilot>): Sequence<Group<string, RebelPilot>> => {
	return activePilots(pilots).groupBy((pilot) => pilot.squadron);
};

const hothDefense = SequenceCollection.from<RebelPilot>([
	{ callSign: 'Rogue Leader', squadron: 'Rogue', active: true },
	{ callSign: 'Rogue Two', squadron: 'Rogue', active: true },
	{ callSign: 'Rogue Three', squadron: 'Rogue', active: false },
]);

const summary = bySquadron(hothDefense)
	.select((group) => `${group.key}: ${String(group.count())} flying`)
	.toArray();

console.log(summary); // ['Rogue: 2 flying']
```

## Referência

| Adiados                                                   | Imediatos                                             |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `where` `select` `selectMany`                             | `first` `firstOrNull` `last` `lastOrNull`             |
| `take` `skip` `takeWhile` `skipWhile`                     | `single` `singleOrNull` `elementAt` `elementAtOrNull` |
| `takeLast` `skipLast` `chunk` `windowed`                  | `count` `countBy` `any` `all` `contains`              |
| `distinct` `distinctBy` `reverse`                         | `sum` `average` `min` `max` `minBy` `maxBy`           |
| `union` `unionBy` `intersect` `intersectBy`               | `median` `percentile` `standardDeviation`             |
| `except` `exceptBy` `concat` `zip`                        | `sampleStandardDeviation` `sequenceEqual`             |
| `append` `prepend` `defaultIfEmpty`                       | `toArray` `toMap` `toLookup` `toSet`                  |
| `join` `groupJoin` `groupBy` `groupAdjacent`              | `forEach` `aggregate` `partition`                     |
| `orderBy` `orderByDescending` `scan` `pairwise` `memoize` |                                                       |

Estáticos: `from`, `empty`, `range`, `repeat`. Num `OrderedSequence`: `thenBy`,
`thenByDescending`.

## Próximos

- [Sequências assíncronas](./async-sequences.md) — os mesmos operadores sobre
  dados que chegam com o tempo.
- [Concorrência limitada](./concurrency.md) — rodando vários elementos ao mesmo
  tempo.
