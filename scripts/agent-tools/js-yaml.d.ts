// js-yaml 4.3.2 is a direct devDependency without @types (docs/decisions.md P8); this is the only function used.
declare module "js-yaml" {
  export function load(text: string): unknown;
}
