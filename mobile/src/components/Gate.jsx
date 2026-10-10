import React from 'react';
import { useSession } from '../context/Session';
import { Restricted } from './ui';

/** A screen that needs one of these permissions (a string, or a list: any one is enough), like the web's <Gate>. */
export default function Gate({ perms, children }) {
  const { can } = useSession();
  return [perms].flat().some(can) ? children : <Restricted />;
}
