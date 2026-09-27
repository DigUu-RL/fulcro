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
interface User {
	email: string;
}

// Em runtime não existe `User`. Não há a quem perguntar.
```

Então uma função comum só consegue dizer o que vê no _valor_ que está na sua
frente. Estes utilitários vão além, fazendo o trabalho **enquanto o compilador
ainda está rodando**.

## `nameOf` — o nome como foi escrito

```ts
const email = 'a@b.c';

nameOf(() => email); // 'email'
nameOf(() => user.profile.theme); // 'theme'    (último segmento)
nameOf(() => user['email']); // 'email'
nameOf(() => user.save); // 'save'     (nunca o chama)
nameOf<UserContract>(); // 'UserContract'
nameOf(User); // 'User'
```

O acessor **nunca é invocado**, então é seguro num getter com efeitos
colaterais e não custa nada avaliar.

### Onde você usa `nameOf` de verdade

Em todo lugar em que uma string tem de bater com o nome de uma propriedade, e um
erro de digitação passaria em silêncio:

```ts
// Ordenar por um nome de coluna que uma renomeação quebraria de forma visível.
const column = nameOf(() => user.createdAt);

// Um campo de formulário ligado a uma propriedade do modelo.
register(nameOf(() => form.email));

// Uma mensagem de validação que acompanha uma renomeação.
throw new Error(`${nameOf(() => order.total)} is required`);
```

Renomeie `createdAt` no editor e a string acompanha. Escreva `'createdAt'` à mão
e ela não acompanha.

## `typeOf` — um `typeof` que responde direito

O `typeof` nativo tem oito respostas e junta quase tudo o que um programa
precisa distinguir:

```ts
typeof null; // 'object'      ← inútil
typeof [1, 2]; // 'object'      ← inútil
typeof NaN; // 'number'      ← inútil
typeof new Date(); // 'object'      ← inútil
```

```ts
typeOf(null).typeId; // 'null'
typeOf([1, 2]).typeId; // 'array'
typeOf(NaN).typeId; // 'nan'
typeOf(new Date()).typeId; // 'date'
typeOf(new Admin()); // { typeId: 'instance', name: 'Admin', … }
```

O resultado traz:

| Campo                            | O que diz                                                 |
| -------------------------------- | --------------------------------------------------------- |
| `typeId`                         | A forma em runtime, usável como discriminante de `switch` |
| `name`                           | `'Admin'`, `'Date'`, `'(anonymous)'`                      |
| `lineage`                        | A cadeia de protótipos: `['Admin', 'User', 'Object']`     |
| `primitive` `nullish` `iterable` | Flags que valem ter sem outra checagem                    |
| `declared`                       | O tipo **escrito** — só com o transformer                 |

`declared` é o que nada mais consegue te dar:

```ts
typeOf(user).declared;
// { text: 'UserContract', name: 'UserContract', kind: 'interface',
//   site: { path: 'src/models/user.ts', line: 12, column: 18 } }
```

O nome do tipo, como ele foi declarado, e o arquivo e a linha de onde veio.

### Onde você usa `typeOf` de verdade

```ts
// Um logger que diz o que recebeu, e não 'object'.
log(`expected a Date, got ${typeOf(value).name}`);

// Despachar pela forma sem uma cadeia de instanceof.
switch (typeOf(value).typeId) {
	case 'array':
		return value.length;
	case 'map':
	case 'set':
		return value.size;
	case 'string':
		return value.length;
}
```

`typeOf` nunca lê o conteúdo do que inspeciona e nunca avalia um acessor, então
descrever um array de um milhão de elementos custa o mesmo que descrever um de
um elemento, e um getter caro não é disparado só por olhar o objeto que o
carrega.

## `defaultOf` — o valor válido mais vazio de um tipo

```ts
interface Order {
	id: number;
	customer: { name: string; active: boolean };
	items: string[];
	note?: string;
}

defaultOf<Order>();
// { id: 0, customer: { name: '', active: false }, items: [] }

defaultOf<string>(); // ''
defaultOf<'dark' | 'light'>(); // 'dark'
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
const [draft, setDraft] = useState(defaultOf<OrderForm>());

// Uma fixture de teste com só o campo testado escrito.
const order = { ...defaultOf<Order>(), total: 99 };

// Voltar ao vazio sem uma constante mantida à mão.
setFilters(defaultOf<Filters>());
```

Acrescente um campo obrigatório a `Order` e todos esses acompanham. Um
`{ id: 0, items: [] }` escrito à mão não acompanha, e o compilador não vai te
avisar.

## `pathOf` — o caminho inteiro, não o último nome

`nameOf` responde com o último segmento. `pathOf` responde com todos:

```ts
nameOf(() => user.profile.email); // 'email'
pathOf(() => user.profile.email); // 'profile.email'

pathOf(() => order.items[0].sku); // 'items[0].sku'
pathOf(() => order['customer'].email); // 'customer.email'
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

## Descrevendo um tipo sem um valor

