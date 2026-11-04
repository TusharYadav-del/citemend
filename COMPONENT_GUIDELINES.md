# Component guidelines

Use the shared components under `components/ui/` for consistent structure and accessible defaults.

| Component | Purpose |
| --- | --- |
| `Button` | Primary, secondary, and quiet actions |
| `Card` | Grouped content with a clear heading and optional footer |
| `MetricCard` | A labeled value and evidence note; avoid invented sample metrics |
| `DataTable` | Horizontally scrollable, keyboard-reachable tabular data |
| `Badge` | Compact state label; include text as well as color |
| `Tabs` | Related views within one context |
| `Dialog` | Modal interactions with keyboard and focus support |
| `Sidebar` | Collapsible desktop navigation and a keyboard-controlled mobile drawer |
| `PageHeader` | Page title, explanation, and aligned actions |
| `Skeleton` | Loading placeholder paired with a screen-reader status |
| `EmptyState` | Helpful no-data state with a clear next step |
| `AlertBanner` | Info, success, warning, and error messages |
| `CodeBlock` | Readable and keyboard-scrollable configuration examples |
| `SparklineChart` | Small trends from real data, with a textual accessible label |

Prefer `Button`, `Card`, `Badge`, `Tabs`, `Dialog`, and table primitives already in this folder. The dashboard-specific building blocks are `MetricCard`, `DataTable`, `Sidebar`, `PageHeader`, `Skeleton`, `EmptyState`, `AlertBanner`, `CodeBlock`, and `SparklineChart`.

Write action labels as verbs. Keep error messages adjacent to the action that failed. Label links by destination and buttons by action. Reserve monospace text for technical values, and wrap long URLs instead of truncating evidence.
