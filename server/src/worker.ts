import {parentPort, workerData} from 'node:worker_threads';
import {NetworkSnapshot} from './domain.js';
import {SimulationController} from './m4.js';

const {scenario, snapshot, runId, control} = workerData;
const signal = new Int32Array(control);
const result = SimulationController.execute(scenario, Object.assign(Object.create(NetworkSnapshot.prototype), snapshot), runId, (progress, metrics) => {
  parentPort?.postMessage({progress, metrics});
  return Atomics.load(signal, 0) === 0;
});
parentPort?.postMessage({result});
