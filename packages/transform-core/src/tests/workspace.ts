import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * A throwaway directory tree on disk, for the suites that need real files:
 * a `package.json` is found by walking real directories, and a program
 * resolves imports against them.
 *
 * @param files Contents by path relative to the root, `/`-separated.
 * @returns The root, and a function removing the whole tree.
 */
export const createWorkspace = (
	files: Readonly<Record<string, string>>,
): { root: string; remove: () => void } => {
	const root: string = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), 'fulcro-transform-core-')),
	);

	for (const [relative, content] of Object.entries(files)) {
		const fileName: string = path.join(root, ...relative.split('/'));

		fs.mkdirSync(path.dirname(fileName), { recursive: true });
		fs.writeFileSync(fileName, content);
	}

	return {
		root,
		remove: (): void => {
			fs.rmSync(root, { recursive: true, force: true });
		},
	};
};
