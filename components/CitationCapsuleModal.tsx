"use client";
import { useEffect, useRef, useState } from "react";
import { SignInButton } from "@clerk/nextjs";
import { Loader2, Copy, LockKeyhole, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import UpgradeModal from "@/components/upgrade-modal";
import type { CapsuleInput } from "@/lib/citation-capsule";

type CapsuleResult = {whyCompetitorWon: string; tldrHtmlBlock: string; jsonLdSchema: string | null; exportToken: string; canCopyJsonLd: boolean; warning: string; model: string};
const lockedPreview = '<script type="application/ld+json">\n{ "@context": "https://schema.org", "@graph": [\n  { "@type": "FAQPage", "mainEntity": [...] },\n  { "@type": "Product", "name": "Your offering" }\n]}\n</script>';
export default function CitationCapsuleModal(input: CapsuleInput) {
  const [open,setOpen] = useState(false), [pending,setPending] = useState(false), [copying,setCopying] = useState(false);
  const [result,setResult] = useState<CapsuleResult | null>(null), [error,setError] = useState("");
  const [needsSignIn,setNeedsSignIn] = useState(false), [upgrade,setUpgrade] = useState<"signed-in" | "signed-out" | null>(null), [message,setMessage] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(),[]);
  async function generate() {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    const timer = setTimeout(() => controller.abort(),95_000);
    setPending(true); setError(""); setNeedsSignIn(false); setMessage("");
    try {
      const response = await fetch("/api/capsule",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),signal:controller.signal});
      const data = await response.json();
      if (response.status === 401) {setNeedsSignIn(true); throw new Error("Sign in to generate a Citation Capsule.");}
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Capsule generation failed. Please retry.");
      if (typeof data.whyCompetitorWon !== "string" || typeof data.tldrHtmlBlock !== "string" || data.tldrHtmlBlock.length > 20_000 || typeof data.exportToken !== "string" || typeof data.canCopyJsonLd !== "boolean" || !(data.jsonLdSchema === null || typeof data.jsonLdSchema === "string") || typeof data.warning !== "string" || typeof data.model !== "string") throw new Error("The capsule response was incomplete. Please retry.");
      if (!controller.signal.aborted) setResult(data);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Capsule generation failed."); else if (active.current === controller) setError("Generation was cancelled or took too long. Please retry."); }
    finally {clearTimeout(timer); if (active.current === controller) {active.current=null;setPending(false);}}
  }
  async function copy(kind: "html" | "jsonld") {
    if (!result || copying) return;
    setCopying(true); setMessage("");
    try {
      let content = result.tldrHtmlBlock;
      if (kind === "jsonld") {
        const response = await fetch("/api/capsule",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"export-jsonld",exportToken:result.exportToken}),signal:AbortSignal.timeout(15_000)});
        const data = await response.json();
        if (response.status === 401 || response.status === 403) {setOpen(false); setUpgrade(response.status === 401 ? "signed-out" : "signed-in"); return;}
        if (!response.ok || typeof data.jsonLdSchema !== "string") throw new Error(data.error || "JSON-LD export is unavailable.");
        content = data.jsonLdSchema; setResult({...result,jsonLdSchema:content,canCopyJsonLd:true});
      }
      try {await navigator.clipboard.writeText(content);} catch {throw new Error("Clipboard access is unavailable. Allow clipboard access or select the code manually.");}
      const feedback = kind === "html" ? "HTML copied to clipboard." : "JSON-LD copied to clipboard.";
      setMessage(feedback); toast.success(feedback);
    } catch (cause) {const feedback = cause instanceof Error ? cause.message : "Copy failed. Please retry."; setMessage(feedback);toast.error(feedback);}
    finally {setCopying(false);}
  }
  return <>
    <Button type="button" variant="outline" className="mt-3 h-auto max-w-full whitespace-normal border-[#b7cc9f] py-2 text-left text-xs text-[#315a32]" onClick={() => {setOpen(true); if (!result) void generate();}}><Sparkles className="size-4 shrink-0" />? Win This Citation (Generate AI Capsule)</Button>
    <Dialog open={open} onOpenChange={value => {setOpen(value);if (!value) active.current?.abort();}}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-white p-5 text-[#182c25] sm:max-w-3xl sm:p-7">
        <DialogHeader><DialogTitle className="pr-8 text-xl font-semibold">Citation Capsule</DialogTitle><DialogDescription>A draft answer and structured data for {input.domain}. Review facts before publishing.</DialogDescription></DialogHeader>
        {pending && <p role="status" className="flex items-center gap-2 py-10 text-sm"><Loader2 className="size-5 animate-spin" />Analyzing page structure and drafting your capsule...</p>}
        {error && <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800"><p>{error}</p>{needsSignIn ? <SignInButton mode="modal"><Button className="mt-3" type="button">Sign in</Button></SignInButton> : <Button className="mt-3" type="button" onClick={() => void generate()} disabled={pending}>Try again</Button>}</div>}
        {result && !pending && <>
          <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><h3 className="font-semibold">Possible citation advantages</h3><p className="mt-2">{result.whyCompetitorWon}</p></aside>
          <Tabs defaultValue="html" className="min-w-0"><TabsList className="h-auto w-full flex-wrap"><TabsTrigger value="html" className="min-h-10 whitespace-normal">TL;DR HTML Block</TabsTrigger><TabsTrigger value="jsonld" className="min-h-10 whitespace-normal">JSON-LD Schema Markup</TabsTrigger></TabsList>
            <TabsContent value="html" className="min-w-0 space-y-3">
              <p className="text-xs text-[#68736b]">Live preview ? 80 words</p>
              <iframe title="Citation Capsule live preview" sandbox="" className="h-48 w-full rounded-xl border border-[#dfe5dc] bg-white" srcDoc={`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:15px/1.65 system-ui;color:#183529;padding:12px;overflow-wrap:anywhere}p{margin:0}</style></head><body>${result.tldrHtmlBlock}</body></html>`} />
              <Textarea aria-label="Citation Capsule HTML code" readOnly value={result.tldrHtmlBlock} className="min-h-32 max-h-64 resize-y font-mono text-xs" />
              <Button type="button" onClick={() => void copy("html")} disabled={copying}><Copy className="size-4" />Copy HTML</Button>
            </TabsContent>
            <TabsContent value="jsonld" className="min-w-0 space-y-3">
              <div className="relative overflow-hidden rounded-xl border border-[#dfe5dc] bg-[#f7f8f4] p-4">
                {result.canCopyJsonLd && result.jsonLdSchema ? <pre aria-label="JSON-LD code" className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">{result.jsonLdSchema}</pre> : <><pre aria-hidden="true" className="select-none whitespace-pre-wrap break-words text-xs blur-sm">{lockedPreview}</pre><p className="absolute inset-0 flex items-center justify-center gap-2 bg-white/50 p-4 text-center text-sm font-medium"><LockKeyhole className="size-4 shrink-0" />Pro unlocks your JSON-LD schema</p></>}
              </div>
              <Button type="button" onClick={() => void copy("jsonld")} disabled={copying}><Copy className="size-4" />Copy JSON-LD{!result.canCopyJsonLd && " ? Pro"}</Button>
              <p className="text-xs leading-5 text-[#68736b]">Publish the matching FAQ answers visibly on the page. Product schema must describe a real offering; markup alone does not guarantee citations or search features.</p>
            </TabsContent>
          </Tabs>
          <p role="status" aria-live="polite" className="min-h-5 text-xs text-[#315a32]">{message}</p>
          <p className="text-xs leading-5 text-[#68736b]">{result.warning}</p><p className="text-[11px] text-[#87927f]">Generated with {result.model}</p>
          <Button type="button" variant="ghost" onClick={() => {setResult(null);void generate();}} disabled={pending}>Regenerate draft</Button>
        </>}
      </DialogContent>
    </Dialog>
    {upgrade && <UpgradeModal signedIn={upgrade === "signed-in"} onClose={() => setUpgrade(null)} />}
  </>;
}
