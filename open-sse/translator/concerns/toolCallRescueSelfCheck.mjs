// Tool-call rescue self-check.
// Run: node open-sse/translator/concerns/toolCallRescueSelfCheck.mjs
// No framework, no deps. Each case is one shape a model actually emits.
import { indexDeclaredTools, rescueToolCall, rescueResponse, rescueRequest } from "./toolCallRescue.js";

const results = [];
function run(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, err: err.message });
  }
}
const assert = {
  equal(a, b, msg) { if (a !== b) throw new Error(`${msg || ""} expected ${b}, got ${a}`); },
  ok(v, msg) { if (!v) throw new Error(msg || "expected truthy"); },
  deepEqual(a, b, msg) {
    const x = JSON.stringify(a), y = JSON.stringify(b);
    if (x !== y) throw new Error(`${msg || ""} expected ${y}, got ${x}`);
  },
};

const BASH_TOOL = {
  type: "function",
  function: { name: "Bash", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } },
};
const READ_TOOL = {
  type: "function",
  function: { name: "Read", parameters: { type: "object", properties: { file_path: { type: "string" } }, required: ["file_path"] } },
};
const indexOf = (...tools) => indexDeclaredTools(tools);

function argsOfCall(call) { return JSON.parse(call.function.arguments); }

// --- the two reported faults ---

run("REPORT: bash is rewritten to the declared Bash", () => {
  const call = { id: "t1", function: { name: "bash", arguments: '{"command":"ls -la"}' } };
  const out = rescueToolCall(call, indexOf(BASH_TOOL));
  assert.equal(out.call.function.name, "Bash", "name raised back to the declared case");
  assert.ok(out.renamed, "rename reported");
  assert.equal(argsOfCall(out.call).command, "ls -la", "args untouched");
});

run("REPORT: empty args for Bash is dropped, not sent as {}", () => {
  // This is the exact shape behind `must have required property 'command'`.
  const call = { id: "t1", function: { name: "Bash", arguments: "{}" } };
  const out = rescueToolCall(call, indexOf(BASH_TOOL));
  assert.equal(out.call, null, "unrecoverable call is dropped");
  assert.deepEqual(out.unresolved, ["command"], "reports the missing property");
});

run("REPORT: a bare command string becomes the command property", () => {
  const call = { id: "t1", function: { name: "Bash", arguments: "ls -la /tmp" } };
  const out = rescueToolCall(call, indexOf(BASH_TOOL));
  assert.equal(out.call.function.name, "Bash", "name kept");
  assert.equal(argsOfCall(out.call).command, "ls -la /tmp", "bare string lifted into command");
});

run("REPORT: cmd is read as command", () => {
  const call = { id: "t1", function: { name: "Bash", arguments: '{"cmd":"pwd"}' } };
  const out = rescueToolCall(call, indexOf(BASH_TOOL));
  assert.equal(argsOfCall(out.call).command, "pwd", "alias lifted");
  assert.equal(argsOfCall(out.call).cmd, undefined, "donor key removed");
});

run("REPORT: commandLine is read as command", () => {
  const call = { id: "t1", function: { name: "Bash", arguments: '{"commandLine":"whoami"}' } };
  const out = rescueToolCall(call, indexOf(BASH_TOOL));
  assert.equal(argsOfCall(out.call).command, "whoami", "spelling variant lifted");
});

// --- name resolution ---

run("an exact name is not reported as renamed", () => {
  const out = rescueToolCall({ id: "t", function: { name: "Bash", arguments: '{"command":"ls"}' } }, indexOf(BASH_TOOL));
  assert.equal(out.renamed, false, "no rename on an exact match");
});

run("an undeclared name is left alone", () => {
  const out = rescueToolCall({ id: "t", function: { name: "Unknown", arguments: '{"a":1}' } }, indexOf(BASH_TOOL));
  assert.equal(out.call.function.name, "Unknown", "unknown name preserved");
  assert.equal(out.renamed, false, "no rename claimed");
});

