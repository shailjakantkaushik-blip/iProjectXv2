import { pathToFileURL } from "node:url";
import { join, extname } from "node:path";

const SRC = join(process.cwd(), "src");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    let target = join(SRC, specifier.slice(2));
    if (!extname(target)) target += ".ts";
    return nextResolve(pathToFileURL(target).href, context);
  }
  if (specifier.startsWith(".") && !extname(specifier)) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}
