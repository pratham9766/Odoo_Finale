import React from 'react';
import Svg, { Path } from 'react-native-svg';

/** The sameta weave mark: the same SVG as the web app's LogoWeaveIcon (client/src/layouts/AppLayout.jsx). */
export default function Logo({ size = 30 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <Path d="M7 14L22 29M14 7L29 22" stroke="#d0af71" strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M14 29L29 14M7 22L22 7" stroke="#c4a161" strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M11 11L25 25M11 25L25 11" stroke="#d9bd85" strokeWidth={1.8} strokeLinecap="round" opacity={0.85} />
    </Svg>
  );
}
