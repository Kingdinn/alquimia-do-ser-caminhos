import assert from "node:assert/strict";
import {after, test} from "node:test";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import ts from "typescript";
import React from "react";
import {act, create} from "react-test-renderer";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const folder = await mkdtemp(path.join(app, ".support-dialog-tests-"));
after(() => rm(folder, {recursive: true, force: true}));
const source = (await readFile(path.join(app, "components/support-project-dialog.tsx"), "utf8"))
  .replaceAll('from "@/lib/i18n"', 'from "./dependencies.mjs"')
  .replaceAll('from "@/components/ui/button"', 'from "./dependencies.mjs"')
  .replaceAll('from "@/components/ui/dialog"', 'from "./dependencies.mjs"')
  .replace('import styles from "./support-project-dialog.module.css";', 'const styles = {};');
await writeFile(path.join(folder, "dependencies.mjs"), `
import React from "react";
export function useI18n(){return {t:key=>key};}
export function Button({asChild,children,variant,size,...props}){return asChild?React.cloneElement(React.Children.only(children),props):React.createElement("button",props,children);}
export function Dialog({children,...props}){return React.createElement("dialog",props,children);}
export function DialogContent({children,...props}){return React.createElement("article",props,children);}
export function DialogClose({children}){return children;}
export function DialogHeader({children}){return React.createElement("header",null,children);}
export function DialogTitle({children}){return React.createElement("h2",null,children);}
export function DialogDescription({children}){return React.createElement("p",null,children);}
`);
await writeFile(path.join(folder, "component.mjs"), ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX}}).outputText);
const {default: SupportDialog} = await import(pathToFileURL(path.join(folder, "component.mjs")).href);
const text = node => typeof node === "string" ? node : node?.children?.map(text).join("") ?? "";
const deferred = () => {let resolve, reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
async function withDialog(config, clipboard, run) {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  Object.defineProperty(globalThis, "navigator", {value: {clipboard}, configurable: true});
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let root, selected=0, focused=0, open=true;
  const onCloseAutoFocus=()=>{};
  const render=()=>React.createElement(SupportDialog,{config,open,onOpenChange:next=>{open=next;root.update(render());},onCloseAutoFocus});
  try {
    await act(async()=>{root=create(render(),{createNodeMock:element=>element.type==="textarea"?{focus:()=>focused++,select:()=>selected++}:null});});
    await run({root,get selected(){return selected;},get focused(){return focused;},get text(){return text(root.toJSON());},
      click:()=>root.root.findAllByType("button").find(button=>text(button).includes("Copiar código Pix")).props.onClick(),
      toggle:next=>root.root.findByType("dialog").props.onOpenChange(next),onCloseAutoFocus});
  } finally {
    if(root)await act(async()=>root.unmount());
    if(originalNavigator)Object.defineProperty(globalThis,"navigator",originalNavigator);else delete globalThis.navigator;
    globalThis.IS_REACT_ACT_ENVIRONMENT=originalAct;
  }
}

test("only configured methods render and the external link leaves the notebook open", async()=>{
  await withDialog({pixCode:null,internationalUrl:null},null,async h=>assert.equal(h.root.toJSON(),null));
  await withDialog({pixCode:null,internationalUrl:"https://ko-fi.com/synthetic-test"},null,async h=>{
    assert.equal(h.root.root.findAllByType("textarea").length,0);
    const link=h.root.root.findByType("a");assert.equal(link.props.target,"_blank");assert.equal(link.props.rel,"noopener noreferrer");
    assert.equal(h.root.root.findByType("article").props.onCloseAutoFocus,h.onCloseAutoFocus);
    assert.match(h.text,/gratuito.*voluntário/);
  });
});

test("Pix copy uses the exact configured code and reports success only after clipboard resolves",async()=>{
  const pending=deferred(),copied=[];
  await withDialog({pixCode:"synthetic-pix-code",internationalUrl:null},{writeText:value=>{copied.push(value);return pending.promise;}},async h=>{
    assert.equal(h.root.root.findByType("textarea").props.readOnly,true);
    await act(async()=>h.click());
    assert.deepEqual(copied,["synthetic-pix-code"]);assert.doesNotMatch(h.text,/Código Pix copiado\./);
    await act(async()=>pending.resolve());assert.match(h.text,/Código Pix copiado\./);
    assert.equal(h.root.root.findAllByType("a").length,0);
  });
});

test("clipboard rejection keeps the code selectable and offers manual copying",async()=>{
  await withDialog({pixCode:"synthetic-pix-code",internationalUrl:null},{writeText:async()=>{throw Error("denied");}},async h=>{
    await act(async()=>h.click());
    assert.match(h.text,/Selecione o código e copie manualmente/);assert.doesNotMatch(h.text,/Código Pix copiado\./);
    assert.equal(h.selected,1);assert.equal(h.focused,1);
  });
});

test("late clipboard completion cannot show a stale confirmation after closing and reopening",async()=>{
  const pending=deferred();
  await withDialog({pixCode:"synthetic-pix-code",internationalUrl:null},{writeText:()=>pending.promise},async h=>{
    await act(async()=>h.click());await act(async()=>h.toggle(false));await act(async()=>h.toggle(true));
    await act(async()=>pending.resolve());assert.doesNotMatch(h.text,/Código Pix copiado\./);
  });
});
