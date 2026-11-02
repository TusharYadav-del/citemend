import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";

let bundle = "";
const html = '<section aria-label="Citation Capsule"><p>A factual test capsule for evaluating verified product information.</p></section>';
const schema = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage"}</script>';
const capsule = (pro: boolean) => ({whyCompetitorWon:"Clear headings may improve passage retrieval. Structure does not prove the cause of a citation.",tldrHtmlBlock:html,jsonLdSchema:pro?schema:null,exportToken:"encrypted-token",canCopyJsonLd:pro,warning:"Review every claim before publishing.",model:"controlled-browser-fixture"});

test.beforeAll(async () => {
  const result=await build({stdin:{contents:'import React from "react"; import {createRoot} from "react-dom/client"; import Capsule from "./components/CitationCapsuleModal"; createRoot(document.getElementById("root")).render(<Capsule domain="example.com" buyerPrompt="Compare pricing" competitorUrl="https://competitor.test/pricing" />);',resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",alias:{"@":path.resolve(process.cwd())},define:{"process.env.NODE_ENV":'"production"'},plugins:[{name:"isolated-ui-context",setup(build){build.onResolve({filter:/^(@clerk\/nextjs|next\/navigation)$/},args=>({path:args.path,namespace:"fixture"}));build.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:args.path==="next/navigation"?'export const useRouter=()=>({refresh(){}});':'export const useUser=()=>({isSignedIn:true,isLoaded:true}); export const SignInButton=({children})=>children;',loader:"js"}));}}]});
  bundle=result.outputFiles[0].text;
});
async function mount(page: Page, pro: boolean, fail = false, exportStatus = pro ? 200 : 403) {
  await page.addInitScript(() => { Object.defineProperty(navigator,"clipboard",{value:{writeText:async (value:string)=>{(window as unknown as {copied:string}).copied=value;}}}); });
  await page.route("http://capsule.test/**",async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/bundle.js") return route.fulfill({contentType:"application/javascript",body:bundle});
    if(url.pathname==="/api/capsule") {
      const data=route.request().postDataJSON();
      if(data.action==="export-jsonld") return route.fulfill({status:exportStatus,contentType:"application/json",body:JSON.stringify(exportStatus===200?{jsonLdSchema:schema}:{error:"Access required",code:exportStatus===401?"SIGN_IN_REQUIRED":"PRO_REQUIRED"})});
      return route.fulfill({status:fail?502:200,contentType:"application/json",body:JSON.stringify(fail?{error:"Provider temporarily unavailable"}:capsule(pro))});
    }
    if(url.pathname.startsWith("/api/")) return route.fulfill({contentType:"application/json",body:JSON.stringify(url.pathname.includes("checkout")?{mode:"beta"}:{state:"free"})});
    return route.fulfill({contentType:"text/html",body:'<!doctype html><style>*{box-sizing:border-box}body{margin:0;font:16px system-ui}button{padding:10px} [data-slot="dialog-content"]{position:fixed;inset:5vh 5vw;max-height:90vh;overflow:auto;background:white;padding:24px}textarea,iframe{max-width:100%;width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><div id="root"></div><script src="/bundle.js"></script>'});
  });
  await page.goto("http://capsule.test/");
  await page.getByRole("button",{name:/Win This Citation/}).click();
}

test("capsule dialog previews HTML, switches tabs, copies both formats, and closes with Escape",async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await mount(page,true);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Possible citation advantages")).toBeVisible();
  await expect(page.frameLocator('iframe[title="Citation Capsule live preview"]').getByText("A factual test capsule",{exact:false})).toBeVisible();
  await page.getByRole("button",{name:"Copy HTML",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {copied:string}).copied)).toBe(html);
  await page.getByRole("tab",{name:"JSON-LD Schema Markup"}).click();
  await expect(page.getByLabel("JSON-LD code")).toContainText("FAQPage");
  await page.getByRole("button",{name:"Copy JSON-LD",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {copied:string}).copied)).toBe(schema);
  await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("free accounts receive no schema and JSON-LD copy opens the existing upgrade dialog",async({page})=>{
  await mount(page,false);
  await page.getByRole("tab",{name:"JSON-LD Schema Markup"}).click();
  await expect(page.getByText("Pro unlocks your JSON-LD schema")).toBeVisible();
  await expect(page.getByLabel("JSON-LD code")).toHaveCount(0);
  await page.getByRole("button",{name:/Copy JSON-LD/}).click();
  await expect(page.getByRole("heading",{name:"Upgrade to Pro",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as unknown as {copied?:string}).copied)).toBeUndefined();
});

test("generation errors expose a retry and mobile dialog content remains within the viewport",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await mount(page,false,true);
  await expect(page.getByRole("alert")).toContainText("Provider temporarily unavailable");
  await expect(page.getByRole("button",{name:"Try again"})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});


test("an expired session requires sign-in before copying JSON-LD",async({page})=>{
  await mount(page,true,false,401);
  await page.getByRole("tab",{name:"JSON-LD Schema Markup"}).click();
  await page.getByRole("button",{name:"Copy JSON-LD",exact:true}).click();
  await expect(page.getByRole("button",{name:"Sign in to upgrade",exact:true})).toBeVisible();
});

test("clipboard failure gives actionable feedback rather than a success message",async({page})=>{
  await mount(page,true);
  await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw new Error("Denied");};});
  await page.getByRole("button",{name:"Copy HTML",exact:true}).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("Clipboard access is unavailable");
});
