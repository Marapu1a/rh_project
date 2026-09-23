// IPC delivers a signal event portably on Windows; production registers the handler.
process.on('message',message=>{if(message==='stop')process.emit('SIGTERM');});
require('../../scripts/run-local-coordinator.cjs').main().then(()=>process.disconnect()).catch(error=>{
  console.error(error);process.exitCode=1;process.disconnect();
});
