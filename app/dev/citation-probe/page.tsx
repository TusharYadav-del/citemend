import { notFound } from "next/navigation";
import ProbeForm from "./probe-form";

export default function CitationProbePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ProbeForm />;
}
