import typescript from 'typescript';

import { type ExpressionRewriter } from '@/rewrite/file';
import { type ProgramRewrite, rewriteToFixpoint } from '@/rewrite/fixpoint';
import { type RewrittenText } from '@/rewrite/text';

/**
 * The editor integration of a rewrite that has to happen before type checking.
 *
 * An editor asks `tsserver`, and `tsserver` checks the files as written: it has
 * never heard of the rewrite, so it underlines `decimal * decimal` and reports
 * `a + b` as a `number` even in a project that builds cleanly. A language
 * service plugin is the one place to change that.
 *
 * The plugin keeps a second language service — the shadow — over the same
 * project with every file rewritten, and answers the questions that depend on
 * types from it: the diagnostics, the hover, the completions, where a name is
 * defined, the signature being typed. Each position the editor sends is mapped
 * into the rewritten text before it is asked, and each span in the answer is
 * mapped back, so the editor never sees text it did not write. Everything else
 * — formatting, folding, the syntax — is the original service's, untouched.
 *
 * ```json
 * { "compilerOptions": { "plugins": [{ "name": "@fulcro/types/language-service" }] } }
 * ```
 */

/** What `tsserver` hands a plugin's `create`. */
export interface PluginCreateInfo {
	readonly languageService: typescript.LanguageService;
	readonly languageServiceHost: typescript.LanguageServiceHost;
}

/** The module shape `tsserver` loads a plugin from. */
export type LanguageServicePlugin = (modules: {
	readonly typescript: typeof typescript;
}) => {
	readonly create: (info: PluginCreateInfo) => typescript.LanguageService;
};

/**
 * A file name as the program spells it: forward slashes on every platform.
 * `tsserver` and a host may hand either spelling over, and a map keyed by one
 * would never be found by the other.
 *
 * @param fileName File name in either spelling.
 * @returns The program's spelling.
 */
const normalized = (fileName: string): string => fileName.replace(/\\/g, '/');

/** The map of a file the rewrite did not touch: every offset is itself. */
const UNCHANGED: RewrittenText = {
	text: '',
	toOriginal: (generated) => generated,
	toGenerated: (original) => original,
};

/**
 * Maps a span of the rewritten text back to the original.
 *
 * @param span Span in the rewritten text.
 * @param map Map of the file.
 * @returns The span in the original text.
 */
const spanToOriginal = (
	span: typescript.TextSpan,
	map: RewrittenText,
): typescript.TextSpan => {
	const start: number = map.toOriginal(span.start);

	if (span.length === 0) return { start, length: 0 };

	// The end is exclusive, so it can sit exactly where a copied piece stops
	// and synthesized text begins, and would map to the start of the rewritten
	// node. The last character of the span is inside the span; mapping it and
	// stepping one past lands where the span really ends.
	const end: number = map.toOriginal(span.start + span.length - 1) + 1;

	return { start, length: Math.max(0, end - start) };
};

/**
 * Removes the namespace the rewrite imports from text shown to the reader.
 *
 * The checker names a type by the shortest path it can reach it through, and
 * in a rewritten file that is often the namespace import the rewrite added —
 * `__fulcroTypes.SignedInteger<32>`, a name the author never wrote.
 *
 * @param namespace Local name of the import.
 * @returns The cleaner.
 */
const withoutNamespace =
	(namespace: string) =>
	(text: string): string =>
		text.split(`${namespace}.`).join('');

/**
 * Builds the shadow of a language service: the same project, every file read
 * through the rewrite.
 *
 * @param info What `tsserver` handed the plugin.
 * @param rewriter What to rewrite.
 * @returns The shadow, and the rewrite it is currently built on.
 */