run("the first declaration wins a case duplicate", () => {
  const other = { type: "function", function: { name: "bash", parameters: { type: "object", properties: { cmd: { type: "string" } }, required: ["cmd"] } } };
  const out = rescueToolCall({ id: "t", function: { name: "BASH", arguments: '{"command":"ls"}' } }, indexOf(BASH_TOOL, other));
  assert.equal(out.call.function.name, "Bash", "first declared name wins");
});

run("no tools declared means the call is untouched", () => {
  const call = { id: "t", function: { name: "Bash", arguments: "{}" } };
  const out = rescueToolCall(call, indexOf());
  assert.equal(out.call, call, "call returned by identity");
});

// --- what must never be broken ---

run("a well formed call is byte-identical", () => {
  const call = { id: "t", function: { name: "Bash", arguments: '{"command":"ls"}' } };
  const out = rescueToolCall(call, indexOf(BASH_TOOL));
  assert.equal(out.call.function.arguments, '{"command":"ls"}', "no reformat of a good call");
  assert.equal(out.recovered, 0, "nothing recovered");
  assert.equal(out.renamed, false, "nothing renamed");
});

run("a bare string is not lifted into a two-property tool", () => {
  const both = {
    type: "function",
    function: { name: "Edit", parameters: { type: "object", properties: { old_string: { type: "string" }, new_string: { type: "string" } }, required: ["old_string", "new_string"] } },
  };
  const out = rescueToolCall({ id: "t", function: { name: "Edit", arguments: "some text" } }, indexOf(both));
  assert.equal(out.call, null, "ambiguous bare string is dropped, not guessed");
  assert.equal(out.unresolved.length, 2, "both properties unresolved");
});

run("oldString is read as old_string", () => {
  const both = {
    type: "function",
    function: { name: "Edit", parameters: { type: "object", properties: { old_string: { type: "string" }, new_string: { type: "string" } }, required: ["old_string", "new_string"] } },
  };
  const call = { id: "t", function: { name: "Edit", arguments: '{"oldString":"a","newString":"b"}' } };
  const out = rescueToolCall(call, indexOf(both));
  assert.equal(argsOfCall(out.call).old_string, "a", "camel donor lifted");
  assert.equal(argsOfCall(out.call).new_string, "b", "second donor lifted");
});

run("a schema default fills the property", () => {
  const tool = {
    type: "function",
    function: { name: "Wait", parameters: { type: "object", properties: { ms: { type: "number", default: 1000 } }, required: ["ms"] } },
  };
  const out = rescueToolCall({ id: "t", function: { name: "Wait", arguments: "{}" } }, indexOf(tool));
  assert.equal(argsOfCall(out.call).ms, 1000, "default applied");
});

run("a schema without required leaves a call alone", () => {
  const tool = { type: "function", function: { name: "Note", parameters: { type: "object", properties: { text: { type: "string" } } } } };
  const out = rescueToolCall({ id: "t", function: { name: "Note", arguments: "{}" } }, indexOf(tool));
  assert.ok(out.call, "not dropped when nothing is required");
});

run("a non-object arguments value does not throw", () => {
  for (const raw of [null, undefined, 42, true, [], "null", "[]"]) {
    const out = rescueToolCall({ id: "t", function: { name: "Bash", arguments: raw } }, indexOf(BASH_TOOL));
    assert.ok(out.call === null || typeof out.call === "object", `survived ${JSON.stringify(raw)}`);
  }
});

run("a call with no name is returned untouched", () => {
  const call = { id: "t", function: { arguments: "{}" } };
  assert.equal(rescueToolCall(call, indexOf(BASH_TOOL)).call, call, "identity kept");
  assert.equal(rescueToolCall(null, indexOf(BASH_TOOL)).call, null, "null safe");
});

// --- response path ---

