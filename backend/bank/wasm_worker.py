"""One-shot import-free Wasmtime calculator. Never evaluates Python/shell input."""
import json
import re
import sys
import time
from importlib.metadata import version

MAX_WAT_BYTES = 8192
MAX_JSON_BYTES = 32768
FUEL = 50000
MEMORY_BYTES = 131072
TABLE_ELEMENTS = 64
MIN_I64 = -(1 << 63)
MAX_I64 = (1 << 63) - 1


def answer(ok, result=None, error=None, fuel_used=None, runtime=None):
    return {"ok": ok, "result": result, "error": error, "metrics": {
        "runtimeVersion": runtime, "fuelConsumed": fuel_used,
        "fuelLimit": FUEL, "memoryLimitBytes": MEMORY_BYTES,
        "tableElementLimit": TABLE_ELEMENTS, "imports": 0,
    }}


def execute():
    raw = sys.stdin.buffer.read(MAX_JSON_BYTES + 1)
    if len(raw) > MAX_JSON_BYTES:
        return answer(False, error="INPUT_TOO_LARGE")
    try:
        request = json.loads(raw)
    except (ValueError, UnicodeError):
        return answer(False, error="INVALID_REQUEST")
    if not isinstance(request, dict) or set(request) != {"wat", "inputs"}:
        return answer(False, error="INVALID_REQUEST")
    wat, supplied = request["wat"], request["inputs"]
    if not isinstance(wat, str) or not wat.strip():
        return answer(False, error="INVALID_REQUEST")
    if len(wat.encode("utf-8")) > MAX_WAT_BYTES:
        return answer(False, error="INPUT_TOO_LARGE")
    if not isinstance(supplied, list) or len(supplied) != 2:
        return answer(False, error="INVALID_REQUEST")
    values = []
    for value in supplied:
        if not isinstance(value, str) or not re.fullmatch(r"-?(0|[1-9][0-9]{0,18})", value):
            return answer(False, error="INVALID_INTEGER")
        integer = int(value)
        if not MIN_I64 <= integer <= MAX_I64:
            return answer(False, error="INTEGER_OUT_OF_RANGE")
        values.append(integer)
    try:
        import wasmtime
        runtime = version("wasmtime")
    except (ImportError, OSError):
        return answer(False, error="RUNTIME_UNAVAILABLE")

    # No Linker, WASI configuration, Python callbacks or host functions exist.
    config = wasmtime.Config()
    config.consume_fuel = True
    config.parallel_compilation = False
    config.wasm_threads = False
    config.shared_memory = False
    config.wasm_memory64 = False
    config.wasm_multi_memory = False
    config.wasm_simd = False
    config.wasm_relaxed_simd = False
    config.wasm_gc = False
    config.wasm_function_references = False
    config.wasm_tail_call = False
    config.wasm_exceptions = False
    config.max_wasm_stack = 65536
    config.memory_reservation = MEMORY_BYTES
    config.memory_reservation_for_growth = 0
    config.memory_may_move = False
    engine = wasmtime.Engine(config)
    try:
        module = wasmtime.Module(engine, wat)
    except wasmtime.WasmtimeError:
        return answer(False, error="INVALID_WAT", runtime=runtime)
    if module.imports:
        return answer(False, error="IMPORTS_FORBIDDEN", runtime=runtime)
    exports = module.exports
    if len(exports) != 1 or exports[0].name != "calculate" or not isinstance(exports[0].type, wasmtime.FuncType):
        return answer(False, error="INVALID_SIGNATURE", runtime=runtime)
    signature = exports[0].type
    if [str(value) for value in signature.params] != ["i64", "i64"] or [str(value) for value in signature.results] != ["i64"]:
        return answer(False, error="INVALID_SIGNATURE", runtime=runtime)
    store = wasmtime.Store(engine)
    store.set_limits(memory_size=MEMORY_BYTES, table_elements=TABLE_ELEMENTS, instances=1, tables=1, memories=1)
    store.set_fuel(FUEL)
    try:
        instance = wasmtime.Instance(store, module, [])
        result = instance.exports(store)["calculate"](store, *values)
        return answer(True, result=str(result), fuel_used=FUEL - store.get_fuel(), runtime=runtime)
    except wasmtime.Trap:
        remaining = store.get_fuel()
        return answer(False, error="FUEL_EXHAUSTED" if remaining == 0 else "EXECUTION_TRAP", fuel_used=FUEL - remaining, runtime=runtime)
    except wasmtime.WasmtimeError:
        return answer(False, error="RESOURCE_LIMIT", fuel_used=FUEL - store.get_fuel(), runtime=runtime)


if __name__ == "__main__":
    started = time.monotonic()
    try:
        outcome = execute()
    except Exception:
        # No Python stack, source text, environment or local paths cross the IPC boundary.
        outcome = answer(False, error="WORKER_INTERNAL_ERROR")
    outcome["metrics"]["workerMs"] = round((time.monotonic() - started) * 1000, 3)
    encoded = json.dumps(outcome, separators=(",", ":"), ensure_ascii=True)
    if len(encoded.encode("utf-8")) > 16384:
        encoded = '{"ok":false,"result":null,"error":"OUTPUT_LIMIT","metrics":{}}'
    sys.stdout.write(encoded + "\n")