Cinco utilitários respondem a perguntas sobre um **tipo**, sem valor para
inspecionar. Os cinco precisam do transformer, e recusam sem ele.

### `keysOf<T>()`

```ts
keysOf<Order>(); // ['id', 'customer', 'items', 'total']
```

Para as listas que um programa vive escrevendo à mão e esquecendo de atualizar:
as colunas de uma tabela, os campos de um formulário, as propriedades a copiar.

**Isto não é `Object.keys`, de propósito.** As chaves de um valor e as chaves de
um tipo são perguntas diferentes: a tipagem estrutural deixa um objeto carregar
mais do que o seu tipo declara, que é exatamente por que `Object.keys` devolve
`string[]` e não `(keyof T)[]`. Tipar esse cast como a coisa mais estreita seria
uma mentira da mesma família do `as` da própria linguagem. Este nunca olha para
um valor.

### `typeOf<T>()`

A contraparte de `typeOf(value)`. Aquele descreve o que um valor **é**; este
descreve o que um tipo **diz**:

```ts
typeOf<Order>();
// {
//   text: 'Order', name: 'Order', kind: 'interface',
//   site: { path: 'src/models/order.ts', line: 4, column: 1 },
//   members: [
//     { name: 'id',   type: 'number', optional: false, readonly: true },
//     { name: 'note', type: 'string', optional: true,  readonly: false },
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

### `pathsOf<T>()`

Toda folha até onde o tipo pode ser percorrido:

```ts
pathsOf<Order>();
// [
//   { path: 'id',                    type: 'number', optional: false },
//   { path: 'customer.email',        type: 'string', optional: false },
//   { path: 'items[].sku',           type: 'string', optional: false },
//   { path: 'status', type: '"pending" | "paid"',    optional: false },
//   { path: 'placedAt',              type: 'Date',   optional: false },
// ]
```

Para tudo o que enumera uma forma em vez de ler um valor: as colunas pelas quais
um relatório pode ordenar, os campos que um formulário renderiza, as chaves de
que um arquivo de tradução precisa.

**Três regras mantêm a resposta útil**, e cada uma existe porque a versão sem
ela produz bobagem.

Um **primitivo é uma folha.** Descer num deles dá o `String.prototype` inteiro —
`customer.email.trimLeft` é um caminho de propriedade real e inútil como
caminho de dados.

Uma **classe conhecida é uma folha.** `placedAt` informa `Date`, e não os
cinquenta métodos que uma data carrega.

**A recursão para** na repetição, nomeando o tipo no fim do caminho. Um tipo que
contém a si mesmo tem infinitos caminhos, e onde a repetição começa é mais
honesto do que uma profundidade arbitrária dela.

Uma união de primitivos é uma folha e informa a união. Uma união com um objeto
dentro é informada sem ser percorrida: não há um caminho único a prometer quando
a forma depende do ramo que o valor tomou.

### `sizeOf<T>()` e `alignOf<T>()`

O tamanho e o alinhamento que um tipo declara, em bytes:

```ts
import type { Decimal, SignedInteger } from '@fulcro/types';

sizeOf<SignedInteger<32>>(); // 4
alignOf<SignedInteger<32>>(); // 4
sizeOf<Decimal>(); // 16
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

### `offsetOf<T>(field)` e `layoutOf<T>()`

Onde fica um campo de uma struct, e o layout inteiro de uma vez:

```ts
import { SinglePrecisionFloat, struct, type Struct } from '@fulcro/types';

const Vector3 = struct('Vector3', {
	x: SinglePrecisionFloat,
	y: SinglePrecisionFloat,
	z: SinglePrecisionFloat,
});
type Vector3 = Struct<typeof Vector3>;

offsetOf<Vector3>('y'); // 4
offsetOf<Vector3>('w'); // erro: não é um campo de Vector3

layoutOf<Vector3>();
// {
//   size: 12,
//   alignment: 4,
//   fields: {
//     x: { offset: 0, size: 4, alignment: 4 },
//     y: { offset: 4, size: 4, alignment: 4 },
//     z: { offset: 8, size: 4, alignment: 4 },
//   },
// }
```

Com o transformer, `offsetOf` é substituído pelo número e `layoutOf` por um
objeto literal congelado, igual ao `Vector3.layout` do próprio descritor da
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

## `constantOf` — calculado uma vez, enquanto o programa compila

Uma tabela de consulta, uma série pré-calculada, um conjunto de coeficientes:
valores que são os mesmos em toda execução, calculados em toda execução mesmo
assim.

```ts
import { constantOf } from '@fulcro/reflect';

export const CRC_TABLE = constantOf(() =>
	Array.from({ length: 256 }, (_, byte) => {
		let crc = byte;

		for (let bit = 0; bit < 8; bit++) {
			crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
		}

		return crc >>> 0;
	}),
);
// emitido: export const CRC_TABLE = Object.freeze([0, 1996959894, 3993919788, …]);
```

