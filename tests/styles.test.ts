import { assert, assertStringIncludes } from "@std/assert";

const stylesheet = await Deno.readTextFile(
  new URL("../public/styles.css", import.meta.url),
);

Deno.test("print stylesheet hides interactive chrome", () => {
  assertStringIncludes(stylesheet, "@media print");
  assertStringIncludes(stylesheet, "button,");
  assertStringIncludes(stylesheet, "form,");
  assertStringIncludes(stylesheet, "textarea,");
  assertStringIncludes(stylesheet, "display: none !important;");
});

Deno.test("print stylesheet keeps output legible", () => {
  assertStringIncludes(stylesheet, "max-height: none;");
  assertStringIncludes(stylesheet, "overflow: visible;");
  assertStringIncludes(stylesheet, "word-break: break-word;");
  assert(stylesheet.includes("break-inside: avoid"));
});
