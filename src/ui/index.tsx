import React from "react";
import { render } from "ink";
import type { Context } from "../adapters.js";
import { App } from "./app.js";

export { App } from "./app.js";
export { ResourceList, configLines } from "./components.js";
export {
  clean,
  fit,
  fuzzyFilter,
  fuzzyScore,
  outputLines,
  tokenize,
  truncate,
} from "./text.js";
export { lineDelta, summarize, shortPath } from "./preview.js";
export {
  actions,
  available,
  byKey,
  commandLine,
  views,
  type Action,
  type ActionState,
  type ViewId,
} from "./actions.js";
export {
  cycle,
  emptyForm,
  formFields,
  fromResource,
  toggle,
  validate,
  type FormState,
} from "./form.js";

export async function startUI(context: Context) {
  await render(<App context={context} />).waitUntilExit();
}
