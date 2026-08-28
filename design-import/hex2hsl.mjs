function hexToHsl(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const tokens = {
  primary: '#004d84',
  'primary-container': '#1b65a5',
  'on-primary': '#ffffff',
  'on-primary-container': '#cbe1ff',
  secondary: '#006b5f',
  'on-secondary': '#ffffff',
  'on-secondary-container': '#007165',
  tertiary: '#763b00',
  'tertiary-container': '#994e00',
  error: '#ba1a1a',
  'on-error': '#ffffff',
  'error-container': '#ffdad6',
  background: '#faf9f7',
  'text-main': '#1B1A24',
  'on-surface': '#1a1c1b',
  'on-surface-variant': '#474554',
  'surface-container-lowest': '#ffffff',
  'surface-container-low': '#f4f3f1',
  'surface-container': '#efeeec',
  'surface-container-high': '#e9e8e6',
  'surface-variant': '#e3e2e0',
  'outline-variant': '#c8c4d6',
  outline: '#787585',
  'surface-tint': '#1361a0',
  success: '#10B981',
  warning: '#F59E0B',
  'dark-bg': '#141320',
  'dark-surface': '#1E1D2B',
  'dark-text': '#ECEBF5',
  'primary-fixed-dim': '#9fcaff',
  'inverse-surface': '#2f3130',
  'inverse-on-surface': '#f1f1ef',
  'on-primary-fixed': '#001d36',
  'on-secondary-fixed': '#00201c',
  'secondary-fixed': '#62fae3',
  'secondary-fixed-dim': '#3cddc7',
  'primary-fixed': '#d1e4ff',
};

for (const [name, hex] of Object.entries(tokens)) {
  console.log(`${name.padEnd(26)} ${hex}  ->  ${hexToHsl(hex)}`);
}
