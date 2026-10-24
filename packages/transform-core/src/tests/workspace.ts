import * as fileSystem from 'node:fs';
import * as operatingSystem from 'node:os';
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
	const root: string = fileSystem.realpathSync(
		fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'fulcro-transform-core-')),
	);

	for (const [relative, content] of Object.entries(files)) {
		const fileName: string = path.join(root, ...relative.split('/'));

		fileSystem.mkdirSync(path.dirname(fileName), { recursive: true });
		fileSystem.writeFileSync(fileName, content);
	}

	return {
		root,
		remove: (): void => {
			fileSystem.rmSync(root, { recursive: true, force: true });
		},
	};
};
