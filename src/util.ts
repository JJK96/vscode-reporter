import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as cp from 'child_process';

export function get_dir(p: string) {
	let dir = p
	if (!fs.statSync(p).isDirectory()) {
		dir = path.dirname(p)
	}
	return dir
}

export function get_root(file: string | undefined) {
    if (!file) {
        let editor = vscode.window.activeTextEditor;
        if (!editor) return;

        file = editor.document.uri.fsPath;
    }
	let root = cp.execSync(`cd "${get_dir(file)}"; reporter find-root`).toString().trim()
    return root
}
