// Optional read-only check. Does not load a model or generate tokens.
const base = process.argv.find(a => a.startsWith('--base='))?.slice(7);
const model = process.argv.find(a => a.startsWith('--model='))?.slice(8);
if (!base || !model) throw Error('Use --base=http://127.0.0.1:11434 --model=<exact loaded model name>');
const url = new URL(base);
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || !['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('Only an explicit loopback Ollama origin is allowed');
const response = await fetch(new URL('/api/ps',url), { redirect: 'error', signal: AbortSignal.timeout(5000) });
if (!response.ok) throw Error('Could not read loaded model status');
const body = await response.json(); const match = body.models?.find(m => m.name === model || m.model === model);
if (!match || !Number.isInteger(match.context_length)) { console.log(JSON.stringify({model,verified:false,note:'Model is not loaded or runtime did not return context_length; do not infer it from model marketing specs.'})); process.exitCode=2; }
else console.log(JSON.stringify({model:match.name,verified:true,allocatedContextTokens:match.context_length,note:'Runtime metadata only; not a successful tool-calling or long-context accuracy test. Character budgets are not token counts.'}));
