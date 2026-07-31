import type { OperationDefinition, OperationType } from './types.ts';

const registry = new Map<OperationType, OperationDefinition<any>>();

export function registerOperation<P>(def: OperationDefinition<P>): void {
  registry.set(def.type, def);
}

export function getOperationDefinition(type: OperationType): OperationDefinition {
  const def = registry.get(type);
  if (!def) throw new Error(`Type d'opération non enregistré: ${type}`);
  return def;
}

export function isOperationRegistered(type: OperationType): boolean {
  return registry.has(type);
}

/** Pour les tests : repartir d'un registre vide. */
export function clearRegistry(): void {
  registry.clear();
}
