# Fluxo de controle: `switchFor`, `tryCatch`, `Result`, `Option` e `equals`

🇺🇸 English: [Read this documentation in English](../functions.md)

Funções que transformam instruções em expressões, dois tipos que transformam
falha e ausência em valores, e uma comparação de dois valores pelo que eles
guardam. Sem dependências, sem envolvimento do compilador, nada a configurar.

```sh
npm install @fulcro/functions
```

Os tipos precisam do TypeScript 5.4 ou mais recente, de que `typescript` é um
peer opcional: com um mais antigo, o npm recusa a instalação com `ERESOLVE`. Um
projeto sem TypeScript não precisa de mais nada.

```ts
import {
	createEquals,
	type EqualityRule,
	equals,
	failure,
	none,
	type Option,
	optionOf,
	type Result,
	some,
	success,
	switchFor,
	tryCatch,
} from '@fulcro/functions';
```

## `switchFor`

### A forma exaustiva — enums e uniões de literais

Passe um ramo por membro, e **o compilador garante que todo membro tenha um**:

```ts
enum HyperdriveStatus {
	Online,
	Damaged,
	Offline,
}

const label = switchFor(status, {
	[HyperdriveStatus.Online]: () => 'ready to jump',
	[HyperdriveStatus.Damaged]: () => 'jump at your own risk',
	[HyperdriveStatus.Offline]: () => "it's not my fault",
});
```

Deixe um de fora e não compila:

```text
error TS2769: No overload matches this call.
  …
      Property '[HyperdriveStatus.Offline]' is missing in type
      '{ 0: () => string; 1: () => string; }' but required in type
      'ExhaustiveCases<HyperdriveStatus, string>'.
```

**Esse erro é o objetivo inteiro.** Acrescente um membro ao enum daqui a seis
meses e todo `switchFor` sobre ele deixa de compilar até o caso novo ser tratado
— que é o momento de decidir o que ele deve fazer, em vez de descobrir em
produção. Um `switch` nativo não diz nada; simplesmente passa direto.

Não há, de propósito, **nenhum fallback** nesta forma. Um fallback é
exatamente o que absorveria o membro novo em silêncio e levaria a garantia
embora.

O painel de prontidão do hangar de um contrabandista, uma linha por nave:

```ts
import { switchFor } from '@fulcro/functions';

enum HyperdriveStatus {
	Online,
	Damaged,
	Offline,
}

interface Ship {
	name: string;
	hyperdrive: HyperdriveStatus;
}

const hangar: Ship[] = [
	{ name: 'Millennium Falcon', hyperdrive: HyperdriveStatus.Offline },
	{ name: 'Ghost', hyperdrive: HyperdriveStatus.Online },
	{ name: 'Razor Crest', hyperdrive: HyperdriveStatus.Damaged },
];

const readiness = (ship: Ship): string => {
	return switchFor(ship.hyperdrive, {
		[HyperdriveStatus.Online]: () => `${ship.name}: ready to jump`,
		[HyperdriveStatus.Damaged]: () => `${ship.name}: jump at your own risk`,
		[HyperdriveStatus.Offline]: () => `${ship.name}: it's not my fault`,
	});
};

console.log(hangar.map(readiness));
// ["Millennium Falcon: it's not my fault", 'Ghost: ready to jump', 'Razor Crest: jump at your own risk']
```

Cada ramo recebe o único membro que trata, já estreitado:

```ts
switchFor(status, {
	[HyperdriveStatus.Damaged]: (value) => {
		const damaged: HyperdriveStatus.Damaged = value; // não HyperdriveStatus
		return scheduleRepair(damaged);
	},
	// …
});
```

O membro estreitado, passado adiante para uma função que só aceita aquele:

```ts
import { switchFor } from '@fulcro/functions';

enum HyperdriveStatus {
	Online,
	Damaged,
	Offline,
}

// Só um hiperpropulsor danificado pode ser agendado na baia de reparos do Chewbacca.
const scheduleRepair = (status: HyperdriveStatus.Damaged): string => {
	return `Repair bay booked (status ${String(status)}): Chewie has the hydrospanner`;
};

const nextStep = (status: HyperdriveStatus): string => {
	return switchFor(status, {
		[HyperdriveStatus.Online]: () => 'Punch it',
		[HyperdriveStatus.Damaged]: (value) => {
			const damaged: HyperdriveStatus.Damaged = value;

			return scheduleRepair(damaged);
		},
		[HyperdriveStatus.Offline]: () => 'Find a new motivator',
	});
};

console.log(nextStep(HyperdriveStatus.Damaged)); // 'Repair bay booked (status 1): Chewie has the hydrospanner'
console.log(nextStep(HyperdriveStatus.Online)); // 'Punch it'
```

Funciona com enums numéricos, enums de string e uniões de literais de string ou
de número:

```ts
const blade = switchFor(side, {
	light: () => '🔵',
	dark: () => '🔴',
});
```

Um membro cujo valor é `0` é despachado como qualquer outro — o ramo é
encontrado pela chave, nunca testando se o valor é verdadeiro.

Uma união de literais, e um enum cujo primeiro membro é `0`:

```ts
import { switchFor } from '@fulcro/functions';

type Side = 'light' | 'dark';

enum Rank {
	Youngling,
	Padawan,
	Knight,
	Master,
}

