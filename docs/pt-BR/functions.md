# Fluxo de controle como valores: `switchFor`, `tryCatch`, `Result` e `Option`

🇺🇸 English: [Read this documentation in English](../functions.md)

Funções que transformam instruções em expressões, e dois tipos que transformam
falha e ausência em valores. Sem dependências, sem envolvimento do compilador,
nada a configurar.

```sh
npm install @fulcro/functions
```

```ts
import {
	failure,
	none,
	optionOf,
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
const parsed: Result<number, string> = Number.isNaN(n)
	? failure('not a number')
	: success(n);
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

const [loaded, failed] = SequenceCollection.from(outcomes).partition(
	(outcome) => outcome.isSuccess(),
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

Tipos: `SwitchCase`, `ExhaustiveCases`, `Result`, `Success`, `Failure`,
`ResultCases`, `Option`, `Some`, `None`, `OptionCases`.
