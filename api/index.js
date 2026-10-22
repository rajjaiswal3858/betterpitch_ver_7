// Vercel function: every request is rewritten here (vercel.json) and served by
// the same handler `npm start` uses locally. Start-up and request failures are
// answered with the error message instead of Vercel's generic crash page.
let handler, startError;
try {
  handler = require('../server.js').handler;
} catch (e) {
  startError = e;
}

module.exports = (req, res) => {
  try {
    if (startError) throw startError;
    return handler(req, res);
  } catch (e) {
    console.error(e);
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('BetterPitch server error: ' + (e && e.message) + '\n' + String(e && e.stack).split('\n').slice(1, 4).join('\n'));
  }
};
