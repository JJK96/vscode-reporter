// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as process from 'process';
import {get_dir, get_root} from './util';
import {pasteImage} from './image_paste';
import path = require('path');
import { fstat } from 'fs';
import { stringify } from 'querystring';
const Cache:any = require('vscode-cache');

function shell_escape(str: string): string {
	return str.replace("'", "\\'")
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
	let cache = new Cache(context)
	let channel = vscode.window.createOutputChannel("vscode-reporter")

	function get_locations(filename: string) {
		// Using a single cache entry for all files. If this gives problems or unexpected behaviour it should be changed
		if (cache.has('locations')) return cache.get('locations')
		let locations = cp.execSync(`cd "${get_dir(filename)}"; reporter locations`).toString().split("\n")	
		cache.put('locations', locations, 5) //Expire after a minute
		return locations
	}

	function get_images(filename: string) {
		// Using a single cache entry for all files. If this gives problems or unexpected behaviour it should be changed
		let images = cp.execSync(`cd "${get_dir(filename)}"; reporter images`).toString().split("\n")	
		return images
	}
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vscode-reporter" is now active!');
	vscode.commands.executeCommand('setContext', 'vscode-reporter.active', true)

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let create_standard_issue = vscode.commands.registerCommand('vscode-reporter.create_standard_issue', async (file) => {
		let standard_issues = cp.execSync("reporter standard-issues").toString().split("\n")
		let standard_issue = await vscode.window.showQuickPick(standard_issues)
		if (!standard_issue) return;
		let command = `reporter create-standard-issue -n -s "${standard_issue}"`
		if (file) {
			let dir = get_dir(file.path)
			command = `cd '${dir}'; ${command}`
		}
		cp.exec(command)
	});	

	context.subscriptions.push(create_standard_issue);

	let create_issue = vscode.commands.registerCommand('vscode-reporter.create_issue', async (file) => {
		let title = await getValuePrompt([])
		if (!title) return;
		let command = `reporter create-issue -n '${title}'`
		if (file) {
			let dir = get_dir(file.path)
			command = `cd '${dir}'; ${command}`
		}
		cp.exec(command)
	});	

	context.subscriptions.push(create_issue);

	let create_evidence = vscode.commands.registerCommand('vscode-reporter.create_evidence', async (file) => {
		if (!file) return;
		let dir = get_dir(file.path)
		let locations = get_locations(file.path)
		let location = await getValuePrompt(locations)
		let command = `cd '${dir}'; reporter create-evidence '${location}'`
		cp.exec(command)
	})
	context.subscriptions.push(create_evidence);

	let paste_image_command = vscode.commands.registerCommand('vscode-reporter.paste_image', async (file) => {
		let root = get_root(file)
		let imageDir = path.join(root!, 'images')
		pasteImage(imageDir)
	})
	context.subscriptions.push(paste_image_command)

	let location_completer = vscode.languages.registerCompletionItemProvider('textile', {
		provideCompletionItems(document, position, token, context) {
			let range_before = new vscode.Range(position.translate(-1), position) 
			if (document.getText(range_before).startsWith('#[Location]#')) {
				let locations = get_locations(document.fileName)
				return locations.map((l:string) => new vscode.CompletionItem(l))
			} else if (document.getText(range_before).endsWith('\\image{')) {
				let images = get_images(document.fileName)
				return images.map((l:string) => new vscode.CompletionItem(l))
			}
		}
	})
	context.subscriptions.push(location_completer)
	
	//Run latex workshop build also when dradis/issue files are edited
	/*var latexWorkshop = vscode.extensions.getExtension( 'James-Yu.latex-workshop' );
	if (latexWorkshop) {
		process.env['LATEXWORKSHOP_CI'] = "true"
		latexWorkshop.activate().then((api) => {
			console.log(api)
			let extension = api.realExtension
			context.subscriptions.push(vscode.workspace.onDidSaveTextDocument( (e: vscode.TextDocument) => {
		        if (extension.lwfs.isVirtualUri(e.uri)){
		            return
		        }
		        if (e.languageId == 'textile') {
		            extension.logger.addLogMessage(`onDidSaveTextDocument triggered: ${e.uri.toString(true)}`)
		            extension.manager.updateCachedContent(e)
		            extension.linter.lintRootFileIfEnabled()
		            void extension.manager.buildOnSaveIfEnabled(e.fileName)
		            extension.counter.countOnSaveIfEnabled(e.fileName)
		        }
		    }))
		})
	}*/

	var pdfviewer = vscode.extensions.getExtension('tomoki1207.pdf');
	if (pdfviewer) {
		pdfviewer.activate().then((api) => {
			api.registerOnClickCallback((content: string) => {
				// Exit the function if the click is somewhere other than a text segment
				if (content.length > 100 || content.length == 0) return

				let uris = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath)
				if (uris == undefined) return
				let split_content = content.split(' ')
				let first_word = split_content[0]
				let cmd = `rg -. --no-ignore -g '!**/.cache/output' -n '${shell_escape(first_word)}'`
				for (const uri of uris) {
					cmd += ` '${shell_escape(uri)}'`
				}
				let search_query = split_content.slice(0, 5).join(' ')
				cmd += ` | fzf -f '${shell_escape(search_query)}' | head -n 1 | cut -d: -f-2`
				channel.appendLine(`Searching for: ${cmd}`)
				let result = cp.execSync(cmd).toString()
				channel.appendLine(`Result: ${result}`)
				// vscode.commands.executeCommand('workbench.action.quickOpen', result)
				let split = result.split(':')
				let uri = split[0]
				let line = split[1]
				vscode.workspace.openTextDocument(uri)
					.then(document => vscode.window.showTextDocument(document))
					.then(editor => {
		                let range = editor.document.lineAt(parseInt(line) - 1).range;
		                editor.selection =  new vscode.Selection(range.start, range.end);
		                editor.revealRange(range);			
					})
			})
		})
	}
	
}


// this method is called when your extension is deactivated
export function deactivate() {}
