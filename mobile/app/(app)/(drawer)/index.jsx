import React from 'react';
import { Redirect } from 'expo-router';
import { useSession } from '../../../src/context/Session';
import { homeRoute } from '../../../src/navigation/menu';

/** After login: office staff land on the dashboard, floor staff on their own screen (the web's <Home>). */
export default function Home() {
  const { can } = useSession();
  return <Redirect href={`/(app)/(drawer)/${homeRoute(can)}`} />;
}
