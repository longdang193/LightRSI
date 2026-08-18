import type { ProductCommandRegistrar, ProductCommandSpec } from "@lightrsi/host-adapter";

export function createOpenClawCommandRegistrar(api: any): ProductCommandRegistrar {
  return {
    registerCommand(spec: ProductCommandSpec) {
      api.registerCommand(spec);
    },
  };
}