A chamada é TypeScript comum: o `tsc`, um editor e um linter a leem como uma
chamada, e nada no arquivo precisa de plugin para ser entendido. Com o
transformer, a função roda **enquanto o programa compila**, e a chamada é
substituída pelo que ela devolveu, congelado em todos os níveis. Sem ele, a
chamada roda a função em runtime e congela o resultado do mesmo jeito — a
resposta é a mesma, só é paga mais tarde.

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
FULCRO4010: constantOf(…) cannot be evaluated at compile time: 'counter' is declared with let or var, so it can change. …
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

O `as` do TypeScript é uma **afirmação, não uma checagem**. `payload as Order`
compila seja lá o que `payload` for, e o erro aparece depois, em outro lugar,
como uma propriedade de `undefined`.

Estes dois fazem a checagem que a linguagem não faz: o transformer lê o tipo
enquanto o compilador ainda o tem e escreve o teste — toda propriedade, objetos
aninhados, todo elemento de um array.

```ts
if (is<Order>(payload)) {
	payload.total; // estreitado, e verificado de fato
}

const order = as<Order>(await response.json());
```

`is` é um **type guard**, para quando uma falha deve desviar o programa. `as`
devolve o valor — o mesmo objeto, não uma cópia — e lança quando ele não bate,
para quando uma falha deve pará-lo.

### A mensagem diz onde falhou

```text
TypeError: FULCRO4007: as<Order>() refused a value: customer.email: expected string, got number
TypeError: FULCRO4007: as<Order>() refused a value: items[3].quantity: expected number, got undefined
```

Ouvindo só _"não é um Order"_ sobre um registro de quarenta campos, você não
estaria melhor do que antes de a checagem existir. Então o transformer emite um
segundo percorredor ao lado da checagem rápida, só para responder **onde**. Ele
só roda depois que a checagem já recusou, então um valor que passa nunca paga
por ele — e só o `as` ganha um, já que um desvio precisa de sim ou não.

Onde um tipo é mais do que o percorredor consegue descrever com precisão — uma
interseção, uma tupla, uma união de formas de objeto — ele nomeia o tipo
esperado naquele caminho em vez de chutar um campo. Vago é melhor que errado: um
caminho é uma promessa sobre onde o problema está, e inventar um manda alguém
para o campo errado.

### O que pode ser checado

O mesmo conjunto que as sequências checam, porque é o mesmo gerador:
primitivos, literais, uniões, interseções, objetos e interfaces aninhados em
qualquer profundidade, propriedades opcionais, arrays, tuplas de tamanho fixo,
classes, as classes embutidas por `instanceof`, e tipos que contêm a si mesmos.
Propriedades a mais são aceitas, porque a tipagem estrutural as aceita.

Recusados, e de forma visível: assinaturas de índice e genéricos não
resolvidos. Para esses, escreva o teste e passe-o:

```ts
is<Settings>(value, {
	name: 'Settings',
	matches: (v) => looksLikeSettings(v),
});
```

### Os dois precisam do transformer

Sem ele a chamada recusa em vez de chutar. Uma checagem que responde `true` para
a coisa errada é pior do que nenhuma checagem — é falsa confiança exatamente na
fronteira onde os dados são menos confiáveis.

## O transformer não é opcional

Estes utilitários têm o nome do que leem, e o que leem é o _tipo_ — que só
existe enquanto o compilador roda. Sem o transformer o pacote ainda carrega e
ainda responde, mas responde a partir do valor:

|                            | Sem                                       | Com o transformer                          |
| -------------------------- | ----------------------------------------- | ------------------------------------------ |
| `nameOf(() => user.email)` | `'email'` — analisado a partir da closure | `'email'` — emitido como literal           |
| `nameOf<UserContract>()`   | não disponível                            | `'UserContract'`                           |
| `typeOf(v).declared`       | `null`                                    | o tipo declarado e onde ele está no código |
| `defaultOf<T>()`           | **lança**                                 | o valor construído, emitido no lugar       |
| `constantOf(() => …)`      | a função roda, em runtime                 | o resultado, calculado ao compilar         |

Dois desses se degradam **em silêncio**, o que vale saber antes de encontrar: um
minificador renomeia variáveis locais, então `nameOf(() => email)` pode informar
um nome embaralhado num build empacotado, e `typeOf(…).declared` simplesmente
lê `null`. Só `defaultOf` falha de forma visível — de propósito, porque um
padrão que ele não consegue calcular seria uma mentira.

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
		"plugins": [
			{ "transform": "@fulcro/reflect/transformer", "type": "program" },
		],
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

### Só TypeScript 5, até o 7 exclusive

O 7.x é o port nativo, e o pacote dele não expõe mais a API do compilador sobre
a qual isto é construído. A faixa de peer diz isso, em vez de deixar uma
instalação dar certo e acabar num transformer que não consegue iniciar. O
`@fulcro/reflect` em si não é afetado e roda em qualquer lugar, no seu
comportamento de fallback.

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
