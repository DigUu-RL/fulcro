# Fluxo de controle: `switchFor`, `tryCatch`, `Result`, `Option` e `equals`

🇺🇸 English: [Read this documentation in English](../functions.md)

Funções que transformam instruções em expressões, dois tipos que transformam
falha e ausência em valores, e uma comparação de dois valores pelo que eles
guardam. Sem dependências, sem envolvimento do compilador, nada a configurar.

```sh
npm install @fulcro/functions
```

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
enum Status {
	Draft,
	Published,
	Archived,
}

const label = switchFor(status, {
	[Status.Draft]: () => 'draft',
	[Status.Published]: () => 'published',
	[Status.Archived]: () => 'archived',
});
```

Deixe um de fora e não compila:

```text
error TS2345: Property '[Status.Archived]' is missing in type
'{ 0: () => string; 1: () => string; }' but required in type
'ExhaustiveCases<Status, string>'.
```

**Esse erro é o objetivo inteiro.** Acrescente um membro ao enum daqui a seis
meses e todo `switchFor` sobre ele deixa de compilar até o caso novo ser tratado
— que é o momento de decidir o que ele deve fazer, em vez de descobrir em
produção. Um `switch` nativo não diz nada; simplesmente passa direto.

Não há, de propósito, **nenhum fallback** nesta forma. Um fallback é
exatamente o que absorveria o membro novo em silêncio e levaria a garantia
embora.

Cada ramo recebe o único membro que trata, já estreitado:

```ts
switchFor(status, {
	[Status.Draft]: (value) => {
		const draft: Status.Draft = value; // não Status
		return render(draft);
	},
	// …
});
```

Funciona com enums numéricos, enums de string e uniões de literais de string ou
de número:

```ts
const icon = switchFor(theme, {
	dark: () => '🌙',
	light: () => '☀️',
});
```

Um membro cujo valor é `0` é despachado como qualquer outro — o ramo é
encontrado pela chave, nunca testando se o valor é verdadeiro.

### Executando pelos efeitos

Não há uma função separada que retorne `void`, e nenhuma é necessária:

```ts
switchFor(status, {
	[Status.Draft]: () => saveDraft(),
	[Status.Published]: () => publish(),
	[Status.Archived]: () => archive(),
});
```

A verificação de exaustividade vale aqui exatamente como vale para uma chamada
cujo resultado é lido.

### A forma por predicado — todo o resto

Onde os ramos são condições, e não valores:

```ts
const size = switchFor(
	order,
	[
		{ when: (o) => o.total > 1000, then: () => 'large' },
		{ when: (o) => o.items.length === 0, then: () => 'empty' },
	],
	() => 'standard',
);
```

Os ramos são testados em ordem, o primeiro que casa vence, e os demais nunca são
avaliados — nem as condições, nem os corpos.

`otherwise` é opcional, e deixá-lo de fora aparece no tipo em vez de ficar
escondido:

```ts
const a = switchFor(n, cases); // string | undefined
const b = switchFor(n, cases, () => 'fallback'); // string
```

Esta forma **não pode** ser exaustiva. Uma condição é uma função arbitrária, e o
compilador não consegue raciocinar sobre quais valores ela aceita — é por isso
que ela aceita um fallback e a forma exaustiva não.

### Por que se dar ao trabalho

Porque a alternativa é um ternário aninhado ou um `let` mutável:

```ts
// O que ele substitui.
let label: string;

switch (status) {
	case Status.Draft:
		label = 'draft';
		break;
	// …esqueça um caso e nada reclama
}
```

Um `switch` nativo é uma instrução, então não pode inicializar uma `const`, não
pode ser o corpo de uma arrow function e não pode ficar dentro de um objeto
literal ou de um atributo JSX. `switchFor` pode.

## `Result`

O resultado de uma operação, como valor: ou um **sucesso**, com o valor que ela
produziu, ou uma **falha**, com o erro com que ela falhou.

```ts
const parsed: Result<number, string> = Number.isNaN(n) ? failure('not a number') : success(n);
```

|           | `value` | `error`          |
| --------- | ------- | ---------------- |
| `Success` | `T`     | `null`           |
| `Failure` | `null`  | `NonNullable<E>` |

### Trate as duas variantes com `handle`

```ts
const message = parsed.handle({
	success: (value) => `got ${value}`,
	failure: (error) => `failed: ${error}`,
});
```

Os dois ramos são obrigatórios, e **deixar um de fora não compila**:

```text
Property 'failure' is missing in type '{ success: (value: number) => string; }'
but required in type 'ResultCases<number, string, unknown>'.
```

Só o ramo da variante em questão é executado. Nomear um terceiro ramo também não
compila.

### Ou estreite antes

```ts
if (parsed.isSuccess()) {
	parsed.value; // number, não number | null
}

if (parsed.isFailure()) {
	parsed.error; // string
}
```

`error === null` estreita do mesmo jeito, e é a verificação a usar num resultado
que foi copiado — por `structuredClone`, através de um worker ou por JSON. A
cópia mantém os dados do resultado, mas não os métodos que ele herda.

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
const result = await tryCatch(() => fetch(url));

if (result.isFailure()) return fallback;

use(result.value);
```