interface ForceUser {
	name: string;
	side: Side;
	rank: Rank;
}

const describe = (user: ForceUser): string => {
	const blade = switchFor(user.side, {
		light: () => 'blue',
		dark: () => 'red',
	});

	const title = switchFor(user.rank, {
		[Rank.Youngling]: () => 'Youngling',
		[Rank.Padawan]: () => 'Padawan',
		[Rank.Knight]: () => 'Jedi Knight',
		[Rank.Master]: () => 'Master',
	});

	return `${title} ${user.name}, ${blade} blade`;
};

console.log(describe({ name: 'Grogu', side: 'light', rank: Rank.Youngling })); // 'Youngling Grogu, blue blade'
console.log(describe({ name: 'Kylo Ren', side: 'dark', rank: Rank.Knight })); // 'Jedi Knight Kylo Ren, red blade'
```

### Executando pelos efeitos

Não há uma função separada que retorne `void`, e nenhuma é necessária:

```ts
switchFor(alert, {
	[Alert.Green]: () => resumePatrols(),
	[Alert.Yellow]: () => scrambleSnowspeeders(),
	[Alert.Red]: () => evacuateEchoBase(),
});
```

A verificação de exaustividade vale aqui exatamente como vale para uma chamada
cujo resultado é lido.

O painel de alerta da Base Echo, onde cada nível faz algo em vez de devolver
algo:

```ts
import { switchFor } from '@fulcro/functions';

enum Alert {
	Green,
	Yellow,
	Red,
}

const orders: string[] = [];

const resumePatrols = (): void => {
	orders.push('Tauntaun patrols resume');
};

const scrambleSnowspeeders = (): void => {
	orders.push('Rogue Squadron to the snowspeeders');
};

const evacuateEchoBase = (): void => {
	orders.push('Begin evacuation — transports first');
};

const raise = (alert: Alert): void => {
	switchFor(alert, {
		[Alert.Green]: () => resumePatrols(),
		[Alert.Yellow]: () => scrambleSnowspeeders(),
		[Alert.Red]: () => evacuateEchoBase(),
	});
};

raise(Alert.Yellow);
raise(Alert.Red);

console.log(orders); // ['Rogue Squadron to the snowspeeders', 'Begin evacuation — transports first']
```

### A forma por predicado — todo o resto

Onde os ramos são condições, e não valores:

```ts
const size = switchFor(
	ship,
	[
		{ when: (s) => s.crew > 1000, then: () => 'capital ship' },
		{ when: (s) => s.hyperdriveClass === null, then: () => 'sublight only' },
	],
	() => 'starfighter',
);
```

Os ramos são testados em ordem, o primeiro que casa vence, e os demais nunca são
avaliados — nem as condições, nem os corpos.

`otherwise` é opcional, e deixá-lo de fora aparece no tipo em vez de ficar
escondido:

```ts
const a = switchFor(ship, cases); // string | undefined
const b = switchFor(ship, cases, () => 'starfighter'); // string
```

Esta forma **não pode** ser exaustiva. Uma condição é uma função arbitrária, e o
compilador não consegue raciocinar sobre quais valores ela aceita — é por isso
que ela aceita um fallback e a forma exaustiva não.

Um registro de frota classificando naves, com e sem fallback, e contando as
condições que de fato avaliou:

```ts
import { type SwitchCase, switchFor } from '@fulcro/functions';

interface Ship {
	name: string;
	crew: number;
	hyperdriveClass: number | null;
}

let conditionsTested = 0;

const cases: SwitchCase<Ship, string>[] = [
	{
		when: (ship) => (conditionsTested++, ship.crew > 1000),
		then: () => 'capital ship',
	},
	{
		when: (ship) => (conditionsTested++, ship.hyperdriveClass === null),
		then: () => 'sublight only',
	},
];

const fleet: Ship[] = [
	{ name: 'Executor', crew: 279_144, hyperdriveClass: 2 },
	{ name: 'TIE fighter', crew: 1, hyperdriveClass: null },
	{ name: 'X-wing', crew: 1, hyperdriveClass: 1 },
];

const classes = fleet.map((ship) => `${ship.name}: ${switchFor(ship, cases, () => 'starfighter')}`);

console.log(classes); // ['Executor: capital ship', 'TIE fighter: sublight only', 'X-wing: starfighter']
console.log(conditionsTested); // 5 — a segunda condição do Executor nunca foi avaliada

const unclassified: string | undefined = switchFor(fleet[2], cases);

console.log(unclassified); // undefined — sem fallback, e o tipo diz isso
```

### Por que se dar ao trabalho

Porque a alternativa é um ternário aninhado ou um `let` mutável:

```ts
// O que ele substitui.
let label: string;

switch (status) {
	case HyperdriveStatus.Online:
		label = 'ready to jump';
		break;
	// …esqueça um caso e nada reclama
}
```

Um `switch` nativo é uma instrução, então não pode inicializar uma `const`, não
pode ser o corpo de uma arrow function e não pode ficar dentro de um objeto
literal ou de um atributo JSX. `switchFor` pode.

O relatório pré-voo que o computador da nave entrega ao piloto, montado como um
único objeto literal — o lugar onde um `switch` não pode ir:

```ts
import { switchFor } from '@fulcro/functions';

enum HyperdriveStatus {
	Online,
	Damaged,
	Offline,
}