run("response: the reported failure is stopped before the client sees it", () => {
  const payload = {
    choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [
      { id: "a", type: "function", function: { name: "bash", arguments: "{}" } },
    ] }, finish_reason: "tool_calls" }],
  };
  const { payload: out, dropped, renamed } = rescueResponse(payload, [BASH_TOOL]);
  assert.equal(dropped, 1, "one call dropped");
  assert.equal(renamed, 0, "name is moot once dropped");
  assert.equal(out.choices[0].message.tool_calls, undefined, "empty tool_calls removed");
  assert.equal(out.choices[0].finish_reason, "stop", "finish_reason corrected");
  assert.equal(out.choices[0].message.content, "", "content filled so the turn is still valid");
});

run("response: a renamed call reaches the client with the declared name", () => {
  const payload = {
    choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [
      { id: "a", type: "function", function: { name: "bash", arguments: '{"command":"ls"}' } },
    ] }, finish_reason: "tool_calls" }],
  };
  const { payload: out, renamed } = rescueResponse(payload, [BASH_TOOL]);
  assert.equal(renamed, 1, "rename counted");
  assert.equal(out.choices[0].message.tool_calls[0].function.name, "Bash", "declared case applied");
  assert.equal(out.choices[0].finish_reason, "tool_calls", "finish_reason untouched on a good call");
});

run("response: a rescued call is not counted as renamed", () => {
  const payload = {
    choices: [{ index: 0, message: { role: "assistant", tool_calls: [
      { id: "a", type: "function", function: { name: "Bash", arguments: '{"cmd":"ls"}' } },
    ] }, finish_reason: "tool_calls" }],
  };
  const { payload: out, recovered, renamed } = rescueResponse(payload, [BASH_TOOL]);
  assert.equal(recovered, 1, "recovery counted");
  assert.equal(renamed, 0, "no rename on an exact name");
  assert.equal(JSON.parse(out.choices[0].message.tool_calls[0].function.arguments).command, "ls", "recovered value");
});

run("response: one good call survives beside one dropped call", () => {
  const payload = {
    choices: [{ index: 0, message: { role: "assistant", tool_calls: [
      { id: "a", type: "function", function: { name: "Bash", arguments: "{}" } },
      { id: "b", type: "function", function: { name: "Read", arguments: '{"file_path":"/etc/hosts"}' } },
    ] }, finish_reason: "tool_calls" }],
  };
  const { payload: out, dropped } = rescueResponse(payload, [BASH_TOOL, READ_TOOL]);
  assert.equal(dropped, 1, "only the unrecoverable one dropped");
  assert.equal(out.choices[0].message.tool_calls.length, 1, "the good call stays");
  assert.equal(out.choices[0].message.tool_calls[0].id, "b", "surviving id");
  assert.equal(out.choices[0].finish_reason, "tool_calls", "still a tool turn");
});

run("response: a payload with no tools declared is returned as-is", () => {
  const payload = { choices: [{ message: { tool_calls: [{ id: "a", function: { name: "Bash", arguments: "{}" } }] } }] };
  const { payload: out, dropped } = rescueResponse(payload, []);
  assert.equal(out, payload, "identity kept");
  assert.equal(dropped, 0, "nothing dropped");
});

run("response: null and non-object payloads do not throw", () => {
  for (const p of [null, undefined, 42, "x", []]) {
    assert.ok(rescueResponse(p, [BASH_TOOL]).payload === p, `survived ${JSON.stringify(p)}`);
  }
});

run("response: a choice with no tool_calls is untouched", () => {
  const payload = { choices: [{ message: { content: "hi" }, finish_reason: "stop" }] };
  const { payload: out } = rescueResponse(payload, [BASH_TOOL]);
  assert.equal(out.choices[0].message.content, "hi", "content intact");
  assert.equal(out.choices[0].message.tool_calls, undefined, "none invented");
});