### Prefira a forma com callback

```ts
await tryCatch(() => risky()); // ✓ captura tudo
await tryCatch(risky()); // ✗ perde um throw síncrono
```

Na segunda forma, `risky` roda **antes** de `tryCatch`, então qualquer coisa que
ela lance no caminho até produzir uma promise escapa por completo. A forma com
callback move essa chamada para dentro do `try`, que é o único jeito de cobrir
tanto a falha síncrona quanto a assíncrona de uma mesma operação.

A forma com promise continua aceita, e lê melhor quando a promise já está em
mãos.

### `E` tem `unknown` como padrão, não `Error`

JavaScript permite lançar qualquer valor. Tipar o erro como `Error` seria uma
promessa que a função não consegue cumprir — `result.error.message` leria
`undefined` sempre que algo lançasse uma string. Então estreite no ponto de uso,
ou informe o tipo quando você controla todos os pontos que lançam:

```ts
const result = await tryCatch<User, ApiError>(() => api.load(id));
```

Um `null` ou `undefined` lançado — válido, por mais patológico que seja — é
envolvido num `Error` que carrega o original como `cause`
([`FULCRO2001`](./errors/FULCRO2xxx.md#fulcro2001)), porque guardá-lo como veio
tornaria a falha indistinguível de um sucesso.

### Onde você realmente usa

```ts
// Várias coisas independentes, em que uma falhar não deve parar as outras.
const [user, orders, settings] = await Promise.all([
	tryCatch(() => loadUser(id)),
	tryCatch(() => loadOrders(id)),
	tryCatch(() => loadSettings(id)),
]);

render({
	user: user.value,
	orders: orders.handle({ success: (list) => list, failure: () => [] }),
});
```

```ts
// Uma fronteira em que um throw seria pior do que um valor.
const parsed = await tryCatch(async () => JSON.parse(body));

if (parsed.isFailure()) return reply.status(400).send('bad json');
```

### Coletando falhas ao longo de um lote

Ele se compõe com os outros pacotes em vez de precisar de um modo próprio:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';
import { SequenceCollection } from '@fulcro/collections';
import { tryCatch } from '@fulcro/functions';

const outcomes = await AsyncSequenceCollection.from(ids)
	.selectAwait((id) => tryCatch(() => loadUser(id)), { concurrency: 8 })
	.toArray();

const [loaded, failed] = SequenceCollection.from(outcomes).partition((outcome) =>
	outcome.isSuccess(),
);
```

Todo elemento é tentado, nada para antes da hora, e você recebe as duas metades.

`tryCatch` sempre devolve uma promise, inclusive para uma operação totalmente
síncrona.

## `Option`

Um valor que pode estar ausente, como um valor próprio em vez de `null`: ou
**algum** valor (`some`), ou **nenhum** (`none`).

```ts
const port: Option<number> = some(8080);
const nothing: Option<number> = none();
```

A maioria das options vem de um valor que pode ser `null` ou `undefined`, e
`optionOf` converte um no outro:

```ts
const user: Option<User> = optionOf(users.get(id));
```

Só `null` e `undefined` são ausentes. `0`, `''` e `false` são presentes — cada um
é um valor que alguém quis dizer.

### Trate um valor presente e um ausente com `handle`

```ts
const greeting = user.handle({
	some: (found) => `Hello, ${found.name}`,
	none: () => 'Hello, stranger',
});
```

Como no `Result`, os dois ramos são obrigatórios e deixar um de fora não
compila. Só o ramo da variante em questão é executado.

### Ou estreite para o valor presente

```ts
if (user.isSome()) {
	user.value; // User, não User | null
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
equals({ id: 1, tags: ['a'] }, { id: 1, tags: ['a'] }); // true
equals([1, 2, 3], [1, 3, 2]); // false
```

`right` recebe o tipo de `left`, então dois valores que nunca poderiam ser
iguais não compilam: `equals(1, 'one')` é recusado.

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
const sameShape = createEquals([Wide, Tall]); // Matrix(DoublePrecisionFloat, 2, 3) e (…, 3, 2)

equals(wide, tall); // true: os mesmos seis números
sameShape(wide, tall); // false: cada uma é reconhecida pelo próprio descritor
```

Uma struct passada como regra nunca é igual a um objeto comum que só tem os
mesmos campos, e cada campo dela é comparado como o próprio tipo compara.

### Suas próprias regras: `createEquals`

`createEquals` cria uma variante de `equals` que compara alguns tipos de valor
por regras suas. Uma regra reconhece seus valores com `is` e compara dois deles
com `equals`:

```ts
const byId: EqualityRule<User> = {
	is: (value): value is User => value instanceof User,
	equals: (left, right) => left.id === right.id,
};

const sameUsers = createEquals([byId]);

sameUsers([alice], [aliceRenamed]); // true: os arrays como `equals` compara, os usuários pelo id
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
const byLabel: EqualityRule<Tree> = {
	is: (value): value is Tree => value instanceof Tree,
	equals: (left, right, nested) => {
		return left.label === right.label && nested(left.children, right.children);
	},
};
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