interface PreflightReport {
	ship: string;
	hyperdrive: string;
	canJump: boolean;
}

const preflight = (ship: string, status: HyperdriveStatus): PreflightReport => ({
	ship,
	hyperdrive: switchFor(status, {
		[HyperdriveStatus.Online]: () => 'ready to jump',
		[HyperdriveStatus.Damaged]: () => 'jump at your own risk',
		[HyperdriveStatus.Offline]: () => "it's not my fault",
	}),
	canJump: status !== HyperdriveStatus.Offline,
});

console.log(preflight('Millennium Falcon', HyperdriveStatus.Offline));
// { ship: 'Millennium Falcon', hyperdrive: "it's not my fault", canJump: false }
```

## `Result`

O resultado de uma operação, como valor: ou um **sucesso**, com o valor que ela
produziu, ou uma **falha**, com o erro com que ela falhou.

```ts
const jump: Result<number, string> = Number.isNaN(parsecs)
	? failure('not a coordinate')
	: success(parsecs);
```

|           | `value` | `error`          |
| --------- | ------- | ---------------- |
| `Success` | `T`     | `null`           |
| `Failure` | `null`  | `NonNullable<E>` |

Um computador de navegação interpretando as distâncias digitadas nele, todo
desfecho como valor:

```ts
import { failure, type Result, success } from '@fulcro/functions';

const parseParsecs = (input: string): Result<number, string> => {
	const parsecs = Number(input);

	if (Number.isNaN(parsecs)) return failure(`'${input}' is not a coordinate`);
	if (parsecs <= 0) return failure('a jump needs a distance');

	return success(parsecs);
};

console.log(parseParsecs('12').value); // 12 — a Corrida de Kessel, em menos de doze
console.log(parseParsecs('Kessel').error); // "'Kessel' is not a coordinate"
console.log(parseParsecs('0').error); // 'a jump needs a distance'
```

### Trate as duas variantes com `handle`

```ts
const message = jump.handle({
	success: (value) => `plotted ${value} parsecs`,
	failure: (error) => `cannot jump: ${error}`,
});
```

Os dois ramos são obrigatórios, e **deixar um de fora não compila**:

```text
error TS2345: Argument of type '{ success: (value: number) => string; }' is not
assignable to parameter of type 'ResultCases<number, string, unknown>'.
  Property 'failure' is missing in type '{ success: (value: number) => string; }'
  but required in type 'ResultCases<number, string, unknown>'.
```

Só o ramo da variante em questão é executado. Nomear um terceiro ramo também não
compila.

O visor do computador de navegação, uma mensagem para cada desfecho:

```ts
import { failure, type Result, success } from '@fulcro/functions';

const parseParsecs = (input: string): Result<number, string> => {
	const parsecs = Number(input);

	return Number.isNaN(parsecs) ? failure(`'${input}' is not a coordinate`) : success(parsecs);
};

const display = (input: string): string => {
	return parseParsecs(input).handle({
		success: (value) => `Plotted: ${String(value)} parsecs`,
		failure: (error) => `Cannot jump: ${error}`,
	});
};

console.log(display('12')); // 'Plotted: 12 parsecs'
console.log(display('Dagobah')); // "Cannot jump: 'Dagobah' is not a coordinate"
```

### Ou estreite antes

```ts
if (jump.isSuccess()) {
	jump.value; // number, não number | null
}

if (jump.isFailure()) {
	jump.error; // string
}
```

`error === null` estreita do mesmo jeito, e é a verificação a usar num resultado
que foi copiado — por `structuredClone`, através de um worker ou por JSON. A
cópia mantém os dados do resultado, mas não os métodos que ele herda.

Uma rota calculada numa nave e enviada para outra: o original estreita com os
seus métodos, a cópia com `error === null`:

```ts
import { type Result, success } from '@fulcro/functions';

const course: Result<number, string> = success(12);

if (course.isSuccess()) {
	console.log(course.value + 1); // 13 — `value` é um number aqui
}

// Enviado pelo link de comunicação, o resultado chega como os seus dados, sem os métodos.
const received: Result<number, string> = structuredClone(course);

console.log(typeof received.isSuccess); // 'undefined'

if (received.error === null) {
	console.log(`Course received: ${String(received.value)} parsecs`); // 'Course received: 12 parsecs'
}
```

### Distinga pela variante, nunca por `value`

`0`, `''` e `null` são valores perfeitamente válidos, e `if (result.value)`
reporta cada um deles como falha. `isSuccess()`, `isFailure()` e
`error === null` não têm essa armadilha.

O erro de uma falha nunca é `null` nem `undefined` — `failure(null)` não compila
— porque uma falha cujo erro é `null` seria lida como sucesso.

## `tryCatch`

Executa uma operação e devolve o resultado dela como um [`Result`](#result), em
vez de lançar:

```ts
const result = await tryCatch(() => hailRebelBase(frequency));

if (result.isFailure()) return fallback;

use(result.value);
```

Um transmissor que lança quando o Império bloqueia a frequência, transformado
num valor sobre o qual quem chamou pode decidir:

```ts
import { tryCatch } from '@fulcro/functions';

const jammed = new Set([1138]);

const hailRebelBase = async (frequency: number): Promise<string> => {
	await new Promise((resolve) => setTimeout(resolve, 5));

	if (jammed.has(frequency)) throw new Error(`frequency ${String(frequency)} is jammed`);

	return 'Echo Base here — go ahead, Rogue Leader';
};