const createShadow = (
	info: PluginCreateInfo,
	rewriter: ExpressionRewriter,
): {
	readonly service: typescript.LanguageService;
	readonly rewrite: () => ProgramRewrite;
} => {
	const base: typescript.LanguageServiceHost = info.languageServiceHost;
	const texts = new Map<string, string>();

	// Bumped on every text handed back, so the shadow re-reads exactly the
	// files the rewrite changed.
	let generation = 0;

	const host: typescript.LanguageServiceHost = Object.create(base, {
		getScriptSnapshot: {
			value: (fileName: string) => {
				const text: string | undefined = texts.get(normalized(fileName));

				return text === undefined
					? base.getScriptSnapshot(fileName)
					: typescript.ScriptSnapshot.fromString(text);
			},
		},
		getScriptVersion: {
			value: (fileName: string) =>
				texts.has(normalized(fileName))
					? `${base.getScriptVersion(fileName)}:rewritten:${generation}`
					: base.getScriptVersion(fileName),
		},
		getProjectVersion: {
			value: () => `${base.getProjectVersion?.() ?? ''}:${generation}`,
		},
	});

	const service: typescript.LanguageService = typescript.createLanguageService(
		host,
		typescript.createDocumentRegistry(),
	);

	let settledFor: string | undefined;
	let current: ProgramRewrite | undefined;

	/**
	 * The rewrite for the project as it stands, recomputed only when the
	 * original project changed.
	 *
	 * @returns The rewrite.
	 */
	const rewrite = (): ProgramRewrite => {
		const version: string =
			base.getProjectVersion?.() ??
			base
				.getScriptFileNames()
				.map((fileName) => base.getScriptVersion(fileName))
				.join('|');

		if (current !== undefined && settledFor === version) return current;

		texts.clear();
		generation++;

		current = rewriteToFixpoint(
			{
				program: () => {
					const program: typescript.Program | undefined = service.getProgram();

					if (program === undefined) {
						throw new Error('The shadow language service produced no program.');
					}

					return program;
				},
				update: (fileName, text) => {
					texts.set(normalized(fileName), text);
					generation++;
				},
			},
			rewriter,
		);
		settledFor = version;

		return current;
	};

	return { service, rewrite };
};

/**
 * Builds the `tsserver` plugin of a rewriter.
 *
 * @param rewriter What to rewrite.
 * @returns The plugin module, as `tsserver` loads it.
 */
