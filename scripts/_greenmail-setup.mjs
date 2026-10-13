import { ImapFlow } from 'imapflow';

async function inspect(user, pass, folder) {
  const c = new ImapFlow({ host: '127.0.0.1', port: 3993, secure: true, auth: { user, pass }, logger: false, tls: { rejectUnauthorized: false } });
  await c.connect();
  const lock = await c.getMailboxLock(folder);
  try {
    for await (const m of c.fetch('1:*', { envelope: true, bodyStructure: true, flags: true })) {
      const parts = [];
      const walk = (n) => { if (n.childNodes) n.childNodes.forEach(walk); else parts.push(`${n.type}${n.disposition ? ` (${n.disposition}: ${n.dispositionParameters?.filename ?? ''})` : ''}`); };
      walk(m.bodyStructure);
      console.log(`[${user} ${folder}]`, m.envelope.subject, '| to:', m.envelope.to?.map((a) => a.address).join(','), '| bcc:', m.envelope.bcc?.map((a) => a.address).join(',') ?? '-', '| flags:', [...m.flags].join(' '), '|', parts.join(', '));
    }
  } finally {
    lock.release();
    await c.logout();
  }
}

await inspect('principal@school.test', 'pw123', 'INBOX');
await inspect('contact@mycampusview.test', 'secret123', 'Sent');