const contact = async (frequency: number): Promise<string> => {
	const result = await tryCatch(() => hailRebelBase(frequency));

	if (result.isFailure())
		return `No answer (${(result.error as Error).message}); switching to the backup channel`;

	return result.value;
};

console.log(await contact(1977)); // 'Echo Base here — go ahead, Rogue Leader'
console.log(await contact(1138)); // 'No answer (frequency 1138 is jammed); switching to the backup channel'
```

### Prefira a forma com callback

```ts
await tryCatch(() => openBlastDoors(code)); // ✓ captura tudo
await tryCatch(openBlastDoors(code)); // ✗ perde um throw síncrono
```

Na segunda forma, `openBlastDoors` roda **antes** de `tryCatch`, então qualquer
coisa que ela lance no caminho até produzir uma promise escapa por completo. A
forma com callback move essa chamada para dentro do `try`, que é o único jeito
de cobrir tanto a falha síncrona quanto a assíncrona de uma mesma operação.

A forma com promise continua aceita, e lê melhor quando a promise já está em
mãos.

As portas blindadas da Estrela da Morte, que recusam um código errado antes de
existir qualquer promise — e o que cada forma faz disso:

```ts
import { tryCatch } from '@fulcro/functions';

const openBlastDoors = (code: string): Promise<string> => {
	if (code !== 'THX-1138') throw new Error('access denied');

	return Promise.resolve('Blast doors open');
};

const caught = await tryCatch(() => openBlastDoors('TK-421'));

console.log(caught.isFailure()); // true — o throw síncrono virou um valor

let escaped = false;

try {
	await tryCatch(openBlastDoors('TK-421'));
} catch {
	escaped = true;
}

console.log(escaped); // true — lançou antes mesmo de tryCatch ser chamado

const opened = await tryCatch(openBlastDoors('THX-1138'));

console.log(opened.value); // 'Blast doors open' — tudo certo quando a promise já está em mãos
```

### `E` tem `unknown` como padrão, não `Error`

JavaScript permite lançar qualquer valor. Tipar o erro como `Error` seria uma
promessa que a função não consegue cumprir — `result.error.message` leria
`undefined` sempre que algo lançasse uma string. Então estreite no ponto de uso,
ou informe o tipo quando você controla todos os pontos que lançam:

```ts
const result = await tryCatch<Pilot, ArchiveError>(() => rebelArchive.load(callSign));
```

Um `null` ou `undefined` lançado — válido, por mais patológico que seja — é
envolvido num `Error` que carrega o original como `cause`
([`FULCRO2001`](./errors/FULCRO2xxx.md#fulcro2001)), porque guardá-lo como veio
tornaria a falha indistinguível de um sucesso.

Um arquivo que controla todos os seus pontos de throw, e diz isso no tipo:

```ts
import { tryCatch } from '@fulcro/functions';

interface Pilot {
	callSign: string;
	name: string;
}

class ArchiveError extends Error {
	constructor(readonly callSign: string) {
		super(`no pilot on file as ${callSign}`);
	}
}

const pilots = new Map([['Red Five', { callSign: 'Red Five', name: 'Luke Skywalker' }]]);

const rebelArchive = {
	load: async (callSign: string): Promise<Pilot> => {
		const pilot = pilots.get(callSign);

		if (pilot === undefined) throw new ArchiveError(callSign);

		return pilot;
	},
};

const result = await tryCatch<Pilot, ArchiveError>(() => rebelArchive.load('Red Six'));

if (result.isFailure()) {
	console.log(result.error.callSign); // 'Red Six' — tipado, porque todo ponto de throw é nosso
}

const thrownNothing = await tryCatch(() => {
	throw undefined;
});

console.log((thrownNothing.error as Error).message.startsWith('FULCRO2001')); // true
```

### Onde você realmente usa

```ts
// Várias coisas independentes, em que uma falhar não deve parar as outras.
const [plans, fleet, intelligence] = await Promise.all([
	tryCatch(() => loadDeathStarPlans()),
	tryCatch(() => loadFleetPositions()),
	tryCatch(() => loadBothanReports()),
]);

brief({
	plans: plans.value,
	fleet: fleet.handle({ success: (ships) => ships, failure: () => [] }),
});
```

```ts
// Uma fronteira em que um throw seria pior do que um valor.
const parsed = await tryCatch(async () => JSON.parse(body));

if (parsed.isFailure()) return reply.status(400).send('garbled transmission');
```

O briefing de Mon Mothma antes de Endor, montado a partir de três fontes em que
uma falhar não pode cancelar o briefing:

```ts
import { tryCatch } from '@fulcro/functions';

const loadDeathStarPlans = async (): Promise<string> => 'Shield generator on the forest moon';

const loadFleetPositions = async (): Promise<string[]> => {
	throw new Error('Sullust relay is down');
};

const loadBothanReports = async (): Promise<number> => 3;

const [plans, fleet, intelligence] = await Promise.all([
	tryCatch(() => loadDeathStarPlans()),
	tryCatch(() => loadFleetPositions()),
	tryCatch(() => loadBothanReports()),
]);

const briefing = {
	plans: plans.value,
	fleet: fleet.handle({ success: (ships) => ships, failure: () => [] }),
	reports: intelligence.value ?? 0,
};

