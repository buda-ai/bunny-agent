// Pi AI 1.2.0 publishes this JavaScript lookup entry without a declaration.
// Match its generated chat-model lookup, including unknown provider/model IDs.
declare module "@earendil-works/pi-ai/providers/all" {
  export function getBuiltinModel(
    provider: string,
    modelId: string,
  ): import("@earendil-works/pi-ai").Model<import("@earendil-works/pi-ai").Api> | undefined;
}
