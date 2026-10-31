import Link from "next/link";

export default function AuditNotFound() {
  return <main className="mx-auto max-w-3xl px-6 py-20"><h1 className="text-3xl font-semibold">Audit report not found</h1><p className="mt-4 text-sm leading-6">This link is invalid, the report no longer exists, or the audit is not ready to share.</p><Link href="/" className="mt-6 inline-block underline">Visit CiteFix AI</Link></main>;
}