console.log(briefing); // { plans: 'Shield generator on the forest moon', fleet: [], reports: 3 }
```

E o retransmissor de Mos Eisley, que precisa responder a uma transmissão
truncada com um status em vez de cair:

```ts
import { tryCatch } from '@fulcro/functions';

interface Reply {
	code: number;
	body: string;
}

const relay = async (body: string): Promise<Reply> => {
	const parsed = await tryCatch(async (): Promise<{ to: string }> => JSON.parse(body));

	if (parsed.isFailure()) return { code: 400, body: 'garbled transmission' };

	return { code: 200, body: `relayed to ${parsed.value.to}` };
};

console.log(await relay('{ "to": "Tantive IV" }')); // { code: 200, body: 'relayed to Tantive IV' }
console.log(await relay('help me obi-wan')); // { code: 400, body: 'garbled transmission' }
```

### Coletando falhas ao longo de um lote

Ele se compõe com os outros pacotes em vez de precisar de um modo próprio:

```ts
const outcomes = await AsyncSequenceCollection.from(callSigns)
	.selectAwait((callSign) => tryCatch(() => rebelArchive.load(callSign)), { concurrency: 8 })
	.toArray();

const [loaded, failed] = SequenceCollection.from(outcomes).partition((outcome) =>
	outcome.isSuccess(),
);
```

Todo elemento é tentado, nada para antes da hora, e você recebe as duas metades.

`tryCatch` sempre devolve uma promise, inclusive para uma operação totalmente
síncrona.

Carregando todos os pilotos da escala de um esquadrão, com os indicativos de que
o arquivo nunca ouviu falar separados, em vez de interromperem a carga:

```ts
import { SequenceCollection } from '@fulcro/collections';
import { AsyncSequenceCollection } from '@fulcro/collections/async';
import { tryCatch } from '@fulcro/functions';

const pilots = new Map([
	['Red Two', 'Wedge Antilles'],
	['Red Five', 'Luke Skywalker'],
	['Gold Leader', 'Lando Calrissian'],
]);

const rebelArchive = {
	load: async (callSign: string): Promise<string> => {
		await new Promise((resolve) => setTimeout(resolve, 5));

		const name = pilots.get(callSign);

		if (name === undefined) throw new Error(`${callSign} is not on file`);

		return name;
	},
};

const callSigns = ['Red Two', 'Red Six', 'Red Five', 'Gold Leader'];

const outcomes = await AsyncSequenceCollection.from(callSigns)
	.selectAwait((callSign) => tryCatch(() => rebelArchive.load(callSign)), { concurrency: 8 })
	.toArray();

const [loaded, failed] = SequenceCollection.from(outcomes).partition((outcome) =>
	outcome.isSuccess(),
);

console.log(loaded.select((outcome) => outcome.value).toArray()); // ['Wedge Antilles', 'Luke Skywalker', 'Lando Calrissian']
console.log(failed.select((outcome) => (outcome.error as Error).message).toArray()); // ['Red Six is not on file']
```

## `Option`

Um valor que pode estar ausente, como um valor próprio em vez de `null`: ou
**algum** valor (`some`), ou **nenhum** (`none`).

```ts
const hyperdrive: Option<number> = some(0.5);
const noHyperdrive: Option<number> = none();
```

A maioria das options vem de um valor que pode ser `null` ou `undefined`, e
`optionOf` converte um no outro:

```ts
const ship: Option<Starship> = optionOf(registry.get(registryNumber));
```

Só `null` e `undefined` são ausentes. `0`, `''` e `false` são presentes — cada um
é um valor que alguém quis dizer.

O registro da autoridade portuária, onde uma nave que falta é um valor e uma
nave com tripulação zero não está faltando:

```ts
import { none, type Option, optionOf, some } from '@fulcro/functions';

interface Starship {
	name: string;
	crew: number;
}

const registry = new Map<string, Starship>([
	['YT-1300 492727ZED', { name: 'Millennium Falcon', crew: 2 }],
	['ST-70 Razor Crest', { name: 'Razor Crest', crew: 1 }],
	['B-wing derelict', { name: 'Derelict B-wing', crew: 0 }],
]);

const hyperdrive: Option<number> = some(0.5);
const noHyperdrive: Option<number> = none();

const falcon = optionOf(registry.get('YT-1300 492727ZED'));
const phantom = optionOf(registry.get('TIE/x1 Vader'));
const crewOfDerelict = optionOf(registry.get('B-wing derelict')?.crew);

console.log(hyperdrive.isSome(), noHyperdrive.isNone()); // true true
console.log(falcon.isSome()); // true
console.log(phantom.isNone()); // true
console.log(crewOfDerelict.isSome(), crewOfDerelict.value); // true 0 — zero é um valor que alguém quis dizer
```

### Trate um valor presente e um ausente com `handle`

```ts
const greeting = ship.handle({
	some: (found) => `Welcome aboard the ${found.name}`,
	none: () => 'No such ship docked here',
});
```

Como no `Result`, os dois ramos são obrigatórios e deixar um de fora não
compila. Só o ramo da variante em questão é executado.

### Ou estreite para o valor presente

```ts
if (ship.isSome()) {
	ship.value; // Starship, não Starship | null
}
```

O terminal de atracagem da Cidade das Nuvens, recebendo as chegadas pela
plataforma:

```ts
import { optionOf } from '@fulcro/functions';

