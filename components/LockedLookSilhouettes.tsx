import Svg, { Defs, FeGaussianBlur, Filter, G, Path } from 'react-native-svg';

export default function LockedLookSilhouettes() {
  return (
    <Svg
      width={226}
      height={138}
      viewBox="0 0 226 138"
      accessible
      accessibilityLabel="Soft silhouettes of a top and trousers"
    >
      <Defs>
        <Filter id="softSilhouette" x="-20%" y="-20%" width="140%" height="140%">
          <FeGaussianBlur stdDeviation="4" />
        </Filter>
      </Defs>
      <G filter="url(#softSilhouette)" opacity={0.6}>
        <Path
          d="M35 24 55 12h19c4 9 12 14 21 14s17-5 21-14h19l20 12-13 31-14-7v73H62V48l-14 7z"
          fill="#8AA39B"
        />
        <Path
          d="M160 14h44v16l14 102h-29l-8-71-8 71h-29l14-102z"
          fill="#888991"
        />
      </G>
    </Svg>
  );
}
