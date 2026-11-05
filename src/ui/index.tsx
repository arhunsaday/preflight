import React from "react";
import { render } from "ink";
import type { Context } from "../adapters.js";
import { Root } from "./dashboard.js";

export { App, writes } from "./app.js";
export { Dashboard, Root } from "./dashboard.js";
export * from "./dashboard-model.js";
export {
  ResourceList,
  configLines,
  jsonSegments,
  observed,
} from "./components.js";
export {
  clean,
  count,
  fit,
  fuzzyFilter,
  fuzzyScore,
  outputLines,
  tokenize,
  truncate,
  truncateStart,
  wrapWords,
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

export async function startUI(context: Context, options: { classic?: boolean } = {}) {
  await render(<Root context={context} classic={options.classic ?? false} />).waitUntilExit();
}