interface Starship {
	name: string;
	captain: string;
}

const landingPads = new Map<string, Starship>([
	['Pad 7', { name: 'Millennium Falcon', captain: 'Han Solo' }],
	['Pad 9', { name: 'Slave I', captain: 'Boba Fett' }],
]);

const greet = (pad: string): string => {
	return optionOf(landingPads.get(pad)).handle({
		some: (found) => `Welcome to Cloud City, Captain ${found.captain} of the ${found.name}`,
		none: () => `${pad} is empty`,
	});
};

console.log(greet('Pad 7')); // 'Welcome to Cloud City, Captain Han Solo of the Millennium Falcon'
console.log(greet('Pad 3')); // 'Pad 3 is empty'

const onPadNine = optionOf(landingPads.get('Pad 9'));

if (onPadNine.isSome()) {
	console.log(onPadNine.value.captain); // 'Boba Fett' — um Starship aqui, não Starship | null
}
```

### `some(null)` não é `none()`

`some(null)` é um valor presente que por acaso é `null`, e tem exatamente os
mesmos dados que `none()`. Só a variante distingue os dois, então `isSome()` e
`isNone()` são a verificação — `value` não é. `some` guarda o que receber; ler
`null` como ausente é trabalho do `optionOf`.

## `equals`

Diz se dois valores guardam a mesma coisa — dois objetos com as mesmas chaves e
valores iguais, dois arrays com elementos iguais —, onde `===` só diz se são o
mesmo objeto.

```ts
equals(
	{ system: 'Hoth', waypoints: ['Ord Mantell'] },
	{ system: 'Hoth', waypoints: ['Ord Mantell'] },
); // true
equals(['Hoth', 'Bespin', 'Endor'], ['Hoth', 'Endor', 'Bespin']); // false
```

`right` recebe o tipo de `left`, então dois valores que nunca poderiam ser
iguais não compilam: `equals(1, 'one')` é recusado.

Dois droides astromecânicos calculando o mesmo plano de voo de forma
independente, e o navegador conferindo que eles concordam antes do salto:

```ts
import { equals } from '@fulcro/functions';

interface FlightPlan {
	destination: string;
	waypoints: string[];
	jumpAt: Date;
}

const fromR2D2: FlightPlan = {
	destination: 'Dagobah',
	waypoints: ['Hoth', 'Anoat'],
	jumpAt: new Date(0),
};

const fromChopper: FlightPlan = {
	jumpAt: new Date(0),
	waypoints: ['Hoth', 'Anoat'],
	destination: 'Dagobah',
};

console.log(fromR2D2 === fromChopper); // false — dois objetos
console.log(equals(fromR2D2, fromChopper)); // true — o mesmo plano, chaves em qualquer ordem
console.log(equals(fromR2D2, { ...fromChopper, waypoints: ['Anoat', 'Hoth'] })); // false — num array, a ordem importa
console.log(equals(Number.NaN, Number.NaN)); // true — um valor é sempre igual a si mesmo
```

### O que é comparado pelo conteúdo, e o que pela identidade

Um valor é sempre igual a si mesmo. Dois valores distintos são comparados pelo
que guardam quando são de um tipo definido pelo conteúdo, e são diferentes caso
contrário:

| Valores                                                                       | Iguais quando                                                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Primitivos                                                                    | São o mesmo valor; `NaN` é igual a `NaN`, `0` é igual a `-0`                     |
| Objetos de protótipos diferentes                                              | Nunca                                                                            |
| Objetos comuns, com ou sem protótipo                                          | Têm as mesmas chaves próprias enumeráveis, em qualquer ordem, com valores iguais |
| Arrays                                                                        | Têm o mesmo tamanho e elementos iguais; um buraco é lido como `undefined`        |
| `Result` e `Option`                                                           | São a mesma variante, com campos iguais                                          |
| `Date`                                                                        | Guardam o mesmo instante                                                         |
| `Map`                                                                         | Guardam as mesmas chaves, com valores iguais                                     |
| `Set`                                                                         | Guardam os mesmos elementos                                                      |
| `ArrayBuffer`, `DataView`                                                     | Seus bytes são iguais                                                            |
| Typed arrays                                                                  | São do mesmo tipo, com elementos iguais                                          |
| Todo o resto: uma instância de classe, um `Error`, um `RegExp`, uma `Promise` | Nunca — é definido por qual objeto é                                             |

Primitivos são comparados como um `Set` os encontra, então `equals` sempre diz
que um valor é igual a si mesmo — `NaN` incluído. É uma pergunta diferente da
que o `NumericType.equals` de `@fulcro/types` responde, em que `NaN` não é igual
a nada: aquela é aritmética, e esta é o que uma chave, um cache ou uma lista sem
repetidos precisam.

`some(null)` e `none()` guardam exatamente os mesmos dados, e não são iguais: a
variante é comparada antes dos campos. Um `failure` com um `Error` só é igual a
outro quando os dois guardam o mesmo erro, já que um erro é uma instância de
classe.

**Uma instância de classe só é igual a si mesma.** Uma classe pode guardar seu
estado onde nenhuma comparação consegue ler — `Decimal` guarda os dígitos em
campos privados —, então comparar as chaves próprias não encontraria nenhuma e
diria que quaisquer duas instâncias são iguais. Para comparar uma pelo que ela
guarda, dê a ela uma regra; veja abaixo.

**Uma chave de `Map` e um elemento de `Set` são encontrados pela identidade**,
como o map e o set os encontram, nunca pelo conteúdo. É isso que mantém linear
a comparação de dois maps: casar cada chave com todas as outras custaria uma
comparação por par.

Duas estruturas que se referem a si mesmas — um anel, uma árvore cujo nó guarda
o pai — são iguais quando nada mais nelas difere, e são comparadas dando uma
volta só.

### Valores de `@fulcro/types`

Uma struct, uma matriz, uma fração, um número complexo: cada um é um tipo de
valor, e `equals` o lê como o objeto ou array comum que ele é. Isso está certo para
muitos e não para todos — uma matriz de duas linhas e três colunas guarda os
mesmos seis elementos que uma de três linhas e duas, e a forma dela não é uma de
suas chaves. O descritor conhece o tipo; passe-o ao
[`createEquals`](#suas-próprias-regras-createequals) como regra:

```ts
const sameShape = createEquals([Formation, Column]); // Matrix(DoublePrecisionFloat, 2, 3) e (…, 3, 2)

