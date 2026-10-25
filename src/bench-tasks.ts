import { TaskSet } from "./bench.js";

// Verifiers are passed directly to Node rather than stored in the agent-writable checkout.
const exercises = [
  {
    id: "slugify",
    prompt:
      "Export slugify(text): lowercase ASCII text, replace runs of non-alphanumeric characters with a single hyphen, and trim leading/trailing hyphens.",
    check:
      "assert.equal(m.slugify('  Hello, WORLD!  '),'hello-world');assert.equal(m.slugify('---'),'');",
  },
  {
    id: "chunk",
    prompt:
      "Export chunk(items,size): split an array into arrays of at most size elements without mutation. Reject nonpositive or noninteger size with RangeError.",
    check:
      "const a=[1,2,3,4,5];assert.deepEqual(m.chunk(a,2),[[1,2],[3,4],[5]]);assert.deepEqual(a,[1,2,3,4,5]);assert.throws(()=>m.chunk(a,0),RangeError);assert.throws(()=>m.chunk(a,1.5),RangeError);",
  },
  {
    id: "unique",
    prompt:
      "Export unique(items): return items without duplicates, preserving first occurrence order, using SameValueZero equality.",
    check:
      "assert.deepEqual(m.unique([3,1,3,2,1]),[3,1,2]);assert.equal(m.unique([NaN,NaN]).length,1);",
  },
  {
    id: "group-by",
    prompt:
      "Export groupBy(items,keyFn): return a Map whose keys come from keyFn and values are arrays of matching items in original order.",
    check:
      "assert.deepEqual([...m.groupBy([1,2,3,4],x=>x%2)],[[1,[1,3]],[0,[2,4]]]);assert.equal(m.groupBy([],x=>x).size,0);",
  },
  {
    id: "clamp",
    prompt:
      "Export clamp(value,min,max): return value bounded inclusively by min and max. Throw RangeError if min exceeds max.",
    check:
      "assert.equal(m.clamp(10,0,5),5);assert.equal(m.clamp(-1,0,5),0);assert.equal(m.clamp(3,0,5),3);assert.throws(()=>m.clamp(0,5,1),RangeError);",
  },
  {
    id: "deep-equal",
    prompt:
      "Export deepEqual(a,b): recursively compare JSON-compatible values. Object key order does not matter; array order does. Missing keys differ from null.",
    check:
      "assert.equal(m.deepEqual({a:[1,null],b:2},{b:2,a:[1,null]}),true);assert.equal(m.deepEqual([1,2],[2,1]),false);assert.equal(m.deepEqual({}, {x:null}),false);assert.equal(m.deepEqual(null,{}),false);",
  },
  {
    id: "parse-duration",
    prompt:
      "Export parseDuration(text): convert a positive integer followed by ms, s, m, or h to milliseconds; reject all other inputs with Error.",
    check:
      "assert.equal(m.parseDuration('2m'),120000);assert.equal(m.parseDuration('3ms'),3);assert.equal(m.parseDuration('1h'),3600000);assert.throws(()=>m.parseDuration('-1s'));assert.throws(()=>m.parseDuration('2days'));",
  },
  {
    id: "retry",
    prompt:
      "Export async retry(fn,attempts): call async fn until it succeeds, making at most attempts total calls. Rethrow the final error. Reject invalid attempts (nonpositive or noninteger) with RangeError.",
    check:
      "let n=0;assert.equal(await m.retry(async()=>{if(++n<3)throw Error('again');return 9;},3),9);assert.equal(n,3);await assert.rejects(()=>m.retry(async()=>{throw Error('last');},2),/last/);await assert.rejects(()=>m.retry(async()=>1,0),RangeError);",
  },
  {
    id: "escape-html",
    prompt:
      "Export escapeHtml(text): replace &, <, >, double quote, and single quote with &amp;, &lt;, &gt;, &quot;, and &#39; respectively.",
    check: `assert.equal(m.escapeHtml(${JSON.stringify(`<a x="a&b">'x'</a>`)}),'&lt;a x=&quot;a&amp;b&quot;&gt;&#39;x&#39;&lt;/a&gt;');assert.equal(m.escapeHtml('plain'),'plain');`,
  },
  {
    id: "topological-sort",
    prompt:
      "Export topologicalSort(edges): edges are [dependency,dependent] string pairs. Return every node exactly once in dependency order. Reject cycles with Error; return [] for no edges.",
    check:
      "const result=m.topologicalSort([['a','b'],['a','c'],['b','d'],['c','d']]);assert.equal(new Set(result).size,4);for(const [a,b]of [['a','b'],['a','c'],['b','d'],['c','d']])assert.ok(result.indexOf(a)<result.indexOf(b));assert.throws(()=>m.topologicalSort([['a','b'],['b','a']]));assert.deepEqual(m.topologicalSort([]),[]);",
  },
];

export function fixedTaskSet(repo: string, revision: string, agent = "claude") {
  return TaskSet.parse({
    version: 1,
    repo,
    revision,
    tasks: exercises.map((exercise) => ({
      id: exercise.id,
      run: {
        command: agent,
        args: [
          "-p",
          `Implement this task in preflight-bench-solution.mjs at the repository root. Use named ESM exports, no dependencies. ${exercise.prompt} Do not modify other existing project files.`,
          "--output-format",
          "json",
        ],
      },
      verify: {
        command: process.execPath,
        args: [
          "--input-type=module",
          "-e",
          `import assert from 'node:assert/strict';const m=await import('./preflight-bench-solution.mjs');${exercise.check}`,
        ],
      },
      timeoutMs: 120000,
    })),
  });
}
