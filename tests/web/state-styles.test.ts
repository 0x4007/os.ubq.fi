import { assertStringIncludes } from "@std/assert";

const appSource = await Deno.readTextFile(
  new URL("../../src/web/app.ts", import.meta.url),
);
const htmlSource = await Deno.readTextFile(
  new URL("../../public/index.html", import.meta.url),
);
const stylesheet = await Deno.readTextFile(
  new URL("../../public/styles.css", import.meta.url),
);

Deno.test("outputs start in a muted empty state", () => {
  assertStringIncludes(htmlSource, 'id="healthOut" class="output-empty"');
  assertStringIncludes(htmlSource, 'id="timeOut" class="output-empty"');
  assertStringIncludes(htmlSource, 'id="echoOut" class="output-empty"');
});

Deno.test("app applies loading empty error and ready output states", () => {
  assertStringIncludes(appSource, '"output-empty"');
  assertStringIncludes(appSource, '"output-error"');
  assertStringIncludes(appSource, '"output-loading"');
  assertStringIncludes(appSource, '"output-ready"');
  assertStringIncludes(appSource, 'setOutputState(el, "loading")');
  assertStringIncludes(appSource, 'setOutputState(el, "empty")');
  assertStringIncludes(appSource, 'setOutputState(el, "error")');
  assertStringIncludes(appSource, 'setOutputState(el, "ready")');
});

Deno.test("styles define visible loading and error treatments", () => {
  assertStringIncludes(stylesheet, ".output-error");
  assertStringIncludes(stylesheet, ".output-loading");
  assertStringIncludes(stylesheet, ".skeleton-line");
  assertStringIncludes(stylesheet, "@keyframes skeleton-pulse");
});
