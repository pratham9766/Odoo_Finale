import { useMill } from './useMill';

export function usePermission() {
  const { permissions, scope } = useMill();

  return {
    /** True if user has ANY of the listed permissions */
    can: (...perms) => perms.some((p) => permissions.has(p)),
    /** True if user has ALL of the listed permissions */
    canAll: (...perms) => perms.every((p) => permissions.has(p)),
    /** Kept as no-op/true for manufacturer */
    isType: () => true,
    /**
     * True if the resource is in the user's scope.
     * Empty scope = whole mill (no restriction).
     * @param {'stage'|'machine'|'shift'|'warehouse'} kind
     * @param {string} id
     */
    inScope: (kind, id) => {
      const ids = scope?.[`${kind}_ids`];
      return !ids || ids.length === 0 || ids.includes(id);
    },
  };
}
