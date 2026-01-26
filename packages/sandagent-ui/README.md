# @sandagent/ui

Ready-to-use React components for building AI chat interfaces with SandAgent.

## Installation

```bash
npm install @sandagent/ui
# or
pnpm add @sandagent/ui
```

## Usage

### Basic Chat Interface

```tsx
import { SandAgentChat } from "@sandagent/ui";
import "@sandagent/ui/styles.css";

export default function ChatPage() {
  return (
    <SandAgentChat
      apiEndpoint="/api/ai"
      body={{ template: "default" }}
      placeholder="Ask the agent..."
    />
  );
}
```

### Individual Components

```tsx
import { ChatMessage, DynamicToolUI, ArtifactPanel } from "@sandagent/ui";
import "@sandagent/ui/styles.css";

// Use components individually for custom layouts
```

## Components

### Chat

- `SandAgentChat` - Complete chat interface with messages, input, and artifact panel
- `ChatMessage` - Single message component with tool and artifact support

### Tools

- `DynamicToolUI` - Renders tool UI based on tool type
- `WriteToolCard` - File write operation card
- `AskUserQuestion` - Interactive question/answer component

### Artifacts

- `ArtifactPanel` - Full artifact preview panel with code/preview modes
- `ArtifactItem` - Compact artifact list item

## Props

### SandAgentChatProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `apiEndpoint` | `string` | `/api/ai` | API endpoint for chat |
| `body` | `Record<string, unknown>` | `{}` | Additional body params to pass to API |
| `sessionId` | `string` | auto-generated | Session ID |
| `showArtifactPanel` | `boolean` | `true` | Show artifact panel |
| `emptyStateTitle` | `string` | `"Welcome to SandAgent"` | Empty state title |
| `emptyStateDescription` | `string` | `"Ask the agent..."` | Empty state description |
| `placeholder` | `string` | `"Ask the agent..."` | Input placeholder |
| `header` | `ReactNode` | - | Custom header content |
| `className` | `string` | - | Custom class name |

## Styling

Import the styles in your app:

```tsx
import "@sandagent/ui/styles.css";
```

The components use Tailwind CSS classes. Make sure your project has Tailwind configured.

## License

Apache-2.0
