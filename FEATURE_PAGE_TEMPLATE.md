# Feature page template

Use this outline for new CiteMend routes. Keep server-only data access in a Server Component and pass only the needed display values to small Client Components.

```tsx
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default async function FeaturePage() {
  // Load authorized account data on the server.
  const items = [];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <PageHeader title="Feature name" description="Explain what the user can do here." />
        {items.length === 0 ? (
          <EmptyState title="Nothing here yet" description="Explain how to create the first result." />
        ) : (
          <section aria-label="Feature results">{/* Use shared cards and tables. */}</section>
        )}
      </div>
    </main>
  );
}
```

Before release, verify route access, loading and empty states, narrow screens, keyboard use, reduced motion, and existing account data behavior. Keep demo data explicitly labeled and isolated from live product metrics.
