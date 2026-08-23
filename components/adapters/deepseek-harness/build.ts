import { build } from "esbuild";

async function main(): Promise<void> {
  await build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    outfile: "dist/index.js",
    platform: "node",
    target: "node22",
    format: "esm",
    sourcemap: true,
    minify: false,
    logLevel: "info",
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
