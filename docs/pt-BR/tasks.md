# Tasks estruturadas

🇺🇸 English: [Read this documentation in English](../tasks.md)

Tasks que começam juntas, terminam juntas e podem ser canceladas — para trabalho
que passa o tempo **esperando**: requisições, consultas, arquivos.

```sh
npm install @fulcro/parallel
```

```ts
import { createCancellationSource, createTaskScope } from '@fulcro/parallel';
```

## É esta a ferramenta que você quer?

| O seu trabalho                                            | Use                                                       |
| --------------------------------------------------------- | --------------------------------------------------------- |
| Uma sequência de elementos, cada um esperando por algo    | [`selectAwait`](./concurrency.md) — concorrência limitada |
| Vários trabalhos diferentes que esperam, como uma unidade | Este                                                      |
| Gastando CPU: parsing, hashing, redimensionar             | [Um pool de workers](./parallelism.md)                    |

Uma task roda na thread que a criou. A espera se sobrepõe — dez requisições em
andamento levam mais ou menos o tempo da mais lenta —, mas o cálculo não: cem
tasks calculando o hash de um buffer levam o mesmo que uma task calculando os
cem. Para isso o trabalho precisa chegar a outros núcleos, e só um pool de
workers faz isso.

## Um escopo

```ts
await using scope = createTaskScope();

const fleet = scope.spawn((token) => loadFleetPositions(token.signal));
const roster = scope.spawn((token) => loadSquadronRoster(token.signal));

await scope.join();

brief(await fleet, await roster);
```

