import { executeDemoTool } from "@/lib/demo-tools/http-tools";
import { getDemoTools } from "@/lib/demo-tools/registry";

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/demo-tools/[name]">,
) {
  const { name } = await params;
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }

  try {
    const result = await executeDemoTool(
      getDemoTools(),
      name,
      input,
      request.signal,
    );
    const isText = typeof result === "string";
    return new Response(isText ? result : JSON.stringify(result), {
      headers: {
        "Content-Type": isText
          ? "text/plain; charset=utf-8"
          : "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith("unknown demo tool") ? 404 : 500;
    return new Response(message, { status });
  }
}
