# Recraft background prompts

Prompts for replacing the paper's CSS scene backdrops with generated images.

## Setup

- **Aspect ratio:** 16:9 — at least 2560×1440, ideally 4K.
- **Style preset:** use the same preset for all six. **Realistic image** gives a
  photographic set; for an illustrated set, replace "cinematic editorial
  background" with "painterly editorial illustration" in every prompt.
- **Composition:** keep the centre quiet. The paper sheet covers most of the
  frame, so interest belongs at the edges, top, and bottom.
- **Export:** WebP or high-quality JPEG.

| Look | Style id | File |
| --- | --- | --- |
| On the table | `table` | `table.webp` |
| In the sky | `sky` | `sky.webp` |
| Zero gravity | `space` | `space.webp` |
| Digital nomad | `nomad` | `nomad.webp` |
| View overlooking | `overlook` | `overlook.webp` |
| Tropical landscape | `tropical` | `tropical.webp` |
| Flat | `flat` | no image |

## On the table

```text
Wide 16:9 cinematic editorial background: an overhead view of a warm walnut desk surface filling the frame, fine straight wood grain, soft window light raking from the upper left, gentle shadows, a few faint scratches and a subtle cup ring, muted amber and umber tones, shallow depth of field toward the edges, subtle film grain. Keep the center calm and uncluttered for a large central overlay. No objects, no paper, no newspaper, no text, no logos, no people, no hands, no watermark.
```

## In the sky

```text
Wide 16:9 cinematic editorial background: a view above a bank of soft white clouds at golden hour, pale blue sky opening in the center, a low warm sun in the upper right with a soft glow, layered cumulus clouds drifting along the bottom edge and corners, light atmospheric haze, muted pastel blues, cream and peach, subtle film grain. Keep the center calm and uncluttered for a large central overlay. No birds, no airplanes, no text, no logos, no people, no paper, no newspaper, no watermark.
```

## Zero gravity

```text
Wide 16:9 cinematic editorial background: deep space, velvety navy-black with a faint violet and teal nebula in the upper left and a soft blue glow along the lower right, a scattered field of small distant stars, a subtle dust lane, no large planets, muted cinematic color grade, fine film grain, astrophotography meets editorial illustration. Keep the center dark and calm for a large central overlay. No spacecraft, no astronauts, no text, no logos, no paper, no newspaper, no watermark.
```

## Digital nomad

```text
Wide 16:9 cinematic editorial background: a view from a city rooftop terrace at dusk, a warm amber and rose horizon fading into deep indigo, silhouetted low-rise rooftops and distant towers along the bottom edge, scattered warm lit windows, soft bokeh, a barely visible blurred balcony rail at the very bottom, muted editorial photography, subtle film grain. Keep the center sky calm and uncluttered for a large central overlay. No people, no laptops, no text, no logos, no paper, no newspaper, no watermark.
```

## View overlooking

```text
Wide 16:9 cinematic editorial background: a view from a mountain overlook at dawn, layered ridges receding into atmospheric haze across the lower third, a soft peach and gold horizon behind them, deep blue-grey peaks at the edges, a clear muted sky in the center, a low sun glow at the upper left, painterly editorial landscape photography, muted natural palette, subtle film grain. Keep the center calm and uncluttered for a large central overlay. No people, no buildings, no text, no logos, no paper, no newspaper, no watermark.
```

## Tropical landscape

```text
Wide 16:9 cinematic editorial background: a calm tropical coastline at midday, turquoise sea meeting a pale aqua sky, a soft sun glow in the upper right, dark green palm fronds framing the left and right edges, a distant hazy island on the horizon, gentle ripples and light haze, muted saturated teal and sand tones, editorial travel photography, subtle film grain. Keep the center calm and uncluttered for a large central overlay. No people, no boats, no buildings, no text, no logos, no paper, no newspaper, no watermark.
```

## Wiring the images in

The scenes live in `lib/render.js` as the `--scene` custom property on each
`[data-style="…"]` block. Replacing a backdrop is one swap per look, either:

- **Embedded** — a data URI, which keeps each edition a single portable HTML
  file but grows it by roughly the image size; or
- **Files** — images written beside the editions and referenced by relative
  path, which keeps the HTML small but adds files to copy with it.