export const createLanguageServicePlugin =
	(rewriter: ExpressionRewriter): LanguageServicePlugin =>
	() => ({
		create: (info) => {
			const original: typescript.LanguageService = info.languageService;
			const shadow = createShadow(info, rewriter);

			/**
			 * The map of a file, when the rewrite touched it.
			 *
			 * @param fileName File being asked about.
			 * @returns Its map, or `undefined` when it reads as written.
			 */
			const mapOf = (fileName: string): RewrittenText | undefined =>
				shadow.rewrite().files.get(normalized(fileName));

			const clean = withoutNamespace(rewriter.namespace);

			/**
			 * Removes the rewrite's namespace from the parts of a display.
			 *
			 * @param parts Display parts, when there are any.
			 * @returns The same parts, cleaned.
			 */
			const cleanParts = (
				parts: typescript.SymbolDisplayPart[] | undefined,
			): typescript.SymbolDisplayPart[] | undefined =>
				// A display names the namespace as a part of its own, followed by
				// a `.` part; both go, and any text naming it inline is cleaned.
				parts
					?.filter(
						(part, index) =>
							!(
								part.text === rewriter.namespace &&
								parts[index + 1]?.text === '.'
							) &&
							!(
								part.text === '.' &&
								parts[index - 1]?.text === rewriter.namespace
							),
					)
					.map((part) => ({ ...part, text: clean(part.text) }));

			/**
			 * Removes the rewrite's namespace from a diagnostic message, however
			 * deeply it is chained.
			 *
			 * @param message The message.
			 * @returns The message, cleaned.
			 */
			const cleanMessage = (
				message: string | typescript.DiagnosticMessageChain,
			): string | typescript.DiagnosticMessageChain =>
				typeof message === 'string'
					? clean(message)
					: {
							...message,
							messageText: clean(message.messageText),
							next: message.next?.map(
								(next) =>
									cleanMessage(next) as typescript.DiagnosticMessageChain,
							),
						};

			/**
			 * Maps the diagnostics of one file back to its original text.
			 *
			 * @param fileName File the diagnostics are about.
			 * @param diagnostics Diagnostics from the shadow.
			 * @returns The same diagnostics, in the original's positions.
			 */
			const mapDiagnostics = <T extends typescript.Diagnostic>(
				fileName: string,
				diagnostics: readonly T[],
			): T[] => {
				const map: RewrittenText | undefined = mapOf(fileName);
				const sourceFile: typescript.SourceFile | undefined = original
					.getProgram()
					?.getSourceFile(fileName);

				return diagnostics.map((diagnostic) => {
					const messageText = cleanMessage(diagnostic.messageText);

					if (map === undefined || diagnostic.start === undefined) {
						return {
							...diagnostic,
							messageText,
							file: sourceFile ?? diagnostic.file,
						};
					}

					const span = spanToOriginal(
						{ start: diagnostic.start, length: diagnostic.length ?? 0 },
						map,
					);

					return {
						...diagnostic,
						messageText,
						file: sourceFile ?? diagnostic.file,
						start: span.start,
						length: span.length,
					};
				});
			};

			/**
			 * Maps a position into the shadow, asks it, and maps the answer back.
			 *
			 * @param fileName File asked about.
			 * @param position Position in the original text.
			 * @param ask The question, put to the shadow at the mapped position.
			 * @param fromShadow Maps what the shadow answered back.
			 * @returns The mapped answer.
			 */
			const atPosition = <T>(
				fileName: string,
				position: number,
				ask: (service: typescript.LanguageService, position: number) => T,
				fromShadow: (answer: T, map: RewrittenText) => T,
			): T => {
				// A file the rewrite left alone still gets its answer mapped: a
				// definition it points to may sit in a file that was rewritten.
				const map: RewrittenText = mapOf(fileName) ?? UNCHANGED;

				return fromShadow(ask(shadow.service, map.toGenerated(position)), map);
			};

			/**
			 * Maps a definition back when it points into a rewritten file.
			 *
			 * @param definition A definition or a reference.
			 * @returns The same, in original positions.
			 */
			const mapLocation = <
				T extends { fileName: string; textSpan: typescript.TextSpan },
			>(
				definition: T,
			): T => {
				const map: RewrittenText | undefined = mapOf(definition.fileName);

				return map === undefined
					? definition
					: {
							...definition,
							textSpan: spanToOriginal(definition.textSpan, map),
						};
			};

			const proxy: typescript.LanguageService = Object.create(original);

			// The rewrite is brought up to date before the shadow is asked, so the
			// shadow answers about the rewritten text and not the one before it.
			proxy.getSemanticDiagnostics = (fileName) => {
				shadow.rewrite();

				return mapDiagnostics(
					fileName,
					shadow.service.getSemanticDiagnostics(fileName),
				);
			};

			proxy.getSuggestionDiagnostics = (fileName) => {
				shadow.rewrite();

				return mapDiagnostics(
					fileName,
					shadow.service.getSuggestionDiagnostics(fileName),
				);
			};

			proxy.getQuickInfoAtPosition = (fileName, position, ...rest) =>
				atPosition(
					fileName,
					position,
					(service, at) =>
						service.getQuickInfoAtPosition(fileName, at, ...rest),
					(answer, map) =>
						answer === undefined
							? answer
							: {
									...answer,
									textSpan: spanToOriginal(answer.textSpan, map),
									displayParts: cleanParts(answer.displayParts),
									documentation: cleanParts(answer.documentation),
								},
				);

			proxy.getCompletionsAtPosition = (fileName, position, ...rest) =>
				atPosition(
					fileName,
					position,
					(service, at) =>
						service.getCompletionsAtPosition(fileName, at, ...rest),
					(answer, map) =>
						answer === undefined
							? answer
							: {
									...answer,
									optionalReplacementSpan:
										answer.optionalReplacementSpan === undefined
											? undefined
											: spanToOriginal(answer.optionalReplacementSpan, map),
									entries: answer.entries.map((entry) =>
										entry.replacementSpan === undefined
											? entry
											: {
													...entry,
													replacementSpan: spanToOriginal(
														entry.replacementSpan,
														map,
													),
												},
									),
								},
				);

			proxy.getCompletionEntryDetails = (fileName, position, ...rest) =>
				atPosition(
					fileName,
					position,
					(service, at) =>
						service.getCompletionEntryDetails(fileName, at, ...rest),
					(answer) =>
						answer === undefined
							? answer
							: {
									...answer,
									displayParts: cleanParts(answer.displayParts) ?? [],
								},
				);

			proxy.getSignatureHelpItems = (fileName, position, ...rest) =>
				atPosition(
					fileName,
					position,
					(service, at) => service.getSignatureHelpItems(fileName, at, ...rest),
					(answer, map) =>
						answer === undefined
							? answer
							: {
									...answer,
									applicableSpan: spanToOriginal(answer.applicableSpan, map),
								},
				);

			proxy.getDefinitionAtPosition = (fileName, position, ...rest) =>
				atPosition(
					fileName,
					position,
					(service, at) =>
						service.getDefinitionAtPosition(fileName, at, ...rest),
					(answer) => answer?.map(mapLocation),
				);

			proxy.getDefinitionAndBoundSpan = (fileName, position) =>
				atPosition(
					fileName,
					position,
					(service, at) => service.getDefinitionAndBoundSpan(fileName, at),
					(answer, map) =>
						answer === undefined
							? answer
							: {
									textSpan: spanToOriginal(answer.textSpan, map),
									definitions: answer.definitions?.map(mapLocation),
								},
				);

			proxy.getTypeDefinitionAtPosition = (fileName, position) =>
				atPosition(
					fileName,
					position,
					(service, at) => service.getTypeDefinitionAtPosition(fileName, at),
					(answer) => answer?.map(mapLocation),
				);

			return proxy;
		},
	});