equals<unknown>(formation, column); // true: os mesmos seis números
sameShape<unknown>(formation, column); // false: cada uma é reconhecida pelo próprio descritor
```

As duas matrizes são de tipos diferentes, que `equals` se recusa a comparar a
menos que a chamada diga em que tipo é feita — aqui, `unknown`.

Uma struct passada como regra nunca é igual a um objeto comum que só tem os
mesmos campos, e cada campo dela é comparado como o próprio tipo compara.

Duas leituras da força dos escudos dos mesmos seis caças — uma organizada como a
formação de ataque, outra como a coluna em que voaram:

```ts
import { createEquals, equals } from '@fulcro/functions';
import { DoublePrecisionFloat, Matrix } from '@fulcro/types';

// As linhas são as alas, as colunas os caças de cada ala.
const Formation = Matrix(DoublePrecisionFloat, 2, 3);
const Column = Matrix(DoublePrecisionFloat, 3, 2);

const attackFormation = Formation.from([
	[100, 80, 65],
	[90, 70, 55],
]);

const inColumn = Column.from([
	[100, 80],
	[65, 90],
	[70, 55],
]);

const sameShape = createEquals([Formation, Column]);

// De tipos diferentes, então cada comparação é feita em `unknown`.
console.log(equals<unknown>(attackFormation, inColumn)); // true — as mesmas seis leituras, lidas como arrays
console.log(sameShape<unknown>(attackFormation, inColumn)); // false — uma formação não é uma coluna
```

### Suas próprias regras: `createEquals`

`createEquals` cria uma variante de `equals` que compara alguns tipos de valor
por regras suas. Uma regra reconhece seus valores com `is` e compara dois deles
com `equals`:

```ts
const byCallSign: EqualityRule<Pilot> = {
	is: (value): value is Pilot => value instanceof Pilot,
	equals: (left, right) => left.callSign === right.callSign,
};

const sameRoster = createEquals([byCallSign]);

sameRoster([wedge], [wedgeAfterPromotion]); // true: os arrays como `equals` compara, os pilotos pelo indicativo
```

Duas escalas do Esquadrão Vermelho, uma feita antes da promoção do Wedge e outra
depois — os mesmos pilotos, pelo indicativo:

```ts
import { createEquals, type EqualityRule, equals } from '@fulcro/functions';

class Pilot {
	constructor(
		readonly callSign: string,
		readonly rank: string,
	) {}
}

const byCallSign: EqualityRule<Pilot> = {
	is: (value): value is Pilot => value instanceof Pilot,
	equals: (left, right) => left.callSign === right.callSign,
};

const sameRoster = createEquals([byCallSign]);

const beforeHoth = [new Pilot('Red Two', 'Lieutenant'), new Pilot('Red Five', 'Commander')];
const afterHoth = [new Pilot('Red Two', 'Commander'), new Pilot('Red Five', 'Commander')];

console.log(equals(beforeHoth, afterHoth)); // false — instâncias de classe só são iguais a si mesmas
console.log(sameRoster(beforeHoth, afterHoth)); // true — os mesmos indicativos, na mesma ordem
```

O descritor de cada tipo de `@fulcro/types` já é uma regra, já que cada um tem
`is` e `equals`. `Decimal` compara pelos seus valores, então a regra dele é
escrita por extenso:

```ts
const byValue: EqualityRule<Decimal> = {
	is: Decimal.is,
	equals: (left, right) => left.equals(right),
};
```

Dois livros-caixa dos mesmos pagamentos de recompensa, um escrito com zeros à
direita:

```ts
import { createEquals, type EqualityRule, equals } from '@fulcro/functions';
import { Decimal } from '@fulcro/types';

const byValue: EqualityRule<Decimal> = {
	is: Decimal.is,
	equals: (left, right) => left.equals(right),
};

const sameLedger = createEquals([byValue]);

const guildLedger = [Decimal.from('50000.00'), Decimal.from('15000.50')];
const huttLedger = [Decimal.from('50000'), Decimal.from('15000.5')];

