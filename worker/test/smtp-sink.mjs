// Local fake SMTP server for tests. SMTP on :2525, inspect mail over HTTP on :2526.
//   GET /messages -> JSON array of parsed messages     DELETE /messages -> clear
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import http from 'node:http';

const messages = [];
const smtp = new SMTPServer({
  authOptional: false,
  allowInsecureAuth: true,
  disabledCommands: ['STARTTLS'],
  onAuth(auth, _s, cb) {
    if (auth.username === 'testuser' && auth.password === 'testpass') return cb(null, { user: auth.username });
    cb(new Error('Invalid credentials'));
  },
  async onData(stream, _s, cb) {
    try {
      const p = await simpleParser(stream);
      messages.push({
        from: p.from?.text, to: p.to?.text, replyTo: p.replyTo?.text, subject: p.subject, text: p.text,
        rawHeaderKeys: [...p.headers.keys()],
        bcc: p.headers.get('bcc') ?? null,
      });
      cb();
    } catch (e) { cb(e); }
  },
});
smtp.listen(2525, '127.0.0.1');

http.createServer((req, res) => {
  if (req.method === 'DELETE') { messages.length = 0; res.end('ok'); return; }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(messages));
}).listen(2526, '127.0.0.1', () => console.log('sink ready'));
