const fs = require('fs');
const path = require('path');

const EMPTY_STATE = () => ({ version: 1, sessions: {}, users: {} });

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemoryStore(initialState = EMPTY_STATE()) {
  let state = clone(initialState);
  return {
    filePath: null,
    read() {
      return state;
    },
    mutate(mutator) {
      return mutator(state);
    },
    snapshot() {
      return clone(state);
    },
  };
}

function createFileStore(filePath) {
  const absolutePath = path.resolve(filePath);
  let state = EMPTY_STATE();

  if (fs.existsSync(absolutePath)) {
    state = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  }

  function persist() {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    const tempPath = `${absolutePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, absolutePath);
  }

  return {
    filePath: absolutePath,
    read() {
      return state;
    },
    mutate(mutator) {
      const result = mutator(state);
      persist();
      return result;
    },
    snapshot() {
      return clone(state);
    },
  };
}

module.exports = { createFileStore, createMemoryStore };
