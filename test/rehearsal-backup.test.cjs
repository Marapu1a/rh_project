const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {backup,restore}=require('../scripts/rehearsal-backup.cjs');
test('quiescent rehearsal backup preserves journals, rejects corruption, restores all files and archives newer state',()=>{
 fs.mkdirSync('.local/logs',{recursive:true});
 const dir=fs.mkdtempSync(path.resolve('.local/logs/backup-test-'));fs.mkdirSync(path.join(dir,'jobs'));
 fs.writeFileSync(path.join(dir,'jobs','frozen.json'),'old frozen obligation');fs.writeFileSync(path.join(dir,'config.json'),'config identity');
 fs.writeFileSync(path.join(dir,'writer.lock'),'123');assert.throws(()=>backup(dir),/stopped writers/);fs.unlinkSync(path.join(dir,'writer.lock'));
 const b=backup(dir);fs.writeFileSync(path.join(dir,'jobs','frozen.json'),'paid');fs.writeFileSync(path.join(dir,'new-journal.json'),'new journal');
 fs.writeFileSync(path.join(b.copy,'jobs','frozen.json'),'corrupt');assert.throws(()=>restore(b),/Backup mismatch/);assert.equal(fs.readFileSync(path.join(dir,'jobs','frozen.json'),'utf8'),'paid');
 fs.writeFileSync(path.join(b.copy,'jobs','frozen.json'),'old frozen obligation');const r=restore(b);
 assert.equal(fs.readFileSync(path.join(dir,'jobs','frozen.json'),'utf8'),'old frozen obligation');assert(!fs.existsSync(path.join(dir,'new-journal.json')));
 assert.equal(fs.readFileSync(path.join(r.archive,'new-journal.json'),'utf8'),'new journal');assert.equal(r.files,2);
 assert.throws(()=>backup(path.resolve('.local')),/Outside/);
});