`spawn` inicia o trabalho e devolve uma `Task`, que você aguarda para obter o
valor. `join` espera todas as tasks do escopo — inclusive as que uma task criou
enquanto ele esperava — e então fecha o escopo: um `spawn` depois disso lança
[`FULCRO3011`](./errors/FULCRO3xxx.md#fulcro3011).

O trabalho nunca começa durante o próprio `spawn`; começa uma microtask depois.
Isso deixa espaço para cancelar uma task logo depois de criá-la, e ela nunca
chega a rodar.

**Nenhuma task sobrevive ao seu escopo.** Declarado com `await using`, o escopo
espera todas as tasks quando o bloco termina, seja qual for a saída. As tasks
ainda rodando nesse momento são canceladas antes — sair do bloco sem `join`
significa que ninguém quer os resultados delas.

O briefing a bordo da Home One antes de Endor, montado a partir de duas
requisições à HoloNet que esperam juntas:

```ts
import { createTaskScope } from '@fulcro/parallel';

// Uma requisição à HoloNet que responde depois de um atraso, e para se for cancelada.
const holoNet = <T>(answer: T, milliseconds: number, signal: AbortSignal): Promise<T> => {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => resolve(answer), milliseconds);

		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(signal.reason);
			},
			{ once: true },
		);
	});
};

const loadFleetPositions = (signal: AbortSignal): Promise<string[]> => {
	return holoNet(['Home One', 'Liberty', 'Millennium Falcon'], 30, signal);
};

const loadSquadronRoster = (signal: AbortSignal): Promise<string[]> => {
	return holoNet(['Gold Leader', 'Red Leader', 'Green Leader'], 20, signal);
};

await using scope = createTaskScope();

const fleet = scope.spawn((token) => loadFleetPositions(token.signal));
const roster = scope.spawn((token) => loadSquadronRoster(token.signal));

await scope.join();

console.log(`${String((await fleet).length)} ships, led by ${(await roster).join(', ')}`);
// '3 ships, led by Gold Leader, Red Leader, Green Leader'

try {
	scope.spawn(() => 'a late arrival');
} catch (error) {
	console.log((error as Error).message.startsWith('FULCRO3011')); // true — um escopo que passou pelo join está fechado
}
```

## Quantas rodam ao mesmo tempo

```ts
await using scope = createTaskScope({ concurrency: 8 });

for (const outpost of outposts) {
	scope.spawn((token) => pollOutpost(outpost, token.signal));
}

await scope.join();
```

Com um limite, uma task criada além dele espera que outra termine, sem começar
e na ordem em que foi criada. Uma task em espera não começou nada: guarda só o
necessário para começar, ou para ser cancelada — nenhuma requisição, nenhuma
resposta —, então dez mil requisições podem ser criadas de uma vez enquanto só oito
ficam em andamento — que é o que o servidor do outro lado, e a memória das
respostas, costumam precisar.

**A fila de espera não tem limite próprio:** guarda toda task que você cria além
do limite, porque o trabalho que essas tasks expressam já está nas suas mãos.
Cada task em espera custa um `AbortController`, um listener no signal do escopo
e algumas promessas — pouco, mas não de graça, então criar um milhão é guardar
um milhão. Para limitar, crie em lotes e chame `join` entre eles. O que é
liberado é liberado na hora: uma task que começou, ou que foi cancelada enquanto
esperava, não fica presa na fila depois disso, por mais que o escopo viva.

O limite é uma promessa sobre um número, e a suíte o confirma contando: o
trabalho registra quantas tasks estão dentro dele ao mesmo tempo, e o pico é
exatamente o limite — nunca mais, e nem menos.

Sem `concurrency` não há limite. Um limite que não seja um inteiro positivo nem
`Infinity` lança [`FULCRO3012`](./errors/FULCRO3xxx.md#fulcro3012).

A rede de comunicações imperial consultando doze postos avançados, nunca mais
de três de cada vez — e contando para provar:

```ts
import { createTaskScope } from '@fulcro/parallel';

const outposts = [
	'Hoth',
	'Scarif',
	'Jedha',
	'Lothal',
	'Kashyyyk',
	'Mustafar',
	'Eadu',
	'Coruscant',
	'Mimban',
	'Corellia',
	'Bespin',
	'Tatooine',
];

let inFlight = 0;
let peak = 0;
const reports: string[] = [];

const pollOutpost = async (outpost: string, signal: AbortSignal): Promise<void> => {
	inFlight++;
	peak = Math.max(peak, inFlight);

	await new Promise((resolve) => setTimeout(resolve, 10));

	signal.throwIfAborted();
	reports.push(`${outpost}: all clear`);
	inFlight--;
};

await using scope = createTaskScope({ concurrency: 3 });

for (const outpost of outposts) {
	scope.spawn((token) => pollOutpost(outpost, token.signal));
}

await scope.join();

console.log(reports.length); // 12
console.log(peak); // 3 — exatamente o limite
```

## Cancelando trabalho

Um cancelamento tem dois lados. A **source** cancela o trabalho e fica com quem
o iniciou; o **token** diz se o trabalho foi cancelado, e é o que o trabalho
recebe.

```ts
const source = createCancellationSource();

abortMissionButton.onclick = () => source.cancel();

await using scope = createTaskScope({ token: source.token });
```

O trabalho de cada task recebe um token. Ele responde a três perguntas:

```ts
scope.spawn(async (token) => {
	// Para o que aceita um signal — fetch, timers, streams, um pool de workers.
	const response = await fetch(deathStarPlansUrl, { signal: token.signal });

	for (const schematic of await response.json()) {
		// Para um laço que nunca faz await, entre um passo e outro.
		token.throwIfCancelled();
		analyse(schematic);
	}
});
```

```ts
using registration = token.onCancelled((reason) => comlink.close());
```

`token.signal` é um `AbortSignal` comum, o mesmo estado que o token lê, então as
APIs da própria plataforma o aceitam sem adaptação. Um handler registrado depois
do cancelamento roda na hora, então registrar tarde nunca o perde. Descarte o
registro quando o trabalho não precisar mais dele: senão um token de vida longa
guarda todo handler já registrado nele.

`cancel(reason)` informa `reason`; `cancel()` informa um `DOMException`
`AbortError`, como faz um signal abortado. Só a primeira chamada conta.

Os Rebeldes analisando os planos da Estrela da Morte a bordo da Tantive IV
quando o Destróier Estelar de Vader os alcança — a source pertence à ponte de
comando, e cada task ouve a ordem pelo seu token, de cada um dos três jeitos:

```ts
import { createCancellationSource, createTaskScope } from '@fulcro/parallel';

const bridge = createCancellationSource();
const log: string[] = [];

const comlink = {
	open: true,
	close(): void {
		this.open = false;
	},
};

// A nave de Vader se aproxima um pouco depois de a análise começar.
setTimeout(() => bridge.cancel(new Error('Boarded by the Devastator')), 25);

const schematics = Array.from({ length: 1_000_000 }, (_, index) => `section ${String(index)}`);

try {
	await using scope = createTaskScope({ token: bridge.token });

	// 1. Um signal, para tudo o que aceita um.
	scope.spawn(async (token) => {
		await new Promise((resolve, reject) => {
			const relay = setTimeout(resolve, 1_000);

			token.signal.addEventListener(
				'abort',
				() => {
					clearTimeout(relay);
					reject(token.signal.reason);
				},
				{ once: true },
			);
		});

		log.push('plans relayed to Yavin');
	});

	// 2. Entre os passos de um laço que não faz await.
	scope.spawn(async (token) => {
		await new Promise((resolve) => setTimeout(resolve, 40));

		for (const schematic of schematics) {
			token.throwIfCancelled();
			log.push(`analysed ${schematic}`);
		}
	});

	// 3. Um handler, para um recurso que precisa ser liberado.
	scope.spawn((token) => {
		using registration = token.onCancelled(() => comlink.close());

		return new Promise((resolve) => setTimeout(resolve, 1_000));
	});

	await scope.join();
} catch (reason) {
	console.log((reason as Error).message); // 'Boarded by the Devastator'
}

console.log(log.length); // 0 — nada foi retransmitido, e nenhuma seção analisada depois da ordem
console.log(comlink.open); // false — o comlink foi fechado pelo handler
console.log(bridge.token.isCancelled); // true
```

### Seguindo um pai

```ts
using child = createCancellationSource(parentToken);
```

Uma source criada sob um token pai é cancelada quando o pai é, com o motivo do
pai — e já nasce cancelada se o pai já estiver. Descartar a filha faz ela parar
de seguir: senão um pai que vive o processo inteiro guardaria toda filha criada
sob ele. Um escopo criado com `token` o segue do mesmo jeito, e o solta assim
que o escopo passa pelo `join` ou é descartado.

O alto comando da Aliança Rebelde e a missão de um único esquadrão: cancelar a
operação inteira alcança o esquadrão, e um esquadrão que já pousou não escuta
mais:

```ts
import { createCancellationSource } from '@fulcro/parallel';

const highCommand = createCancellationSource();

const goldSquadron = createCancellationSource(highCommand.token);
const roguesHome = createCancellationSource(highCommand.token);

roguesHome[Symbol.dispose](); // o Esquadrão Rogue pousou: para de seguir o alto comando

highCommand.cancel(new Error('The shield is still up — pull up!'));

console.log(goldSquadron.token.isCancelled); // true
console.log((goldSquadron.token.reason as Error).message); // 'The shield is still up — pull up!'
console.log(roguesHome.token.isCancelled); // false

const lateSquadron = createCancellationSource(highCommand.token);

console.log(lateSquadron.token.isCancelled); // true — nascida sob um pai que já foi cancelado
```

## Falhas

**A primeira task que falha cancela todas as outras.** As que estão rodando são
avisadas pelos seus tokens, com essa falha como motivo, e as que esperam nunca
começam. `join` rejeita com essa falha — a primeira, e não o que as tasks
canceladas lançaram ao responder ao cancelamento.

```ts
await using scope = createTaskScope();

scope.spawn(() => holdTheTrench());
scope.spawn(() => targetTheExhaustPort());

await scope.join(); // rejeita com a primeira falha
```

A corrida pela trincheira, em que a falha de uma nave cancela a escolta que
ainda voa:

```ts
import { createTaskScope } from '@fulcro/parallel';

let escortReason: unknown;

const holdTheTrench = (signal: AbortSignal): Promise<void> => {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, 1_000);

		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				escortReason = signal.reason;
				reject(new Error('Escort breaks off'));
			},
			{ once: true },
		);
	});
};

const targetTheExhaustPort = async (): Promise<void> => {
	await new Promise((resolve) => setTimeout(resolve, 10));

	throw new Error('Gold Leader: the torpedoes impacted on the surface');
};

try {
	await using scope = createTaskScope();

	scope.spawn((token) => holdTheTrench(token.signal));
	scope.spawn(() => targetTheExhaustPort());

	await scope.join();
} catch (failure) {
	console.log((failure as Error).message); // 'Gold Leader: the torpedoes impacted on the surface' — a primeira falha
}

console.log((escortReason as Error).message); // 'Gold Leader: the torpedoes impacted on the surface' — a escolta soube por quê
```

Uma task cancelada **sozinha** não é uma falha:

```ts
const preview = scope.spawn((token) => loadHologramPreview(token.signal));

preview.cancel(); // o escopo e as outras tasks seguem
```

Uma task em espera que é cancelada nunca começa e cede o seu lugar na hora; uma
que está rodando é avisada pelo seu token, e a rejeição dela depois disso conta
como cancelamento. Um escopo cancelado com `scope.cancel(reason)`, ou pelo seu
token pai, faz `join` rejeitar com esse motivo.

Uma holomesa que descarta uma prévia lenta sem abandonar o briefing:

```ts
import { createTaskScope } from '@fulcro/parallel';

const holoNet = <T>(answer: T, milliseconds: number, signal: AbortSignal): Promise<T> => {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => resolve(answer), milliseconds);

		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(signal.reason);
			},
			{ once: true },
		);
	});
};

await using scope = createTaskScope();

const briefing = scope.spawn((token) =>
	holoNet('Attack the shield generator on Endor', 20, token.signal),
);
const preview = scope.spawn((token) =>
	holoNet('Rotating hologram of the second Death Star', 1_000, token.signal),
);

preview.cancel();

await scope.join(); // não rejeita: uma task cancelada sozinha não é uma falha

console.log(await briefing); // 'Attack the shield generator on Endor'
console.log((await preview.settled).isFailure()); // true — guarda o motivo pelo qual foi cancelada
```

### Lendo um resultado como valor

```ts
const outcome = await task.settled;

outcome.handle({
	success: (value) => display(value),
	failure: (error) => displayError(error),
});
```

`settled` nunca rejeita: é um [`Result`](./functions.md) com o valor, ou com o
que o trabalho lançou, ou com o motivo pelo qual foi cancelado.

Duas varreduras de sensores na lua florestal, cada uma lida como valor — uma
achou o bunker, a outra deu de cara com os Ewoks:

```ts
import { createTaskScope } from '@fulcro/parallel';

const scope = createTaskScope();

const bunker = scope.spawn(async () => 'Back door of the shield bunker, guarded');

const ridge = scope.spawn(async () => {
	throw new Error('Sensor post taken by Ewoks');
});

const display = (task: typeof bunker): Promise<string> => {
	return task.settled.then((outcome) => {
		return outcome.handle({
			success: (value) => `Found: ${value}`,
			failure: (error) => `Lost: ${(error as Error).message}`,
		});
	});
};

console.log(await display(bunker)); // 'Found: Back door of the shield bunker, guarded'
console.log(await display(ridge)); // 'Lost: Sensor post taken by Ewoks'

await scope.join().catch(() => undefined); // a falha da varredura também cabe ao escopo informar
```

### Nada falha em silêncio

Uma task que ninguém aguarda não vira uma rejeição não tratada — no Node, isso
encerraria o processo. A falha dela fica guardada no escopo e é informada por
`join` ou, se ninguém chamou `join`, lançada quando um escopo `await using`
termina. Uma falha que `join` já informou não é lançada uma segunda vez.

Um trabalho que rejeita com `null` ou `undefined` falha com
[`FULCRO3013`](./errors/FULCRO3xxx.md#fulcro3013) no lugar, o mesmo objeto de
erro onde quer que seja informado — pela task, por `settled`, por `join`, às
irmãs como motivo, e pelo descarte. Uma falha nula não se distingue de falha
nenhuma, então não é repassada como tal.

Uma task que ninguém aguardou, cuja falha aparece quando o bloco termina:

```ts
import { createTaskScope } from '@fulcro/parallel';

try {
	await using scope = createTaskScope();

	scope.spawn(async () => {
		throw new Error('The reactor core of the second Death Star is unstable');
	});

	// A tripulação segue com outra coisa enquanto a task roda e falha;
	// ninguém aguarda a task, e ninguém chama join.
	await new Promise((resolve) => setTimeout(resolve, 10));
} catch (failure) {
	console.log((failure as Error).message); // 'The reactor core of the second Death Star is unstable'
}
```

## Os tipos

Todo nome que uma assinatura precisa é exportado como tipo, para anotar o seu
próprio código:

| Tipo                 | O que é                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `TaskScope`          | O que `createTaskScope` devolve                                       |
| `TaskScopeOptions`   | As opções dele: `concurrency` e `token`                               |
| `Task<T>`            | O que `spawn` devolve                                                 |
| `TaskWork<T>`        | O que `spawn` recebe: uma função do token, que dá `T` ou uma promessa |
| `CancellationSource` | O que `createCancellationSource` devolve                              |
| `CancellationToken`  | O que o trabalho recebe, e o que uma source ou um escopo segue        |

```ts
import type { CancellationToken } from '@fulcro/parallel';

const loadPilotName = async (callSign: string, token: CancellationToken): Promise<string> => {
	const response = await fetch(`https://archives.rebellion.example/pilots/${callSign}`, {
		signal: token.signal,
	});

	return response.text();
};
```

Um serviço de esquadrões escrito sobre os tipos, para que qualquer escopo ou
qualquer token possa ser entregue a ele:

```ts
import { createTaskScope } from '@fulcro/parallel';
import type { CancellationToken, Task, TaskScope, TaskWork } from '@fulcro/parallel';

