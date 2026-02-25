# SandAgent Documentation Site

Official documentation website for SandAgent, built with [Fumadocs](https://fumadocs.dev) and Next.js.

Visit the live site at: **https://sandagent.dev/**

---

## Development

### Prerequisites

- Node.js >= 20.0.0
- pnpm 9.0.0+

### Installation

```bash
# From monorepo root
pnpm install
```

### Running Locally

```bash
cd apps/web
pnpm dev
```

Open http://localhost:3000

### Build

```bash
pnpm build
```

---

## Documentation Structure

The documentation site is organized as follows:

```
apps/web/
├── app/
│   ├── (home)/           # Landing page
│   ├── docs/               # Documentation pages (generated from MDX)
│   │   └── [[...slug]]/  # Dynamic routing for docs
│   ├── api/                # API routes
│   │   └── search/        # Search endpoint
│   ├── global.css          # Global styles
│   └── layout.tsx          # Root layout with metadata
├── content/               # MDX content source files
├── lib/
│   ├── source.ts          # Content source adapter
│   ├── layout.shared.tsx  # Shared layout options
│   └── ...
└── source.config.ts       # Fumadocs configuration
```

### Key Directories

- **`app/(home)`** - Landing page and marketing pages
- **`app/docs`** - Documentation pages (auto-generated from MDX)
- **`app/api/search`** - Full-text search endpoint
- **`content/`** - MDX source files for documentation
- **`lib/source.ts`** - Content source adapter configuration
- **`source.config.ts`** - Navigation and page structure configuration

---

## Adding Documentation

### Creating a New Page

1. Create a new MDX file in `content/` directory:

```mdx
---
title: Your Page Title
description: Page description for SEO
---

# Your Page Title

Your content here...
```

2. Add the page to navigation in `source.config.ts`:

```typescript
export default createSourceAPI({
  docs: {
    ...,
    pages: {
      ...,
      "your-page": {
        title: "Your Page Title",
        pages: {
          _: {
            title: "Your Page Title",
          },
        },
      },
    },
  },
});
```

### Frontmatter Options

Each MDX file supports frontmatter for metadata:

```yaml
---
title: Page Title
description: SEO description
order: 1
---
```

---

## Styling & Theme

The site uses:
- **Fumadocs UI** - Documentation components
- **Tailwind CSS 4** - Styling
- **Next Themes** - Dark mode support
- **Kui** - Custom UI component library

### Customizing Styles

Edit `app/global.css` for global styles.

### Theme Configuration

Theme is configured in `source.config.ts` and uses `next-themes` for dark mode.

---

## Search

Full-text search is powered by Fumadocs and is available at the `/search` route.

Search configuration can be modified in `source.config.ts`.

---

## Deployment

### Vercel

The site is configured for Vercel deployment via `vercel.json`.

Deploy to Vercel:
1. Connect your GitHub repository
2. Import the project
3. Vercel will automatically deploy on push to main/develop

### Environment Variables

The documentation site may require environment variables for certain features (e.g., analytics):

```bash
# Google Analytics (already configured)
NEXT_PUBLIC_GA_ID=G-B1FLZ40NXT
```

---

## Monitoring & Analytics

- **Google Analytics**: Configured via `@next/third-parties/google`
- Track user visits and page views
- GA ID: `G-B1FLZ40NXT`

---

## Scripts

| Script | Description |
|---------|-------------|
| `dev` | Start development server |
| `build` | Build for production |
| `start` | Start production server |
| `lint` | Run Biome linter |
| `format` | Format code with Biome |
| `types:check` | Type check with TypeScript |

---

## Learn More

- [Fumadocs Documentation](https://fumadocs.dev)
- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com)
