# Reflexão

🇺🇸 English: [Read this documentation in English](../reflect.md)

Treze utilitários que respondem a perguntas que o TypeScript apaga no caminho
para o JavaScript: qual era um nome, o que um tipo diz, qual é um valor vazio
válido, quanta memória um tipo declara e onde ficam os seus campos, e se aquilo
que está na sua frente é mesmo o que diz ser — e um que responde a uma pergunta
enquanto o programa compila, para não custar nada quando ele roda.

```sh
npm install @fulcro/reflect
```

```ts
import {
	alignOf,
	as,
	constantOf,
	defaultOf,
	is,
	keysOf,
	layoutOf,
	nameOf,
	offsetOf,
	pathOf,
	pathsOf,
	sizeOf,
	typeOf,
} from '@fulcro/reflect';
```

Um pacote só: o transformer de tempo de compilação vem dentro dele, como
`@fulcro/reflect/transformer`. Ele não é opcional —
[veja abaixo](#o-transformer-não-é-opcional) — mas não há mais nada a instalar,
e não tem como acabar com só metade dele.

## O problema

Os tipos do TypeScript não existem em runtime. Interfaces, aliases de tipo,
argumentos genéricos e o arquivo em que um tipo foi declarado somem quando o
compilador emite o JavaScript:

```ts
interface RebelPilot {
	callSign: string;
}

// Em runtime não existe `RebelPilot`. Não há a quem perguntar.
```

Então uma função comum só consegue dizer o que vê no _valor_ que está na sua
frente. Estes utilitários vão além, fazendo o trabalho **enquanto o compilador
ainda está rodando**.

A ficha de um piloto chegando dos arquivos da Aliança: o valor conhece os seus
campos, e nada em runtime se lembra do tipo — a não ser o que o transformer
anotou enquanto ainda podia:

```ts
import { nameOf } from '@fulcro/reflect';

interface RebelPilot {
	callSign: string;
	homeworld: string;
}

const pilot: RebelPilot = JSON.parse('{ "callSign": "Red Five", "homeworld": "Tatooine" }');

console.log(typeof pilot); // 'object' — tudo o que a linguagem consegue dizer
console.log(nameOf<RebelPilot>()); // 'RebelPilot' — lido ao compilar, emitido como literal
```

## `nameOf` — o nome como foi escrito

```ts
const callSign = 'Red Five';

nameOf(() => callSign); // 'callSign'
nameOf(() => pilot.starfighter.astromech); // 'astromech'    (último segmento)
nameOf(() => pilot['callSign']); // 'callSign'
nameOf(() => pilot.eject); // 'eject'     (nunca o chama)
nameOf<PilotRecord>(); // 'PilotRecord'
nameOf(Starfighter); // 'Starfighter'
```

O acessor **nunca é invocado**, então é seguro num getter com efeitos
colaterais e não custa nada avaliar.

### Onde você usa `nameOf` de verdade

Em todo lugar em que uma string tem de bater com o nome de uma propriedade, e um
erro de digitação passaria em silêncio:

```ts
// Ordenar por um nome de coluna que uma renomeação quebraria de forma visível.
const column = nameOf(() => pilot.confirmedKills);

// Um campo de formulário ligado a uma propriedade do modelo.
register(nameOf(() => application.homeworld));

// Uma mensagem de validação que acompanha uma renomeação.
throw new Error(`${nameOf(() => manifest.cargoWeight)} is required`);
```

Renomeie `confirmedKills` no editor e a string acompanha. Escreva
`'confirmedKills'` à mão e ela não acompanha.

O registro de pilotos da Aliança — uma coluna de ordenação, um campo de
formulário e uma mensagem de validação, todos nomes que o compilador conferiu:

```ts
import { nameOf } from '@fulcro/reflect';

interface PilotApplication {
	callSign: string;
	homeworld: string;
	confirmedKills: number;
}

class Starfighter {
	constructor(readonly model: string) {}
}

const application: PilotApplication = { callSign: 'Rogue Four', homeworld: '', confirmedKills: 2 };
const formFields: string[] = [];

const register = (field: string): void => {
	formFields.push(field);
};

const validate = (candidate: PilotApplication): string[] => {
	return candidate.homeworld === '' ? [`${nameOf(() => candidate.homeworld)} is required`] : [];
};

register(nameOf(() => application.callSign));
register(nameOf(() => application.homeworld));

console.log(formFields); // ['callSign', 'homeworld']
console.log(validate(application)); // ['homeworld is required']
console.log(nameOf(() => application.confirmedKills)); // 'confirmedKills' — a coluna de ordenação
console.log(nameOf(Starfighter)); // 'Starfighter'
console.log(nameOf<PilotApplication>()); // 'PilotApplication'
```

## `typeOf` — um `typeof` que responde direito

O `typeof` nativo tem oito respostas e junta quase tudo o que um programa
precisa distinguir:

```ts
typeof null; // 'object'      ← inútil
typeof ['Hoth', 'Endor']; // 'object'      ← inútil
typeof NaN; // 'number'      ← inútil
typeof new Date(); // 'object'      ← inútil
```

```ts
typeOf(null).typeId; // 'null'
typeOf(['Hoth', 'Endor']).typeId; // 'array'
typeOf(NaN).typeId; // 'nan'
typeOf(new Date()).typeId; // 'date'
typeOf(new Stormtrooper()); // { typeId: 'instance', name: 'Stormtrooper', … }
```

O resultado traz:

| Campo                            | O que diz                                                       |
| -------------------------------- | --------------------------------------------------------------- |
| `typeId`                         | A forma em runtime, usável como discriminante de `switch`       |
| `name`                           | `'Stormtrooper'`, `'Date'`, `'(anonymous)'`                     |
| `lineage`                        | A cadeia de protótipos: `['Stormtrooper', 'Trooper', 'Object']` |
| `primitive` `nullish` `iterable` | Flags que valem ter sem outra checagem                          |
| `declared`                       | O tipo **escrito** — só com o transformer                       |

Um callable que não carrega nome próprio é reportado como `'(anonymous)'`, tanto
por `typeOf` quanto por `nameOf`. A string é exportada como `ANONYMOUS_NAME`,
então o código que distingue um callable desses compara contra a constante em
vez de redigitá-la:

```ts
typeOf(() => 'Use the Force').name === ANONYMOUS_NAME; // true
```

R2-D2 listando as rotinas plugadas na rede de manutenção da Estrela da Morte, e
marcando as que ninguém nomeou:

```ts
import { ANONYMOUS_NAME, typeOf } from '@fulcro/reflect';

const openBlastDoors = (): string => 'blast doors open';
const stopTrashCompactor = (): string => 'trash compactor stopped';

const routines: (() => string)[] = [openBlastDoors, stopTrashCompactor, () => 'tractor beam off'];

console.log(routines.map((routine) => typeOf(routine).name));
// ['openBlastDoors', 'stopTrashCompactor', '(anonymous)']

const unnamed = routines.filter((routine) => typeOf(routine).name === ANONYMOUS_NAME);

console.log(unnamed.length, unnamed[0]?.()); // 1 'tractor beam off'
```

`declared` é o que nada mais consegue te dar:

```ts
typeOf(pilot).declared;
// { text: 'PilotRecord', name: 'PilotRecord', kind: 'interface',
//   site: { path: 'src/models/pilot.ts', line: 12, column: 18 } }
```

O nome do tipo, como ele foi declarado, e o arquivo e a linha de onde veio.

### Onde você usa `typeOf` de verdade

```ts
// Um logger que diz o que recebeu, e não 'object'.
log(`expected a Date, got ${typeOf(value).name}`);

// Despachar pela forma sem uma cadeia de instanceof.
switch (typeOf(cargo).typeId) {
	case 'array':
		return cargo.length;
	case 'map':
	case 'set':
		return cargo.size;
	case 'string':
		return cargo.length;
}
```

`typeOf` nunca lê o conteúdo do que inspeciona e nunca avalia um acessor, então
descrever um array de um milhão de elementos custa o mesmo que descrever um de
um elemento, e um getter caro não é disparado só por olhar o objeto que o
carrega.

Um oficial da alfândega de Mos Eisley registrando o que quer que chegue num
porão de carga, pelo que de fato é:

```ts
import { typeOf } from '@fulcro/reflect';

class Trooper {}
class Stormtrooper extends Trooper {}

interface Manifest {
	ship: string;
}

const describeCargo = (cargo: unknown): string => {
	const description = typeOf(cargo);

	switch (description.typeId) {
		case 'array':
			return `${String((cargo as unknown[]).length)} crates`;
		case 'map':
		case 'set':
			return `a sealed shipment of ${String((cargo as Set<unknown>).size)}`;
		case 'instance':
			return `a ${description.name}, lineage ${description.lineage.join(' → ')}`;
		default:
			return description.typeId;
	}
};

console.log(describeCargo(['spice', 'coaxium'])); // '2 crates'
console.log(describeCargo(new Set(['kyber']))); // 'a sealed shipment of 1'
console.log(describeCargo(new Stormtrooper())); // 'a Stormtrooper, lineage Stormtrooper → Trooper → Object'
console.log(describeCargo(Number.NaN)); // 'nan'
console.log(describeCargo(null)); // 'null'

const manifest: Manifest = { ship: 'Millennium Falcon' };

console.log(typeOf(manifest).declared?.name); // 'Manifest' — o tipo como foi escrito, vindo do transformer
```

## `defaultOf` — o valor válido mais vazio de um tipo

```ts
interface PreflightChecklist {
	ship: string;
	pilot: { callSign: string; cleared: boolean };
	torpedoes: number;
	astromechs: string[];
	note?: string;
}

defaultOf<PreflightChecklist>();
// { ship: '', pilot: { callSign: '', cleared: false }, torpedoes: 0, astromechs: [] }

defaultOf<string>(); // ''
defaultOf<'light' | 'dark'>(); // 'light'
```

**Uma regra cobre todos os casos: o resultado é sempre um `T` válido.**
Propriedades obrigatórias são preenchidas, as opcionais ficam de fora — a
ausência já as satisfaz —, um tipo literal dá o seu único habitante, e uma
união dá `null` ou `undefined` quando admite um deles.

Tuplas são preenchidas posição por posição, arrays voltam vazios, `Set` e `Date`
são instanciados em vez de descritos, e um tipo circular é fechado em vez de
aninhar para sempre.

### Onde você usa `defaultOf` de verdade

```ts
// Um estado de formulário vazio que acompanha o modelo.
const [draft, setDraft] = useState(defaultOf<PreflightChecklist>());

// Uma fixture de teste com só o campo testado escrito.
const checklist = { ...defaultOf<PreflightChecklist>(), torpedoes: 2 };

// Voltar ao vazio sem uma constante mantida à mão.
setFilters(defaultOf<HangarFilters>());
```

Acrescente um campo obrigatório a `PreflightChecklist` e todos esses
acompanham. Um `{ ship: '', torpedoes: 0 }` escrito à mão não acompanha, e o
compilador não vai te avisar.

O terminal de checklist do convés do hangar, começando cada caça de um
formulário em branco que sempre bate com o modelo:

```ts
import { defaultOf } from '@fulcro/reflect';

interface PreflightChecklist {
	ship: string;
	pilot: { callSign: string; cleared: boolean };
	torpedoes: number;
	astromechs: string[];
	note?: string;
}

const blank = defaultOf<PreflightChecklist>();

console.log(blank);
// { ship: '', pilot: { callSign: '', cleared: false }, torpedoes: 0, astromechs: [] }

const redFive: PreflightChecklist = {
	...blank,
	ship: 'T-65B X-wing',
	pilot: { callSign: 'Red Five', cleared: true },
	torpedoes: 2,
	astromechs: ['R2-D2'],
};

console.log(redFive.pilot.cleared, blank.pilot.cleared); // true false — o formulário em branco não foi tocado
console.log(defaultOf<'light' | 'dark'>()); // 'light'
```

## `pathOf` — o caminho inteiro, não o último nome

`nameOf` responde com o último segmento. `pathOf` responde com todos:

```ts
nameOf(() => pilot.starfighter.astromech); // 'astromech'
pathOf(() => pilot.starfighter.astromech); // 'starfighter.astromech'

pathOf(() => squadron.pilots[0].callSign); // 'pilots[0].callSign'
pathOf(() => squadron['leader'].callSign); // 'leader.callSign'
```

Que é o que um nome de campo de formulário, uma coluna de banco, uma chave de
ordenação ou uma chave de tradução precisam de fato — o nome sozinho perde onde
o valor mora.

**A raiz é descartada**, porque o caminho é relativo a ela. O objeto descrito é
o formulário, a linha, o documento, e repetir o nome que a variável local
calhou de ter faria a resposta depender disso.

O acessor nunca é invocado, então isto é seguro num getter com efeitos
colaterais. Com o transformer ele vira um literal antes que um minificador
possa renomear qualquer coisa; sem ele, o código da closure é analisado em
runtime, o que funciona e tem a mesma ressalva que `nameOf` tem.

Um formulário de escala de esquadrão, cujos nomes de campo são os caminhos para
dentro do registro que ele edita:

```ts
import { pathOf } from '@fulcro/reflect';

interface SquadronRecord {
	name: string;
	leader: { callSign: string; homeworld: string };
	pilots: { callSign: string; starfighter: { astromech: string } }[];
}

const squadron: SquadronRecord = {
	name: 'Rogue Squadron',
	leader: { callSign: 'Rogue Leader', homeworld: 'Tatooine' },
	pilots: [{ callSign: 'Rogue Two', starfighter: { astromech: 'R5-D4' } }],
};

const fields = [
	pathOf(() => squadron.name),
	pathOf(() => squadron['leader'].callSign),
	pathOf(() => squadron.pilots[0].starfighter.astromech),
];

console.log(fields); // ['name', 'leader.callSign', 'pilots[0].starfighter.astromech']
```

## Descrevendo um tipo sem um valor

Cinco utilitários respondem a perguntas sobre um **tipo**, sem valor para
inspecionar. Os cinco precisam do transformer, e recusam sem ele.

### `keysOf<T>()`

```ts
keysOf<HangarManifest>(); // ['bay', 'ship', 'captain', 'cleared']
```

Para as listas que um programa vive escrevendo à mão e esquecendo de atualizar:
as colunas de uma tabela, os campos de um formulário, as propriedades a copiar.

**Isto não é `Object.keys`, de propósito.** As chaves de um valor e as chaves de
um tipo são perguntas diferentes: a tipagem estrutural deixa um objeto carregar
mais do que o seu tipo declara, que é exatamente por que `Object.keys` devolve
`string[]` e não `(keyof T)[]`. Tipar esse cast como a coisa mais estreita seria
uma mentira da mesma família do `as` da própria linguagem. Este nunca olha para
um valor.

A tela de controle do hangar, cujas colunas vêm do tipo — e continuam sendo as
do tipo quando um registro carrega mais:

```ts
import { keysOf } from '@fulcro/reflect';

interface HangarManifest {
	bay: number;
	ship: string;
	captain: string;
	cleared: boolean;
}

const columns = keysOf<HangarManifest>();

const arrivals = [
	{ bay: 94, ship: 'Millennium Falcon', captain: 'Han Solo', cleared: false, smuggling: true },
];

const rows = arrivals.map((arrival) =>
	columns.map((column) => String(arrival[column])).join(' | '),
);

console.log(columns); // ['bay', 'ship', 'captain', 'cleared']
console.log(rows); // ['94 | Millennium Falcon | Han Solo | false'] — o campo a mais não é uma coluna
console.log(Object.keys(arrivals[0]).length); // 5 — o que o valor tem, não o que o tipo declara
```

### `typeOf<T>()`

A contraparte de `typeOf(value)`. Aquele descreve o que um valor **é**; este
descreve o que um tipo **diz**:

```ts
typeOf<HangarManifest>();
// {
//   text: 'HangarManifest', name: 'HangarManifest', kind: 'interface',
//   site: { path: 'src/hangar/manifest.ts', line: 4, column: 1 },
//   members: [
//     { name: 'bay',  type: 'number', optional: false, readonly: true },
//     { name: 'note', type: 'string | undefined', optional: true, readonly: false },
//   ],
//   union: null,
//   element: null,
// }
```

`members` é o que um `membersOf<T>()` separado teria devolvido — uma pergunta,
um lugar. `union` traz os ramos quando o tipo é uma união, e `element` o tipo do
elemento quando é um array; os dois são `null` nos outros casos, porque uma
lista vazia seria lida como uma forma sem nada dentro.

As duas formas se distinguem por terem argumento ou não, então
`typeOf(undefined)` continua descrevendo o valor undefined.

O painel de documentação do oficial do convés, escrito a partir do próprio tipo:

```ts
import { typeOf } from '@fulcro/reflect';

interface HangarManifest {
	readonly bay: number;
	ship: string;
	note?: string;
}

const manifestType = typeOf<HangarManifest>();

console.log(manifestType.name, manifestType.kind); // 'HangarManifest' 'interface'

for (const member of manifestType.members) {
	console.log(
		`${member.name}: ${member.type}${member.optional ? ' (optional)' : ''}${member.readonly ? ' (readonly)' : ''}`,
	);
}
// 'bay: number (readonly)'
// 'ship: string'
// 'note: string | undefined (optional)'

console.log(typeOf<string[]>().element); // 'string'
```

### `pathsOf<T>()`

Toda folha até onde o tipo pode ser percorrido:

```ts
pathsOf<BountyContract>();
// [
//   { path: 'target',                type: 'string',  optional: false },
//   { path: 'client.name',           type: 'string',  optional: false },
//   { path: 'hunters[].name',        type: 'string',  optional: false },
//   { path: 'status', type: '"open" | "claimed"',    optional: false },
//   { path: 'postedAt',              type: 'Date',    optional: false },
// ]
```

Para tudo o que enumera uma forma em vez de ler um valor: as colunas pelas quais
um relatório pode ordenar, os campos que um formulário renderiza, as chaves de
que um arquivo de tradução precisa.

**Três regras mantêm a resposta útil**, e cada uma existe porque a versão sem
ela produz bobagem.

Um **primitivo é uma folha.** Descer num deles dá o `String.prototype` inteiro —
`client.name.trimLeft` é um caminho de propriedade real e inútil como caminho de
dados.

Uma **classe conhecida é uma folha.** `postedAt` informa `Date`, e não os
cinquenta métodos que uma data carrega.

**A recursão para** na repetição, nomeando o tipo no fim do caminho. Um tipo que
contém a si mesmo tem infinitos caminhos, e onde a repetição começa é mais
honesto do que uma profundidade arbitrária dela.

Uma união de primitivos é uma folha e informa a união. Uma união com um objeto
dentro é informada sem ser percorrida: não há um caminho único a prometer quando
a forma depende do ramo que o valor tomou.

O montador de relatórios da Guilda, oferecendo toda coluna pela qual um contrato
de recompensa pode ser ordenado:

```ts
import { pathsOf } from '@fulcro/reflect';

interface BountyContract {
	target: string;
	client: { name: string };
	hunters: { name: string }[];
	status: 'open' | 'claimed';
	postedAt: Date;
}

const sortable = pathsOf<BountyContract>().map((leaf) => `${leaf.path} (${leaf.type})`);

console.log(sortable);
// [
//   'target (string)',
//   'client.name (string)',
//   'hunters[].name (string)',
//   'status ("open" | "claimed")',
//   'postedAt (Date)',
// ]
```

### `sizeOf<T>()` e `alignOf<T>()`

O tamanho e o alinhamento que um tipo declara, em bytes:

```ts
import type { Decimal, SignedInteger } from '@fulcro/types';

sizeOf<SignedInteger<32>>(); // 4
alignOf<SignedInteger<32>>(); // 4
sizeOf<Decimal>(); // 16
```

A resposta é tipada como o literal que o layout declara, o mesmo que
`layoutOf<T>()` reporta: `sizeOf<SignedInteger<32>>()` tem o tipo `4`, e não
`number`. Uma variável que acumula tamanhos diz isso:

```ts
let total: number = sizeOf<SignedInteger<32>>();

total += sizeOf<Decimal>();
```

Com o transformer, cada chamada é substituída pelo número, então custa o que um
literal custa. Os números descrevem o formato binário do tipo — os dois bytes
de um float de meia precisão, os dezesseis de um decimal128 —, não o que um
motor de JavaScript gasta num valor no seu próprio heap.

**Um tipo só responde se declara um layout.** Os tipos numéricos de
[`@fulcro/types`](./types.md) declaram; `string`, `bigint`, um objeto e
`BigInteger` não, e para eles a chamada é um **erro de tipo**, não um número que
alguém chutou:

```ts
sizeOf<string>(); // erro: Type 'string' does not satisfy the constraint
```

O que conta como declarar um layout é uma forma, não um import: um tipo com uma
propriedade `'~layout'` cujos `size` e `alignment` são literais numéricos.
`@fulcro/types` declara assim, e nenhum dos dois pacotes importa o outro.

Duas chamadas compilam e depois lançam em runtime, porque não há um número único
a emitir: um **parâmetro genérico** que ainda não foi substituído —
`sizeOf<T>()` dentro de uma função genérica — e uma **união de layouts
diferentes**, como `sizeOf<SignedInteger<8> | SignedInteger<16>>()`.

Os bytes que um registro de recompensa ocupa no livro binário da Guilda, somados
a partir do que o tipo de cada campo declara:

```ts
import { alignOf, sizeOf } from '@fulcro/reflect';
import type { Decimal, SignedInteger, UnsignedInteger } from '@fulcro/types';

// Número da licença do caçador, a recompensa em créditos e o número de tentativas.
let recordBytes: number = sizeOf<SignedInteger<32>>();

recordBytes += sizeOf<Decimal>();
recordBytes += sizeOf<UnsignedInteger<8>>();

console.log(recordBytes); // 21
console.log(alignOf<Decimal>()); // 16
console.log(sizeOf<SignedInteger<32>>() * 1_000); // 4000 — mil números de licença
```

### `offsetOf<T>(field)` e `layoutOf<T>()`

Onde fica um campo de uma struct, e o layout inteiro de uma vez:

```ts
import { SinglePrecisionFloat, struct, type Struct } from '@fulcro/types';

const Starfighter = struct('Starfighter', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});
type Starfighter = Struct<typeof Starfighter>;

offsetOf<Starfighter>('hull'); // 4
offsetOf<Starfighter>('hyperdrive'); // erro: não é um campo de Starfighter

layoutOf<Starfighter>();
// {
//   size: 12,
//   alignment: 4,
//   fields: {
//     shields: { offset: 0, size: 4, alignment: 4 },
//     hull: { offset: 4, size: 4, alignment: 4 },
//     speed: { offset: 8, size: 4, alignment: 4 },
//   },
// }
```

Com o transformer, `offsetOf` é substituído pelo número e `layoutOf` por um
objeto literal congelado, igual ao `Starfighter.layout` do próprio descritor da
struct, com os campos na ordem em que foram declarados. Um método, `'~layout'`
ou qualquer outro nome que não seja um campo é um **erro de tipo**, e `offsetOf`
num tipo sem campos também. `layoutOf` num tipo numérico dá o tamanho e o
alinhamento dele e `fields: {}`.

Os offsets não estão escritos no tipo; só o tamanho e o alinhamento de cada
campo. O transformer posiciona os campos ele mesmo, pela regra com que
[`struct`](./types.md#onde-os-campos-ficam) os posiciona em runtime — maior
alinhamento primeiro, ordem de declaração entre iguais —, lendo a ordem do
tipo, onde o compilador a guarda. Isso vale também para uma struct importada de
um pacote construído: o arquivo de declaração ainda lista os campos na ordem em
que foram escritos.

`offsetOf` precisa do campo como **string literal**: um nome guardado numa
variável só é conhecido quando o código roda, então a chamada é deixada para
lançar, como acontece com um parâmetro genérico. Uma união de structs cujos
campos ficam em lugares diferentes também não tem resposta única, e lança.

Um buffer de telemetria de caça lido campo a campo, nos offsets que o tipo
declara — e uma struct cujo campo largo é posicionado primeiro:

```ts
import { layoutOf, offsetOf } from '@fulcro/reflect';
import {
	DoublePrecisionFloat,
	SinglePrecisionFloat,
	type Struct,
	struct,
	UnsignedInteger,
} from '@fulcro/types';

const Starfighter = struct('Starfighter', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});
type Starfighter = Struct<typeof Starfighter>;

const telemetry = new DataView(new ArrayBuffer(layoutOf<Starfighter>().size));

telemetry.setFloat32(offsetOf<Starfighter>('hull'), 0.25, true);

console.log(telemetry.getFloat32(offsetOf<Starfighter>('hull'), true)); // 0.25 — sobrou um quarto do casco
console.log(layoutOf<Starfighter>().size); // 12

const NavigationBeacon = struct('NavigationBeacon', {
	channel: UnsignedInteger(8),
	parsecsFromCoruscant: DoublePrecisionFloat,
});
type NavigationBeacon = Struct<typeof NavigationBeacon>;

console.log(offsetOf<NavigationBeacon>('parsecsFromCoruscant')); // 0 — o maior alinhamento vem primeiro
console.log(offsetOf<NavigationBeacon>('channel')); // 8
console.log(layoutOf<NavigationBeacon>().size); // 16
```

## `constantOf` — calculado uma vez, enquanto o programa compila

Uma tabela de consulta, uma série pré-calculada, um conjunto de coeficientes:
valores que são os mesmos em toda execução, calculados em toda execução mesmo
assim.

```ts
import { constantOf } from '@fulcro/reflect';

export const ASTROMECH_CHECKSUM_TABLE = constantOf(() =>
	Array.from({ length: 256 }, (_, byte) => {
		let crc = byte;

		for (let bit = 0; bit < 8; bit++) {
			crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
		}

		return crc >>> 0;
	}),
);
// emitido: export const ASTROMECH_CHECKSUM_TABLE = Object.freeze([0, 1996959894, 3993919788, …]);
```

A chamada é TypeScript comum: o `tsc`, um editor e um linter a leem como uma
chamada, e nada no arquivo precisa de plugin para ser entendido. Com o
transformer, a função roda **enquanto o programa compila**, e a chamada é
substituída pelo que ela devolveu, congelado em todos os níveis. Sem ele, a
chamada roda a função em runtime e congela o resultado do mesmo jeito — a
resposta é a mesma, só é paga mais tarde.

A porta de dados do R2-D2, conferindo os planos da Estrela da Morte que recebeu
contra o checksum que a nave da Princesa Leia mandou junto — a tabela montada
uma vez, no build:

```ts
import { constantOf } from '@fulcro/reflect';

const ASTROMECH_CHECKSUM_TABLE = constantOf(() =>
	Array.from({ length: 256 }, (_, byte) => {
		let crc = byte;

		for (let bit = 0; bit < 8; bit++) {
			crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
		}

		return crc >>> 0;
	}),
);

const checksum = (data: string): number => {
	let crc = 0xffffffff;

	for (const byte of new TextEncoder().encode(data)) {
		crc = (crc >>> 8) ^ (ASTROMECH_CHECKSUM_TABLE[(crc ^ byte) & 0xff] ?? 0);
	}

	return (crc ^ 0xffffffff) >>> 0;
};

const plans = 'Death Star technical readout: thermal exhaust port, two metres wide';

console.log(checksum(plans) === checksum(plans)); // true
console.log(ASTROMECH_CHECKSUM_TABLE[1]); // 1996959894
console.log(Object.isFrozen(ASTROMECH_CHECKSUM_TABLE)); // true — congelada em todos os níveis
```

### O que ele consegue provar

O transformer só avalia uma chamada quando consegue provar que a função é
constante. Todo nome que a função lê de fora de si tem de ser:

- um **`const`** cujo inicializador também é provável — outro `constantOf`
  inclusive, que então é avaliado uma vez e tem o valor reaproveitado;
- uma **função** declarada no seu código, cujo corpo também é provável,
  recursão inclusive;
- um dos **built-ins** cuja resposta depende só dos argumentos — `Math`,
  `Number`, `String`, `Array`, `Object`, `JSON`, `BigInt`, `Map`, `Set`, os
  typed arrays e afins.

Os nomes são seguidos através dos imports entre os seus próprios arquivos.
Qualquer outra coisa é recusada, **na chamada, como erro de compilação**,
nomeando o primeiro nome que ele não conseguiu provar:

```text
FULCRO4010: constantOf(…) cannot be evaluated at compile time: 'jumpsPlotted' is declared with let or var, so it can change. …
```

Um `let`, um parâmetro de uma função que a envolve, uma classe, `Date`,
`globalThis`, e todo valor declarado só num `.d.ts` — que é tudo o que vem de
outro pacote, `@fulcro/types` inclusive, já que o compilador vê os tipos dele e
nunca o código-fonte. A função roda num contexto próprio, sem `Math.random` e
com um limite de cinco segundos; um lançamento ou um estouro de tempo também é
erro de compilação ([FULCRO4012](./errors/FULCRO4xxx.md#fulcro4012),
[FULCRO4013](./errors/FULCRO4xxx.md#fulcro4013)). Nenhum desses é deixado em
silêncio para o runtime: um build que pediu um valor já calculado não entrega o
cálculo no lugar dele.

### O que ele pode devolver

O que um literal consegue escrever: números — `NaN`, os infinitos e `-0`
inclusive —, strings, booleanos, bigints, `null`, `undefined`, e arrays e
objetos simples deles. Uma função, uma instância de classe, um `Map`, um array
com buracos ou um objeto alcançado duas vezes é recusado com
[FULCRO4011](./errors/FULCRO4xxx.md#fulcro4011) — em tempo de compilação com o
transformer, e em runtime pela mesma regra sem ele, para que os dois nunca
discordem.

## `is` e `as` — checando um valor contra um tipo

O `as` do TypeScript é uma **afirmação, não uma checagem**.
`payload as DockingRecord` compila seja lá o que `payload` for, e o erro aparece
depois, em outro lugar, como uma propriedade de `undefined`.

Estes dois fazem a checagem que a linguagem não faz: o transformer lê o tipo
enquanto o compilador ainda o tem e escreve o teste — toda propriedade, objetos
aninhados, todo elemento de um array.

```ts
if (is<DockingRecord>(payload)) {
	payload.bay; // estreitado, e verificado de fato
}

const record = as<DockingRecord>(JSON.parse(transmission));
```

`is` é um **type guard**, para quando uma falha deve desviar o programa. `as`
devolve o valor — o mesmo objeto, não uma cópia — e lança quando ele não bate,
para quando uma falha deve pará-lo.

### A mensagem diz onde falhou

```text
TypeError: FULCRO4007: as<DockingRecord>() refused a value: captain.name: expected string, got number
TypeError: FULCRO4007: as<DockingRecord>() refused a value: cargo[1]: expected string, got undefined
```

Ouvindo só _"não é um DockingRecord"_ sobre um registro de quarenta campos, você
não estaria melhor do que antes de a checagem existir. Então o transformer emite
um segundo percorredor ao lado da checagem rápida, só para responder **onde**.
Ele só roda depois que a checagem já recusou, então um valor que passa nunca
paga por ele — e só o `as` ganha um, já que um desvio precisa de sim ou não.

Onde um tipo é mais do que o percorredor consegue descrever com precisão — uma
interseção, uma tupla, uma união de formas de objeto — ele nomeia o tipo
esperado naquele caminho em vez de chutar um campo. Vago é melhor que errado: um
caminho é uma promessa sobre onde o problema está, e inventar um manda alguém
para o campo errado.

O controle de atracagem de Mos Eisley, desviando no que passa e parando no que
não pode passar:

```ts
import { as, is } from '@fulcro/reflect';

interface DockingRecord {
	bay: number;
	ship: string;
	captain: { name: string };
	cargo: string[];
}

const arrivals: unknown[] = [
	{ bay: 94, ship: 'Millennium Falcon', captain: { name: 'Han Solo' }, cargo: ['passengers'] },
	{ bay: 86, ship: 'Slave I', captain: { name: 2187 }, cargo: ['carbonite'] },
];

const cleared = arrivals
	.filter((arrival) => is<DockingRecord>(arrival))
	.map((record) => record.ship);

console.log(cleared); // ['Millennium Falcon']

try {
	as<DockingRecord>(arrivals[1]);
} catch (error) {
	console.log((error as Error).message);
	// 'FULCRO4007: as<DockingRecord>() refused a value: captain.name: expected string, got number'
}

const record = as<DockingRecord>(arrivals[0]);

console.log(record === arrivals[0]); // true — o mesmo objeto, verificado, não uma cópia
```

### O que pode ser checado

O mesmo conjunto que as sequências checam, porque é o mesmo gerador:
primitivos, literais, uniões, interseções, objetos e interfaces aninhados em
qualquer profundidade, propriedades opcionais, arrays, tuplas de tamanho fixo,
classes, as classes embutidas por `instanceof`, e tipos que contêm a si mesmos.
Propriedades a mais são aceitas, porque a tipagem estrutural as aceita.

Recusados, e de forma visível: assinaturas de índice e genéricos não
resolvidos. Para esses, escreva o teste e passe-o:

```ts
is<Holocron>(value, {
	name: 'Holocron',
	matches: (v) => looksLikeHolocron(v),
});
```

Um teste é tipado pelo tipo que ele garante: um `TypeTest<Starship>` não é
aceito onde se pede um `TypeTest<Holocron>`, então um teste escrito para um tipo
não pode ser entregue à verificação de outro.

Um holocron é uma assinatura de índice — qualquer era, qualquer ensinamento —,
que o transformer não vai escrever por extenso. O teste dos próprios Arquivos,
passado junto:

```ts
import { is } from '@fulcro/reflect';

interface Holocron {
	[era: string]: string;
}

const looksLikeHolocron = (value: unknown): boolean => {
	return (
		value !== null &&
		typeof value === 'object' &&
		Object.values(value).every((teaching) => typeof teaching === 'string')
	);
};

const recovered: unknown[] = [{ 'Old Republic': 'The Rule of Two' }, { 'Clone Wars': 66 }];

const readable = recovered.filter((value) => {
	return is<Holocron>(value, { name: 'Holocron', matches: looksLikeHolocron });
});

console.log(readable.length); // 1
```

### Os dois precisam do transformer

Sem ele a chamada recusa em vez de chutar. Uma checagem que responde `true` para
a coisa errada é pior do que nenhuma checagem — é falsa confiança exatamente na
fronteira onde os dados são menos confiáveis.

## O transformer não é opcional

Estes utilitários têm o nome do que leem, e o que leem é o _tipo_ — que só
existe enquanto o compilador roda. Sem o transformer o pacote ainda carrega e
ainda responde, mas responde a partir do valor:

|                                | Sem                                          | Com o transformer                          |
| ------------------------------ | -------------------------------------------- | ------------------------------------------ |
| `nameOf(() => pilot.callSign)` | `'callSign'` — analisado a partir da closure | `'callSign'` — emitido como literal        |
| `nameOf<PilotRecord>()`        | não disponível                               | `'PilotRecord'`                            |
| `typeOf(v).declared`           | `null`                                       | o tipo declarado e onde ele está no código |
| `defaultOf<T>()`               | **lança**                                    | o valor construído, emitido no lugar       |
| `constantOf(() => …)`          | a função roda, em runtime                    | o resultado, calculado ao compilar         |

Dois desses se degradam **em silêncio**, o que vale saber antes de encontrar: um
minificador renomeia variáveis locais, então `nameOf(() => callSign)` pode
informar um nome embaralhado num build empacotado, e `typeOf(…).declared`
simplesmente lê `null`. Só `defaultOf` falha de forma visível — de propósito,
porque um padrão que ele não consegue calcular seria uma mentira.

## Ligando o transformer

Dois caminhos, dependendo de como você faz o build. Nada extra a instalar em
nenhum dos dois — o transformer veio com o pacote.

### Com `tsc`

O `tsc` não roda transformers de terceiros por conta própria; o `ts-patch`
ensina.

```sh
npm install --save-dev ts-patch
```

```jsonc
// tsconfig.json
{
	"compilerOptions": {
		"plugins": [{ "transform": "@fulcro/reflect/transformer", "type": "program" }],
	},
}
```

```jsonc
// package.json — faça o build com tspc em vez de tsc
{ "scripts": { "build": "tspc -p tsconfig.json" } }
```

### Com um bundler

```ts
// vite.config.ts
import { vite as fulcro } from '@fulcro/reflect/unplugin';

export default defineConfig({ plugins: [fulcro()] });
```

`rollup`, `webpack`, `rspack`, `esbuild` e `farm` são exportados com os próprios
nomes e aceitam as mesmas opções. O plugin declara `enforce: 'pre'`, o que
importa — depois que o esbuild ou o swc apagou os tipos, não sobra nada para
ler.

A configuração do Vite do rastreador de frota da Aliança, com a raiz do projeto
nomeada para que os caminhos em `typeOf(…).declared` sejam relativos a ela:

```ts
// vite.config.ts do rastreador da frota rebelde
import { fileURLToPath } from 'node:url';

import { vite as fulcroReflect } from '@fulcro/reflect/unplugin';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [fulcroReflect({ projectRoot: fileURLToPath(new URL('.', import.meta.url)) })],
});
```

### TypeScript 5.9 ou mais recente, até o 7 exclusive

O 5.9 é a versão em que o compilador marca um import só de tipos do jeito que o
transformer lê. O 7.x é o port nativo, e o pacote dele não expõe mais a API do
compilador sobre a qual isto é construído. A faixa de peer diz isso, em vez de
deixar uma instalação dar certo e acabar num transformer que não consegue
iniciar. O `@fulcro/reflect` em si não é afetado e roda em qualquer lugar, no
seu comportamento de fallback.

## Solução de problemas

**`defaultOf` lança.** O transformer não rodou sobre esse arquivo. Fazer o build
com `tsc` em vez de `tspc`, ou um plugin de bundler registrado depois da etapa
de TypeScript, são as duas causas comuns.

**`typeOf(…).declared` é `null`, ou `nameOf` informa um nome embaralhado.** Mesma
causa. Esses dois se degradam em silêncio, então confira-os sempre que a
configuração do build mudar.

**O build falha com FULCRO4010 num `constantOf`.** A função lê algo que o
transformer não consegue provar constante, e a mensagem diz o quê. Num bundler,
as recusas de um arquivo chegam juntas, como
[FULCRO5003](./errors/FULCRO5xxx.md#fulcro5003).

**Os caminhos do `typeOf` parecem errados.** Defina `projectRoot`
explicitamente; eles são relativos a ele, e o padrão é o diretório de trabalho
do compilador.
