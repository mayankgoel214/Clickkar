import sharp from 'sharp';

export interface CTAFrameOptions {
  productName: string;
  tagline?: string;
  brandColors?: string[];  // hex colors from product analysis
  productCategory?: string;
  width?: number;   // default 720
  height?: number;  // default 1280
  lang?: 'hi' | 'en';
}

export async function generateCTAFrame(options: CTAFrameOptions): Promise<Buffer> {
  const w = options.width ?? 720;
  const h = options.height ?? 1280;
  const lang = options.lang ?? 'en';

  // Pick background gradient colors based on brand or category
  const primaryColor = options.brandColors?.[0] ?? getCategoryColor(options.productCategory);
  const secondaryColor = darken(primaryColor, 30);

  const ctaText = lang === 'hi' ? 'WhatsApp pe order karein' : 'Order on WhatsApp';
  const productName = escapeXml(options.productName.slice(0, 60));
  const tagline = options.tagline ? escapeXml(options.tagline.slice(0, 80)) : '';

  // Build SVG for the CTA card
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${secondaryColor}"/>
        <stop offset="0.5" stop-color="${primaryColor}"/>
        <stop offset="1" stop-color="${secondaryColor}"/>
      </linearGradient>
    </defs>

    <!-- Background gradient -->
    <rect width="${w}" height="${h}" fill="url(#bg)"/>

    <!-- Subtle pattern overlay -->
    <rect width="${w}" height="${h}" fill="rgba(0,0,0,0.15)"/>

    <!-- Product name - center -->
    <text x="${w / 2}" y="${h * 0.40}"
          font-family="Arial,Helvetica,sans-serif"
          font-weight="700" font-size="42"
          fill="white" text-anchor="middle"
          letter-spacing="0.5">
      ${productName}
    </text>

    ${tagline ? `<text x="${w / 2}" y="${h * 0.47}"
          font-family="Arial,Helvetica,sans-serif"
          font-weight="400" font-size="24"
          fill="rgba(255,255,255,0.8)" text-anchor="middle">
      ${tagline}
    </text>` : ''}

    <!-- CTA button -->
    <rect x="${w * 0.15}" y="${h * 0.55}" width="${w * 0.7}" height="60" rx="30" fill="white"/>
    <text x="${w / 2}" y="${h * 0.55 + 38}"
          font-family="Arial,Helvetica,sans-serif"
          font-weight="600" font-size="22"
          fill="${primaryColor}" text-anchor="middle">
      ${ctaText}
    </text>

    <!-- Clickkar branding at bottom -->
    <text x="${w / 2}" y="${h - 40}"
          font-family="Arial,Helvetica,sans-serif"
          font-weight="500" font-size="14"
          fill="rgba(255,255,255,0.5)" text-anchor="middle">
      Made with Clickkar
    </text>
  </svg>`;

  return sharp(Buffer.from(svg))
    .png()
    .toBuffer();
}

function getCategoryColor(category?: string): string {
  const colors: Record<string, string> = {
    jewellery: '#1a1a3e',
    food: '#8B4513',
    garment: '#2d2d2d',
    skincare: '#4a6741',
    candle: '#6b3a2a',
    bag: '#3d3024',
    electronics: '#1a2332',
    home_goods: '#2a3a2a',
    default: '#1a1a2e',
  };
  return colors[category ?? 'default'] ?? colors['default']!;
}

function darken(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.round(255 * percent / 100));
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * percent / 100));
  const b = Math.max(0, (num & 0xff) - Math.round(255 * percent / 100));
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
