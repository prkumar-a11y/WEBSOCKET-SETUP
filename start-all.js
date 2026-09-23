const { spawn } = require('child_process');
const path = require('path');

const root = __dirname;
const processes = [
  ['chat', path.join(root, 'server', 'server.js'), {}],
  ['ecommerce', path.join(root, 'services', 'ecommerce', 'server.js'), {}],
  ['trading', path.join(root, 'services', 'trading', 'server.js'), {}],
  ['bidding', path.join(root, 'services', 'bidding', 'server.js'), {}],
  ['proxy', path.join(root, 'proxy', 'gateway.js'), {}],
].map(([name, script, env]) => {
  const child = spawn(process.execPath, [script], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (data) => process.stdout.write(`[${name}] ${data}`));
  child.stderr.on('data', (data) => process.stderr.write(`[${name}] ${data}`));
  return child;
});

function stop() {
  processes.forEach((child) => child.kill('SIGTERM'));
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', stop);
console.log('Started chat, ecommerce, trading, bidding, and proxy services. Press Ctrl+C to stop.');