console.log(equals(guildLedger, huttLedger)); // false — cada Decimal é uma instância distinta
console.log(sameLedger(guildLedger, huttLedger)); // true — os mesmos valores
```

Dois valores são comparados nesta ordem:

1. Um valor é sempre igual a si mesmo, diga o que disser uma regra.
2. A primeira regra que reconhece qualquer um dos dois decide: com o `equals`
   dela quando reconhece os dois, e como diferentes quando reconhece só um. As
   regras depois dela não são consultadas.
3. Caso contrário, como `equals` os compara.

Assim, uma regra também pode assumir um tipo que `equals` já compara — datas
pelo dia, strings sem diferenciar maiúsculas.

Uma regra cujos valores guardam outros compara esses com o terceiro argumento, a
variante a que ela pertence. Ele acompanha o que já está sendo comparado, então
uma estrutura que se refere a si mesma continua sendo comparada dando uma volta
só:

```ts
const byName: EqualityRule<Lineage> = {
	is: (value): value is Lineage => value instanceof Lineage,
	equals: (left, right, nested) => {
		return left.name === right.name && nested(left.apprentices, right.apprentices);
	},
};
```

A linhagem Jedi como dois arquivos a registraram — os mesmos mestres e
aprendizes, um dos arquivos anotando as patentes que tinham na época:

```ts
import { createEquals, type EqualityRule } from '@fulcro/functions';

class Lineage {
	constructor(
		readonly name: string,
		readonly rank: string,
		readonly apprentices: Lineage[],
	) {}
}

const byName: EqualityRule<Lineage> = {
	is: (value): value is Lineage => value instanceof Lineage,
	equals: (left, right, nested) => {
		return left.name === right.name && nested(left.apprentices, right.apprentices);
	},
};

const sameLineage = createEquals([byName]);

const templeArchive = new Lineage('Qui-Gon Jinn', 'Master', [
	new Lineage('Obi-Wan Kenobi', 'Master', [new Lineage('Anakin Skywalker', 'Knight', [])]),
]);

const holocronOfIlum = new Lineage('Qui-Gon Jinn', 'Master', [
	new Lineage('Obi-Wan Kenobi', 'Padawan', [new Lineage('Anakin Skywalker', 'Padawan', [])]),
]);

console.log(sameLineage(templeArchive, holocronOfIlum)); // true — os mesmos nomes, até o fim
```

As regras e seus membros são lidos uma vez, quando a variante é criada: mudar a
lista depois não muda nada. Uma regra pode ser uma instância de classe; seus
membros são chamados sobre ela. Uma regra que lança faz a comparação lançar.

`createEquals` recusa o que não é um array de regras
([`FULCRO2002`](./errors/FULCRO2xxx.md#fulcro2002)), e uma regra cujo `is` ou
`equals` não é uma função ([`FULCRO2003`](./errors/FULCRO2xxx.md#fulcro2003)).

### Quanto custa uma comparação

Cada valor é lido uma vez de cada lado, e a comparação para na primeira
diferença: dois arrays de cem mil elementos que diferem no décimo primeiro são
lidos até o décimo primeiro elemento. Nada de um valor comparado consigo mesmo é
lido. Um map ou um set é comparado com uma busca por entrada. Uma regra é
consultada sobre um par no máximo uma vez por valor, e as regras depois da que o
reconheceu não são consultadas.

## Quanto custa um valor

Um `Result` ou um `Option` é um único objeto congelado, que carrega seus dados e
nada mais — `value` e `error`, ou só `value`. Os métodos são herdados de um
protótipo compartilhado por cada variante, então não custam nada por valor e
ficam fora de um spread, de um `for…in` e de uma igualdade profunda. `none()`
devolve sempre o mesmo objeto, então a ausência não aloca nada.

## Referência

|                                       |                                                                    |
| ------------------------------------- | ------------------------------------------------------------------ |
| `switchFor(value, cases)`             | Exaustiva. Um ramo por membro, sem fallback.                       |
| `switchFor(value, cases, otherwise)`  | Forma por predicado, retornando `R`.                               |
| `switchFor(value, cases)`             | Forma por predicado sem fallback, retornando `R \| undefined`.     |
| `success(value)`                      | Um `Result` que teve sucesso.                                      |
| `failure(error)`                      | Um `Result` que falhou. `error` nunca é nulo.                      |
| `result.handle({ success, failure })` | Executa o ramo da variante. Os dois são obrigatórios.              |
| `result.isSuccess()`, `isFailure()`   | Estreitam o resultado.                                             |
| `tryCatch(callback)`                  | Captura falhas síncronas e assíncronas.                            |
| `tryCatch(promise)`                   | Captura só a rejeição.                                             |
| `some(value)`                         | Um `Option` com um valor, seja ele qual for.                       |
| `none()`                              | O `Option` ausente. Sempre o mesmo objeto.                         |
| `optionOf(value)`                     | `none()` para `null` ou `undefined`, `some(value)` caso contrário. |
| `option.handle({ some, none })`       | Executa o ramo da variante. Os dois são obrigatórios.              |
| `option.isSome()`, `isNone()`         | Estreitam o option.                                                |
| `equals(left, right)`                 | Compara pelo conteúdo; qualquer outro objeto pela identidade.      |
| `createEquals(rules)`                 | Uma variante de `equals` que consulta as regras antes.             |

Tipos: `SwitchCase`, `ExhaustiveCases`, `Result`, `Success`, `Failure`,
`ResultCases`, `Option`, `Some`, `None`, `OptionCases`, `Equals`,
`EqualityRule`.