const pilots = new Map([
	['Red Two', 'Wedge Antilles'],
	['Red Five', 'Luke Skywalker'],
]);

const loadPilotName = async (callSign: string, token: CancellationToken): Promise<string> => {
	await new Promise((resolve) => setTimeout(resolve, 5));
	token.throwIfCancelled();

	return pilots.get(callSign) ?? 'unknown pilot';
};

const nameOf =
	(callSign: string): TaskWork<string> =>
	(token) =>
		loadPilotName(callSign, token);

const loadRoster = (scope: TaskScope, callSigns: readonly string[]): Task<string>[] => {
	return callSigns.map((callSign) => scope.spawn(nameOf(callSign)));
};

await using scope = createTaskScope({ concurrency: 2 });

const roster = loadRoster(scope, ['Red Two', 'Red Five']);

await scope.join();

console.log(await Promise.all(roster)); // ['Wedge Antilles', 'Luke Skywalker']
```

## Trabalho de CPU dentro de uma task

Uma task que precisa de cálculo de verdade o entrega a um
[pool de workers](./parallelism.md) e passa o seu signal para o pool, para que
cancelar a task pare os workers também:

```ts
import { createTaskScope, createWorkerPool } from '@fulcro/parallel';

await using pool = createWorkerPool<Transmission, string>({
	module: new URL('./decrypt-task.mjs', import.meta.url),
	export: 'decryptTransmission',
});

