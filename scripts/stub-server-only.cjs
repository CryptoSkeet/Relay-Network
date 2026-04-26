const Module = require('module');
const orig = Module._resolveFilename;
Module._resolveFilename = function(req, parent, ...rest) {
  if (req === 'server-only') return require.resolve('./_noop.cjs');
  return orig.call(this, req, parent, ...rest);
};
