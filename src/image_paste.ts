//Copied stuff from https://github.com/telesoho/vscode-markdown-paste-image
// Their license:
// MIT License
// 
// Copyright (c) 2017 WenHong.Tan
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
import * as path from "path";
import isWsl = require("is-wsl");
import * as os from "os";
import { spawn } from "child_process";
import * as vscode from 'vscode';
import * as cp from 'child_process';
type Platform = "darwin" | "win32" | "win10" | "linux" | "wsl";

function wslSafe(path: string) {
  if (getCurrentPlatform() != "wsl") return path;
  return cp.execSync(`touch ${path} && wslpath -m ${path}`).toString().trim();
}

/**
 * Run command and get stdout
 * @param shell
 * @param options
 */
function runCommand(
  shell: string,
  options: string[],
  timeout = 10000
): Promise<string> {
  return new Promise((resolve, reject) => {
    let errorTriggered = false;
    let output = "";
    let errorMessage = "";
    let process = spawn(shell, options, { timeout });

    process.stdout.on("data", (chunk) => {
      console.error(chunk);
      output += `${chunk}`;
    });

    process.stderr.on("data", (chunk) => {
      console.error(chunk);
      errorMessage += `${chunk}`;
    });

    process.on("exit", (code, signal) => {
      if (process.killed) {
        console.error("Process took too long and was killed");
      }

      if (!errorTriggered) {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(errorMessage);
        }
      }
    });

    process.on("error", (error) => {
      errorTriggered = true;
      reject(error);
    });
  });
}

const getCurrentPlatform = (): Platform => {
  const platform = process.platform;
  if (isWsl) {
    return "wsl";
  }
  if (platform === "win32") {
    const currentOS = os.release().split(".")[0];
    if (currentOS === "10") {
      return "win10";
    } else {
      return "win32";
    }
  } else if (platform === "darwin") {
    return "darwin";
  } else {
    return "linux";
  }
};

/**
* Run shell script.
* @param script
* @param parameters
* @param callback
*/
async function runScript(
    script: Record<Platform, string | null>,
    parameters: Array<string> = []
) {
let platform = getCurrentPlatform();
if (script[platform] == null) {
  console.error(`No scipt exists for ${platform}`);
  throw new Error(`No scipt exists for ${platform}`);
}
const scriptPath = path.join(
  __dirname,
  "../res/scripts/" + script[platform]
);
let shell = "";
let command = [];

switch (platform) {
  case "win32":
  case "win10":
  case "wsl":
    // Windows
    command = [
      "-noprofile",
      "-noninteractive",
      "-nologo",
      "-sta",
      "-executionpolicy",
      "bypass",
      "-windowstyle",
      "hidden",
      "-file",
      wslSafe(scriptPath),
    ].concat(parameters);
    shell =
      platform == "wsl"
        ? "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
        : "powershell";
    break;
  case "darwin":
    // Mac
    shell = "osascript";
    command = [scriptPath].concat(parameters);
    break;
  case "linux":
    // Linux
    shell = "sh";
    command = [scriptPath].concat(parameters);
    break;
}
console.log(shell, command)

const runer = runCommand(shell, command);

return runer.then((stdout) => stdout.trim());
}

async function saveClipboardImageToFileAndGetPath(imagePath: string) {
    if (!imagePath) return;

    const script = {
      win32: "win32_save_clipboard_png.ps1",
      darwin: "mac.applescript",
      linux: "linux_save_clipboard_png.sh",
      wsl: "win32_save_clipboard_png.ps1",
      win10: "win32_save_clipboard_png.ps1",
    };

    return runScript(script, [wslSafe(imagePath)]);
}

function insertImage(path: string) {
    let editor = vscode.window.activeTextEditor;
    if (!editor) return;

    let renderText: string;
    renderText = "\\image{"+path+"}";

    if (renderText) {
      editor.edit((edit) => {
        let current = editor!.selection;
        if (current.isEmpty) {
          edit.insert(current.start, renderText);
        } else {
          edit.replace(current, renderText);
        }
      });
    }
}

async function saveImage(imageDir: string, imgPath: string) {
    if (!imageDir) return;
    // save image and insert to current edit file
    const imagePath = await saveClipboardImageToFileAndGetPath(path.join(imageDir, imgPath));
    if (!imagePath) return;
    if (imagePath === "no image") {
      vscode.window.showInformationMessage(
        "There is not an image in the clipboard."
      );
      return;
    }

    insertImage(imgPath);
}

function getFileName() {
    let today = new Date();
    let date = today.getFullYear().toString()+(today.getMonth()+1).toString()+today.getDate().toString();
    let time = today.getHours().toString() + today.getMinutes().toString() + today.getSeconds().toString();
    let dateTime = date+'_'+time + ".png";
    return dateTime
}

/**
* Paste clipboard of image to file and render Markdown link for it.
* @returns
*/
export function pasteImage(imageDir: string) {
    let ext = ".png";
    let imagePath = getFileName();
    if (!imagePath) return;

    // TODO make config option
    let silence = vscode.workspace.getConfiguration('vscode-reporter').silent;

    if (silence) {
      saveImage(imageDir, imagePath);
    } else {
      let options: vscode.InputBoxOptions = {
        prompt:
          "You can change the filename. The existing file will be overwritten!.",
        value: imagePath,
        placeHolder: "(e.g:../test/myimage.png?100,60)",
        valueSelection: [
          imagePath.length - path.basename(imagePath).length,
          imagePath.length - ext.length,
        ],
      };
      vscode.window.showInputBox(options).then((inputVal) => {
        saveImage(imageDir, inputVal!);
      });
    }
}