run("response: Claude tool_use blocks are rescued", () => {
  const payload = {
    type: "message",
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "t1", name: "bash", input: {} }],
  };
  const { payload: out, dropped } = rescueResponse(payload, [BASH_TOOL]);
  assert.equal(dropped, 1, "unrecoverable tool_use dropped");
  assert.equal(out.content.some((b) => b?.type === "tool_use"), false, "block removed");
  assert.equal(out.stop_reason, "end_turn", "stop_reason corrected so the turn is well formed");
  assert.equal(out.content[0].type, "text", "an empty text block takes its place");
});

run("response: a recoverable Claude block keeps its identity", () => {
  const payload = {
    type: "message",
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "t1", name: "bash", input: { cmd: "ls" } }],
  };
  const { payload: out, renamed, recovered, dropped } = rescueResponse(payload, [BASH_TOOL]);
  assert.equal(dropped, 0, "nothing dropped");
  assert.equal(renamed, 1, "rename counted");
  assert.equal(recovered, 1, "recovery counted");
  assert.equal(out.content[0].id, "t1", "id preserved");
  assert.equal(out.content[0].name, "Bash", "declared case applied");
  assert.equal(out.content[0].input.command, "ls", "recovered input");
  assert.equal(out.stop_reason, "tool_use", "still a tool turn");
});

run("response: Responses function_call items are rescued", () => {
  const payload = {
    object: "response",
    output: [{ type: "function_call", call_id: "c1", name: "bash", arguments: '{"command":"ls"}' }],
  };
  const { payload: out, renamed } = rescueResponse(payload, [BASH_TOOL]);
  assert.equal(renamed, 1, "rename counted");
  assert.equal(out.output[0].name, "Bash", "declared case applied");
});

run("response: an unrecoverable Responses item leaves no _dropped marker", () => {
  const payload = { object: "response", output: [{ type: "function_call", call_id: "c1", name: "Bash", arguments: "{}" }] };
  const { payload: out, dropped } = rescueResponse(payload, [BASH_TOOL]);
  assert.equal(dropped, 1, "dropped counted");
  assert.equal(out.output.length, 0, "item removed");
  assert.equal(out.output.some((i) => "_dropped" in i), false, "no internal marker leaks");
});

// --- request path ---

run("request: the rejected call in the history is rescued", () => {
  const body = {
    tools: [BASH_TOOL],
    messages: [
      { role: "user", content: "ls please" },
      { role: "assistant", content: null, tool_calls: [{ id: "a", function: { name: "bash", arguments: "{}" } }] },
    ],
  };
  const { body: out, dropped } = rescueRequest(body);
  assert.equal(dropped, 1, "the broken call leaves the history");
  assert.equal(out.messages[1].tool_calls, undefined, "tool_calls removed");
  assert.equal(out.messages[0].content, "ls please", "surrounding history intact");
});

run("request: the rename persists so the next turn is stable", () => {
  const body = {
    tools: [BASH_TOOL],
    messages: [{ role: "assistant", content: null, tool_calls: [{ id: "a", function: { name: "bash", arguments: '{"command":"ls"}' } }] }],
  };
  const { body: out, renamed } = rescueRequest(body);
  assert.equal(renamed, 1, "rename counted");
  assert.equal(out.messages[0].tool_calls[0].function.name, "Bash", "stored under the declared name");
});

run("request: a body with no tools declared is returned as-is", () => {
  const body = { messages: [{ role: "assistant", tool_calls: [{ id: "a", function: { name: "Bash", arguments: "{}" } }] }] };
  const { body: out, dropped } = rescueRequest(body);
  assert.equal(out, body, "identity kept");
  assert.equal(dropped, 0, "nothing dropped without a schema to check against");
});

run("request: null does not throw", () => {
  assert.equal(rescueRequest(null).body, null, "null safe");
  assert.equal(rescueRequest(undefined).body, undefined, "undefined safe");
});

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "  ok  " : "  FAIL"} ${r.name}${r.err ? ` — ${r.err}` : ""}`);
}
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