await using scope = createTaskScope();

const decrypted = scope.spawn(async (token) => {
	const transmissions = await interceptTransmissions(token.signal);

	return pool.map(transmissions, { signal: token.signal });
});

await scope.join();
```

A task espera; o pool calcula. Cada um faz a única coisa para a qual existe.

A interceptação e a decifração como uma task só — esperando pelo posto de
escuta, depois calculando nos workers —, com o módulo de tarefa do
[guia de paralelismo](./parallelism.md#o-trabalho-é-nomeado-não-capturado):

```js
// decrypt-task.mjs
export const decryptTransmission = ({ from, cipher }) => {
	let key = 0;

	for (let round = 0; round < 2_000_000; round++) key = (key * 31 + round) % 1_000_003;

	return `${from}: ${[...cipher].reverse().join('')} (key ${key})`;
};
```

```ts
import { createTaskScope, createWorkerPool } from '@fulcro/parallel';

interface Transmission {
	from: string;
	cipher: string;
}

const interceptTransmissions = async (signal: AbortSignal): Promise<Transmission[]> => {
	await new Promise((resolve) => setTimeout(resolve, 10));
	signal.throwIfAborted();

	return [
		{ from: 'Scarif', cipher: 'trop tsuahxe' },
		{ from: 'Eadu', cipher: 'osrE nelaG' },
	];
};

await using pool = createWorkerPool<Transmission, string>({
	module: new URL('./decrypt-task.mjs', import.meta.url),
	export: 'decryptTransmission',
	workers: 2,
});

await using scope = createTaskScope();

const decrypted = scope.spawn(async (token) => {
	const transmissions = await interceptTransmissions(token.signal);

	return pool.map(transmissions, { signal: token.signal });
});

await scope.join();

console.log(await decrypted); // ['Scarif: exhaust port (key 235197)', 'Eadu: Galen Erso (key 235197)']
```
