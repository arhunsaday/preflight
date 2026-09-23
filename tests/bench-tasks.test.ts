import {expect,it} from 'vitest';
import {fixedTaskSet} from '../src/bench-tasks.js';
import {TaskSet} from '../src/bench.js';
it('provides ten isolated, pinned agent tasks with independent verification',()=>{
 const set=TaskSet.parse(fixedTaskSet('/repo','a'.repeat(40),'claude'));
 expect(set.tasks).toHaveLength(10);expect(new Set(set.tasks.map(t=>t.id)).size).toBe(10);expect(set.tasks.every(t=>t.run.command==='claude'&&t.verify.command===process.execPath)).toBe(true);
});
