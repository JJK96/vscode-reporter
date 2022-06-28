// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

function get_dir(p: string) {
	let dir = p
	if (!fs.statSync(p).isDirectory()) {
		dir = path.dirname(p)
	}
	return dir
}

async function getValuePrompt(choices: Array<string>) {
    return new Promise((resolve) => {
        const quickPick = vscode.window.createQuickPick();
        quickPick.items = choices.map(choice => ({ label: choice }));

        quickPick.onDidChangeValue(() => {
            // INJECT user values into proposed values
            if (!choices.includes(quickPick.value)) quickPick.items = [quickPick.value, ...choices].map(label => ({ label }))
        })

        quickPick.onDidAccept(() => {
            const selection = quickPick.activeItems[0]
            resolve(selection.label)
            quickPick.hide()
        })
        quickPick.show();
    })
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vscode-reporter" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let create_standard_issue = vscode.commands.registerCommand('vscode-reporter.create_standard_issue', async (file) => {
		let standard_issues = cp.execSync("reporter standard-issues").toString().split("\n")
		let standard_issue = await vscode.window.showQuickPick(standard_issues)
		if (!standard_issue) return;
		let command = `reporter create-issue -n -s "${standard_issue}"`
		if (file) {
			let dir = get_dir(file.path)
			command = `cd "${dir}"; ${command}`
		}
		cp.exec(command)
	});	

	context.subscriptions.push(create_standard_issue);

	let create_evidence = vscode.commands.registerCommand('vscode-reporter.create_evidence', async (file) => {
		if (!file) return;
		let dir = get_dir(file.path)
		let locations = cp.execSync(`cd "${dir}"; reporter locations`).toString().split("\n")
		let location = await getValuePrompt(locations)
		let command = `cd "${dir}"; reporter create-evidence -l "${location}"`
		cp.exec(command)
	})
	context.subscriptions.push(create_evidence);
}

// this method is called when your extension is deactivated
export function deactivate() {}
