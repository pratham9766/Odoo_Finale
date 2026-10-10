import { useOrg } from './useOrg';

export function usePermission() {
  const { permissions, org, scope } = useOrg();

  return {
    /** True if user has ANY of the listed permissions */
    can: (...perms) => perms.some(p => permissions.has(p)),
    /** True if user has ALL of the listed permissions */
    canAll: (...perms) => perms.every(p => permissions.has(p)),
    /** True if org has the given type */
    isType: (t) => org?.types?.includes(t) ?? false,
    /**
     * True if the resource is in the user's scope.
     * Empty scope = whole org (no restriction).
     * @param {'stage'|'machine'|'shift'|'warehouse'} kind
     * @param {string} id
     */
    inScope: (kind, id) => {
      const ids = scope?.[`${kind}_ids`];
      return !ids || ids.length === 0 || ids.includes(id);
    },
  };
}
