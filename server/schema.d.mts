import type {NetworkState} from './src/domain.js';
type Column = 'text' | 'text[]' | 'boolean' | 'double precision' | 'time' | 'integer' | 'bigint' | 'jsonb';
export const definitions: Record<Exclude<keyof NetworkState, 'parkingRatio' | 'dataStatus' | 'readCurrentState' | 'readConsistentState'>, [string, Record<string, Column>]>;
export function sqlIdentifier(value: string): string;
